/**
 * Ship marks on the orbit picture. Placement only: a track says where a ship is,
 * and the picture says where that body is drawn. Nothing here is a travel rule.
 * Agent D feeds real tracks; the stand-in is dev-only.
 */
import type { CampaignAnchor } from '@voyage/shared';
import { positionAt } from '../campaign/track.ts';
import { formatDistance } from '../design/units.ts';
import { DAY_SECONDS, totalDays } from './clock.ts';
import { BODY_SNAP_PX, placeAtPicture, type PictureLayout } from './distance.ts';
import { AU_KM, type Plan, type View } from './layout.ts';
import type { Picture } from './picture.ts';

export type ShipKind = 'party' | 'vessel' | 'traffic';
export type ShipShape = 'triangle' | 'circle' | 'square' | 'rectangle';

/** One ship on this frame's picture. x and y are the picture's own units. */
export type ShipMark = {
    id: string;
    name: string;
    kind: ShipKind;
    shape: ShipShape;
    x: number;
    y: number;
    /** Radians, canvas angle: 0 points to +x. Omitted when the ship is not under way. */
    heading?: number;
    /**
     * Set only while a jump is in progress. 'out' is where this picture's ship left;
     * 'in' is where it will arrive. Neither is a drawn mark. Omitted on every other mark.
     */
    jump?: 'out' | 'in';
};

export type ShipTrack = {
    id: string;
    name: string;
    kind: ShipKind;
    shape: ShipShape;
    legs: readonly {
        from: CampaignAnchor;
        to: CampaignAnchor;
        departs: number;
        arrives: number;
        mode: 'docked' | 'orbit' | 'flight' | 'jump';
        accelG?: number;
        note?: string;
    }[];
};

export type BodyPoint = { x: number; y: number };

/**
 * Where an anchor is drawn at `days`, in picture units. Null when that anchor
 * is not on this picture.
 */
export type BodiesAt = (anchor: CampaignAnchor, days: number) => BodyPoint | null;

/** The plotting overlay for one frame. Off when the painter is not given one. */
export type PlotReadout = {
    /** Pointer, in picture units. */
    x: number;
    y: number;
    /** The mark the distance is measured from, in picture units. */
    from?: BodyPoint | null;
};

/**
 * What the painter already knows, so the readout can speak in AU. The canvas still passes
 * only the picture points above. Without this, the readout says nothing.
 */
export type PlotFrame = {
    plan: Plan;
    view: View;
    mode: PictureLayout;
    days: number;
    /** Drawn centres. A point within BODY_SNAP_PX of one reads that body. */
    bodies: readonly { key: string; x: number; y: number }[];
};

const sys = (hexKey: string, bodyKey: string): CampaignAnchor => ({ kind: 'system', hexKey, bodyKey });

/**
/**
 * Where an AU point is drawn on this frame. A point does not move, so the date is not asked.
 * Null when this picture has no place for it.
 */
export type PictureOf = (au: { x: number; y: number }) => BodyPoint | null;

/** A system point is not a body. `bodiesAt` is not asked for one. */
function openPoint(anchor: CampaignAnchor): { x: number; y: number } | null {
    if (!anchor || anchor.kind !== 'system' || !anchor.point || anchor.bodyKey) return null;
    return anchor.point;
}

function drawnAnchor(anchor: CampaignAnchor, atDays: number, bodiesAt: BodiesAt, pictureOf?: PictureOf): BodyPoint | null {
    const point = openPoint(anchor);
    if (point) return pictureOf ? pictureOf(point) : null;
    return bodiesAt(anchor, atDays);
}

/**
 * Where each track's ship is at `days`.
 * An anchor sits on that body, or on its point when the anchor has one.
 * A flight in progress is the straight line from where `from` was at `departs` to where
 * `to` will be at `arrives`, by the leg's fraction. A point does not move, so that end
 * is the same picture place at either date. Both ends are fixed moments, so the line
 * does not bend. A jump in progress is not a mark: the system it leaves reports the
 * place it left, and the system it reaches reports the place it will arrive at. At and
 * after arrival it is a normal mark at `to`. `bodiesAt` is asked at the frame's date
 * for an anchor or a jump, and at the leg's two dates for a flight. A point is placed
 * by `pictureOf` and `bodiesAt` is not asked.
 */
