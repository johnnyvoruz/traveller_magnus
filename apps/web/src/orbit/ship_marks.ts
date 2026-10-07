/**
 * Between a track and the picture (K12 points 2 and 5): where an anchor is drawn on this
 * frame, and whether a mark stands outside every 100D circle. The circles are
 * orbit/layout.ts's, laid out for the frame's view, whatever the Jump layer shows. A mark
 * that sits on a body is inside that body's limit even when the ring was too small to be
 * laid out. Geometry only; no rule says when a ship may jump beyond "outside every circle".
 */
import type { CampaignAnchor } from '@voyage/shared';
import type { JumpRing, Scene } from './layout.ts';
import type { BodiesAt, BodyPoint, PictureOf, ShipMark } from './ships.ts';

export type PictureBodyPoint = BodyPoint & { key: string; main: boolean };

/** The bodies of this system as they are drawn at a date, in the frame's view. */
export type BodiesOn = (days: number) => readonly PictureBodyPoint[];

/**
 * Where an anchor is drawn at a date. In this system: a point in open space is the picture
 * of that AU (it does not move, so the date is not asked); a body is that body **at that
 * date**; an anchor that names neither is the mainworld at that date. Another system, a
 * record and nothing are not on this picture.
 *
 * The mainworld for a bare system anchor is kept on purpose: a ship that jumped in arrives
 * at "the Feri system" with no body named, the party's marker stands on the hex for the same
 * reason, and a ship has to be drawn somewhere. It is a convention of the drawing; no rule
 * says where a ship comes out.
 */
export function bodiesAtOf(hexKey: string, bodiesOn: BodiesOn, pointOn?: PictureOf): BodiesAt {
    return (anchor: CampaignAnchor, days: number) => {
        if (!anchor || anchor.kind !== 'system' || anchor.hexKey !== hexKey) return null;
        if (anchor.point && !anchor.bodyKey) return pointOn ? pointOn(anchor.point) : null;
        const bodies = bodiesOn(days);
        const body = anchor.bodyKey ? bodies.find((item) => item.key === anchor.bodyKey) : bodies.find((item) => item.main);
        return body ? { x: body.x, y: body.y } : null;
    };
}

/** A laid-out scene (orbit/layout.ts layoutScene) as the list the anchors are looked up in, the mainworld flagged. */
export function sceneBodies(scene: Scene): PictureBodyPoint[] {
    const out: PictureBodyPoint[] = [];
    for (const star of scene.stars) out.push({ key: star.star.key, x: star.x, y: star.y, main: false });
    const sets = [scene.primary, ...scene.companions.map((companion) => companion.set)];
    for (const set of sets) {
        if (!set) continue;
        for (const at of set.bodies) {
            out.push({ key: at.world.key, x: at.x, y: at.y, main: at.world.mainworld || at.world.mainworldBelt });
            for (const moon of at.moons) out.push({ key: moon.moon.key, x: moon.x, y: moon.y, main: moon.moon.mainworld });
        }
    }
    return out;
}

/** How many dated layouts are kept: a ship in flight asks for two (its leg's ends), so this is eight ships' worth. */
export const DATED_LAYOUTS = 16;

/**
 * The bodies at dates other than the frame's, laid out once and kept. A flight's two dates
 * are fixed moments, so while the camera is still they are laid out once for as long as
 * the flight is on the picture. The layouts are kept **until the signature changes** (the
 * view: its size, zoom, offset and layers; and the system), and the oldest date goes when
 * more than DATED_LAYOUTS are held. The frame's own date is never laid out here: the caller
 * answers that from the picture it has already drawn.
 */
export function datedBodies(layout: (days: number) => readonly PictureBodyPoint[]): { on: (signature: string, days: number) => readonly PictureBodyPoint[]; size: () => number } {
    let held = '';
    const kept = new Map<number, readonly PictureBodyPoint[]>();
    return {
        on(signature, days) {
            if (signature !== held) {
                held = signature;
                kept.clear();
            }
            const found = kept.get(days);
            if (found) return found;
            const made = layout(days);
            kept.set(days, made);
            if (kept.size > DATED_LAYOUTS) {
                const oldest = kept.keys().next().value;
                if (oldest !== undefined) kept.delete(oldest);
            }
            return made;
        },
        size: () => kept.size,
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
