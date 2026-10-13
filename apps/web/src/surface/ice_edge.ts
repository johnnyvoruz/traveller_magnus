/**
 * The shape of a polar cap's edge. The climate line that sets how much ice a
 * world has stays where it is. This only moves that boundary: lobes from the
 * world's own noise, a retreat over open sea, a reach over high land.
 * A water world with no land gets the lobes alone.
 */

/** Noise lobes, degrees of latitude, zero mean. */
export const CAP_NOISE_DEG = 11;
/** Retreat over open sea, degrees. */
export const CAP_SEA_DEG = 8;
/** Extra reach over the highest land, degrees. */
export const CAP_LAND_DEG = 8;

const DEG = Math.PI / 180;
/** Furthest the vanilla edge moves, for the rows that can skip the noise. */
export const CAP_REACH_RAD = (CAP_NOISE_DEG + Math.max(CAP_SEA_DEG, CAP_LAND_DEG)) * DEG;

/** Kelvin of lobe, sea retreat and land reach on the hybrid sheet. */
const EDGE_K = 12;
const SEA_K = 10;
const LAND_K = 10;
/** The nudge fades out this far from the melting line, so the cap's interior stays ice. */
const WINDOW_K = 24;

/** True when the palette's sea is neither absent nor the whole sphere. */
export function capHasCoast(seaLevel: number): boolean {
    return seaLevel > 0.02 && seaLevel < 0.98;
}

/**
 * Radians to add to the cap's reach toward the equator.
 * noise is -1..1. elevation is 0 on the sea and 0..1 on land.
 */
export function capShiftRad(noise: number, sea: boolean, elevation: number, hasCoast: boolean): number {
    let deg = noise * CAP_NOISE_DEG;
    if (hasCoast && sea) deg -= CAP_SEA_DEG;
    else if (!sea) deg += CAP_LAND_DEG * elevation;
    return deg * DEG;
}

function mix(n: number): number {
    let x = n | 0;
    x = Math.imul(x ^ (x >>> 16), 2246822507);
    x = Math.imul(x ^ (x >>> 13), 3266489909);
    return (x ^ (x >>> 16)) >>> 0;
}

/**
 * Value noise, -1..1. capDetail sums several scales so the painted edge is not one scallop.
 */
function valueNoise(x: number, y: number, z: number, scale: number, seed: number): number {
    const fx = x * scale;
    const fy = y * scale;
    const fz = z * scale;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const z0 = Math.floor(fz);
    const tx = fx - x0;
    const ty = fy - y0;
    const tz = fz - z0;
    const sx = tx * tx * (3 - 2 * tx);
    const sy = ty * ty * (3 - 2 * ty);
    const sz = tz * tz * (3 - 2 * tz);
    const cell = (ix: number, iy: number, iz: number): number =>
        mix(seed ^ Math.imul(ix + 31, 374761393) ^ Math.imul(iy + 17, 668265263) ^ Math.imul(iz + 13, 1274126177)) / 4294967295;
    const n000 = cell(x0, y0, z0);
    const n100 = cell(x0 + 1, y0, z0);
    const n010 = cell(x0, y0 + 1, z0);
    const n110 = cell(x0 + 1, y0 + 1, z0);
    const n001 = cell(x0, y0, z0 + 1);
    const n101 = cell(x0 + 1, y0, z0 + 1);
    const n011 = cell(x0, y0 + 1, z0 + 1);
    const n111 = cell(x0 + 1, y0 + 1, z0 + 1);
    const nx00 = n000 + (n100 - n000) * sx;
    const nx10 = n010 + (n110 - n010) * sx;
    const nx01 = n001 + (n101 - n001) * sx;
    const nx11 = n011 + (n111 - n011) * sx;
    const nxy0 = nx00 + (nx10 - nx00) * sy;
    const nxy1 = nx01 + (nx11 - nx01) * sy;
    return (nxy0 + (nxy1 - nxy0) * sz) * 2 - 1;
}

/** Value noise, -1..1, from a world direction and the cap seed. The vanilla map uses this. */
export function capNoise(x: number, y: number, z: number, seed: number): number {
    return valueNoise(x, y, z, 2.4, seed);
}

/**
 * The sheet's painted margin. Several scales, and a different seed on the
 * south pole. The hex ice and the vanilla map stay on capNoise.
 */
export function capDetail(x: number, y: number, z: number, seed: number): number {
    const ps = (z < 0 ? (seed ^ 0x51ce) : seed) | 0;
    const lobe = valueNoise(x, y, z, 2.4, ps);
    const extra = valueNoise(x, y, z, 1.1, ps ^ 0x9e37) * 0.45
        + valueNoise(x, y, z, 6.4, ps ^ 0x85eb) * 0.35
        + valueNoise(x, y, z, 13.0, ps ^ 0xc0ff) * 0.20;
    const n = lobe * 0.62 + extra * 0.38;
    return n < -1 ? -1 : n > 1 ? 1 : n;
}

/**
 * Temperature the ice test should see. Layouts with no cap edge (frozen, molten,
 * scorched) are unchanged. Elsewhere the nudge is zero away from the melting line.
 * A positive nudge makes the point colder, so the cap reaches further.
 */
export function edgeTemp(
    temperatureK: number,
    meltK: number,
    noise: number,
    water: boolean,
    elevation: number,
    hasCoast: boolean,
    layout: string,
): number {
    if (layout === 'frozen' || layout === 'molten' || layout === 'scorched') return temperatureK;
    const dist = Math.abs(temperatureK - meltK);
    if (dist >= WINDOW_K) return temperatureK;
    const fade = 1 - dist / WINDOW_K;
    let colder = noise * EDGE_K;
    if (hasCoast && water) colder -= SEA_K;
    else if (!water) colder += LAND_K * Math.max(0, Math.min(1, elevation));
    return temperatureK - colder * fade;
}
