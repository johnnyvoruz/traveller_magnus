import {
    Track,
    locate,
    type CampaignAnchor,
    type CampaignRecord,
    type CampaignSettings,
    type SystemAnchor,
} from './schemas/campaign.ts';

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

/**
 * The hex a public mark may store, or null when this contract does not publish.
 * Flight uses the leg's `to` anchor. Jump uses `from`. That is the map's
 * `standing` (`apps/web/src/workspace/party_where.ts`): the system the leg is
 * crossing, and the system the leg left. A point keeps the anchor's `hexKey`
 * and drops the point. An own sector (`~`) is not published.
 */
export function publicMarkHex(input: {
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

function liveVessel(party: CampaignSettings['party'], records: Readonly<Record<string, CampaignRecord>>): CampaignRecord | null {
    if (!party.vesselId) return null;
    const found = records[party.vesselId];
    if (!found || found.deleted || found.type !== 'vessel') return null;
    return found;
}

function whereAreWe(
    party: CampaignSettings['party'],
    records: Readonly<Record<string, CampaignRecord>>,
    days: number,
): CampaignAnchor | Fix | null {
    const vessel = liveVessel(party, records);
    if (!vessel) return party.anchor;
    const track = trackOf(vessel);
    if (!track) return vessel.anchor;
    return positionAt(track, days) ?? vessel.anchor;
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
