/**
 * Statistics read back from the equal-area target.
 * js/planet_gl.js:20 and 833-889. Gas never reaches this decoder (1010-1011).
 */

export const STATS_W = 128;
export const STATS_H = 64;
export const STATS_BATCH = 16;

export type StatsLiquid = { frozen?: boolean; shallow?: number[]; deep?: number[] } | null;

/** The profile fields the statistics pass reads. */
export type StatsFields = {
    kind: string;
    liquid: StatsLiquid;
    water: number;
    clouds: { cover: number };
    lights: { pop: number; coverage?: number };
};

export type DecodedThresholds = {
    sea: number;
    cloudEdge: number;
    urbanEdge: number;
    port: [number, number, number];
};

/** js/planet_gl.js:834-837. An empty sample list returns 0.5. */
export function percentile(sorted: ArrayLike<number>, share: number): number {
    if (!sorted.length) return 0.5;
    return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * share)))] ?? 0.5;
}

/** js/planet_gl.js:863-864. Liquid worlds clamp the water share. The others use a fixed share. */
export function seaShare(profile: StatsFields): number {
    return profile.liquid
        ? Math.min(0.97, Math.max(0.02, profile.water))
        : ({ barren: 0.35, hot: 0.3, ice: 0.4, exotic: 0.4, storm: 0.5, rad: 0.35 } as Record<string, number>)[profile.kind] ?? 0.1;
}

/**
 * js/planet_gl.js:852-888. `pixels` is one world's RGBA8 statistics target
 * (128 by 64). Height undoes the `* 0.8 + 0.1` store.
 */
export function thresholdsFromStats(profile: StatsFields, pixels: Uint8Array): DecodedThresholds {
    const per = STATS_W * STATS_H;
    if (pixels.length < per * 4) throw new Error('statistics target is short');
    const heights = new Float32Array(per);
    const clouds = new Float32Array(per);
    const urban = new Float32Array(per);
    for (let k = 0; k < per; k++) {
        const o = k * 4;
        heights[k] = ((pixels[o] ?? 0) / 255 - 0.1) / 0.8;
        clouds[k] = (pixels[o + 1] ?? 0) / 255;
        urban[k] = (pixels[o + 2] ?? 0) / 255;
    }
    const byHeight = Float32Array.from(heights).sort();
    clouds.sort();
    const sea = percentile(byHeight, seaShare(profile));
    const wet = !!(profile.liquid && !profile.liquid.frozen && profile.lights.pop < 11);
    const ground: number[] = [];
    for (let k = 0; k < per; k++) if (!wet || (heights[k] ?? 0) >= sea) ground.push(urban[k] ?? 0);
    ground.sort((a, b) => a - b);
    const coverage = profile.lights.coverage || 0;
    let best = -1;
    let bestK = 0;
    for (const minZ of [0.3, -1]) {
        for (let k = 0; k < per; k++) {
            if (wet && (heights[k] ?? 0) < sea) continue;
            if (2 * (Math.floor(k / STATS_W) + 0.5) / STATS_H - 1 < minZ) continue;
            if ((urban[k] ?? 0) > best) {
                best = urban[k] ?? 0;
                bestK = k;
            }
        }
        if (best >= 0) break;
    }
    const col = bestK % STATS_W;
    const row = Math.floor(bestK / STATS_W);
    const pz = 2 * (row + 0.5) / STATS_H - 1;
    const lon = 2 * Math.PI * (col + 0.5) / STATS_W;
    const ps = Math.sqrt(Math.max(0, 1 - pz * pz));
    return {
        sea,
        cloudEdge: percentile(clouds, 1 - profile.clouds.cover),
        urbanEdge: coverage > 0 && ground.length ? percentile(ground, 1 - coverage) : 2,
        port: [ps * Math.cos(lon), ps * Math.sin(lon), pz],
    };
}

/** js/planet_gl.js:1010-1011. No statistics target is drawn for a gas giant. */
export function gasStats(): { sea: number; cloudEdge: number } {
    return { sea: 0, cloudEdge: 1 };
}
