/**
 * The travelling transition between two layouts (campaign_manager_plan.md §7.8): the same
 * bodies in both pictures, so they travel instead of cutting. Every body moves from its
 * place in one picture to its place in the other on an in-out quintic, innermost first; a
 * body leaving an orbit curves away along it for the first fifth; orbit rings deform into
 * the line-up's arcs; what only one picture has fades out early or fades in late. Pure.
 */
import { placeWorld, type Hit, type Plan } from './layout.ts';
import {
    emptyLayer, type BandAt, type Caption, type JumpAt, type Panel, type PathAt, type Picture,
    type Rocks, type StarDraw, type WorldDraw,
} from './picture.ts';

/** §7.8.4: body i starts this long after body i − 1, the last no later than the cap. */
export const STAGGER_MS = 28;
export const STAGGER_CAP_MS = 220;
/** §7.8.3: the sideways reach of the curve a body leaves its orbit on, and the share of the move it lasts. */
export const UNSPOOL_PX = 12;
export const UNSPOOL_SPAN = 0.2;
/** What only the first picture has is gone by this share of the move; what only the second has starts at the other. */
export const FADE_OUT_BY = 0.3;
export const FADE_IN_FROM = 0.6;

/** Ease in and out, quintic: slow in, fast middle, soft landing. */
export function easeQuint(t: number): number {
    const x = Math.max(0, Math.min(1, t));
    return x < 0.5 ? 16 * x * x * x * x * x : 1 - Math.pow(-2 * x + 2, 5) / 2;
}

/** How long after the start body `index` of `count` sets off. */
export function staggerDelay(index: number, count: number): number {
    if (index <= 0 || count <= 1) return 0;
    return index * Math.min(STAGGER_MS, STAGGER_CAP_MS / (count - 1));
}

/** The whole move: the tween plus the last body's delay. */
export function moveDuration(ms: number, count: number): number {
    return ms <= 0 ? 0 : ms + staggerDelay(count - 1, count);
}

/** A body's eased progress, 0..1, at `elapsed` milliseconds into the move. */
export function bodyProgress(elapsed: number, delay: number, ms: number): number {
    if (ms <= 0) return 1;
    return easeQuint((elapsed - delay) / ms);
}

/** The sideways offset, in pixels, at progress u measured from the orbit end of the move. */
export function unspool(u: number): number {
    if (!(u > 0) || u >= UNSPOOL_SPAN) return 0;
    return UNSPOOL_PX * Math.sin(Math.PI * u / UNSPOOL_SPAN);
}

export function fadeOut(e: number): number {
    return Math.max(0, Math.min(1, 1 - e / FADE_OUT_BY));
}

