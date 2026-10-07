/**
 * The ships in this system (K12 points 1, 2; K6d): which of the campaign's vessels are here
 * at the view's date, the party's first; each as the track the picture places
 * (orbit/ships.ts placeShips); the words of the status strip for the selected one; and the
 * legs the strip writes (a flight and a jump, each of the hours its preview holds).
 * Where a ship is comes from campaign/track.ts positionAt; nothing here is a travel rule.
 */
import type { CampaignAnchor, CampaignRecord, TrackLeg } from '@voyage/shared';
import { positionAt, trackOf, type TrackFix } from '../campaign/track.ts';
import { HOUR } from './clock.ts';
import type { ShipTrack } from './ships.ts';
import { stardate } from '../workspace/stardate.ts';

export type Leg = TrackLeg;

/** A vessel's place at a date: its track's answer, or its anchor when it has no track. */
export function vesselPosition(record: CampaignRecord, days: number): CampaignAnchor | TrackFix | null {
    const track = trackOf(record);
    if (track && track.length) return positionAt(track, days);
    return record.anchor;
}

function anchorHex(anchor: CampaignAnchor): string | null {
    return anchor && anchor.kind === 'system' ? anchor.hexKey : null;
}

/** True when the place, or either end of the leg under way, is this system. */
export function inSystem(position: CampaignAnchor | TrackFix | null, hexKey: string): boolean {
    if (!position) return false;
    if ('fraction' in position) return anchorHex(position.leg.from) === hexKey || anchorHex(position.leg.to) === hexKey;
    return anchorHex(position) === hexKey;
}

/** The campaign's live vessels in this system at the date, the party's ship first, then by name. */
export function shipsHere(
    records: Readonly<Record<string, CampaignRecord>>,
    partyVesselId: string | null,
    hexKey: string,
    days: number,
): CampaignRecord[] {
    const out: CampaignRecord[] = [];
    for (const record of Object.values(records)) {
        if (record.deleted || record.type !== 'vessel') continue;
        if (inSystem(vesselPosition(record, days), hexKey)) out.push(record);
    }
    return out.sort((a, b) => {
        if (a.id === partyVesselId) return -1;
        if (b.id === partyVesselId) return 1;
        return a.name.localeCompare(b.name);
    });
}

/**
 * The track the picture places a vessel by. A vessel with no track stands at its anchor:
 * one docked leg from the dawn of the clock, so it is there at any date.
 */
export function shipTrack(record: CampaignRecord, partyVesselId: string | null): ShipTrack | null {
    const party = record.id === partyVesselId;
    const legs = trackOf(record);
    if (legs && legs.length) return { id: record.id, name: record.name, kind: party ? 'party' : 'vessel', shape: party ? 'triangle' : 'circle', legs };
    if (!record.anchor) return null;
    return {
        id: record.id, name: record.name, kind: party ? 'party' : 'vessel', shape: party ? 'triangle' : 'circle',
        legs: [{ from: record.anchor, to: record.anchor, departs: 0, arrives: 0, mode: 'docked' }],
    };
}

export type ShipState = 'docked' | 'orbit' | 'hold' | 'flight' | 'jump' | 'none';

/** A place in open space: a system anchor that carries a point and names no body. */
export function isPoint(anchor: CampaignAnchor): boolean {
    return !!anchor && anchor.kind === 'system' && !!anchor.point && !anchor.bodyKey;
}

/** The anchor of a point in this system, its words kept beside it so any screen can say it without the chart. */
export function pointAnchor(hexKey: string, point: { x: number; y: number }, label: string): CampaignAnchor {
    return label ? { kind: 'system', hexKey, point: { x: point.x, y: point.y }, locationLabel: label } : { kind: 'system', hexKey, point: { x: point.x, y: point.y } };
}

/** A ship at rest at an anchor: holding at a point, or docked at a body. */
function atRest(anchor: CampaignAnchor, name: (anchor: CampaignAnchor) => string): { state: ShipState; text: string } {
    if (isPoint(anchor)) return { state: 'hold', text: 'Holding at ' + name(anchor) };
    return { state: 'docked', text: 'Docked at ' + name(anchor) };
}

/**
 * Whether Jump is offered (K12 point 5, as ruled 2026-10-06): only for a ship **at rest
 * outside every 100D circle**, which is a ship holding at a point in open space; the jump
 * leaves from that point. A ship at a body is inside that body's limit however the mark is
 * drawn; a ship under way is told how to get there. `outside` is the picture's answer for
 * the mark (null when it is not on the picture). The words are the strip's; no rule is here
 * beyond "outside every circle".
 */
