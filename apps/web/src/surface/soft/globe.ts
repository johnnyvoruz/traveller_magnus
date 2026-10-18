/**
 * A body's surface as a latitude and longitude grid, for the software disc (soft/disc_paint.ts),
 * which paints the orbit discs when the browser has no WebGL.
 *
 * Texel (i, j) of a globe `rows` high and 2 × rows wide sits at
 * lat = 90 - (i + 0.5) × 180 / rows and lon = -180 + (j + 0.5) × 360 / (2 × rows), degrees,
 * with the signs both sheets use: y is north, lon = atan2(z, x) (vanilla/map_projection.ts
 * commitDiamond, hybrid/grid.ts sphere).
 *
 * - vanilla: each texel is the colour the dossier's diamond sheet paints at that latitude and
 *   longitude. The point is painted with the calls commitDiamond makes, so wherever the sheet
 *   has a pixel the globe agrees with it, and the polar wedges the diamond leaves out come
 *   from the same function.
 * - hybrid: the dossier's enhanced sheet (the hybrid map) is painted, then read back through
 *   the icosahedral net. A small globe (a disc a few pixels across) reads a smaller sheet from
 *   the same painter (hybridSheetFor); from 256 rows up it is the dossier's 800 × 400 sheet.
 * - gas: the bands of the WebGL gas bake without its noise and storm, in the profile's colours.
 *
 * Every builder runs in steps of about budgetMs, so a worker can take a newer batch between them.
 */
import type { HybridWorld } from '../hybrid/inputs.ts';
import { SHEET_LAYOUT, layoutFor, type SheetLayout } from '../hybrid/field.ts';
import { gridOf, type Face } from '../hybrid/grid.ts';
import { cachedHybridModel, rememberHybridModel } from '../hybrid/index.ts';
import { modelPreparation, startHybridBuild } from '../hybrid/model.ts';
import { createHybridPaint, type HybridPaintJob } from '../hybrid/paint.ts';
import { CAP_REACH_RAD, capHasCoast, capNoise, capShiftRad } from '../ice_edge.ts';
import type { VanillaPaintInputs } from '../contracts.ts';
import { buildCDF, buildContinentSeeds, buildGrid3D, continentHeight, remapHeight, type ContinentSeed } from '../vanilla/map_fields.ts';
import { hashString, mulberry32 } from '../vanilla/map.ts';
import { buildPalette, heightToRGB, type Palette } from '../vanilla/map_palette.ts';

export type Globe = {
    /** 2 × height. */
    readonly width: number;
    readonly height: number;
    /** RGBA, alpha 255 everywhere. */
    readonly pixels: Uint8ClampedArray;
};

export type GlobeBuild = {
    /** Works for about budgetMs; true when the globe is finished. */
    step(): boolean;
    readonly globe: Globe;
};

export type GasColours = {
    readonly zone: readonly number[];
    readonly belt: readonly number[];
    readonly pole: readonly number[];
    readonly bands: number;
};

/** What a globe is painted from. Plain data: it crosses to the worker. */
export type GlobeRecipe =
    | { readonly kind: 'vanilla'; readonly inputs: VanillaPaintInputs }
    | { readonly kind: 'hybrid'; readonly world: HybridWorld }
    | { readonly kind: 'gas'; readonly gas: GasColours; readonly offsets: readonly number[] };

const CDF_SAMPLES = 2048;

function blank(rows: number): Globe {
    return { width: rows * 2, height: rows, pixels: new Uint8ClampedArray(rows * 2 * rows * 4) };
}

export function texelLat(i: number, rows: number): number {
    return Math.PI / 2 - ((i + 0.5) / rows) * Math.PI;
}

export function texelLon(j: number, width: number): number {
    return -Math.PI + ((j + 0.5) / width) * 2 * Math.PI;
}

export function startGlobe(recipe: GlobeRecipe, rows: number, clock: () => number, budgetMs: number): GlobeBuild {
    switch (recipe.kind) {
        case 'vanilla':
            return vanillaGlobe(recipe.inputs, rows, clock, budgetMs);
        case 'hybrid':
            return hybridGlobe(recipe.world, rows, clock, budgetMs);
        case 'gas':
            return gasGlobe(recipe.gas, recipe.offsets, rows);
    }
}

// ---- vanilla -----------------------------------------------------------------------------

