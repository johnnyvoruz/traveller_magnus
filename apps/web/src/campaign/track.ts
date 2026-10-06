/**
 * A vessel's track: dated legs on status.track.
 * Durations are whatever the legs say. Nothing here is a travel rule.
 * "Where are we" reads the track when the ship's record has one, and the
 * ship's anchor otherwise. The party screen calls this; it is not edited here.
 */
import {
    CAMPAIGN_LIMITS,
    Track,
    TrackLeg,
    type CampaignAnchor,
    type CampaignRecord,
} from '@voyage/shared';
import { commit } from './commit.ts';
import { campaign } from './store.ts';

type Leg = {
    from: CampaignAnchor;
    to: CampaignAnchor;
    departs: number;
    arrives: number;
    mode: 'docked' | 'orbit' | 'flight' | 'jump';
    accelG?: number;
    note?: string;
};

export type TrackFix = {
    leg: Leg;
    fraction: number;
};

export type TrackResult = { ok: true } | { ok: false; message: string };

const NOT_OPEN = 'That record is not open.';
const NOT_VESSEL = 'A track belongs to a vessel.';
const BAD_LEG = 'That leg is not a track leg.';
const OUT_OF_ORDER = 'Legs must stay in time order.';
const TOO_MANY = 'A track can have 500 legs.';
const NO_LEGS = 'That track has no legs.';

type PartyLike = {
    vesselId: string | null;
    anchor: CampaignAnchor;
};

/** The track on a vessel, when status.track is a valid list. */
export function trackOf(record: CampaignRecord): Leg[] | null {
    const status = record.status;
    if (!status || typeof status !== 'object' || Array.isArray(status)) return null;
    if (!Object.prototype.hasOwnProperty.call(status, 'track')) return null;
    const parsed = Track.safeParse((status as { track: unknown }).track);
    return parsed.success ? parsed.data : null;
}

/**
 * Where a ship on this track is at `days`.
 * A flight or a jump in progress is `{ leg, fraction }`, 0 at departure and 1 at arrival.
 * Docked, in orbit, in a gap, or after the last arrival, the ship is at an anchor.
 * Before the first departure there is no place yet.
 */
export function positionAt(track: readonly Leg[], days: number): CampaignAnchor | TrackFix | null {
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
    if (!party.vesselId) return null;
    const found = records[party.vesselId];
    if (!found || found.deleted || found.type !== 'vessel') return null;
    return found;
}

/**
 * "Where are we" at `days`.
 * The party's ship answers from its track when it has one.
 * Otherwise the ship's anchor, as now. With no ship, the party's own anchor.
 */
export function whereAreWe(
    party: PartyLike,
    records: Readonly<Record<string, CampaignRecord>>,
    days: number,
): CampaignAnchor | TrackFix | null {
    const vessel = liveVessel(party, records);
    if (!vessel) return party.anchor;
    const track = trackOf(vessel);
    if (track) return positionAt(track, days);
    return vessel.anchor;
}

function openVessel(recordId: string): CampaignRecord | TrackResult {
    const record = campaign.records[recordId];
    if (!record || record.deleted) return { ok: false, message: NOT_OPEN };
    if (record.type !== 'vessel') return { ok: false, message: NOT_VESSEL };
    return record;
}

function statusWith(record: CampaignRecord, track: Leg[]): Record<string, unknown> {
    const status = record.status;
    const base = status && typeof status === 'object' && !Array.isArray(status)
        ? { ...(status as Record<string, unknown>) }
        : {};
    base.track = track;
    return base;
}

function writeTrack(record: CampaignRecord, track: Leg[]): void {
    commit({ records: [{ ...record, status: statusWith(record, track), baseRev: record.rev }] });
}

/** Adds a leg after the ones already stored. A leg out of time order is refused. */
export function appendLeg(recordId: string, leg: Leg): TrackResult {
    const record = openVessel(recordId);
    if (isRefusal(record)) return record;
    if (!TrackLeg.safeParse(leg).success) return { ok: false, message: BAD_LEG };
    const current = trackOf(record) ?? [];
    if (current.length >= CAMPAIGN_LIMITS.track) return { ok: false, message: TOO_MANY };
    const next = current.concat([leg]);
    if (!Track.safeParse(next).success) return { ok: false, message: OUT_OF_ORDER };
    writeTrack(record, next);
    return { ok: true };
}

/** Drops the last leg. */
export function removeLastLeg(recordId: string): TrackResult {
    const record = openVessel(recordId);
    if (isRefusal(record)) return record;
    const current = trackOf(record);
    if (!current || current.length === 0) return { ok: false, message: NO_LEGS };
    writeTrack(record, current.slice(0, -1));
    return { ok: true };
}

function isRefusal(record: CampaignRecord | TrackResult): record is TrackResult {
    return 'ok' in record;
}
