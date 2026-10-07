/**
 * The enhanced surface map: the 800×400 diamond sheet with the vanilla continents, and seas
 * and sea ice decided by enhanced/seas.ts (questions_for_johnny.md E10, approved 2026-10-04).
 *
 * What is shared with vanilla, imported and not changed: the height field and its seeds
 * (vanilla/map_fields.ts, the same ph / cn / oc seed strings), the diamond projection
 * (vanilla/map_projection.ts renderDiamond, called a row at a time) and the land colours
 * (vanilla/map_palette.ts buildPalette). Nothing in vanilla knows this file exists.
 *
 * What differs:
 * - Sea level is the height below which coverage(body) of the sphere lies, counted over
 *   equal-area samples of the height field. There is no minimum sea: coverage 0 or null is a
 *   world with no sea at all.
 * - The sea's colour is its substance's, from the liquid colours surface/profile.ts holds. A
 *   substance that is absent, or has no colour there, is not drawn: its basin is dry lowland.
 *   "Unknown Exotic Liquid" is the one name outside the rules table that is drawn, in the
 *   profile colour, and it is never frozen (E13). No colour is invented here.
 * - Ice is on the sea only, where seaIce says: none, all, or poleward of a latitude. There
 *   is no polar whitening and no snow on land.
 *
 * A row of the sheet lies on one latitude, so the sea's state is chosen a row at a time by
 * handing renderDiamond the palette for that row. Pure: no canvas, no clock but the one passed.
 */
import type { EnhancedPaintInputs, EnhancedSea } from '../contracts.ts';
import type { ChunkedMap } from '../map_chunks.ts';
import { LIQUIDS } from '../profile.ts';
import {
    POLE_FRAC, buildContinentSeeds, buildGrid3D, writeContinentSamples, type ContinentSeed,
} from '../vanilla/map_fields.ts';
import { MAP_HEIGHT, MAP_WIDTH, hashString, mulberry32 } from '../vanilla/map.ts';
import { buildPalette, type Palette, type PaletteStop, type PaletteWorld, type RGB } from '../vanilla/map_palette.ts';
import { renderDiamond } from '../vanilla/map_projection.ts';
import { EXOTIC_LIQUIDS, liquidByName } from './liquids.ts';
import { liquidLook } from './climate.ts';
import { coverage, seaIce, substance, type SeaIce } from './seas.ts';

/** Equal-area samples of the height field the sea level is counted over. */
export const SEA_SAMPLES = 4096;
/** Degrees of latitude over which a cap's edge goes from open sea to ice, centred on the edge. */
export const CAP_BLEND_DEG = 3;
/** Leave headroom so the row already started still finishes under the cap (as map_chunks.ts). */
const YIELD_AT_MS = 32;
/** Any hydro digit of a wet world gives the same land colours; this one puts the vanilla coast at exactly half. */
const REFERENCE_HYDRO = 5;

export type SeaColours = { shallow: RGB; deep: RGB };

function rgb(c: number[]): RGB {
    return [c[0], c[1], c[2]];
}

/** The one liquid name outside the rules table that profile.ts still colours (E13). */
export const UNKNOWN_EXOTIC_LIQUID = 'Unknown Exotic Liquid';

/**
 * The colours surface/profile.ts holds for a liquid of the exotic liquids table, and for
 * Unknown Exotic Liquid: its shallows and its deeps. Null for any other name outside that
 * table, and for one profile.ts has no colour for.
 */
export function seaColours(name: string): SeaColours | null {
    if (name !== UNKNOWN_EXOTIC_LIQUID && !liquidByName(name)) return null;
    if (!Object.prototype.hasOwnProperty.call(LIQUIDS, name)) return null;
    const row = LIQUIDS[name];
    return { shallow: rgb(row.shallow), deep: rgb(row.deep) };
}

/** Frozen water: profile.ts's own Ice colours. Other liquids use paledSeaColours. */
export const ICE_COLOURS: SeaColours = { shallow: rgb(LIQUIDS['Ice'].shallow), deep: rgb(LIQUIDS['Ice'].deep) };

const PALE_SHALLOW: RGB = [236, 240, 246];
const PALE_DEEP: RGB = [176, 188, 204];

function toward(from: RGB, to: RGB, share: number): RGB {
    return [
        Math.round(from[0] + (to[0] - from[0]) * share),
        Math.round(from[1] + (to[1] - from[1]) * share),
        Math.round(from[2] + (to[2] - from[2]) * share),
    ];
}

