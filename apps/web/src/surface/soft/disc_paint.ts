/**
 * One orbit disc painted in software from a globe (soft/globe.ts), for a browser without WebGL.
 * The geometry is the WebGL disc's (vanilla/gl_shade.ts): an orthographic sphere seen from
 * above the ecliptic, view space x right, y down the screen, z toward the viewer; the spin axis
 * tipped by the tilt toward the profile's azimuth (gl_plan.ts axisBasis); planet space turned
 * by the spin (toPlanet). Planet space z is north. Longitude is atan2(-y, x) in planet space, so
 * the map reads the right way round, not mirrored, and planet +x (where a locked world faces
 * its star) is longitude 0 before the globe's own offset.
 *
 * The light is the WebGL disc's diffuse term: the same wrap, ambient, limb factor, eclipses by
 * casters and the ring's shadow. Plainer than WebGL: no clouds, city lights, relief, sun glint
 * or halo. Rings keep their density profile without the clumps and spokes.
 */
import { axisBasis } from '../vanilla/gl_plan.ts';
import type { Globe } from './globe.ts';

export type SoftRing = {
    readonly inner: number;
    readonly outer: number;
    /** The batch's fill times the profile's opacity (gl_shade.ts uRingOpacity). */
    readonly opacity: number;
    readonly gaps: readonly number[];
    readonly seed: number;
    /** 0 to 255, inner edge and outer edge. */
    readonly inside: readonly number[];
    readonly outside: readonly number[];
};

export type SoftDiscSpec = {
    readonly key: string;
    /** Device pixels the tile is painted for. */
    readonly radiusPx: number;
    readonly spin: number;
    readonly sweep: number;
    readonly tiltDeg: number;
    readonly axisAzimuth: number;
    /** Added to the longitude before the globe is read (a locked hybrid sheet's star side). */
    readonly lonOffset: number;
    readonly light: readonly number[];
    readonly sun: readonly number[];
    readonly casters: readonly (readonly number[])[];
    readonly lightMode: boolean;
    /** profile.air.strength: the terminator's wrap. */
    readonly air: number;
    readonly gas: boolean;
    readonly ring: SoftRing | null;
};

export type DiscGeometry = {
    readonly side: number;
    readonly radius: number;
    readonly axis: readonly number[];
    /** Planet pixels: tile index, view normal, latitude as 0 (north) to 1 (south), base angle, edge cover. */
    readonly count: number;
    readonly index: Int32Array;
    readonly nx: Float32Array;
    readonly ny: Float32Array;
    readonly nz: Float32Array;
    readonly v: Float32Array;
    readonly theta: Float32Array;
    readonly cover: Float32Array;
    /** Planet depth per tile pixel, -1e9 off the planet. */
    readonly depth: Float32Array;
    /** Ring-plane pixels: tile index, the plane point and its distance from the centre. */
    readonly ringCount: number;
    readonly ringIndex: Int32Array;
    readonly ringP: Float32Array;
    readonly ringRho: Float32Array;
};

export type SoftTile = {
    readonly side: number;
    readonly pixels: Uint8ClampedArray;
};

/** The tile's side for a radius: the disc, or the ring's reach, and a pixel each side. */
export function softTileSide(radius: number, ringOuter: number | null): number {
    return Math.ceil(2 * radius * Math.max(1, ringOuter !== null ? ringOuter * 1.01 : 0)) + 2;
}

