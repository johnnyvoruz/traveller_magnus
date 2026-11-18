/**
 * Enhanced city draw program, step 4b.
 * Built from the vanilla draw source. City light stays on the surface.
 * Cube C supplies the network. Looks A, B and C are one uniform apart.
 * The shoulder runs after the samples are averaged.
 */
import { DRAW_FRAG } from '../vanilla/gl_shade.ts';
import { CITY_GLOW_CLOUD } from './city_gates.ts';
import { CITY_LOOK_A as LOOK_A, CITY_LOOK_B as LOOK_B, CITY_LOOK_C as LOOK_C } from './city_look.ts';

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
        vec3 dome = mix(glow, glow * vec3(0.85, 0.55, 1.15), clamp(uNeon, 0.0, 1.0) * 0.4);
        float cover = clamp(cloud, 0.0, 1.0);
        float lineShow = 1.0 - cover * 0.92;
        float glowShow = exp(-${CITY_GLOW_CLOUD} * cover);
        vec3 rawCity = uCityGain * gainK * uCityOn * night * seen * (direct * cityRaw * lineShow + (dome + sheetAcc) * glowShow);
        float peak = max(rawCity.r, max(rawCity.g, rawCity.b));
        vec3 city = rawCity / (1.0 + peak);
        // Crisp lines stay under the cloud deck. The dome fades more slowly,
        // so thin cloud still shows it. Both terms are already inside the disc.
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
        float gate = min(portT, 1.0 - clamp(cloud, 0.0, 1.0) * 0.92) * portNight * portSeen;
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
uniform float uPop;
uniform sampler2D uPaint;
uniform float uHasPaint;
uniform float uPaintLon;`;

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
        cityRaw += baked.rgb;
        cityMat += baked.rgb;
        cityCore += baked.a;
        float spread = 1.0;
        if (admitTight > 0.0) {
            vec4 g1 = texture(uC, q, bias + log2(3.0));
            float coreW = smoothstep(core0, core1, g1.a);
            glowTight += g1.rgb * mix(0.28, 1.0, coreW);
        }
        if (admitBroad > 0.0) {
            vec4 g2 = texture(uC, q, bias + log2(8.0));
            float coreW = smoothstep(core0, core1, g2.a);
            glowBroad += g2.rgb * mix(0.4, 1.0, coreW);
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

/**
 * A referee's painted hexes (DW2c): the page's texture, the palette's colour where a hex is painted
 * and clear elsewhere (premultiplied), laid over the albedo before the light. Planet space has z
 * north and longitude uPaintLon - atan(y, x), as the soft disc reads its globe (soft/disc_paint.ts);
 * the texel grid is the soft globe's (texelLat, texelLon). A gas giant has no hexes.
 */
const PAINT_AT = '    float density = props.g;';
const PAINT_C = `    float density = props.g;
    // 1 where the globe is drawn from the body's hex map (map_disc.ts), else 0.
    float mapMode = 0.0;
    if (uHasPaint > 0.5 && uGas < 0.5) {
        float plon = uPaintLon - atan(qc.y, qc.x);
        plon -= floor((plon + 3.14159265) / 6.28318531) * 6.28318531;
        vec2 puv = vec2((plon + 3.14159265) / 6.28318531, (1.57079633 - asin(clamp(qc.z, -1.0, 1.0))) / 3.14159265);
        vec4 paint = texture(uPaint, puv);
        if (uHasPaint > 1.5) {
            // The whole hex map: its colour is the ground, and its alpha is open liquid. The bake's own
            // seas, lava and relief belong to another geography and stand down; the cities' own light
            // keeps to the map's land, and their glow still spills over the water beside them. Clouds,
            // air and the sun are untouched.
            mapMode = 1.0;
            albedo = paint.rgb;
            // Open liquid is the top of alpha. Lava is a band about 96/255 with a hot colour under it;
            // a coast passes through that band too, but never with red well over green and blue.
            float mapSea = smoothstep(0.62, 0.9, paint.a);
            float mapLand = 1.0 - mapSea;
            props.r = mapSea;
            props.b = (1.0 - smoothstep(0.035, 0.1, abs(paint.a - 0.3765))) * smoothstep(1.15, 1.75, paint.r / max(paint.g, 0.04)) * step(paint.b * 1.6, paint.r);
            density *= mapLand;
            cityRaw *= mapLand;
            cityMat *= mapLand;
            cityCore *= mapLand;
        } else {
            albedo = albedo * (1.0 - paint.a) + paint.rgb;
        }
    }`;

const CLAMP = '    color = clamp(color, 0.0, 1.0);';
const CLAMP_C = `    if (uDiag > 1.5) color = vec3(cityCore);
    else if (uDiag > 0.5) color = cityMat;
    color = clamp(color, 0.0, 1.0);`;

/*
 * Look pass 1 (Johnny, 2026-11-14; judged on /dev/planet-sheet). The enhanced program alone; the vanilla
 * program, the bake and every uniform stay as they are. Five changes, each one replacement:
 *   the day city is a weave over the land, so a crowded world keeps its continents;
 *   the ground has grain at the screen's scale and its highlands read lighter than its lowlands;
 *   relief takes more of the sun, so ranges and crater rims show toward the terminator;
 *   open water has a tight glint inside a broad sheen and brightens toward the limb;
 *   clouds have body (thick cores brighter than thin edges) and warm where day meets night;
 * and a last grade lifts colour and contrast a little.
 *
 * Look pass 2 (the same day; "these look like a bump map"): the bake's fields stop at features about six
 * degrees across, so every coast, biome edge and cloud ended in a soft blob. The draw now adds what the
 * bake cannot hold, at the screen's own scale, and only on a disc large enough to show it (`fine`):
 *   the ground is read through a small fractal offset (`crinkle`), so coasts, biome edges and ice margins
 *     break up into bays and headlands; the relief reads the same offset, so shade and colour agree;
 *   water near a coast pales into a shelf (the blurred sea mask says how near);
 *   cloud edges fray into wisps, and a full deck carries zonal streaks;
 *   an airless world carries small craters between the baked ones;
 *   the sea's glint is broken by swell.
 * A disc under about 26 px across its radius, and a gas giant, skip all of it: that is most discs on
 * screen, so the pass costs nothing where it cannot be seen.
 */
const DAY_LOOK = `    float urban = smoothstep(0.015, 0.3, density) * 0.95;
    if (urban > 0.0 && uGas < 0.5 && uCityOn > 0.5) {
        vec3 day = mix(uUrbanColor, uGlassColor, clamp(cityCore, 0.0, 1.0));
        float lum = clamp(dot(cityMat, vec3(0.2126, 0.7152, 0.0722)), 0.0, 1.0);
        day *= 0.92 + 0.16 * lum;
        // Built ground is a weave over the land, not a coat of paint: the country shows between the
        // districts, and only the cores go over to concrete and glass.
        float weave = urban * mix(0.34, 0.9, clamp(cityCore, 0.0, 1.0));
        albedo = mix(albedo, mix(day, albedo, 0.3), weave);
    }`;

const RELIEF = '        nl = normalize(n - (east * g.x + north * g.y) * uBump * (1.0 - props.r) * smoothstep(0.12, 0.45, z));';
// On a globe drawn from the hex map the relief is the map painter's own shading; the bake's heights are not its land.
const RELIEF_LOOK = '        nl = normalize(n - (east * g.x + north * g.y) * uBump * 2.4 * (1.0 - mapMode) * (1.0 - props.r) * smoothstep(0.12, 0.45, z));';

const GROUND = '    vec3 color = albedo * uAlbedo * light * uSun * (1.0 - cloudShadow * 0.45 * diffuse);';
const GROUND_LOOK = `    // Each world its own cast: a small lean of tone from the world's own seed (uOffset), so two worlds of
    // one kind are kin and not copies. A gas giant leans further; open water hardly at all.
    vec3 lean = 0.92 + 0.16 * fract(uOffset * vec3(0.137, 0.219, 0.311));
    lean /= dot(lean, vec3(0.3333));
    albedo *= mix(vec3(1.0), lean, uGas > 0.5 ? 1.7 : 1.0 - props.r * 0.7);
    // Ground the eye can read: grain at the screen's own scale, and highlands a shade lighter than the
    // lowlands, on land alone. Open water, city cores and gas giants keep their own surface.
    if (uGas < 0.5) {
        float landK = (1.0 - props.r) * (1.0 - urban * 0.6);
        vec3 qg = normalize(qc + crinkle);
        float high = texture(uA, qg, bias).a;
        float grain = 0.5;
        if (fine > 0.0) {
            grain = vnoise(qc * 46.0 + uOffset) * 0.6 + vnoise(qc * 118.0 + uOffset.yzx) * 0.4;
            // The shelf: water near a coast is shallower and paler. The blurred sea mask says how near.
            float nearLand = (1.0 - texture(uB, qg, bias + 3.2).r) * props.r * (1.0 - mapMode);
            albedo = mix(albedo, albedo * 1.4 + vec3(0.015, 0.07, 0.06), smoothstep(0.06, 0.55, nearLand) * 0.8 * fine);
            // No air, no weather: small craters between the baked ones.
            if (uAirStrength <= 0.0) {
                // From value noise, not a cell search: this program does no per-pixel cell search (cube C holds the streets).
                float pock = vnoise(qc * 42.0 + uOffset.yzx);
                float bowl = smoothstep(0.74, 0.86, pock);
                float rim = smoothstep(0.64, 0.74, pock) * (1.0 - bowl);
                albedo *= 1.0 + landK * fine * (rim * 0.12 - bowl * 0.22);
            }
        }
        albedo *= 1.0 + landK * ((grain - 0.5) * mix(0.24, 0.1, mapMode) + (smoothstep(0.35, 0.8, high) - 0.4) * 0.18 * (1.0 - mapMode));
    }
    vec3 color = albedo * uAlbedo * light * uSun * (1.0 - cloudShadow * 0.55 * diffuse);`;

const GLINT = '    color += uSun * pow(max(dot(n, H), 0.0), 70.0) * props.r * (1.0 - cloud) * diffuse * 0.9;';
const GLINT_LOOK = `    // Open water: a tight glint inside a broad sheen, and the sea brightening toward the limb, where
    // it is seen at a grazing angle.
    float sea = props.r * (1.0 - cloud);
    float spec = max(dot(n, H), 0.0);
    float swell = fine > 0.0 ? 0.7 + 0.6 * vnoise(qc * 96.0 + uOffset.zxy) : 1.0;
    color += uSun * (pow(spec, 160.0) * 1.25 * swell + pow(spec, 18.0) * 0.14) * sea * diffuse;
    color += (albedo * 0.5 + airTint(0.5, 0.0) * 0.14) * uSun * sea * diffuse * pow(1.0 - z, 3.0) * 0.9;`;

const CLOUDS = '    color = mix(color, uCloudColor * cloudLight * uSun, cloud * 0.92);';
const CLOUDS_LOOK = `    // Clouds with body: thick cores brighter than thin edges, and warm where day meets night.
    // Cloud is the brightest thing on a world and takes little of the sun's tint.
    vec3 cloudSun = mix(vec3(dot(uSun, vec3(0.2126, 0.7152, 0.0722))), uSun, 0.35);
    vec3 cloudCol = uCloudColor * min(1.0, cloudLight * 1.22) * cloudSun * mix(0.9, 1.1, smoothstep(0.1, 0.9, cloud));
    if (fine > 0.0) {
        vec3 dq = toPlanet(n, uCloudSpin);
        // A deck with no gaps still has weather: streaks along the latitudes.
        cloudCol *= 0.9 + 0.2 * vnoise(vec3(dq.xy * 2.6, dq.z * 19.0) + uOffset.yzx);
        // A tinted deck (corrosive, insidious, exotic air) is not one colour: broad bands along the
        // latitudes, turned by slow swirls, run from pale to deep and from the deck's hue toward amber.
        float tinted = clamp(distance(uCloudColor, vec3(1.0)) * 2.4, 0.0, 1.0);
        if (tinted > 0.05) {
            float band = vnoise(vec3(dq.xy * 1.3, dq.z * 7.5) + uOffset + uTime * 0.003);
            float swirl = vnoise(dq * 4.6 + uOffset.zxy + band * 2.2 - uTime * 0.005);
            float depth = smoothstep(0.22, 0.78, band * 0.62 + swirl * 0.38);
            cloudCol *= mix(1.0, mix(0.58, 1.22, depth), tinted);
            cloudCol = mix(cloudCol, cloudCol * vec3(1.14, 0.78, 0.5), smoothstep(0.5, 0.85, swirl) * 0.6 * tinted);
            cloudCol = mix(cloudCol, cloudCol * vec3(0.86, 1.02, 1.12), smoothstep(0.5, 0.15, swirl) * 0.3 * tinted);
        }
    }
    cloudCol = mix(cloudCol, cloudCol * vec3(1.0, 0.7, 0.48), exp(-pow((geo - 0.03) / 0.075, 2.0)) * 0.5 * (1.0 - uGas));
    // Thin cloud lets the ground through.
    color = mix(color, cloudCol, pow(cloud, 1.25) * 0.94);
    // Lightning in a storm: a cell of thick cloud flashes for a moment, now and then, brightest on the
    // night side. The sky is cut into cells; each strikes on its own clock.
    if (uHasClouds > 0.5 && fine > 0.0 && uLightMode < 0.5) {
        vec3 lq = toPlanet(n, uCloudSpin) * 8.0;
        vec3 cell = floor(lq);
        float clock = uTime * 2.2 + hash13(cell) * 9.0;
        // Rare enough to be weather and not a crowd of cameras (Johnny, 2026-11-14): about one cell in 140 a beat.
        float strike = step(0.993, hash13(cell * 1.7 + floor(clock) * 0.37));
        float fade = 1.0 - fract(clock);
        vec3 off = fract(lq) - 0.5 - (vec3(hash13(cell + 3.1), hash13(cell + 7.7), hash13(cell + 5.3)) - 0.5) * 0.5;
        float core = exp(-dot(off, off) * 14.0);
        float flicker = 0.6 + 0.4 * sin(uTime * 61.0 + hash13(cell) * 40.0);
        color += vec3(0.8, 0.88, 1.0) * 1.7 * strike * fade * fade * flicker * core * smoothstep(0.5, 0.9, cloud) * (0.1 + 0.9 * smoothstep(0.2, -0.2, geo)) * fine;
    }`;

/**
 * Lava after dark (Johnny, 2026-11-14): molten ground glows on the night side, from orange at its edge to
 * yellow-white at its heart, and breathes. The bake's lava and the hex map's (map_disc.ts) both come here.
 */
const LAVA = '        color += vec3(1.0, 0.5, 0.18) * props.b * (0.35 + 0.65 * night) * (1.0 - cloud * 0.5) * 0.9 * mix(1.0, seen, 0.6);';
const LAVA_LOOK = `        float ember = 0.8 + 0.2 * sin(uTime * 1.6 + vnoise(qc * 38.0 + uOffset) * 6.2832);
        vec3 lavaGlow = mix(vec3(1.0, 0.34, 0.07), vec3(1.0, 0.72, 0.3), props.b * props.b);
        // Half the glow is the ground's own colour, so crust and cracks stay readable in the dark.
        color += mix(lavaGlow, albedo * 1.5, 0.5) * props.b * (0.22 + 0.62 * night) * (1.0 - cloud * 0.5) * ember * mix(1.0, seen, 0.6);`;

/** Before the samples are gathered: how fine the disc is drawn, and the offset the ground is read through. */
const CRINKLE_AT = `    vec3 albedo = vec3(0.0);
    vec4 props = vec4(0.0);
    float cloud = 0.0;
    vec3 cityRaw = vec3(0.0);`;
const CRINKLE = `    float fine = smoothstep(26.0, 60.0, uRadiusPx) * (1.0 - step(0.5, uGas));
    vec3 crinkle = vec3(0.0);
    if (fine > 0.0) {
        vec3 w0 = toPlanet(n, uSpin);
        vec3 wa = vec3(vnoise(w0 * 13.0 + uOffset), vnoise(w0 * 13.0 + uOffset.yzx + 7.3), vnoise(w0 * 13.0 + uOffset.zxy + 3.1)) - 0.5;
        vec3 wb = vec3(vnoise(w0 * 37.0 + uOffset.zxy), vnoise(w0 * 37.0 + uOffset + 5.7), vnoise(w0 * 37.0 + uOffset.yzx + 1.9)) - 0.5;
        vec3 wc = vec3(vnoise(w0 * 97.0 + uOffset.yzx), vnoise(w0 * 97.0 + uOffset.zxy + 2.3), vnoise(w0 * 97.0 + uOffset + 8.1)) - 0.5;
        // The hex map has its own coasts: nothing is read through the offset there.
        crinkle = (wa * 0.062 + wb * 0.026 + wc * 0.009) * fine * (uHasPaint > 1.5 ? 0.0 : 1.0);
    }
