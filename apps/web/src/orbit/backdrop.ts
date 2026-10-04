/**
 * The star field behind the orbit picture (js/system_viewer.js:3240-3331): seeded by the hex,
 * so a system always has the same sky. This is the legacy path without the GPU nebula (four
 * faint glows, 3278-3286); the painted nebula arrives with planet imagery. The caller owns
 * the canvas; this file only draws into the context it is given.
 */
import type { OrbitTheme } from './theme.ts';

/** js/system_viewer.js:3247. The backdrop is this much larger than the canvas, each side, for the drift. */
export const BACKDROP_MARGIN = 0.06;
/** js/system_viewer.js:3328-3329. The backdrop drifts by this share of the camera's pan. */
export const BACKDROP_DRIFT = 0.02;

/** js/system_viewer.js:3576-3583. */
export function seedOf(text: string): number {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 16777619) >>> 0;
    }
    return h;
}

/** js/system_viewer.js:3584-3592. */
export function rng(seed: number): () => number {
    let h = seed >>> 0 || 1;
    return () => {
        h ^= h >>> 16; h = Math.imul(h, 0x7feb352d) >>> 0;
        h ^= h >>> 15; h = Math.imul(h, 0x846ca68b) >>> 0;
        h ^= h >>> 16;
        return (h >>> 0) / 4294967296;
    };
}

export type BackdropBox = { mx: number; my: number; bw: number; bh: number };

/** js/system_viewer.js:3258-3259. */
export function backdropBox(w: number, h: number): BackdropBox {
    const mx = Math.round(w * BACKDROP_MARGIN);
    const my = Math.round(h * BACKDROP_MARGIN);
    return { mx, my, bw: w + mx * 2, bh: h + my * 2 };
}

/** js/system_viewer.js:3326-3329. Where the backdrop is drawn for a camera pan. */
export function backdropShift(box: BackdropBox, offX: number, offY: number): { x: number; y: number } {
    const ox = Math.max(-box.mx, Math.min(box.mx, offX * BACKDROP_DRIFT));
    const oy = Math.max(-box.my, Math.min(box.my, offY * BACKDROP_DRIFT));
    return { x: -box.mx + ox, y: -box.my + oy };
}

/**
 * js/system_viewer.js:3256-3320. Paints a backdrop of box.bw × box.bh CSS pixels into a
 * context whose canvas is that size times dpr.
 */
export function paintBackdrop(ctx: CanvasRenderingContext2D, box: BackdropBox, dpr: number, hexKey: string, theme: OrbitTheme): void {
    const pw = Math.max(1, Math.round(box.bw * dpr));
    const ph = Math.max(1, Math.round(box.bh * dpr));
    ctx.fillStyle = theme.space;
    ctx.fillRect(0, 0, pw, ph);
    const rand = rng(seedOf('backdrop|' + hexKey));
    const palette = theme.nebulae[Math.floor(rand() * theme.nebulae.length)] || [];
    const bandAngle = rand() * Math.PI;
    const bandOffset = (rand() - 0.5) * 0.5;
    for (let i = 0; i < 4; i++) {
        const pair = palette[i % 3];
        const x = rand() * pw;
        const y = rand() * ph;
        const radius = (0.3 + rand() * 0.4) * pw;
        if (!pair) continue;
        const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
        glow.addColorStop(0, pair[0]);
        glow.addColorStop(1, pair[1]);
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, pw, ph);
    }
    ctx.scale(dpr, dpr);
    const bandNormal = [-Math.sin(bandAngle), Math.cos(bandAngle)] as const;
    const centreX = 0.5 * box.bw / box.bh;
    const count = Math.round(box.bw * box.bh / 800);
    const colours = theme.field;
    for (let i = 0; i < count; i++) {
        const x = rand() * box.bw;
        const y = rand() * box.bh;
        const across = (x / box.bh - centreX) * bandNormal[0] + ((box.bh - y) / box.bh - 0.5) * bandNormal[1] - bandOffset;
        if (rand() > 0.3 + 0.7 * Math.exp(-across * across / 0.05)) continue;
        ctx.globalAlpha = 0.05 + Math.pow(rand(), 3) * 0.45;
        ctx.fillStyle = colours[Math.floor(rand() * colours.length)] || theme.starCore;
        ctx.beginPath();
        ctx.arc(x, y, 0.3 + Math.pow(rand(), 4) * 0.8, 0, Math.PI * 2);
        ctx.fill();
    }
    const bright = Math.round(box.bw * box.bh / 60000);
    for (let i = 0; i < bright; i++) {
        const x = rand() * box.bw;
        const y = rand() * box.bh;
        const colour = colours[Math.floor(rand() * colours.length)] || theme.starCore;
        const glow = ctx.createRadialGradient(x, y, 0, x, y, 3 + rand() * 3);
        glow.addColorStop(0, colour);
        glow.addColorStop(1, theme.spaceClear);
        ctx.globalAlpha = 0.14 + rand() * 0.12;
        ctx.fillStyle = glow;
        ctx.fillRect(x - 6, y - 6, 12, 12);
        ctx.globalAlpha = 0.55 + rand() * 0.3;
        ctx.fillStyle = colour;
        ctx.beginPath();
        ctx.arc(x, y, 0.7, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;
}
