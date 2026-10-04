/**
 * Orbit-disc shader sources from js/planet_gl.js, character for character.
 * VERT 24-26. NOISE 31-114. FIELDS 118-165. STATS_FRAG 167-181. BAKE_FRAG 183-318.
 * The draw, ring and backdrop shaders are not part of this bake.
 *
 * Simplex noise from webgl-noise by Ian McEwan and Stefan Gustavson
 * (Ashima Arts). MIT License, Copyright (C) 2011 Ashima Arts,
 * Copyright (C) 2011-2022 Stefan Gustavson. https://github.com/stegu/webgl-noise
 *
 * Reversed-edge smoothstep calls in the bake are kept as written:
 * js/planet_gl.js:230, 237, 264, 285, 291, 294, 309, 312.
 */
import { STATS_H, STATS_W } from './gl_stats.ts';

/** js/planet_gl.js:24-26 */
export const VERT = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

/** js/planet_gl.js:31-114 */
export const NOISE = `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 10.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v) {
    const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.5 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
    m = m * m;
    return 105.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
float fbm(vec3 p, int octaves) {
    float sum = 0.0, amp = 0.5, norm = 0.0;
    for (int i = 0; i < 8; i++) {
        if (i >= octaves) break;
        sum += amp * snoise(p); norm += amp;
        amp *= 0.5; p = p * 2.03 + vec3(1.7, 9.2, 3.1);
    }
    return sum / norm;
}
float ridged(vec3 p, int octaves) {
    float sum = 0.0, amp = 0.5, norm = 0.0, prev = 1.0;
    for (int i = 0; i < 8; i++) {
        if (i >= octaves) break;
        float r = 1.0 - abs(snoise(p)); r *= r;
        sum += r * amp * prev; prev = r; norm += amp;
        amp *= 0.5; p = p * 2.1 + vec3(5.3, 1.1, 7.7);
    }
    return sum / norm;
}
vec3 hash33(vec3 p) {
    p = fract(p * vec3(0.1031, 0.1030, 0.0973));
    p += dot(p, p.yxz + 33.33);
    return fract((p.xxy + p.yxx) * p.zyx);
}
// Distance to the nearest scattered point, and that point's id.
vec2 worley(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    float best = 8.0, id = 0.0;
    for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
        vec3 o = vec3(float(x), float(y), float(z));
        vec3 h = hash33(i + o);
        vec3 r = o + h - f;
        float dd = dot(r, r);
        if (dd < best) { best = dd; id = fract(h.x * 7.13 + h.y * 3.71 + h.z * 1.97); }
    }
    return vec2(sqrt(best), id);
}
vec3 rotateAround(vec3 v, vec3 k, float a) {
    return v * cos(a) + cross(k, v) * sin(a) + k * dot(k, v) * (1.0 - cos(a));
}`;

