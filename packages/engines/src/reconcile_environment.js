/**
 * Tier 1 reconciliation, plan sections 3.1 to 3.3.
 * Climate limits, orbit bands and exotic liquids come from the generated
 * rules modules. Q2 and Q3 are the accepted answers, stored on the policy.
 * No pressure correction. Magma is not a candidate.
 */
import climateBands from './generated/rules/mgt2e_climate_bands.js';
import { MgT2EData } from './generated/rules/mgt2e_data.js';

const CELSIUS_TO_KELVIN = 273.15;

const WRITTEN = ['surfaceTempBand', 'orbitalTempBand', 'liquidType', 'liquidStatus', 'reconciliation'];

function finiteNumber(value) {
    return typeof value === 'number' && Number.isFinite(value);
}

function toScale(value) {
    return value < 1.0 ? 10 * value : value + 9;
}

function same(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
}

function liquidPolicy() {
    return Object.freeze({
        q2: Object.freeze({
            choice: 'a',
            pick: 'highest-abundance',
            ties: 'table-order',
            validOriginalFirst: true,
        }),
        q3: Object.freeze({
            choice: 'a',
            identity: 'mean',
            phaseNotes: 'low-and-high',
            limits: 'inclusive',
            exoticAtmospheres: Object.freeze([10, 11, 12]),
            vacuumAtmospheres: Object.freeze([0]),
            ordinarySubstance: 'Water',
            iceLabel: 'Ice',
            unknownLabel: 'Unknown Exotic Liquid',
        }),
    });
}

function freezeSurface(table) {
    if (!table || table.unit !== 'C' || !Array.isArray(table.bands) || table.bands.length === 0) {
        throw new Error('mgt2e_climate_bands is missing its Celsius bands');
    }
    const bands = table.bands.map((band, index) => {
        if (!band || typeof band.word !== 'string' || band.word.length === 0) {
            throw new Error('a climate band is missing its word');
        }
        const last = index === table.bands.length - 1;
        if (last) {
            if (band.maxC !== null) throw new Error('the last climate band must be open');
            return Object.freeze({ word: band.word, maxK: null });
        }
        if (!finiteNumber(band.maxC)) throw new Error('a climate band is missing maxC');
        return Object.freeze({ word: band.word, maxK: band.maxC + CELSIUS_TO_KELVIN });
    });
    for (let index = 1; index < bands.length; index += 1) {
        const previous = bands[index - 1].maxK;
        const current = bands[index].maxK;
        if (previous == null) throw new Error('only the last climate band may be open');
        if (current != null && !(current > previous)) throw new Error('climate bands must rise');
    }
    return Object.freeze(bands);
}

function freezeOrbit(table) {
    if (!Array.isArray(table) || table.length === 0) {
        throw new Error('temperatureBands is missing');
    }
    return Object.freeze(table.map((entry) => {
        if (!entry || typeof entry.band !== 'string') throw new Error('a temperature band is missing its name');
        const frozen = { band: entry.band };
        if (entry.maxDeviation !== undefined) frozen.maxDeviation = entry.maxDeviation;
        return Object.freeze(frozen);
    }));
}

function freezeLiquids(table, waterName) {
    if (!Array.isArray(table) || table.length === 0) throw new Error('exoticLiquids is missing');
    const rows = table.map((row) => {
        if (!row || typeof row.name !== 'string' || row.name.length === 0) {
            throw new Error('an exotic liquid is missing its name');
        }
        if (!finiteNumber(row.mp) || !finiteNumber(row.bp) || !finiteNumber(row.abundance)) {
            throw new Error('an exotic liquid is missing mp, bp or abundance');
        }
        return Object.freeze({ name: row.name, mp: row.mp, bp: row.bp, abundance: row.abundance });
    });
    if (!rows.some((row) => row.name === waterName)) throw new Error('exoticLiquids is missing Water');
    return Object.freeze(rows);
}

