/**
 * The picture: what the painter draws, whichever layout produced it. The orbits layout
 * (layout.ts), the Row and Column line-ups (lineup.ts) and the move between two layouts
 * (tween.ts) all end as a Picture in screen space, with every item named by its body's key so
 * a body can travel from one layout to the other. Pure.
 *
 * The layer switches are the legacy ones (js/system_viewer.js:71-88, 1896-1931): Paths, Moons,
 * Habitable, Jump limit, Day / night, Scan, and in the View popover the linear scale, the
 * mainworld mark and the orbit ring strength.
 */
import {
    MAX_RING_RADIUS, type Band, type Hit, type JumpRing, type Plan, type Scene, type StarAt,
    type WorldAt, type WorldSet,
} from './layout.ts';

export type Mode = 'orbits' | 'row' | 'column';

export type Layers = {
    /** Orbit paths for worlds and moons (_showOrbits). */
    paths: boolean;
    /** Moons and rings round each world (!_hideMoons). */
    moons: boolean;
    /** The habitable band (!_hideHZ). */
    habitable: boolean;
    /** The 100-diameter circles (!_hideJumpLimit). */
    jump: boolean;
    /** The night half of each world and a moon in its world's shadow (_showDayNight). */
    dayNight: boolean;
    /** Sensor outlines and designations on every world and moon (_scanView). */
    scan: boolean;
    /** True AU spacing (_linearScale). */
    linear: boolean;
    /** The star that marks the mainworld, and its name (!_hideMainworldHighlight). */
    markMainworld: boolean;
    /** Orbit ring strength, 0.1 to 1 (_orbitOpacity). */
    pathStrength: number;
};

/** js/system_viewer.js:71-88, 111. */
export const DEFAULT_LAYERS: Layers = {
    paths: true, moons: true, habitable: true, jump: true, dayNight: true, scan: false,
    linear: false, markMainworld: true, pathStrength: 0.65,
};

/** Path alphas, as shares of the ring strength (3226, 2961, 2606). */
export const PATH_ALPHA_WORLD = 0.40;
export const PATH_ALPHA_COMPANION = 0.55;
export const PATH_ALPHA_LINEUP = 0.55;

export type PathAt = {
    /** The body whose orbit this is. */
    key: string;
    cx: number;
    cy: number;
    r: number;
    /** 0..1, the ring strength already counted. */
    alpha: number;
    /** A world's orbit, a companion star's dashed orbit, or a belt's band of dashes. */
    style: 'solid' | 'dashed' | 'belt';
    /** Stroke width; 0 is the theme's path width for the ring strength. */
    width: number;
    /** A belt's dash phase, so the dashes turn with the belt (3205). */
    phase: number;
    /** A mainworld belt: its name, drawn with the mark at the top of the ring. Else null. */
    main: string | null;
};

export type BandAt = Band & { key: string; alpha: number };
export type Panel = { key: string; x: number; y: number; w: number; h: number; radius: number; alpha: number };
export type JumpAt = JumpRing & { key: string; alpha: number };
export type Dot = { x: number; y: number; r: number; alpha: number };
/** A belt in a line-up: a band of rocks (2481-2518). */
export type Rocks = {
    key: string;
    dots: Dot[];
    alpha: number;
    /** A mainworld belt: where its mark goes, and the body radius the mark is sized for. */
    mark: { x: number; y: number; r: number } | null;
};

export type StarDraw = StarAt & {
    /** Corona reach as a multiple of the radius: 1.38 on its orbit, 1.45 in a line-up (3420). */
    glow: number;
    /** Alpha of the name under the star: 1 in the orbits layout, 0 in a line-up (3441). */
    label: number;
};

export type WorldDraw = WorldAt & {
    /** The zoom scale it was placed at: the mainworld mark's size follows it. */
    z: number;
    /** Alpha of the mainworld's name beside its disc: orbits layout only (4632). */
    label: number;
};

