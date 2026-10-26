/**
 * The party (findings/campaign_workspace_design.md §5; slice_2_campaign.md §0.6): the
 * settings document's `party`. Several ships, ordered, the first the one the screens
 * open on. Each member is aboard one of those ships or none. With no ship, the party
 * stands on its own anchor. Pure: it runs under Node. The write is one settings change.
 */
import { CAMPAIGN_LIMITS } from '@voyage/shared/campaign_core';
import type { CampaignAnchor, CampaignRecord, CampaignSettings, SettingsChange } from '@voyage/shared';
import { liveById, resolvePlace, type Resolved } from './places.ts';

export type Party = CampaignSettings['party'];

export const EMPTY_PARTY: Party = { vesselIds: [], aboard: {}, memberIds: [], anchor: null };

export type VesselAdd = { ok: true; party: Party } | { ok: false; message: string };

/** The ship the current screens open on: the first of `vesselIds`. */
export function leadVesselId(party: { vesselIds?: readonly string[] | null }): string | null {
    if (!Array.isArray(party.vesselIds)) return null;
    return party.vesselIds[0] ?? null;
}

function shipIds(party: { vesselIds?: readonly string[] | null }): string[] {
    return Array.isArray(party.vesselIds) ? [...party.vesselIds] : [];
}

function aboardMap(party: { aboard?: Readonly<Record<string, string>> | null }): Record<string, string> {
    if (party.aboard && typeof party.aboard === 'object') return { ...party.aboard };
    return {};
}

function copyParty(party: Party, vesselIds: string[], aboard: Record<string, string>, memberIds: string[]): Party {
    return { vesselIds, aboard, memberIds, anchor: party.anchor };
}

function live(records: Readonly<Record<string, CampaignRecord>>, id: string | null): CampaignRecord | null {
    if (!id) return null;
    const found = records[id];
    return found && !found.deleted ? found : null;
}

/** The live vessels, in list order. A missing, deleted, or non-vessel id is skipped. */
export function partyVessels(party: Party, records: Readonly<Record<string, CampaignRecord>>): CampaignRecord[] {
    const out: CampaignRecord[] = [];
    for (const id of shipIds(party)) {
        const found = live(records, id);
        if (found && found.type === 'vessel') out.push(found);
    }
    return out;
}

/** The party's lead vessel, when that first id is a live vessel record. */
export function partyVessel(party: Party, records: Readonly<Record<string, CampaignRecord>>): CampaignRecord | null {
    const found = live(records, leadVesselId(party));
    return found && found.type === 'vessel' ? found : null;
}

/** The members, live ones only, in the order they were added. */
export function partyMembers(party: Party, records: Readonly<Record<string, CampaignRecord>>): CampaignRecord[] {
    const out: CampaignRecord[] = [];
    for (const id of party.memberIds) {
        const found = live(records, id);
        if (found) out.push(found);
    }
    return out;
}

/** Where an anchor puts something: a system anchor is itself; a record anchor is where that record is. */
export function resolveAnchor(anchor: CampaignAnchor, records: Readonly<Record<string, CampaignRecord>>): Resolved | null {
    if (!anchor) return null;
    if (anchor.kind === 'system') return { hexKey: anchor.hexKey, bodyKey: anchor.bodyKey ?? null, label: anchor.locationLabel ?? '' };
    return resolvePlace(anchor.id, liveById(records));
}

/** "Where are we": the lead vessel's place, else the party's own anchor. Null when neither says. */
export function partyPlace(party: Party, records: Readonly<Record<string, CampaignRecord>>): Resolved | null {
    const vessel = partyVessel(party, records);
    if (vessel) return resolvePlace(vessel.id, liveById(records));
    return resolveAnchor(party.anchor, records);
}

/**
 * A member is aboard when `aboard` names one of the party's ships.
 * With no ship, nobody is ashore.
 */
export function isAboard(member: CampaignRecord, party: Party): boolean {
    if (shipIds(party).length === 0) return true;
    return memberVessel(party, member.id) !== null;
}

/** The ship a member is aboard, or null when they are aboard none or the id is not in the list. */
export function memberVessel(party: Party, memberId: string): string | null {
    const ship = aboardMap(party)[memberId];
    if (!ship || !shipIds(party).includes(ship)) return null;
    return ship;
}

/**
 * Appends a ship. The first ship of a party puts every current member aboard it.
 * A later ship starts with nobody aboard. A ship already in the list is left where it is.
 * At the ship cap, nothing is added.
 */
