/**
 * Between a track and the picture (K12 points 2 and 5): where an anchor is drawn on this
 * frame, and whether a mark stands outside every 100D circle. The circles are
 * orbit/layout.ts's, laid out for the frame's view, whatever the Jump layer shows. A mark
 * that sits on a body is inside that body's limit even when the ring was too small to be
 * laid out. Geometry only; no rule says when a ship may jump beyond "outside every circle".
 */
import type { CampaignAnchor } from '@voyage/shared';
import type { Hit, JumpRing, Scene } from './layout.ts';
import { dockedBeside, type BodiesAt, type BodyPoint, type PictureOf, type ShipMark } from './ships.ts';

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

/** How many tags stand at one body before the rest are counted in one more ("+3"). */
export const TAGS_SHOWN = 4;
/** The tag's box, as the planet's selection tag is drawn (OrbitRenderer: 34 px for two lines). */
export const TAG_HEIGHT = 34;
/** One tag under another: a tag's height and a little air. */
export const TAG_STEP = TAG_HEIGHT + 4;
/** The leader, as the planet's: out from the mark's corner 14 px on the diagonal, then 8 px level into the tag. (With the tags on, the renderer draws no small name beside the mark: Agent A's `shipTags` switch.) */
export const TAG_CORNER = 5;
export const TAG_LEAD = 14;
export const TAG_RUN = 8;

export type ShipTag = Pick<ShipMark, 'id' | 'name' | 'kind' | 'shape'> & {
    /** The ship's designator on the picture: where the leader starts. */
    markX: number;
    markY: number;
    /** The leader's knee, and so the tag's height on the picture. */
    kneeX: number;
    kneeY: number;
    /** The tag's left edge (its middle is at kneeY). */
    x: number;
    /** Docked at, or in orbit round, this body; null under way or holding at a point. */
    bodyKey: string | null;
};

export type TagsMore = { bodyKey: string; count: number; x: number; kneeX: number; kneeY: number; markX: number; markY: number };

/**
 * Where every ship's tag stands (Johnny, 2026-10-06: "I want the ship tag to look like the
 * planet select tag … it's nearly impossible to see right now"). Every ship on the picture
 * has one; a jump's report is not a ship and has none.
 *
 * A ship at a body (a mark with no heading within ON_BODY_PX of a star, world or moon, the
 * renderer's own test) has its designator where the renderer draws it (orbit/ships.ts
 * dockedBeside, in id order), and the tag's leader starts there. Any other ship's leader
 * starts at its mark. **The rule that keeps tags apart:** a planet's selection tag goes up
 * and to the right of the planet; a ship's tag always hangs **down and to the right** of
 * its mark, and never changes side, so it does not flip while the ship moves and cannot
 * meet the tag of the body it is at. Ships at one body stack straight down from the first
 * tag, each on its own leader; past TAGS_SHOWN the rest are one count, unless that body's
 * stack is opened.
 */
export function shipTags(marks: readonly ShipMark[], hits: readonly Hit[], opened: ReadonlySet<string> = new Set()): { tags: ShipTag[]; more: TagsMore[] } {
    const bodies = hits.filter((hit) => hit.kind === 'star' || hit.kind === 'world' || hit.kind === 'moon');
    const at = new Map<string, { hit: Hit; ships: ShipMark[] }>();
    const tags: ShipTag[] = [];
    const more: TagsMore[] = [];
    const knee = (x: number, y: number): { kneeX: number; kneeY: number; x: number } => ({ kneeX: x + TAG_CORNER + TAG_LEAD, kneeY: y + TAG_CORNER + TAG_LEAD, x: x + TAG_CORNER + TAG_LEAD + TAG_RUN });
    for (const mark of marks) {
        if (mark.jump) continue;
        let found: Hit | null = null;
        if (typeof mark.heading !== 'number') {
            let best = ON_BODY_PX * ON_BODY_PX;
            for (const hit of bodies) {
                const d = (mark.x - hit.cx) ** 2 + (mark.y - hit.cy) ** 2;
                if (d <= best) {
                    best = d;
                    found = hit;
                }
            }
        }
        if (!found) {
            tags.push({ id: mark.id, name: mark.name, kind: mark.kind, shape: mark.shape, markX: mark.x, markY: mark.y, ...knee(mark.x, mark.y), bodyKey: null });
            continue;
        }
        const group = at.get(found.key);
        if (group) group.ships.push(mark);
        else at.set(found.key, { hit: found, ships: [mark] });
    }
    for (const [bodyKey, group] of at) {
        const ships = group.ships.slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
        const radius = group.hit.visualR ?? group.hit.r;
        const first = dockedBeside({ x: group.hit.cx, y: group.hit.cy }, radius, 0);
        const top = knee(first.x, first.y);
        const all = opened.has(bodyKey) || ships.length <= TAGS_SHOWN;
        const shown = all ? ships.length : TAGS_SHOWN;
        for (let i = 0; i < shown; i += 1) {
            const ship = ships[i];
            const beside = dockedBeside({ x: group.hit.cx, y: group.hit.cy }, radius, i);
            tags.push({ id: ship.id, name: ship.name, kind: ship.kind, shape: ship.shape, markX: beside.x, markY: beside.y, kneeX: top.kneeX, kneeY: top.kneeY + i * TAG_STEP, x: top.x, bodyKey });
        }
        if (!all) {
            const beside = dockedBeside({ x: group.hit.cx, y: group.hit.cy }, radius, shown);
            more.push({ bodyKey, count: ships.length - shown, x: top.x, kneeX: top.kneeX, kneeY: top.kneeY + shown * TAG_STEP, markX: beside.x, markY: beside.y });
        }
    }
    return { tags, more };
}

