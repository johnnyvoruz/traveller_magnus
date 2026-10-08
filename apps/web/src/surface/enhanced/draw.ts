/**
 * Enhanced city draw program, step 4b.
 * Built from the vanilla draw source. The vanilla string is not edited.
 * Cube C supplies the network. Looks A, B and C are one uniform apart.
 * The shoulder runs after the samples are averaged.
 */
import { DRAW_FRAG } from '../vanilla/gl_shade.ts';
import { CITY_LOOK_A as LOOK_A, CITY_LOOK_B as LOOK_B, CITY_LOOK_C as LOOK_C } from './city_look.ts';

const HAZE_IN_HALO = `    c += mix(uCityColor, vec3(0.75, 0.4, 1.0), uNeon * 0.6) * uCityHaze * 0.25
        * exp(-alt * 1.6) * smoothstep(0.25, -0.35, facing) * smoothstep(reach, 1.0 + uHalo * 0.45, d);
`;

const CITY_AND_PORT = `        float night = max(smoothstep(0.08, -0.16, geo), (1.0 - lit) * 0.8);
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
        color += emit * night * seen;`;

const GATED_CITY = `        float c = clamp(cloud, 0.0, 1.0);
        float clear = 1.0 - smoothstep(0.65, 0.95, c);
        float T = exp(-3.0 * c / max(z, 0.35)) * clear;
        float night = max(1.0 - smoothstep(-0.16, 0.08, geo), 0.8 * (1.0 - lit));
        float path = min(7.0, 1.0 / max(z, 0.07));
        float seen = smoothstep(0.02, 0.30, z) * exp(-uAirStrength * 0.22 * (path - 1.0));
        vec3 glow = (tightW * glowTight * admitTight + broadW * glowBroad * admitBroad) * uCityGlow;
        vec3 rawCity = uCityGain * gainK * uCityOn * night * seen * (direct * cityRaw + glow + sheetAcc);
        float peak = max(rawCity.r, max(rawCity.g, rawCity.b));
        vec3 city = rawCity / (1.0 + peak);
        color += city * (uGas < 0.5 ? 1.0 : 0.0);`;

const PORT = `    if (uPort.w > 0.0 && uLightMode < 0.5) {
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
    }`;

const GATED_PORT = `    // The downport keeps its place, its strength and its colour. The broad halo
    // and the screen-space spikes are off. Cloud, night and limb gate the pad.
    // A gas giant, and a world with no city density, has no port light.
    if (uPort.w > 0.0 && uLightMode < 0.5 && uGas < 0.5 && density > 0.002) {
        float gap = length(qc - uPort.xyz);
        float size = max(0.006 + 0.01 * uPort.w, 3.5 / uRadiusPx);
        float pad = exp(-pow(gap / size, 2.0));
        float strobe = 0.55 + 0.45 * pow(0.5 + 0.5 * sin(uTime * 3.2), 6.0);
        float dark = smoothstep(0.1, -0.2, geo);
        float portC = clamp(cloud, 0.0, 1.0);
        float portClear = 1.0 - smoothstep(0.65, 0.95, portC);
        float portT = exp(-3.0 * portC / max(z, 0.35)) * portClear;
        float portNight = max(1.0 - smoothstep(-0.16, 0.08, geo), 0.8 * (1.0 - lit));
        float portPath = min(7.0, 1.0 / max(z, 0.07));
        float portSeen = smoothstep(0.02, 0.30, z) * exp(-uAirStrength * 0.22 * (portPath - 1.0));
        float gate = portT * portNight * portSeen;
        color += uPortColor * pad * (0.7 + 0.8 * dark) * strobe * uPort.w * gate * uCityOn;
        color += vec3(1.0) * pad * 0.25 * (1.0 - dark) * uPort.w * gate * uCityOn;
    }`;

const HAZE_GATE = 'if ((uAirStrength <= 0.0 && uCityHaze <= 0.0) || uLightMode > 0.5) return vec4(0.0);';
const AIR_GATE = 'if (uAirStrength <= 0.0 || uLightMode > 0.5) return vec4(0.0);';

const SAMPLERS = `uniform samplerCube uA;
uniform samplerCube uB;`;

