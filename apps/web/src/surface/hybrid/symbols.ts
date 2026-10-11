/**
 * The symbol overlay (design §8.2) and the sheet's marks (§8.4): hex outlines, one symbol
 * per hex from the active icon set, latitude ticks, the graticule, a locked world's twilight
 * ring, a scale bar, and city lights on the night side. Draws on any 2D context.
 */
import { codeRow, terrainRgb, type SurfaceCode } from './codes.ts';
import type { SheetLayout } from './field.ts';
import { sheetPoint } from './field.ts';
import { dot, hexSpacing, latticeNet, sphere, type V3 } from './grid.ts';
import { drawCode, iconPaint, type Ctx2D, type IconSet, type Tinter } from './icons.ts';
import type { HexRecord, HybridModel } from './model.ts';
import { seaColoursOf } from './paint.ts';

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

/** Ink for a symbol on a ground colour: dark on light, light on dark. Read once. */
let symbolInk: { onLight: string; onDark: string } | null = null;

function symbolInks(): { onLight: string; onDark: string } {
    if (!symbolInk) {
        symbolInk = {
            onLight: iconPaint('--surface-ink-on-light'),
            onDark: iconPaint('--surface-ink-on-dark'),
        };
    }
    return symbolInk;
}

export function inkOn(rgb: readonly number[]): string {
    const lum = 0.3 * rgb[0] + 0.59 * rgb[1] + 0.11 * rgb[2];
    const ink = symbolInks();
    return lum > 125 ? ink.onLight : ink.onDark;
}

/** Ground colour of a hex (sea from its liquid). */
export function groundOf(model: HybridModel, hex: HexRecord): readonly number[] {
    if (hex.terrain === 'OC' || hex.terrain === 'SH') {
        const sea = seaColoursOf(model.world.liquid);
        return hex.terrain === 'OC' ? sea.deep : sea.shallow;
    }
    return terrainRgb(hex.terrain);
}

/** The symbol a hex shows: a settlement first, else an accent, else its terrain (open sea, grass and rock stay plain). */
export function symbolOf(hex: HexRecord): SurfaceCode | null {
    const main = hex.features.find((f) => f !== 'rural' && f !== 'farm' && f !== 'dome');
    if (main) return main;
    if (hex.accents.includes('VO')) return 'VO';
    if (hex.accents.includes('CR')) return 'CR';
    if (hex.accents.includes('MT')) return 'MT';
    if (hex.terrain === 'OC' || hex.terrain === 'SH' || hex.terrain === 'GR' || hex.terrain === 'RK') return null;
    return hex.terrain;
}

/** Every code the symbol layer would show for this model, for a legend. */
export function codesShown(model: HybridModel): SurfaceCode[] {
    const used = new Set<SurfaceCode>();
    for (const hex of model.hexes) {
        used.add(hex.terrain);
        for (const a of hex.accents) used.add(a);
        for (const f of hex.features) used.add(f);
        if (hex.domed) used.add('dome');
    }
    return [...used].filter((code) => codeRow(code) !== null);
}

export type SymbolOptions = {
    readonly set: IconSet | null;
    readonly tint?: Tinter;
    readonly outlines?: boolean;
};

/** Hex outlines and symbols. The context is in sheet pixels (scale it for a sharper canvas). */
export function drawSymbols(ctx: Ctx2D, model: HybridModel, layout: SheetLayout, options: SymbolOptions): void {
    const grid = model.grid;
    const n = grid.n;
    const s = layout.side;
    const r = (s / n) * 0.40;
    const at = (f: (typeof grid.faces)[number], i: number, j: number): [number, number] => {
        const [nx, ny] = latticeNet(f, n, i, j);
        return [layout.ox + nx * s, layout.oy + ny * s];
    };
    if (options.outlines !== false) {
        const outlineDark = iconPaint('--surface-outline-dark');
        const outlineLight = iconPaint('--surface-outline-light');
        for (const [colour, width] of [[outlineDark, 1.5], [outlineLight, 0.6]] as const) {
            ctx.strokeStyle = colour;
            ctx.lineWidth = width;
            ctx.beginPath();
            for (const f of grid.faces) {
                for (let i = 0; i < n; i += 1) {
                    for (let j = 0; i + j < n; j += 1) {
                        const tris: [number, number][][] = [[[i, j], [i + 1, j], [i, j + 1]]];
                        if (i + j + 2 <= n) tris.push([[i + 1, j], [i + 1, j + 1], [i, j + 1]]);
                        for (const t of tris) {
                            const P = t.map(([a, b]) => at(f, a, b));
                            const cx = (P[0][0] + P[1][0] + P[2][0]) / 3;
                            const cy = (P[0][1] + P[1][1] + P[2][1]) / 3;
                            for (let e = 0; e < 3; e += 1) {
                                const A = P[e];
                                const B = P[(e + 1) % 3];
                                ctx.moveTo(cx, cy);
                                ctx.lineTo((A[0] + B[0]) / 2, (A[1] + B[1]) / 2);
                            }
                        }
                    }
                }
            }
            ctx.stroke();
        }
    }
    grid.faces.forEach((f, fi) => {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(layout.ox + f.a[0] * s, layout.oy + f.a[1] * s);
        ctx.lineTo(layout.ox + f.b[0] * s, layout.oy + f.b[1] * s);
        ctx.lineTo(layout.ox + f.c[0] * s, layout.oy + f.c[1] * s);
        ctx.closePath();
        ctx.clip();
        for (let i = 0; i <= n; i += 1) {
            for (let j = 0; i + j <= n; j += 1) {
                const hex = model.hexes[grid.vid[fi][i * (n + 1) + j]];
                const [x, y] = at(f, i, j);
                const ink = inkOn(groundOf(model, hex));
                if (hex.features.includes('farm')) drawCode(ctx, options.set, 'farm', x, y, r, ink, { tint: options.tint });
                if (hex.features.includes('rural')) drawCode(ctx, options.set, 'rural', x, y, r, ink, { tint: options.tint });
                const code = symbolOf(hex);
                if (code) drawCode(ctx, options.set, code, x, y, r, ink, { tint: options.tint, port: hex.port ?? undefined, domed: hex.domed });
            }
        }
        ctx.restore();
    });
}

