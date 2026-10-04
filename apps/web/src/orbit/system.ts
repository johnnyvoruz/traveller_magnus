/**
 * MgT2E orbit model. Detection order is js/system_viewer.js:444-455.
 * Only the MgT2E branch is implemented (460-482). CT, T5, RTT and AoW
 * return null until the Builder slice.
 */
import { formatDisplayNumber } from '../dossier/labels.ts';
import { surfaceKind as profileKind } from '../surface/profile.ts';
import { orbitToAU } from './maths.ts';

type Bag = Record<string, any>;

/** js/system_viewer.js:444-455. First system whose stars.length > 0. */
export function detectSystem(body: Bag): { raw: Bag; edition: string } | null {
    if (body.aowSystem && body.aowSystem.stars && body.aowSystem.stars.length > 0)
        return { raw: body.aowSystem, edition: 'AoW' };
    if (body.mgtSystem && body.mgtSystem.stars && body.mgtSystem.stars.length > 0)
        return { raw: body.mgtSystem, edition: 'MgT2E' };
    if (body.ctSystem && body.ctSystem.stars && body.ctSystem.stars.length > 0)
        return { raw: body.ctSystem, edition: 'CT' };
    if (body.t5System && body.t5System.stars && body.t5System.stars.length > 0)
        return { raw: body.t5System, edition: 'T5' };
    if (body.rttSystem && body.rttSystem.stars && body.rttSystem.stars.length > 0)
        return { raw: body.rttSystem, edition: 'RTT' };
    return null;
}

/** js/system_viewer.js:520-523. */
function isSameWorld(a: Bag | null | undefined, b: Bag | null | undefined): boolean {
    if (!a || !b) return false;
    if (a === b) return true;
    return a.uwp && b.uwp && a.uwp === b.uwp && a.name === b.name;
}

/** js/system_viewer.js:460-482. MgT2E branch only. */
function normalizeMgT2E(sys: Bag): Bag {
    const hzAU = orbitToAU(sys.hzco || 3);
    const mw = sys.mainworld;
    const mwId = mw && mw._id;
    const worlds = (sys.worlds || []).map((w: Bag) => {
        const same = isSameWorld(w, mw) || w.type === 'Mainworld';
        let type = same ? 'Mainworld' : w.type;
        if (type === 'Planet') type = 'Terrestrial Planet';
        // generateAtmospherics replaces moon objects, detaching them from sys.mainworld.
        const moons = (w.moons || []).map((m: Bag) => {
            const moonIsMainworld = (mwId && m._id === mwId) || m.type === 'Mainworld';
            return moonIsMainworld ? Object.assign({}, m, { type: 'Mainworld' }) : m;
        });
        return Object.assign({}, w, {
            type,
            moons,
            orbitType: w.orbitType || 'S-Type',
            parentStarIdx: w.parentStarIdx ?? 0,
            travelZone: w.travelZone || w.travelCode || 'G',
        });
    });
    return Object.assign({}, sys, { edition: 'MgT2E', hzAU, worlds });
}

/**
 * js/system_viewer.js:4922-4929, MgT2E only.
 * CT, T5, RTT and AoW normalisers arrive with the Builder slice.
 */
export function normalizeSystem(body: Bag): Bag | null {
    const found = detectSystem(body);
    if (!found) return null;
    if (found.edition === 'MgT2E') return normalizeMgT2E(found.raw);
    return null;
}

/** js/system_viewer.js:3470-3486. */
function siderealHours(body: Bag | null | undefined): number | null {
    if (!body) return null;
    if (typeof body.siderealHours === 'number' && Number.isFinite(body.siderealHours) && body.siderealHours !== 0)
        return Math.abs(body.siderealHours);
    if (typeof body.rotationPeriod === 'number' && Number.isFinite(body.rotationPeriod) && body.rotationPeriod > 0)
        return body.rotationPeriod;
    if (typeof body.rotationPeriod === 'string') {
        const matched = body.rotationPeriod.match(/([\d.]+)\s*([hdw])/i);
        if (matched) {
            const n = parseFloat(matched[1] || '');
            const u = (matched[2] || '').toLowerCase();
            if (u === 'h') return n;
            if (u === 'd') return n * 24;
            if (u === 'w') return n * 168;
        }
    }
    return null;
}

/** js/system_viewer.js:3489-3496. */
function isTideLocked(body: Bag | null | undefined): boolean {
    if (!body) return false;
    if (body.tidallyLocked || body.isTwilightZone) return true;
    if (typeof body.rotationPeriod === 'string' && /tidal/i.test(body.rotationPeriod)) return true;
    if (typeof body.rotationPeriod === 'number' && typeof body.orbitalPeriod === 'number'
        && Math.abs(body.rotationPeriod - body.orbitalPeriod) < 0.001) return true;
    return false;
}

/** js/system_viewer.js:4318-4322. */
export function rotationText(body: Bag | null | undefined): string {
    if (isTideLocked(body)) return 'Tidally locked';
    const hours = siderealHours(body);
    if (hours == null || !(hours > 0)) return '';
    return `${formatDisplayNumber(hours, 1, 'h')}${body && body.axialTilt > 90 ? ', retrograde' : ''}`;
}

/**
 * Public export, js/system_viewer.js:5411, over _STAR_COLORS at 153-157.
 * An unknown or missing spectral type returns null.
 */
const STAR_COLORS: Record<string, string> = {
    O: '#9bb0ff', B: '#aabfff', A: '#cad7ff',
    F: '#f8f7ff', G: '#fff4ea', K: '#ffd2a1',
    M: '#ffcc6f', D: '#dce0ff', BD: '#a56432',
};

export function starColor(s: { sType?: string } | null | undefined): string | null {
    const type = s && s.sType;
    if (!type) return null;
    return STAR_COLORS[type] || null;
}

/**
 * js/system_viewer.js:3533-3535. PlanetProfile.kind, js/planet_profile.js:45-67.
 */
export function surfaceKind(body: unknown): string | null {
    return profileKind(body);
}
