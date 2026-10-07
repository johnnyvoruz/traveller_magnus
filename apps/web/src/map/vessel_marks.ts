/**
 * Live vessels as the chart's marks, at the campaign date.
 * The hex and the in-jump flag follow vesselWhere, the same rule as the party marker
 * (workspace/party_where.ts): a flight stands in the system it is crossing, and a jump
 * is held at the system it left. placeAt disagrees: a flight is in the system the ship
 * left, and a jump has no hex. The marks follow the marker so the two cannot split.
 * A vessel with no place is left out. Nothing here is drawn.
 */
import type { CampaignRecord } from '@voyage/shared';
import { resolveAnchor, type Party } from '../workspace/party.ts';
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
            party: party.vesselId === record.id,
            inJump: !!underway && underway.state === 'jump',
        });
    }
    return marks;
}