/**
 * A frozen sea that is not water (E12, option B): the liquid's own colour, paled.
 * Shallows move 70% of the way to 236, 240, 246; deeps 55% of the way to 176, 188, 204.
 * Water is not passed here; it keeps ICE_COLOURS.
 */
export function paledSeaColours(open: SeaColours): SeaColours {
    return {
        shallow: toward(open.shallow, PALE_SHALLOW, 0.7),
        deep: toward(open.deep, PALE_DEEP, 0.55),
    };
}

/** The liquids of the rules table that profile.ts holds no colour for. Their seas are not drawn. */
export function colourlessLiquids(): string[] {
    return EXOTIC_LIQUIDS.filter((liquid) => seaColours(liquid.name) === null).map((liquid) => liquid.name);
}

/** How many of n equal-area samples lie under the sea: the nearest count to coverage × n. */
export function seaSamples(cover: number | null, n: number): number {
    if (cover == null || !(cover > 0)) return 0;
    return Math.max(0, Math.min(n, Math.round(cover * n)));
}

/**
 * The rank (remapHeight's 0..1) at and below which a point is sea, for k samples of n under
 * it: half a step past the highest sea sample, so exactly k samples are sea. 0 is no sea.
 */
export function seaRank(k: number, n: number): number {
    return k <= 0 ? 0 : (k - 0.5) / n;
}

export type LandStop = {
    /** 0 at the lowest land, 1 at the highest. */
    u: number;
    c: RGB;
};

/**
 * The vanilla palette's land stops for the world's class, unchanged, placed over the land
 * alone. A wet class (the vanilla palette that carries a sea) keeps its stops from the coast
 * up; every other class is land from bottom to top.
 */
export function landStops(world: PaletteWorld, oceanRng: number): LandStop[] {
    const own = buildPalette(world, oceanRng);
    // hasSpecular is vanilla's own mark of a palette with a sea in it (map_palette.ts 214).
    if (!own.hasSpecular) return own.stops.map((stop) => ({ u: stop.t, c: stop.c }));
    const reference = buildPalette({ ...world, hydrographics: REFERENCE_HYDRO }, oceanRng);
    const coast = reference.seaLevel;
    return reference.stops
        .filter((stop) => stop.t >= coast)
        .map((stop) => ({ u: (stop.t - coast) / (1 - coast), c: stop.c }));
}

/**
 * A palette for renderDiamond: the sea from its deeps (rank 0) to its shallows (the sea
 * rank), then the land. No sea colours, or a rank of 0: land from bottom to top. The polar
 * angle is out of reach, so heightToRGB whitens nothing.
 */
export function sheetPalette(base: Palette, land: LandStop[], rank: number, sea: SeaColours | null): Palette {
    const stops: PaletteStop[] = [];
    const from = sea && rank > 0 ? rank : 0;
    if (sea && rank > 0) stops.push({ t: 0, c: sea.deep }, { t: rank, c: sea.shallow });
    for (const stop of land) stops.push({ t: from + (1 - from) * stop.u, c: stop.c });
    return { ...base, seaLevel: from, stops, polarAngle: Math.PI };
}

/** The latitude of a row of the sheet, in radians, north positive: vanilla/map_projection.ts 33-35, 43, 72, 92. */
export function rowLatitude(py: number, height: number = MAP_HEIGHT): number {
    const bandTop = Math.round(POLE_FRAC * height);
    const bandBot = height - bandTop;
    const cutLat = Math.PI / 2 - POLE_FRAC * Math.PI;
    if (py < bandTop) return Math.PI / 2 - (py / bandTop) * (Math.PI / 2 - cutLat);
    if (py < bandBot) return cutLat - ((py - bandTop) / (bandBot - bandTop)) * 2 * cutLat;
    return -cutLat - ((py - bandBot) / (height - bandBot)) * (Math.PI / 2 - cutLat);
}

/** How frozen the sea is at a latitude under a cap from fromLatDeg: 0 open, 1 ice, a narrow blend between. */
export function capShare(latRad: number, fromLatDeg: number): number {
    const lat = Math.abs(latRad) * 180 / Math.PI;
    return Math.max(0, Math.min(1, (lat - (fromLatDeg - CAP_BLEND_DEG / 2)) / CAP_BLEND_DEG));
}