function policyVersion(surface, orbit, liquid, liquids) {
    return JSON.stringify({ surface, orbit, liquid, liquids });
}

export function environmentPolicyFrom(climate, orbitTable, liquidsTable) {
    const liquid = liquidPolicy();
    const surfaceBands = freezeSurface(climate);
    const orbitBands = freezeOrbit(orbitTable);
    const liquids = freezeLiquids(liquidsTable, liquid.q3.ordinarySubstance);
    return Object.freeze({
        version: policyVersion(surfaceBands, orbitBands, liquid, liquids),
        surfaceBands,
        orbitBands,
        liquid,
        liquids,
    });
}

export const environmentPolicy = environmentPolicyFrom(
    climateBands,
    MgT2EData.temperatureBands,
    MgT2EData.atmosphereExtended.exoticLiquids,
);

/** Surface climate from a final meanTempK. Missing or non-finite is unknown. */
export function surfaceTempBand(meanTempK, policy) {
    if (!finiteNumber(meanTempK)) return { status: 'unknown' };
    for (const band of policy.surfaceBands) {
        if (band.maxK == null || meanTempK <= band.maxK) {
            return { status: 'known', band: band.word };
        }
    }
    return { status: 'unknown' };
}

function orbitWord(orbitId, hzco, policy) {
    const diff = toScale(orbitId) - toScale(hzco);
    const table = policy.orbitBands;
    let band = table[table.length - 1].band;
    for (const entry of table) {
        if (entry.maxDeviation === undefined || diff <= entry.maxDeviation) {
            band = entry.band;
            break;
        }
    }
    return band;
}

/**
 * Effective HZCO matches getTempBand's call: worldHzco, otherwise the system hzco.
 * A zero is absent in that expression.
 */
function effectiveHzco(body, systemHzco) {
    if (finiteNumber(body.worldHzco) && body.worldHzco !== 0) return body.worldHzco;
    if (finiteNumber(systemHzco) && systemHzco !== 0) return systemHzco;
    return null;
}

export function orbitalTempBand(body, systemHzco, policy) {
    const orbitId = body.orbitId;
    const hzco = effectiveHzco(body, systemHzco);
    const missing = [];
    if (!finiteNumber(orbitId)) missing.push('orbitId');
    if (hzco == null) missing.push('hzco');
    if (missing.length) {
        return { status: 'unknown', missing };
    }
    return {
        status: 'known',
        band: orbitWord(orbitId, hzco, policy),
        provenance: 'reconstructed',
    };
}

function reconciliationFor(body, policy) {
    const existing = body.reconciliation;
    const original = existing && existing.original;
    const complete = !!(original && 'tempBand' in original && 'liquidType' in original);
    if (existing && existing.version === policy.version && complete) return existing;
    return {
        version: policy.version,
        original: complete ? original : {
            tempBand: original && 'tempBand' in original
                ? original.tempBand
                : (body.tempBand === undefined ? null : body.tempBand),
            liquidType: body.liquidType === undefined ? null : body.liquidType,
        },
    };
}

function hexOf(tree, system) {
    if (tree && typeof tree.hexKey === 'string') return tree.hexKey;
    if (system && typeof system.hexId === 'string') return system.hexId;
    if (tree && tree.body && typeof tree.body.hexId === 'string') return tree.body.hexId;
    return null;
}

function locate(tree) {
    if (tree && tree.body && tree.body.mgtSystem && Array.isArray(tree.body.mgtSystem.worlds)) {
        return { kind: 'envelope', system: tree.body.mgtSystem };
    }
    if (tree && tree.mgtSystem && Array.isArray(tree.mgtSystem.worlds)) {
        return { kind: 'record', system: tree.mgtSystem };
    }
    if (tree && Array.isArray(tree.worlds)) return { kind: 'system', system: tree };
    return null;
}