export function jumpStanding(position: CampaignAnchor | TrackFix | null, outside: boolean | null): { can: boolean; note: string } {
    if (!position) return { can: false, note: 'The ship has no position' };
    if ('fraction' in position) {
        if (position.leg.mode === 'jump') return { can: false, note: 'In jump' };
        return { can: false, note: 'Under way. To jump, plot a point past the 100D limit and hold there.' };
    }
    if (!isPoint(position)) return { can: false, note: 'At a body, inside its 100D limit. To jump, plot a point past the limit and hold there.' };
    if (outside === true) return { can: true, note: '' };
    if (outside === false) return { can: false, note: 'Holding inside a 100D limit. To jump, plot a point past it.' };
    return { can: false, note: 'The ship is not on this picture' };
}

/** The leg a ship is on or has last finished at the date, or null before its first. */
export function legAt(track: readonly Leg[], days: number): Leg | null {
    let last: Leg | null = null;
    for (const leg of track) {
        if (days < leg.departs) break;
        last = leg;
    }
    return last;
}

/** The words of the status strip. `name` turns an anchor into its body's or system's name. */
export function statusWords(
    record: CampaignRecord,
    days: number,
    name: (anchor: CampaignAnchor) => string,
): { state: ShipState; text: string } {
    const track = trackOf(record);
    const leg = track ? legAt(track, days) : null;
    if (!leg) {
        if (record.anchor) return atRest(record.anchor, name);
        return { state: 'none', text: 'No position' };
    }
    const moving = leg.mode === 'flight' || leg.mode === 'jump';
    const underWay = moving && days < leg.arrives;
    if (underWay && leg.mode === 'flight') {
        return { state: 'flight', text: 'In flight ' + name(leg.from) + ' → ' + name(leg.to) + ', arrives ' + whenWords(leg.arrives) + (leg.accelG ? ' · ' + leg.accelG + ' G' : '') };
    }
    if (underWay) return { state: 'jump', text: 'In jump to ' + name(leg.to) + ', arrives ' + whenWords(leg.arrives) };
    if (leg.mode === 'orbit' && !isPoint(leg.to)) return { state: 'orbit', text: 'In orbit at ' + name(leg.to) };
    return atRest(leg.to, name);
}

/** "DDD-YYYY HH:MM" */
export function whenWords(days: number): string {
    const said = stardate(days);
    const dayFraction = days - Math.floor(days);
    const minutes = Math.round(dayFraction * 24 * 60) % (24 * 60);
    const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
    const mm = String(minutes % 60).padStart(2, '0');
    return said.date + ' ' + hh + ':' + mm;
}

/** The accelerations the chooser offers: 1 to 6 G, as K12 says. */
export const ACCEL_CHOICES = [1, 2, 3, 4, 5, 6] as const;

/** A flight leg: from where the ship is, departing at the view's date, arriving a typed number of hours later. */
export function flightLeg(from: CampaignAnchor, to: CampaignAnchor, departs: number, hours: number, accelG: number): Leg | null {
    if (!from || !to || !Number.isFinite(hours) || hours <= 0 || !Number.isFinite(departs)) return null;
    if (!ACCEL_CHOICES.includes(accelG as (typeof ACCEL_CHOICES)[number])) return null;
    return { from, to, departs, arrives: departs + hours * HOUR, mode: 'flight', accelG };
}

/** A jump leg: from where the ship is to the destination system, arriving the given hours later (the roll, or what the referee typed). */
export function jumpLeg(from: CampaignAnchor, to: CampaignAnchor, departs: number, hours: number): Leg | null {
    if (!from || !to || !Number.isFinite(departs) || !Number.isFinite(hours) || hours <= 0) return null;
    return { from, to, departs, arrives: departs + hours * HOUR, mode: 'jump' };
}

/** Where a new leg starts: the anchor the ship is at; under way, the end of the leg it is on. */
export function legStart(position: CampaignAnchor | TrackFix | null): CampaignAnchor {
    if (!position) return null;
    if ('fraction' in position) return position.leg.to;
    return position;
}

/** The earliest a new leg may depart: the date, or the arrival of the leg under way when that is later. */
export function earliestDeparture(position: CampaignAnchor | TrackFix | null, days: number): number {
    if (position && 'fraction' in position) return Math.max(days, position.leg.arrives);
    return days;
}

/** The anchor of a body on this picture, as a leg's end. */
export function bodyAnchor(hexKey: string, bodyKey: string, label?: string): CampaignAnchor {
    return label ? { kind: 'system', hexKey, bodyKey, locationLabel: label } : { kind: 'system', hexKey, bodyKey };
}
