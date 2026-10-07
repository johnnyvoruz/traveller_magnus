/**
 * A course: the waypoints a ship is sent to, in order, as the legs it would fly (Johnny,
 * 2026-10-06: "set waypoints, click play … and watch the ship signal fly to the location").
 * Each leg is flown from rest to rest, because that is the one travel rule supplied
 * (campaign/travel.ts transitSeconds): it departs when the leg before arrives, and is
 * measured to where its destination will be at its own arrival (estimates.ts settleFlight).
 * Unless the referee has typed a leg's hours, the leg arrives at the settled arrival
 * exactly; the card shows the hours rounded. Pure: it runs under Node. No rule is here.
 */
import type { CampaignAnchor, TrackLeg } from '@voyage/shared';
import { HOUR } from './clock.ts';
import type { PlaceEnd } from './distance.ts';
import { fieldHours, settleFlight, type SettledFlight } from './estimates.ts';
import { flightLeg } from './ship_list.ts';

export type Waypoint = {
    /** A body's key, or a point in AU from the primary. */
    to: PlaceEnd;
    /** The destination in words, as it was when the waypoint was set. */
    name: string;
    /** The anchor a leg to this waypoint ends on. */
    anchor: CampaignAnchor;
    /** The referee's own hours for this leg; null while it follows the estimate. */
    typed: number | null;
    /** The hours field of this leg is the referee's (it may be empty). */
    own: boolean;
};

export type PlannedLeg = {
    /** 1-based place in the course. */
    n: number;
    waypoint: Waypoint;
    from: CampaignAnchor;
    /** Null when the leg before it has no arrival yet. */
    departs: number | null;
    /** Null until the leg has hours. */
    arrives: number | null;
    /** The estimate, measured to where the destination will be; null where a place is not known, or nothing is crossed. */
    settled: SettledFlight | null;
    /** The hours the leg is flown in: typed, or the settled figure itself. */
    hours: number | null;
    /** What the hours field shows: typed as typed, the estimate to a tenth. */
    shown: number | null;
};

export type Distance = (from: PlaceEnd, fromDays: number, to: PlaceEnd, toDays: number) => number | null;

/** The legs of a course, each leaving when the one before arrives. */
export function planCourse(start: { anchor: CampaignAnchor; end: PlaceEnd | null; departs: number }, waypoints: readonly Waypoint[], accelG: number, distance: Distance): PlannedLeg[] {
    const out: PlannedLeg[] = [];
    let from = start.anchor;
    let fromEnd = start.end;
    let departs: number | null = start.departs;
    for (let i = 0; i < waypoints.length; i += 1) {
        const waypoint = waypoints[i];
        const leaves: number | null = departs;
        const end: PlaceEnd | null = fromEnd;
        const settled: SettledFlight | null = leaves !== null && end !== null
            ? settleFlight((arrives) => distance(end, leaves, waypoint.to, arrives), accelG, leaves)
            : null;
        const hours: number | null = waypoint.own ? waypoint.typed : (settled ? settled.hours : null);
        const valid: boolean = hours !== null && Number.isFinite(hours) && hours > 0;
        // An untyped leg arrives at the settled arrival itself, not at the rounded hours.
        const arrives: number | null = leaves === null || !valid ? null : (!waypoint.own && settled ? settled.arrives : leaves + (hours as number) * HOUR);
        out.push({
            n: i + 1, waypoint, from, departs: leaves, arrives, settled,
            hours: valid ? hours : null,
            shown: waypoint.own ? waypoint.typed : (settled ? fieldHours(settled.hours) : null),
        });
        from = waypoint.anchor;
        fromEnd = waypoint.to;
        departs = arrives;
    }
    return out;
}

/** Every leg has its hours: the course can be written. */
export function courseReady(legs: readonly PlannedLeg[]): boolean {
    return legs.length > 0 && legs.every((leg) => leg.departs !== null && leg.arrives !== null && leg.hours !== null);
}

