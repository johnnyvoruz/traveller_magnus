/**
 * The day and night layer over a hybrid sheet (design §9). A separate image, laid over the
 * terrain, so the terrain pixels never change with the time. No random stream is drawn from.
 *
 * Bands by the star's elevation ε: day, civil (0 to −6°), nautical (−6 to −12°),
 * astronomical (−12 to −18°), night, each edge softened over ±0.75°. A world with no air has
 * no twilight: one hard edge. At fast clock speeds the layer shows the day-averaged night
 * share by latitude instead of a terminator that would only flicker.
 */
import type { Field } from './field.ts';
import { sphere, type V3 } from './grid.ts';

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;
const smooth = (a: number, b: number, x: number): number => {
    const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
};

/** Sun direction for a subsolar latitude and longitude in degrees (map longitudes). */
export function sunVector(latDeg: number, lonDeg: number): V3 {
    return sphere(latDeg * D2R, lonDeg * D2R);
}

/** Darkening 0..1 for an elevation in degrees. */
export function shadowAlpha(epsDeg: number, airless: boolean): number {
    const S = (b: number, w: number): number => 1 - smooth(b - w, b + w, epsDeg);
    if (airless) return 0.62 * S(0, 0.25);
    return 0.22 * S(0, 0.75) + 0.16 * S(-6, 0.75) + 0.14 * S(-12, 0.75) + 0.10 * S(-18, 0.75);
}

export const NIGHT_TINT: readonly [number, number, number] = [8, 12, 32];
const WARM: readonly [number, number, number] = [70, 40, 50];

export type ShadowMode =
    | { readonly kind: 'instant'; readonly sun: V3 }
    /** Day-averaged: the share of the day each latitude spends in the dark, at this declination. */
    | { readonly kind: 'averaged'; readonly declinationDeg: number };

/**
 * Fill `out` (RGBA, the field's size) with the shadow layer. Returns `out`.
 * Runs in well under 2 ms on a half-size field (about 80,000 pixels).
 */
export function paintShadow(field: Field, mode: ShadowMode, airless: boolean, out?: Uint8ClampedArray): Uint8ClampedArray {
    const { width: W, height: H } = field.layout;
    const px = out && out.length === W * H * 4 ? out : new Uint8ClampedArray(W * H * 4);
    px.fill(0);
    const P = field.P;
    const face = field.face;
    if (mode.kind === 'instant') {
        const [sx, sy, sz] = mode.sun;
        const full = shadowAlpha(-90, airless);
        const topSin = Math.sin(1 * D2R);
        const bottomSin = Math.sin(-19 * D2R);
        for (let k = 0; k < W * H; k += 1) {
            if (face[k] < 0) continue;
            const s = P[k * 3] * sx + P[k * 3 + 1] * sy + P[k * 3 + 2] * sz;
            if (s >= topSin) continue;
            let a: number;
            let warm = 0;
            if (s <= bottomSin) {
                a = full;
            } else {
                const eps = Math.asin(s) * R2D;
                a = shadowAlpha(eps, airless);
                if (!airless && eps < 0 && eps > -6) warm = 0.25 * (1 - Math.abs(eps + 3) / 3);
            }
            if (a <= 0) continue;
            const i = k * 4;
            px[i] = NIGHT_TINT[0] + (WARM[0] - NIGHT_TINT[0]) * warm;
            px[i + 1] = NIGHT_TINT[1] + (WARM[1] - NIGHT_TINT[1]) * warm;
            px[i + 2] = NIGHT_TINT[2] + (WARM[2] - NIGHT_TINT[2]) * warm;
            px[i + 3] = a * 255;
        }
        return px;
    }
    // Day-averaged. The night share at latitude φ with declination δ: hour angle of sunset
    // H0 = acos(−tan φ · tan δ), night share = 1 − H0 / π. Alpha follows it, softer than a night.
    const tanD = Math.tan(mode.declinationDeg * D2R);
    const peak = shadowAlpha(-90, airless) * 0.75;
    for (let k = 0; k < W * H; k += 1) {
        if (face[k] < 0) continue;
        const sinLat = P[k * 3 + 1];
        const cosLat = Math.sqrt(Math.max(0, 1 - sinLat * sinLat));
        const x = cosLat < 1e-6 ? (sinLat * tanD > 0 ? -2 : 2) : -(sinLat / cosLat) * tanD;
        const night = x >= 1 ? 1 : x <= -1 ? 0 : 1 - Math.acos(x) / Math.PI;
        const a = peak * night;
        if (a <= 0) continue;
        const i = k * 4;
        px[i] = NIGHT_TINT[0];
        px[i + 1] = NIGHT_TINT[1];
        px[i + 2] = NIGHT_TINT[2];
        px[i + 3] = a * 255;
    }
    return px;
}

