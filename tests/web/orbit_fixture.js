/**
 * A small hand-made system for the orbit view's tests: two stars, a rocky world, an Empty
 * slot, a ringed gas giant whose moons include an Empty slot, the mainworld and a ring listed
 * as a moon, a belt, and one world round the companion. Every value is arbitrary test data.
 */
import { normalizeSystem } from '../../apps/web/src/orbit/system.ts';

export const HEX_KEY = 'Test_Sector/0101';

export function testBody() {
    return {
        mgtSystem: {
            name: 'Test',
            hzco: 3,
            age: 1,
            stars: [
                { name: 'G2 V', sType: 'G', subType: 2, sClass: 'V', diam: 1, mass: 1, lum: 1, temp: 5800, role: 'Primary', orbitId: null, separation: null },
                { name: 'M0 V', sType: 'M', subType: 0, sClass: 'V', diam: 0.5, mass: 0.5, lum: 0.04, temp: 3800, role: 'Far', orbitId: 12, parentStarIdx: 0, separation: 'Far' },
            ],
            worlds: [
                {
                    type: 'Terrestrial Planet', name: 'Test I', au: 0.5, orbitId: 1.5, diamKm: 8000, orbitType: 'S-Type', parentStarIdx: 0,
                    periodYears: 0.35, periodDays: 128, axialTilt: 20, eccentricity: 0.02, tidallyLocked: false,
                    meanTempK: 300, highTempK: 320, lowTempK: 280, tempBand: 'Temperate', uwp: 'Y560000-0', moons: [], rings: [],
                },
                { type: 'Empty' },
                {
                    type: 'Gas Giant', ggType: 'GL', name: 'Test II', au: 5, orbitId: 5.9, diamKm: 140000, mass: 300, orbitType: 'S-Type', parentStarIdx: 0,
                    periodYears: 11.2, periodDays: 4090, axialTilt: 3.1, eccentricity: 0.05, meanTempK: 120,
                    moons: [
                        { type: 'Satellite', name: 'Test II-a', size: 'S', pd: 5, diamKm: 600, periodHrs: 40, axialTilt: 0.5, tidallyLocked: true },
                        { type: 'Empty' },
                        {
                            type: 'Mainworld', name: 'Test', size: 6, pd: 12, diamKm: 9600, uwp: 'A667899-C', starport: 'A', tl: 12,
                            starportProfile: 'A-HY:DY:+5', gravity: 0.8, mass: 0.5, periodHrs: 200, axialTilt: 25, tidallyLocked: true,
                            meanTempK: 288, highTempK: 300, lowTempK: 270, tempBand: 'Temperate', tradeCodes: ['Ri'],
                        },
                        { type: 'Satellite', name: 'Test II ring', size: 'R' },
                    ],
                    rings: [{ center: 1.6, span: 0.2 }],
                },
                { type: 'Planetoid Belt', name: 'Test Belt', au: 2.8, orbitId: 4.2, orbitType: 'S-Type', parentStarIdx: 0, periodYears: 4.7, moons: [], resourceRating: 7 },
                { type: 'Terrestrial Planet', name: 'Test B-I', au: 0.2, orbitId: 0.5, diamKm: 5000, orbitType: 'S-Type', parentStarIdx: 1, periodYears: 0.13, moons: [], rings: [] },
            ],
        },
    };
}

export function testSystem() {
    return normalizeSystem(testBody());
}

/** A canvas context that records every call and property set, in order. */
export function recordingContext() {
    const calls = [];
    const state = {};
    const gradient = (kind, args) => {
        const stops = [];
        const g = { kind, args, stops, addColorStop(at, colour) { stops.push([at, colour]); } };
        return g;
    };
    const ctx = new Proxy({}, {
        get(_target, prop) {
            if (prop === 'measureText') return (text) => ({ width: 6 * String(text).length });
            if (prop === 'createRadialGradient') return (...args) => gradient('radial', args);
            if (prop in state) return state[prop];
            return (...args) => { calls.push({ op: String(prop), args, fill: state.fillStyle, stroke: state.strokeStyle, alpha: state.globalAlpha }); };
        },
        set(_target, prop, value) {
            state[prop] = value;
            return true;
        },
    });
    return { ctx, calls, state };
}
