/**
 * The party (findings/campaign_workspace_design.md §5; slice_2_campaign.md §0.6): the
 * settings document's `party`: the vessel, the members and, when there is no vessel, an
 * anchor of its own. "Where are we" is the vessel's place through its anchor chain, else
 * the party's anchor. Pure: it runs under Node. The write is one settings change.
 */
import type { CampaignAnchor, CampaignRecord, CampaignSettings, SettingsChange } from '@voyage/shared';
import { liveById, resolvePlace, type Resolved } from './places.ts';

export type Party = CampaignSettings['party'];

export const EMPTY_PARTY: Party = { vesselId: null, memberIds: [], anchor: null };

function live(records: Readonly<Record<string, CampaignRecord>>, id: string | null): CampaignRecord | null {
    if (!id) return null;
    const found = records[id];
    return found && !found.deleted ? found : null;
}

/** The party's vessel, when it is a live vessel record. */
export function partyVessel(party: Party, records: Readonly<Record<string, CampaignRecord>>): CampaignRecord | null {
    const found = live(records, party.vesselId);
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

/** "Where are we": the vessel's place, else the party's own anchor. Null when neither says. */
export function partyPlace(party: Party, records: Readonly<Record<string, CampaignRecord>>): Resolved | null {
    const vessel = partyVessel(party, records);
    if (vessel) return resolvePlace(vessel.id, liveById(records));
    return resolveAnchor(party.anchor, records);
}

/** A member is aboard when their own anchor names the party's vessel. Without a vessel nobody is "not aboard". */
export function isAboard(member: CampaignRecord, party: Party): boolean {
    if (!party.vesselId) return true;
    return !!member.anchor && member.anchor.kind === 'record' && member.anchor.id === party.vesselId;
}

export function withVessel(party: Party, vesselId: string | null): Party {
    return { ...party, memberIds: [...party.memberIds], vesselId };
}

export function withMember(party: Party, id: string): Party {
    if (party.memberIds.includes(id)) return { ...party, memberIds: [...party.memberIds] };
    return { ...party, memberIds: [...party.memberIds, id] };
}

export function withoutMember(party: Party, id: string): Party {
    return { ...party, memberIds: party.memberIds.filter((have) => have !== id) };
}

export function withAnchor(party: Party, anchor: CampaignAnchor): Party {
    return { ...party, memberIds: [...party.memberIds], anchor };
}

/** True when two parties say the same. */
export function sameParty(a: Party, b: Party): boolean {
    return a.vesselId === b.vesselId
        && a.memberIds.length === b.memberIds.length && a.memberIds.every((id, at) => id === b.memberIds[at])
        && JSON.stringify(a.anchor) === JSON.stringify(b.anchor);
}

/** The settings change that stores a party: the whole document on the revision held. */
export function partyChange(settings: CampaignSettings, party: Party): SettingsChange {
    return { ...settings, party: { ...party, memberIds: [...party.memberIds] }, baseRev: settings.rev };
}

/** The party as a record list's rows would say it: "Far Margin, 3 aboard". */
export function partyWords(party: Party, records: Readonly<Record<string, CampaignRecord>>): string {
    const vessel = partyVessel(party, records);
    const members = partyMembers(party, records);
    const who = members.length === 0 ? 'nobody aboard' : members.length === 1 ? members[0].name : members.length + ' aboard';
    if (vessel) return vessel.name + ', ' + who;
    if (members.length) return members.length === 1 ? members[0].name : members.length + ' people, no ship';
    return 'No party yet';
}