/** The fields renderFlatMapPixels builds before its first row, from the same seeds. */
export type VanillaFields = {
    readonly heightGrid: Float32Array;
    readonly seeds: ContinentSeed[];
    readonly cdf: Float32Array;
    readonly palette: Palette;
    readonly maskWeight: number;
    readonly warpStrength: number;
    readonly capSeed: number;
};

/** vanilla/map.ts renderFlatMapPixels, up to its call to renderDiamond. */
export function vanillaFields(inputs: VanillaPaintInputs): VanillaFields {
    const maskWeight = typeof inputs.continentalDefinition === 'number' ? inputs.continentalDefinition : 0.55;
    const warpStrength = typeof inputs.coastlineComplexity === 'number' ? inputs.coastlineComplexity : 0.45;
    const ms = inputs.masterSeed !== undefined ? inputs.masterSeed : 'default';
    const imageSeed = inputs.imageSeed || '0000';
    const heightGrid = buildGrid3D(mulberry32(hashString(ms + '-' + imageSeed + '-ph')));
    const seeds = buildContinentSeeds(mulberry32(hashString(ms + '-' + imageSeed + '-cn')));
    const cdf = buildCDF(heightGrid, seeds, CDF_SAMPLES, maskWeight, warpStrength);
    const oceanRng = mulberry32(hashString(ms + '-' + imageSeed + '-oc'))();
    const palette = buildPalette(inputs.worldData, oceanRng);
    const capSeed = hashString(ms + '-' + imageSeed + '-cap');
    return { heightGrid, seeds, cdf, palette, maskWeight, warpStrength, capSeed };
}

/**
 * The sheet's colour at one latitude and longitude (radians): commitDiamond's calls, with its
 * cap shift. Writes RGB and alpha 255 at idx.
 */
export function vanillaPoint(fields: VanillaFields, lat: number, lon: number, out: Uint8ClampedArray, idx: number): void {
    const sinLat = Math.sin(lat);
    const cosLat = Math.cos(lat);
    const wx = cosLat * Math.cos(lon);
    const wz = cosLat * Math.sin(lon);
    const h = continentHeight(fields.heightGrid, fields.seeds, wx, sinLat, wz, fields.maskWeight, fields.warpStrength);
    const hN = remapHeight(h, fields.cdf);
    const [r, g, b] = heightToRGB(hN, lat, fields.palette, capShift(wx, sinLat, wz, hN, lat, fields.palette, fields.capSeed));
    out[idx] = r;
    out[idx + 1] = g;
    out[idx + 2] = b;
    out[idx + 3] = 255;
}

/** vanilla/map_projection.ts capShift, which is not exported. Same lines. */
function capShift(wx: number, wy: number, wz: number, h: number, lat: number, palette: Palette, seed: number): number {
    if (seed === 0) return 0;
    if (palette.polarAngle >= Math.PI - 1e-4) return 0;
    if (Math.abs(lat) < palette.polarAngle - palette.polarFade - CAP_REACH_RAD) return 0;
    const sea = h < palette.seaLevel;
    const elevation = sea || palette.seaLevel >= 1 ? 0 : (h - palette.seaLevel) / (1 - palette.seaLevel);
    return capShiftRad(capNoise(wx, wy, wz, seed), sea, elevation, capHasCoast(palette.seaLevel));
}

function vanillaGlobe(inputs: VanillaPaintInputs, rows: number, clock: () => number, budgetMs: number): GlobeBuild {
    const globe = blank(rows);
    const { width: W, height: H, pixels } = globe;
    let fields: VanillaFields | null = null;
    let row = 0;
    return {
        globe,
        step(): boolean {
            const began = clock();
            if (!fields) {
                fields = vanillaFields(inputs);
                if (clock() - began >= budgetMs) return false;
            }
            while (row < H) {
                const lat = texelLat(row, H);
                for (let j = 0; j < W; j += 1) vanillaPoint(fields, lat, texelLon(j, W), pixels, (row * W + j) * 4);
                row += 1;
                if (clock() - began >= budgetMs) break;
            }
            return row >= H;
        },
    };
}

// ---- hybrid ------------------------------------------------------------------------------

type NetFace = { face: Face; centre: readonly [number, number, number] };
let netFaces: NetFace[] | null = null;

function facesOfNet(): NetFace[] {
    if (netFaces) return netFaces;
    netFaces = gridOf(1).faces.map((face) => {
        const x = face.A[0] + face.B[0] + face.C[0];
        const y = face.A[1] + face.B[1] + face.C[1];
        const z = face.A[2] + face.B[2] + face.C[2];
        const l = Math.hypot(x, y, z) || 1;
        return { face, centre: [x / l, y / l, z / l] as const };
    });
    return netFaces;
}