export function placeShips(
    tracks: readonly ShipTrack[], bodiesAt: BodiesAt, days: number, pictureOf?: PictureOf,
): ShipMark[] {
    const marks: ShipMark[] = [];
    for (const track of tracks) {
        const at = positionAt(track.legs, days);
        if (!at) continue;
        const base = { id: track.id, name: track.name, kind: track.kind, shape: track.shape };
        if ('fraction' in at) {
            const flight = at.leg.mode === 'flight';
            const from = drawnAnchor(at.leg.from, flight ? at.leg.departs : days, bodiesAt, pictureOf);
            const to = drawnAnchor(at.leg.to, flight ? at.leg.arrives : days, bodiesAt, pictureOf);
            if (at.leg.mode === 'jump') {
                if (from) marks.push({ ...base, x: from.x, y: from.y, jump: 'out' });
                else if (to) marks.push({ ...base, x: to.x, y: to.y, jump: 'in' });
                continue;
            }
            if (!from || !to) continue;
            const x = from.x + (to.x - from.x) * at.fraction;
            const y = from.y + (to.y - from.y) * at.fraction;
            const dx = to.x - from.x;
            const dy = to.y - from.y;
            const mark: ShipMark = { ...base, x, y };
            if (dx !== 0 || dy !== 0) mark.heading = Math.atan2(dy, dx);
            marks.push(mark);
            continue;
        }
        const point = drawnAnchor(at, days, bodiesAt, pictureOf);
        if (!point) continue;
        marks.push({ ...base, x: point.x, y: point.y });
    }
    return marks;
}

/**
 * The ship under a picture point, or null. The radius is the body hit floor, the same
 * slop a world uses at its smallest. A jump report is not drawn, so it is not hit.
 * The nearest mark within the slop wins, and a tie takes the later mark.
 */
export function shipAt(
    marks: readonly ShipMark[],
    point: { x: number; y: number },
    slop = BODY_SNAP_PX,
): string | null {
    const limit = slop * slop;
    let best: string | null = null;
    let bestD = limit;
    for (const mark of marks) {
        if (mark.jump) continue;
        const d = (mark.x - point.x) ** 2 + (mark.y - point.y) ** 2;
        if (d <= bestD) {
            bestD = d;
            best = mark.id;
        }
    }
    return best;
}

/**
 * Where a docked ship is drawn beside its body. Down and to the right: one disc
 * radius plus 16 px clear of the name, then 20 px further along that diagonal for
 * each earlier ship at the same body. `index` is that ship's place in id order.
 */
export function dockedBeside(body: { x: number; y: number }, radius: number, index: number): { x: number; y: number } {
    const reach = radius + 16 + Math.max(0, index) * 20;
    const angle = Math.PI / 4;
    return {
        x: body.x + reach * Math.cos(angle),
        y: body.y + reach * Math.sin(angle),
    };
}

/** The primary distance, always in AU. Under a tenth is still AU; the ship clause is not. */
function primaryAu(au: number): string {
    if (!Number.isFinite(au) || au < 0) return '';
    return (au >= 10 ? au.toFixed(1) : au.toFixed(2)) + ' AU';
}

/**
 * One line: how far the pointer is from the primary, in AU. When a ship mark was given,
 * the distance from that mark follows, in km under a tenth of an AU and in AU above.
 * Empty when the picture has no place for the pointer. Picture coordinates are never written.
 */
export type ReadoutBox = { x: number; y: number; w: number; h: number };

export type ReadoutPlace = {
    x: number;
    y: number;
    align: 'left' | 'right';
    baseline: 'top' | 'bottom';
};

const READOUT_X = 8;
const READOUT_BELOW = 12;
const READOUT_ABOVE = 8;

