// planet_renderer.js 783-870.
// The header at 778-781 says six rhombi. The loops draw six northern triangles,
// one uninterrupted equatorial band, and five southern triangles. Ported as the loops draw.

import { CAP_REACH_RAD, capHasCoast, capNoise, capShiftRad } from '../ice_edge.ts';
import { POLE_FRAC, continentHeight, remapHeight, type ContinentSeed } from './map_fields.ts';
import { heightToRGB, type Palette } from './map_palette.ts';

export type PixelBuffer = { data: Uint8ClampedArray; width: number; height: number };

/**
 * planet_renderer.js 783-870.
 * startPy and maxRows let a caller paint a few rows and return. The defaults
 * paint the whole sheet. The row formulas are the legacy loops.
 */
export function renderDiamond(
    imageData: PixelBuffer,
    heightGrid: Float32Array,
    seeds: ContinentSeed[],
    heightCDF: Float32Array,
    palette: Palette,
    maskWeight: number,
    warpStrength: number,
    startPy = 0,
    maxRows = Number.POSITIVE_INFINITY,
    capSeed = 0,
): number {
    const data    = imageData.data;
    const W       = imageData.width;
    const H       = imageData.height;
    const N       = 5;
    const hw      = W / (2 * N);
    const lobeLon = 2 * Math.PI / N;

    const bandTop = Math.round(POLE_FRAC * H);
    const bandBot = H - bandTop;
    const cutLat  = Math.PI / 2 - POLE_FRAC * Math.PI;

    let py = startPy;
    let rows = 0;
    const room = (): boolean => rows < maxRows;

    while (py < bandTop) {
        if (!room()) return py;
        const lat    = Math.PI / 2 - (py / bandTop) * (Math.PI / 2 - cutLat);
        const sinLat = Math.sin(lat);
        const cosLat = Math.cos(lat);
        const maxOff = hw * py / bandTop;

        for (let li = 0; li <= N; li++) {
            const cx         = li * W / N;
            const lobeCenLon = -Math.PI + li * lobeLon;
            const pxStart    = Math.max(0,     Math.ceil(cx - maxOff));
            const pxEnd      = Math.min(W - 1, Math.floor(cx + maxOff));
            for (let px = pxStart; px <= pxEnd; px++) {
                const lonFrac = (px - cx) / hw;
                const lon     = lobeCenLon + lonFrac * (lobeLon / 2);
                commitDiamond(data, (py * W + px) * 4, lat, sinLat, cosLat, lon, heightGrid, seeds, heightCDF, palette, maskWeight, warpStrength, capSeed);
            }
        }
        py += 1;
        rows += 1;
    }

    const bandH = bandBot - bandTop;
    while (py < bandBot) {
        if (!room()) return py;
        const lat    = cutLat - ((py - bandTop) / bandH) * 2 * cutLat;
        const sinLat = Math.sin(lat);
        const cosLat = Math.cos(lat);
        for (let px = 0; px < W; px++) {
            const lon = -Math.PI + (px / W) * 2 * Math.PI;
            commitDiamond(data, (py * W + px) * 4, lat, sinLat, cosLat, lon, heightGrid, seeds, heightCDF, palette, maskWeight, warpStrength, capSeed);
        }
        py += 1;
        rows += 1;
    }

    const southH = H - bandBot;
    while (py < H) {
        if (!room()) return py;
        const lat    = -cutLat - ((py - bandBot) / southH) * (Math.PI / 2 - cutLat);
        const sinLat = Math.sin(lat);
        const cosLat = Math.cos(lat);
        const maxOff = hw * (H - py) / southH;

        for (let li = 0; li < N; li++) {
            const cx         = (li + 0.5) * W / N;
            const lobeCenLon = -Math.PI + (li + 0.5) * lobeLon;
            const pxStart    = Math.max(0,     Math.ceil(cx - maxOff));
            const pxEnd      = Math.min(W - 1, Math.floor(cx + maxOff));
            for (let px = pxStart; px <= pxEnd; px++) {
                const lonFrac = (px - cx) / hw;
                const lon     = lobeCenLon + lonFrac * (lobeLon / 2);
                commitDiamond(data, (py * W + px) * 4, lat, sinLat, cosLat, lon, heightGrid, seeds, heightCDF, palette, maskWeight, warpStrength, capSeed);
            }
        }
        py += 1;
        rows += 1;
    }
    return py;
}

