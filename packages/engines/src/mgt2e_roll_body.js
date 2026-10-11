/**
 * Roll one hand body's profile cells.
 * Calls the existing MgT2E steps on a one-body copy. It does not rewrite those steps.
 */
import { isolateRng, toEHex } from './core/rng.js';
import { trace, startTrace } from './core/trace.js';
import { generateAtmospherics, generateBiospherics, generatePhysicals, generateRotationalDynamics } from './mgt2e_world_engine.js';
import { generateCoreSocial } from './mgt2e_socio_engine.js';
import { convertAuToOrbit, generateStarObject, orbitNumberToAu } from './mgt2e_stellar_engine.js';

const SOCIAL = ['st', 'p', 'g', 'l', 'tl'];
const PHYSICAL = ['s', 'a', 'h'];

function finite(value) {
    return typeof value === 'number' && Number.isFinite(value);
}

function subtypeNumber(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
    return null;
}

function oneDigit(value) {
    if (typeof value === 'number' && Number.isFinite(value)) {
        const text = toEHex(value);
        return text.length === 1 ? text : null;
    }
    if (typeof value === 'string' && value.length === 1) return value;
    return null;
}

function resolveStar(star) {
    const subtype = subtypeNumber(star.subType);
    if (!star.sType || !star.sClass || subtype === null) {
        return { sType: star.sType || '', sClass: star.sClass || '', subType: star.subType, orbitId: star.orbitId, lookedUp: false };
    }
    const made = generateStarObject(star.sType, subtype, star.sClass, 'Star');
    made.orbitId = star.orbitId;
    made.lookedUp = true;
    return made;
}

function hzcoOf(stars, body) {
    if (body.alsoParentIndex != null) {
        const left = stars[body.parentStarIndex];
        const right = stars[body.alsoParentIndex];
        if (left && right && finite(left.lum) && finite(right.lum)) return convertAuToOrbit(Math.sqrt(left.lum + right.lum));
    }
    const star = stars[body.parentStarIndex] || stars[0];
    if (star && finite(star.lum) && star.lum > 0) return convertAuToOrbit(Math.sqrt(star.lum));
    return undefined;
}

function engineBody(body, hzco) {
    const made = {
        name: body.name || '',
        type: body.kind === 'belt' ? 'Planetoid Belt' : body.kind === 'gas' ? 'Gas Giant' : 'Terrestrial Planet',
        moons: [],
        rings: [],
        parentStarIdx: body.parentStarIndex || 0,
        orbitType: body.alsoParentIndex != null ? 'P-Type' : 'S-Type',
    };
    if (finite(body.orbitId)) made.orbitId = body.orbitId;
    if (finite(body.au)) made.au = body.au;
    else if (finite(body.orbitId) && body.orbitId >= 0) made.au = orbitNumberToAu(body.orbitId);
    if (finite(body.eccentricity)) made.eccentricity = body.eccentricity;
    if (finite(hzco)) made.worldHzco = hzco;
    return made;
}

function readCells(body) {
    const cells = {};
    const size = oneDigit(body.size);
    const atm = oneDigit(body.atmCode !== undefined ? body.atmCode : body.atm);
    const hydro = oneDigit(body.hydroCode !== undefined ? body.hydroCode : body.hydro);
    const pop = oneDigit(body.pop);
    const gov = oneDigit(body.gov);
    const law = oneDigit(body.law);
    const tl = oneDigit(body.tl);
    const port = oneDigit(body.starport);
    if (size) cells.s = size;
    if (atm) cells.a = atm;
    if (hydro) cells.h = hydro;
    if (pop) cells.p = pop;
    if (gov) cells.g = gov;
    if (law) cells.l = law;
    if (tl) cells.tl = tl;
    if (port) cells.st = port;
    return cells;
}

function has(cells, keys) {
    return keys.every((key) => typeof cells[key] === 'string' && cells[key].length === 1);
}

function messageFor(kind, cells, isMainworld, gasProfile, starLookedUp) {
    if (kind === 'gas') {
        if (gasProfile) return `The engine sets this gas giant's size to GG and its gas-giant profile to ${gasProfile}. Those values do not fit these eight cells, so nothing was written.`;
        return 'The engine did not write a profile that fits these eight cells, so nothing was written.';
    }
    const star = starLookedUp ? '' : ' The star has no spectral type, so the atmosphere step treats a missing luminosity as 1.';
    if (has(cells, PHYSICAL.concat(SOCIAL))) return 'Rolled this profile.';
    if (isMainworld && has(cells, PHYSICAL)) {
        return 'Rolled size, atmosphere, and hydrographics. This is the mainworld, so population, government, law, starport, and tech level stay as they are.';
    }
    if (has(cells, PHYSICAL)) {
        return 'Rolled size, atmosphere, and hydrographics. Population, government, law, starport, and tech level need another body\'s mainworld profile.' + (kind === 'belt' ? '' : star);
    }
    if (kind === 'belt' && cells.s) return 'Rolled size. Atmosphere, hydrographics, and the social cells need another body\'s mainworld profile.';
    return 'Nothing was written.' + star;
}

function rollIsolated(input) {
    const sink = [];
    const savedLines = trace.lines;
    const savedEnabled = trace.enabled;
    trace.lines = sink;
    trace.enabled = true;
    const stopped = [];
    try {
        startTrace(input.hexId, 'MgT2E', input.bodyId);
        const stars = (input.stars || []).map(resolveStar);
        if (stars.length === 0) stars.push({ lookedUp: false });
        const hzco = hzcoOf(stars, input.body);
        const body = engineBody(input.body, hzco);
        const sys = { stars, worlds: [body], hexId: input.hexId };
        if (finite(hzco)) sys.hzco = hzco;
        const step = (name, fn) => {
            try { fn(); }
            catch (err) { stopped.push(`${name}: ${err && err.message ? err.message : String(err)}`); }
        };
        step('physicals', () => generatePhysicals(sys));
        step('atmospherics', () => generateAtmospherics(sys));
        step('rotation', () => generateRotationalDynamics(sys));
        step('biospherics', () => generateBiospherics(sys));
        if (input.mainworld && input.body.kind !== 'gas' && !input.isMainworld) {
            step('social', () => generateCoreSocial(sys, input.mainworld));
        }
        const cells = input.body.kind === 'gas' ? {} : readCells(body);
        const lookedUp = stars[body.parentStarIdx || 0] && stars[body.parentStarIdx || 0].lookedUp;
        const message = messageFor(input.body.kind, cells, input.isMainworld, body.uwpGG, lookedUp);
        return { cells, message, stopped, trace: sink.slice() };
    } finally {
        trace.lines = savedLines;
        trace.enabled = savedEnabled;
    }
}

/**
 * Fill one body's profile cells.
 * The same `hexId`, `bodyId`, `roll`, and current master seed return the same cells.
 * `roll` is 0, then 1, then 2, for each new roll of that body.
 *
 * @param {{ hexId: string, bodyId: string, roll: number, stars: object[], body: object, mainworld: object|null, isMainworld: boolean }} input
 * @returns {{ cells: Record<string, string>, message: string, trace: string[] }}
 */
export function rollBodyProfile(input) {
    const roll = finite(input.roll) ? input.roll : 0;
    return isolateRng(`${input.hexId}|${input.bodyId}|${roll}`, () => rollIsolated({ ...input, roll }));
}
