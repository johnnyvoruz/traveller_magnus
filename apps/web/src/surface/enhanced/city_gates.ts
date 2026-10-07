/**
 * The enhanced city gates, as numbers. The draw program writes the same edges.
 * Face-on cloud transmission at c = 0, 0.25, 0.5, 0.75, 1 is about 1, 0.472, 0.223, 0.078, 0.
 */

function smoothstep(edge0: number, edge1: number, x: number): number {
    const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
}

/** Cloud transmission. Zero once cloud reaches 0.95. `nz` is the surface facing. */
export function cloudTransmission(cloud: number, nz: number): number {
    const c = Math.min(1, Math.max(0, cloud));
    const clear = 1 - smoothstep(0.65, 0.95, c);
    return Math.exp(-3 * c / Math.max(nz, 0.35)) * clear;
}

/** Night ramp across the terminator. `dotNL` is the light on the normal, `lit` the eclipse. */
export function cityNight(dotNL: number, lit: number): number {
    return Math.max(1 - smoothstep(-0.16, 0.08, dotNL), 0.8 * (1 - lit));
}

/** Limb gate. Zero on the silhouette. */
export function citySeen(nz: number, air: number): number {
    const path = Math.min(7, 1 / Math.max(nz, 0.07));
    return smoothstep(0.02, 0.3, nz) * Math.exp(-air * 0.22 * (path - 1));
}
