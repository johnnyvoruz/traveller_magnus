/**
 * The orbit picture's layout: where every body sits and how large it is drawn, for one
 * system, one date and one camera. Ported from js/system_viewer.js; each function names its
 * legacy lines. State the legacy functions closed over (the zoom scale, the canvas size, the
 * hex id, the linear-scale flag) arrives as an argument. Pure: no canvas, no DOM.
 *
 * Bodies are named by the dossier's keys (bodyKeys in dossier/model.ts). The epochs keep the
 * legacy indices (the place in the non-Empty world list, the place in the non-Empty moon
 * list), so a key and an epoch name the same body without a second scheme.
 */
import { bodyKeys } from '../dossier/model.ts';
import { shortLabel } from './bodies.ts';
import { highportOf, highportPeriodYears, type Port } from './highport.ts';
import {
    bodyAngle, hashEpoch, keplerYears, moonBasePx, moonPeriodYears, orbitToAU, scaleR,
    starBasePx, starCompanionAU, worldBasePx, worldPeriodYears,
} from './maths.ts';

type Bag = Record<string, any>;

/** js/system_viewer.js:141. */
export const AU_KM = 149597870.7;
/** js/system_viewer.js:140. */
export const SUN_DIAM_KM = 1392700;
/** js/system_viewer.js:57. A ring wider than this is not stroked. */
export const MAX_RING_RADIUS = 80000;
/** js/system_viewer.js:243. */
export const RING_OUTER = 2.05;
/** js/system_viewer.js:2795. */
export const STAGE_MARGIN = 70;
/** js/system_viewer.js:2806-2808. */
export const COMPANION_MIN_PX = 20;
export const COMPANION_ABS_MIN = 4;
export const COMPANION_GAP = 3;
/** js/system_viewer.js:2911-2912. The band runs from 0.70 to 1.55 of the zone's centre. */
export const HZ_INNER = 0.70;
export const HZ_OUTER = 1.55;
export const HZ_LABEL = 'HABITABLE ZONE';
export const JUMP_LABEL = '100D jump';

// ---- Sizes ---------------------------------------------------------------------------

/** js/system_viewer.js:168-177, orbits layout. Fit measures at scale 1. */
export function zoomScale(viewZoom: number, fitZoom: number, fitting: boolean): number {
    if (fitting) return 1;
    return Math.max(1, viewZoom / (fitZoom || 1));
}

/** js/system_viewer.js:223-225. */
export function starBodyRadius(star: Bag | null | undefined, z: number): number {
    return starBasePx(star) * z;
}

/** js/system_viewer.js:227-229. */
export function worldBodyRadius(world: Bag | null | undefined, z: number): number {
    return worldBasePx(world) * z;
}

/** js/system_viewer.js:231-233. */
export function satelliteRadius(moon: Bag | null | undefined, z: number): number {
    return moonBasePx(moon) * z;
}

/** js/system_viewer.js:237-239. The radius an orbit starts at, clear of the star's disc. */
export function orbitHole(starRadiusPx: number, z: number): number {
    return (starRadiusPx || 0) + 14 * z;
}

/** js/system_viewer.js:244-246, with moons shown. */
export function hasRings(world: Bag | null | undefined): boolean {
    return !!world && ((world.rings || []).length > 0 || (world.moons || []).some((m: Bag) => m.size === 'R'));
}

/** js/system_viewer.js:247-250. */
export function moonOrbitRadius(planetR: number, index: number, ringed: boolean, z: number): number {
    const base = ringed ? planetR * (RING_OUTER + 0.1) : planetR;
    return base + (10 + index * 6) * z;
}

/** js/system_viewer.js:253-255. */
export function ringOrbitRadius(planetR: number, index: number, count = 1): number {
    return planetR * (1.3 + 0.7 * (index + 1) / (count + 1));
}

/** js/system_viewer.js:344-348. Room granted to a companion's own planets. */
export function subSystemRadius(star: Bag | null | undefined, orbitR: number, z: number): number {
    const needed = orbitHole(starBodyRadius(star, z), z) / 0.58;
    const share = (orbitR || 0) * 0.28;
    return Math.max(share, needed);
}

/** js/system_viewer.js:2469-2474. A star's habitable-zone centre in AU, or null. */
export function starHzAU(sys: Bag | null | undefined, starIndex = 0): number | null {
    if (!sys) return null;
    if (!starIndex) return Number.isFinite(sys.hzAU) ? sys.hzAU : null;
    const lum = Number(sys.stars?.[starIndex]?.lum);
    return Number.isFinite(lum) && lum > 0 ? Math.sqrt(lum) : null;
}

