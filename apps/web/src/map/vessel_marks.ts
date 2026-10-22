/**
 * Live vessels as the chart's marks, at the day the caller passes.
 * The hex and the in-jump flag follow vesselWhere, the same rule as the party marker
 * (workspace/party_where.ts): a flight stands in the system it is crossing, and a jump
 * is held at the system it left. placeAt disagrees: a flight is in the system the ship
 * left, and a jump has no hex. The marks follow the marker so the two cannot split.
 * A vessel with no place is left out. Nothing here is drawn.
 */
import type { CampaignRecord } from '@voyage/shared';
import { leadVesselId, memberVessel, partyMembers, partyVessels, resolveAnchor, type Party } from '../workspace/party.ts';
import { vesselWhere } from '../workspace/party_where.ts';

export type MapVessel = {
    id: string;
    name: string;
    hexKey: string;
    party: boolean;
    inJump: boolean;
};

/** Live vessels at `days`, in id order. Deleted rows, other types, and vessels with no place are absent. */
export function vesselsOnMap(
    records: Readonly<Record<string, CampaignRecord>>,
    party: Party,
    days: number,
): MapVessel[] {
    const marks: MapVessel[] = [];
    const ids = Object.keys(records).sort();
    for (const id of ids) {
        const record = records[id];
        if (!record || record.deleted || record.type !== 'vessel') continue;
        const where = vesselWhere(record, records, days);
        const place = resolveAnchor(where.anchor, records);
        if (!place) continue;
        const underway = where.underway;
        marks.push({
            id: record.id,
            name: record.name,
            hexKey: place.hexKey,
            party: leadVesselId(party) === record.id,
            inJump: !!underway && underway.state === 'jump',
        });
    }
    return marks;
}

/**
 * One mark per party ship, at that ship's own place. The lead is flagged.
 * `aboard` is the live members on that ship, in member order, for a label.
 * D should switch the party marker from `partyMarker` and from `vesselsOnMap`'s
 * `party` flag to this. Those two stay until that pass.
 */
export type PartyShipMark = {
    id: string;
    name: string;
    hexKey: string;
    lead: boolean;
    inJump: boolean;
    aboard: string[];
};

export function partyShipMarks(
    records: Readonly<Record<string, CampaignRecord>>,
    party: Party,
    days: number,
): PartyShipMark[] {
    const lead = leadVesselId(party);
    const members = partyMembers(party, records);
    const marks: PartyShipMark[] = [];
    for (const vessel of partyVessels(party, records)) {
        const where = vesselWhere(vessel, records, days);
        const place = resolveAnchor(where.anchor, records);
        if (!place) continue;
        const underway = where.underway;
        marks.push({
            id: vessel.id,
            name: vessel.name,
            hexKey: place.hexKey,
            lead: vessel.id === lead,
            inJump: !!underway && underway.state === 'jump',
            aboard: members.filter((member) => memberVessel(party, member.id) === vessel.id).map((member) => member.name),
        });
    }
    return marks;
}

/**
 * Places at an earlier day that are not the place being shown. The map draws these
 * as a stroke. A ship that has not moved is left out.
 */
export function thenPlaces(
    now: readonly { id: string; hexKey: string }[],
    earlier: readonly { id: string; hexKey: string; lead?: boolean }[],
): { id: string; hexKey: string; lead: boolean }[] {
    const at = new Map<string, string>();
    for (const item of now) at.set(item.id, item.hexKey);
    const out: { id: string; hexKey: string; lead: boolean }[] = [];
    for (const item of earlier) {
        if (at.get(item.id) === item.hexKey) continue;
        out.push({ id: item.id, hexKey: item.hexKey, lead: item.lead === true });
    }
    return out;
}