function boxesOverlap(a: ReadoutBox, b: ReadoutBox): boolean {
    return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/**
 * Where the hairline readout is drawn. Right and below the pointer, flipped to stay
 * on the canvas. When that box would cross a mark's name, it moves to the pointer's
 * other side. `names` are the name boxes already painted, in picture pixels.
 */
export function readoutPlace(
    plot: { x: number; y: number },
    text: { w: number; h: number },
    canvas: { w: number; h: number },
    names: readonly ReadoutBox[],
): ReadoutPlace {
    const boxAt = (right: boolean, below: boolean): ReadoutBox => ({
        x: right ? plot.x + READOUT_X : plot.x - READOUT_X - text.w,
        y: below ? plot.y + READOUT_BELOW : plot.y - READOUT_ABOVE - text.h,
        w: text.w,
        h: text.h,
    });
    const hits = (box: ReadoutBox) => names.some((name) => boxesOverlap(box, name));
    let right = !(plot.x + READOUT_X + text.w > canvas.w);
    let below = !(plot.y + READOUT_BELOW > canvas.h - 16);
    if (hits(boxAt(right, below))) {
        if (!hits(boxAt(!right, below))) right = !right;
        else if (!hits(boxAt(right, !below))) below = !below;
        else right = !right;
    }
    return {
        x: right ? plot.x + READOUT_X : plot.x - READOUT_X,
        y: below ? plot.y + READOUT_BELOW : plot.y - READOUT_ABOVE,
        align: right ? 'left' : 'right',
        baseline: below ? 'top' : 'bottom',
    };
}

export function plotText(plot: PlotReadout, frame?: PlotFrame | null): string {
    if (!frame) return '';
    const here = placeAtPicture({ x: plot.x, y: plot.y }, frame.view, frame.plan, frame.mode, frame.bodies, frame.days);
    if (!here) return '';
    const line = primaryAu(Math.hypot(here.x, here.y));
    if (!line || !plot.from) return line;
    const ship = placeAtPicture(plot.from, frame.view, frame.plan, frame.mode, frame.bodies, frame.days);
    if (!ship) return line;
    const km = Math.hypot(here.x - ship.x, here.y - ship.y) * AU_KM;
    const leg = formatDistance(km, AU_KM);
    if (!leg) return line;
    return line + ' \u00B7 ship ' + leg;
}

type PictureBody = BodyPoint & { key: string; main: boolean };

/** Bodies on this picture, in paint order, with the mainworld flagged. */
export function pictureBodies(picture: Picture): PictureBody[] {
    const out: PictureBody[] = [];
    for (const star of picture.stars) out.push({ key: star.star.key, x: star.x, y: star.y, main: false });
    for (const layer of picture.layers) {
        for (const at of layer.worlds) {
            out.push({
                key: at.world.key, x: at.x, y: at.y,
                main: at.world.mainworld || at.world.mainworldBelt,
            });
            for (const moon of at.moons) {
                out.push({ key: moon.moon.key, x: moon.x, y: moon.y, main: moon.moon.mainworld });
            }
        }
    }
    return out;
}

/**
 * The stand-in's jump loop, in wall seconds at the default clock: one campaign
 * second per wall second. Outbound leaves 3s into the loop; inbound arrives 3s
 * later. The loop is 16s so each ship is back in the same pose when it repeats.
 */
const STAND_PERIOD_WALL = 16;
const STAND_OUT_LEAVE = 3;
const STAND_OUT_AWAY = 8;
const STAND_OUT_BACK = 13;
const STAND_IN_ARRIVE = 6;
const STAND_IN_LEAVE = 14;
const STAND_IN_FAR = 15;

/**
 * Fixed ships so the designators can be seen, plus one that jumps out and one
 * that arrives. The party's triangle is halfway from the primary to the furthest
 * body. The jump pair is dated on a wall-clock loop, so a running clock crosses
 * both moments a few seconds apart.
 */
/** A body's picture place at a date. Used by the dev stand-in when a flight must not bend. */
export type StandPlaces = (key: string, days: number) => BodyPoint | null;

/**
 * Dev stand-in marks. `places`, when given, answers a body at the date `bodiesAt` is asked,
 * so a flight runs from departure to arrival. Without it, every anchor is the picture's
 * present place. `flight`, when given, is the party's fixed window; otherwise the party
 * stays halfway across a one-day leg centred on `days`.
 */
export function standInMarks(
    hexKey: string,
    days: number,
    picture: Picture,
    places?: StandPlaces,
    flight?: { departs: number; arrives: number },
    pictureOf?: PictureOf,
): ShipMark[] {
    const bodies = pictureBodies(picture);
    if (bodies.length === 0) return [];
    const byKey = new Map(bodies.map((body) => [body.key, body]));
    const star = bodies.find((body) => body.key.startsWith('s')) ?? bodies[0];
    // The far end is the body furthest from the primary, so a halfway mark is not lost on the star.
    let far = star;
    let farD = -1;
    for (const body of bodies) {
        const d = (body.x - star.x) ** 2 + (body.y - star.y) ** 2;
        if (d > farD) { far = body; farD = d; }
    }
    const rest = bodies.filter((body) => body.key !== far.key && body.key !== star.key);
    const dock = rest[0] ?? far;
    const patrol = rest[1] ?? dock;
    const bodiesAt: BodiesAt = (anchor, atDays) => {
        if (!anchor || anchor.kind !== 'system' || anchor.hexKey !== hexKey || !anchor.bodyKey) return null;
        if (places) {
            const at = places(anchor.bodyKey, atDays);
            if (at) return at;
        }
        const body = byKey.get(anchor.bodyKey);
        return body ? { x: body.x, y: body.y } : null;
    };
    const span = 1;
    const partyFrom = flight ? flight.departs : days - span;
    const partyTo = flight ? flight.arrives : days + span;
    const heldFrom = Math.min(0, days);
    const heldTo = Math.max(days, 0) + span;
    const off = sys(hexKey + '/jump', 'off');
    const home = sys(hexKey, star.key);
    // The furthest body can sit outside the fitted picture. Arrive at the body nearest the primary.
    let near = rest[0] ?? dock;
    let nearD = Infinity;
    for (const body of rest) {
        const d = (body.x - star.x) ** 2 + (body.y - star.y) ** 2;
        if (d > 0 && d < nearD) { near = body; nearD = d; }
    }
    const land = sys(hexKey, near.key);
    // Campaign seconds are wall seconds at the default rate, so the loop stays put as `days` moves.
    const cycle = Math.floor(days * DAY_SECONDS / STAND_PERIOD_WALL);
    const start = cycle * STAND_PERIOD_WALL / DAY_SECONDS;
    const period = STAND_PERIOD_WALL / DAY_SECONDS;
    const outbound: ShipTrack['legs'][number][] = [];
    const inbound: ShipTrack['legs'][number][] = [];
    for (const step of [-1, 0, 1]) {
        const base = start + step * period;
        const leave = base + STAND_OUT_LEAVE / DAY_SECONDS;
        const away = base + STAND_OUT_AWAY / DAY_SECONDS;
        const back = base + STAND_OUT_BACK / DAY_SECONDS;
        outbound.push(
            { from: home, to: off, departs: leave, arrives: away, mode: 'jump' as const },
            { from: off, to: home, departs: away, arrives: back, mode: 'jump' as const },
            { from: home, to: home, departs: back, arrives: leave + period, mode: 'orbit' as const },
        );
        const arrive = base + STAND_IN_ARRIVE / DAY_SECONDS;
        const hop = base + STAND_IN_LEAVE / DAY_SECONDS;
        const gone = base + STAND_IN_FAR / DAY_SECONDS;
        inbound.push(
            { from: off, to: land, departs: gone - period, arrives: arrive, mode: 'jump' as const },
            { from: land, to: land, departs: arrive, arrives: hop, mode: 'orbit' as const },
            { from: land, to: off, departs: hop, arrives: gone, mode: 'jump' as const },
        );
    }
    return placeShips([
        {
            id: 'stand-party', name: 'Far Margin', kind: 'party', shape: 'triangle',
            legs: [{ from: sys(hexKey, star.key), to: sys(hexKey, far.key), departs: partyFrom, arrives: partyTo, mode: 'flight' }],
        },
        {
            id: 'stand-vessel', name: 'Courier', kind: 'vessel', shape: 'circle',
            legs: [{ from: sys(hexKey, dock.key), to: sys(hexKey, dock.key), departs: heldFrom, arrives: heldTo, mode: 'docked' }],
        },
        {
            id: 'stand-square', name: 'Patrol', kind: 'traffic', shape: 'square',
            legs: [{ from: sys(hexKey, patrol.key), to: sys(hexKey, patrol.key), departs: heldFrom, arrives: heldTo, mode: 'orbit' }],
        },
        {
            id: 'stand-rect', name: 'Liner', kind: 'traffic', shape: 'rectangle',
            // Beside Courier, so two ships at one body can be seen.
            legs: [{ from: sys(hexKey, dock.key), to: sys(hexKey, dock.key), departs: heldFrom, arrives: heldTo, mode: 'docked' }],
        },
        { id: 'stand-jump-out', name: 'Outbound', kind: 'traffic', shape: 'triangle', legs: outbound },
        { id: 'stand-jump-in', name: 'Inbound', kind: 'traffic', shape: 'square', legs: inbound },
        surveyor(hexKey, dock.key, off),
    ], bodiesAt, days, pictureOf);
}

/**
 * Dev stand-in that flies from a body to a fixed point, holds there, jumps from the
 * point, and flies back. The point does not move. The dates sit on 137-1105, so a
 * picture at day 10 does not gain a ship.
 */
function surveyor(hexKey: string, bodyKey: string, away: CampaignAnchor): ShipTrack {
    const day = totalDays(1105, 137);
    const open: CampaignAnchor = { kind: 'system', hexKey, point: { x: 1.2, y: 0.8 } };
    const home = sys(hexKey, bodyKey);
    // Noon on 138-1105, then 30 seconds, so a link at 1200 is still holding when the page paints.
    const leave = day + 1.5 + 30 / 86400;
    const back = leave + 0.2;
    return {
        id: 'stand-surveyor', name: 'Surveyor', kind: 'vessel', shape: 'triangle',
        legs: [
            { from: home, to: open, departs: day, arrives: day + 1, mode: 'flight' },
            { from: open, to: open, departs: day + 1, arrives: leave, mode: 'orbit' },
            { from: open, to: away, departs: leave, arrives: back, mode: 'jump' },
            { from: away, to: open, departs: back, arrives: back + 0.2, mode: 'jump' },
            { from: open, to: open, departs: back + 0.2, arrives: day + 2, mode: 'orbit' },
            { from: open, to: home, departs: day + 2, arrives: day + 3, mode: 'flight' },
        ],
    };
}