/** Sheet points along a parametric curve on the sphere, split where the net tears. */
function curve(layout: SheetLayout, points: readonly V3[]): [number, number][][] {
    const runs: [number, number][][] = [];
    let run: [number, number][] = [];
    let last: [number, number] | null = null;
    const tear = layout.side * 0.4;
    for (const p of points) {
        const q = sheetPoint(layout, p);
        if (last && Math.hypot(q[0] - last[0], q[1] - last[1]) > tear) {
            if (run.length > 1) runs.push(run);
            run = [];
        }
        run.push(q);
        last = q;
    }
    if (run.length > 1) runs.push(run);
    return runs;
}

function strokeRuns(ctx: Ctx2D, runs: [number, number][][], dash: number, gap: number): void {
    ctx.beginPath();
    for (const run of runs) {
        // Dashes by hand: the minimal context has no setLineDash.
        let on = true;
        let left = dash;
        for (let i = 1; i < run.length; i += 1) {
            let [x0, y0] = run[i - 1];
            const [x1, y1] = run[i];
            let seg = Math.hypot(x1 - x0, y1 - y0);
            while (seg > 0) {
                const step = Math.min(seg, left);
                const t = step / (seg || 1);
                const xm = x0 + (x1 - x0) * t;
                const ym = y0 + (y1 - y0) * t;
                if (on) {
                    ctx.moveTo(x0, y0);
                    ctx.lineTo(xm, ym);
                }
                seg -= step;
                left -= step;
                x0 = xm;
                y0 = ym;
                if (left <= 1e-9) {
                    on = !on;
                    left = on ? dash : gap;
                }
            }
        }
    }
    ctx.stroke();
}

export type MarkOptions = {
    readonly graticule?: boolean;
    readonly ticks?: boolean;
    readonly scale?: boolean;
    readonly ring?: boolean;
    readonly font?: string;
    readonly ink?: string;
};

