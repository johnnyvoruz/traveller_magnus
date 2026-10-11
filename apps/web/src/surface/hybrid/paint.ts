/**
 * The painted hybrid sheet (design §8.1): terrain colours from the hex data, blended across
 * hexes, with relief, beaches, grey mountains, sea depth, ice and painted volcanoes and
 * craters. Pure pixels, so it runs in the surface worker. Off the net is transparent.
 * The day and night overlay is a separate layer (overlay.ts); this image never changes with time.
 */
import { hashString, mulberry32 } from '../vanilla/map.ts';
import { LIQUIDS } from '../profile.ts';
import { terrainRgb, type RGB } from './codes.ts';
import { fieldBuild, sheetPoint, type Field, type FieldBuild, type SheetLayout } from './field.ts';
import type { V3 } from './grid.ts';
import { classify, type HybridModel } from './model.ts';
import { UNKNOWN_LIQUID } from './liquids.ts';

const R2D = 180 / Math.PI;
const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
const smooth = (a: number, b: number, x: number): number => {
    const t = clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
};
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

export type SeaColours = { shallow: RGB; deep: RGB; iceShallow: RGB; iceDeep: RGB };

/** Sea colours from profile.ts LIQUIDS. Water keeps its own ice; other liquids pale toward white. */
export function seaColoursOf(liquid: string | null): SeaColours {
    const name = liquid ?? 'Water';
    const row = LIQUIDS[name] ?? LIQUIDS[UNKNOWN_LIQUID];
    const shallow: RGB = [row.shallow[0], row.shallow[1], row.shallow[2]];
    const deep: RGB = [row.deep[0], row.deep[1], row.deep[2]];
    if (name === 'Water') return { shallow, deep, iceShallow: [222, 232, 242], iceDeep: [190, 206, 226] };
    return { shallow, deep, iceShallow: mix(shallow, [236, 240, 246], 0.7), iceDeep: mix(deep, [176, 188, 204], 0.55) };
}

const BLEND_EXCLUDED = new Set(['IC', 'FR', 'BK', 'SI', 'IF', 'EV']);

/** Per-pixel height of the world on a field. */
export function heightsOn(field: Field, model: HybridModel): Float32Array {
    const { width: W, height: H } = field.layout;
    const h = new Float32Array(W * H);
    for (let k = 0; k < W * H; k += 1) {
        if (field.face[k] < 0) continue;
        h[k] = model.height([field.P[k * 3], field.P[k * 3 + 1], field.P[k * 3 + 2]]);
    }
    return h;
}

/** A step yields at this many ms even when the budget is larger, as map_chunks.ts does. */
const YIELD_AT_MS = 16;

export type HybridPaintJob = {
    /** Paint until the budget is spent; true when the sheet is finished. */
    step(): boolean;
    readonly pixels: Uint8ClampedArray;
    readonly tasks: number;
    readonly longestMs: number;
};

/** The sheet in one call. */
export function paintHybrid(model: HybridModel, layout: SheetLayout): Uint8ClampedArray {
    const job = createHybridPaint(() => model, layout, () => 0, Number.POSITIVE_INFINITY);
    while (!job.step()) { /* runs to the end in one step */ }
    return job.pixels;
}

/**
 * The sheet in steps of about budgetMs (for the page when there is no worker): the prepare
 * steps one per turn (modelPreparation), the model, the field rows, the height rows, the
 * colour rows, then coasts and accents.
 */
export function createHybridPaint(modelOf: () => HybridModel, layout: SheetLayout, clock: () => number, budgetMs: number, prepare: readonly (() => void)[] = []): HybridPaintJob {
    const { width: W, height: H } = layout;
    const out = new Uint8ClampedArray(W * H * 4);
    let model: HybridModel | null = null;
    let field: Field | null = null;
    let h: Float32Array | null = null;
    let build: FieldBuild | null = null;
    let prepared = 0;
    let phase = 0;
    let row = 0;
    let tasks = 0;
    let longest = 0;
    const step = (): boolean => {
        const began = clock();
        tasks += 1;
        const spent = (): boolean => clock() - began >= Math.min(YIELD_AT_MS, budgetMs);
        for (;;) {
            if (phase === 0 && prepared < prepare.length) {
                prepare[prepared]();
                prepared += 1;
                if (spent() || prepared < prepare.length) break;
            } else if (phase === 0) {
                model = modelOf();
                build = fieldBuild(layout, model.grid.n);
                field = build.field;
                h = new Float32Array(W * H);
                phase = 0.5;
                if (spent()) break;
            } else if (phase === 0.5) {
                if ((build as FieldBuild).row()) {
                    phase = 1;
                    row = 0;
                }
                if (spent()) break;
            } else if (phase === 1) {
                const f = field as Field;
                const m = model as HybridModel;
                const hh = h as Float32Array;
                for (let x = 0; x < W; x += 1) {
                    const k = row * W + x;
                    if (f.face[k] >= 0) hh[k] = m.height([f.P[k * 3], f.P[k * 3 + 1], f.P[k * 3 + 2]]);
                }
                row += 1;
                if (row >= H) { phase = 2; row = 0; }
                if (spent()) break;
            } else if (phase === 2) {
                paintRow(out, field as Field, model as HybridModel, h as Float32Array, row);
                row += 1;
                if (row >= H) phase = 3;
                if (spent()) break;
            } else if (phase === 3) {
                finish(out, field as Field, model as HybridModel, h as Float32Array);
                phase = 4;
                break;
            } else {
                break;
            }
        }
        longest = Math.max(longest, clock() - began);
        return phase === 4;
    };
    return {
        step,
        pixels: out,
        get tasks() { return tasks; },
        get longestMs() { return longest; },
    };
}