/** js/system_viewer.js:3042-3047. A size-0 mainworld is drawn as a belt. */
export function isMainworldBelt(w: Bag): boolean {
    if (w.type !== 'Mainworld') return false;
    if (w.size === 0) return true;
    if (w.uwp && w.uwp[1] === '0') return true;
    return false;
}

// ---- The 100-diameter limit ------------------------------------------------------------

/** js/system_viewer.js:3050-3052. */
export function hundredDau(diamKm: number | null | undefined): number {
    return diamKm != null && diamKm > 0 ? (100 * diamKm) / AU_KM : 0;
}

/** js/system_viewer.js:3054-3056. */
export function starHundredDau(s: Bag | null | undefined): number {
    return hundredDau(s && s.diam > 0 ? s.diam * SUN_DIAM_KM : 0);
}

/** js/system_viewer.js:3060-3065. Pixel radius of deltaAu around a body that sits at au. */
export function hundredDpx(au: number, deltaAu: number, maxAU: number, maxPx: number, hole: number, linear: boolean): number {
    if (!(deltaAu > 0)) return 0;
    const outer = scaleR((au || 0) + deltaAu, maxAU, maxPx, hole, linear);
    const inner = scaleR(au || 0, maxAU, maxPx, hole, linear);
    return Math.abs(outer - inner);
}

/** js/system_viewer.js:3071-3075. A star's ring is lifted clear of its drawn corona. */
export function visibleJumpRadius(truePx: number, starRadiusPx: number): number {
    return Math.max(truePx || 0, starRadiusPx * 1.62);
}

export type JumpRing = { cx: number; cy: number; r: number; label: string };

/** js/system_viewer.js:3079-3081. */
export function jumpCircleContains(outer: JumpRing, inner: JumpRing): boolean {
    return Math.hypot(outer.cx - inner.cx, outer.cy - inner.cy) + inner.r <= outer.r + 1;
}

/** js/system_viewer.js:3083-3087. A circle wholly inside a larger one is dropped. */
export function visibleJumpCircles(rings: JumpRing[]): JumpRing[] {
    return rings.filter((inner, i) => !rings.some((outer, j) => j !== i && outer.r > inner.r && jumpCircleContains(outer, inner)));
}

// ---- Circles against the canvas ----------------------------------------------------------

/**
 * js/system_viewer.js:3093-3111. The part of a circle that can reach a w × h canvas, as
 * [start, end] angles, or null when none of it can.
 */
export function arcSpan(cx: number, cy: number, r: number, w: number, h: number, margin = 6): [number, number] | null {
    const near = Math.hypot(cx - Math.max(0, Math.min(w, cx)), cy - Math.max(0, Math.min(h, cy)));
    const far = Math.max(Math.hypot(cx, cy), Math.hypot(cx - w, cy), Math.hypot(cx, cy - h), Math.hypot(cx - w, cy - h));
    if (r + margin < near || r - margin > far) return null;
    const inside = cx >= 0 && cx <= w && cy >= 0 && cy <= h;
    if (inside || r < 3000) return [0, Math.PI * 2];
    const mid = Math.atan2(h / 2 - cy, w / 2 - cx);
    let lo = 0;
    let hi = 0;
    for (const [x, y] of [[0, 0], [w, 0], [0, h], [w, h]] as const) {
        const d = Math.atan2(y - cy, x - cx) - mid;
        const wrapped = Math.atan2(Math.sin(d), Math.cos(d));
        lo = Math.min(lo, wrapped);
        hi = Math.max(hi, wrapped);
    }
    const pad = margin / r + 0.002;
    return [mid + lo - pad, mid + hi + pad];
}

/** js/system_viewer.js:3141-3158. 0 outside the parent's shadow, 1 deep inside it. */
export function shadowCover(bx: number, by: number, px: number, py: number, parentR: number, starX: number, starY: number): number {
    const sx = starX - bx;
    const sy = starY - by;
    const seg2 = sx * sx + sy * sy;
    if (seg2 < 4) return 0;
    const t = ((px - bx) * sx + (py - by) * sy) / seg2;
    if (t <= 0 || t >= 1) return 0;
    const qx = bx + t * sx;
    const qy = by + t * sy;
    const miss = Math.hypot(px - qx, py - qy);
    const margin = Math.max(3, parentR * 0.45);
    const outer = parentR + margin;
    if (miss >= outer) return 0;
    const inner = Math.max(0, parentR * 0.45);
    if (miss <= inner) return 1;
    const u = (outer - miss) / (outer - inner);
    return u * u * (3 - 2 * u);
}

