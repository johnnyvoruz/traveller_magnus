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

/**
 * The thrust a ship last flew at: the `accelG` of the last flight leg on its track, or null
 * when it has never flown one. Offered when the ship is next taken in hand; nothing is
 * assumed for a ship that has none (no Traveller default is known here).
 */
export function lastThrust(track: readonly Pick<TrackLeg, 'mode' | 'accelG'>[] | null): number | null {
    if (!track) return null;
    for (let i = track.length - 1; i >= 0; i -= 1) {
        const g = track[i].accelG;
        if (track[i].mode === 'flight' && typeof g === 'number' && g > 0) return g;
    }
    return null;
}

/** Whether two ends of a leg are the same place: the same body, or the same point. */
export function samePlace(a: PlaceEnd | null, b: PlaceEnd | null): boolean {
    if (a === null || b === null) return false;
    if (typeof a === 'string' || typeof b === 'string') return a === b;
    return a.x === b.x && a.y === b.y;
}

export type StoredRoute = {
    /** The track index of `legs[0]`. */
    first: number;
    /** The ship's stored flight legs on this picture from a date on: the one under way first, then those to come. */
    legs: TrackLeg[];
    /** `legs[0]` departed before the date: it is history, shown and not edited. At the instant of its departure it is not under way yet (ruled 2026-10-07). */
    underway: boolean;
    /**
     * What follows the route on the track: a jump and every leg after it. They are not
     * picked up; when the route before them is edited they keep their own durations and
     * move in time (ruled 2026-10-07; onwardLegs below).
     */
    after: TrackLeg[];
};

/**
 * A ship's route on this picture (Johnny, 2026-10-06: "when I click on the vessel to select
 * it, I want to see its pathing and be able to edit it"). From the first leg that has not
 * yet arrived, the run of flight legs whose two ends are places on this picture (`end`
 * answers null for anywhere else). The run stops at the first leg that is not one; that leg
 * and all after it are `after`.
 */
export function storedRoute(track: readonly TrackLeg[] | null, days: number, end: (anchor: CampaignAnchor) => PlaceEnd | null): StoredRoute {
    const none: StoredRoute = { first: 0, legs: [], underway: false, after: [] };
    if (!track) return none;
    const first = track.findIndex((leg) => leg.arrives > days);
    if (first < 0) return { ...none, first: track.length };
    const legs: TrackLeg[] = [];
    for (let i = first; i < track.length; i += 1) {
        const leg = track[i];
        if (leg.mode !== 'flight' || end(leg.from) === null || end(leg.to) === null) break;
        legs.push(leg);
    }
    return { first, legs, underway: legs.length > 0 && legs[0].departs < days, after: track.slice(first + legs.length) };
}

/** How many leading legs of a route cannot be picked up: the one under way. */
export function routeFixed(route: StoredRoute): number {
    return route.underway ? 1 : 0;
}

/**
 * The legs after a route, once the route before them ends somewhere or sometime else
 * (ruled 2026-10-07): **each keeps its own duration and all move in time by the same
 * amount**, however much earlier or later the edited legs now end; the first of them (the
 * jump) departs from wherever the route now ends. Its destination, its hours and its note
 * are untouched. With no leg of the route before them, they wait if the new legs fit
 * before the first one's departure and move later by the overrun if they do not.
 */
export function onwardLegs(route: StoredRoute, end: { anchor: CampaignAnchor; arrives: number }): TrackLeg[] {
    if (!route.after.length) return [];
    const was = route.legs.length ? route.legs[route.legs.length - 1].arrives : null;
    const delta = was !== null ? end.arrives - was : Math.max(0, end.arrives - route.after[0].departs);
    return route.after.map((leg, index) => {
        const departs = leg.departs + delta;
        return { ...leg, ...(index === 0 ? { from: end.anchor } : {}), departs, arrives: departs + (leg.arrives - leg.departs) };
    });
}

/** New legs laid after a route that has legs following it: where they are written from, and everything to write. */
export function appendedTail(route: StoredRoute, legs: readonly TrackLeg[]): { index: number; after: TrackLeg[]; all: TrackLeg[] } {
    const last = legs[legs.length - 1];
    const after = last ? onwardLegs({ ...route, legs: route.legs }, { anchor: last.to, arrives: last.arrives }) : route.after;
    // The new legs run on from the route's end, so the route itself is unchanged: only its end moved.
    return { index: route.first + route.legs.length, after, all: [...legs, ...after] };
}