${CRINKLE_AT}`;

/** The ground's two cubes are read through the offset; the city cube keeps its own straight read. */
const GROUND_READ = `        albedo += texture(uA, q, bias).rgb;
        vec4 ground = texture(uB, q, bias);`;
const GROUND_READ_LOOK = `        vec3 qs = normalize(q + crinkle);
        albedo += texture(uA, qs, bias).rgb;
        vec4 ground = texture(uB, qs, bias);`;

/** The relief's three height reads, through the same offset, so the shade lies on the land it belongs to. */
const RELIEF_READS: readonly (readonly [string, string, string])[] = [
    ['        float h0 = texture(uA, toPlanet(n, uSpin)).a;', '        float h0 = texture(uA, normalize(toPlanet(n, uSpin) + crinkle)).a;', 'relief centre'],
    ['        float h1 = texture(uA, toPlanet(normalize(n + east * eps), uSpin)).a;', '        float h1 = texture(uA, normalize(toPlanet(normalize(n + east * eps), uSpin) + crinkle)).a;', 'relief east'],
    ['        float h2 = texture(uA, toPlanet(normalize(n + north * eps), uSpin)).a;', '        float h2 = texture(uA, normalize(toPlanet(normalize(n + north * eps), uSpin) + crinkle)).a;', 'relief north'],
];

/** After the samples are averaged, before the relief: cloud edges fray at the screen's scale. */
const FRAY_AT = '    // Relief, lit by the real sun, when the surface is sharp enough to show it.';
const FRAY = `    // Cloud edges fray into wisps at the screen's scale; thin cloud thins further.
    if (uHasClouds > 0.5 && fine > 0.0) {
        vec3 cq = toPlanet(n, uCloudSpin);
        // The edges boil slowly: weather that moves, not a picture of it.
        float fray = vnoise(cq * 27.0 + uOffset.zyx + uTime * 0.021) * 0.55 + vnoise(cq * 71.0 + uOffset - uTime * 0.034) * 0.45;
        // Only the edges move: a thick deck stays whole and clear sky stays clear.
        cloud = clamp(cloud + (fray - 0.5) * 1.5 * cloud * (1.0 - cloud) * fine, 0.0, 1.0);
    }