function replaceSystem(tree, kind, system) {
    if (kind === 'system') return system;
    if (kind === 'record') return { ...tree, mgtSystem: system };
    return { ...tree, body: { ...tree.body, mgtSystem: system } };
}

function liquidLocked(body) {
    return Array.isArray(body._manualFields) && body._manualFields.includes('liquidType');
}

function packStatus(fields) {
    const status = { status: fields.status, outcome: fields.outcome };
    if (fields.substance !== undefined) status.substance = fields.substance;
    if (fields.phase !== undefined) status.phase = fields.phase;
    if (fields.blocking === true) status.blocking = true;
    return status;
}

function rowByName(liquids, name) {
    return liquids.find((row) => row.name === name) || null;
}

function readTemps(body) {
    return {
        low: finiteNumber(body.lowTempK) ? body.lowTempK : null,
        mean: finiteNumber(body.meanTempK) ? body.meanTempK : null,
        high: finiteNumber(body.highTempK) ? body.highTempK : null,
    };
}

function rangeInverted(temps) {
    return temps.low != null && temps.mean != null && temps.high != null
        && !(temps.low <= temps.mean && temps.mean <= temps.high);
}

/** Table limits are inclusive, matching the engine candidate filter. */
function inWindow(mean, row) {
    return mean >= row.mp && mean <= row.bp;
}

function phaseAt(temp, row) {
    if (temp < row.mp) return 'solid';
    if (temp > row.bp) return 'gas';
    return 'liquid';
}

function phaseNotes(row, temps) {
    const notes = {};
    if (temps.low != null && phaseAt(temps.low, row) !== 'liquid') notes.low = phaseAt(temps.low, row);
    if (temps.mean != null && phaseAt(temps.mean, row) !== 'liquid') notes.mean = phaseAt(temps.mean, row);
    if (temps.high != null && phaseAt(temps.high, row) !== 'liquid') notes.high = phaseAt(temps.high, row);
    return Object.keys(notes).length ? notes : undefined;
}

/**
 * Free-standing liquid is eligible only when the atmosphere allows it.
 * Vacuum has none. Ordinary atmospheres have Water only. Exotics stay on 10-12.
 */
function eligibleRows(policy, mean, atmCode) {
    const spec = policy.liquid.q3;
    if (spec.vacuumAtmospheres.includes(atmCode)) return [];
    if (spec.exoticAtmospheres.includes(atmCode)) {
        return policy.liquids.filter((row) => inWindow(mean, row));
    }
    const water = rowByName(policy.liquids, spec.ordinarySubstance);
    if (water && inWindow(mean, water)) return [water];
    return [];
}

/** Highest abundance, earlier table row on a tie. A stored eligible row wins first. */
function chooseRow(rows, storedName) {
    if (storedName) {
        const kept = rows.find((row) => row.name === storedName);
        if (kept) return kept;
    }
    let best = null;
    for (const row of rows) {
        if (!best || row.abundance > best.abundance) best = row;
    }
    return best;
}

function knownStatus(outcome, row, temps, liquidType, replace) {
    return {
        replace,
        liquidType,
        liquidStatus: packStatus({
            status: 'known',
            outcome,
            substance: row.name,
            phase: phaseNotes(row, temps),
        }),
    };
}

function unresolvedStatus(outcome, clear) {
    return {
        replace: clear === true,
        liquidType: null,
        liquidStatus: packStatus({ status: 'unresolved', outcome }),
    };
}

function missingStatus() {
    return unresolvedStatus('missing', false);
}

/**
 * A manual liquidType is not rewritten. An incompatible lock is the
 * missing-fields row: unresolved, original string kept.
 */
function honorLock(body, result) {
    if (!liquidLocked(body) || !result.replace) return result;
    if (same(body.liquidType, result.liquidType)) return { replace: false, liquidStatus: result.liquidStatus };
    return missingStatus();
}

