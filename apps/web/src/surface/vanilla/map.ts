// Diamond flat map. planet_renderer.js 1161-1206 and 1223-1237.
// hashString and mulberry32 are js/core.js 183-198, which renderFlatMap calls.

import { buildCDF, buildContinentSeeds, buildGrid3D, type Rng } from './map_fields.ts';
import {
    BLANK_EDGES,
    BLANK_FILL,
    BLANK_GRID,
    PRINT_FILL,
    applyDiamondClip,
    drawDiamondSeparators,
    drawHexGrid,
    rgbaCss,
    type Rgba,
} from './map_grid.ts';
import { buildPalette, parseStat, type PaletteWorld } from './map_palette.ts';
import { renderDiamond } from './map_projection.ts';

export const MAP_WIDTH = 800;
export const MAP_HEIGHT = 400;
const CDF_SAMPLES = 2048;
const LOBES = 5;

export type DiamondMapInputs = {
    worldData: PaletteWorld;
    imageSeed: string;
    masterSeed: string;
    continentalDefinition: number;
    coastlineComplexity: number;
    printMode: boolean;
};

export type DiamondBlankOptions = {
    fill?: Rgba;
    grid?: Rgba;
    edges?: Rgba;
};

/** js/core.js 183-189 */
export function hashString(str: string): number {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
        h = Math.imul(h ^ str.charCodeAt(i), 16777619);
    }
    return h >>> 0;
}

/** js/core.js 191-198 */
export function mulberry32(a: number): Rng {
    return function () {
        let t = a += 0x6D2B79F5;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

/** Terrain only: 800×400 RGBA, alpha 0 outside the diamond. planet_renderer.js 1175-1198. */
export function renderFlatMapPixels(inputs: DiamondMapInputs): Uint8ClampedArray {
    const maskWeight = typeof inputs.continentalDefinition === 'number' ? inputs.continentalDefinition : 0.55;
    const warpStrength = typeof inputs.coastlineComplexity === 'number' ? inputs.coastlineComplexity : 0.45;
    const ms = inputs.masterSeed !== undefined ? inputs.masterSeed : 'default';
    const imageSeed = inputs.imageSeed || '0000';

    const baseSeed      = hashString(ms + '-' + imageSeed + '-ph');
    const heightGrid    = buildGrid3D(mulberry32(baseSeed));
    const continentSeed = hashString(ms + '-' + imageSeed + '-cn');
    const seeds         = buildContinentSeeds(mulberry32(continentSeed));
    const heightCDF     = buildCDF(heightGrid, seeds, CDF_SAMPLES, maskWeight, warpStrength);
    const oceanSeed     = hashString(ms + '-' + imageSeed + '-oc');
    const oceanRng      = mulberry32(oceanSeed)();
    const palette       = buildPalette(inputs.worldData, oceanRng);

    const data = new Uint8ClampedArray(MAP_WIDTH * MAP_HEIGHT * 4);
    renderDiamond(
        { data, width: MAP_WIDTH, height: MAP_HEIGHT },
        heightGrid, seeds, heightCDF, palette, maskWeight, warpStrength,
    );
    return data;
}

/** Hex grid inside the diamond clip, then separators outside it. planet_renderer.js 1199-1206. */
export function drawMapOverlay(ctx: CanvasRenderingContext2D, worldData: PaletteWorld): void {
    const W = MAP_WIDTH, H = MAP_HEIGHT;
    const sizeCode = parseStat(worldData.size);
    if (sizeCode > 0) {
        ctx.save();
        applyDiamondClip(ctx, W, H, LOBES);
        drawHexGrid(ctx, W, H, sizeCode, LOBES);
        ctx.restore();
    }
    drawDiamondSeparators(ctx, W, H, LOBES);
}

/**
 * Full diamond sheet in legacy order: clear, optional print fill, terrain, overlay.
 * putImageData replaces the print fill wherever the terrain buffer is still alpha 0.
 */
export function paintDiamondMap(canvas: HTMLCanvasElement, inputs: DiamondMapInputs, pixels?: Uint8ClampedArray): void {
    const terrain = pixels ?? renderFlatMapPixels(inputs);
    canvas.width = MAP_WIDTH;
    canvas.height = MAP_HEIGHT;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2d context is missing.');
    ctx.clearRect(0, 0, MAP_WIDTH, MAP_HEIGHT);
    if (inputs.printMode) {
        ctx.fillStyle = rgbaCss(PRINT_FILL);
        ctx.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);
    }
    ctx.putImageData(new ImageData(terrain as Uint8ClampedArray<ArrayBuffer>, MAP_WIDTH, MAP_HEIGHT), 0, 0);
    drawMapOverlay(ctx, inputs.worldData);
}

/** planet_renderer.js 1223-1237 */
export function renderDiamondBlank(
    canvas: HTMLCanvasElement,
    worldData: PaletteWorld,
    options?: DiamondBlankOptions,
): void {
    const W = MAP_WIDTH, H = MAP_HEIGHT, N = LOBES;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2d context is missing.');
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    applyDiamondClip(ctx, W, H, N);
    ctx.fillStyle = rgbaCss(options?.fill ?? BLANK_FILL);
    ctx.fillRect(0, 0, W, H);
    const sizeCode = parseStat(worldData.size);
    if (sizeCode > 0) drawHexGrid(ctx, W, H, sizeCode, N, rgbaCss(options?.grid ?? BLANK_GRID));
    ctx.restore();
    drawDiamondSeparators(ctx, W, H, N, rgbaCss(options?.edges ?? BLANK_EDGES));
}
