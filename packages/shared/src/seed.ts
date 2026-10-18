/**
 * hashString and mulberry32, copied from packages/engines/src/core/rng.js lines 8-23.
 * Shared imports only zod, so this file imports nothing. The engines stay the
 * generation copy; this one is for the web and, later, the Worker.
 */

export function hashString(str: string): number {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
        h = Math.imul(h ^ str.charCodeAt(i), 16777619);
    }
    return h >>> 0;
}

export function mulberry32(a: number): () => number {
    return function () {
        let t = a += 0x6D2B79F5;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}