/** The whole course: the distance of the legs that have one, the hours from the first departure to the last arrival. */
export function courseTotals(legs: readonly PlannedLeg[]): { km: number | null; hours: number | null; arrives: number | null; settled: boolean } {
    if (!legs.length) return { km: null, hours: null, arrives: null, settled: true };
    let km: number | null = 0;
    let settled = true;
    for (const leg of legs) {
        if (!leg.settled) km = null;
        else if (km !== null) km += leg.settled.km;
        if (leg.settled && !leg.settled.settled) settled = false;
    }
    const first = legs[0];
    const last = legs[legs.length - 1];
    const whole = courseReady(legs) && first.departs !== null && last.arrives !== null;
    return { km, hours: whole ? ((last.arrives as number) - (first.departs as number)) / HOUR : null, arrives: whole ? last.arrives : null, settled };
}

/** The track legs "Add course" writes, in order; null when the course is not ready or a leg cannot be made. */
export function courseLegs(legs: readonly PlannedLeg[], accelG: number): TrackLeg[] | null {
    if (!courseReady(legs)) return null;
    const out: TrackLeg[] = [];
    for (const leg of legs) {
        const made = flightLeg(leg.from, leg.waypoint.anchor, leg.departs as number, leg.hours as number, accelG);
        if (!made) return null;
        // The settled arrival, to the moment; flightLeg's own sum of the same hours can differ in the last place.
        out.push({ ...made, arrives: leg.arrives as number });
    }
    return out;
}

/** What the picture is told: the dated legs, each to a body or a point; the last one carries the tag. */
export function coursePreview(legs: readonly PlannedLeg[], tag: (leg: PlannedLeg) => string): { toKey?: string; point?: { x: number; y: number }; departs: number; arrives: number; tag?: string }[] {
    const out: { toKey?: string; point?: { x: number; y: number }; departs: number; arrives: number; tag?: string }[] = [];
    for (const leg of legs) {
        if (leg.departs === null || leg.arrives === null) break;
        const to = leg.waypoint.to;
        const base = typeof to === 'string' ? { toKey: to } : { point: { x: to.x, y: to.y } };
        out.push({ ...base, departs: leg.departs, arrives: leg.arrives });
    }
    if (out.length) {
        const last = legs[out.length - 1];
        const words = tag(last);
        if (words) out[out.length - 1].tag = words;
    }
    return out;
}

/** "3 d 4 h", "5 h 12 m", "12 m", "under a minute": how long until an arrival. */
export function toGoWords(days: number): string {
    const minutes = Math.max(0, Math.round(days * 24 * 60));
    if (minutes < 1) return 'under a minute';
    const d = Math.floor(minutes / (24 * 60));
    const h = Math.floor((minutes - d * 24 * 60) / 60);
    const m = minutes - d * 24 * 60 - h * 60;
    if (d > 0) return d + ' d' + (h ? ' ' + h + ' h' : '');
    if (h > 0) return h + ' h' + (m ? ' ' + m + ' m' : '');
    return m + ' m';
}

/** The strip's words under way: the next waypoint named, and the count down to it. */
export function underwayWords(leg: Pick<TrackLeg, 'to' | 'arrives' | 'accelG'>, days: number, name: (anchor: CampaignAnchor) => string): string {
    return 'To ' + name(leg.to) + ' · ' + toGoWords(leg.arrives - days) + ' to go' + (leg.accelG ? ' · ' + leg.accelG + ' G' : '');
}

/**
 * A ship's tag, second line: its state in the strip's short words (ship_list.ts statusWords
 * decides the state; nothing is added). Docked and in orbit name no place, because the tag
 * hangs from the body; under way it is the next waypoint and the count down.
 */
export function tagWords(state: string, leg: Pick<TrackLeg, 'to' | 'arrives'> | null, days: number, name: (anchor: CampaignAnchor) => string): string {
    if (state === 'flight' && leg) return 'To ' + name(leg.to) + ' \u00B7 ' + toGoWords(leg.arrives - days);
    if (state === 'jump') return 'In jump';
    if (state === 'hold') return 'Holding';
    if (state === 'orbit') return 'In orbit';
    if (state === 'docked') return 'Docked';
    return '';
}