export function withVesselAdded(party: Party, id: string): VesselAdd {
    const vesselIds = shipIds(party);
    const aboard = aboardMap(party);
    const memberIds = [...party.memberIds];
    if (vesselIds.includes(id)) return { ok: true, party: copyParty(party, vesselIds, aboard, memberIds) };
    if (vesselIds.length >= CAMPAIGN_LIMITS.partyShips) {
        return { ok: false, message: 'A party can have ' + CAMPAIGN_LIMITS.partyShips + ' ships.' };
    }
    if (vesselIds.length === 0) {
        for (const memberId of memberIds) aboard[memberId] = id;
    }
    return { ok: true, party: copyParty(party, [...vesselIds, id], aboard, memberIds) };
}

/**
 * Removes the ship and every aboard entry that names it.
 * Those members are then aboard no ship. They stand at `party.anchor` (memberWhere);
 * this does not write their records.
 */
export function withVesselRemoved(party: Party, id: string): Party {
    const aboard = aboardMap(party);
    for (const memberId of Object.keys(aboard)) {
        if (aboard[memberId] === id) delete aboard[memberId];
    }
    return copyParty(party, shipIds(party).filter((have) => have !== id), aboard, [...party.memberIds]);
}

/** Moves a ship already in the list to the front. A ship that is not in the list is left out. */
export function withLeadVessel(party: Party, id: string): Party {
    const vesselIds = shipIds(party);
    if (!vesselIds.includes(id) || vesselIds[0] === id) return copyParty(party, vesselIds, aboardMap(party), [...party.memberIds]);
    return copyParty(party, [id, ...vesselIds.filter((have) => have !== id)], aboardMap(party), [...party.memberIds]);
}

/** Puts a member aboard a party ship, or aboard none. A ship that is not in the list is aboard none. */
export function withAboard(party: Party, memberId: string, vesselId: string | null): Party {
    const vesselIds = shipIds(party);
    const aboard = aboardMap(party);
    if (vesselId && vesselIds.includes(vesselId)) aboard[memberId] = vesselId;
    else delete aboard[memberId];
    return copyParty(party, vesselIds, aboard, [...party.memberIds]);
}

/** A new member goes aboard the lead ship when there is one. Someone already in the party stays on their ship. */
export function withMember(party: Party, id: string): Party {
    const vesselIds = shipIds(party);
    const aboard = aboardMap(party);
    if (party.memberIds.includes(id)) return copyParty(party, vesselIds, aboard, [...party.memberIds]);
    const lead = vesselIds[0];
    if (lead) aboard[id] = lead;
    return copyParty(party, vesselIds, aboard, [...party.memberIds, id]);
}

/** Drops the member and their aboard entry. */
export function withoutMember(party: Party, id: string): Party {
    const aboard = aboardMap(party);
    delete aboard[id];
    return copyParty(
        party,
        shipIds(party),
        aboard,
        party.memberIds.filter((have) => have !== id),
    );
}

export function withAnchor(party: Party, anchor: CampaignAnchor): Party {
    return { vesselIds: shipIds(party), aboard: aboardMap(party), memberIds: [...party.memberIds], anchor };
}

function sameAboard(a: Readonly<Record<string, string>>, b: Readonly<Record<string, string>>): boolean {
    const left = Object.keys(a).sort();
    const right = Object.keys(b).sort();
    return left.length === right.length && left.every((key, at) => key === right[at] && a[key] === b[key]);
}

/** True when two parties store the same ships, in the same order, and the same aboard map. */
export function sameParty(a: Party, b: Party): boolean {
    const left = shipIds(a);
    const right = shipIds(b);
    return left.length === right.length && left.every((id, at) => id === right[at])
        && sameAboard(aboardMap(a), aboardMap(b))
        && a.memberIds.length === b.memberIds.length && a.memberIds.every((id, at) => id === b.memberIds[at])
        && JSON.stringify(a.anchor) === JSON.stringify(b.anchor);
}

/** The settings change that stores a party: the whole document on the revision held. */
export function partyChange(settings: CampaignSettings, party: Party): SettingsChange {
    return {
        ...settings,
        party: { vesselIds: shipIds(party), aboard: aboardMap(party), memberIds: [...party.memberIds], anchor: party.anchor },
        baseRev: settings.rev,
    };
}

function shipList(names: string[]): string {
    if (names.length === 1) return names[0];
    if (names.length === 2) return names[0] + ' and ' + names[1];
    return names.slice(0, -1).join(', ') + ', and ' + names[names.length - 1];
}

/** The party as a record list's rows would say it: "Far Margin and Kessler, 3 aboard". */
export function partyWords(party: Party, records: Readonly<Record<string, CampaignRecord>>): string {
    const vessels = partyVessels(party, records);
    const members = partyMembers(party, records);
    const who = members.length === 0 ? 'nobody aboard' : members.length === 1 ? members[0].name : members.length + ' aboard';
    if (vessels.length) return shipList(vessels.map((vessel) => vessel.name)) + ', ' + who;
    if (members.length) return members.length === 1 ? members[0].name : members.length + ' people, no ship';
    return 'No party yet';
}