function mixColours(a: SeaColours, b: SeaColours, share: number): SeaColours {
    const mix = (x: RGB, y: RGB): RGB => [
        Math.round(x[0] + (y[0] - x[0]) * share),
        Math.round(x[1] + (y[1] - x[1]) * share),
        Math.round(x[2] + (y[2] - x[2]) * share),
    ];
    return { shallow: mix(a.shallow, b.shallow), deep: mix(a.deep, b.deep) };
}

/** What the sheet will draw for a sea, before any pixel: used by the painter and by its tests. */
export type SheetPlan = {
    /** Samples under the sea, of SEA_SAMPLES. 0 when there is no sea or its liquid cannot be drawn. */
    seaCount: number;
    seaRank: number;
    /** The palette for a row of the sheet. */
    rowPalette(py: number): Palette;
};

/** The palettes of a sheet, from the sea as decided and the vanilla palette of the world. */
export function sheetPlan(sea: EnhancedSea, world: PaletteWorld, oceanRng: number): SheetPlan {
    const base = buildPalette(world, oceanRng);
    const land = landStops(world, oceanRng);
    const liquid = sea.liquid ? seaColours(sea.liquid) : null;
    // No colour for the liquid, or no liquid named: the basin is dry lowland.
    const count = liquid ? seaSamples(sea.coverage, SEA_SAMPLES) : 0;
    const rank = seaRank(count, SEA_SAMPLES);
    const open = sheetPalette(base, land, rank, liquid);
    if (!liquid || count === 0) return { seaCount: 0, seaRank: 0, rowPalette: () => open };
    // Unknown Exotic Liquid has no melting point, so it is never frozen (E13).
    const ice = sea.liquid === UNKNOWN_EXOTIC_LIQUID ? { kind: 'none' as const } : sea.ice;
    // Water keeps profile.ts Ice. Every other frozen sea is its own liquid, paled (E12).
    const frozenSea = sea.liquid === 'Water' ? ICE_COLOURS : paledSeaColours(liquid);
    if (ice.kind === 'all') {
        const frozen = sheetPalette(base, land, rank, frozenSea);
        return { seaCount: count, seaRank: rank, rowPalette: () => frozen };
    }
    if (ice.kind === 'caps') {
        const frozen = sheetPalette(base, land, rank, frozenSea);
        const edge = new Map<number, Palette>();
        const from = ice.fromLatDeg;
        return {
            seaCount: count,
            seaRank: rank,
            rowPalette(py: number): Palette {
                const share = capShare(rowLatitude(py), from);
                if (share <= 0) return open;
                if (share >= 1) return frozen;
                let made = edge.get(py);
                if (!made) {
                    made = sheetPalette(base, land, rank, mixColours(liquid, frozenSea, share));
                    edge.set(py, made);
                }
                return made;
            },
        };
    }
    // 'none', and 'locked'.
    // TODO(locked worlds): E10 leaves a world locked to its star for a later design: its ice
    // belongs on the side turned from the star, placed about the far point and not by
    // latitude. Until that is designed it is drawn as 'none', with no sea ice.
    return { seaCount: count, seaRank: rank, rowPalette: () => open };
}

/**
 * The enhanced sheet, in steps that each stop before the budget, as map_chunks.ts does for
 * the vanilla one: the page uses it when there is no worker.
 */