`;

const CLAMP_LOOK = `    if (uDiag > 1.5) color = vec3(cityCore);
    else if (uDiag > 0.5) color = cityMat;
    else {
        // The grade: a little more colour and contrast, the same on every world.
        float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
        color = max(mix(vec3(luma), color, 1.2), 0.0);
        color = pow(color, vec3(0.95)) * 1.05;
    }
    color = clamp(color, 0.0, 1.0);`;

function once(source: string, from: string, to: string, label: string): string {
    const at = source.indexOf(from);
    if (at < 0 || source.indexOf(from, at + from.length) >= 0) {
        throw new Error('enhanced draw program could not match ' + label);
    }
    return source.slice(0, at) + to + source.slice(at + from.length);
}

/**
 * The enhanced program. Throws if the vanilla source no longer has the markers. `look` false leaves look
 * pass 1 out: the contact sheet's "before", and nothing else.
 */
export function enhancedDrawSource(vanilla: string, look = true): string {
    let source = once(vanilla, HAZE_GATE, AIR_GATE, 'halo haze gate');
    source = once(source, SAMPLERS, SAMPLERS_C, 'cube C samplers');
    source = once(source, ACCUM, ACCUM_C, 'city accumulators');
    source = once(source, SAMPLE, SAMPLE_C, 'per-sample city');
    source = once(source, INV, INV_C, 'city average');
    source = once(source, NETWORK, NETWORK_C, 'per-frame streets');
    source = once(source, DAY, look ? DAY_LOOK : DAY_C, 'day material');
    source = once(source, CITY_AND_PORT, GATED_CITY, 'direct city light');
    source = once(source, PORT, GATED_PORT, 'downport');
    source = once(source, CLAMP, look ? CLAMP_LOOK : CLAMP_C, 'city diagnostic');
    source = once(source, PAINT_AT, PAINT_C, 'painted hexes');
    if (look) {
        source = once(source, RELIEF, RELIEF_LOOK, 'relief');
        source = once(source, GROUND, GROUND_LOOK, 'ground grain');
        source = once(source, GLINT, GLINT_LOOK, 'water');
        source = once(source, CLOUDS, CLOUDS_LOOK, 'cloud body');
        source = once(source, LAVA, LAVA_LOOK, 'lava after dark');
        source = once(source, CRINKLE_AT, CRINKLE, 'fractal offset');
        source = once(source, GROUND_READ, GROUND_READ_LOOK, 'ground through the offset');
        source = once(source, FRAY_AT, FRAY + FRAY_AT, 'cloud fray');
        for (const [from, to, label] of RELIEF_READS) source = once(source, from, to, label);
    }
    return source;
}

export const ENHANCED_DRAW_FRAG = enhancedDrawSource(DRAW_FRAG);
/** The program before look pass 1, for the contact sheet's "before" (dev/planet-sheet). */
export const ENHANCED_DRAW_FRAG_BEFORE = enhancedDrawSource(DRAW_FRAG, false);
