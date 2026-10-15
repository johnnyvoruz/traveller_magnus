import {
    Track,
    locate,
    type CampaignAnchor,
    type CampaignRecord,
    type CampaignSettings,
    type SystemAnchor,
} from './schemas/campaign.ts';
import {
    PUBLIC_CARD_BODY,
    PUBLIC_CARD_BYTES,
    PUBLIC_CARD_ENTRIES,
    PUBLIC_NAMES_PER_SHIP,
    type PublicFinishedLeg,
    type PublicJournalNote,
} from './schemas/public_games.ts';

/**
 * Day count for a campaign with no clock. Same default as the orbit clock:
 * year 1105, day 2, on 365-day years (`year * 365 + day - 1`).
 */
export const PUBLIC_DEFAULT_DAYS = 1105 * 365 + 2 - 1;

export type PublicHex = { sector: string; localHex: string };

type Leg = {
    from: CampaignAnchor;
    to: CampaignAnchor;
    departs: number;
    arrives: number;
    mode: 'docked' | 'orbit' | 'flight' | 'jump';
};

type Fix = { leg: Leg; fraction: number };

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export type PublicShipPlace = {
    vesselId: string;
    name: string;
    aboard: string[];
    hex: PublicHex;
};

type PartyLike = {
    vesselId?: string | null;
    vesselIds?: readonly string[];
    memberIds?: readonly string[];
    aboard?: Readonly<Record<string, string>>;
    anchor: CampaignAnchor;
};

function vesselIdsOf(party: PartyLike): string[] {
    if (Array.isArray(party.vesselIds)) return [...party.vesselIds];
    return party.vesselId ? [party.vesselId] : [];
}

function aboardOf(party: PartyLike): Readonly<Record<string, string>> {
    if (party.aboard && typeof party.aboard === 'object') return party.aboard;
    const ids = vesselIdsOf(party);
    const ship = ids[0];
    if (!ship) return {};
    const aboard: Record<string, string> = {};
    for (const id of party.memberIds ?? []) aboard[id] = ship;
    return aboard;
}

/**
 * Opaque id for one public ship. The same universe and vessel always produce the same id.
 * It is not a `cr_` id, not the universe id, and not reversible to either.
 */
export async function publicMarkId(universeId: string, vesselId: string): Promise<string> {
    const digest = new Uint8Array(await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(`voyage-public-ship\0${universeId}\0${vesselId}`),
    ));
    let out = 'pm_';
    for (let i = 0; i < 26; i += 1) {
        const bit = i * 5;
        const byte = bit >> 3;
        const shift = bit & 7;
        const next = digest[byte + 1] ?? 0;
        const value = ((digest[byte]! << shift) | (next >> (8 - shift))) & 31;
        out += CROCKFORD[value];
    }
    return out;
}

/**
 * The hex the pre-0017 mark stores, or null when that contract does not publish.
 * This is the first party's ship, or the party anchor when the list is empty.
 * Flight uses the leg's `to` anchor. Jump uses `from`. A point keeps the anchor's
 * `hexKey` and drops the point. An own sector (`~`) is not published.
 * Visibility is not consulted: the old row carries no name.
 */
export function publicFirstHex(input: {
    settings: CampaignSettings;
    records: readonly CampaignRecord[];
    clock: { days: number } | null;
}): PublicHex | null {
    const records: Record<string, CampaignRecord> = {};
    for (const record of input.records) records[record.id] = record;
    const days = input.clock ? input.clock.days : PUBLIC_DEFAULT_DAYS;
    const at = whereAreWe(input.settings.party, records, days);
    const anchor = standing(at);
    if (!anchor) return null;
    const system = systemOf(anchor, records);
    if (!system) return null;
    return published(system.hexKey);
}

/**
 * One publishable hex per party ship, in `vesselIds` order.
 * A ship is left out when it is missing, deleted, not a vessel, `referee`, or has no chart hex.
 * Names aboard are party members on that ship whose visibility is `players`, in `memberIds` order, capped.
 */
export function publicShips(input: {
    settings: CampaignSettings;
    records: readonly CampaignRecord[];
    clock: { days: number } | null;
}): PublicShipPlace[] {
    const records: Record<string, CampaignRecord> = {};
    for (const record of input.records) records[record.id] = record;
    const days = input.clock ? input.clock.days : PUBLIC_DEFAULT_DAYS;
    const party = input.settings.party;
    const aboard = aboardOf(party);
    const memberIds = party.memberIds ?? [];
    const out: PublicShipPlace[] = [];
    const seen = new Set<string>();
    for (const vesselId of vesselIdsOf(party)) {
        if (seen.has(vesselId)) continue;
        seen.add(vesselId);
        const vessel = records[vesselId];
        if (!vessel || vessel.deleted || vessel.type !== 'vessel' || vessel.visibility !== 'players') continue;
        const at = shipAt(vessel, days);
        const anchor = standing(at);
        if (!anchor) continue;
        const system = systemOf(anchor, records);
        if (!system) continue;
        const hex = published(system.hexKey);
        if (!hex) continue;
        const names: string[] = [];
        for (const memberId of memberIds) {
            if (aboard[memberId] !== vesselId) continue;
            const member = records[memberId];
            if (!member || member.deleted || member.visibility !== 'players') continue;
            if (names.length >= PUBLIC_NAMES_PER_SHIP) break;
            names.push(member.name);
        }
        out.push({ vesselId, name: vessel.name, aboard: names, hex });
    }
    return out;
}

type JournalLike = {
    id: string;
    deleted: boolean;
    visibility: string;
    title: string;
    body: string;
    when: { year: number; day: number } | null;
    realDate: string | null;
    updatedAt: string;
};