/** Star elevation in degrees at a point for a sun direction. */
export function elevationAt(p: V3, sun: V3): number {
    return Math.asin(Math.max(-1, Math.min(1, p[0] * sun[0] + p[1] * sun[1] + p[2] * sun[2]))) * R2D;
}

// ---- The animated layer (design §9, as built §13.10) -----------------------------------------
//
// paintDayNight fills two images of the half-size field each frame: the shadow (a dark tint,
// drawn normally) and the glow (light, drawn with screen blending): a thin cyan-to-amber line
// on the terminator with a slow sheen travelling along it, and a faint amber sunset wash in
// the civil band. Elevations come from a lookup on sin ε, so a frame has no asin and no acos
// per pixel. The averaged shading crossfades in by `mix` (0 instant, 1 averaged).

/** Glow colours: the day edge of the line (the app's signal teal) and its twilight side (amber). */
export const GLOW_DAY: readonly [number, number, number] = [102, 252, 241];
export const GLOW_DUSK: readonly [number, number, number] = [255, 196, 110];

export type DayNightFrame = {
    /** The sun direction for the instant layer, or null (averaged only, or unknown). */
    readonly sun: V3 | null;
    /** Declination for the averaged layer. */
    readonly declinationDeg: number;
    /** 0: the instant terminator. 1: the day-averaged shading. Between: a crossfade. */
    readonly mix: number;
    readonly airless: boolean;
    /** Phase of the sheen along the terminator line, radians of real time. */
    readonly sheenPhase: number;
};

export type DayNightImages = { readonly shadow: Uint8ClampedArray; readonly glow: Uint8ClampedArray };

const LUT_MIN_DEG = -24;
const LUT_MAX_DEG = 6;
const LUT_SIZE = 2048;
const LUT_LO = Math.sin(LUT_MIN_DEG * D2R);
const LUT_HI = Math.sin(LUT_MAX_DEG * D2R);
type Lut = { alpha: Float32Array; warm: Float32Array; line: Float32Array; tone: Float32Array; halo: Float32Array };
const luts = new Map<boolean, Lut>();

/** The soft, wide bands: each edge eased over ±2° (one hard edge with no air). */
export function softShadowAlpha(epsDeg: number, airless: boolean): number {
    const S = (b: number, w: number): number => 1 - smooth(b - w, b + w, epsDeg);
    if (airless) return 0.64 * S(0, 0.3);
    return 0.22 * S(0.4, 2) + 0.16 * S(-6, 2.2) + 0.14 * S(-12, 2.4) + 0.12 * S(-18, 2.6);
}

function lutOf(airless: boolean): Lut {
    let lut = luts.get(airless);
    if (lut) return lut;
    lut = { alpha: new Float32Array(LUT_SIZE), warm: new Float32Array(LUT_SIZE), line: new Float32Array(LUT_SIZE), tone: new Float32Array(LUT_SIZE), halo: new Float32Array(LUT_SIZE) };
    const sigma = airless ? 0.35 : 0.8;
    for (let i = 0; i < LUT_SIZE; i += 1) {
        const s = LUT_LO + (LUT_HI - LUT_LO) * (i / (LUT_SIZE - 1));
        const eps = Math.asin(s) * R2D;
        lut.alpha[i] = softShadowAlpha(eps, airless);
        lut.warm[i] = airless ? 0 : Math.max(0, 0.3 * (1 - Math.abs(eps + 3) / 4));
        const d = (eps + 0.4) / sigma;
        lut.line[i] = Math.exp(-d * d);
        lut.tone[i] = smooth(-0.8, -3.2, eps);
        lut.halo[i] = airless ? 0 : 0.16 * smooth(-9, -3, eps) * (1 - smooth(-1, 1.5, eps));
    }
    luts.set(airless, lut);
    return lut;
}

let nightRow: Float32Array | null = null;
let nightRowDecl = Number.NaN;
const NIGHT_ROWS = 1024;