export function discGeometry(radius: number, tiltDeg: number, axisAzimuth: number, ring: { inner: number; outer: number } | null): DiscGeometry {
    const side = softTileSide(radius, ring ? ring.outer : null);
    const { axis, e1, e2 } = axisBasis({ axisAzimuth }, tiltDeg);
    const half = side / 2;
    const n = side * side;
    const index: number[] = [];
    const nx: number[] = [];
    const ny: number[] = [];
    const nz: number[] = [];
    const v: number[] = [];
    const theta: number[] = [];
    const cover: number[] = [];
    const depth = new Float32Array(n).fill(-1e9);
    const ringIndex: number[] = [];
    const ringP: number[] = [];
    const ringRho: number[] = [];
    const edge = 1 + 0.5 / radius;
    const az = Math.abs(axis[2]) < 0.02 ? (axis[2] < 0 ? -0.02 : 0.02) : axis[2];
    for (let py = 0; py < side; py += 1) {
        const y = (py + 0.5 - half) / radius;
        for (let px = 0; px < side; px += 1) {
            const x = (px + 0.5 - half) / radius;
            const k = py * side + px;
            const d = Math.hypot(x, y);
            if (d < edge) {
                const z = Math.sqrt(Math.max(0, 1 - d * d));
                const sx = d > 1 ? x / d : x;
                const sy = d > 1 ? y / d : y;
                const p0 = sx * e1[0] + sy * e1[1] + z * e1[2];
                const p1 = sx * e2[0] + sy * e2[1] + z * e2[2];
                const p2 = sx * axis[0] + sy * axis[1] + z * axis[2];
                index.push(k);
                nx.push(sx);
                ny.push(sy);
                nz.push(z);
                v.push((Math.PI / 2 - Math.asin(Math.max(-1, Math.min(1, p2)))) / Math.PI);
                theta.push(Math.atan2(p1, p0));
                cover.push(Math.min(1, Math.max(0, (1 - d) * radius + 0.5)));
                depth[k] = z;
            }
            if (ring) {
                const pz = -(axis[0] * x + axis[1] * y) / az;
                const rho = Math.hypot(x, y, pz);
                if (rho >= ring.inner && rho <= ring.outer) {
                    ringIndex.push(k);
                    ringP.push(x, y, pz);
                    ringRho.push(rho);
                }
            }
        }
    }
    return {
        side, radius, axis,
        count: index.length,
        index: Int32Array.from(index),
        nx: Float32Array.from(nx),
        ny: Float32Array.from(ny),
        nz: Float32Array.from(nz),
        v: Float32Array.from(v),
        theta: Float32Array.from(theta),
        cover: Float32Array.from(cover),
        depth,
        ringCount: ringIndex.length,
        ringIndex: Int32Array.from(ringIndex),
        ringP: Float32Array.from(ringP),
        ringRho: Float32Array.from(ringRho),
    };
}

/** Running sums along each globe row, for the spin blur. (W + 1) × H × 3. */
export function globeRowSums(globe: Globe): Float32Array {
    const { width: W, height: H, pixels } = globe;
    const sums = new Float32Array((W + 1) * H * 3);
    for (let i = 0; i < H; i += 1) {
        let r = 0;
        let g = 0;
        let b = 0;
        const base = i * (W + 1) * 3;
        for (let j = 0; j < W; j += 1) {
            const k = (i * W + j) * 4;
            r += pixels[k];
            g += pixels[k + 1];
            b += pixels[k + 2];
            const s = base + (j + 1) * 3;
            sums[s] = r;
            sums[s + 1] = g;
            sums[s + 2] = b;
        }
    }
    return sums;
}

function smoothstep(a: number, b: number, x: number): number {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
}

/** gl_shade.ts ringDensity. */
function ringDensity(ring: SoftRing, rho: number): number {
    const x = (rho - ring.inner) / Math.max(1e-4, ring.outer - ring.inner);
    const s = ring.seed;
    const fine = 0.55 + 0.25 * (Math.sin(x * 40 + s) * 0.5 + 0.5)
        + 0.12 * (Math.sin(x * 113 + s * 1.7) * 0.5 + 0.5)
        + 0.08 * (Math.sin(x * 271 + s * 2.3) * 0.5 + 0.5);
    const envelope = smoothstep(0, 0.08, x) * (1 - smoothstep(0.9, 1, x));
    const gaps = (1 - 0.92 * Math.exp(-Math.pow((x - (ring.gaps[0] ?? 0)) / 0.02, 2)))
        * (1 - 0.8 * Math.exp(-Math.pow((x - (ring.gaps[1] ?? 0)) / 0.008, 2)));
    const zone = (0.4 + 0.6 * smoothstep(0.12, 0.32, x)) * (1 - 0.35 * smoothstep(0.6, 0.78, x));
    return Math.min(1, Math.max(0, envelope * gaps * zone * fine));
}

/** gl_shade.ts ringShadow: the share of sunlight the ring takes from a point on the planet. */
function ringShadow(ring: SoftRing, axis: readonly number[], lx: number, ly: number, x: number, y: number, z: number): number {
    const la = lx * axis[0] + ly * axis[1];
    if (Math.abs(la) < 1e-3) return 0;
    const t = -(x * axis[0] + y * axis[1] + z * axis[2]) / la;
    if (t <= 0) return 0;
    const rho = Math.hypot(x + lx * t, y + ly * t, z);
    if (rho < ring.inner || rho > ring.outer) return 0;
    return ringDensity(ring, rho) * ring.opacity;
}