const SAMPLERS_C = `uniform samplerCube uA;
uniform samplerCube uB;
uniform samplerCube uC;
uniform float uCloudForce;
uniform float uCityOn;
uniform float uDiag;
uniform float uCssDiameter;
uniform float uLook;
uniform float uPop;`;

const ACCUM = `    vec3 albedo = vec3(0.0);
    vec4 props = vec4(0.0);
    float cloud = 0.0;`;

const ACCUM_C = `    vec3 albedo = vec3(0.0);
    vec4 props = vec4(0.0);
    float cloud = 0.0;
    vec3 cityRaw = vec3(0.0);
    vec3 cityMat = vec3(0.0);
    float cityCore = 0.0;
    vec3 glowTight = vec3(0.0);
    vec3 glowBroad = vec3(0.0);
    vec3 sheetAcc = vec3(0.0);
    // A is the default. B and C replace it. The sweep fade is uDetail.
    float direct = ${LOOK_A.direct};
    float tightW = ${LOOK_A.tight};
    float broadW = ${LOOK_A.broad};
    float tight0 = ${LOOK_A.tightFrom}.0;
    float tight1 = ${LOOK_A.tightTo}.0;
    float broad0 = ${LOOK_A.broadFrom}.0;
    float broad1 = ${LOOK_A.broadTo}.0;
    float core0 = ${LOOK_A.coreFrom};
    float core1 = ${LOOK_A.coreTo};
    float gainK = 1.0;
    float sheetK = 0.0;
    if (uLook > 1.5) {
        direct = ${LOOK_C.direct};
        tightW = ${LOOK_C.tight};
        broadW = ${LOOK_C.broad};
        tight0 = ${LOOK_C.tightFrom}.0;
        tight1 = ${LOOK_C.tightTo}.0;
        broad0 = ${LOOK_C.broadFrom}.0;
        broad1 = ${LOOK_C.broadTo}.0;
        core0 = ${LOOK_C.coreFrom};
        core1 = ${LOOK_C.coreTo};
        gainK = mix(1.0, ${LOOK_C.gain}, clamp((uPop - 5.0) / 4.0, 0.0, 1.0));
        if (uPop >= 9.0 && uNeon >= 0.25) sheetK = ${LOOK_C.sheet};
    } else if (uLook > 0.5) {
        direct = ${LOOK_B.direct};
        tightW = ${LOOK_B.tight};
        broadW = ${LOOK_B.broad};
        tight0 = ${LOOK_B.tightFrom}.0;
        tight1 = ${LOOK_B.tightTo}.0;
        broad0 = ${LOOK_B.broadFrom}.0;
        broad1 = ${LOOK_B.broadTo}.0;
        core0 = ${LOOK_B.coreFrom};
        core1 = ${LOOK_B.coreTo};
        gainK = mix(1.0, ${LOOK_B.gain}, clamp((uPop - 5.0) / 4.0, 0.0, 1.0));
    }
    float admitTight = smoothstep(tight0, tight1, uCssDiameter) * uDetail;
    float admitBroad = smoothstep(broad0, broad1, uCssDiameter) * uDetail;`;

const SAMPLE = `        albedo += texture(uA, q, bias).rgb;
        props += texture(uB, q, bias);
        if (uHasClouds > 0.5) cloud += texture(uB, toPlanet(n, uCloudSpin + uSweep * 1.03 * f), bias).a;`;