export function createEnhancedMap(inputs: EnhancedPaintInputs, now: () => number, budgetMs: number): ChunkedMap {
    const maskWeight = typeof inputs.continentalDefinition === 'number' ? inputs.continentalDefinition : 0.55;
    const warpStrength = typeof inputs.coastlineComplexity === 'number' ? inputs.coastlineComplexity : 0.45;
    const ms = inputs.masterSeed !== undefined ? inputs.masterSeed : 'default';
    const imageSeed = inputs.imageSeed || '0000';
    const pixels = new Uint8ClampedArray(MAP_WIDTH * MAP_HEIGHT * 4);

    let phase: 'prep' | 'samples' | 'paint' | 'done' = 'prep';
    let heightGrid: Float32Array | null = null;
    let seeds: ContinentSeed[] | null = null;
    let samples: Float32Array | null = null;
    let plan: SheetPlan | null = null;
    let cursor = 0;
    let py = 0;
    let tasks = 0;
    let longestMs = 0;

    function step(): boolean {
        if (phase === 'done') return true;
        const started = now();
        tasks += 1;
        const yieldNow = (): boolean => now() - started >= Math.min(YIELD_AT_MS, budgetMs);

        if (phase === 'prep') {
            // The vanilla continents: the same three seed strings (vanilla/map.ts 65-71).
            heightGrid = buildGrid3D(mulberry32(hashString(ms + '-' + imageSeed + '-ph')));
            seeds = buildContinentSeeds(mulberry32(hashString(ms + '-' + imageSeed + '-cn')));
            samples = new Float32Array(SEA_SAMPLES);
            const oceanRng = mulberry32(hashString(ms + '-' + imageSeed + '-oc'))();
            plan = sheetPlan(inputs.sea, inputs.worldData, oceanRng);
            phase = 'samples';
        }

        if (phase === 'samples' && heightGrid && seeds && samples) {
            while (cursor < SEA_SAMPLES) {
                if (cursor > 0 && yieldNow()) break;
                cursor = writeContinentSamples(samples, cursor, 16, heightGrid, seeds, SEA_SAMPLES, maskWeight, warpStrength);
            }
            if (cursor >= SEA_SAMPLES) {
                samples.sort();
                phase = 'paint';
            }
        }

        if (phase === 'paint' && heightGrid && seeds && samples && plan) {
            while (py < MAP_HEIGHT) {
                if (yieldNow()) break;
                py = renderDiamond(
                    { data: pixels, width: MAP_WIDTH, height: MAP_HEIGHT },
                    heightGrid, seeds, samples, plan.rowPalette(py), maskWeight, warpStrength, py, 1,
                );
            }
            if (py >= MAP_HEIGHT) phase = 'done';
        }

        const elapsed = now() - started;
        if (elapsed > longestMs) longestMs = elapsed;
        return phase === 'done';
    }

    return {
        pixels,
        step,
        get tasks() { return tasks; },
        get longestMs() { return longestMs; },
    };
}

/** The whole enhanced sheet at once: 800×400 RGBA, alpha 0 outside the diamond. The worker's call. */
export function renderEnhancedMapPixels(inputs: EnhancedPaintInputs): Uint8ClampedArray {
    const whole = createEnhancedMap(inputs, () => 0, Number.POSITIVE_INFINITY);
    whole.step();
    return whole.pixels;
}

export type SeaPlan = {
    /** What the painter is told. */
    sea: EnhancedSea;
    /** seaIce's own account of its decision. */
    why: string;
    /** The body's liquidType as the data has it, or '' when it has none. */
    named: string;
    /** True when the sea will be drawn: it has cover, a known liquid and a colour for it. */
    drawn: boolean;
};

/** The sea of a body as the enhanced sheet will draw it, decided by enhanced/seas.ts. */
export function seaPlan(body: Readonly<Record<string, unknown>> | null | undefined): SeaPlan {
    const look = liquidLook(body);
    const named = body && typeof body.liquidType === 'string' ? body.liquidType : '';
    if (look === 'none') {
        return {
            sea: { coverage: 0, liquid: null, ice: { kind: 'none' } },
            why: 'liquidStatus none',
            named,
            drawn: false,
        };
    }
    if (look === 'unresolved') {
        const cover = coverage(body);
        const hasSea = cover != null && cover > 0;
        return {
            sea: { coverage: cover, liquid: hasSea ? UNKNOWN_EXOTIC_LIQUID : null, ice: { kind: 'none' } },
            why: 'the liquid is unresolved',
            named,
            drawn: hasSea,
        };
    }
    const cover = coverage(body);
    const liquid = substance(body);
    let ice: SeaIce;
    try {
        ice = seaIce(body);
    } catch (err) {
        // seaIce throws when its rules do not decide. Nothing is guessed: no ice is drawn.
        ice = { kind: 'none', why: 'undecided: ' + (err instanceof Error ? err.message : String(err)) };
    }
    const unknownExotic = named === UNKNOWN_EXOTIC_LIQUID;
    if (unknownExotic) {
        ice = { kind: 'none', why: 'exotic liquid; freezing point unknown' };
    }
    const name = liquid ? liquid.name : (unknownExotic ? UNKNOWN_EXOTIC_LIQUID : null);
    return {
        sea: {
            coverage: cover,
            liquid: name,
            ice: ice.kind === 'caps' ? { kind: 'caps', fromLatDeg: ice.fromLatDeg } : { kind: ice.kind },
        },
        why: ice.why,
        named,
        drawn: name !== null && seaColours(name) !== null && seaSamples(cover, SEA_SAMPLES) > 0,
    };
}