/** A stored route as the picture takes it: each leg's end and its dates; the last carries the tag. */
export function routePreview(route: StoredRoute, end: (anchor: CampaignAnchor) => PlaceEnd | null, tag: (leg: TrackLeg) => string): { toKey?: string; point?: { x: number; y: number }; departs: number; arrives: number; tag?: string }[] {
    const out: { toKey?: string; point?: { x: number; y: number }; departs: number; arrives: number; tag?: string }[] = [];
    for (const leg of route.legs) {
        const to = end(leg.to);
        if (to === null) break;
        out.push({ ...(typeof to === 'string' ? { toKey: to } : { point: { x: to.x, y: to.y } }), departs: leg.departs, arrives: leg.arrives });
    }
    if (out.length) {
        const words = tag(route.legs[out.length - 1]);
        if (words) out[out.length - 1].tag = words;
    }
    return out;
}

export type EditedTail = {
    /** The track index the new tail replaces from (campaign/track.ts replaceLegsFrom). */
    index: number;
    /** The place in the route the tail starts at. */
    at: number;
    /** The tail as planned legs, numbered from their place in the route. */
    planned: PlannedLeg[];
    /** The route's own legs from there; null when one of them has no hours (a distance is not known). */
    legs: TrackLeg[] | null;
    /** What follows the route, moved in time to follow the new end (onwardLegs). */
    after: TrackLeg[];
    /** Everything to write from `index`: the legs, then what follows; null with `legs`. */
    all: TrackLeg[] | null;
};

/**
 * A stored route with one waypoint moved or removed: the tail to write in its place.
 * The leg into the changed waypoint keeps its own departure; **every leg from there on is
 * re-timed, each from rest to rest at the course's thrust**, leaving when the one before
 * arrives. (A stored leg does not say whether its hours were typed, so none is treated as
 * typed.) A waypoint left standing on the place before it is not a leg and is dropped.
 * Null when that place in the route cannot be edited.
 */
export function editedTail(
    route: StoredRoute,
    at: number,
    change: { move: Waypoint } | { remove: true },
    accelG: number,
    distance: Distance,
    end: (anchor: CampaignAnchor) => PlaceEnd | null,
    name: (anchor: CampaignAnchor) => string,
): EditedTail | null {
    if (!Number.isInteger(at) || at < routeFixed(route) || at >= route.legs.length) return null;
    const head = route.legs[at];
    const waypoints: Waypoint[] = [];
    if ('move' in change) waypoints.push({ ...change.move, typed: null, own: false });
    for (const leg of route.legs.slice(at + 1)) {
        const to = end(leg.to);
        if (to === null) return null;
        waypoints.push({ to, name: name(leg.to), anchor: leg.to, typed: null, own: false });
    }
    const kept: Waypoint[] = [];
    let before: PlaceEnd | null = end(head.from);
    for (const waypoint of waypoints) {
        if (samePlace(before, waypoint.to)) continue;
        kept.push(waypoint);
        before = waypoint.to;
    }
    const planned = planCourse({ anchor: head.from, end: end(head.from), departs: head.departs }, kept, accelG, distance)
        .map((leg) => ({ ...leg, n: at + leg.n }));
    const legs = kept.length === 0 ? [] : courseLegs(planned, accelG);
    if (!legs) return { index: route.first + at, at, planned, legs, after: route.after, all: null };
    // Where the route now ends: its last new leg; with none left, the leg before the change, or where it set out from.
    const last = legs[legs.length - 1] ?? (at > 0 ? route.legs[at - 1] : null);
    const after = onwardLegs(route, last ? { anchor: last.to, arrives: last.arrives } : { anchor: head.from, arrives: head.departs });
    return { index: route.first + at, at, planned, legs, after, all: [...legs, ...after] };
}

/** A plotted course with one waypoint put somewhere else: its hours follow the estimate again; the others keep what was typed. */
export function movedWaypoint(waypoints: readonly Waypoint[], at: number, to: Waypoint): Waypoint[] {
    return waypoints.map((item, index) => (index === at ? { ...to, typed: null, own: false } : item));
}