/** js/planet_gl.js:118-165 */
export const FIELDS = `
uniform vec3 uOffset;
uniform vec4 uVort[3];
uniform float uMountains, uCraters;
float craterField(vec3 d) {
    float sum = 0.0, scale = 3.0, amp = 0.10;
    for (int i = 0; i < 3; i++) {
        vec2 w = worley(d * scale + uOffset * (1.0 + float(i)));
        float r = 0.18 + 0.28 * fract(w.y * 7.13);
        float keep = step(fract(w.y * 3.7), 0.55);
        float x = w.x / r;
        float bowl = x < 1.0 ? -(1.0 - x * x) : 0.0;
        float rim = exp(-pow((x - 1.0) / 0.18, 2.0));
        sum += keep * amp * (bowl * 0.7 + rim * 0.35);
        scale *= 2.3; amp *= 0.55;
    }
    return sum;
}
// Continents from a broad, gently warped field; coasts and hills from a finer one.
float terrainHeight(vec3 d) {
    vec3 p = d * 1.15 + uOffset;
    vec3 q = vec3(fbm(p * 0.8 + vec3(3.1, 7.7, 1.3), 3), fbm(p * 0.8 + vec3(8.4, 2.2, 5.9), 3), fbm(p * 0.8 + vec3(4.6, 9.1, 6.2), 3));
    float continents = fbm(p * 0.95 + q * 0.35, 4);
    float detail = fbm(p * 3.4 + q * 0.2, 5);
    float h = 0.5 + 0.5 * (continents * 0.78 + detail * 0.22);
    float ridge = ridged(p * 2.4 + uOffset.zxy * 0.3, 5);
    h += ridge * 0.16 * uMountains * smoothstep(0.42, 0.62, h);
    if (uCraters > 0.0) h += craterField(d) * uCraters;
    return h;
}
// Where cities would grow first: broad, clumped regions. The share of land
// they cover is set from population by the statistics pass.
float urbanRaw(vec3 d) {
    return fbm(d * 2.6 + uOffset.zxy * 1.3, 4) * 0.5 + 0.5;
}
// Clouds: a few cyclones twist the field, and stretching it along the spin
// axis lays it out in zonal streaks.
float cloudRaw(vec3 d) {
    vec3 v = d;
    for (int i = 0; i < 3; i++) {
        vec3 c = uVort[i].xyz;
        float fall = exp(-(1.0 - dot(v, c)) * 18.0);
        v = rotateAround(v, c, uVort[i].w * fall);
    }
    float w = fbm(v * 2.0 + uOffset.yzx, 3);
    vec3 p = vec3(v.x * 2.6, v.y * 2.6, v.z * 7.5) + uOffset * 1.7 + w * 0.6;
    return fbm(p, 5) * 0.5 + 0.5;
}`;

/** js/planet_gl.js:167-181. Equal-area 128 by 64 statistics target. */
export const STATS_FRAG = `#version 300 es
precision highp float;
${NOISE}
${FIELDS}
uniform float uRow;
out vec4 outColor;
void main() {
    // An equal-area map of the sphere, so every texel counts the same.
    float x = gl_FragCoord.x, y = gl_FragCoord.y - uRow;
    float z = 2.0 * y / ${STATS_H}.0 - 1.0;
    float lon = 6.28318530718 * x / ${STATS_W}.0;
    float s = sqrt(max(0.0, 1.0 - z * z));
    vec3 d = vec3(s * cos(lon), s * sin(lon), z);
    outColor = vec4(clamp(terrainHeight(d) * 0.8 + 0.1, 0.0, 1.0), cloudRaw(d), urbanRaw(d), 1.0);
}`;

