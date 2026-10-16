/**
 * A window of the vanilla diamond, sampled with the same painter as the
 * 800 × 400 sheet. Used when the bake is enlarged past one device pixel.
 */
import { buildCDF, buildContinentSeeds, buildGrid3D, type ContinentSeed } from './map_fields.ts';
import { hashString, mulberry32, MAP_HEIGHT, MAP_WIDTH, type DiamondMapInputs } from './map.ts';
import { buildPalette, type Palette } from './map_palette.ts';
import { paintDiamondPoint } from './map_projection.ts';

const CDF_SAMPLES = 2048;
const YIELD_AT_MS = 16;

export type DiamondWindowJob = {
    step(): boolean;
    readonly pixels: Uint8ClampedArray;
    readonly tasks: number;
    readonly longestMs: number;
};

export function createDiamondWindow(
    inputs: DiamondMapInputs,
    width: number,
    height: number,
    mapX0: number,
    mapY0: number,
    mapX1: number,
    mapY1: number,
    clock: () => number,
    budgetMs: number,
): DiamondWindowJob {
    const maskWeight = typeof inputs.continentalDefinition === 'number' ? inputs.continentalDefinition : 0.55;
    const warpStrength = typeof inputs.coastlineComplexity === 'number' ? inputs.coastlineComplexity : 0.45;
    const ms = inputs.masterSeed !== undefined ? inputs.masterSeed : 'default';
    const imageSeed = inputs.imageSeed || '0000';
    const pixels = new Uint8ClampedArray(width * height * 4);
    let ready = false;
    let heightGrid: Float32Array | null = null;
    let seeds: ContinentSeed[] | null = null;
    let heightCDF: Float32Array | null = null;
    let palette: Palette | null = null;
    let capSeed = 0;
    let y = 0;
    let tasks = 0;
    let longest = 0;

    const step = (): boolean => {
        const began = clock();
        tasks += 1;
        const spent = (): boolean => clock() - began >= Math.min(YIELD_AT_MS, budgetMs);
        if (!ready) {
            const baseSeed = hashString(ms + '-' + imageSeed + '-ph');
            heightGrid = buildGrid3D(mulberry32(baseSeed));
            const continentSeed = hashString(ms + '-' + imageSeed + '-cn');
            seeds = buildContinentSeeds(mulberry32(continentSeed));
            heightCDF = buildCDF(heightGrid, seeds, CDF_SAMPLES, maskWeight, warpStrength);
            const oceanSeed = hashString(ms + '-' + imageSeed + '-oc');
            palette = buildPalette(inputs.worldData, mulberry32(oceanSeed)());
            capSeed = hashString(ms + '-' + imageSeed + '-cap');
            ready = true;
            if (spent()) {
                longest = Math.max(longest, clock() - began);
                return false;
            }
        }
        const grid = heightGrid as Float32Array;
        const placed = seeds as ContinentSeed[];
        const cdf = heightCDF as Float32Array;
        const colours = palette as Palette;
        const spanX = mapX1 - mapX0;
        const spanY = mapY1 - mapY0;
        while (y < height) {
            for (let x = 0; x < width; x += 1) {
                const px = mapX0 + (x + 0.5) * spanX / width;
                const py = mapY0 + (y + 0.5) * spanY / height;
                paintDiamondPoint(
                    pixels, (y * width + x) * 4, px, py, MAP_WIDTH, MAP_HEIGHT,
                    grid, placed, cdf, colours, maskWeight, warpStrength, capSeed,
                );
            }
            y += 1;
            if (spent()) break;
        }
        longest = Math.max(longest, clock() - began);
        return y >= height;
    };

    return {
        step,
        pixels,
        get tasks() { return tasks; },
        get longestMs() { return longest; },
    };
}