const TAU = Math.PI * 2;

/**
 * Paints one tile. rowSums is needed only when the spin sweeps more than a texel and a half
 * in a frame; without it the disc is drawn unblurred.
 */
export function paintSoftDisc(globe: Globe, spec: SoftDiscSpec, geo: DiscGeometry, rowSums: Float32Array | null): SoftTile {
    const { width: W, height: H, pixels: tex } = globe;
    const side = geo.side;
    const out = new Uint8ClampedArray(side * side * 4);
    const lx = spec.light[0] ?? 0;
    const ly = spec.light[1] ?? 0;
    const sun = spec.sun;
    const wrap = 0.04 + Math.min(spec.air, 1.4) * 0.1;
    const ambient = spec.lightMode ? 0.45 : 0.03;
    const ring = spec.ring;
    const axis = geo.axis;
    const casters = spec.casters.slice(0, 4);
    const blurTex = (spec.sweep / TAU) * W;
    const blur = rowSums !== null && blurTex >= 1.5;
    const turn = spec.spin + spec.lonOffset;
    // Unpremultiplied planet colour and its alpha, kept for the ring composite.
    const planet = ring ? new Float32Array(side * side * 4) : null;
    for (let p = 0; p < geo.count; p += 1) {
        const x = geo.nx[p];
        const y = geo.ny[p];
        const z = geo.nz[p];
        let lon = turn - geo.theta[p];
        lon -= Math.floor((lon + Math.PI) / TAU) * TAU;
        const fu = ((lon + Math.PI) / TAU) * W - 0.5;
        const fv = geo.v[p] * H - 0.5;
        let r: number;
        let g: number;
        let b: number;
        if (blur) {
            const row = Math.min(H - 1, Math.max(0, Math.round(fv)));
            const ja = Math.round(fu - blurTex / 2);
            const jb = Math.max(ja + 1, Math.round(fu + blurTex / 2));
            const base = row * (W + 1) * 3;
            const sumAt = (k: number, c: number): number => {
                const wraps = Math.floor(k / W);
                const j = k - wraps * W;
                return wraps * (rowSums as Float32Array)[base + W * 3 + c] + (rowSums as Float32Array)[base + j * 3 + c];
            };
            const count = jb - ja;
            r = (sumAt(jb, 0) - sumAt(ja, 0)) / count;
            g = (sumAt(jb, 1) - sumAt(ja, 1)) / count;
            b = (sumAt(jb, 2) - sumAt(ja, 2)) / count;
        } else {
            let j0 = Math.floor(fu);
            const tx = fu - j0;
            j0 = ((j0 % W) + W) % W;
            const j1 = (j0 + 1) % W;
            let i0 = Math.floor(fv);
            let ty = fv - i0;
            let i1 = i0 + 1;
            if (i0 < 0) { i0 = 0; i1 = 0; ty = 0; }
            if (i1 > H - 1) { i1 = H - 1; if (i0 > H - 1) i0 = H - 1; }
            const k00 = (i0 * W + j0) * 4;
            const k01 = (i0 * W + j1) * 4;
            const k10 = (i1 * W + j0) * 4;
            const k11 = (i1 * W + j1) * 4;
            const w00 = (1 - tx) * (1 - ty);
            const w01 = tx * (1 - ty);
            const w10 = (1 - tx) * ty;
            const w11 = tx * ty;
            r = tex[k00] * w00 + tex[k01] * w01 + tex[k10] * w10 + tex[k11] * w11;
            g = tex[k00 + 1] * w00 + tex[k01 + 1] * w01 + tex[k10 + 1] * w10 + tex[k11 + 1] * w11;
            b = tex[k00 + 2] * w00 + tex[k01 + 2] * w01 + tex[k10 + 2] * w10 + tex[k11 + 2] * w11;
        }
        let lit = 1;
        for (const c of casters) {
            const cx = c[0] ?? 0;
            const cy = c[1] ?? 0;
            const rc = c[2] ?? 0;
            const t = (cx - x) * lx + (cy - y) * ly;
            if (t > 0) {
                const miss = Math.hypot(cx - (x + lx * t), cy - (y + ly * t), -z);
                lit *= smoothstep(rc * (0.88 - 0.02 * t), rc * (1.08 + 0.02 * t), miss);
            }
        }
        if (ring) lit *= 1 - 0.85 * ringShadow(ring, axis, lx, ly, x, y, z);
        const diffuse = Math.pow(Math.min(1, Math.max(0, (x * lx + y * ly + wrap) / (1 + wrap))), 0.85) * lit;
        let light = ambient + (1 - ambient) * diffuse;
        light *= spec.gas ? 0.72 + 0.28 * Math.sqrt(z) : 0.9 + 0.1 * z;
        const k = geo.index[p] * 4;
        const cr = r * light * (sun[0] ?? 1);
        const cg = g * light * (sun[1] ?? 1);
        const cb = b * light * (sun[2] ?? 1);
        const a = geo.cover[p];
        if (planet) {
            planet[k] = cr;
            planet[k + 1] = cg;
            planet[k + 2] = cb;
            planet[k + 3] = a;
        }
        out[k] = cr;
        out[k + 1] = cg;
        out[k + 2] = cb;
        out[k + 3] = a * 255;
    }
    if (ring && planet) paintRing(out, planet, ring, spec, geo, lx, ly);
    return { side, pixels: out };
}

