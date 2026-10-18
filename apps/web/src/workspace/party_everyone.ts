/**
 * "Where is everyone" (streams/D.md DU3; UX backlog U3): the Party tab's first card. Each party ship
 * with where it is at the campaign date (party_where.ts vesselWhere: its track, or its anchor), the
 * people aboard it under it, then the people aboard no ship, who stand where memberWhere says (the
 * party's own anchor) or, when that is nowhere, where their own record is. Every row says the
 * place a Locate would fly to, or that there is none. Pure: it runs under Node. Nothing here is a rule.
 */
import type { CampaignRecord } from '@voyage/shared';
import { memberVessel, partyMembers, partyVessels, resolveAnchor, type Party } from './party.ts';
import { memberWhere, vesselWhere, type PartyWhere } from './party_where.ts';
import { placeWords } from './places.ts';

export type EveryoneRow = {
    record: CampaignRecord;
    kind: 'ship' | 'person';
    /** The first ship in the list leads the party. */
    lead: boolean;
    /** For a person: the party ship they are aboard, or null ashore. */
    aboard: CampaignRecord | null;
    /** Where, in words: the strip's words under way, the place and its hex, or nowhere in particular. */
    words: string;
    /** The hex a Locate flies to (under way, the system the ship is in); null when there is none. */
    hexKey: string | null;
};

const NOWHERE = 'Nowhere in particular';

function said(where: PartyWhere, records: Readonly<Record<string, CampaignRecord>>): { words: string; hexKey: string | null } {
    const place = resolveAnchor(where.anchor, records);
    if (where.underway && where.underway.text) return { words: where.underway.text, hexKey: place ? place.hexKey : null };
    if (!place) return { words: NOWHERE, hexKey: null };
    return { words: placeWords(place).join(' · '), hexKey: place.hexKey };
}

/**
 * Where a member aboard no ship stands (DU3b, decided 20:30): the party's own anchor when it has one
 * (memberWhere), else the person's own record. The card and the people rows both say this.
 */
export function standsAt(party: Party, records: Readonly<Record<string, CampaignRecord>>, member: CampaignRecord, days: number): { words: string; hexKey: string | null } {
    const stands = memberWhere(party, records, member.id, days);
    return said(resolveAnchor(stands.anchor, records) ? stands : { anchor: member.anchor, underway: null }, records);
}

/** The card's rows: ships in party order, each followed by who is aboard it; then everyone ashore. */
export function everyoneWhere(party: Party, records: Readonly<Record<string, CampaignRecord>>, days: number): EveryoneRow[] {
    const ships = partyVessels(party, records);
    const members = partyMembers(party, records);
    const rows: EveryoneRow[] = [];
    ships.forEach((ship, index) => {
        const at = said(vesselWhere(ship, records, days), records);
        rows.push({ record: ship, kind: 'ship', lead: index === 0, aboard: null, ...at });
        for (const member of members) {
            if (memberVessel(party, member.id) !== ship.id) continue;
            rows.push({ record: member, kind: 'person', lead: false, aboard: ship, words: 'Aboard ' + ship.name, hexKey: at.hexKey });
        }
    });
    const shipIds = new Set(ships.map((ship) => ship.id));
    for (const member of members) {
        const shipId = memberVessel(party, member.id);
        if (shipId && shipIds.has(shipId)) continue;
        const at = standsAt(party, records, member, days);
        // With no ship nobody is ashore (party.ts isAboard): the party's place is just a place.
        const words = !ships.length ? at.words : at.hexKey ? 'Ashore · ' + at.words : 'Ashore, ' + NOWHERE.toLowerCase();
        rows.push({ record: member, kind: 'person', lead: false, aboard: null, words, hexKey: at.hexKey });
    }
    return rows;
}