function hydroKind(percent) {
    if (!finiteNumber(percent) || percent < 0 || percent > 100) return 'invalid';
    if (percent === 0) return 'zero';
    return 'positive';
}

/** The label captured once in provenance, so a corrected value is not classified again. */
function provenanceLiquid(body) {
    const original = body.reconciliation && body.reconciliation.original;
    if (original && 'liquidType' in original) return original.liquidType;
    return body.liquidType === undefined ? null : body.liquidType;
}

function decideLiquid(body, policy, temps) {
    const spec = policy.liquid.q3;
    const hydro = hydroKind(body.hydroPercent);
    if (hydro === 'invalid') {
        return {
            replace: false,
            hydroInvalid: true,
            liquidStatus: packStatus({ status: 'unknown', outcome: 'hydro-invalid', blocking: true }),
        };
    }
    if (hydro === 'zero') {
        const outcome = provenanceLiquid(body) === spec.iceLabel ? 'ice-zero' : 'zero';
        return { replace: true, liquidType: null, liquidStatus: packStatus({ status: 'none', outcome }) };
    }

    const water = rowByName(policy.liquids, spec.ordinarySubstance);
    const label = provenanceLiquid(body);
    const stored = typeof label === 'string' && label.length > 0 ? label : null;
    const frozen = stored === spec.iceLabel && temps.high != null && temps.high < water.mp;
    if (frozen) {
        return {
            replace: false,
            liquidStatus: packStatus({
                status: 'known',
                outcome: 'ice-frozen',
                substance: water.name,
                phase: 'solid',
            }),
        };
    }

    const atm = finiteNumber(body.atmCode) ? body.atmCode : null;
    if (temps.mean == null || atm == null || (stored === spec.iceLabel && temps.high == null)) return missingStatus();

    if (stored === spec.iceLabel) {
        const rows = eligibleRows(policy, temps.mean, atm);
        const waterRow = rows.find((row) => row.name === water.name);
        if (waterRow) return knownStatus('ice-thaw', waterRow, temps, waterRow.name, true);
        const pick = chooseRow(rows, null);
        if (pick) return knownStatus('ice-thaw', pick, temps, pick.name, true);
        return unresolvedStatus('ice-thaw', false);
    }

    if (stored === spec.unknownLabel) {
        const pick = chooseRow(eligibleRows(policy, temps.mean, atm), null);
        if (pick) return knownStatus('unknown-exotic', pick, temps, pick.name, true);
        return unresolvedStatus('unknown-exotic', true);
    }

    const row = stored ? rowByName(policy.liquids, stored) : null;
    if (!row) return missingStatus();

    const rows = eligibleRows(policy, temps.mean, atm);
    if (rows.some((item) => item.name === row.name)) return knownStatus('known-valid', row, temps, row.name, false);
    const pick = chooseRow(rows, null);
    if (pick) return knownStatus('known-outside', pick, temps, pick.name, true);
    return unresolvedStatus('known-outside', false);
}

function reconcileLiquid(body, policy, hex, path, diagnostics) {
    const temps = readTemps(body);
    if (hydroKind(body.hydroPercent) === 'positive' && rangeInverted(temps)) {
        diagnostics.push({ hex, path, field: 'temperature', kind: 'temperature-inverted', status: 'inverted' });
    }
    const result = honorLock(body, decideLiquid(body, policy, temps));
    if (result.hydroInvalid) {
        diagnostics.push({
            hex,
            path,
            field: 'hydroPercent',
            kind: 'hydro-invalid',
            status: 'unknown',
            blocking: true,
        });
    } else if (result.liquidStatus.status === 'unresolved') {
        diagnostics.push({
            hex,
            path,
            field: 'liquidType',
            kind: 'liquid-unresolved',
            status: 'unresolved',
            outcome: result.liquidStatus.outcome,
        });
    }
    return result;
}