function det3(a: readonly number[], b: readonly number[], c: readonly number[]): number {
    return a[0] * (b[1] * c[2] - b[2] * c[1]) - b[0] * (a[1] * c[2] - a[2] * c[1]) + c[0] * (a[1] * b[2] - a[2] * b[1]);
}

/**
 * Where a unit vector falls on the sheet, in pixels (pixel k's centre is k + 0.5): the face
 * whose centre is nearest holds it (the icosahedron's faces are the Voronoi cells of their
 * centres), then the gnomonic weights within that face, as hybrid/field.ts sheetPoint solves them.
 */
export function netPixel(layout: SheetLayout, p: readonly [number, number, number]): [number, number] {
    const faces = facesOfNet();
    let best = faces[0];
    let bestDot = -2;
    for (const f of faces) {
        const d = f.centre[0] * p[0] + f.centre[1] * p[1] + f.centre[2] * p[2];
        if (d > bestDot) {
            bestDot = d;
            best = f;
        }
    }
    const { A, B, C, a, b, c } = best.face;
    const d = det3(A, B, C);
    let w0 = det3(p, B, C) / d;
    let w1 = det3(A, p, C) / d;
    let w2 = det3(A, B, p) / d;
    const sum = w0 + w1 + w2;
    w0 /= sum;
    w1 /= sum;
    w2 /= sum;
    const nx = w0 * a[0] + w1 * b[0] + w2 * c[0];
    const ny = w0 * a[1] + w1 * b[1] + w2 * c[1];
    return [layout.ox + nx * layout.side, layout.oy + ny * layout.side];
}

/**
 * The hybrid sheet a globe reads: the dossier's sheet from 256 rows, a half or a quarter of it
 * below, painted by the same painter on the same net. About 200 ms for the full sheet, 50 ms
 * for the half and 15 ms for the quarter.
 */
export function hybridSheetFor(rows: number): SheetLayout {
    if (rows >= 256) return SHEET_LAYOUT;
    if (rows >= 128) return HALF_SHEET;
    return QUARTER_SHEET;
}
const HALF_SHEET = layoutFor(400, 200, 66);
const QUARTER_SHEET = layoutFor(200, 100, 33);

const lookups = new Map<string, Float32Array>();

/** Sheet position of every texel of a globe `rows` high. Geometry only: built once per size. */
function netLookup(rows: number, layout: SheetLayout): { table: Float32Array; row(i: number): void; done: boolean } {
    const id = rows + '|' + layout.width;
    const cached = lookups.get(id);
    if (cached) return { table: cached, row: () => {}, done: true };
    const W = rows * 2;
    const table = new Float32Array(W * rows * 2);
    let filled = 0;
    const self = {
        table,
        done: false,
        row(i: number): void {
            const lat = texelLat(i, rows);
            const cosLat = Math.cos(lat);
            const sinLat = Math.sin(lat);
            for (let j = 0; j < W; j += 1) {
                const lon = texelLon(j, W);
                const [x, y] = netPixel(layout, [cosLat * Math.cos(lon), sinLat, cosLat * Math.sin(lon)]);
                const k = (i * W + j) * 2;
                table[k] = x;
                table[k + 1] = y;
            }
            filled += 1;
            if (filled === rows) {
                lookups.set(id, table);
                self.done = true;
            }
        },
    };
    return self;
}

/**
 * Bilinear read of a sheet at a continuous pixel position, weighted by alpha so the empty
 * pixels beside the net do not darken its edge. Writes RGB and alpha 255.
 */
export function readSheet(sheet: Uint8ClampedArray, layout: SheetLayout, x: number, y: number, out: Uint8ClampedArray, idx: number): void {
    const W = layout.width;
    const H = layout.height;
    const fx = x - 0.5;
    const fy = y - 0.5;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = fx - x0;
    const ty = fy - y0;
    let r = 0;
    let g = 0;
    let b = 0;
    let w = 0;
    for (let dy = 0; dy < 2; dy += 1) {
        const yy = Math.min(H - 1, Math.max(0, y0 + dy));
        const wy = dy ? ty : 1 - ty;
        for (let dx = 0; dx < 2; dx += 1) {
            const xx = Math.min(W - 1, Math.max(0, x0 + dx));
            const k = (yy * W + xx) * 4;
            const a = sheet[k + 3] / 255;
            const wt = (dx ? tx : 1 - tx) * wy * a;
            r += sheet[k] * wt;
            g += sheet[k + 1] * wt;
            b += sheet[k + 2] * wt;
            w += wt;
        }
    }
    if (w <= 1e-6) {
        // Only off-net pixels around this point: take the nearest one on the net.
        const k = (Math.min(H - 1, Math.max(0, Math.round(fy))) * W + Math.min(W - 1, Math.max(0, Math.round(fx)))) * 4;
        r = sheet[k]; g = sheet[k + 1]; b = sheet[k + 2]; w = 1;
    }
    out[idx] = r / w;
    out[idx + 1] = g / w;
    out[idx + 2] = b / w;
    out[idx + 3] = 255;
}