/** Latitude ticks, graticule, a locked world's terminator ring and the scale bar. */
export function drawMarks(ctx: Ctx2D, model: HybridModel, layout: SheetLayout, options: MarkOptions = {}): void {
    const ink = options.ink ?? iconPaint('--icon-mark');
    const font = options.font ?? '10px sans-serif';
    if (options.graticule !== false) {
        ctx.strokeStyle = iconPaint('--surface-graticule');
        ctx.lineWidth = 0.8;
        for (const L of [-60, -30, 0, 30, 60]) {
            const pts: V3[] = [];
            for (let lon = -180; lon <= 180; lon += 1) pts.push(sphere(L * D2R, lon * D2R));
            strokeRuns(ctx, curve(layout, pts), 3, 4);
        }
    }
    if (options.ring !== false && model.sub) {
        const sub = model.sub;
        const u: V3 = [-sub[2], 0, sub[0]];
        const w: V3 = [0, 1, 0];
        const circle = (thetaDeg: number): V3[] => {
            const pts: V3[] = [];
            const c = Math.cos(thetaDeg * D2R);
            const s = Math.sin(thetaDeg * D2R);
            for (let a = 0; a <= 360; a += 1) {
                const ca = Math.cos(a * D2R);
                const sa = Math.sin(a * D2R);
                pts.push([sub[0] * c + (u[0] * ca + w[0] * sa) * s, sub[1] * c + (u[1] * ca + w[1] * sa) * s, sub[2] * c + (u[2] * ca + w[2] * sa) * s]);
            }
            return pts;
        };
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = iconPaint('--surface-twilight-ring');
        strokeRuns(ctx, curve(layout, circle(90 - model.ringDeg)), 2, 3);
        strokeRuns(ctx, curve(layout, circle(90 + model.ringDeg)), 2, 3);
        ctx.strokeStyle = iconPaint('--surface-twilight-midline');
        strokeRuns(ctx, curve(layout, circle(90)), 6, 4);
    }
    if (options.ticks !== false) {
        ctx.font = font;
        ctx.fillStyle = ink;
        ctx.strokeStyle = ink;
        ctx.lineWidth = 1;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        for (const L of [90, 60, 30, 0, -30, -60, -90]) {
            const lon = L > 26.6 ? -180 : L < -26.6 ? -144 : -162;
            const y = L === 90 ? layout.oy : L === -90 ? layout.oy + 1.5 * Math.sqrt(3) * layout.side : sheetPoint(layout, sphere(L * D2R, lon * D2R))[1];
            ctx.beginPath();
            ctx.moveTo(layout.ox - 5, y);
            ctx.lineTo(layout.ox - 1, y);
            ctx.stroke();
            ctx.fillText(L === 0 ? '0°' : Math.abs(L) + '°' + (L > 0 ? 'N' : 'S'), layout.ox - 6, y);
        }
    }
    if (options.scale !== false) {
        const px = layout.side / model.grid.n;
        const km = (model.world.diamKm / 2) * hexSpacing(model.grid.n);
        const label = '1 hex ≈ ' + Math.round(km).toLocaleString('en-US') + ' km';
        const x0 = layout.ox + 4.35 * layout.side;
        const y0 = layout.oy + 1.5 * Math.sqrt(3) * layout.side - 6;
        ctx.fillStyle = iconPaint('--surface-scale-chip');
        ctx.fillRect(x0 - 5, y0 - 14, px + 10 + label.length * 5.6, 20);
        ctx.strokeStyle = iconPaint('--icon-port');
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x0, y0 - 4);
        ctx.lineTo(x0, y0);
        ctx.lineTo(x0 + px, y0);
        ctx.lineTo(x0 + px, y0 - 4);
        ctx.stroke();
        ctx.fillStyle = iconPaint('--icon-port');
        ctx.font = font;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(label, x0 + px + 5, y0 - 1);
    }
}

/** Settlements on the night side, where the star is more than 4° below the horizon. */
export function nightLights(model: HybridModel, layout: SheetLayout, sun: V3): [number, number][] {
    const out: [number, number][] = [];
    const lit = new Set(['city', 'arcology', 'town', 'starport']);
    for (const hex of model.hexes) {
        if (!hex.features.some((f) => lit.has(f))) continue;
        const p = model.grid.P[hex.id];
        if (dot(p, sun) > Math.sin(-4 * D2R)) continue;
        out.push(sheetPoint(layout, p));
    }
    return out;
}

/** How strongly each kind of settlement glows at night (the brightest feature of a hex counts). */
const LIGHT_WEIGHT: Readonly<Record<string, number>> = {
    city: 1, arcology: 1, starport: 0.9, town: 0.6, naval: 0.5, military: 0.5, scout: 0.4, outpost: 0.45, estate: 0.4, penal: 0.35, rural: 0.3,
};

export type CityLight = {
    readonly x: number;
    readonly y: number;
    /** 0..1: how lit the light is now (dark side and size). */
    readonly glow: number;
    /** Radius on the sheet, pixels. */
    readonly radius: number;
};

const ease = (a: number, b: number, x: number): number => {
    const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
};

/**
 * Settlement lights for a frame of the day and night layer. They come on through twilight
 * (star 2° to 12° below the horizon), dimmed by the averaged night share when the layer is
 * averaged (mix toward 1). twinklePhase gives each a slow, small shimmer; 0 for none.
 */
export function cityLights(model: HybridModel, layout: SheetLayout, sun: V3 | null, nightShareAt: ((sinLat: number) => number) | null, mix: number, twinklePhase = 0): CityLight[] {
    const out: CityLight[] = [];
    const m = Math.max(0, Math.min(1, mix));
    const r = layout.side / 132;
    for (const hex of model.hexes) {
        let weight = 0;
        for (const f of hex.features) weight = Math.max(weight, LIGHT_WEIGHT[f] ?? 0);
        if (weight <= 0) continue;
        const p = model.grid.P[hex.id];
        let dark = 0;
        if (sun && m < 1) {
            const eps = Math.asin(Math.max(-1, Math.min(1, dot(p, sun)))) * R2D;
            dark += (1 - m) * ease(-2, -12, eps);
        }
        if (nightShareAt && m > 0) dark += m * 0.7 * nightShareAt(p[1]);
        if (dark <= 0.01) continue;
        const shimmer = twinklePhase ? 0.9 + 0.1 * Math.sin(twinklePhase * 1.3 + hex.id * 2.399) : 1;
        const [x, y] = sheetPoint(layout, p);
        out.push({ x, y, glow: Math.min(1, dark * weight * shimmer), radius: (3 + 5 * weight) * r });
    }
    return out;
}