const SAMPLE_C = `        albedo += texture(uA, q, bias).rgb;
        vec4 ground = texture(uB, q, bias);
        props += ground;
        float cloudHere = 0.0;
        if (uCloudForce >= 0.0) cloudHere = uCloudForce;
        else if (uHasClouds > 0.5) cloudHere = texture(uB, toPlanet(n, uCloudSpin + uSweep * 1.03 * f), bias).a;
        cloud += cloudHere;
        vec4 baked = texture(uC, q, bias);
        float cHere = clamp(cloudHere, 0.0, 1.0);
        float clearHere = 1.0 - smoothstep(0.65, 0.95, cHere);
        float tHere = exp(-3.0 * cHere / max(z, 0.35)) * clearHere;
        cityRaw += baked.rgb * tHere;
        cityMat += baked.rgb;
        cityCore += baked.a;
        float thinHere = 4.0 * cHere * (1.0 - cHere) * clearHere;
        float spread = tHere + 0.18 * thinHere;
        if (admitTight > 0.0) {
            vec4 g1 = texture(uC, q, bias + log2(2.0));
            g1.rgb *= smoothstep(core0, core1, g1.a);
            glowTight += g1.rgb * spread;
        }
        if (admitBroad > 0.0) {
            vec4 g2 = texture(uC, q, bias + log2(5.0));
            g2.rgb *= smoothstep(core0, core1, g2.a);
            glowBroad += g2.rgb * spread;
        }
        if (sheetK > 0.0) {
            vec3 carpet = texture(uC, q, bias + log2(7.0)).rgb;
            float energy = max(carpet.r, max(carpet.g, carpet.b));
            float land = 1.0 - smoothstep(0.2, 0.55, ground.r);
            sheetAcc += carpet * smoothstep(0.02, 0.14, energy) * land * spread * sheetK;
        }`;

const INV = '    albedo *= inv; props *= inv; cloud *= inv;';
const INV_C = '    albedo *= inv; props *= inv; cloud *= inv;\n    cityRaw *= inv; cityMat *= inv; cityCore *= inv;\n    glowTight *= inv; glowBroad *= inv; sheetAcc *= inv;';

const NETWORK = `    // Cities. The baked field says where and how dense; the network is drawn
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
    }`;

const NETWORK_C = `    // Cube C holds the network. The fragment no longer builds streets,
    // and it no longer lights the night from a blurred density sample.
    vec3 qc = toPlanet(n, uSpin);
    float density = props.g;`;

const DAY = `    float urban = smoothstep(0.015, 0.3, density) * 0.95;
    if (urban > 0.0) albedo = mix(albedo, cityDay, urban);`;

const DAY_C = `    float urban = smoothstep(0.015, 0.3, density) * 0.95;
    if (urban > 0.0 && uGas < 0.5 && uCityOn > 0.5) {
        vec3 day = mix(uUrbanColor, uGlassColor, clamp(cityCore, 0.0, 1.0));
        float lum = clamp(dot(cityMat, vec3(0.2126, 0.7152, 0.0722)), 0.0, 1.0);
        day *= 0.92 + 0.16 * lum;
        albedo = mix(albedo, day, urban);
    }`;

const CLAMP = '    color = clamp(color, 0.0, 1.0);';
const CLAMP_C = `    if (uDiag > 1.5) color = vec3(cityCore);
    else if (uDiag > 0.5) color = cityMat;
    color = clamp(color, 0.0, 1.0);`;

function once(source: string, from: string, to: string, label: string): string {
    const at = source.indexOf(from);
    if (at < 0 || source.indexOf(from, at + from.length) >= 0) {
        throw new Error('enhanced draw program could not match ' + label);
    }
    return source.slice(0, at) + to + source.slice(at + from.length);
}

/** The enhanced program. Throws if the vanilla source no longer has the markers. */
export function enhancedDrawSource(vanilla: string): string {
    let source = once(vanilla, HAZE_GATE, AIR_GATE, 'halo haze gate');
    source = once(source, HAZE_IN_HALO, '', 'city colour in halo');
    source = once(source, SAMPLERS, SAMPLERS_C, 'cube C samplers');
    source = once(source, ACCUM, ACCUM_C, 'city accumulators');
    source = once(source, SAMPLE, SAMPLE_C, 'per-sample city');
    source = once(source, INV, INV_C, 'city average');
    source = once(source, NETWORK, NETWORK_C, 'per-frame streets');
    source = once(source, DAY, DAY_C, 'day material');
    source = once(source, CITY_AND_PORT, GATED_CITY, 'direct city light');
    source = once(source, PORT, GATED_PORT, 'downport');
    source = once(source, CLAMP, CLAMP_C, 'city diagnostic');
    return source;
}

export const ENHANCED_DRAW_FRAG = enhancedDrawSource(DRAW_FRAG);
