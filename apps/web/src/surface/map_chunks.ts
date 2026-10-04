// Chunked vanilla sheet for the page when no worker is available.
// Each step stops before the budget. The samples and rows are the same calls
// renderFlatMapPixels makes.

import { buildContinentSeeds, buildGrid3D, writeContinentSamples } from './vanilla/map_fields.ts';
import { MAP_HEIGHT, MAP_WIDTH, hashString, mulberry32, type DiamondMapInputs } from './vanilla/map.ts';
import { buildPalette } from './vanilla/map_palette.ts';
import { renderDiamond } from './vanilla/map_projection.ts';
import type { ContinentSeed } from './vanilla/map_fields.ts';
import type { Palette } from './vanilla/map_palette.ts';

const CDF_SAMPLES = 2048;
/** Leave headroom so the row already started still finishes under the cap. */
const YIELD_AT_MS = 32;

export type ChunkedMap = {
    readonly pixels: Uint8ClampedArray;
    /** True when the sheet is finished. */
    step(): boolean;
    readonly tasks: number;
    readonly longestMs: number;
};

export function createChunkedMap(
    inputs: DiamondMapInputs,
    now: () => number,
    budgetMs: number,
): ChunkedMap {
    const maskWeight = typeof inputs.continentalDefinition === 'number' ? inputs.continentalDefinition : 0.55;
    const warpStrength = typeof inputs.coastlineComplexity === 'number' ? inputs.coastlineComplexity : 0.45;
    const ms = inputs.masterSeed !== undefined ? inputs.masterSeed : 'default';
    const imageSeed = inputs.imageSeed || '0000';
    const pixels = new Uint8ClampedArray(MAP_WIDTH * MAP_HEIGHT * 4);

    let phase: 'prep' | 'cdf' | 'paint' | 'done' = 'prep';
    let heightGrid: Float32Array | null = null;
    let seeds: ContinentSeed[] | null = null;
    let samples: Float32Array | null = null;
    let palette: Palette | null = null;
    let cdfCursor = 0;
    let py = 0;
    let tasks = 0;
    let longestMs = 0;

    function step(): boolean {
        if (phase === 'done') return true;
        const started = now();
        tasks += 1;
        const yieldNow = (): boolean => now() - started >= Math.min(YIELD_AT_MS, budgetMs);

        if (phase === 'prep') {
            const baseSeed = hashString(ms + '-' + imageSeed + '-ph');
            heightGrid = buildGrid3D(mulberry32(baseSeed));
            const continentSeed = hashString(ms + '-' + imageSeed + '-cn');
            seeds = buildContinentSeeds(mulberry32(continentSeed));
            samples = new Float32Array(CDF_SAMPLES);
            const oceanSeed = hashString(ms + '-' + imageSeed + '-oc');
            const oceanRng = mulberry32(oceanSeed)();
            palette = buildPalette(inputs.worldData, oceanRng);
            phase = 'cdf';
        }

        if (phase === 'cdf' && heightGrid && seeds && samples) {
            while (cdfCursor < CDF_SAMPLES) {
                if (cdfCursor > 0 && yieldNow()) break;
                cdfCursor = writeContinentSamples(
                    samples, cdfCursor, 16, heightGrid, seeds, CDF_SAMPLES, maskWeight, warpStrength,
                );
            }
            if (cdfCursor >= CDF_SAMPLES) {
                samples.sort();
                phase = 'paint';
            }
        }

        if (phase === 'paint' && heightGrid && seeds && samples && palette) {
            while (py < MAP_HEIGHT) {
                if (yieldNow()) break;
                py = renderDiamond(
                    { data: pixels, width: MAP_WIDTH, height: MAP_HEIGHT },
                    heightGrid, seeds, samples, palette, maskWeight, warpStrength, py, 1,
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