/**
 * js/system_viewer.js:274-285. The mainworld mark: a five-point star over a small disc, a
 * badge on the rim once the disc is large.
 */
export function mainworldMark(x: number, y: number, bodyR: number, z: number): { x: number; y: number; outer: number; inner: number } {
    let outer = Math.min(Math.max(3.5, 4.5 * z), Math.max(3, bodyR * 0.45));
    let cx = x;
    let cy = y;
    if (bodyR > 16) {
        outer = 8;
        cx = x + bodyR * 0.74;
        cy = y - bodyR * 0.74;
    }
    return { x: cx, y: cy, outer, inner: outer * 0.38 };
}

// ---- The plan: everything about a system that does not change with the date or the camera ----

export type Tone = 'gasLarge' | 'gasMedium' | 'gasSmall' | 'belt' | 'world';

export type PlanStar = {
    key: string;
    index: number;
    body: Bag;
    basePx: number;
    name: string;
    /** Shown under a companion's name (js/system_viewer.js:3446). */
    separation: string;
    parent: number;
    /** Companions only: the orbit in AU, its period in years and its start angle. */
    au: number;
    period: number;
    epoch: number;
    /** The 100-diameter limit in AU. */
    jumpAU: number;
};

export type PlanMoon = {
    key: string;
    body: Bag;
    /** Place among the world's non-Empty moons: the legacy epoch and spacing index. */
    index: number;
    /** A ring listed as a moon (size R): drawn as a circle, never as a disc. */
    ring: boolean;
    /** Place among the world's ring moons. */
    ringIndex: number;
    basePx: number;
    period: number;
    epoch: number;
    mainworld: boolean;
    name: string;
    /** The highport, where the body's starport profile has one. */
    port: Port | null;
    portPeriod: number;
};

export type PlanWorld = {
    key: string;
    body: Bag;
    /** Place in the non-Empty world list: the legacy epoch index. */
    index: number;
    /** The star whose set draws this world, or -1 when no set does. */
    star: number;
    au: number;
    belt: boolean;
    mainworld: boolean;
    mainworldBelt: boolean;
    tone: Tone;
    basePx: number;
    period: number;
    epoch: number;
    jumpAU: number;
    ringed: boolean;
    moons: PlanMoon[];
    ringMoons: number;
    /** Entries of world.rings: they have no dossier key and select their world. */
    rings: number;
    name: string;
    port: Port | null;
    portPeriod: number;
};

export type Plan = {
    hexKey: string;
    name: string;
    sys: Bag;
    stars: PlanStar[];
    worlds: PlanWorld[];
    /** worlds drawn round each star, by star index. sets[0] is the primary's. */
    sets: PlanWorld[][];
    maxAU: number;
    hzAU: number;
    /** True when anything orbits: more than one star, or a world with au > 0 (5146). */
    hasOrbits: boolean;
    /** Every highport in the hex shares one start angle and one light phase (4427, 4463). */
    portEpoch: number;
    portPhase: number;
};

/** js/system_viewer.js:264-271. */
function toneOf(w: Bag): Tone {
    if (w.type === 'Gas Giant') {
        if (w.ggType === 'GL') return 'gasLarge';
        if (w.ggType === 'GM') return 'gasMedium';
        return 'gasSmall';
    }
    if (w.type === 'Planetoid Belt') return 'belt';
    return 'world';
}

