// planet_renderer.js 783-870.
// The header at 778-781 says six rhombi. The loops draw six northern triangles,
// one uninterrupted equatorial band, and five southern triangles. Ported as the loops draw.

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
                const wx      = cosLat * Math.cos(lon);
                const wz      = cosLat * Math.sin(lon);
                const h       = continentHeight(heightGrid, seeds, wx, sinLat, wz, maskWeight, warpStrength);
                const hN      = remapHeight(h, heightCDF);
                const [r, g, b] = heightToRGB(hN, lat, palette);
                const idx     = (py * W + px) * 4;
                data[idx] = r; data[idx + 1] = g; data[idx + 2] = b; data[idx + 3] = 255;
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
            const wx  = cosLat * Math.cos(lon);
            const wz  = cosLat * Math.sin(lon);
            const h   = continentHeight(heightGrid, seeds, wx, sinLat, wz, maskWeight, warpStrength);
            const hN  = remapHeight(h, heightCDF);
            const [r, g, b] = heightToRGB(hN, lat, palette);
            const idx = (py * W + px) * 4;
            data[idx] = r; data[idx + 1] = g; data[idx + 2] = b; data[idx + 3] = 255;
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
                const wx      = cosLat * Math.cos(lon);
                const wz      = cosLat * Math.sin(lon);
                const h       = continentHeight(heightGrid, seeds, wx, sinLat, wz, maskWeight, warpStrength);
                const hN      = remapHeight(h, heightCDF);
                const [r, g, b] = heightToRGB(hN, lat, palette);
                const idx     = (py * W + px) * 4;
                data[idx] = r; data[idx + 1] = g; data[idx + 2] = b; data[idx + 3] = 255;
            }
        }
        py += 1;
        rows += 1;
    }
    return py;
}
