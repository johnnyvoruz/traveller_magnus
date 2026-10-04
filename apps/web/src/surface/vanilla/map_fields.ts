// planet_renderer.js 16-35. Closed-over slider weights are arguments here.

export const GRID3 = 32;
export const CONTINENT_FREQ = 4;
export const WARP_FREQ = 1.8;
export const POLE_FRAC = 1 / 3;

export type ContinentSeed = {
    sx: number;
    sy: number;
    sz: number;
    cosR: number;
    strength: number;
};

export type Rng = () => number;

/** planet_renderer.js 39-43 */
export function buildGrid3D(rng: Rng): Float32Array {
    const g = new Float32Array(GRID3 * GRID3 * GRID3);
    for (let i = 0; i < g.length; i++) g[i] = rng();
    return g;
}

/** planet_renderer.js 46-72 */
export function sample3D(g: Float32Array, x: number, y: number, z: number): number {
    x = ((x % GRID3) + GRID3) % GRID3;
    y = ((y % GRID3) + GRID3) % GRID3;
    z = ((z % GRID3) + GRID3) % GRID3;
    const ix = x | 0, iy = y | 0, iz = z | 0;
    const fx = x - ix, fy = y - iy, fz = z - iz;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const sz = fz * fz * (3 - 2 * fz);
    const x1 = (ix + 1) % GRID3, y1 = (iy + 1) % GRID3, z1 = (iz + 1) % GRID3;
    const GG = GRID3 * GRID3, G = GRID3;
    const v000 = g[iz * GG + iy * G + ix];
    const v100 = g[iz * GG + iy * G + x1];
    const v010 = g[iz * GG + y1 * G + ix];
    const v110 = g[iz * GG + y1 * G + x1];
    const v001 = g[z1 * GG + iy * G + ix];
    const v101 = g[z1 * GG + iy * G + x1];
    const v011 = g[z1 * GG + y1 * G + ix];
    const v111 = g[z1 * GG + y1 * G + x1];
    const c00 = v000 + (v100 - v000) * sx;
    const c10 = v010 + (v110 - v010) * sx;
    const c01 = v001 + (v101 - v001) * sx;
    const c11 = v011 + (v111 - v011) * sx;
    const c0  = c00  + (c10  - c00)  * sy;
    const c1  = c01  + (c11  - c01)  * sy;
    return c0 + (c1 - c0) * sz;
}

/** planet_renderer.js 76-85 */
export function fbm3D(g: Float32Array, wx: number, wy: number, wz: number, octaves: number, persistence: number): number {
    let val = 0, amp = 1, freq = CONTINENT_FREQ, total = 0;
    for (let o = 0; o < octaves; o++) {
        val   += amp * sample3D(g, wx * freq, wy * freq, wz * freq);
        total += amp;
        amp   *= persistence;
        freq  *= 2;
    }
    return val / total;
}

/** planet_renderer.js 140-157 */
export function buildContinentSeeds(rng: Rng): ContinentSeed[] {
    const count = 3 + Math.floor(rng() * 5);
    const seeds = new Array<ContinentSeed>(count);
    for (let i = 0; i < count; i++) {
        const cosTheta = rng() * 2 - 1;
        const sinTheta = Math.sqrt(1 - cosTheta * cosTheta);
        const phi      = rng() * 2 * Math.PI;
        const angRad   = (35 + rng() * 35) * Math.PI / 180;
        seeds[i] = {
            sx: sinTheta * Math.cos(phi),
            sy: cosTheta,
            sz: sinTheta * Math.sin(phi),
            cosR:     Math.cos(angRad),
            strength: 0.7 + rng() * 0.3,
        };
    }
    return seeds;
}

/** planet_renderer.js 163-191. maskWeight and warpStrength are the two slider lets. */
export function continentHeight(
    heightGrid: Float32Array,
    seeds: ContinentSeed[],
    wx: number,
    wy: number,
    wz: number,
    maskWeight: number,
    warpStrength: number,
): number {
    let mask = 0;
    for (let i = 0; i < seeds.length; i++) {
        const s   = seeds[i];
        const dot = wx * s.sx + wy * s.sy + wz * s.sz;
        if (dot > s.cosR) {
            const t  = (dot - s.cosR) / (1 - s.cosR);
            const sm = t * t * (3 - 2 * t);
            const v  = sm * s.strength;
            if (v > mask) mask = v;
        }
    }

    const f  = WARP_FREQ;
    const dx = fbm3D(heightGrid, wx * f + 1.7, wy * f + 9.2, wz * f + 3.4, 3, 0.50) - 0.5;
    const dy = fbm3D(heightGrid, wx * f + 8.3, wy * f + 2.8, wz * f + 5.1, 3, 0.50) - 0.5;
    const dz = fbm3D(heightGrid, wx * f + 4.6, wy * f + 7.1, wz * f + 0.9, 3, 0.50) - 0.5;
    const detail = fbm3D(heightGrid,
        wx + dx * warpStrength,
        wy + dy * warpStrength,
        wz + dz * warpStrength,
        6, 0.43);

    return mask * maskWeight + detail * (1 - maskWeight);
}

/** One Fibonacci sample. The formula is planet_renderer.js 199-211. */
export function writeContinentSamples(
    samples: Float32Array,
    from: number,
    count: number,
    heightGrid: Float32Array,
    seeds: ContinentSeed[],
    nSamples: number,
    maskWeight: number,
    warpStrength: number,
): number {
    const end = Math.min(nSamples, from + count);
    const goldenAngle = Math.PI * (Math.sqrt(5) - 1);
    for (let i = from; i < end; i++) {
        const cosTheta = 1 - (2 * (i + 0.5)) / nSamples;
        const sinTheta = Math.sqrt(1 - cosTheta * cosTheta);
        const phi = goldenAngle * i;
        samples[i] = continentHeight(heightGrid, seeds,
            sinTheta * Math.cos(phi), cosTheta, sinTheta * Math.sin(phi),
            maskWeight, warpStrength);
    }
    return end;
}

/** planet_renderer.js 199-211 */
export function buildCDF(
    heightGrid: Float32Array,
    seeds: ContinentSeed[],
    nSamples: number,
    maskWeight: number,
    warpStrength: number,
): Float32Array {
    const samples = new Float32Array(nSamples);
    writeContinentSamples(samples, 0, nSamples, heightGrid, seeds, nSamples, maskWeight, warpStrength);
    samples.sort();
    return samples;
}

/** planet_renderer.js 214-221 */
export function remapHeight(h: number, cdf: Float32Array): number {
    let lo = 0, hi = cdf.length - 1;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (cdf[mid] < h) lo = mid + 1; else hi = mid;
    }
    return lo / cdf.length;
}