/** Finished legs of one ship at `days`. A leg still underway is left out. Ends that are not a chart hex are left out. */
export function publicFinishedLegs(
    vessel: CampaignRecord,
    records: Readonly<Record<string, CampaignRecord>>,
    days: number,
): PublicFinishedLeg[] {
    const track = trackOf(vessel);
    if (!track) return [];
    const legs: PublicFinishedLeg[] = [];
    for (const leg of track) {
        if (leg.arrives > days) continue;
        const from = chartKey(leg.from, records);
        const to = chartKey(leg.to, records);
        if (!from || !to) continue;
        legs.push({ from, to, departs: leg.departs, arrives: leg.arrives });
    }
    return legs;
}

/** Public journal entries, newest first, bodies cut, then dropped until the card fits. */
export function publicCardJournal(entries: readonly JournalLike[]): PublicJournalNote[] {
    const notes = entries
        .filter((entry) => !entry.deleted && entry.visibility === 'public')
        .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
        .slice(0, PUBLIC_CARD_ENTRIES)
        .map((entry) => {
            const when = entry.when ? { year: entry.when.year, day: entry.when.day } : null;
            return {
                title: entry.title,
                body: entry.body.length > PUBLIC_CARD_BODY ? entry.body.slice(0, PUBLIC_CARD_BODY) : entry.body,
                when,
                realDate: entry.realDate,
            };
        });
    return notes;
}

/** Drops the oldest finished legs, then the oldest notes, until `legs` and `journal` fit in `PUBLIC_CARD_BYTES`. */
export function fitPublicCard(legs: PublicFinishedLeg[], journal: PublicJournalNote[]): { legs: PublicFinishedLeg[]; journal: PublicJournalNote[] } {
    const nextLegs = [...legs];
    const nextJournal = [...journal];
    const size = () => new TextEncoder().encode(JSON.stringify({ legs: nextLegs, journal: nextJournal })).length;
    while (size() > PUBLIC_CARD_BYTES && (nextLegs.length > 0 || nextJournal.length > 0)) {
        if (nextLegs.length > 0) nextLegs.shift();
        else nextJournal.pop();
    }
    return { legs: nextLegs, journal: nextJournal };
}

function chartKey(anchor: CampaignAnchor, records: Readonly<Record<string, CampaignRecord>>): string | null {
    const system = systemOf(anchor, records);
    if (!system) return null;
    const hex = published(system.hexKey);
    if (!hex) return null;
    return `${hex.sector}/${hex.localHex}`;
}

function trackOf(record: CampaignRecord): Leg[] | null {
    const status = record.status;
    if (!status || typeof status !== 'object' || Array.isArray(status)) return null;
    if (!Object.prototype.hasOwnProperty.call(status, 'track')) return null;
    const parsed = Track.safeParse((status as { track: unknown }).track);
    if (!parsed.success || parsed.data.length === 0) return null;
    return parsed.data;
}

function positionAt(track: readonly Leg[], days: number): CampaignAnchor | Fix | null {
    if (track.length === 0 || days < track[0].departs) return null;
    let place: CampaignAnchor = track[0].from;
    for (let i = 0; i < track.length; i += 1) {
        const leg = track[i];
        if (days < leg.departs) return place;
        const duration = leg.arrives - leg.departs;
        const moving = leg.mode === 'flight' || leg.mode === 'jump';
        if (duration === 0) {
            const laterStarts = i + 1 < track.length && track[i + 1].departs === days;
            if (!laterStarts && days === leg.departs) {
                if (moving) return { leg, fraction: 1 };
                return leg.to;
            }
            place = leg.to;
            continue;
        }
        if (days < leg.arrives) {
            if (moving) return { leg, fraction: (days - leg.departs) / duration };
            return leg.to;
        }
        place = leg.to;
    }
    return place;
}

function liveVessel(party: PartyLike, records: Readonly<Record<string, CampaignRecord>>): CampaignRecord | null {
    const vesselId = vesselIdsOf(party)[0] ?? null;
    if (!vesselId) return null;
    const found = records[vesselId];
    if (!found || found.deleted || found.type !== 'vessel') return null;
    return found;
}

function shipAt(vessel: CampaignRecord, days: number): CampaignAnchor | Fix | null {
    const track = trackOf(vessel);
    if (!track) return vessel.anchor;
    return positionAt(track, days) ?? vessel.anchor;
}

function whereAreWe(
    party: PartyLike,
    records: Readonly<Record<string, CampaignRecord>>,
    days: number,
): CampaignAnchor | Fix | null {
    const vessel = liveVessel(party, records);
    if (!vessel) return party.anchor;
    return shipAt(vessel, days);
}

function standing(at: CampaignAnchor | Fix | null): CampaignAnchor | null {
    if (!at) return null;
    if ('fraction' in at) return at.leg.mode === 'jump' ? at.leg.from : at.leg.to;
    return at;
}

function systemOf(anchor: CampaignAnchor, records: Readonly<Record<string, CampaignRecord>>): SystemAnchor | null {
    if (!anchor) return null;
    if (anchor.kind === 'system') return anchor;
    const found = locate(anchor.id, records);
    return found && found.kind === 'system' ? found : null;
}

function published(hexKey: string): PublicHex | null {
    const slash = hexKey.lastIndexOf('/');
    if (slash <= 0) return null;
    const sector = hexKey.slice(0, slash);
    const localHex = hexKey.slice(slash + 1);
    if (sector.startsWith('~')) return null;
    if (!/^\d{4}$/.test(localHex)) return null;
    return { sector, localHex };
}
