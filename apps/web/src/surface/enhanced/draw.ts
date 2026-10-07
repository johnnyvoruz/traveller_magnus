/**
 * Enhanced city draw program, step 2.
 * Built from the vanilla draw source. The vanilla string is not edited.
 * City haze leaves the air halo, and the direct city light and the downport
 * take the cloud, night and limb gates. The network, cube C and the glow
 * taps are unchanged.
 */
import { DRAW_FRAG } from '../vanilla/gl_shade.ts';

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
        vec3 emit = cityNight * uCityGain * T * 1.6;
        // The existing glow spill stays. It takes the same cloud gate, and the
        // limb haze term is gone. Cube C and the two glow taps are later steps.
        if (uCityGlow > 0.0 && uCityGain > 0.0 && uGas < 0.5) {
            float nearGlow = texture(uB, qc, bias + 2.5).g;
            float spill = (nearGlow * 0.3 + skyGlow * 0.3 * (1.0 + cloud * 1.5)) * (1.0 - 0.9 * density);
            emit += glowTint * spill * uCityGlow * uCityGain * T;
        }
        emit = 1.0 - exp(-emit * 1.4);
        color += emit * night * seen * (uGas < 0.5 ? 1.0 : 0.0);`;

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
        color += uPortColor * pad * (0.7 + 0.8 * dark) * strobe * uPort.w * gate;
        color += vec3(1.0) * pad * 0.25 * (1.0 - dark) * uPort.w * gate;
    }`;

const HAZE_GATE = 'if ((uAirStrength <= 0.0 && uCityHaze <= 0.0) || uLightMode > 0.5) return vec4(0.0);';
const AIR_GATE = 'if (uAirStrength <= 0.0 || uLightMode > 0.5) return vec4(0.0);';

function once(source: string, from: string, to: string, label: string): string {
    const at = source.indexOf(from);
    if (at < 0 || source.indexOf(from, at + from.length) >= 0) {
        throw new Error('enhanced draw program could not match ' + label);
    }
    return source.slice(0, at) + to + source.slice(at + from.length);
}

/** The enhanced program. Throws if the vanilla source no longer has the step 2 markers. */
export function enhancedDrawSource(vanilla: string): string {
    let source = once(vanilla, HAZE_GATE, AIR_GATE, 'halo haze gate');
    source = once(source, HAZE_IN_HALO, '', 'city colour in halo');
    source = once(source, CITY_AND_PORT, GATED_CITY, 'direct city light');
    source = once(source, PORT, GATED_PORT, 'downport');
    return source;
}

export const ENHANCED_DRAW_FRAG = enhancedDrawSource(DRAW_FRAG);