function reconcileList(list, systemHzco, hex, path, policy, changes, diagnostics) {
    let changed = false;
    const next = list.map((body, index) => {
        if (!body || typeof body !== 'object') return body;
        const here = `${path}[${index}]`;
        const moons = Array.isArray(body.moons)
            ? reconcileList(body.moons, systemHzco, hex, `${here}.moons`, policy, changes, diagnostics)
            : body.moons;
        const surface = surfaceTempBand(body.meanTempK, policy);
        const orbital = orbitalTempBand(body, systemHzco, policy);
        const reconciliation = reconciliationFor(body, policy);
        const liquid = reconcileLiquid(body, policy, hex, here, diagnostics);
        if (surface.status === 'unknown') {
            diagnostics.push({ hex, path: here, field: 'surfaceTempBand', kind: 'surface-unknown', status: 'unknown' });
        }
        if (orbital.status === 'unknown') {
            diagnostics.push({
                hex,
                path: here,
                field: 'orbitalTempBand',
                kind: 'orbital-unknown',
                status: 'unknown',
                missing: orbital.missing,
            });
        }
        const surfaceChanged = !same(body.surfaceTempBand, surface);
        const orbitalChanged = !same(body.orbitalTempBand, orbital);
        const reconciliationChanged = reconciliation !== body.reconciliation;
        const moonsChanged = moons !== body.moons;
        const liquidTypeChanged = liquid.replace && !same(body.liquidType, liquid.liquidType);
        const liquidStatusChanged = !same(body.liquidStatus, liquid.liquidStatus);
        if (!surfaceChanged && !orbitalChanged && !reconciliationChanged && !moonsChanged
            && !liquidTypeChanged && !liquidStatusChanged) return body;
        changed = true;
        const copy = { ...body };
        if (moonsChanged) copy.moons = moons;
        if (surfaceChanged) {
            changes.push({ hex, path: here, field: 'surfaceTempBand', before: body.surfaceTempBand ?? null, after: surface });
            copy.surfaceTempBand = surface;
        }
        if (orbitalChanged) {
            changes.push({ hex, path: here, field: 'orbitalTempBand', before: body.orbitalTempBand ?? null, after: orbital });
            copy.orbitalTempBand = orbital;
        }
        if (liquidTypeChanged) {
            changes.push({ hex, path: here, field: 'liquidType', before: body.liquidType ?? null, after: liquid.liquidType });
            copy.liquidType = liquid.liquidType;
        }
        if (liquidStatusChanged) {
            changes.push({ hex, path: here, field: 'liquidStatus', before: body.liquidStatus ?? null, after: liquid.liquidStatus });
            copy.liquidStatus = liquid.liquidStatus;
        }
        if (reconciliationChanged) {
            changes.push({ hex, path: here, field: 'reconciliation', before: body.reconciliation ?? null, after: reconciliation });
            copy.reconciliation = reconciliation;
        }
        return copy;
    });
    return changed ? next : list;
}

export function reconcileTree(tree, policy) {
    if (!policy || !policy.surfaceBands || !policy.orbitBands || typeof policy.version !== 'string') {
        throw new Error('reconcileTree requires a versioned policy');
    }
    if (!policy.liquids || !same(policy.liquid, liquidPolicy())) {
        throw new Error('reconcileTree requires the accepted Q2 and Q3 answers');
    }
    const found = locate(tree);
    if (!found) return { tree, changes: [], diagnostics: [] };
    const changes = [];
    const diagnostics = [];
    const worlds = reconcileList(
        found.system.worlds,
        found.system.hzco,
        hexOf(tree, found.system),
        'worlds',
        policy,
        changes,
        diagnostics,
    );
    if (worlds === found.system.worlds) return { tree, changes, diagnostics };
    const system = { ...found.system, worlds };
    return { tree: replaceSystem(tree, found.kind, system), changes, diagnostics };
}

export const RECONCILE_FIELDS = Object.freeze(WRITTEN);
