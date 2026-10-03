// GPU planet renderer for orbit view. No generation logic: it draws what
// PlanetProfile says a world looks like.
//
// Each world is painted once into a pair of cube maps (colour + height;
// water, city lights, lava, clouds). Every frame, every visible world is
// shaded into a tile of one shared WebGL canvas: sunlight, relief, glint,
// cloud shadows, eclipses, night lights, atmosphere, and motion blur along
// the spin. Orbit view copies each tile where it used to draw a flat disc,
// so its layout, labels, and hit testing are untouched.
window.PlanetGL = (() => {
    'use strict';
    let canvas = null, gl = null, broken = false, lost = false, anisotropy = null;
    let programs = null, quad = null, statsTarget = null;
    const worlds = new Map();
    let tiles = new Map();
    let frame = 0;
    let memory = 0;
    const MEMORY_BUDGET = 320 * 1024 * 1024;
    const HALO = 0.16;
    const STATS_W = 128, STATS_H = 64, STATS_BATCH = 16;
    const SIZES = [32, 64, 128, 256, 512, 1024];

    // ── Shaders ───────────────────────────────────────────────────────────
    const VERT = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

    // Simplex noise from webgl-noise by Ian McEwan and Stefan Gustavson
    // (Ashima Arts). MIT License, Copyright (C) 2011 Ashima Arts,
    // Copyright (C) 2011-2022 Stefan Gustavson. https://github.com/stegu/webgl-noise
    const NOISE = `
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

    // Terrain and weather fields, shared by the statistics pass and the bake,
    // so the sea level measured on one matches the coastlines painted on the other.
    const FIELDS = `
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

    const STATS_FRAG = `#version 300 es
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

    const BAKE_FRAG = `#version 300 es
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

    const DRAW_FRAG = `#version 300 es
precision highp float;
uniform samplerCube uA;
uniform samplerCube uB;
uniform vec3 uTile;
uniform float uRadiusPx, uHalo;
uniform vec3 uAxis, uE1, uE2;
uniform float uSpin, uSweep, uCloudSpin, uBlurBias;
uniform int uSamples;
uniform vec3 uLight, uSun, uAir, uCloudColor, uCityColor, uOffset;
uniform float uAirStrength, uCityGain, uNeon, uIridescent, uAlbedo, uCityGlow, uUrbanShine;
uniform float uTime, uDetail, uCityHaze;
uniform vec3 uUrbanColor, uGlassColor;
uniform vec4 uPort;
uniform vec3 uPortView;
uniform vec3 uPortColor;
uniform float uGas, uBump, uLightMode, uHasClouds;
uniform vec4 uCasters[4];
uniform int uCasterCount;
uniform float uRingInner, uRingOuter, uRingOpacity, uRingSeed, uRingPhase, uRingDetail;
uniform vec2 uRingGaps;
uniform vec3 uRingColorA, uRingColorB;
out vec4 outColor;

float hash13(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.zyx + 31.32);
    return fract((p.x + p.y) * p.z);
}
float vnoise(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = mix(hash13(i), hash13(i + vec3(1.0, 0.0, 0.0)), f.x);
    float b = mix(hash13(i + vec3(0.0, 1.0, 0.0)), hash13(i + vec3(1.0, 1.0, 0.0)), f.x);
    float c = mix(hash13(i + vec3(0.0, 0.0, 1.0)), hash13(i + vec3(1.0, 0.0, 1.0)), f.x);
    float d = mix(hash13(i + vec3(0.0, 1.0, 1.0)), hash13(i + vec3(1.0, 1.0, 1.0)), f.x);
    return mix(mix(a, b, f.y), mix(c, d, f.y), f.z);
}
// Thin-film colours for an unusual (F) atmosphere.
vec3 iridescence(float t) {
    return 0.55 + 0.45 * cos(6.28318 * (vec3(0.0, 0.33, 0.67) + t));
}
vec3 airTint(float t, float weight) {
    return mix(uAir, iridescence(t), uIridescent * weight);
}

// View space: x right, y down the screen, z toward the viewer.
// Planet space: z along the spin axis, turned by the spin.
vec3 toPlanet(vec3 n, float spin) {
    vec3 p = vec3(dot(n, uE1), dot(n, uE2), dot(n, uAxis));
    float c = cos(spin), s = sin(spin);
    return vec3(c * p.x + s * p.y, -s * p.x + c * p.y, p.z);
}

vec3 hash33(vec3 p) {
    p = fract(p * vec3(0.1031, 0.1030, 0.0973));
    p += dot(p, p.yxz + 33.33);
    return fract((p.xxy + p.yxx) * p.zyx);
}
// Nearest and second-nearest scattered points, and the nearest one's id.
// Where the two distances meet is a cell edge: a road.
vec3 worleyF(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    float d1 = 8.0, d2 = 8.0, id = 0.0;
    for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
        vec3 o = vec3(float(x), float(y), float(z));
        vec3 h = hash33(i + o);
        vec3 r = o + h - f;
        float dd = dot(r, r);
        if (dd < d1) { d2 = d1; d1 = dd; id = h.x; }
        else if (dd < d2) d2 = dd;
    }
    return vec3(sqrt(d1), sqrt(d2), id);
}
// A lit road along the cell edges. 'width' is its true width and 'fw' one
// screen pixel, both in cell units. A road thinner than a pixel is drawn a
// pixel wide and dimmed to match, so it stays a crisp line; once the cells
// themselves are only a few pixels across, it settles to its average
// brightness instead of glittering.
float roads(vec3 w, float width, float fw) {
    fw = max(fw, 1e-4);
    float ew = max(width, fw * 0.85);
    float line = (1.0 - smoothstep(ew * 0.5, ew * 0.5 + fw, (w.y - w.x) * 0.5)) * sqrt(width / ew);
    return mix(line, min(1.0, width * 2.5), smoothstep(0.18, 0.45, fw));
}
// A district's light: the tech level's light, or on high-tech worlds, neon.
vec3 districtTint(float id) {
    if (uNeon <= 0.0) return uCityColor;
    float hue = fract(id * 7.13);
    vec3 neon = hue < 0.28 ? vec3(1.0, 0.16, 0.72)
        : hue < 0.52 ? vec3(0.12, 0.92, 1.0)
        : hue < 0.7 ? vec3(0.38, 0.32, 1.0)
        : hue < 0.86 ? vec3(1.0, 0.32, 0.42)
        : vec3(0.72, 0.28, 1.0);
    return mix(uCityColor, neon * 1.5, step(fract(id * 3.71), uNeon * 0.9));
}

// Rings: ringlets, a broad bright middle, and two divisions.
float ringDensity(float rho) {
    float x = (rho - uRingInner) / max(1e-4, uRingOuter - uRingInner);
    float s = uRingSeed;
    float fine = 0.55 + 0.25 * (sin(x * 40.0 + s) * 0.5 + 0.5)
        + 0.12 * (sin(x * 113.0 + s * 1.7) * 0.5 + 0.5)
        + 0.08 * (sin(x * 271.0 + s * 2.3) * 0.5 + 0.5);
    float envelope = smoothstep(0.0, 0.08, x) * (1.0 - smoothstep(0.9, 1.0, x));
    float gaps = (1.0 - 0.92 * exp(-pow((x - uRingGaps.x) / 0.02, 2.0)))
        * (1.0 - 0.8 * exp(-pow((x - uRingGaps.y) / 0.008, 2.0)));
    float zone = mix(0.4, 1.0, smoothstep(0.12, 0.32, x)) * (1.0 - 0.35 * smoothstep(0.6, 0.78, x));
    return clamp(envelope * gaps * zone * fine, 0.0, 1.0);
}
// Share of sunlight the rings take from a point on the planet.
float ringShadow(vec3 point) {
    if (uRingOuter <= 0.0) return 0.0;
    float la = dot(uLight, uAxis);
    if (abs(la) < 1e-3) return 0.0;
    float t = -dot(point, uAxis) / la;
    if (t <= 0.0) return 0.0;
    float rho = length(point + uLight * t);
    if (rho < uRingInner || rho > uRingOuter) return 0.0;
    return ringDensity(rho) * uRingOpacity;
}
// The ring plane under this pixel, premultiplied, and its depth.
vec4 shadeRings(vec2 p, out float depth) {
    depth = -1e9;
    if (uRingOuter <= 0.0) return vec4(0.0);
    float az = abs(uAxis.z) < 0.02 ? (uAxis.z < 0.0 ? -0.02 : 0.02) : uAxis.z;
    vec3 P = vec3(p, -(uAxis.x * p.x + uAxis.y * p.y) / az);
    float rho = length(P);
    if (rho < uRingInner || rho > uRingOuter) return vec4(0.0);
    depth = P.z;
    float x = (rho - uRingInner) / (uRingOuter - uRingInner);
    // Clumps and spokes, sheared as inner orbits run ahead of outer ones.
    float phi = atan(dot(P, uE2), dot(P, uE1)) - uRingPhase * pow(rho / uRingInner, -1.5);
    float clump = vnoise(vec3(rho * 55.0 + uRingSeed, cos(phi) * 9.0, sin(phi) * 9.0));
    float spokes = vnoise(vec3(rho * 3.0 + uRingSeed, cos(phi) * 30.0, sin(phi) * 30.0));
    float detail = mix(1.0, (0.8 + 0.4 * clump) * (1.0 - 0.2 * smoothstep(0.55, 0.85, spokes) * smoothstep(0.25, 0.45, x) * (1.0 - smoothstep(0.6, 0.7, x))), uRingDetail);
    float a = clamp(ringDensity(rho) * uRingOpacity * detail, 0.0, 1.0);
    vec3 color = mix(uRingColorA, uRingColorB, smoothstep(0.1, 1.0, x)) * (0.88 + 0.24 * (sin(rho * 37.0 + uRingSeed) * 0.5 + 0.5));
    // Lit by the sun's height above the ring plane, darkened where the planet shadows it.
    // Scattering keeps even an edge-lit ring glowing faintly.
    float lit = 0.62 + 0.5 * sqrt(abs(dot(uLight, uAxis)));
    float t = -dot(P, uLight);
    float shadow = t > 0.0 ? 1.0 - smoothstep(0.96, 1.04, length(P + uLight * t)) : 0.0;
    if (uLightMode > 0.5) { lit = max(lit, 0.8); shadow *= 0.5; }
    color *= uSun * lit * (1.0 - 0.85 * shadow);
    return vec4(clamp(color, 0.0, 1.0) * a, a);
}

vec4 halo(vec2 p, float d) {
    if ((uAirStrength <= 0.0 && uCityHaze <= 0.0) || uLightMode > 0.5) return vec4(0.0);
    float reach = 1.0 + uHalo;
    float shell = 0.03 + min(uAirStrength, 1.4) * 0.035;
    float alt = max(0.0, d - 1.0) / shell;
    float facing = dot(p / max(d, 1e-4), uLight.xy);
    float limb = uAirStrength * 0.075 * pow(7.0, 0.95);
    float amount = limb * exp(-alt * 1.6) * (1.0 + 0.6 * exp(-alt * 6.0))
        * smoothstep(-0.45, 0.45, facing) * smoothstep(reach, 1.0 + uHalo * 0.45, d);
    float sunset = exp(-pow((facing + 0.02) / 0.14, 2.0)) * (uGas > 0.5 ? 0.2 : 0.65);
    vec3 c = mix(airTint(alt * 0.35 + facing * 0.6 + 0.2, 0.85), vec3(1.0, 0.55, 0.31), sunset) * amount * uSun;
    // A heavily built world's night-side air glows with its cities.
    c += mix(uCityColor, vec3(0.75, 0.4, 1.0), uNeon * 0.6) * uCityHaze * 0.25
        * exp(-alt * 1.6) * smoothstep(0.25, -0.35, facing) * smoothstep(reach, 1.0 + uHalo * 0.45, d);
    float a = clamp(max(c.r, max(c.g, c.b)), 0.0, 1.0);
    return vec4(min(c, vec3(a)), a);
}

float seenPort(float z) { return smoothstep(0.02, 0.2, z); }
vec4 shadePlanet(vec2 p, float d, float aa, out float depth) {
    depth = -1e9;
    if (d > 1.0 + aa) return vec4(0.0);
    float z = sqrt(max(0.0, 1.0 - min(d * d, 1.0)));
    depth = z;
    vec3 n = vec3(p, z);

    // Motion blur: average the surface over the angle it turns in one frame.
    // Samples are jittered per pixel so a long sweep reads as smooth, not as
    // ghost copies, and taken from a softer mip level as they spread apart.
    int count = max(uSamples, 1);
    // Softer toward the limb, where each pixel spans more of the surface.
    float bias = uBlurBias + max(0.0, log2(1.0 / max(z, 0.08)) * 0.7);
    float jitter = count > 1 ? fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) : 0.5;
    vec3 albedo = vec3(0.0);
    vec4 props = vec4(0.0);
    float cloud = 0.0;
    for (int i = 0; i < 32; i++) {
        if (i >= count) break;
        float f = count > 1 ? (float(i) + jitter) / float(count) - 0.5 : 0.0;
        float spin = uSpin + uSweep * f;
        vec3 q = toPlanet(n, spin);
        albedo += texture(uA, q, bias).rgb;
        props += texture(uB, q, bias);
        if (uHasClouds > 0.5) cloud += texture(uB, toPlanet(n, uCloudSpin + uSweep * 1.03 * f), bias).a;
    }
    float inv = 1.0 / float(count);
    albedo *= inv; props *= inv; cloud *= inv;

    // Cities. The baked field says where and how dense; the network is drawn
    // here at screen resolution: highways between districts (with traffic),
    // arterial roads, street grids, downtown cores, and rooftop beacons.
    vec3 qc = toPlanet(n, uSpin);
    float density = props.g;
    float skyGlow = uCityGlow > 0.0 ? texture(uB, qc, bias + 4.5).g : 0.0;
    vec3 cityNight = vec3(0.0);
    vec3 glowTint = uCityColor;
    // The same network by day: concrete blocks of mixed tone, dark asphalt
    // arteries and streets, pale highways, and glass-and-steel downtowns.
    vec3 cityDay = uUrbanColor;
    if (density > 0.002 || skyGlow > 0.01) {
        float fp = 1.0 / (uRadiusPx * max(z, 0.15));
        vec3 w1 = worleyF(qc * 7.0 + uOffset);
        // Glow is one smooth tint for the whole world (neon-violet on high-tech
        // worlds); the lights themselves take neon block by block, below.
        glowTint = mix(uCityColor, vec3(0.85, 0.4, 1.0), uNeon * 0.55);
        if (density > 0.002) {
            float highway = 0.0, arterial = 0.0, street = 0.0, blockTone = 0.5;
            vec3 tint = uCityColor;
            vec3 w2 = worleyF(qc * 26.0 + uOffset.yzx);
            float district = w2.z;
            if (uDetail > 0.0) {
                vec3 w3 = worleyF(qc * 90.0 + uOffset.zxy);
                blockTone = w3.z;
                // Neon is an accent on the street light, not a fill.
                tint = mix(mix(uCityColor, vec3(1.0, 0.8, 0.5), 0.3), districtTint(w2.z), 0.45);
                highway = roads(w1, 0.02, fp * 7.0) * (0.75 + 0.25 * sin(w1.x * 70.0 - uTime * 3.0));
                arterial = roads(w2, 0.03, fp * 26.0);
                street = roads(w3, 0.05, fp * 90.0);
                float beacon = step(0.965, fract(w3.z * 57.3)) * smoothstep(0.08, 0.0, w3.x)
                    * (0.6 + 0.4 * sin(uTime * 2.0 + w3.z * 40.0)) * smoothstep(0.3, 0.8, density);
                street += beacon * 2.0 * (1.0 - smoothstep(0.02, 0.08, fp * 90.0));
            }
            // Lines and points over a dim base: the base is windows too small
            // to see, the lines are roads, the cores are downtowns.
            float core = exp(-pow(w1.x / (0.1 + 0.18 * density), 2.0));
            float base = 0.018 + 0.06 * core;
            float lines = street * 0.45 * smoothstep(0.05, 0.5, density) + arterial * 0.7;
            float fabric = mix(0.2 + 0.15 * core, base + lines, uDetail);
            vec3 gold = mix(uCityColor, vec3(1.0, 0.8, 0.5), 0.45);
            cityNight = (gold * base + tint * (fabric - base) + gold * (highway * 1.1 + core * 0.15)) * density;
            float roadsDay = min(1.0, arterial * 0.55 + street * 0.3 * smoothstep(0.05, 0.5, density)) * uDetail;
            cityDay = uUrbanColor * (0.8 + 0.28 * district) * mix(1.0, 0.86 + 0.28 * blockTone, uDetail);
            cityDay = mix(cityDay, uGlassColor, core * 0.55);
            cityDay *= 1.0 - 0.5 * roadsDay;
            cityDay = mix(cityDay, uUrbanColor * 1.3, highway * 0.7 * uDetail);
        }
    }

    // Relief, lit by the real sun, when the surface is sharp enough to show it.
    vec3 nl = n;
    if (uBump > 0.0 && count == 1 && uGas < 0.5) {
        vec3 east = normalize(cross(uAxis, n) + vec3(1e-5, 0.0, 0.0));
        vec3 north = cross(n, east);
        float eps = 1.5 / uRadiusPx;
        float h0 = texture(uA, toPlanet(n, uSpin)).a;
        float h1 = texture(uA, toPlanet(normalize(n + east * eps), uSpin)).a;
        float h2 = texture(uA, toPlanet(normalize(n + north * eps), uSpin)).a;
        vec2 g = vec2(h1 - h0, h2 - h0) / eps;
        // Toward the limb the surface is foreshortened past what one height
        // sample can resolve, so relief fades out there instead of shimmering.
        nl = normalize(n - (east * g.x + north * g.y) * uBump * (1.0 - props.r) * smoothstep(0.12, 0.45, z));
    }

    vec3 L = uLight;
    float geo = dot(n, L);
    // Eclipses: the ray to the star passes a moon or a parent world, or the rings.
    float lit = 1.0;
    for (int i = 0; i < 4; i++) {
        if (i >= uCasterCount) break;
        vec3 c = vec3(uCasters[i].xy, 0.0);
        float rc = uCasters[i].z;
        float t = dot(c - n, L);
        if (t > 0.0) {
            float miss = length(c - (n + L * t));
            lit *= smoothstep(rc * (0.88 - 0.02 * t), rc * (1.08 + 0.02 * t), miss);
        }
    }
    lit *= 1.0 - 0.85 * ringShadow(n);
    float wrap = 0.04 + min(uAirStrength, 1.4) * 0.1;
    float diffuse = pow(clamp((dot(nl, L) + wrap) / (1.0 + wrap), 0.0, 1.0), 0.85) * lit;
    float ambient = uLightMode > 0.5 ? 0.45 : 0.03;
    float light = ambient + (1.0 - ambient) * diffuse;
    light *= uGas > 0.5 ? 0.72 + 0.28 * sqrt(z) : 0.9 + 0.1 * z;

    // Built-up ground by day covers the same footprint the lights do at night.
    float urban = smoothstep(0.015, 0.3, density) * 0.95;
    if (urban > 0.0) albedo = mix(albedo, cityDay, urban);

    float cloudShadow = uHasClouds > 0.5 ? texture(uB, toPlanet(normalize(n + L * 0.035), uCloudSpin), bias).a : 0.0;
    vec3 color = albedo * uAlbedo * light * uSun * (1.0 - cloudShadow * 0.45 * diffuse);
    // Sun glint on open water, and off glass and steel on high-tech cities.
    vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
    color += uSun * pow(max(dot(n, H), 0.0), 70.0) * props.r * (1.0 - cloud) * diffuse * 0.9;
    color += uSun * pow(max(dot(nl, H), 0.0), 36.0) * urban * uUrbanShine * (1.0 - cloud) * diffuse;
    // Clouds, lit a little past the terminator.
    float cloudLight = ambient * 0.6 + (1.0 - ambient) * pow(clamp((geo + 0.12) / 1.12, 0.0, 1.0), 0.9) * lit;
    color = mix(color, uCloudColor * cloudLight * uSun, cloud * 0.92);
    // Light after dark: cities, and lava that never quite goes out.
    if (uLightMode < 0.5) {
        float night = max(smoothstep(0.08, -0.16, geo), (1.0 - lit) * 0.8);
        // Lights near the limb are seen through more air and foreshortened, so
        // they dim toward the edge instead of crowding into a bright rim.
        float airPath = min(7.0, 1.0 / max(z, 0.07));
        float seen = smoothstep(0.0, 0.3, z) * exp(-uAirStrength * 0.22 * (airPath - 1.0));
        vec3 emit = cityNight * uCityGain * (1.0 - cloud * 0.6) * 1.6;
        // Glow: light domes that spill past the built-up districts, over dark
        // ground, sea, and the undersides of clouds, in their districts' colour.
        // Over dense city they add little, so nothing floods.
        if (uCityGlow > 0.0 && uCityGain > 0.0) {
            float nearGlow = texture(uB, qc, bias + 2.5).g;
            float spill = (nearGlow * 0.3 + skyGlow * 0.3 * (1.0 + cloud * 1.5)) * (1.0 - 0.9 * density);
            emit += glowTint * spill * uCityGlow * uCityGain;
            // On a heavily built world, the night-side air glows toward the limb.
            emit += glowTint * uCityHaze * pow(1.0 - z, 3.0) * 0.35;
        }
        // A soft shoulder, so the brightest districts saturate instead of clipping.
        emit = 1.0 - exp(-emit * 1.4);
        color += emit * night * seen;
        color += vec3(1.0, 0.5, 0.18) * props.b * (0.35 + 0.65 * night) * (1.0 - cloud * 0.5) * 0.9 * mix(1.0, seen, 0.6);
        if (uAirStrength > 0.0) {
            float sunset = exp(-pow((geo + 0.02) / 0.14, 2.0)) * (uGas > 0.5 ? 0.2 : 0.65);
            // Iridescence gathers at grazing angles, toward the limb.
            vec3 tint = mix(airTint(z * 1.8 + geo * 0.7, 0.85 * smoothstep(0.6, 0.05, z)), vec3(1.0, 0.55, 0.31), sunset);
            float path = min(7.0, 1.0 / max(z, 0.07));
            color += tint * uSun * uAirStrength * 0.075 * pow(path, 0.95) * smoothstep(-0.22, 0.45, geo) * lit;
            // An unusual atmosphere shimmers across the day side.
            color += iridescence(z * 3.0 + geo * 1.3) * uIridescent * 0.05 * smoothstep(0.5, 0.0, z) * smoothstep(-0.2, 0.3, geo);
        }
    }
    // The downport: a lit pad by day, a pulsing beacon by night, at the
    // world's largest city. It is never smaller than a few pixels.
    if (uPort.w > 0.0 && uLightMode < 0.5) {
        float gap = length(qc - uPort.xyz);
        float size = max(0.006 + 0.01 * uPort.w, 3.5 / uRadiusPx);
        float pad = exp(-pow(gap / size, 2.0));
        float halo = exp(-pow(gap / (size * 4.5), 2.0));
        float strobe = 0.55 + 0.45 * pow(0.5 + 0.5 * sin(uTime * 3.2), 6.0);
        float dark = smoothstep(0.1, -0.2, geo);
        color += uPortColor * (pad * (0.7 + 0.8 * dark) * strobe + halo * 0.35 * dark * strobe) * uPort.w * seenPort(z);
        color += vec3(1.0) * pad * 0.25 * (1.0 - dark) * uPort.w;
        // Four-point light spikes around the beacon, in screen space.
        if (uPortView.z > 0.0) {
            vec2 dv = abs(p - uPortView.xy) * uRadiusPx;
            float spikes = exp(-dv.y / 0.9) * exp(-dv.x / 16.0) + exp(-dv.x / 0.9) * exp(-dv.y / 16.0);
            color += uPortColor * spikes * (0.35 + 0.65 * dark) * strobe * uPort.w * seenPort(uPortView.z);
        }
    }
    color = clamp(color, 0.0, 1.0);
    float alpha = smoothstep(1.0 + aa, 1.0 - aa, d);
    return vec4(color * alpha, alpha);
}

void main() {
    vec2 local = gl_FragCoord.xy - (uTile.xy + uTile.z * 0.5);
    vec2 p = vec2(local.x, -local.y) / uRadiusPx;
    float d = length(p);
    float aa = 1.2 / uRadiusPx;
    float ringDepth, planetDepth;
    vec4 ring = shadeRings(p, ringDepth);
    vec4 disc = shadePlanet(p, d, aa, planetDepth);
    vec4 result = halo(p, d);
    // Rings behind the globe go down first; rings in front of it go on top.
    if (ringDepth > planetDepth) {
        result = disc + result * (1.0 - disc.a);
        result = ring + result * (1.0 - ring.a);
    } else {
        result = ring + result * (1.0 - ring.a);
        result = disc + result * (1.0 - disc.a);
    }
    outColor = result;
}`;

    // Deep-space backdrop for orbit view: warped wisps of nebula in two colours
    // and a galactic band with dark dust lanes, all very faint.
    const BACKDROP_FRAG = `#version 300 es
precision highp float;
${NOISE}
uniform vec2 uOrigin, uSize;
uniform vec3 uSeed, uColorA, uColorB, uColorC;
uniform vec2 uBand;
uniform float uStrength;
out vec4 outColor;
void main() {
    vec2 uv = (gl_FragCoord.xy - uOrigin) / uSize.y;
    vec3 p = vec3(uv * 1.3, 0.0) + uSeed;
    vec3 q = vec3(fbm(p + vec3(1.7, 9.2, 0.0), 4), fbm(p + vec3(8.3, 2.8, 0.0), 4), fbm(p + vec3(4.1, 6.3, 2.0), 3));
    float cloud = fbm(p + q * 1.5, 6) * 0.5 + 0.5;
    float wisps = pow(smoothstep(0.42, 0.95, cloud), 1.7);
    float glow = pow(fbm(p * 2.2 + q * 2.0 + 5.0, 5) * 0.5 + 0.5, 3.0);
    vec2 centre = 0.5 * vec2(uSize.x / uSize.y, 1.0);
    vec2 dir = vec2(cos(uBand.x), sin(uBand.x));
    float across = dot(uv - centre, vec2(-dir.y, dir.x)) - uBand.y;
    float band = exp(-across * across / 0.05);
    float dust = smoothstep(0.4, 0.75, fbm(p * 3.4 + 11.0, 5) * 0.5 + 0.5);
    vec3 col = uColorA * wisps * 0.6 + uColorB * glow * wisps * 0.5
        + uColorC * band * (0.3 + 0.7 * cloud) * (1.0 - dust * 0.75) * 0.45;
    outColor = vec4(col * uStrength, 1.0);
}`;

    // ── Setup ─────────────────────────────────────────────────────────────
    function compile(type, source) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            const log = gl.getShaderInfoLog(shader);
            gl.deleteShader(shader);
            throw new Error(log);
        }
        return shader;
    }
    function program(fragment) {
        const prog = gl.createProgram();
        gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
        gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fragment));
        gl.bindAttribLocation(prog, 0, 'aPos');
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
        const uniforms = {};
        const count = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
        for (let i = 0; i < count; i++) {
            const info = gl.getActiveUniform(prog, i);
            const name = info.name.replace(/\[0\]$/, '');
            uniforms[name] = gl.getUniformLocation(prog, info.name);
        }
        return { prog, uniforms };
    }
    function setup() {
        canvas = document.createElement('canvas');
        canvas.width = canvas.height = 1024;
        gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false,
            stencil: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
        if (!gl) { broken = true; return; }
        canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); lost = true; });
        canvas.addEventListener('webglcontextrestored', () => { lost = false; build(); });
        build();
    }
    function build() {
        try {
            worlds.clear(); tiles = new Map(); memory = 0;
            programs = { stats: program(STATS_FRAG), bake: program(BAKE_FRAG), draw: program(DRAW_FRAG), backdrop: program(BACKDROP_FRAG) };
            const ext = gl.getExtension('EXT_texture_filter_anisotropic');
            anisotropy = ext ? { TEXTURE_MAX_ANISOTROPY_EXT: ext.TEXTURE_MAX_ANISOTROPY_EXT,
                max: Math.min(8, gl.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT)) } : null;
            quad = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, quad);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
            gl.enableVertexAttribArray(0);
            gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
            const texture = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, STATS_W, STATS_H * STATS_BATCH);
            const fbo = gl.createFramebuffer();
            gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
            statsTarget = { texture, fbo };
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.disable(gl.BLEND);
        } catch (err) {
            console.warn('[PlanetGL] Falling back to the canvas renderer:', err.message);
            broken = true;
        }
    }
    function available() {
        if (broken) return false;
        if (!gl) setup();
        return !!gl && !broken && !lost;
    }

    // ── Per-world uniforms ────────────────────────────────────────────────
    const norm3 = c => [c[0] / 255, c[1] / 255, c[2] / 255];
    function setFields(u, profile) {
        gl.uniform3fv(u.uOffset, profile.offsets);
        gl.uniform4fv(u.uVort, profile.vortices.flat());
        gl.uniform1f(u.uMountains, profile.geology.mountains);
        gl.uniform1f(u.uCraters, profile.geology.craters);
    }
    function setBake(u, world, size, face) {
        const p = world.profile;
        setFields(u, p);
        gl.uniform1i(u.uFace, face);
        gl.uniform1f(u.uSize, size);
        gl.uniform1f(u.uSea, world.stats?.sea ?? 0.5);
        gl.uniform1f(u.uCloudEdge, world.stats?.cloudEdge ?? 0.6);
        gl.uniform1f(u.uUrbanEdge, world.stats?.urbanEdge ?? 2);
        gl.uniform1f(u.uCloudCover, p.clouds.cover);
        gl.uniform1f(u.uGas, p.kind === 'gas' ? 1 : 0);
        gl.uniform3fv(u.uRockLow, norm3(p.rock.low));
        gl.uniform3fv(u.uRockHigh, norm3(p.rock.high));
        gl.uniform1f(u.uHasLiquid, p.liquid ? 1 : 0);
        gl.uniform1f(u.uFrozen, p.liquid?.frozen ? 1 : 0);
        gl.uniform3fv(u.uLiqShallow, norm3(p.liquid?.shallow || [0, 0, 0]));
        gl.uniform3fv(u.uLiqDeep, norm3(p.liquid?.deep || [0, 0, 0]));
        gl.uniform1f(u.uWater, p.water);
        gl.uniform1f(u.uMeanC, p.climate.meanC);
        gl.uniform1f(u.uSpread, p.climate.spread);
        gl.uniform1f(u.uLocked, p.climate.locked ? 1 : 0);
        gl.uniform1f(u.uLife, p.life.cover);
        gl.uniform1f(u.uMaturity, p.life.maturity);
        gl.uniform3fv(u.uCanopy, norm3(p.life.canopy));
        gl.uniform3fv(u.uScrub, norm3(p.life.scrub));
        gl.uniform1f(u.uPop, p.lights.pop);
        gl.uniform1f(u.uVolcanism, p.geology.volcanism);
        gl.uniform1f(u.uHot, p.kind === 'hot' ? 1 : 0);
        gl.uniform1f(u.uIce, p.kind === 'ice' ? 1 : 0);
        const g = p.gas || { zone: [0, 0, 0], belt: [0, 0, 0], pole: [0, 0, 0], storm: [0, 0, 0], bands: 10 };
        gl.uniform3fv(u.uGasZone, norm3(g.zone));
        gl.uniform3fv(u.uGasBelt, norm3(g.belt));
        gl.uniform3fv(u.uGasPole, norm3(g.pole));
        gl.uniform3fv(u.uGasStorm, norm3(g.storm));
        gl.uniform1f(u.uBands, g.bands);
        const v = p.vortices[0];
        gl.uniform4f(u.uStorm, v[0], v[1], v[2] * 0.6, 0.16);
    }

    // ── Statistics: sea level and cloud edge from the world's own terrain ─
    function percentile(sorted, share) {
        if (!sorted.length) return 0.5;
        return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * share)))];
    }
    function measure(pending) {
        const { prog, uniforms: u } = programs.stats;
        gl.useProgram(prog);
        gl.bindFramebuffer(gl.FRAMEBUFFER, statsTarget.fbo);
        for (let i = 0; i < pending.length; i++) {
            gl.viewport(0, i * STATS_H, STATS_W, STATS_H);
            setFields(u, pending[i].profile);
            gl.uniform1f(u.uRow, i * STATS_H);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        }
        const pixels = new Uint8Array(STATS_W * STATS_H * pending.length * 4);
        gl.readPixels(0, 0, STATS_W, STATS_H * pending.length, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        const per = STATS_W * STATS_H;
        pending.forEach((world, i) => {
            const heights = new Float32Array(per), clouds = new Float32Array(per), urban = new Float32Array(per);
            for (let k = 0; k < per; k++) {
                const o = (i * per + k) * 4;
                heights[k] = (pixels[o] / 255 - 0.1) / 0.8;
                clouds[k] = pixels[o + 1] / 255;
                urban[k] = pixels[o + 2] / 255;
            }
            const byHeight = Float32Array.from(heights).sort();
            clouds.sort();
            const p = world.profile;
            const share = p.liquid ? Math.min(0.97, Math.max(0.02, p.water))
                : ({ barren: 0.35, hot: 0.3, ice: 0.4, exotic: 0.4, storm: 0.5, rad: 0.35 }[p.kind] ?? 0.1);
            const sea = percentile(byHeight, share);
            // Cities cover the population's share of the ground they may use:
            // dry land on a world with seas (all of it from population B up).
            const wet = p.liquid && !p.liquid.frozen && p.lights.pop < 11;
            const ground = [];
            for (let k = 0; k < per; k++) if (!wet || heights[k] >= sea) ground.push(urban[k]);
            ground.sort((a, b) => a - b);
            const coverage = p.lights.coverage || 0;
            // The largest city on the hemisphere orbit view looks down on
            // (the north, seen pole-on), so the port can be seen at all.
            let best = -1, bestK = 0;
            for (const minZ of [0.3, -1]) {
                for (let k = 0; k < per; k++) {
                    if (wet && heights[k] < sea) continue;
                    if (2 * (Math.floor(k / STATS_W) + 0.5) / STATS_H - 1 < minZ) continue;
                    if (urban[k] > best) { best = urban[k]; bestK = k; }
                }
                if (best >= 0) break;
            }
            const col = bestK % STATS_W, row = Math.floor(bestK / STATS_W);
            const pz = 2 * (row + 0.5) / STATS_H - 1, lon = 2 * Math.PI * (col + 0.5) / STATS_W, ps = Math.sqrt(Math.max(0, 1 - pz * pz));
            const port = [ps * Math.cos(lon), ps * Math.sin(lon), pz];
            world.stats = { sea, cloudEdge: percentile(clouds, 1 - p.clouds.cover),
                urbanEdge: coverage > 0 && ground.length ? percentile(ground, 1 - coverage) : 2, port };
        });
    }

    // ── Cube maps ─────────────────────────────────────────────────────────
    function makeCube(size) {
        const levels = Math.log2(size) + 1;
        const make = () => {
            const texture = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_CUBE_MAP, texture);
            gl.texStorage2D(gl.TEXTURE_CUBE_MAP, levels, gl.RGBA8, size, size);
            gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
            gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            // Sharp but calm near the limb, where the surface is seen edge-on.
            if (anisotropy) gl.texParameterf(gl.TEXTURE_CUBE_MAP, anisotropy.TEXTURE_MAX_ANISOTROPY_EXT, anisotropy.max);
            return texture;
        };
        const cube = { size, a: make(), b: make(), fbo: gl.createFramebuffer(), bytes: size * size * 6 * 4 * 2 * 4 / 3 };
        memory += cube.bytes;
        return cube;
    }
    function dropCube(cube) {
        gl.deleteTexture(cube.a); gl.deleteTexture(cube.b);
        if (cube.fbo) gl.deleteFramebuffer(cube.fbo);
        memory -= cube.bytes;
    }
    function bakeFace(world, cube, face) {
        const { prog, uniforms: u } = programs.bake;
        gl.useProgram(prog);
        gl.bindFramebuffer(gl.FRAMEBUFFER, cube.fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_CUBE_MAP_POSITIVE_X + face, cube.a, 0);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_CUBE_MAP_POSITIVE_X + face, cube.b, 0);
        gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
        gl.viewport(0, 0, cube.size, cube.size);
        setBake(u, world, cube.size, face);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    function finishCube(world, cube) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        for (const texture of [cube.a, cube.b]) {
            gl.bindTexture(gl.TEXTURE_CUBE_MAP, texture);
            gl.generateMipmap(gl.TEXTURE_CUBE_MAP);
        }
        gl.deleteFramebuffer(cube.fbo);
        cube.fbo = null;
        world.cubes.set(cube.size, cube);
    }
    // The finished cube map nearest the wanted size, a sharper one on a tie.
    function bestCube(world, want) {
        let best = null, bestScore = Infinity;
        for (const cube of world.cubes.values()) {
            const score = Math.abs(Math.log2(cube.size / want)) - (cube.size >= want ? 0.01 : 0);
            if (score < bestScore) { best = cube; bestScore = score; }
        }
        return best;
    }
    // Sharper cube maps are painted a face or two per frame, so zooming in
    // never stalls a frame; the world shows its best finished one meanwhile.
    function advanceBakes(budget) {
        let spent = 0;
        for (const world of worlds.values()) {
            const job = world.job;
            if (!job) continue;
            while (job.face < 6 && spent < budget) {
                bakeFace(world, job.cube, job.face++);
                spent += job.cube.size * job.cube.size;
            }
            if (job.face >= 6) { finishCube(world, job.cube); world.job = null; }
            if (spent >= budget) break;
        }
    }
    function evict() {
        if (memory <= MEMORY_BUDGET) return;
        const order = [...worlds.values()].sort((a, b) => a.lastFrame - b.lastFrame);
        for (const world of order) {
            if (memory <= MEMORY_BUDGET) break;
            if (world.lastFrame === frame) continue;
            for (const cube of world.cubes.values()) dropCube(cube);
            if (world.job) dropCube(world.job.cube);
            worlds.delete(world.profile.id);
        }
    }

    // ── Frame ─────────────────────────────────────────────────────────────
    function cubeSizeFor(radiusPx) {
        return SIZES.find(size => size >= radiusPx * 1.25) || 1024;
    }
    // Places tiles on shelves, largest first, and grows the canvas to fit.
    function pack(requests) {
        const sorted = [...requests].sort((a, b) => b.tileSize - a.tileSize);
        let width = Math.max(canvas.width, Math.min(4096, sorted[0]?.tileSize || 0));
        let x = 0, y = 0, shelf = 0;
        for (const req of sorted) {
            if (x + req.tileSize > width) { x = 0; y += shelf; shelf = 0; }
            req.tx = x; req.ty = y;
            x += req.tileSize; shelf = Math.max(shelf, req.tileSize);
        }
        const height = Math.min(4096, y + shelf);
        if (width > canvas.width || height > canvas.height) {
            canvas.width = Math.max(canvas.width, width);
            canvas.height = Math.max(canvas.height, height);
        }
        return sorted.filter(req => req.ty + req.tileSize <= canvas.height);
    }
    // requests: [{ key, profile, radius (device px), spin, cloudSpin, sweep, samples,
    //   ring: { inner, outer, fill, phase, detail } in planet radii, or null,
    //   tilt, light: [x, y], sun: [r, g, b], casters: [[x, y, r]], lightMode }]
    function render(requests) {
        tiles = new Map();
        if (!available() || !requests.length) return tiles;
        frame++;
        const fresh = [];
        for (const req of requests) {
            let world = worlds.get(req.profile.id);
            if (!world) {
                world = { profile: req.profile, stats: null, cubes: new Map(), job: null, lastFrame: frame };
                worlds.set(req.profile.id, world);
            }
            world.lastFrame = frame;
            req.world = world;
            if (!world.stats && req.profile.kind !== 'gas') fresh.push(world);
            if (req.profile.kind === 'gas' && !world.stats) world.stats = { sea: 0, cloudEdge: 1 };
        }
        for (let i = 0; i < fresh.length; i += STATS_BATCH) measure(fresh.slice(i, i + STATS_BATCH));
        for (const req of requests) {
            const world = req.world;
            const want = cubeSizeFor(req.radius);
            if (!world.cubes.size) {
                // A world's first painting is small and done at once, so it never shows bare.
                const first = makeCube(32);
                for (let face = 0; face < 6; face++) bakeFace(world, first, face);
                finishCube(world, first);
            }
            // Start a sharper painting, or replace one that has not begun; a
            // half-done one is only abandoned for an even sharper one.
            if (!world.cubes.has(want) && (!world.job || world.job.cube.size !== want)) {
                if (!world.job || world.job.face === 0 || want > world.job.cube.size) {
                    if (world.job) dropCube(world.job.cube);
                    world.job = { cube: makeCube(want), face: 0 };
                }
            }
        }
        advanceBakes(1 << 19);
        evict();

        for (const req of requests) {
            req.reach = req.radius * Math.max(1 + HALO, req.ring ? req.ring.outer * 1.01 : 0);
            req.tileSize = Math.ceil(req.reach * 2) + 2;
        }
        const placed = pack(requests);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        const { prog, uniforms: u } = programs.draw;
        gl.useProgram(prog);
        gl.uniform1i(u.uA, 0);
        gl.uniform1i(u.uB, 1);
        for (const req of placed) {
            const cube = bestCube(req.world, cubeSizeFor(req.radius));
            if (!cube) continue;
            const glY = canvas.height - req.ty - req.tileSize;
            gl.viewport(req.tx, glY, req.tileSize, req.tileSize);
            gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_CUBE_MAP, cube.a);
            gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_CUBE_MAP, cube.b);
            const p = req.profile;
            // Spin axis: tipped by the axial tilt toward a fixed direction in space.
            const tilt = req.tilt * Math.PI / 180, az = p.axisAzimuth;
            const axis = [Math.sin(tilt) * Math.cos(az), Math.sin(tilt) * Math.sin(az), Math.cos(tilt)];
            let e1 = [axis[2], 0, -axis[0]];
            const len = Math.hypot(...e1);
            e1 = len > 1e-6 ? e1.map(v => v / len) : [1, 0, 0];
            const e2 = [axis[1] * e1[2] - axis[2] * e1[1], axis[2] * e1[0] - axis[0] * e1[2], axis[0] * e1[1] - axis[1] * e1[0]];
            gl.uniform3f(u.uTile, req.tx, glY, req.tileSize);
            gl.uniform1f(u.uRadiusPx, req.radius);
            gl.uniform1f(u.uHalo, HALO);
            gl.uniform3fv(u.uAxis, axis);
            gl.uniform3fv(u.uE1, e1);
            gl.uniform3fv(u.uE2, e2);
            gl.uniform1f(u.uSpin, req.spin);
            gl.uniform1f(u.uSweep, req.sweep);
            gl.uniform1i(u.uSamples, req.samples);
            gl.uniform1f(u.uBlurBias, req.samples > 1 ? Math.max(0, Math.log2(Math.max(1, req.sweep / req.samples * req.radius * 0.7))) : 0);
            gl.uniform1f(u.uCloudSpin, req.cloudSpin);
            gl.uniform3f(u.uLight, req.light[0], req.light[1], 0);
            gl.uniform3fv(u.uSun, req.sun);
            gl.uniform3fv(u.uAir, norm3(p.air.tint));
            gl.uniform1f(u.uAirStrength, p.air.strength);
            gl.uniform3fv(u.uCloudColor, norm3(p.clouds.color));
            gl.uniform3fv(u.uCityColor, norm3(p.lights.color));
            gl.uniform1f(u.uCityGain, p.lights.gain);
            gl.uniform1f(u.uNeon, p.lights.neon);
            gl.uniform1f(u.uCityGlow, p.lights.pop > 0 ? p.lights.glow : 0);
            gl.uniform1f(u.uCityHaze, p.lights.haze || 0);
            gl.uniform1f(u.uTime, (performance.now() / 1000) % 1000);
            // Street detail eases out as the world starts to blur with its spin.
            gl.uniform1f(u.uDetail, 1 - Math.min(1, Math.max(0, (req.sweep - 0.004) / 0.026)));
            gl.uniform1f(u.uUrbanShine, p.lights.shine);
            gl.uniform3fv(u.uUrbanColor, norm3(p.lights.urban));
            gl.uniform3fv(u.uGlassColor, norm3(p.lights.glass));
            const port = req.world.stats?.port;
            gl.uniform4f(u.uPort, port ? port[0] : 0, port ? port[1] : 0, port ? port[2] : 1, port ? p.port.down : 0);
            // The port in view space: undo the spin, then leave planet space.
            if (port) {
                const c = Math.cos(req.spin), sn = Math.sin(req.spin);
                const px = c * port[0] - sn * port[1], py = sn * port[0] + c * port[1], pz = port[2];
                gl.uniform3f(u.uPortView, px * e1[0] + py * e2[0] + pz * axis[0], px * e1[1] + py * e2[1] + pz * axis[1],
                    px * e1[2] + py * e2[2] + pz * axis[2]);
            } else gl.uniform3f(u.uPortView, 0, 0, -1);
            gl.uniform3fv(u.uPortColor, norm3(p.port.color));
            gl.uniform3fv(u.uOffset, p.offsets);
            gl.uniform1f(u.uIridescent, p.air.iridescent ? 1 : 0);
            const ring = req.ring;
            gl.uniform1f(u.uRingInner, ring ? ring.inner : 0);
            gl.uniform1f(u.uRingOuter, ring ? ring.outer : 0);
            if (ring) {
                gl.uniform1f(u.uRingOpacity, p.rings.opacity * ring.fill);
                gl.uniform1f(u.uRingSeed, p.rings.seed);
                gl.uniform1f(u.uRingPhase, ring.phase);
                gl.uniform1f(u.uRingDetail, ring.detail);
                gl.uniform2fv(u.uRingGaps, p.rings.gaps);
                gl.uniform3fv(u.uRingColorA, norm3(p.rings.inner));
                gl.uniform3fv(u.uRingColorB, norm3(p.rings.outer));
            }
            gl.uniform1f(u.uAlbedo, p.albedo);
            gl.uniform1f(u.uGas, p.kind === 'gas' ? 1 : 0);
            // Relief as a gentle tilt of the surface normal: heights are stored as
            // a 0–1 field over the whole world, so the slopes it gives are steep.
            gl.uniform1f(u.uBump, req.radius >= 40 ? 0.07 * p.geology.relief : 0);
            gl.uniform1f(u.uLightMode, req.lightMode ? 1 : 0);
            gl.uniform1f(u.uHasClouds, p.clouds.cover > 0.001 ? 1 : 0);
            const casters = (req.casters || []).slice(0, 4);
            const flat = new Float32Array(16);
            casters.forEach((c, i) => flat.set([c[0], c[1], c[2], 0], i * 4));
            gl.uniform4fv(u.uCasters, flat);
            gl.uniform1i(u.uCasterCount, casters.length);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            tiles.set(req.key, { sx: req.tx, sy: req.ty, size: req.tileSize, scale: req.scale || 1, rings: ring ? { inner: ring.inner, outer: ring.outer } : null });
        }
        return tiles;
    }
    function tile(key) { return tiles.get(key) || null; }
    // The spin axis and equatorial basis for a profile and tilt, as the
    // shader uses them (view space: x right, y down the screen, z toward you).
    function axisBasis(profile, tiltDeg) {
        const tilt = tiltDeg * Math.PI / 180, az = profile.axisAzimuth;
        const axis = [Math.sin(tilt) * Math.cos(az), Math.sin(tilt) * Math.sin(az), Math.cos(tilt)];
        let e1 = [axis[2], 0, -axis[0]];
        const len = Math.hypot(...e1);
        e1 = len > 1e-6 ? e1.map(v => v / len) : [1, 0, 0];
        const e2 = [axis[1] * e1[2] - axis[2] * e1[1], axis[2] * e1[0] - axis[0] * e1[2], axis[0] * e1[1] - axis[1] * e1[0]];
        return { axis, e1, e2 };
    }
    // Paints the nebula backdrop into a new 2D canvas of the given size. The
    // shared canvas is reused; the next render() clears it again.
    function paintBackdrop(width, height, seed, palette, band, strength = 0.2) {
        if (!available()) return null;
        const w = Math.max(1, Math.round(width)), h = Math.max(1, Math.round(height));
        if (canvas.width < w || canvas.height < h) {
            canvas.width = Math.max(canvas.width, w);
            canvas.height = Math.max(canvas.height, h);
        }
        const { prog, uniforms: u } = programs.backdrop;
        gl.useProgram(prog);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        const glY = canvas.height - h;
        gl.viewport(0, glY, w, h);
        gl.uniform2f(u.uOrigin, 0, glY);
        gl.uniform2f(u.uSize, w, h);
        gl.uniform3fv(u.uSeed, seed);
        gl.uniform3fv(u.uColorA, norm3(palette[0]));
        gl.uniform3fv(u.uColorB, norm3(palette[1]));
        gl.uniform3fv(u.uColorC, norm3(palette[2]));
        gl.uniform2fv(u.uBand, band);
        gl.uniform1f(u.uStrength, strength);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        const out = document.createElement('canvas');
        out.width = w;
        out.height = h;
        out.getContext('2d').drawImage(canvas, 0, 0, w, h, 0, 0, w, h);
        return out;
    }
    // Development aid: a world's painted cube map unfolded into a cross, as a
    // 2D canvas. layer 0 is colour, 1 is water/cities/lava/clouds as RGBA.
    function inspect(id, layer = 0) {
        const world = worlds.get(id);
        if (!world || !world.cubes.size) return null;
        const cube = [...world.cubes.values()].sort((a, b) => b.size - a.size)[0];
        const size = cube.size;
        const out = document.createElement('canvas');
        out.width = size * 4; out.height = size * 3;
        const ctx = out.getContext('2d');
        const fbo = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        const at = [[2, 1], [0, 1], [1, 0], [1, 2], [1, 1], [3, 1]];
        for (let face = 0; face < 6; face++) {
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_CUBE_MAP_POSITIVE_X + face, layer ? cube.b : cube.a, 0);
            const px = new Uint8Array(size * size * 4);
            gl.readPixels(0, 0, size, size, gl.RGBA, gl.UNSIGNED_BYTE, px);
            const img = ctx.createImageData(size, size);
            for (let i = 0; i < size * size; i++) {
                for (let c = 0; c < 3; c++) img.data[i * 4 + c] = px[i * 4 + c];
                img.data[i * 4 + 3] = 255;
            }
            ctx.putImageData(img, at[face][0] * size, at[face][1] * size);
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.deleteFramebuffer(fbo);
        return out;
    }
    function clear() {
        if (!gl || broken) return;
        for (const world of worlds.values()) {
            for (const cube of world.cubes.values()) dropCube(cube);
            if (world.job) dropCube(world.job.cube);
        }
        worlds.clear();
        tiles = new Map();
    }

    return { available, render, tile, clear, inspect, paintBackdrop, axisBasis, HALO, ids: () => [...worlds.keys()],
        // Development aid: a world's cached paintings and measurements.
        world: id => worlds.get(id) || null, get canvas() { return canvas; } };
})();