/** gl_shade.ts shadeRings, without clumps and spokes, composited by depth against the planet. */
function paintRing(out: Uint8ClampedArray, planet: Float32Array, ring: SoftRing, spec: SoftDiscSpec, geo: DiscGeometry, lx: number, ly: number): void {
    const axis = geo.axis;
    const sun = spec.sun;
    let lit = 0.62 + 0.5 * Math.sqrt(Math.abs(lx * axis[0] + ly * axis[1]));
    if (spec.lightMode) lit = Math.max(lit, 0.8);
    for (let q = 0; q < geo.ringCount; q += 1) {
        const px = geo.ringP[q * 3];
        const py = geo.ringP[q * 3 + 1];
        const pz = geo.ringP[q * 3 + 2];
        const rho = geo.ringRho[q];
        const x = (rho - ring.inner) / (ring.outer - ring.inner);
        const a = Math.min(1, Math.max(0, ringDensity(ring, rho) * ring.opacity));
        if (!(a > 0.002)) continue;
        const t = -(px * lx + py * ly);
        let shadow = t > 0 ? 1 - smoothstep(0.96, 1.04, Math.hypot(px + lx * t, py + ly * t, pz)) : 0;
        if (spec.lightMode) shadow *= 0.5;
        const mixT = smoothstep(0.1, 1, x);
        const grain = 0.88 + 0.24 * (Math.sin(rho * 37 + ring.seed) * 0.5 + 0.5);
        const shade = lit * (1 - 0.85 * shadow) * grain;
        const k = geo.ringIndex[q];
        const o = k * 4;
        // Premultiplied ring colour.
        const rr = Math.min(255, (ring.inside[0] + (ring.outside[0] - ring.inside[0]) * mixT) * shade * (sun[0] ?? 1)) * a;
        const rg = Math.min(255, (ring.inside[1] + (ring.outside[1] - ring.inside[1]) * mixT) * shade * (sun[1] ?? 1)) * a;
        const rb = Math.min(255, (ring.inside[2] + (ring.outside[2] - ring.inside[2]) * mixT) * shade * (sun[2] ?? 1)) * a;
        const pa = planet[o + 3];
        const pr = planet[o] * pa;
        const pg = planet[o + 1] * pa;
        const pb = planet[o + 2] * pa;
        let r: number;
        let g: number;
        let b: number;
        let alpha: number;
        if (pz > geo.depth[k]) {
            r = rr + pr * (1 - a);
            g = rg + pg * (1 - a);
            b = rb + pb * (1 - a);
            alpha = a + pa * (1 - a);
        } else {
            r = pr + rr * (1 - pa);
            g = pg + rg * (1 - pa);
            b = pb + rb * (1 - pa);
            alpha = pa + a * (1 - pa);
        }
        if (alpha <= 0) continue;
        out[o] = r / alpha;
        out[o + 1] = g / alpha;
        out[o + 2] = b / alpha;
        out[o + 3] = alpha * 255;
    }
}
