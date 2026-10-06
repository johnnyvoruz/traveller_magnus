/**
 * Between a track and the picture (K12 points 2 and 5): where an anchor is drawn on this
 * frame, and whether a mark stands outside every 100D circle. The circles are
 * orbit/layout.ts's, laid out for the frame's view, whatever the Jump layer shows. A mark
 * that sits on a body is inside that body's limit even when the ring was too small to be
 * laid out. Geometry only; no rule says when a ship may jump beyond "outside every circle".
 */
import type { CampaignAnchor } from '@voyage/shared';
import type { JumpRing } from './layout.ts';
import type { BodiesAt, BodyPoint, ShipMark } from './ships.ts';

export type PictureBodyPoint = BodyPoint & { key: string; main: boolean };

/** An anchor in this system is its body, or the mainworld when it names none; another system is not here. */
export function bodiesAtOf(hexKey: string, bodies: readonly PictureBodyPoint[]): BodiesAt {
    const byKey = new Map(bodies.map((body) => [body.key, body]));
    const main = bodies.find((body) => body.main) ?? null;
    return (anchor: CampaignAnchor) => {
        if (!anchor || anchor.kind !== 'system' || anchor.hexKey !== hexKey) return null;
        const body = anchor.bodyKey ? byKey.get(anchor.bodyKey) ?? null : main;
        return body ? { x: body.x, y: body.y } : null;
    };
}

export type ShipStanding = {
    x: number;
    y: number;
    outside: boolean;
    /** What holds it inside: the first circle it lies in, or 'body' when it sits on one; null when outside. */
    within: JumpRing | 'body' | null;
};

/** A mark closer than this to a body's centre is on it. Picture units. */
export const ON_BODY_PX = 1.5;

/** The mark's place and whether it lies outside every 100D circle and off every body. */
export function shipStanding(mark: Pick<ShipMark, 'x' | 'y'>, rings: readonly JumpRing[], bodies: readonly BodyPoint[]): ShipStanding {
    const ring = rings.find((item) => Math.hypot(mark.x - item.cx, mark.y - item.cy) <= item.r) ?? null;
    const onBody = bodies.some((body) => Math.hypot(mark.x - body.x, mark.y - body.y) <= ON_BODY_PX);
    const within = ring ?? (onBody ? 'body' : null);
    return { x: mark.x, y: mark.y, outside: within === null, within };
}

/**
 * A ship among the frame's marks. A mark with `jump` set is the renderer's bubble (where a
 * ship left, or where it will arrive), not a ship on the picture: it is passed over, so a
 * ship in jump is never measured against the 100D circles and never plotted from.
 */
export function shipMarkOf<M extends Pick<ShipMark, 'id' | 'jump'>>(marks: readonly M[], id: string): M | undefined {
    return marks.find((mark) => mark.id === id && !mark.jump);
}
