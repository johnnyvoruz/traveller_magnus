/**
 * Where a record is at a campaign date.
 * The chain walk is locate. When a date is given, a vessel with a track is placed by
 * positionAt instead of by its stored anchor. With no date, the answer is locate's.
 */
import { locate, type CampaignAnchor, type CampaignRecord, type LocateAt, type SystemAnchor } from '@voyage/shared';
import { positionAt, trackOf } from './track.ts';

/** At a system, with a body only when the place names one. */
export type PlaceHere = {
    kind: 'here';
    anchor: SystemAnchor;
};

/** In jump: no hex. The leg's two ends and the day it arrives. */
export type PlaceJump = {
    kind: 'jump';
    from: CampaignAnchor;
    to: CampaignAnchor;
    arrives: number;
};

export type PlaceAt = PlaceHere | PlaceJump;

function here(anchor: SystemAnchor): PlaceHere {
    return { kind: 'here', anchor };
}

function departureHex(anchor: CampaignAnchor): PlaceHere | null {
    if (!anchor || anchor.kind !== 'system') return null;
    return here({ kind: 'system', hexKey: anchor.hexKey });
}

/**
 * The record's place at `days`.
 * Null when the chain cycles, runs past eight hops, or never reaches a system.
 * A flight is in the departure system, at no body. A jump is not in a hex.
 * Before the first departure, the vessel's own anchor is followed.
 * `days` null does not read a track.
 */
export function placeAt(
    id: string,
    records: Readonly<Record<string, CampaignRecord | undefined>>,
    days: number | null,
): PlaceAt | null {
    if (days == null || !Number.isFinite(days)) {
        const stored = locate(id, records);
        return stored ? here(stored) : null;
    }
    const dated = days;
    const atDate: LocateAt<PlaceAt | null> = (recordId, record) => {
        const full = records[recordId];
        if (!full || full.type !== 'vessel') return undefined;
        const track = trackOf(full);
        if (!track) return undefined;
        const at = positionAt(track, dated);
        if (!at || !('fraction' in at)) return { follow: at ?? record.anchor };
        if (at.leg.mode === 'jump') {
            return { done: { kind: 'jump', from: at.leg.from, to: at.leg.to, arrives: at.leg.arrives } };
        }
        return { done: departureHex(at.leg.from) };
    };
    const found = locate(id, records, atDate);
    if (!found) return null;
    if (found.kind === 'jump') return found;
    if (found.kind === 'here') return found;
    if (found.kind === 'system') return here(found);
    return null;
}