/** A line-up's caption under (Row) or beside (Column) a body (2538-2572). */
export type Caption = {
    key: string;
    text: string;
    /** The name without the system's name in front: used when the full name does not fit. */
    short: string;
    x: number;
    y: number;
    maxW: number;
    fontPx: number;
    /** The mainworld: drawn in the mainworld colour. */
    main: boolean;
    align: 'center' | 'left';
    alpha: number;
};

/** One pass of the painter: bands, panels, jump circles, paths, rocks, then worlds. */
export type Layer = {
    bands: BandAt[];
    panels: Panel[];
    jumps: JumpAt[];
    paths: PathAt[];
    rocks: Rocks[];
    worlds: WorldDraw[];
};

export type Picture = {
    mode: Mode | 'blend';
    /** True for the orbits layout: bodies sit on their orbits, and labels are the orbit ones. */
    orbital: boolean;
    /** The zoom scale the picture was laid out at. */
    z: number;
    layers: Layer[];
    stars: StarDraw[];
    captions: Caption[];
    /** In push order: a later hit lies over an earlier one. */
    hits: Hit[];
    /** Where the scan sweep turns: the primary in the orbits layout, null elsewhere (3015, 2667). */
    centre: { x: number; y: number } | null;
};

export function emptyLayer(): Layer {
    return { bands: [], panels: [], jumps: [], paths: [], rocks: [], worlds: [] };
}

function setLayer(set: WorldSet, layers: Layers, z: number): Layer {
    const layer = emptyLayer();
    for (const belt of set.belts) {
        // 4644-4652: a belt is always drawn; it is not a path.
        layer.paths.push({
            key: belt.world.key, cx: set.cx, cy: set.cy, r: belt.r, alpha: 1, style: 'belt', width: 5,
            phase: -(belt.angle * belt.r), main: belt.world.mainworldBelt ? belt.world.name : null,
        });
    }
    if (layers.paths && layers.pathStrength > 0) {
        set.bodies.forEach((at, i) => {
            const r = set.orbits[i] || 0;
            if (r < 2) return;
            layer.paths.push({
                key: at.world.key, cx: set.cx, cy: set.cy, r, alpha: layers.pathStrength * PATH_ALPHA_WORLD,
                style: 'solid', width: 0, phase: 0, main: null,
            });
        });
    }
    for (const at of set.bodies) layer.worlds.push({ ...at, z, label: 1 });
    return layer;
}

/**
 * The orbits scene as a picture, in the legacy paint order (js/system_viewer.js:2906-3008):
 * the primary's band and the jump circles; then each companion's orbit, its band and its
 * worlds; then the primary's worlds. Stars are painted after every layer.
 */
export function orbitPicture(plan: Plan, scene: Scene, layers: Layers, z: number): Picture {
    const first = emptyLayer();
    if (layers.habitable) first.bands.push({ ...scene.band, key: 'hz:' + (plan.stars[0] ? plan.stars[0].key : ''), alpha: 1 });
    if (layers.jump) scene.jumps.forEach((ring, i) => first.jumps.push({ ...ring, key: 'jump:' + i, alpha: 1 }));
    const out: Layer[] = [first];
    for (const companion of scene.companions) {
        const at = companion.at;
        const ring = emptyLayer();
        if (layers.paths && layers.pathStrength > 0 && at.ringR <= MAX_RING_RADIUS) {
            ring.paths.push({
                key: at.star.key, cx: at.parentX, cy: at.parentY, r: at.ringR,
                alpha: layers.pathStrength * PATH_ALPHA_COMPANION, style: 'dashed', width: 0, phase: 0, main: null,
            });
        }
        out.push(ring);
        const own = companion.set ? setLayer(companion.set, layers, z) : emptyLayer();
        if (layers.habitable && companion.band) own.bands.push({ ...companion.band, key: 'hz:' + at.star.key, alpha: 1 });
        out.push(own);
    }
    if (scene.primary) out.push(setLayer(scene.primary, layers, z));
    return {
        mode: 'orbits',
        orbital: true,
        z,
        layers: out,
        stars: scene.stars.map((at) => ({ ...at, glow: 1.38, label: 1 })),
        captions: [],
        hits: scene.hits,
        centre: { x: scene.originX, y: scene.originY },
    };
}
