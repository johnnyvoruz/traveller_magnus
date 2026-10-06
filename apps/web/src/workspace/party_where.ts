/**
 * "Where are we", from the track (K12; the ruling of 2026-10-06): the party's place at the
 * campaign date is campaign/track.ts whereAreWe, not the ship's anchor alone. At a place it
 * is that anchor; under way it is the strip's own words (orbit/ship_list.ts statusWords) and,
 * for the map and Locate, a system to stand on. "Move the party" on a ship with a track is
 * one docked leg at the campaign date. Pure: it runs under Node. Nothing here is a rule.
 */
import type { CampaignAnchor, CampaignClock, CampaignRecord, TrackLeg } from '@voyage/shared';
import { positionAt, trackOf, whereAreWe, type TrackFix } from '../campaign/track.ts';
import { DEFAULT_START, totalDays } from '../orbit/clock.ts';
import { statusWords, whenWords } from '../orbit/ship_list.ts';
import { partyVessel, resolveAnchor, type Party } from './party.ts';
import { anchorName } from './track_rows.ts';

/** The campaign date as the orbit clock counts it; a campaign with no date yet is on the default start. */
export function campaignDays(clock: Pick<CampaignClock, 'days'> | null): number {
    return clock ? clock.days : totalDays(DEFAULT_START.year, DEFAULT_START.day);
}

export type PartyWhere = {
    /** The place to say, to locate and to show in orbit: where the party is, or the system it is under way in. */
    anchor: CampaignAnchor;
    /** Under way: the strip's words, and which kind of leg. Null at a place. */
    underway: { state: 'flight' | 'jump'; text: string } | null;
};

/**
 * The system a leg under way stands in. A flight is in the system it is crossing. A ship in
 * jump is in no hex: it is held at the system it left until it arrives (the marker's design
 * call, findings/orbit_view_design.md §8s).
 */
function standing(leg: TrackLeg): CampaignAnchor {
    return leg.mode === 'jump' ? leg.from : leg.to;
}

function whereOf(at: CampaignAnchor | TrackFix | null, vessel: CampaignRecord | null, records: Readonly<Record<string, CampaignRecord>>, days: number): PartyWhere {
    if (!at || !('fraction' in at)) return { anchor: at, underway: null };
    const words = vessel ? statusWords(vessel, days, (anchor) => anchorName(anchor, records)) : null;
    const state = at.leg.mode === 'jump' ? 'jump' : 'flight';
    return { anchor: standing(at.leg), underway: { state, text: words ? words.text : '' } };
}

export function partyWhere(party: Party, records: Readonly<Record<string, CampaignRecord>>, days: number): PartyWhere {
    return whereOf(whereAreWe(party, records, days), partyVessel(party, records), records, days);
}

/**
 * Where one vessel is at the date, by the same rule as the party's ship (campaign/track.ts
 * whereAreWe): its track's answer, or its anchor with no track and before the first departure.
 */
export function vesselWhere(vessel: CampaignRecord, records: Readonly<Record<string, CampaignRecord>>, days: number): PartyWhere {
    const track = trackOf(vessel);
    const at = track ? positionAt(track, days) ?? vessel.anchor : vessel.anchor;
    return whereOf(at, vessel, records, days);
}

/** The party's marker on the map: the hex it stands on and its tag, or null when it is nowhere. */
export function partyMarker(party: Party, records: Readonly<Record<string, CampaignRecord>>, days: number): { hexKey: string; name: string } | null {
    const where = partyWhere(party, records, days);
    const place = resolveAnchor(where.anchor, records);
    if (!place) return null;
    const vessel = partyVessel(party, records);
    const name = vessel ? vessel.name : 'Party';
    return { hexKey: place.hexKey, name: where.underway && where.underway.state === 'jump' ? name + ' · in jump' : name };
}

/**
 * Why a ship with this track cannot be docked somewhere at `days`, in plain words with what
 * to do, or null when it can: a leg must depart at or after the last one arrives.
 */
export function moveRefusal(name: string, track: readonly TrackLeg[], days: number): string | null {
    const last = track[track.length - 1];
    if (!last || last.arrives <= days) return null;
    if (last.departs > days) {
        return name + ' has a later leg planned, departing ' + whenWords(last.departs) + '. Remove it on the ship’s page, or move the campaign date past its arrival.';
    }
    return name + ' is under way until ' + whenWords(last.arrives) + '. Move the campaign date to its arrival, or remove the leg on the ship’s page.';
}

/** The leg "Move the party" writes: docked at the place, at the campaign date. */
export function dockedLeg(anchor: CampaignAnchor, days: number): TrackLeg {
    return { from: anchor, to: anchor, departs: days, arrives: days, mode: 'docked' };
}