/** Night share of the day by sin(latitude), for one declination (kept while it holds). */
function nightShareTable(declinationDeg: number): Float32Array {
    if (nightRow && Math.abs(nightRowDecl - declinationDeg) < 1e-3) return nightRow;
    const table = nightRow ?? new Float32Array(NIGHT_ROWS);
    const tanD = Math.tan(declinationDeg * D2R);
    for (let i = 0; i < NIGHT_ROWS; i += 1) {
        const sinLat = -1 + 2 * (i / (NIGHT_ROWS - 1));
        const cosLat = Math.sqrt(Math.max(0, 1 - sinLat * sinLat));
        const x = cosLat < 1e-6 ? (sinLat * tanD > 0 ? -2 : 2) : -(sinLat / cosLat) * tanD;
        table[i] = x >= 1 ? 1 : x <= -1 ? 0 : 1 - Math.acos(x) / Math.PI;
    }
    nightRow = table;
    nightRowDecl = declinationDeg;
    return table;
}

/** The night share of a day at a latitude (sin) for a declination: 0 always lit, 1 always dark. */
export function nightShare(sinLat: number, declinationDeg: number): number {
    const table = nightShareTable(declinationDeg);
    return table[Math.max(0, Math.min(NIGHT_ROWS - 1, Math.round((sinLat + 1) / 2 * (NIGHT_ROWS - 1))))];
}

/**
 * One frame of the animated day and night layer into `into` (reused between frames). The
 * terrain is not read or written: the same sheet lies under every frame.
 */
export function paintDayNight(field: Field, frame: DayNightFrame, into?: DayNightImages): DayNightImages {
    const { width: W, height: H } = field.layout;
    const n = W * H * 4;
    const shadow = into && into.shadow.length === n ? into.shadow : new Uint8ClampedArray(n);
    const glow = into && into.glow.length === n ? into.glow : new Uint8ClampedArray(n);
    shadow.fill(0);
    glow.fill(0);
    const mix = Math.max(0, Math.min(1, frame.mix));
    const instant = frame.sun && mix < 1 ? 1 - mix : 0;
    const averaged = mix > 0 ? mix : 0;
    const lut = lutOf(frame.airless);
    const night = averaged > 0 ? nightShareTable(frame.declinationDeg) : null;
    const peak = softShadowAlpha(-90, frame.airless) * 0.75;
    const sx = frame.sun ? frame.sun[0] : 0;
    const sy = frame.sun ? frame.sun[1] : 0;
    const sz = frame.sun ? frame.sun[2] : 0;
    const full = lut.alpha[0];
    const scale = (LUT_SIZE - 1) / (LUT_HI - LUT_LO);
    const P = field.P;
    const face = field.face;
    const [dr, dg, db] = GLOW_DAY;
    const [ur, ug, ub] = GLOW_DUSK;
    const [nr, ng, nb] = NIGHT_TINT;
    const lineGain = frame.airless ? 0.7 : 0.55;
    for (let k = 0; k < W * H; k += 1) {
        if (face[k] < 0) continue;
        let a = 0;
        let warm = 0;
        if (instant > 0) {
            const s = P[k * 3] * sx + P[k * 3 + 1] * sy + P[k * 3 + 2] * sz;
            if (s <= LUT_LO) {
                a = full;
            } else if (s < LUT_HI) {
                const i = ((s - LUT_LO) * scale) | 0;
                a = lut.alpha[i];
                warm = lut.warm[i];
                const line = lut.line[i];
                const halo = lut.halo[i];
                if (line > 0.02 || halo > 0.01) {
                    const sheen = 0.72 + 0.28 * Math.sin(frame.sheenPhase - 14 * P[k * 3 + 1]);
                    const tone = lut.tone[i];
                    const g = instant * (line * lineGain * sheen + halo);
                    const lineShare = line * lineGain * sheen / Math.max(1e-6, line * lineGain * sheen + halo);
                    const q = k * 4;
                    // The line runs teal to amber across the edge; the halo is amber.
                    const t = 1 - lineShare + lineShare * tone;
                    glow[q] = dr + (ur - dr) * t;
                    glow[q + 1] = dg + (ug - dg) * t;
                    glow[q + 2] = db + (ub - db) * t;
                    glow[q + 3] = Math.min(1, g) * 255;
                }
            }
            a *= instant;
            warm *= instant;
        }
        if (night) {
            const sinLat = P[k * 3 + 1];
            const share = night[Math.max(0, Math.min(NIGHT_ROWS - 1, Math.round((sinLat + 1) * 0.5 * (NIGHT_ROWS - 1))))];
            a += averaged * peak * share;
        }
        if (a <= 0) continue;
        const q = k * 4;
        shadow[q] = nr + (70 - nr) * warm;
        shadow[q + 1] = ng + (40 - ng) * warm;
        shadow[q + 2] = nb + (50 - nb) * warm;
        shadow[q + 3] = a * 255;
    }
    return { shadow, glow };
}
