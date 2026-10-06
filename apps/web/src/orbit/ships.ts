/**
 * Ship marks on the orbit picture. Placement only: a track says where a ship is,
 * and the picture says where that body is drawn. Nothing here is a travel rule.
 * Agent D feeds real tracks; the stand-in is dev-only.
 */
import type { CampaignAnchor } from '@voyage/shared';
import { positionAt } from '../campaign/track.ts';
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
    /** The mark the distance is measured from. */
    from?: BodyPoint | null;
};

const sys = (hexKey: string, bodyKey: string): CampaignAnchor => ({ kind: 'system', hexKey, bodyKey });

/**
 * Where each track's ship is at `days`.
 * An anchor sits on that body. A flight or a jump in progress is the straight
 * line between the two bodies' positions at that date, by the leg's fraction.
 */
export function placeShips(tracks: readonly ShipTrack[], bodiesAt: BodiesAt, days: number): ShipMark[] {
    const marks: ShipMark[] = [];
    for (const track of tracks) {
        const at = positionAt(track.legs, days);
        if (!at) continue;
        if ('fraction' in at) {
            const from = bodiesAt(at.leg.from, days);
            const to = bodiesAt(at.leg.to, days);
            if (!from || !to) continue;
            const x = from.x + (to.x - from.x) * at.fraction;
            const y = from.y + (to.y - from.y) * at.fraction;
            const dx = to.x - from.x;
            const dy = to.y - from.y;
            const mark: ShipMark = { id: track.id, name: track.name, kind: track.kind, shape: track.shape, x, y };
            if (dx !== 0 || dy !== 0) mark.heading = Math.atan2(dy, dx);
            marks.push(mark);
            continue;
        }
        const point = bodiesAt(at, days);
        if (!point) continue;
        marks.push({ id: track.id, name: track.name, kind: track.kind, shape: track.shape, x: point.x, y: point.y });
    }
    return marks;
}

/** One line: picture coordinates, then the distance from `from` when a mark was given. */
export function plotText(plot: PlotReadout): string {
    const line = plot.x.toFixed(1) + ', ' + plot.y.toFixed(1);
    if (!plot.from) return line;
    const distance = Math.hypot(plot.x - plot.from.x, plot.y - plot.from.y);
    return line + '  ' + distance.toFixed(1);
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
 * Four fixed ships so the designators can be seen. The party's triangle is
 * halfway from the primary to the furthest body; the others sit on bodies.
 * Dates on the legs are taken from `days`, so the marks show at any clock.
 */
export function standInMarks(hexKey: string, days: number, picture: Picture): ShipMark[] {
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
    const linerFrom = rest[2] ?? patrol;
    const linerTo = rest[3] ?? far;
    const bodiesAt: BodiesAt = (anchor) => {
        if (!anchor || anchor.kind !== 'system' || anchor.hexKey !== hexKey || !anchor.bodyKey) return null;
        const body = byKey.get(anchor.bodyKey);
        return body ? { x: body.x, y: body.y } : null;
    };
    const span = 1;
    const heldFrom = Math.min(0, days);
    const heldTo = Math.max(days, 0) + span;
    return placeShips([
        {
            id: 'stand-party', name: 'Far Margin', kind: 'party', shape: 'triangle',
            legs: [{ from: sys(hexKey, star.key), to: sys(hexKey, far.key), departs: days - span, arrives: days + span, mode: 'flight' }],
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
            legs: [{ from: sys(hexKey, linerFrom.key), to: sys(hexKey, linerTo.key), departs: days - span, arrives: days + span, mode: 'jump' }],
        },
    ], bodiesAt, days);
}
