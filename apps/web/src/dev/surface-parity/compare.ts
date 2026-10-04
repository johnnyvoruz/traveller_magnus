import { createCanvas } from '../../platform/browser.ts';
import type { WorldParity } from './types.ts';

const MAP_WIDTH = 800;
const MAP_HEIGHT = 400;

function blank(id: string, mismatches: number): WorldParity {
    const canvas = createCanvas(MAP_WIDTH, MAP_HEIGHT);
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.putImageData(new ImageData(MAP_WIDTH, MAP_HEIGHT), 0, 0);
    return {
        id,
        mismatches,
        maxChannelError: 255,
        meanChannelError: 255,
        width: canvas.width,
        height: canvas.height,
        differenceImage: canvas.toDataURL('image/png'),
        legacyDistinctColours: 0,
        legacyAlpha: false,
    };
}

/** More than one RGB triple, and some alpha above 0. Corners of the diamond stay clear. */
export function canvasCoverage(canvas: HTMLCanvasElement): { legacyDistinctColours: number; legacyAlpha: boolean } {
    const ctx = canvas.getContext('2d');
    if (!ctx || canvas.width < 1 || canvas.height < 1) {
        return { legacyDistinctColours: 0, legacyAlpha: false };
    }
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const colours = new Set<number>();
    let legacyAlpha = false;
    for (let i = 0; i < data.length; i += 4) {
        colours.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
        if (data[i + 3] > 0) legacyAlpha = true;
    }
    return { legacyDistinctColours: colours.size, legacyAlpha };
}

/** Byte-for-byte RGBA compare. The difference image stores each channel's absolute error. */
export function compareCanvases(id: string, left: HTMLCanvasElement, right: HTMLCanvasElement): WorldParity {
    if (left.width !== MAP_WIDTH || left.height !== MAP_HEIGHT || right.width !== MAP_WIDTH || right.height !== MAP_HEIGHT) {
        return blank(id, Math.abs(left.width * left.height - right.width * right.height) * 4 + 1);
    }
    const leftCtx = left.getContext('2d');
    const rightCtx = right.getContext('2d');
    if (!leftCtx || !rightCtx) return blank(id, MAP_WIDTH * MAP_HEIGHT * 4);
    const a = leftCtx.getImageData(0, 0, MAP_WIDTH, MAP_HEIGHT).data;
    const b = rightCtx.getImageData(0, 0, MAP_WIDTH, MAP_HEIGHT).data;
    const diff = new Uint8ClampedArray(a.length);
    let mismatches = 0;
    let maxChannelError = 0;
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
        const delta = Math.abs(a[i] - b[i]);
        diff[i] = i % 4 === 3 ? 255 : delta;
        if (delta !== 0) mismatches += 1;
        if (delta > maxChannelError) maxChannelError = delta;
        sum += delta;
    }
    const canvas = createCanvas(MAP_WIDTH, MAP_HEIGHT);
    const ctx = canvas.getContext('2d');
    if (!ctx) return blank(id, mismatches);
    ctx.putImageData(new ImageData(diff, MAP_WIDTH, MAP_HEIGHT), 0, 0);
    return {
        id,
        mismatches,
        maxChannelError,
        meanChannelError: sum / a.length,
        width: MAP_WIDTH,
        height: MAP_HEIGHT,
        differenceImage: canvas.toDataURL('image/png'),
        legacyDistinctColours: 0,
        legacyAlpha: false,
    };
}
