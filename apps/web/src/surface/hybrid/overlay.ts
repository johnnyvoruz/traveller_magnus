/**
 * The day and night layer over a hybrid sheet (design §9). A separate image, laid over the
 * terrain, so the terrain pixels never change with the time. No random stream is drawn from.
 *
 * The night side is one dark tint. The edge is a twilight band (TWILIGHT_BAND_DEG), wide
 * enough to read as soft on the column map and short of blurring noon into dusk. A world
 * with no air has one hard edge. This image has no line and no second colour: the page
 * strokes a faint terminator of its own. At fast clock speeds the layer shows the
 * day-averaged night share by latitude.
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

/**
 * Width of the atmospheric twilight, in degrees of elevation, from bright day down into
 * night. 12° is the built width. 6° and 18° are the other widths compared in the shots.
 */
export const TWILIGHT_BAND_DEG = 12;

/**
 * Peak night alpha with air. The first step is the previous strength. The built one is
 * the middle. The third is one step darker again. Tune NIGHT_PEAK.
 */
export const NIGHT_PEAK_STEPS = [0.58, 0.72, 0.86] as const;
export const NIGHT_PEAK = NIGHT_PEAK_STEPS[1];

/** The same three steps for a world with no air. The built one is the middle. */
export const NIGHT_PEAK_AIRLESS_STEPS = [0.62, 0.76, 0.90] as const;
export const NIGHT_PEAK_AIRLESS = NIGHT_PEAK_AIRLESS_STEPS[1];

/** Darkening 0..1 for an elevation in degrees. Light and dark only. */
export function shadowAlpha(epsDeg: number, airless: boolean, bandDeg: number = TWILIGHT_BAND_DEG): number {
    const peak = airless ? NIGHT_PEAK_AIRLESS : NIGHT_PEAK;
    if (airless) return peak * (1 - smooth(-0.35, 0.35, epsDeg));
    const day = bandDeg * 0.35;
    const night = -bandDeg;
    return peak * (1 - smooth(night, day, epsDeg));
}

export const NIGHT_TINT: readonly [number, number, number] = [8, 12, 32];

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
        const topSin = Math.sin(TWILIGHT_BAND_DEG * 0.35 * D2R);
        const bottomSin = Math.sin(-TWILIGHT_BAND_DEG * D2R);
        for (let k = 0; k < W * H; k += 1) {
            if (face[k] < 0) continue;
            const s = P[k * 3] * sx + P[k * 3 + 1] * sy + P[k * 3 + 2] * sz;
            if (s >= topSin) continue;
            let a: number;
            if (s <= bottomSin) {
                a = full;
            } else {
                const eps = Math.asin(s) * R2D;
                a = shadowAlpha(eps, airless);
            }
            if (a <= 0) continue;
            const i = k * 4;
            px[i] = NIGHT_TINT[0];
            px[i + 1] = NIGHT_TINT[1];
            px[i + 2] = NIGHT_TINT[2];
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
// paintDayNight fills the shadow image. The glow image stays clear: the edge is the shadow's
// own fade, not a line. Elevations come from a lookup on sin ε. The averaged shading
// crossfades in by `mix` (0 instant, 1 averaged).

/** Kept so an older caller can name the colours. The layer no longer paints them. */
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
    /** Unused. The edge is the shadow fade, so there is no sheen to phase. */
    readonly sheenPhase: number;
    /** Trial width of the twilight, degrees. Omit it for TWILIGHT_BAND_DEG. */
    readonly bandDeg?: number;
};

export type DayNightImages = { readonly shadow: Uint8ClampedArray; readonly glow: Uint8ClampedArray };

const LUT_MIN_DEG = -40;
const LUT_MAX_DEG = 24;
const LUT_SIZE = 2048;
const LUT_LO = Math.sin(LUT_MIN_DEG * D2R);
const LUT_HI = Math.sin(LUT_MAX_DEG * D2R);
type Lut = { alpha: Float32Array };
const luts = new Map<string, Lut>();

/** The same darkening as shadowAlpha. `bandDeg` selects a trial width for a shot. */
export function softShadowAlpha(epsDeg: number, airless: boolean, bandDeg: number = TWILIGHT_BAND_DEG): number {
    return shadowAlpha(epsDeg, airless, bandDeg);
}

function lutOf(airless: boolean, bandDeg: number): Lut {
    const key = (airless ? 'a' : 'b') + ':' + bandDeg;
    let lut = luts.get(key);
    if (lut) return lut;
    lut = { alpha: new Float32Array(LUT_SIZE) };
    for (let i = 0; i < LUT_SIZE; i += 1) {
        const s = LUT_LO + (LUT_HI - LUT_LO) * (i / (LUT_SIZE - 1));
        const eps = Math.asin(s) * R2D;
        lut.alpha[i] = softShadowAlpha(eps, airless, bandDeg);
    }
    luts.set(key, lut);
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
    const band = frame.bandDeg ?? TWILIGHT_BAND_DEG;
    const lut = lutOf(frame.airless, band);
    const night = averaged > 0 ? nightShareTable(frame.declinationDeg) : null;
    const peak = softShadowAlpha(-90, frame.airless, band) * 0.75;
    const sx = frame.sun ? frame.sun[0] : 0;
    const sy = frame.sun ? frame.sun[1] : 0;
    const sz = frame.sun ? frame.sun[2] : 0;
    const full = lut.alpha[0];
    const scale = (LUT_SIZE - 1) / (LUT_HI - LUT_LO);
    const P = field.P;
    const face = field.face;
    const [nr, ng, nb] = NIGHT_TINT;
    for (let k = 0; k < W * H; k += 1) {
        if (face[k] < 0) continue;
        let a = 0;
        if (instant > 0) {
            const s = P[k * 3] * sx + P[k * 3 + 1] * sy + P[k * 3 + 2] * sz;
            if (s <= LUT_LO) a = full;
            else if (s < LUT_HI) a = lut.alpha[((s - LUT_LO) * scale) | 0];
            a *= instant;
        }
        if (night) {
            const sinLat = P[k * 3 + 1];
            const share = night[Math.max(0, Math.min(NIGHT_ROWS - 1, Math.round((sinLat + 1) * 0.5 * (NIGHT_ROWS - 1))))];
            a += averaged * peak * share;
        }
        if (a <= 0) continue;
        const q = k * 4;
        shadow[q] = nr;
        shadow[q + 1] = ng;
        shadow[q + 2] = nb;
        shadow[q + 3] = a * 255;
    }
    return { shadow, glow };
}