/** js/planet_gl.js:183-318. Two RGBA8 cube attachments. Gas writes cube B as zero. */
export const BAKE_FRAG = `#version 300 es
precision highp float;
${NOISE}
${FIELDS}
uniform int uFace;
uniform float uSize, uSea, uCloudEdge, uCloudCover;
uniform float uGas;
uniform vec3 uRockLow, uRockHigh, uLiqShallow, uLiqDeep;
uniform float uHasLiquid, uFrozen, uWater;
uniform float uMeanC, uSpread, uLocked;
uniform float uLife, uMaturity;
uniform vec3 uCanopy, uScrub;
uniform float uPop, uVolcanism, uHot, uIce, uUrbanEdge;
uniform vec3 uGasZone, uGasBelt, uGasPole, uGasStorm;
uniform float uBands;
uniform vec4 uStorm;
layout(location = 0) out vec4 outA;
layout(location = 1) out vec4 outB;

vec3 faceDir(int face, vec2 fc) {
    float a = 2.0 * fc.x / uSize - 1.0;
    float b = 2.0 * fc.y / uSize - 1.0;
    vec3 d;
    if (face == 0) d = vec3(1.0, -b, -a);
    else if (face == 1) d = vec3(-1.0, -b, a);
    else if (face == 2) d = vec3(a, 1.0, b);
    else if (face == 3) d = vec3(a, -1.0, -b);
    else if (face == 4) d = vec3(a, -b, 1.0);
    else d = vec3(-a, -b, -1.0);
    return normalize(d);
}

vec3 gasGiant(vec3 d) {
    float lat = asin(clamp(d.z, -1.0, 1.0));
    float t = fbm(vec3(d.xy * 3.0, d.z * 14.0) + uOffset, 4);
    float pattern = sin(lat * uBands + t * 0.9 + uOffset.x)
        + 0.55 * sin(lat * uBands * 2.3 + t * 1.3 + uOffset.y)
        + 0.35 * sin(lat * 5.3 + 1.0);
    float belt = smoothstep(-0.35, 0.55, pattern);
    float eddy = fbm(vec3(d.xy * 6.0, d.z * 20.0) + uOffset.zxy, 4) * 0.5 + 0.5;
    vec3 col = mix(uGasZone, uGasBelt, pow(belt, 0.8) * (0.8 + eddy * 0.4));
    // Dark festoons where a belt meets a zone.
    col *= 1.0 - 0.18 * exp(-pow((belt - 0.5) / 0.12, 2.0)) * eddy;
    // Polar regions lose the bands to a mottle of cyclones.
    float polar = smoothstep(0.8, 0.95, abs(d.z));
    col = mix(col, mix(uGasPole, uGasZone, smoothstep(0.35, 0.7, eddy)), polar * 0.85);
    vec2 pc = worley(d * 9.0 + uOffset);
    col = mix(col, uGasZone, smoothstep(0.35, 0.0, pc.x) * polar * 0.5);
    // The great storm, stretched along its latitude.
    vec3 sd = normalize(uStorm.xyz);
    vec3 east = normalize(cross(vec3(0.0, 0.0, 1.0), sd) + vec3(1e-5));
    vec3 north = cross(sd, east);
    vec3 rel = d - sd;
    float r = length(vec2(dot(rel, east) / 1.8, dot(rel, north)));
    float storm = smoothstep(uStorm.w, uStorm.w * 0.35, r) * step(0.0, dot(d, sd));
    col = mix(col, uGasStorm, storm * 0.85);
    return col * (0.94 + (snoise(d * 30.0 + uOffset) * 0.5 + 0.5) * 0.1);
}

void main() {
    vec3 d = faceDir(uFace, gl_FragCoord.xy);
    if (uGas > 0.5) {
        outA = vec4(gasGiant(d), 0.5);
        outB = vec4(0.0);
        return;
    }
    float h = terrainHeight(d);
    float land = step(uSea, h);
    float e = max(0.0, (h - uSea) / max(0.001, 1.0 - uSea));
    float sinLat = d.z;
    // Temperature: equator to pole, or day side to night side on a locked world; cold with height.
    float localC = uLocked > 0.5
        ? uMeanC + uSpread * 0.6 * d.x - e * 28.0
        : uMeanC + (uSpread / 40.0) * (15.0 - 45.0 * sinLat * sinLat) - e * 28.0;
    vec3 col;
    float ocean = 0.0;
    if (h < uSea) {
        if (uHasLiquid > 0.5) {
            float depth = (uSea - h) / max(0.001, uSea);
            col = mix(uLiqShallow, uLiqDeep, smoothstep(0.0, 0.12, depth));
            if (uFrozen < 0.5) {
                float ice = smoothstep(-6.0, -14.0, localC);
                col = mix(col, vec3(0.89, 0.93, 0.96), ice);
                ocean = 1.0 - ice;
            }
        } else {
            col = mix(uRockLow, uRockHigh, 0.2 + h * 0.3);
        }
    } else {
        float tone = clamp(e * 1.3 + fbm(d * 6.0 + uOffset, 3) * 0.25, 0.0, 1.0);
        col = mix(uRockLow, uRockHigh, 0.35 + tone * 0.65);
        if (uLife > 0.0) {
            float moist = fbm(d * 2.4 + uOffset.zyx, 3) * 0.5 + 0.5
                - exp(-pow((abs(sinLat) - 0.45) / 0.14, 2.0)) * 0.28 + (uWater - 0.5) * 0.3;
            float mild = smoothstep(-12.0, 2.0, localC) * (1.0 - smoothstep(38.0, 52.0, localC));
            float cover = uLife * mild * smoothstep(0.22, 0.52, moist + uLife * 0.2);
            vec3 veg = mix(uScrub, uCanopy, smoothstep(0.4, 0.62, moist) * uMaturity);
            veg *= mix(0.85, 1.1, smoothstep(-5.0, 25.0, localC));
            col = mix(col, veg, cover);
        }
        if (uHasLiquid > 0.5 && uFrozen < 0.5) col = mix(col, vec3(0.86, 0.8, 0.63), (1.0 - smoothstep(0.0, 0.012, e)) * step(4.0, localC) * 0.6);
        col = mix(col, uRockHigh * 0.92, smoothstep(0.35, 0.7, e) * 0.55);
        col = mix(col, vec3(0.94, 0.955, 0.97), smoothstep(-8.0, -16.0, localC));
    }
    if (uIce > 0.5) col = mix(col, vec3(0.64, 0.44, 0.35), smoothstep(0.72, 0.95, ridged(d * 4.0 + uOffset, 4)) * 0.6);
    float lava = 0.0;
    if (uVolcanism > 0.0) {
        float cracks = smoothstep(0.78, 0.94, ridged(d * 3.0 + uOffset.yxz, 4)) * uHot;
        float basins = uHot * smoothstep(uSea, uSea - 0.05, h);
        // Active volcanoes: a few small glowing vents on land, more on stressed worlds.
        vec2 hs = worley(d * 7.0 + uOffset.zxy);
        float spots = smoothstep(0.05, 0.0, hs.x) * step(hs.y, uVolcanism * (0.12 + 0.3 * uHot)) * max(land, uHot);
        lava = clamp(max(cracks, basins) + spots * uVolcanism, 0.0, 1.0);
        col = mix(col, vec3(1.0, 0.55, 0.2), lava * (0.15 + 0.7 * uHot));
    }
    col *= 0.92 + (snoise(d * 28.0 + uOffset) * 0.5 + 0.5) * 0.16;

    // Urbanisation: how built-up the ground is, 0 to 1. Broad urban regions
    // cover the population's share of the usable ground; towns dot the rest.
    // The street network itself is drawn at screen resolution by the shader.
    float city = 0.0;
    if (uPop > 0.0) {
        float wet = uHasLiquid > 0.5 && uFrozen < 0.5 && uPop < 10.5 ? 1.0 : 0.0;
        float ground = mix(1.0, land, wet);
        float mild = smoothstep(-40.0, -10.0, localC) * (1.0 - smoothstep(55.0, 90.0, localC));
        float welcome = ground * mix(max(0.35, mild), 1.0, smoothstep(9.5, 10.5, uPop));
        float coast = uHasLiquid > 0.5 ? smoothstep(0.08, 0.0, e) * land : 0.0;
        float urban = smoothstep(uUrbanEdge - 0.02, uUrbanEdge + 0.05, urbanRaw(d) + coast * 0.06);
        vec2 w = worley(d * 11.0 + uOffset * 3.0);
        float towns = smoothstep(0.35, 0.0, w.x) * step(w.y, clamp(0.03 * pow(1.45, uPop), 0.0, 0.8)) * 0.45;
        city = clamp(max(urban, towns) * welcome, 0.0, 1.0);
    }
    float cloud = uCloudCover > 0.001 ? smoothstep(uCloudEdge - 0.02, uCloudEdge + 0.12, cloudRaw(d)) : 0.0;
    outA = vec4(clamp(col, 0.0, 1.0), clamp(h * 0.8 + 0.1, 0.0, 1.0));
    outB = vec4(ocean, city, lava, cloud);
}`;
