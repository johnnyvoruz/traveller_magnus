/**
 * One frame's batch of disc requests for the surface service (directives/handoff.md §61):
 * one entry per visible world and moon, saying how big it is, how it is turned and lit, what
 * rings it wears and what can eclipse it. Built from the picture the painter is about to
 * draw, so a disc is asked for exactly where a flat disc would otherwise be painted.
 *
 * The request is the legacy one (js/system_viewer.js:2684-2773, _collectPlanets and
 * _collectPlanet), with the turning taken from the orbit model (orbit/daynight.ts):
 * - A moon marked tidallyLocked is locked to its planet, not to the star (Johnny, Q1): it
 *   turns once every sidereal day of its own and keeps its own tilt. The legacy request
 *   pinned its face to the star with no tilt. Only a *planet* so marked faces the star.
 * - A backwards spin is carried by the tilt, as in the legacy request: a tilt past 90° turns
 *   the axis away, so the same forward spin is seen turning backwards. The orbit model's
 *   signed spin (daynight.ts spinAngle) is not applied on top, or the two would cancel.
 *
 * The profile and the legacy disc id are the service's to derive from `body`; nothing here
 * builds either. No clock is read: the date, the animation time and the frame's length are
 * passed in. Pure.
 */
import type { DiscBatchRequest, DiscRequest, DiscRing } from '../surface/contracts.ts';
import { turningOf } from './daynight.ts';
import { moonOrbitRadius, type Plan } from './layout.ts';
import type { Picture, WorldDraw } from './picture.ts';

const TAU = Math.PI * 2;

/** A body smaller than this on screen stays a flat disc (2723). */
export const DISC_MIN_PX = 2.5;
/** Ring particles are shown circling the inner edge every seven hours (2737). */
export const RING_HOURS = 7;
/** The rings' inner edge and their widest reach, in planet radii (2740, 243). */
export const RING_INNER = 1.22;
export const RING_OUTER = 2.05;
/** A world is shaded no larger than this, in device pixels, and scaled up when drawn (2763). */
export const DISC_MAX_RADIUS = 1100;
export const DISC_MAX_REACH = 2000;
/** The cloud deck turns a little faster than the ground (2756). */
export const CLOUD_DRIFT = 1.03;

/** The batch and its entries are the service's own types (surface/contracts.ts, handoff §61). */
export type OrbitDisc = DiscRequest;
export type OrbitDiscBatch = DiscBatchRequest;
export type { DiscRing };

/** An entry while it is being built: the casters and the order are filled in last. */
type Draft = { -readonly [K in keyof DiscRequest]: DiscRequest[K] };

/** The stage, in CSS pixels, and how many device pixels each one is. */
export type DiscCamera = { width: number; height: number; dpr: number };

export type DiscClock = {
    /** The clock's date, in days. */
    days: number;
    /** The animation time for this frame, in seconds. */
    timeSeconds: number;
    /** How fast the date is moving on screen, in days a second, smoothed (legacy _visualRate, 2063-2071). */
    rate: number;
    /** The length of this frame in seconds (legacy _frameDt). */
    frameSeconds: number;
    /** False under reduced motion: spin, cloud drift and ring particles stand still. */
    motion: boolean;
};

export type DiscOptions = {
    mode: 'vanilla' | 'enhanced';
    /** The light's colour (sunColour of the primary's colour). */
    sun: [number, number, number];
    lightMode: boolean;
    /** The Moons layer: with it off there are no moons and no rings (2732). */
    moonsShown: boolean;
    /** The selected body's dossier key, or null. */
    selected: string | null;
};

/**
 * js/system_viewer.js:2710-2715: light from the primary, tinted by its colour. `colour` is
 * the star's token colour, `#rrggbb`; anything else is white light.
 */
export function sunColour(colour: string | null | undefined): [number, number, number] {
    const raw = (colour || '').trim();
    const n = /^#[0-9a-fA-F]{6}$/.test(raw) ? Number.parseInt(raw.slice(1), 16) : 0xffffff;
    const part = (v: number): number => 0.45 + (v / 255) * 0.55;
    return [part((n >> 16) & 255), part((n >> 8) & 255), part(n & 255)];
}