function hybridGlobe(world: HybridWorld, rows: number, clock: () => number, budgetMs: number): GlobeBuild {
    const globe = blank(rows);
    const { width: W, height: H, pixels } = globe;
    const layout = hybridSheetFor(rows);
    const cached = cachedHybridModel(world);
    const modelBuild = cached ? null : startHybridBuild(world);
    const paint: HybridPaintJob = createHybridPaint(
        () => {
            if (cached) return cached;
            const model = (modelBuild as NonNullable<typeof modelBuild>).model();
            rememberHybridModel(world, model);
            return model;
        },
        layout, clock, budgetMs, modelPreparation(world), modelBuild,
    );
    let painted = false;
    const lookup = netLookup(rows, layout);
    let lookupRow = 0;
    let row = 0;
    return {
        globe,
        step(): boolean {
            const began = clock();
            const spent = (): boolean => clock() - began >= budgetMs;
            if (!painted) {
                painted = paint.step();
                if (!painted || spent()) return false;
                if (modelBuild) rememberHybridModel(world, modelBuild.model());
            }
            while (!lookup.done && lookupRow < H) {
                lookup.row(lookupRow);
                lookupRow += 1;
                if (spent()) return false;
            }
            const sheet = paint.pixels;
            const table = lookup.table;
            while (row < H) {
                for (let j = 0; j < W; j += 1) {
                    const k = row * W + j;
                    readSheet(sheet, layout, table[k * 2], table[k * 2 + 1], pixels, k * 4);
                }
                row += 1;
                if (spent()) break;
            }
            return row >= H;
        },
    };
}

// ---- gas ---------------------------------------------------------------------------------

function smoothstep(a: number, b: number, x: number): number {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
}

/**
 * vanilla/gl_shaders.ts gasGiant with its noise held at the middle (fbm 0, eddy 0.5) and no
 * storm: bands by latitude only, the festoons where a belt meets a zone, the polar mottle as
 * its mean colour. The colours are the profile's (profile.ts), 0 to 255.
 */
function gasGlobe(gas: GasColours, offsets: readonly number[], rows: number): GlobeBuild {
    const globe = blank(rows);
    const { width: W, height: H, pixels } = globe;
    const ox = offsets[0] ?? 0;
    const oy = offsets[1] ?? 0;
    const eddy = 0.5;
    for (let i = 0; i < H; i += 1) {
        const lat = texelLat(i, H);
        const pattern = Math.sin(lat * gas.bands + ox)
            + 0.55 * Math.sin(lat * gas.bands * 2.3 + oy)
            + 0.35 * Math.sin(lat * 5.3 + 1);
        const belt = smoothstep(-0.35, 0.55, pattern);
        const t = Math.pow(belt, 0.8) * (0.8 + eddy * 0.4);
        const festoon = 1 - 0.18 * Math.exp(-Math.pow((belt - 0.5) / 0.12, 2)) * eddy;
        const polar = smoothstep(0.8, 0.95, Math.abs(Math.sin(lat))) * 0.85;
        const poleMix = smoothstep(0.35, 0.7, eddy);
        const rgb = [0, 0, 0];
        for (let c = 0; c < 3; c += 1) {
            const banded = (gas.zone[c] + (gas.belt[c] - gas.zone[c]) * t) * festoon;
            const pole = gas.pole[c] + (gas.zone[c] - gas.pole[c]) * poleMix;
            rgb[c] = banded + (pole - banded) * polar;
        }
        for (let j = 0; j < W; j += 1) {
            const k = (i * W + j) * 4;
            pixels[k] = rgb[0];
            pixels[k + 1] = rgb[1];
            pixels[k + 2] = rgb[2];
            pixels[k + 3] = 255;
        }
    }
    return { globe, step: () => true };
}