function paintRow(out: Uint8ClampedArray, field: Field, model: HybridModel, h: Float32Array, y: number): void {
    const layout = field.layout;
    const { width: W, height: H } = layout;
    const sea = seaColoursOf(model.world.liquid);
    const sr = model.seaRank;
    const hexes = model.hexes;
    const exotic = model.world.atm >= 10 && model.world.atm <= 12;
    const rock: RGB = exotic ? mix([132, 126, 120], sea.shallow, 0.25) : model.airless ? [150, 146, 140] : [134, 128, 122];
    for (let x = 0; x < W; x += 1) {
        const k = y * W + x;
        if (field.face[k] < 0) continue;
        const p: V3 = [field.P[k * 3], field.P[k * 3 + 1], field.P[k * 3 + 2]];
        const hN = h[k];
        const water = sr > 0 && hN < sr;
        const e = water ? 0 : clamp((hN - sr) / (1 - sr || 1), 0, 1);
        const depth = water ? (sr - hN) / sr : 0;
        const lat = Math.asin(clamp(p[1], -1, 1)) * R2D;
        const T = model.tempAt(p, e);
        const q = k * 3;
        const m = field.bw[q] * hexes[field.bl[q]].moisture + field.bw[q + 1] * hexes[field.bl[q + 1]].moisture + field.bw[q + 2] * hexes[field.bl[q + 2]].moisture;
        const pc = classify(model, water, T, e, m, lat, depth).terrain;
        let c: RGB;
        if (water) {
            const t = Math.pow(smooth(0, 0.45, depth), 0.7);
            if (pc === 'SI' || pc === 'IF') {
                c = mix(sea.iceShallow, sea.iceDeep, t * 0.6);
                if (pc === 'IF') c = mix(c, [214, 224, 236], 0.5);
                if (T >= model.meltK) {
                    const floe = model.iceNoise([p[0] * 9, p[1] * 9, p[2] * 9]);
                    c = mix(mix(sea.shallow, sea.deep, t), c, floe > 0.05 ? 0.85 : 0.35);
                }
            } else if (pc === 'EV') {
                c = mix([228, 218, 196], [206, 190, 160], t);
            } else if (pc === 'LV') {
                c = terrainRgb('LV');
            } else {
                c = mix(sea.shallow, sea.deep, t);
            }
        } else {
            if (pc === 'IC' || pc === 'FR' || (pc === 'BK' && T > model.boilK) || pc === 'LV') {
                c = pc === 'IC' ? terrainRgb('IC') : pc === 'FR' ? mix(rock, terrainRgb('FR'), 0.75) : terrainRgb(pc);
            } else {
                let r = 0;
                let g = 0;
                let b = 0;
                for (let t = 0; t < 3; t += 1) {
                    let code: string = hexes[field.bl[q + t]].landTerrain;
                    if (BLEND_EXCLUDED.has(code) || BLEND_EXCLUDED.has(pc)) code = pc;
                    const col = terrainRgb(code);
                    const w = field.bw[q + t];
                    r += col[0] * w;
                    g += col[1] * w;
                    b += col[2] * w;
                }
                c = [r, g, b];
                if (!model.airless && sr > 0 && e < 0.012 && pc !== 'BK') c = mix(c, [196, 180, 132], 0.45);
                c = mix(c, [c[0] * 0.74, c[1] * 0.72, c[2] * 0.7], 0.6 * smooth(0.15, 0.6, e) * (1 - smooth(0.62, 1.0, e)));
                c = mix(c, rock, 0.6 * smooth(0.62, 1.0, e));
            }
            const hx1 = x + 1 < W && field.face[k + 1] >= 0 ? h[k + 1] : hN;
            const hx0 = x > 0 && field.face[k - 1] >= 0 ? h[k - 1] : hN;
            const hy1 = y + 1 < H && field.face[k + W] >= 0 ? h[k + W] : hN;
            const hy0 = y > 0 && field.face[k - W] >= 0 ? h[k - W] : hN;
            const shade = 1 + clamp(((hx0 - hx1) + (hy0 - hy1)) * 9 * (layout.side / 136), -0.28, 0.28);
            const grain = 1 + 0.05 * model.texture([p[0] * 7, p[1] * 7, p[2] * 7]);
            c = [c[0] * shade * grain, c[1] * shade * grain, c[2] * shade * grain];
        }
        const i4 = k * 4;
        out[i4] = c[0];
        out[i4 + 1] = c[1];
        out[i4 + 2] = c[2];
        out[i4 + 3] = 255;
    }
}