/**
 * js/system_viewer.js:2762-2764: the radius a world is shaded at, in device pixels. Past the
 * tile limit it is shaded smaller and scaled up when drawn.
 */
export function shadeRadius(r: number, dpr: number, ringOuter: number | null): number {
    const full = r * dpr;
    const reach = Math.max(1.16, ringOuter !== null ? ringOuter * 1.01 : 0);
    return full * Math.min(1, DISC_MAX_RADIUS / full, DISC_MAX_REACH / (full * reach));
}

/**
 * js/system_viewer.js:2063-2071: how fast the date is moving on screen, in days a second,
 * eased over about a fifth of a second. Scrubbing and the shuttle move the clock outside the
 * play rate, so it is read from the clock itself. A jump (a typed date, a line-up) is a cut,
 * not motion: it leaves the rate as it was.
 */
export function visualRate(rate: number, movedDays: number, frameSeconds: number): number {
    const instant = Math.abs(movedDays) / frameSeconds;
    if (instant > 20000) return rate;
    return rate + (Math.min(instant, 3650) - rate) * Math.min(1, frameSeconds / 0.18);
}

/** js/system_viewer.js:2765: how many samples blur a turn of `sweep` radians at this radius. */
export function sweepSamples(sweep: number, radiusPx: number): number {
    if (!(sweep > 0.02)) return 1;
    return Math.min(radiusPx < 10 ? 6 : radiusPx < 60 ? 24 : 32, Math.ceil(sweep / 0.035) + 1);
}

/**
 * js/system_viewer.js:2727-2743: the rings a world wears, laid inside its first real moon's
 * orbit and broader the more there are. Null without rings, or with the Moons layer off.
 */
export function ringOf(at: WorldDraw, clock: DiscClock, moonsShown: boolean): DiscRing | null {
    const w = at.world;
    const count = w.rings + w.ringMoons;
    if (!(count > 0) || !moonsShown) return null;
    let first: (typeof w.moons)[number] | null = null;
    for (const moon of w.moons) if (!moon.ring && (first === null || moon.index < first.index)) first = moon;
    const limit = first
        ? (moonOrbitRadius(at.r, first.index, w.ringed, at.z) - first.basePx * at.z - 2) / at.r
        : RING_OUTER;
    const outer = Math.max(1.4, Math.min(limit, 1.6 + 0.2 * Math.min(count, 4), RING_OUTER));
    const turns = clock.days * 24 / RING_HOURS;
    const sweep = TAU * (clock.rate * 24 / RING_HOURS) * clock.frameSeconds;
    return {
        inner: RING_INNER,
        outer,
        fill: Math.min(1, 0.55 + count * 0.15),
        phase: clock.motion ? (turns % 1) * TAU : 0,
        detail: 1 - Math.max(0, Math.min(1, (sweep - 0.05) / 0.4)),
    };
}

export type Turn = { spin: number; cloudSpin: number; sweep: number; tiltDeg: number };

/**
 * How a body is turned on a date (2747-2758, with the orbit model's reading of a lock).
 * starAngle points from the body toward its star. `moon` says it orbits a planet.
 */
export function turnOf(body: Readonly<Record<string, unknown>>, moon: boolean, starAngle: number, clock: DiscClock): Turn {
    const turning = turningOf(body as Record<string, any>, moon);
    // A planet locked to its star keeps that face to it, upright: as legacy, and whatever the motion setting.
    if (turning.lockedToStar) return { spin: starAngle, cloudSpin: starAngle, sweep: 0, tiltDeg: 0 };
    const raw = body.axialTilt;
    const tiltDeg = typeof raw === 'number' && Number.isFinite(raw) ? Math.max(0, Math.min(180, raw)) : 0;
    const hours = turning.siderealHours;
    if (!hours || !clock.motion) return { spin: 0, cloudSpin: 0, sweep: 0, tiltDeg };
    // Whole turns are dropped in double precision; the GPU only sees the angle (2753).
    const turns = clock.days * 24 / hours;
    return {
        spin: (turns % 1) * TAU,
        cloudSpin: ((turns * CLOUD_DRIFT) % 1) * TAU,
        sweep: Math.min(TAU, TAU * (clock.rate * 24 / hours) * clock.frameSeconds),
        tiltDeg,
    };
}