/** What a press on the picture means. */
export type PressMeans =
    | { kind: 'ship'; id: string }
    | { kind: 'grab'; from: 'route' | 'preview'; index: number }
    | { kind: 'waypoint'; key: string }
    | { kind: 'point' }
    | { kind: 'body'; key: string }
    | { kind: 'nothing' };

/**
 * The one rule for a press on the picture (Johnny, 2026-10-06: "Ship not being selected on
 * click"). **A ship under the press is always that ship**, in or out of plotting: it is
 * never a waypoint, and never the body it stands beside. Then an existing waypoint, which
 * is picked up and never has a second point laid on it. Only then does plotting decide:
 * while plotting, a body under the press, or one within the readout's snap of it, is a
 * waypoint, and open picture is a point; otherwise a body is a selection and open picture
 * is nothing.
 */
export function pressMeans(under: {
    ship: string | null;
    body: string | null;
    beside: string | null;
    plotting: boolean;
    waypoint?: { from: 'route' | 'preview'; index: number } | null;
}): PressMeans {
    if (under.ship) return { kind: 'ship', id: under.ship };
    if (under.waypoint) return { kind: 'grab', from: under.waypoint.from, index: under.waypoint.index };
    if (under.plotting) {
        const key = under.body ?? under.beside;
        return key ? { kind: 'waypoint', key } : { kind: 'point' };
    }
    return under.body ? { kind: 'body', key: under.body } : { kind: 'nothing' };
}

/**
 * Laying continues after a press in open space. A body arrival and a right-click end it.
 * The right-click is this one false. To add the course on right-click instead, call
 * addCourse() where the caller stops because this returned false.
 */
export function layingContinues(press: 'body' | 'space' | 'right'): boolean {
    return press === 'space';
}

/** What the live plotter has under the pointer: a body, a point in AU, a ship (a press takes it), an existing waypoint, or nothing the picture can answer. */
export type PlotHover =
    | { key: string }
    | { point: { x: number; y: number } }
    | { ship: string }
    | { blank: true }
    | { grab: { from: 'route' | 'preview'; index: number } };

/** Whether two readings are the same place, so a still pointer says nothing twice. */
export function sameHover(a: PlotHover | null, b: PlotHover | null): boolean {
    if (a === null || b === null) return a === b;
    if ('grab' in a) return 'grab' in b && a.grab.from === b.grab.from && a.grab.index === b.grab.index;
    if ('key' in a) return 'key' in b && a.key === b.key;
    if ('ship' in a) return 'ship' in b && a.ship === b.ship;
    if ('blank' in a) return 'blank' in b;
    return 'point' in b && a.point.x === b.point.x && a.point.y === b.point.y;
}

/** One ship tag, or a "+N more" tag, as a box the readout keeps clear of. Picture pixels, origin top-left. */
export function tagBoxes(
    tags: readonly { id: string; name: string; x: number; kneeY: number }[],
    more: readonly { count: number; x: number; kneeY: number }[],
    notes: Readonly<Record<string, string>>,
    measure: (text: string, font: string) => number,
    fontCode: string,
): { x: number; y: number; w: number; h: number }[] {
    const nameFont = '700 11px ' + fontCode;
    const noteFont = '400 10px ' + fontCode;
    const box = (text: string, note: string, x: number, kneeY: number): { x: number; y: number; w: number; h: number } => {
        const nameW = measure(text.toUpperCase(), nameFont);
        const noteW = Math.min(220, note ? measure(note, noteFont) : 0);
        return { x, y: kneeY - 17, w: Math.max(nameW, noteW) + 18, h: TAG_HEIGHT };
    };
    return [
        ...tags.map((tag) => box(tag.name, notes[tag.id] ?? '', tag.x, tag.kneeY)),
        ...more.map((item) => box('+' + item.count, 'more here', item.x, item.kneeY)),
    ];
}