export function fadeIn(e: number): number {
    return Math.max(0, Math.min(1, (e - FADE_IN_FROM) / (1 - FADE_IN_FROM)));
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** The order bodies set off in: the stars and worlds of a plan, innermost first. */
export function travelOrder(plan: Plan): Map<string, number> {
    const order = new Map<string, number>();
    const bodies: { key: string; au: number; rank: number }[] = [];
    for (const star of plan.stars) bodies.push({ key: star.key, au: star.index ? star.au : -1, rank: bodies.length });
    for (const world of plan.worlds) {
        const parent = world.star > 0 ? plan.stars[world.star] : undefined;
        bodies.push({ key: world.key, au: (parent ? parent.au : 0) + world.au * (parent ? 0.000001 : 1), rank: bodies.length });
    }
    bodies.sort((a, b) => a.au - b.au || a.rank - b.rank);
    bodies.forEach((body, i) => order.set(body.key, i));
    return order;
}

function flat(picture: Picture): {
    bands: BandAt[]; panels: Panel[]; jumps: JumpAt[]; paths: PathAt[]; rocks: Rocks[]; worlds: Map<string, WorldDraw>;
} {
    const out = { bands: [] as BandAt[], panels: [] as Panel[], jumps: [] as JumpAt[], paths: [] as PathAt[], rocks: [] as Rocks[], worlds: new Map<string, WorldDraw>() };
    for (const layer of picture.layers) {
        out.bands.push(...layer.bands);
        out.panels.push(...layer.panels);
        out.jumps.push(...layer.jumps);
        out.paths.push(...layer.paths);
        out.rocks.push(...layer.rocks);
        for (const world of layer.worlds) out.worlds.set(world.world.key, world);
    }
    return out;
}

export type BlendInput = {
    from: Picture;
    to: Picture;
    /** Milliseconds since the move began, and the tween's length (the stagger is added to it). */
    elapsed: number;
    ms: number;
    order: Map<string, number>;
    days: number;
    moonsShown: boolean;
};

/**
 * The picture part way from one layout to another. Bodies in both travel; moons ride their
 * world, placed afresh at its blended size; hit targets are the blended ones, so a card or a
 * lock follows a body as it travels.
 */
export function blendPictures(input: BlendInput): Picture {
    const { from, to, elapsed, ms, order } = input;
    const count = order.size;
    const total = moveDuration(ms, count);
    const whole = total > 0 ? easeQuint(elapsed / total) : 1;
    const progress = (key: string): number => bodyProgress(elapsed, staggerDelay(order.get(key) ?? 0, count), ms);
    const a = flat(from);
    const b = flat(to);
    const layer = emptyLayer();
    const hits: Hit[] = [];

    // What only one picture has: out early, in late.
    for (const band of a.bands) layer.bands.push({ ...band, alpha: band.alpha * fadeOut(whole) });
    for (const band of b.bands) layer.bands.push({ ...band, alpha: band.alpha * fadeIn(whole) });
    for (const jump of a.jumps) layer.jumps.push({ ...jump, alpha: jump.alpha * fadeOut(whole) });
    for (const jump of b.jumps) layer.jumps.push({ ...jump, alpha: jump.alpha * fadeIn(whole) });
    for (const rocks of a.rocks) layer.rocks.push({ ...rocks, alpha: rocks.alpha * fadeOut(whole) });
    for (const rocks of b.rocks) layer.rocks.push({ ...rocks, alpha: rocks.alpha * fadeIn(whole) });

    // Panels: the same body's panel slides between two line-ups; otherwise it fades.
    for (const panel of a.panels) {
        const match = b.panels.find((other) => other.key === panel.key);
        if (!match) { layer.panels.push({ ...panel, alpha: panel.alpha * fadeOut(whole) }); continue; }
        const e = progress(panel.key.slice(4));
        layer.panels.push({
            key: panel.key, x: lerp(panel.x, match.x, e), y: lerp(panel.y, match.y, e), w: lerp(panel.w, match.w, e),
            h: lerp(panel.h, match.h, e), radius: lerp(panel.radius, match.radius, e), alpha: lerp(panel.alpha, match.alpha, e),
        });
    }
    for (const panel of b.panels) {
        if (!a.panels.some((other) => other.key === panel.key)) layer.panels.push({ ...panel, alpha: panel.alpha * fadeIn(whole) });
    }

    // Paths: a body's orbit ring deforms into its line-up arc (§7.8.5); a dashed or belt ring
    // thins out as the plain arc comes in at the same, changing radius.
    const used = new Set<PathAt>();
    for (const path of a.paths) {
        const e = progress(path.key);
        const same = b.paths.find((other) => other.key === path.key && other.style === path.style);
        const any = same || b.paths.find((other) => other.key === path.key);
        if (!any) { layer.paths.push({ ...path, alpha: path.alpha * fadeOut(whole) }); continue; }
        const shape = { cx: lerp(path.cx, any.cx, e), cy: lerp(path.cy, any.cy, e), r: lerp(path.r, any.r, e) };
        if (same) {
            used.add(same);
            layer.paths.push({ ...path, ...shape, alpha: lerp(path.alpha, same.alpha, e), width: lerp(path.width, same.width, e), phase: lerp(path.phase, same.phase, e) });
            continue;
        }
        // §7.8.6: a belt's dashes thin and flow as its ring closes on the band's place.
        const thin = path.style === 'belt' ? lerp(path.width, 1.5, e) : path.width;
        layer.paths.push({ ...path, ...shape, alpha: path.alpha * (1 - e), width: thin, phase: path.phase - e * 60 });
        if (!used.has(any)) layer.paths.push({ ...any, ...shape, alpha: any.alpha * e });
        used.add(any);
    }
    for (const path of b.paths) {
        if (!used.has(path)) layer.paths.push({ ...path, alpha: path.alpha * fadeIn(whole) });
    }

    // Stars: the primary is the fixed point the eye keeps; it only eases, with no delay.
    const stars: StarDraw[] = [];
    for (const star of to.stars) {
        const source = from.stars.find((other) => other.star.key === star.star.key);
        if (!source) { stars.push(star); continue; }
        const e = progress(star.star.key);
        const r = lerp(source.r, star.r, e);
        const moved: StarDraw = {
            star: star.star, x: lerp(source.x, star.x, e), y: lerp(source.y, star.y, e), r,
            ringR: lerp(source.ringR, star.ringR, e), parentX: lerp(source.parentX, star.parentX, e), parentY: lerp(source.parentY, star.parentY, e),
            glow: lerp(source.glow, star.glow, e), label: source.label * fadeOut(e) + star.label * fadeIn(e),
        };
        stars.push(moved);
    }

    // Worlds: position and size travel; the moons are placed round the result.
    for (const [key, target] of b.worlds) {
        const source = a.worlds.get(key);
        if (!source) { layer.worlds.push(target); continue; }
        const e = progress(key);
        let x = lerp(source.x, target.x, e);
        let y = lerp(source.y, target.y, e);
        // §7.8.3: leaving an orbit, a body first runs on along it; arriving, it curves in.
        const orbital = from.orbital !== to.orbital ? (from.orbital ? source : target) : null;
        if (orbital) {
            const rx = orbital.x - orbital.starX;
            const ry = orbital.y - orbital.starY;
            const length = Math.hypot(rx, ry);
            const push = unspool(from.orbital ? e : 1 - e);
            if (length > 0 && push > 0) {
                x += (-ry / length) * push;
                y += (rx / length) * push;
            }
        }
        const z = lerp(source.z, target.z, e);
        const starX = lerp(source.starX, target.starX, e);
        const starY = lerp(source.starY, target.starY, e);
        const label = source.label * fadeOut(e) + target.label * fadeIn(e);
        const placed: WorldDraw = { ...placeWorld(target.world, x, y, z, input.days, starX, starY, hits, input.moonsShown), z, label };
        layer.worlds.push(placed);
    }
    for (const star of stars) hits.push({ kind: 'star', key: star.star.key, cx: star.x, cy: star.y, r: star.r + 8 * (star.r / (star.star.basePx || 1)), visualR: star.r });

    // Captions: the first picture's go early, the second's arrive late, where they will stay.
    const captions: Caption[] = [];
    for (const caption of from.captions) captions.push({ ...caption, alpha: caption.alpha * fadeOut(whole) });
    for (const caption of to.captions) captions.push({ ...caption, alpha: caption.alpha * fadeIn(whole) });

    return { mode: 'blend', orbital: false, z: lerp(from.z, to.z, whole), layers: [layer], stars, captions, hits, centre: null };
}
