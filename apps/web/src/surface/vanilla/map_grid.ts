// planet_renderer.js 917-965, 985-1038. Latitude lines have no caller and are not ported.

import { POLE_FRAC } from './map_fields.ts';

export type Rgba = { r: number; g: number; b: number; a: number };

/** Frozen vanilla ink. Not theme tokens. */
export const HEX_STROKE: Rgba = { r: 0, g: 0, b: 0, a: 0.45 };
export const SEPARATOR_STROKE: Rgba = { r: 0, g: 0, b: 0, a: 0.65 };
export const BLANK_FILL: Rgba = { r: 4, g: 9, b: 11, a: 1 };
export const BLANK_GRID: Rgba = { r: 102, g: 252, b: 241, a: 0.34 };
export const BLANK_EDGES: Rgba = { r: 102, g: 252, b: 241, a: 0.55 };
export const PRINT_FILL: Rgba = { r: 255, g: 255, b: 255, a: 1 };

export function rgbaCss(color: Rgba): string {
    return `rgba(${color.r},${color.g},${color.b},${color.a})`;
}

/** planet_renderer.js 917-965 */
export function drawHexGrid(
    ctx: CanvasRenderingContext2D,
    W: number,
    H: number,
    size: number,
    numLobes: number,
    stroke: string = rgbaCss(HEX_STROKE),
): void {
    if (size <= 0) return;
    const hexesAcross = Math.max(1, Math.round(Math.PI * size * 1600 / 1005));
    const colStep = W / hexesAcross;
    const R       = colStep / Math.sqrt(3);
    const rowStep = 1.5 * R;

    const bandTop = H * POLE_FRAC;
    const bandBot = H - bandTop;
    const modTop  = bandTop - Math.floor(bandTop / rowStep) * rowStep;
    const modBot  = bandBot - Math.floor(bandBot / rowStep) * rowStep;
    const yOffset = (modTop + modBot) / 2;

    const xPhase = numLobes ? colStep / 2 : 0;

    ctx.strokeStyle = stroke;
    ctx.lineWidth   = 0.6;

    const rowCount = Math.ceil(H / rowStep) + 2;
    const colCount = hexesAcross + 2;

    for (let r = -1; r <= rowCount; r++) {
        const cy      = yOffset + r * rowStep;
        const xOffset = (r & 1) ? colStep / 2 : 0;
        for (let c = -1; c <= colCount; c++) {
            const cx = c * colStep + xPhase + xOffset;
            ctx.beginPath();
            for (let v = 0; v < 6; v++) {
                const angle = Math.PI / 6 + v * Math.PI / 3;
                const vx = cx + R * Math.cos(angle);
                const vy = cy + R * Math.sin(angle);
                if (v === 0) ctx.moveTo(vx, vy); else ctx.lineTo(vx, vy);
            }
            ctx.closePath();
            ctx.stroke();
        }
    }
}

/** planet_renderer.js 985-1013 */
export function applyDiamondClip(ctx: CanvasRenderingContext2D, W: number, H: number, N: number): void {
    const hw      = W / (2 * N);
    const bandTop = Math.round(POLE_FRAC * H);
    const bandBot = H - bandTop;
    ctx.beginPath();
    for (let li = 0; li <= N; li++) {
        const cx = li * W / N;
        ctx.moveTo(cx,      0);
        ctx.lineTo(cx + hw, bandTop);
        ctx.lineTo(cx - hw, bandTop);
        ctx.closePath();
    }
    ctx.moveTo(0,      bandTop);
    ctx.lineTo(W,      bandTop);
    ctx.lineTo(W,      bandBot);
    ctx.lineTo(0,      bandBot);
    ctx.closePath();
    for (let li = 0; li < N; li++) {
        const cx = (li + 0.5) * W / N;
        ctx.moveTo(cx,      H);
        ctx.lineTo(cx + hw, bandBot);
        ctx.lineTo(cx - hw, bandBot);
        ctx.closePath();
    }
    ctx.clip();
}

/** planet_renderer.js 1015-1038 */
export function drawDiamondSeparators(
    ctx: CanvasRenderingContext2D,
    W: number,
    H: number,
    N: number,
    stroke: string = rgbaCss(SEPARATOR_STROKE),
): void {
    const hw      = W / (2 * N);
    const bandTop = Math.round(POLE_FRAC * H);
    const bandBot = H - bandTop;
    ctx.strokeStyle = stroke;
    ctx.lineWidth   = 1.0;
    for (let li = 0; li <= N; li++) {
        const cx = li * W / N;
        ctx.beginPath();
        ctx.moveTo(cx - hw, bandTop);
        ctx.lineTo(cx,      0);
        ctx.lineTo(cx + hw, bandTop);
        ctx.stroke();
    }
    for (let li = 0; li < N; li++) {
        const cx = (li + 0.5) * W / N;
        ctx.beginPath();
        ctx.moveTo(cx - hw, bandBot);
        ctx.lineTo(cx,      H);
        ctx.lineTo(cx + hw, bandBot);
        ctx.stroke();
    }
}