type Seen = {
    disc: Draft;
    x: number;
    y: number;
    r: number;
    parent: string | null;
    hidden: boolean;
};

/** A world, halo and rings and all, that cannot reach the stage (2716-2720, 2744-2746). */
function offStage(x: number, y: number, r: number, ringOuter: number | null, camera: DiscCamera): boolean {
    const reach = r * Math.max(1.16, ringOuter !== null ? ringOuter * 1.01 : 0) + 2;
    return x + reach < 0 || y + reach < 0 || x - reach > camera.width || y - reach > camera.height;
}

/**
 * The batch for one frame: every world and moon of the picture big enough to shade, in the
 * painter's order. A body off the stage is left out, but still eclipses its neighbours.
 */
export function discBatch(plan: Plan, picture: Picture, camera: DiscCamera, clock: DiscClock, options: DiscOptions): DiscBatchRequest {
    const seen: Seen[] = [];
    const add = (
        key: string, body: Readonly<Record<string, unknown>>, moon: boolean, x: number, y: number, r: number,
        starX: number, starY: number, parent: string | null, ring: DiscRing | null,
    ): void => {
        if (!(r >= DISC_MIN_PX)) return;
        const starAngle = Math.atan2(starY - y, starX - x);
        const turn = turnOf(body, moon, starAngle, clock);
        const radiusPx = shadeRadius(r, camera.dpr, ring ? ring.outer : null);
        seen.push({
            x, y, r, parent,
            hidden: offStage(x, y, r, ring ? ring.outer : null, camera),
            disc: {
                key, hexKey: plan.hexKey, dossierKey: key, body, radiusPx,
                spin: turn.spin, cloudSpin: turn.cloudSpin, sweep: turn.sweep, samples: sweepSamples(turn.sweep, radiusPx),
                tiltDeg: turn.tiltDeg,
                light: [Math.cos(starAngle), Math.sin(starAngle)],
                sun: [options.sun[0], options.sun[1], options.sun[2]],
                ring, casters: [], lightMode: options.lightMode,
            },
        });
    };
    for (const layer of picture.layers) {
        for (const at of layer.worlds) {
            const w = at.world;
            add(w.key, w.body, false, at.x, at.y, at.r, at.starX, at.starY, null, ringOf(at, clock, options.moonsShown));
            for (const m of at.moons) {
                if (m.moon.ring) continue;
                add(m.moon.key, m.moon.body, true, m.x, m.y, m.r, at.starX, at.starY, w.key, null);
            }
        }
    }
    // Eclipses: a moon can shade its world, and the world its moons (2698-2706).
    const byKey = new Map(seen.map((item) => [item.disc.key, item]));
    for (const item of seen) {
        const related: Seen[] = [];
        const parent = item.parent !== null ? byKey.get(item.parent) : undefined;
        if (parent) related.push(parent);
        for (const other of seen) if (other.parent === item.disc.key) related.push(other);
        related.sort((a, b) => Math.hypot(a.x - item.x, a.y - item.y) - Math.hypot(b.x - item.x, b.y - item.y));
        item.disc.casters = related.slice(0, 4).map((o) => [(o.x - item.x) / item.r, (o.y - item.y) / item.r, o.r / item.r]);
    }
    const chosen = options.selected !== null ? byKey.get(options.selected) : undefined;
    if (chosen) for (const item of seen) item.disc.near = Math.hypot(item.x - chosen.x, item.y - chosen.y);
    return {
        mode: options.mode,
        timeSeconds: clock.motion ? clock.timeSeconds : 0,
        discs: seen.filter((item) => !item.hidden).map((item) => item.disc),
    };
}