function finish(out: Uint8ClampedArray, field: Field, model: HybridModel, h: Float32Array): void {
    const { width: W, height: H } = field.layout;
    const sr = model.seaRank;
    // Coastline.
    if (sr > 0) {
        for (let y = 0; y < H - 1; y += 1) {
            for (let x = 0; x < W - 1; x += 1) {
                const k = y * W + x;
                if (field.face[k] < 0 || field.face[k + 1] < 0 || field.face[k + W] < 0) continue;
                const a = h[k] < sr;
                if (a !== (h[k + 1] < sr) || a !== (h[k + W] < sr)) {
                    for (let c = 0; c < 3; c += 1) out[k * 4 + c] *= 0.72;
                }
            }
        }
    }
    paintAccents(out, field, model, h);
}

function blendPixel(out: Uint8ClampedArray, field: Field, x: number, y: number, rgb: RGB, alpha: number): void {
    const { width: W, height: H } = field.layout;
    if (x < 0 || y < 0 || x >= W || y >= H || alpha <= 0) return;
    const k = y * W + x;
    if (field.face[k] < 0) return;
    const i = k * 4;
    const a = Math.min(1, alpha);
    out[i] = out[i] * (1 - a) + rgb[0] * a;
    out[i + 1] = out[i + 1] * (1 - a) + rgb[1] * a;
    out[i + 2] = out[i + 2] * (1 - a) + rgb[2] * a;
}

/** A volcano cone: a hot core fading through dark ash. */
function stampVolcano(out: Uint8ClampedArray, field: Field, cx: number, cy: number, r: number): void {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y += 1) {
        for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x += 1) {
            const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / r;
            if (d >= 1) continue;
            if (d < 0.18) blendPixel(out, field, x, y, mix([255, 110, 30], [90, 50, 35], d / 0.18), 0.9 - d * 0.8);
            else blendPixel(out, field, x, y, [80, 48, 35], 0.75 * (1 - (d - 0.18) / 0.82));
        }
    }
}

/** A crater rim: lit on the upper left, shadowed on the lower right. */
function stampCrater(out: Uint8ClampedArray, field: Field, cx: number, cy: number, R: number): void {
    const lw = Math.max(0.8, R * 0.18);
    const reach = R + lw + 1;
    for (let y = Math.floor(cy - reach); y <= Math.ceil(cy + reach); y += 1) {
        for (let x = Math.floor(cx - reach); x <= Math.ceil(cx + reach); x += 1) {
            const dx = x + 0.5 - cx;
            const dy = y + 0.5 - cy;
            const ring = 1 - Math.abs(Math.hypot(dx, dy) - R) / (lw / 2 + 0.5);
            if (ring <= 0) continue;
            const lit = (-dx - dy) / (Math.hypot(dx, dy) || 1);
            if (lit > 0) blendPixel(out, field, x, y, [240, 238, 232], 0.7 * ring * Math.min(1, lit * 1.6));
            else blendPixel(out, field, x, y, [30, 28, 26], 0.65 * ring * Math.min(1, -lit * 1.6));
        }
    }
}

function paintAccents(out: Uint8ClampedArray, field: Field, model: HybridModel, h: Float32Array): void {
    const layout = field.layout;
    const r = (layout.side / model.grid.n) * 0.36;
    for (const hx of model.hexes) {
        const isVolcano = hx.accents.includes('VO');
        const isCrater = hx.accents.includes('CR');
        if (!isVolcano && !isCrater) continue;
        const [x, y] = sheetPoint(layout, model.grid.P[hx.id]);
        if (isVolcano) stampVolcano(out, field, x, y, r * 0.8);
        if (isCrater) stampCrater(out, field, x, y, r * 1.2);
    }
    if (model.airless) {
        // Decorative small craters. Their own stream ('cr'), never the terrain's.
        const rnd = mulberry32(hashString('hybrid-craters-' + model.world.seed));
        const count = Math.round(420 * (layout.width * layout.height) / (800 * 400));
        const scale = layout.side / 136;
        for (let i = 0; i < count; i += 1) {
            const x = Math.floor(rnd() * layout.width);
            const y = Math.floor(rnd() * layout.height);
            const size = (1.5 + rnd() * rnd() * 9) * scale;
            const k = y * layout.width + x;
            if (field.face[k] < 0) continue;
            if (model.seaRank > 0 && h[k] < model.seaRank) continue;
            stampCrater(out, field, x, y, size);
        }
    }
}
