/**
 * Shade pass for the vanilla orbit disc.
 * DRAW_FRAG is js/planet_gl.js:320-688, character for character, including the
 * reversed-edge smoothstep calls (476, 481, 546, 617, 640, 644, 655, 666).
 * uTime is an argument. The backdrop shader is not ported.
 */
import type { BakeProfile, BakeStats } from './gl_bake.ts';
import { axisBasis } from './gl_plan.ts';

export const DRAW_FRAG = `#version 300 es
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

export type ShadeProfile = BakeProfile & {
    axisAzimuth: number;
    air: { tint: number[]; strength: number; iridescent: boolean };
    clouds: { cover: number; color: number[] };
    lights: {
        pop: number;
        coverage?: number;
        color: number[];
        gain: number;
        neon: number;
        glow: number;
        haze?: number;
        shine: number;
        urban: number[];
        glass: number[];
    };
    port: { down: number; color: number[] };
    rings: { opacity: number; seed: number; gaps: number[]; inner: number[]; outer: number[] };
    albedo: number;
    geology: { mountains: number; craters: number; volcanism: number; relief: number };
};

export type ShadeRing = { inner: number; outer: number; fill: number; phase: number; detail: number };

export type ShadeRequest = {
    key: string;
    profile: ShadeProfile;
    radius: number;
    spin: number;
    cloudSpin: number;
    sweep: number;
    samples: number;
    ring: ShadeRing | null;
    tilt: number;
    light: [number, number];
    sun: [number, number, number];
    casters: number[][];
    lightMode: boolean;
    scale?: number;
    /** Smaller is nearer the selected body. Omitted requests keep their batch order. */
    near?: number;
    uTime: number;
    /** Below zero, clouds stay the baked field. A harness sets 0..1. The orbit page leaves this unset. */
    cloudForce?: number;
    /** False draws the world with the city terms off. Unset means on. */
    cityOn?: boolean;
    /** 0 shaded, 1 cube C rgb, 2 cube C core. Unset means shaded. */
    diag?: number;
    /** Disc diameter in CSS pixels. The size gate reads this. radius is device pixels. */
    cssDiameter?: number;
    /** 0 A, 1 B, 2 C. Unset on the vanilla path. */
    cityLook?: number;
};

export type ShadeDraw = {
    tx: number;
    ty: number;
    tileSize: number;
    radius: number;
    spin: number;
    cloudSpin: number;
    sweep: number;
    samples: number;
    ring: ShadeRing | null;
    tilt: number;
    light: [number, number];
    sun: [number, number, number];
    casters: number[][];
    lightMode: boolean;
    uTime: number;
    profile: ShadeProfile;
    port: [number, number, number] | null;
    cube: { a: WebGLTexture; b: WebGLTexture; c?: WebGLTexture | null };
    cloudForce?: number;
    cityOn?: boolean;
    diag?: number;
    cssDiameter?: number;
    cityLook?: number;
};

type LinkedProgram = { prog: WebGLProgram; uniforms: Record<string, WebGLUniformLocation | null> };

const norm3 = (c: number[]): [number, number, number] => [(c[0] ?? 0) / 255, (c[1] ?? 0) / 255, (c[2] ?? 0) / 255];

/** Binds the draw program and paints one atlas of tiles. The program is linked outside. */
export function attachShade(
    gl: WebGL2RenderingContext,
    program: LinkedProgram,
    bindQuad: () => void,
): {
    draw: (items: ShadeDraw[], width: number, height: number, halo: number) => void;
    use: (next: LinkedProgram) => void;
    dispose: () => void;
} {
    let current = program;
    let black: WebGLTexture | null = null;

    function blackCube(): WebGLTexture {
        if (black) return black;
        const texture = gl.createTexture();
        if (!texture) throw new Error('black cube');
        gl.bindTexture(gl.TEXTURE_CUBE_MAP, texture);
        const px = new Uint8Array([0, 0, 0, 0]);
        for (let face = 0; face < 6; face++) {
            gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X + face, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, px);
        }
        gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        black = texture;
        return texture;
    }

    function use(next: LinkedProgram): void {
        if (current.prog !== next.prog) gl.deleteProgram(current.prog);
        current = next;
    }

    function dispose(): void {
        gl.deleteProgram(current.prog);
        if (black) gl.deleteTexture(black);
        black = null;
    }

    /** js/planet_gl.js:1040-1128. Ring uniforms stay stale when the request has no ring. */
    function draw(items: ShadeDraw[], width: number, height: number, halo: number): void {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, width, height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        const u = current.uniforms;
        gl.useProgram(current.prog);
        gl.uniform1i(u.uA ?? null, 0);
        gl.uniform1i(u.uB ?? null, 1);
        if (u.uC) gl.uniform1i(u.uC, 2);
        for (const req of items) {
            const cube = req.cube;
            const glY = height - req.ty - req.tileSize;
            gl.viewport(req.tx, glY, req.tileSize, req.tileSize);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_CUBE_MAP, cube.a);
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_CUBE_MAP, cube.b);
            if (u.uC) {
                gl.activeTexture(gl.TEXTURE2);
                gl.bindTexture(gl.TEXTURE_CUBE_MAP, cube.c ?? blackCube());
            }
            const p = req.profile;
            const basis = axisBasis(p, req.tilt);
            const axis = basis.axis;
            const e1 = basis.e1;
            const e2 = basis.e2;
            gl.uniform3f(u.uTile ?? null, req.tx, glY, req.tileSize);
            gl.uniform1f(u.uRadiusPx ?? null, req.radius);
            gl.uniform1f(u.uHalo ?? null, halo);
            gl.uniform3fv(u.uAxis ?? null, axis);
            gl.uniform3fv(u.uE1 ?? null, e1);
            gl.uniform3fv(u.uE2 ?? null, e2);
            gl.uniform1f(u.uSpin ?? null, req.spin);
            gl.uniform1f(u.uSweep ?? null, req.sweep);
            gl.uniform1i(u.uSamples ?? null, req.samples);
            gl.uniform1f(u.uBlurBias ?? null, req.samples > 1
                ? Math.max(0, Math.log2(Math.max(1, req.sweep / req.samples * req.radius * 0.7)))
                : 0);
            gl.uniform1f(u.uCloudSpin ?? null, req.cloudSpin);
            gl.uniform3f(u.uLight ?? null, req.light[0], req.light[1], 0);
            gl.uniform3fv(u.uSun ?? null, req.sun);
            gl.uniform3fv(u.uAir ?? null, norm3(p.air.tint));
            gl.uniform1f(u.uAirStrength ?? null, p.air.strength);
            gl.uniform3fv(u.uCloudColor ?? null, norm3(p.clouds.color));
            gl.uniform3fv(u.uCityColor ?? null, norm3(p.lights.color));
            gl.uniform1f(u.uCityGain ?? null, p.lights.gain);
            gl.uniform1f(u.uNeon ?? null, p.lights.neon);
            gl.uniform1f(u.uCityGlow ?? null, p.lights.pop > 0 ? p.lights.glow : 0);
            gl.uniform1f(u.uCityHaze ?? null, p.lights.haze || 0);
            gl.uniform1f(u.uTime ?? null, req.uTime);
            gl.uniform1f(u.uDetail ?? null, 1 - Math.min(1, Math.max(0, (req.sweep - 0.004) / 0.026)));
            gl.uniform1f(u.uUrbanShine ?? null, p.lights.shine);
            gl.uniform3fv(u.uUrbanColor ?? null, norm3(p.lights.urban));
            gl.uniform3fv(u.uGlassColor ?? null, norm3(p.lights.glass));
            const port = req.port;
            gl.uniform4f(u.uPort ?? null, port ? port[0] : 0, port ? port[1] : 0, port ? port[2] : 1, port ? p.port.down : 0);
            if (port) {
                const c = Math.cos(req.spin);
                const sn = Math.sin(req.spin);
                const px = c * port[0] - sn * port[1];
                const py = sn * port[0] + c * port[1];
                const pz = port[2];
                gl.uniform3f(
                    u.uPortView ?? null,
                    px * e1[0] + py * e2[0] + pz * axis[0],
                    px * e1[1] + py * e2[1] + pz * axis[1],
                    px * e1[2] + py * e2[2] + pz * axis[2],
                );
            } else {
                gl.uniform3f(u.uPortView ?? null, 0, 0, -1);
            }
            gl.uniform3fv(u.uPortColor ?? null, norm3(p.port.color));
            gl.uniform3fv(u.uOffset ?? null, p.offsets);
            gl.uniform1f(u.uIridescent ?? null, p.air.iridescent ? 1 : 0);
            const ring = req.ring;
            gl.uniform1f(u.uRingInner ?? null, ring ? ring.inner : 0);
            gl.uniform1f(u.uRingOuter ?? null, ring ? ring.outer : 0);
            if (ring) {
                gl.uniform1f(u.uRingOpacity ?? null, p.rings.opacity * ring.fill);
                gl.uniform1f(u.uRingSeed ?? null, p.rings.seed);
                gl.uniform1f(u.uRingPhase ?? null, ring.phase);
                gl.uniform1f(u.uRingDetail ?? null, ring.detail);
                gl.uniform2fv(u.uRingGaps ?? null, p.rings.gaps);
                gl.uniform3fv(u.uRingColorA ?? null, norm3(p.rings.inner));
                gl.uniform3fv(u.uRingColorB ?? null, norm3(p.rings.outer));
            }
            gl.uniform1f(u.uAlbedo ?? null, p.albedo);
            gl.uniform1f(u.uGas ?? null, p.kind === 'gas' ? 1 : 0);
            gl.uniform1f(u.uBump ?? null, req.radius >= 40 ? 0.07 * p.geology.relief : 0);
            gl.uniform1f(u.uLightMode ?? null, req.lightMode ? 1 : 0);
            gl.uniform1f(u.uHasClouds ?? null, p.clouds.cover > 0.001 ? 1 : 0);
            const casters = (req.casters || []).slice(0, 4);
            const flat = new Float32Array(16);
            casters.forEach((caster, index) => flat.set([caster[0] ?? 0, caster[1] ?? 0, caster[2] ?? 0, 0], index * 4));
            gl.uniform4fv(u.uCasters ?? null, flat);
            gl.uniform1i(u.uCasterCount ?? null, casters.length);
            const cityEnabled = req.cityOn !== false && p.lights.pop > 0 && p.kind !== 'gas';
            gl.uniform1f(u.uCloudForce ?? null, req.cloudForce ?? -1);
            gl.uniform1f(u.uCityOn ?? null, cityEnabled ? 1 : 0);
            gl.uniform1f(u.uDiag ?? null, req.diag ?? 0);
            gl.uniform1f(u.uCssDiameter ?? null, req.cssDiameter ?? req.radius * 2);
            gl.uniform1f(u.uLook ?? null, req.cityLook ?? 0);
            gl.uniform1f(u.uPop ?? null, p.lights.pop || 0);
            bindQuad();
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        }
    }

    return { draw, use, dispose };
}

/** The decoded port, when the statistics pass stored one. Gas has none. */
export function shadePort(stats: BakeStats | { port?: [number, number, number] } | null): [number, number, number] | null {
    if (stats && 'port' in stats && stats.port) return stats.port;
    return null;
}