/** Latitude and longitude of a continuous map point, or null off the diamond. Integer points match renderDiamond. */
export function diamondLatLon(px: number, py: number, W: number, H: number): { lat: number; lon: number } | null {
    const N = 5;
    const hw = W / (2 * N);
    const lobeLon = 2 * Math.PI / N;
    const bandTop = Math.round(POLE_FRAC * H);
    const bandBot = H - bandTop;
    const cutLat = Math.PI / 2 - POLE_FRAC * Math.PI;
    if (py < 0 || py >= H || px < 0 || px >= W) return null;
    if (py < bandTop) {
        const lat = Math.PI / 2 - (py / bandTop) * (Math.PI / 2 - cutLat);
        const maxOff = hw * py / bandTop;
        for (let li = 0; li <= N; li += 1) {
            const cx = li * W / N;
            if (px < cx - maxOff || px > cx + maxOff) continue;
            const lon = -Math.PI + li * lobeLon + ((px - cx) / hw) * (lobeLon / 2);
            return { lat, lon };
        }
        return null;
    }
    if (py < bandBot) {
        const bandH = bandBot - bandTop;
        const lat = cutLat - ((py - bandTop) / bandH) * 2 * cutLat;
        const lon = -Math.PI + (px / W) * 2 * Math.PI;
        return { lat, lon };
    }
    const southH = H - bandBot;
    const lat = -cutLat - ((py - bandBot) / southH) * (Math.PI / 2 - cutLat);
    const maxOff = hw * (H - py) / southH;
    for (let li = 0; li < N; li += 1) {
        const cx = (li + 0.5) * W / N;
        if (px < cx - maxOff || px > cx + maxOff) continue;
        const lon = -Math.PI + (li + 0.5) * lobeLon + ((px - cx) / hw) * (lobeLon / 2);
        return { lat, lon };
    }
    return null;
}

function commitDiamond(
    data: Uint8ClampedArray,
    idx: number,
    lat: number,
    sinLat: number,
    cosLat: number,
    lon: number,
    heightGrid: Float32Array,
    seeds: ContinentSeed[],
    heightCDF: Float32Array,
    palette: Palette,
    maskWeight: number,
    warpStrength: number,
    capSeed: number,
): void {
    const wx = cosLat * Math.cos(lon);
    const wz = cosLat * Math.sin(lon);
    const h = continentHeight(heightGrid, seeds, wx, sinLat, wz, maskWeight, warpStrength);
    const hN = remapHeight(h, heightCDF);
    const [r, g, b] = heightToRGB(hN, lat, palette, capShift(wx, sinLat, wz, hN, lat, palette, capSeed));
    data[idx] = r;
    data[idx + 1] = g;
    data[idx + 2] = b;
    data[idx + 3] = 255;
}

/** One continuous sample. Integer (px, py) matches the pixel renderDiamond writes. */
export function paintDiamondPoint(
    data: Uint8ClampedArray,
    idx: number,
    px: number,
    py: number,
    W: number,
    H: number,
    heightGrid: Float32Array,
    seeds: ContinentSeed[],
    heightCDF: Float32Array,
    palette: Palette,
    maskWeight: number,
    warpStrength: number,
    capSeed: number,
): boolean {
    const at = diamondLatLon(px, py, W, H);
    if (!at) return false;
    commitDiamond(
        data, idx, at.lat, Math.sin(at.lat), Math.cos(at.lat), at.lon,
        heightGrid, seeds, heightCDF, palette, maskWeight, warpStrength, capSeed,
    );
    return true;
}

/** Shift of this point's cap edge. Zero away from the boundary and on a world with no cap. */
function capShift(wx: number, wy: number, wz: number, h: number, lat: number, palette: Palette, seed: number): number {
    // Seed 0 is the unseeded call: the latitude probe and the seas sheet keep the climate line.
    if (seed === 0) return 0;
    if (palette.polarAngle >= Math.PI - 1e-4) return 0;
    if (Math.abs(lat) < palette.polarAngle - palette.polarFade - CAP_REACH_RAD) return 0;
    const sea = h < palette.seaLevel;
    const elevation = sea || palette.seaLevel >= 1 ? 0 : (h - palette.seaLevel) / (1 - palette.seaLevel);
    return capShiftRad(capNoise(wx, wy, wz, seed), sea, elevation, capHasCoast(palette.seaLevel));
}