function isBag(value: unknown): value is Bag {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Reads a normalised system once. hexKey is the route's (`Spinward_Marches/1910`); the model
 * does not carry it. The keys are taken from bodyKeys in its own order, not rebuilt here.
 */
export function planSystem(sys: Bag, hexKey: string): Plan {
    const keys = bodyKeys(sys);
    let at = 0;
    const rawStars: Bag[] = Array.isArray(sys.stars) ? sys.stars : [];
    const stars: PlanStar[] = rawStars.map((body, index) => {
        const key = keys[at++] || '';
        const parent = body.parentStarIdx ?? 0;
        const au = index ? starCompanionAU(body) : 0;
        const parentMass = (rawStars[parent] || {}).mass || 1;
        return {
            key,
            index,
            body,
            basePx: starBasePx(body),
            name: String(body.name || ''),
            separation: index && body.separation ? String(body.separation) : '',
            parent,
            au,
            // js/system_viewer.js:2850-2851.
            period: index ? (body.periodYears || keplerYears(Math.max(au, 0.05), parentMass)) : 1,
            epoch: index ? hashEpoch(hexKey + ':star:' + index) : 0,
            jumpAU: starHundredDau(body),
        };
    });

    const worlds: PlanWorld[] = [];
    const sets: PlanWorld[][] = stars.map(() => []);
    const rawWorlds: unknown[] = Array.isArray(sys.worlds) ? sys.worlds : [];
    for (const raw of rawWorlds) {
        if (!isBag(raw) || raw.type === 'Empty') continue;
        const key = keys[at++] || '';
        const index = worlds.length;
        // js/system_viewer.js:2800-2803 (the primary's set) and 2968-2970 (a companion's).
        let star = -1;
        if (raw.orbitType === 'P-Type' || (raw.orbitType === 'S-Type' && (raw.parentStarIdx === 0 || raw.parentStarIdx === undefined))) star = 0;
        else if (raw.orbitType === 'S-Type' && raw.parentStarIdx > 0 && raw.parentStarIdx < stars.length) star = raw.parentStarIdx;
        const starMass = star >= 0 ? ((rawStars[star] || {}).mass || 1) : 1;
        const mainworldBelt = isMainworldBelt(raw);
        const moons: PlanMoon[] = [];
        let ringMoons = 0;
        const rawMoons: unknown[] = Array.isArray(raw.moons) ? raw.moons : [];
        for (const item of rawMoons) {
            if (!isBag(item) || item.type === 'Empty') continue;
            const moonKey = keys[at++] || '';
            const mi = moons.length;
            const ring = item.size === 'R';
            moons.push({
                key: moonKey,
                body: item,
                index: mi,
                ring,
                ringIndex: ring ? ringMoons : -1,
                basePx: moonBasePx(item),
                period: moonPeriodYears(item, raw),
                epoch: hashEpoch(hexKey + ':moon:' + index + ':' + mi),
                mainworld: item.type === 'Mainworld',
                name: String(item.name || ''),
                port: ring ? null : highportOf(item),
                portPeriod: highportPeriodYears(item),
            });
            if (ring) ringMoons += 1;
        }
        const world: PlanWorld = {
            key,
            body: raw,
            index,
            star,
            au: raw.au || 0,
            belt: raw.type === 'Planetoid Belt' || mainworldBelt,
            mainworld: raw.type === 'Mainworld',
            mainworldBelt,
            tone: toneOf(raw),
            basePx: worldBasePx(raw),
            period: worldPeriodYears(raw, starMass),
            epoch: hashEpoch(hexKey + ':world:' + index),
            jumpAU: hundredDau(raw.diamKm),
            ringed: hasRings(raw),
            moons,
            ringMoons,
            rings: Array.isArray(raw.rings) ? raw.rings.length : 0,
            name: String(raw.name || ''),
            port: raw.type === 'Planetoid Belt' || mainworldBelt ? null : highportOf(raw),
            portPeriod: highportPeriodYears(raw),
        };
        worlds.push(world);
        if (star >= 0) (sets[star] as PlanWorld[]).push(world);
    }

    // js/system_viewer.js:2785-2791.
    let maxAU = 1;
    for (const w of worlds) if (w.au > maxAU) maxAU = w.au;
    for (const s of stars) if (s.index && s.au > maxAU) maxAU = s.au;
    maxAU = Math.max(maxAU * 1.18, 2);

    return {
        hexKey,
        name: String(sys.name || ''),
        sys,
        stars,
        worlds,
        sets,
        maxAU,
        // js/system_viewer.js:2910.
        hzAU: sys.hzAU !== undefined ? sys.hzAU : orbitToAU(sys.hzco || 3),
        hasOrbits: stars.length > 1 || worlds.some((w) => w.au > 0),
        portEpoch: hashEpoch(hexKey + ':highport'),
        portPhase: hashEpoch(hexKey + ':highport:lights'),
    };
}

/** js/system_viewer.js:5237-5258. The bodies framed with a focus: itself, and what orbits it. */
export function localKeys(plan: Plan, key: string): Set<string> {
    const set = new Set<string>([key]);
    const star = plan.stars.find((s) => s.key === key);
    if (star) {
        // 5241-5245: the primary takes every world without a companion parent.
        const worlds = star.index === 0
            ? plan.worlds.filter((w) => w.body.orbitType === 'P-Type' || w.body.parentStarIdx === 0 || w.body.parentStarIdx === undefined)
            : plan.worlds.filter((w) => w.body.orbitType === 'S-Type' && w.body.parentStarIdx === star.index);
        for (const w of worlds) {
            set.add(w.key);
            for (const m of w.moons) set.add(m.key);
        }
        return set;
    }
    const world = plan.worlds.find((w) => w.key === key);
    if (world) for (const m of world.moons) set.add(m.key);
    return set;
}

/** The document body behind a dossier key, or null. */
export function bodyOf(plan: Plan, key: string): Bag | null {
    for (const star of plan.stars) if (star.key === key) return star.body;
    for (const world of plan.worlds) {
        if (world.key === key) return world.body;
        for (const moon of world.moons) if (moon.key === key) return moon.body;
    }
    return null;
}

/** js/system_viewer.js:2193-2197. The name and one line of detail on the selection tag. */
export function selectionLabel(body: Bag): [string, string] {
    const name = String(body.name || body.type || 'Body');
    const spectral = body.sType != null && !body.uwp
        ? [body.sType, body.subType, body.sClass].filter((v) => v != null && v !== '').join('')
        : '';
    const detail = body.uwp || spectral || (body.ggType ? 'Gas Giant ' + body.ggType : body.worldType || body.type || '');
    return [name, detail && detail !== name ? String(detail) : ''];
}

// ---- The scene: one date, one camera -------------------------------------------------------

/** The camera and canvas a scene is laid out for. z is zoomScale(). */
export type View = { w: number; h: number; zoom: number; offX: number; offY: number; z: number; linear: boolean };

export type StarAt = {
    star: PlanStar;
    x: number;
    y: number;
    r: number;
    /** Companions: the orbit ring's radius and its centre (the parent star). */
    ringR: number;
    parentX: number;
    parentY: number;
};

export type MoonAt = {
    moon: PlanMoon;
    x: number;
    y: number;
    r: number;
    /** Distance from the world's centre. */
    orbitR: number;
    /** 0..1: how deep the moon is in its world's shadow. */
    cover: number;
};

export type WorldAt = {
    world: PlanWorld;
    x: number;
    y: number;
    r: number;
    moons: MoonAt[];
    /** Radii of the world.rings circles. */
    rings: number[];
};

export type BeltAt = { world: PlanWorld; r: number; angle: number };

export type WorldSet = {
    cx: number;
    cy: number;
    belts: BeltAt[];
    /** Orbit radii of the bodies that are not belts, in body order. */
    orbits: number[];
    bodies: WorldAt[];
};

export type Band = { cx: number; cy: number; inner: number; outer: number; label: string };

export type HitKind = 'star' | 'world' | 'moon' | 'belt' | 'ring';

export type Hit = {
    kind: HitKind;
    /** The dossier key. A ring of world.rings carries its world's key. */
    key: string;
    cx: number;
    cy: number;
    r: number;
    /** Set for a band: a belt or a ring is hit between innerR and r. */
    innerR?: number;
    visualR?: number;
};

export type CompanionAt = { at: StarAt; band: Band | null; set: WorldSet | null };

export type Scene = {
    originX: number;
    originY: number;
    /** The primary's habitable band. */
    band: Band;
    jumps: JumpRing[];
    companions: CompanionAt[];
    primary: WorldSet | null;
    stars: StarAt[];
    /** In legacy push order: a later hit lies over an earlier one. */
    hits: Hit[];
};

type Frame = {
    originX: number;
    originY: number;
    maxPx: number;
    primaryHole: number;
    stars: StarAt[];
};

/** js/system_viewer.js:2793-2866: the origin, the scale, and where each star is. */
function starFrame(plan: Plan, view: View, days: number): Frame {
    const baseMaxR = Math.max(10, Math.min(view.w, view.h) / 2 - STAGE_MARGIN);
    const maxPx = baseMaxR * view.zoom;
    const originX = view.w / 2 + view.offX;
    const originY = view.h / 2 + view.offY;
    const z = view.z;
    const stars = plan.stars;
    const radius = (s: PlanStar | undefined): number => (s ? s.basePx * z : starBodyRadius({}, z));
    const primaryHole = orbitHole(radius(stars[0]), z);
    const primaryWorlds = plan.sets[0] || [];
    const at: StarAt[] = [];
    if (stars[0]) at.push({ star: stars[0], x: originX, y: originY, r: radius(stars[0]), ringR: 0, parentX: originX, parentY: originY });
    for (let i = 1; i < stars.length; i++) {
        const s = stars[i] as PlanStar;
        const hole = orbitHole(radius(stars[s.parent] || stars[0]), z);
        const natR = scaleR(s.au, plan.maxAU, maxPx, hole, view.linear);
        let ringR = natR;
        if (!view.linear && s.parent === 0) {
            let outerMinR = Infinity;
            for (const w of primaryWorlds) {
                if (w.au > s.au) outerMinR = Math.min(outerMinR, scaleR(w.au, plan.maxAU, maxPx, primaryHole, view.linear));
            }
            for (let j = 1; j < stars.length; j++) {
                const t = stars[j] as PlanStar;
                if (t !== s && t.parent === 0 && t.au > s.au) outerMinR = Math.min(outerMinR, scaleR(t.au, plan.maxAU, maxPx, primaryHole, view.linear));
            }
            let r = Math.max(natR, COMPANION_MIN_PX, hole);
            if (outerMinR !== Infinity && r >= outerMinR - COMPANION_GAP) r = Math.max(natR, outerMinR - COMPANION_GAP - 1);
            ringR = Math.max(r, COMPANION_ABS_MIN);
        }
        const angle = bodyAngle(s.epoch, s.period, days);
        // 2862: a parent not yet placed falls back to the origin.
        const parent = at[s.parent];
        const parentX = parent ? parent.x : originX;
        const parentY = parent ? parent.y : originY;
        at.push({
            star: s,
            x: parentX + ringR * Math.cos(angle),
            y: parentY + ringR * Math.sin(angle),
            r: radius(s),
            ringR,
            parentX,
            parentY,
        });
    }
    return { originX, originY, maxPx, primaryHole, stars: at };
}

/** js/system_viewer.js:2973-2974: a companion's own scale. */
function subMaxAU(list: PlanWorld[]): number {
    return list.reduce((m, w) => Math.max(m, w.au), 0.01) * 1.2;
}

/** js/system_viewer.js:3191-3236 and 4532-4641: one star's worlds, and their hit targets. */
function layoutWorldSet(
    list: PlanWorld[], cx: number, cy: number, maxAU: number, maxPx: number, hole: number,
    view: View, days: number, hits: Hit[],
): WorldSet {
    const z = view.z;
    const set: WorldSet = { cx, cy, belts: [], orbits: [], bodies: [] };
    for (const w of list) {
        if (!w.belt) continue;
        const r = scaleR(w.au, maxAU, maxPx, hole, view.linear);
        set.belts.push({ world: w, r, angle: bodyAngle(w.epoch, w.period, days) });
        hits.push({ kind: w.mainworldBelt ? 'world' : 'belt', key: w.key, cx, cy, r: r + 7 * z, innerR: Math.max(0, r - 7 * z) });
    }
    for (const w of list) {
        if (w.belt) continue;
        const orbitR = scaleR(w.au, maxAU, maxPx, hole, view.linear);
        set.orbits.push(orbitR);
        const angle = bodyAngle(w.epoch, w.period, days);
        const px = cx + orbitR * Math.cos(angle);
        const py = cy + orbitR * Math.sin(angle);
        const r = w.basePx * z;
        const moons: MoonAt[] = [];
        for (const m of w.moons) {
            if (m.ring) {
                const dist = ringOrbitRadius(r, m.ringIndex, w.ringMoons);
                moons.push({ moon: m, x: px, y: py, r: 0, orbitR: dist, cover: 0 });
                hits.push({ kind: 'moon', key: m.key, cx: px, cy: py, r: dist + 3 * z, innerR: Math.max(0, dist - 3 * z) });
                continue;
            }
            const dist = moonOrbitRadius(r, m.index, w.ringed, z);
            const mAngle = bodyAngle(m.epoch, m.period, days);
            const mx = px + dist * Math.cos(mAngle);
            const my = py + dist * Math.sin(mAngle);
            const moonR = m.basePx * z;
            moons.push({ moon: m, x: mx, y: my, r: moonR, orbitR: dist, cover: shadowCover(mx, my, px, py, r, cx, cy) });
            hits.push({ kind: 'moon', key: m.key, cx: mx, cy: my, r: Math.max(moonR + 6 * z, 9), visualR: moonR });
        }
        const rings: number[] = [];
        for (let ri = 0; ri < w.rings; ri++) {
            const dist = ringOrbitRadius(r, ri, w.rings);
            rings.push(dist);
            hits.push({ kind: 'ring', key: w.key, cx: px, cy: py, r: dist + 3 * z, innerR: Math.max(0, dist - 3 * z) });
        }
        set.bodies.push({ world: w, x: px, y: py, r, moons, rings });
        hits.push({ kind: 'world', key: w.key, cx: px, cy: py, r: Math.max(r + 9 * z, 14), visualR: r });
    }
    return set;
}

/** js/system_viewer.js:2916-2950: the 100D circles, before the contained ones are dropped. */
function queueJumps(rings: JumpRing[], set: WorldSet, maxAU: number, maxPx: number, hole: number, view: View): void {
    for (const at of set.bodies) {
        const w = at.world;
        if (!(w.body.diamKm > 0)) continue;
        const ring = hundredDpx(w.au, w.jumpAU, maxAU, maxPx, hole, view.linear);
        if (ring > at.r + 5 && ring >= 6 && ring <= MAX_RING_RADIUS) rings.push({ cx: at.x, cy: at.y, r: ring, label: '' });
    }
}

/** js/system_viewer.js:2774-3016, everything but the painting. */
export function layoutScene(plan: Plan, view: View, days: number): Scene {
    const frame = starFrame(plan, view, days);
    const { originX, originY, maxPx, primaryHole } = frame;
    const z = view.z;
    const hits: Hit[] = [];
    const jumps: JumpRing[] = [];
    const queue = (cx: number, cy: number, r: number, label: string): void => {
        if (r >= 6 && r <= MAX_RING_RADIUS) jumps.push({ cx, cy, r, label });
    };

    const band: Band = {
        cx: originX,
        cy: originY,
        inner: scaleR(plan.hzAU * HZ_INNER, plan.maxAU, maxPx, primaryHole, view.linear),
        outer: scaleR(plan.hzAU * HZ_OUTER, plan.maxAU, maxPx, primaryHole, view.linear),
        label: HZ_LABEL,
    };

    // Companions first: their worlds lie under the primary's (2953-2992).
    const companions: CompanionAt[] = [];
    for (let i = 1; i < frame.stars.length; i++) {
        const at = frame.stars[i] as StarAt;
        const list = plan.sets[i] || [];
        const subR = subSystemRadius(at.star.body, at.ringR, z);
        const subHole = orbitHole(at.r, z);
        let companionBand: Band | null = null;
        const hz = at.star.body.separation === 'Companion' ? null : starHzAU(plan.sys, i);
        if (hz) {
            const hzMaxAU = list.length ? subMaxAU(list) : hz * HZ_OUTER * 1.25;
            companionBand = {
                cx: at.x,
                cy: at.y,
                inner: scaleR(hz * HZ_INNER, hzMaxAU, subR, subHole, view.linear),
                outer: scaleR(hz * HZ_OUTER, hzMaxAU, subR, subHole, view.linear),
                label: HZ_LABEL + ' · ' + shortLabel(at.star.name || String(at.star.body.type || ''), plan.name),
            };
        }
        const set = list.length ? layoutWorldSet(list, at.x, at.y, subMaxAU(list), subR, subHole, view, days, hits) : null;
        companions.push({ at, band: companionBand, set });
    }

    const primaryList = plan.sets[0] || [];
    const primary = primaryList.length
        ? layoutWorldSet(primaryList, originX, originY, plan.maxAU, maxPx, primaryHole, view, days, hits)
        : null;

    // The jump circles, in the legacy queue order (2928-2948).
    const first = frame.stars[0];
    if (first) queue(originX, originY, visibleJumpRadius(scaleR(first.star.jumpAU, plan.maxAU, maxPx, primaryHole, view.linear), first.r), JUMP_LABEL);
    if (primary) queueJumps(jumps, primary, plan.maxAU, maxPx, primaryHole, view);
    for (const companion of companions) {
        const at = companion.at;
        const truePx = hundredDpx(at.star.au, at.star.jumpAU, plan.maxAU, maxPx, primaryHole, view.linear);
        queue(at.x, at.y, visibleJumpRadius(truePx, at.r), JUMP_LABEL);
        if (companion.set) {
            const list = plan.sets[at.star.index] || [];
            queueJumps(jumps, companion.set, subMaxAU(list), subSystemRadius(at.star.body, at.ringR, z), orbitHole(at.r, z), view);
        }
    }

    for (const at of frame.stars) {
        hits.push({ kind: 'star', key: at.star.key, cx: at.x, cy: at.y, r: at.r + 8 * z, visualR: at.r });
    }

    return { originX, originY, band, jumps: visibleJumpCircles(jumps), companions, primary, stars: frame.stars, hits };
}

export type Bounds = { left: number; top: number; right: number; bottom: number };

/**
 * js/system_viewer.js:2868-2905, the measureOnly branch: the box the whole picture needs,
 * labels included. Fit calls it with z = 1.
 */
export function sceneBounds(plan: Plan, view: View, days: number): Bounds {
    const frame = starFrame(plan, view, days);
    const { originX, originY, maxPx, primaryHole } = frame;
    const z = view.z;
    const bounds: Bounds = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
    const include = (x: number, y: number, r: number, label = ''): void => {
        const labelHalf = Math.min(180, label.length * 3.5);
        bounds.left = Math.min(bounds.left, x - Math.max(r, labelHalf));
        bounds.right = Math.max(bounds.right, x + Math.max(r, labelHalf));
        bounds.top = Math.min(bounds.top, y - r - 20);
        bounds.bottom = Math.max(bounds.bottom, y + r + 28);
    };
    const includeWorlds = (list: PlanWorld[], x: number, y: number, max: number, pixels: number, hole: number): void => {
        for (const w of list) {
            const moonCount = w.moons.length + w.rings;
            const local = (moonCount ? 20 + moonCount * 6 : 10) * z;
            const extent = Math.max(w.basePx * z + local, Math.min(180, w.name.length * 3.5));
            include(x, y, scaleR(w.au, max, pixels, hole, view.linear) + extent, w.name);
        }
    };
    for (const at of frame.stars) {
        include(at.x, at.y, at.r + 10 * z, at.star.name);
        if (at.star.index) {
            include(at.parentX, at.parentY, at.ringR + 4);
            const list = plan.sets[at.star.index] || [];
            includeWorlds(list, at.x, at.y, subMaxAU(list), subSystemRadius(at.star.body, at.ringR, z), orbitHole(at.r, z));
        }
    }
    includeWorlds(plan.sets[0] || [], originX, originY, plan.maxAU, maxPx, primaryHole);
    const first = frame.stars[0];
    if (first) {
        const jumpR = scaleR(first.star.jumpAU, plan.maxAU, maxPx, primaryHole, view.linear);
        if (jumpR > 0 && jumpR < maxPx * 1.25) include(originX, originY, jumpR + 36, JUMP_LABEL);
    }
    if (!Number.isFinite(bounds.left)) include(originX, originY, 15);
    return bounds;
}

/** The hit that stands for a body: never a world.rings circle, which only borrows the key. */
export function hitOf(scene: Scene, key: string | null): Hit | null {
    if (!key) return null;
    return scene.hits.find((hit) => hit.kind !== 'ring' && hit.key === key) || null;
}

/** js/system_viewer.js:4724-4731. The topmost hit under a point, or null. */
export function hitAt(scene: Scene, x: number, y: number): Hit | null {
    for (let i = scene.hits.length - 1; i >= 0; i--) {
        const hit = scene.hits[i] as Hit;
        const dist = Math.hypot(x - hit.cx, y - hit.cy);
        if (dist <= hit.r && (hit.innerR === undefined || dist >= hit.innerR)) return hit;
    }
    return null;
}

/** js/system_viewer.js:5262-5281. The box round a focus and what orbits it, from its hits. */
export function localBounds(plan: Plan, scene: Scene, key: string): Bounds | null {
    const local = localKeys(plan, key);
    const box: Bounds = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
    let found = false;
    for (const hit of scene.hits) {
        // A world.rings circle carries its world's key, so it is framed with that world (5254, 5257).
        if (!local.has(hit.key)) continue;
        found = true;
        box.left = Math.min(box.left, hit.cx - hit.r);
        box.right = Math.max(box.right, hit.cx + hit.r);
        box.top = Math.min(box.top, hit.cy - hit.r);
        box.bottom = Math.max(box.bottom, hit.cy + hit.r);
    }
    return found ? box : null;
}
