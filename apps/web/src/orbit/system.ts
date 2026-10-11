/**
 * Orbit model. Detection order is js/system_viewer.js:444-455.
 * MgT2E is the branch at 460-482. AoW is the branch at 933-1034, reading
 * fields the stored document already has. CT, T5 and RTT return null.
 */
import { formatDisplayNumber } from '../dossier/labels.ts';
import { surfaceKind as profileKind } from '../surface/profile.ts';
import { AU_KM, SUN_DIAM_KM } from './layout.ts';
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
    if (body.handSystem && body.handSystem.stars && body.handSystem.stars.length > 0)
        return { raw: body.handSystem, edition: 'hand' };
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

const HOURS_PER_YEAR = 365.25 * 24;

function finite(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** js/system_viewer.js:951-973. Companion AU is the stored orbit's R. Diameter is solar diameters. */
function normalizeAoWStar(star: Bag, index: number, orbit: Bag | null): Bag {
    const radiusAu = finite(star.radius);
    const diam = radiusAu != null && radiusAu > 0 ? (radiusAu * 2 * AU_KM) / SUN_DIAM_KM : null;
    const orbitAU = orbit ? finite(orbit.R) : null;
    const name = star.name || star.spectralClassification || star.label || '';
    return Object.assign({}, star, {
        role: index === 0 ? 'Primary' : 'Companion',
        name,
        diam,
        mass: finite(star.mass) ?? finite(star.wdMass) ?? finite(star.initialMass),
        lum: finite(star.luminosity),
        orbitAU,
        parentStarIdx: 0,
        separation: index > 0 && orbit && orbit.separation ? String(orbit.separation) : (star.separation || ''),
    });
}

/** A world's orbitalRadius is AU. Its radius, when far above 1, is kilometres. */
function worldAu(world: Bag): number | null {
    return finite(world.au) ?? finite(world.orbitalRadius);
}

function worldDiamKm(world: Bag): number | null {
    const given = finite(world.diamKm);
    if (given != null && given > 0) return given;
    const radius = finite(world.radius);
    if (radius != null && radius > 1) return Math.round(radius * 2);
    return null;
}

/**
 * js/system_viewer.js:975-1032.
 * Satellites are the moon list when moons is empty. Their orbitalRadius is kilometres
 * (aow_world_engine.js step 18: D in km) and their orbitalPeriod is hours.
 */
function normalizeAoWMoon(moon: Bag, parentDiamKm: number | null): Bag {
    const diamKm = worldDiamKm(moon);
    const orbitKm = finite(moon.orbitalRadius);
    const pd = parentDiamKm && orbitKm != null && orbitKm > parentDiamKm
        ? orbitKm / parentDiamKm
        : finite(moon.pd);
    const periodHrs = finite(moon.periodHrs) ?? finite(moon.orbitalPeriod);
    return Object.assign({}, moon, {
        type: moon.type || 'Satellite',
        diamKm,
        pd,
        periodHrs,
    });
}

function normalizeAoW(sys: Bag): Bag {
    const orbits = Array.isArray(sys.orbits) ? sys.orbits : [];
    const stars = (Array.isArray(sys.stars) ? sys.stars : []).map((star: Bag, index: number) => {
        const orbit = index > 0 && orbits[index - 1] && typeof orbits[index - 1] === 'object' ? orbits[index - 1] : null;
        return normalizeAoWStar(star, index, orbit);
    });
    const primaryLum = stars[0] ? finite(stars[0].lum) : null;
    const hzco = finite(sys.hzco);
    const hzAU = hzco != null && hzco > 0 ? orbitToAU(hzco) : (primaryLum != null && primaryLum > 0 ? Math.sqrt(primaryLum) : null);
    const worlds = (Array.isArray(sys.worlds) ? sys.worlds : []).map((world: Bag) => {
        const au = worldAu(world);
        const diamKm = worldDiamKm(world);
        const hours = finite(world.periodYears) == null ? finite(world.orbitalPeriod) : null;
        const list = Array.isArray(world.moons) && world.moons.length ? world.moons : (world.satellites || []);
        const moons = (Array.isArray(list) ? list : []).map((moon: Bag) => normalizeAoWMoon(moon, diamKm));
        return Object.assign({}, world, {
            au,
            diamKm,
            moons,
            orbitType: world.orbitType || 'S-Type',
            parentStarIdx: world.parentStarIdx ?? 0,
            periodYears: finite(world.periodYears) ?? (hours != null && hours > 0 ? hours / HOURS_PER_YEAR : null),
            travelZone: world.travelZone || world.travelCode || 'G',
        });
    });
    return Object.assign({}, sys, { edition: 'AoW', stars, worlds, ...(hzAU != null ? { hzAU } : {}) });
}

/**
 * js/system_viewer.js:4922-4929. MgT2E and AoW.
 * CT, T5 and RTT stay unread.
 */
export function normalizeSystem(body: Bag): Bag | null {
    const found = detectSystem(body);
    if (!found) return null;
    if (found.edition === 'MgT2E') return normalizeMgT2E(found.raw);
    if (found.edition === 'AoW') return normalizeAoW(found.raw);
    if (found.edition === 'hand') return Object.assign({}, found.raw, { edition: 'hand' });
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
 * The colour lives in tokens.css (--star-o through --star-bd). This table carries the
 * token name. An unknown or missing spectral type returns null.
 */
const STAR_TOKENS: Record<string, string> = {
    O: '--star-o', B: '--star-b', A: '--star-a',
    F: '--star-f', G: '--star-g', K: '--star-k',
    M: '--star-m', D: '--star-d', BD: '--star-bd',
};

/** Turns a token name into the colour string a caller paints with. */
export type StarColorResolve = (tokenName: string) => string;

type NodeBuiltins = {
    readFileSync?: (file: string, encoding: 'utf8') => string;
    fileURLToPath?: (url: string) => string;
    dirname?: (file: string) => string;
    join?: (...parts: string[]) => string;
};

/** Read once. The painter does not call starColor per frame. */
let starPaintCache: Record<string, string> | null = null;

function nodeBuiltin(name: string): NodeBuiltins | null {
    const proc = (globalThis as { process?: { getBuiltinModule?: (id: string) => NodeBuiltins } }).process;
    const get = proc && proc.getBuiltinModule;
    if (typeof get !== 'function') return null;
    return get(name);
}

/** The page's computed tokens, once. Empty when there is no stylesheet. */
function starPaintFromPage(): Record<string, string> | null {
    const root = typeof document !== 'undefined' ? document.documentElement : null;
    if (!root || typeof getComputedStyle !== 'function') return null;
    const style = getComputedStyle(root);
    const out: Record<string, string> = {};
    for (const type of Object.keys(STAR_TOKENS)) {
        const value = style.getPropertyValue(STAR_TOKENS[type]).trim();
        if (value) out[type] = value;
    }
    return Object.keys(out).length > 0 ? out : null;
}

/**
 * Node tests have no stylesheet. Read the same tokens.css the page uses, once.
 * The browser never takes this path: it has no process.getBuiltinModule.
 */
function starPaintFromSheet(): Record<string, string> | null {
    const fs = nodeBuiltin('node:fs');
    const url = nodeBuiltin('node:url');
    const path = nodeBuiltin('node:path');
    if (!fs?.readFileSync || !url?.fileURLToPath || !path?.dirname || !path?.join) return null;
    const file = path.join(path.dirname(url.fileURLToPath(import.meta.url)), '../design/tokens.css');
    const css = fs.readFileSync(file, 'utf8');
    const out: Record<string, string> = {};
    for (const type of Object.keys(STAR_TOKENS)) {
        const name = STAR_TOKENS[type].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const match = css.match(new RegExp(name + '\\s*:\\s*([^;]+)'));
        const value = match ? match[1].trim() : '';
        if (value) out[type] = value;
    }
    return Object.keys(out).length > 0 ? out : null;
}

function starPaints(): Record<string, string> {
    if (starPaintCache) return starPaintCache;
    const paints = starPaintFromPage() || starPaintFromSheet();
    if (paints) starPaintCache = paints;
    return paints || {};
}

export function starColor(
    s: { sType?: string } | null | undefined,
    resolve?: StarColorResolve,
): string | null {
    const type = s && s.sType;
    if (!type) return null;
    const token = STAR_TOKENS[type];
    if (!token) return null;
    if (resolve) {
        const colour = resolve(token).trim();
        return colour || null;
    }
    return starPaints()[type] || null;
}

/**
 * js/system_viewer.js:3533-3535. PlanetProfile.kind, js/planet_profile.js:45-67.
 */
export function surfaceKind(body: unknown): string | null {
    return profileKind(body);
}
