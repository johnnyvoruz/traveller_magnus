import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { stable } from '../../packages/shared/src/stable.ts';
import { auditTree, countAudit } from './environment_audit.js';
import { MgT2EData } from '../../packages/engines/src/generated/rules/mgt2e_data.js';
import {
    RECONCILE_FIELDS,
    environmentPolicy,
    orbitalTempBand,
    reconcileTree,
    surfaceTempBand,
} from '../../packages/engines/src/reconcile_environment.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CELSIUS_TO_KELVIN = 273.15;
const climate = JSON.parse(readFileSync(path.join(root, 'rules', 'mgt2e_climate_bands.json'), 'utf8'));

function wordFor(meanTempK) {
    for (const band of climate.bands) {
        const maxK = band.maxC == null ? null : band.maxC + CELSIUS_TO_KELVIN;
        if (maxK == null || meanTempK <= maxK) return band.word;
    }
    return null;
}

function stepAcross() {
    const limits = climate.bands.filter((band) => band.maxC != null).map((band) => band.maxC + CELSIUS_TO_KELVIN);
    let gap = Infinity;
    for (let index = 1; index < limits.length; index += 1) gap = Math.min(gap, limits[index] - limits[index - 1]);
    return gap / 1000;
}

function treeWith(body) {
    return {
        hexKey: 'boundary',
        body: { mgtSystem: { hzco: body.worldHzco, worlds: [body] } },
    };
}

function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    for (const key of Object.keys(value)) deepFreeze(value[key]);
    return Object.freeze(value);
}

function strip(value) {
    if (Array.isArray(value)) return value.map(strip);
    if (value && typeof value === 'object') {
        const out = {};
        for (const key of Object.keys(value)) {
            if (RECONCILE_FIELDS.includes(key)) continue;
            out[key] = strip(value[key]);
        }
        return out;
    }
    return value;
}

function toScale(value) {
    return value < 1.0 ? 10 * value : value + 9;
}

function orbitWord(orbitId, hzco) {
    const diff = toScale(orbitId) - toScale(hzco);
    const table = MgT2EData.temperatureBands;
    let band = table[table.length - 1].band;
    for (const entry of table) {
        if (entry.maxDeviation === undefined || diff <= entry.maxDeviation) {
            band = entry.band;
            break;
        }
    }
    return band;
}

function bodies(tree) {
    const worlds = tree.body.mgtSystem.worlds;
    const found = [];
    function walk(list, prefix) {
        list.forEach((body, index) => {
            const here = `${prefix}[${index}]`;
            found.push({ path: here, body });
            if (Array.isArray(body.moons)) walk(body.moons, `${here}.moons`);
        });
    }
    walk(worlds, 'worlds');
    return found;
}

function loadFixture(name) {
    return JSON.parse(readFileSync(path.join(root, 'tests', 'golden', 'fixtures', 'engine_corrections', name), 'utf8'));
}

test('surface bands follow each file limit, inclusive, with no default', () => {
    const step = stepAcross();
    climate.bands.forEach((band, index) => {
        if (band.maxC == null) {
            assert.equal(environmentPolicy.surfaceBands[index].maxK, null);
            return;
        }
        const limit = band.maxC + CELSIUS_TO_KELVIN;
        assert.equal(environmentPolicy.surfaceBands[index].maxK, limit);
        assert.equal(environmentPolicy.surfaceBands[index].word, band.word);
        assert.deepEqual(surfaceTempBand(limit - step, environmentPolicy), { status: 'known', band: wordFor(limit - step) });
        assert.deepEqual(surfaceTempBand(limit, environmentPolicy), { status: 'known', band: wordFor(limit) });
        assert.equal(wordFor(limit), band.word);
        const above = surfaceTempBand(limit + step, environmentPolicy);
        assert.deepEqual(above, { status: 'known', band: wordFor(limit + step) });
        assert.equal(above.band, climate.bands[index + 1].word);
    });
    for (const value of [undefined, null, Number.NaN, Infinity, -Infinity, '288']) {
        assert.deepEqual(surfaceTempBand(value, environmentPolicy), { status: 'unknown' });
    }
    assert.equal(Object.isFrozen(environmentPolicy), true);
    assert.equal(typeof environmentPolicy.version, 'string');
});

test('orbital band is reconstructed, and a stored Boiling tag is not its history', () => {
    const missing = orbitalTempBand({ tempBand: 'Boiling', meanTempK: 1 }, null, environmentPolicy);
    assert.deepEqual(missing, { status: 'unknown', missing: ['orbitId', 'hzco'] });
    const orbitId = 4;
    const hzco = 4;
    const known = orbitalTempBand({ orbitId, worldHzco: hzco, tempBand: 'Boiling' }, null, environmentPolicy);
    assert.equal(known.provenance, 'reconstructed');
    assert.equal(known.status, 'known');
    assert.equal(known.band, orbitWord(orbitId, hzco));
    assert.notEqual(known.band, 'Boiling');
});

test('reconcile writes only the allowlist, keeps the input, and a second run changes nothing', () => {
    const step = stepAcross();
    const limit = environmentPolicy.surfaceBands.find((band) => band.maxK != null).maxK;
    const source = treeWith({
        name: 'Boundary',
        type: 'Terrestrial Planet',
        tempBand: 'Boiling',
        meanTempK: limit,
        orbitId: 3,
        worldHzco: 3,
        liquidType: 'Oxygen',
        hydroPercent: 40,
    });
    const before = stable(source);
    deepFreeze(source);
    const random = Math.random;
    const now = Date.now;
    Math.random = () => { throw new Error('rng'); };
    Date.now = () => { throw new Error('clock'); };
    let once;
    try {
        once = reconcileTree(source, environmentPolicy);
    } finally {
        Math.random = random;
        Date.now = now;
    }
    assert.equal(stable(source), before);
    const body = once.tree.body.mgtSystem.worlds[0];
    assert.equal(body.tempBand, 'Boiling');
    assert.equal(body.liquidType, 'Oxygen');
    assert.equal(body.hydroPercent, 40);
    assert.equal(body.meanTempK, limit);
    assert.equal(body.liquidStatus.status, 'unresolved');
    assert.equal(body.reconciliation.original.liquidType, 'Oxygen');
    assert.deepEqual(body.surfaceTempBand, { status: 'known', band: wordFor(limit) });
    assert.equal(body.orbitalTempBand.provenance, 'reconstructed');
    assert.equal(body.reconciliation.original.tempBand, 'Boiling');
    assert.equal(once.changes.every((change) => RECONCILE_FIELDS.includes(change.field)), true);
    assert.equal(stable(strip(once.tree)), stable(strip(JSON.parse(before))));

    const low = treeWith({ name: 'No temperature', tempBand: 'Frozen' });
    const unknown = reconcileTree(low, environmentPolicy);
    assert.deepEqual(unknown.tree.body.mgtSystem.worlds[0].surfaceTempBand, { status: 'unknown' });
    assert.equal(unknown.tree.body.mgtSystem.worlds[0].orbitalTempBand.status, 'unknown');
    assert.equal(unknown.diagnostics.length, 3);
    assert.equal(unknown.tree.body.mgtSystem.worlds[0].liquidStatus.status, 'unknown');
    assert.equal(unknown.tree.body.mgtSystem.worlds[0].liquidStatus.blocking, true);
    assert.equal(unknown.tree.body.mgtSystem.worlds[0].liquidType, undefined);
    assert.deepEqual(unknown.diagnostics.map((item) => item.kind).sort(), ['hydro-invalid', 'orbital-unknown', 'surface-unknown']);

    const twice = reconcileTree(once.tree, environmentPolicy);
    assert.equal(stable(twice.tree), stable(once.tree));
    assert.equal(twice.changes.length, 0);
    assert.deepEqual(twice.diagnostics, once.diagnostics);
    assert.equal(twice.tree.body.mgtSystem.worlds[0].reconciliation.original.tempBand, 'Boiling');

    const moved = structuredClone(once.tree);
    moved.body.mgtSystem.worlds[0].tempBand = wordFor(limit + step);
    const kept = reconcileTree(moved, environmentPolicy);
    assert.equal(kept.tree.body.mgtSystem.worlds[0].reconciliation.original.tempBand, 'Boiling');
    assert.equal(kept.changes.length, 0);
});

test('Regina and Zeycude keep every field off the allowlist', () => {
    for (const file of ['regina.json', 'zeycude.json']) {
        const source = loadFixture(file);
        const before = stable(source);
        deepFreeze(source);
        const once = reconcileTree(source, environmentPolicy);
        assert.equal(stable(source), before);
        assert.equal(stable(strip(once.tree)), stable(strip(JSON.parse(before))));
        const twice = reconcileTree(once.tree, environmentPolicy);
        assert.equal(stable(twice.tree), stable(once.tree));
        assert.equal(twice.changes.length, 0);
        assert.deepEqual(twice.diagnostics, once.diagnostics);
        const sourceBodies = bodies(JSON.parse(before));
        const water = environmentPolicy.liquids.find((row) => row.name === environmentPolicy.liquid.q3.ordinarySubstance);
        bodies(once.tree).forEach(({ path: bodyPath, body }, index) => {
            const source = sourceBodies[index].body;
            assert.equal(bodyPath, sourceBodies[index].path);
            assert.equal(body.hydroPercent, source.hydroPercent);
            assert.equal(body.hydroCode, source.hydroCode);
            assert.equal(body.meanTempK, source.meanTempK);
            assert.equal(body.reconciliation.original.liquidType, source.liquidType === undefined ? null : source.liquidType);
            assert.equal(body.reconciliation.original.tempBand, body.tempBand === undefined ? null : body.tempBand);
            if (source.hydroPercent === 0) {
                assert.equal(body.liquidType, null);
                assert.equal(body.liquidStatus.status, 'none');
            }
            if (body.liquidStatus.outcome === 'ice-frozen') {
                assert.equal(body.liquidType, environmentPolicy.liquid.q3.iceLabel);
                assert.equal(body.liquidStatus.phase, 'solid');
                assert.equal(body.liquidStatus.substance, water.name);
                assert.ok(source.highTempK < water.mp);
            } else if (body.liquidStatus.status === 'known') {
                const row = environmentPolicy.liquids.find((item) => item.name === body.liquidStatus.substance);
                assert.ok(row);
                assert.ok(source.meanTempK >= row.mp && source.meanTempK <= row.bp);
            }
            if (typeof body.meanTempK === 'number' && Number.isFinite(body.meanTempK)) {
                assert.deepEqual(body.surfaceTempBand, { status: 'known', band: wordFor(body.meanTempK) });
            } else {
                assert.deepEqual(body.surfaceTempBand, { status: 'unknown' });
            }
            if (body.orbitalTempBand.status === 'known') {
                assert.equal(body.orbitalTempBand.provenance, 'reconstructed');
                assert.equal(body.orbitalTempBand.band, orbitWord(body.orbitId, body.worldHzco || once.tree.body.mgtSystem.hzco));
            }
        });
        if (file === 'regina.json') {
            const again = JSON.parse(before);
            const sourceMain = bodies(again).find((item) => item.body.name === 'Regina A-I').body;
            const main = bodies(once.tree).find((item) => item.body.name === 'Regina A-I').body;
            const acid = environmentPolicy.liquids.find((row) => row.name === sourceMain.liquidType);
            assert.ok(sourceMain.meanTempK >= acid.mp && sourceMain.meanTempK <= acid.bp);
            assert.ok(sourceMain.highTempK > acid.bp);
            assert.equal(main.liquidType, sourceMain.liquidType);
            assert.equal(main.liquidStatus.outcome, 'known-valid');
            assert.equal(main.liquidStatus.phase.high, 'gas');

            const sourceMoon = bodies(again).find((item) => item.body.name === 'Regina A-X-c').body;
            const moon = bodies(once.tree).find((item) => item.body.name === 'Regina A-X-c').body;
            const open = environmentPolicy.liquids.filter((row) => sourceMoon.meanTempK >= row.mp && sourceMoon.meanTempK <= row.bp);
            let picked = open[0];
            for (const row of open) if (row.abundance > picked.abundance) picked = row;
            assert.notEqual(picked.name, sourceMoon.liquidType);
            assert.equal(moon.liquidType, picked.name);
            assert.equal(moon.liquidStatus.outcome, 'known-outside');
            assert.equal(moon.reconciliation.original.liquidType, sourceMoon.liquidType);
            assert.equal(moon.hydroPercent, sourceMoon.hydroPercent);
        }
    }
});

function liquidStep(rows) {
    const points = [];
    for (const row of rows) points.push(row.mp, row.bp);
    points.sort((left, right) => left - right);
    let gap = Infinity;
    for (let index = 1; index < points.length; index += 1) {
        if (points[index] > points[index - 1]) gap = Math.min(gap, points[index] - points[index - 1]);
    }
    return gap / 1000;
}

function ordinaryAtmosphere(policy) {
    const blocked = new Set([...policy.liquid.q3.exoticAtmospheres, ...policy.liquid.q3.vacuumAtmospheres]);
    let code = 2;
    while (blocked.has(code)) code += 1;
    return code;
}

function waterRow(policy) {
    return policy.liquids.find((row) => row.name === policy.liquid.q3.ordinarySubstance);
}

function one(body) {
    const result = reconcileTree(treeWith(body), environmentPolicy);
    const twice = reconcileTree(result.tree, environmentPolicy);
    assert.equal(stable(twice.tree), stable(result.tree));
    assert.equal(twice.changes.length, 0);
    return result.tree.body.mgtSystem.worlds[0];
}

test('each liquid outcome row is one branch, and the limits are the table limits', () => {
    const policy = environmentPolicy;
    const water = waterRow(policy);
    const step = liquidStep(policy.liquids);
    const ordinary = ordinaryAtmosphere(policy);
    const exotic = policy.liquid.q3.exoticAtmospheres[0];
    const vacuum = policy.liquid.q3.vacuumAtmospheres[0];
    const unknown = policy.liquid.q3.unknownLabel;
    const ice = policy.liquid.q3.iceLabel;
    const midpoint = (water.mp + water.bp) / 2;
    const other = policy.liquids.find((row) => row.name !== water.name);

    const valid = one({
        liquidType: water.name, hydroPercent: 40, atmCode: ordinary,
        meanTempK: midpoint, lowTempK: water.mp - step, highTempK: midpoint,
    });
    assert.equal(valid.liquidType, water.name);
    assert.equal(valid.liquidStatus.outcome, 'known-valid');
    assert.equal(valid.liquidStatus.phase.low, 'solid');
    assert.equal(valid.liquidStatus.phase.high, undefined);

    const atLow = one({
        liquidType: water.name, hydroPercent: 40, atmCode: ordinary,
        meanTempK: water.mp, lowTempK: water.mp, highTempK: water.mp,
    });
    const below = one({
        liquidType: water.name, hydroPercent: 40, atmCode: ordinary,
        meanTempK: water.mp - step, lowTempK: water.mp - step, highTempK: water.mp - step,
    });
    const atHigh = one({
        liquidType: water.name, hydroPercent: 40, atmCode: ordinary,
        meanTempK: water.bp, lowTempK: water.bp, highTempK: water.bp,
    });
    const above = one({
        liquidType: water.name, hydroPercent: 40, atmCode: ordinary,
        meanTempK: water.bp + step, lowTempK: water.bp + step, highTempK: water.bp + step,
    });
    assert.equal(atLow.liquidStatus.outcome, 'known-valid');
    assert.equal(atHigh.liquidStatus.outcome, 'known-valid');
    assert.equal(below.liquidStatus.status, 'unresolved');
    assert.equal(below.liquidType, water.name);
    assert.equal(above.liquidStatus.outcome, 'known-outside');
    assert.equal(above.liquidType, water.name);
    assert.equal(below.liquidStatus.substance, undefined);
    assert.equal(above.liquidStatus.substance, undefined);

    const rowAt = one({
        liquidType: other.name, hydroPercent: 15, atmCode: exotic,
        meanTempK: other.mp, lowTempK: other.mp, highTempK: other.mp,
    });
    const rowBelow = one({
        liquidType: other.name, hydroPercent: 15, atmCode: exotic,
        meanTempK: other.mp - step, lowTempK: other.mp - step, highTempK: other.mp - step,
    });
    assert.equal(rowAt.liquidType, other.name);
    assert.equal(rowAt.liquidStatus.outcome, 'known-valid');
    assert.notEqual(rowBelow.liquidStatus.outcome, 'known-valid');

    const replaced = one({
        liquidType: other.name, hydroPercent: 15, atmCode: ordinary,
        meanTempK: midpoint, lowTempK: midpoint, highTempK: midpoint,
    });
    assert.equal(replaced.liquidType, water.name);
    assert.equal(replaced.liquidStatus.outcome, 'known-outside');
    const breathable = one({
        liquidType: water.name, hydroPercent: 15, atmCode: ordinary,
        meanTempK: (other.mp + other.bp) / 2, lowTempK: other.mp, highTempK: other.bp,
    });
    assert.equal(breathable.liquidType, water.name);
    assert.equal(breathable.liquidStatus.status, 'unresolved');
    assert.equal(breathable.liquidStatus.outcome, 'known-outside');

    const dryIce = one({ liquidType: ice, hydroPercent: 0, atmCode: vacuum, meanTempK: midpoint, highTempK: midpoint });
    assert.equal(dryIce.liquidType, null);
    assert.deepEqual(dryIce.liquidStatus, { status: 'none', outcome: 'ice-zero' });
    assert.equal(dryIce.reconciliation.original.liquidType, ice);
    const dryOther = one({ liquidType: unknown, hydroPercent: 0, atmCode: exotic, meanTempK: midpoint });
    assert.equal(dryOther.liquidType, null);
    assert.equal(dryOther.liquidStatus.outcome, 'zero');
    assert.equal(dryOther.liquidStatus.status, 'none');

    const frozen = one({
        liquidType: ice, hydroPercent: 20, atmCode: ordinary,
        meanTempK: water.mp - step, lowTempK: water.mp - step, highTempK: water.mp - step,
    });
    assert.equal(frozen.liquidType, ice);
    assert.equal(frozen.liquidStatus.substance, water.name);
    assert.equal(frozen.liquidStatus.phase, 'solid');
    assert.equal(frozen.liquidStatus.outcome, 'ice-frozen');
    const frozenVacuum = one({
        liquidType: ice, hydroPercent: 20, atmCode: vacuum,
        highTempK: water.mp - step, meanTempK: water.mp - step,
    });
    assert.equal(frozenVacuum.liquidStatus.outcome, 'ice-frozen');
    assert.equal(frozenVacuum.liquidType, ice);

    const thawed = one({
        liquidType: ice, hydroPercent: 20, atmCode: ordinary,
        meanTempK: midpoint, lowTempK: water.mp - step, highTempK: water.bp,
    });
    assert.equal(thawed.liquidType, water.name);
    assert.equal(thawed.liquidStatus.outcome, 'ice-thaw');
    assert.equal(thawed.liquidStatus.phase.low, 'solid');
    assert.equal(policy.liquid.q3.vacuumAtmospheres.includes(1), false);
    const hotThin = one({
        liquidType: ice, hydroPercent: 20, atmCode: 1,
        meanTempK: midpoint, lowTempK: midpoint, highTempK: midpoint,
    });
    assert.equal(hotThin.liquidType, water.name);
    assert.equal(hotThin.liquidStatus.outcome, 'ice-thaw');
    const hotVacuum = one({
        liquidType: ice, hydroPercent: 20, atmCode: vacuum,
        meanTempK: midpoint, lowTempK: midpoint, highTempK: water.bp,
    });
    assert.equal(hotVacuum.liquidType, ice);
    assert.equal(hotVacuum.liquidStatus.status, 'unresolved');
    assert.equal(hotVacuum.liquidStatus.outcome, 'ice-thaw');

    const exoticPick = one({
        liquidType: unknown, hydroPercent: 26, atmCode: exotic,
        meanTempK: midpoint, lowTempK: midpoint, highTempK: midpoint,
    });
    const candidates = policy.liquids.filter((row) => midpoint >= row.mp && midpoint <= row.bp);
    let winner = candidates[0];
    for (const row of candidates) if (row.abundance > winner.abundance) winner = row;
    assert.equal(exoticPick.liquidType, winner.name);
    assert.equal(exoticPick.liquidStatus.outcome, 'unknown-exotic');
    const tooHot = Math.max(...policy.liquids.map((row) => row.bp)) + step;
    const none = one({
        liquidType: unknown, hydroPercent: 26, atmCode: exotic,
        meanTempK: tooHot, lowTempK: tooHot, highTempK: tooHot,
    });
    assert.equal(none.liquidType, null);
    assert.equal(none.liquidStatus.status, 'unresolved');
    assert.equal(none.liquidStatus.outcome, 'unknown-exotic');
    assert.equal(none.reconciliation.original.liquidType, unknown);
    assert.equal(none.liquidStatus.substance, undefined);

    const missingAtm = one({ liquidType: water.name, hydroPercent: 40, meanTempK: midpoint });
    assert.equal(missingAtm.liquidType, water.name);
    assert.equal(missingAtm.liquidStatus.outcome, 'missing');
    assert.equal(missingAtm.liquidStatus.status, 'unresolved');
    const missingPercent = reconcileTree(treeWith({ liquidType: water.name, meanTempK: midpoint, atmCode: ordinary }), environmentPolicy);
    const bare = missingPercent.tree.body.mgtSystem.worlds[0];
    assert.equal(bare.liquidType, water.name);
    assert.equal(bare.liquidStatus.status, 'unknown');
    assert.equal(bare.liquidStatus.blocking, true);
    assert.equal(bare.liquidStatus.outcome, 'hydro-invalid');
    assert.equal(missingPercent.diagnostics.some((item) => item.kind === 'hydro-invalid' && item.blocking === true), true);
    for (const percent of [Number.NaN, -step, 100 + step, Infinity]) {
        const broken = one({ liquidType: ice, hydroPercent: percent, meanTempK: midpoint, atmCode: ordinary });
        assert.equal(broken.liquidType, ice);
        assert.equal(broken.liquidStatus.status, 'unknown');
        assert.equal(broken.liquidStatus.blocking, true);
    }
    const magma = one({
        liquidType: 'Magma', hydroPercent: 20, atmCode: exotic,
        meanTempK: midpoint, lowTempK: midpoint, highTempK: midpoint,
    });
    assert.equal(magma.liquidType, 'Magma');
    assert.equal(magma.liquidStatus.outcome, 'missing');
    assert.equal(magma.liquidStatus.substance, undefined);

    const locked = one({
        liquidType: other.name, hydroPercent: 15, atmCode: ordinary,
        meanTempK: midpoint, lowTempK: midpoint, highTempK: midpoint,
        _manualFields: ['liquidType'],
    });
    assert.equal(locked.liquidType, other.name);
    assert.equal(locked.liquidStatus.status, 'unresolved');
    assert.equal(locked.liquidStatus.outcome, 'missing');

    let lower = null;
    let shared = null;
    for (let left = 0; left < policy.liquids.length && !lower; left += 1) {
        for (let right = left + 1; right < policy.liquids.length; right += 1) {
            const a = policy.liquids[left];
            const b = policy.liquids[right];
            const mean = Math.max(a.mp, b.mp);
            const high = Math.min(a.bp, b.bp);
            if (mean <= high && a.abundance !== b.abundance) {
                lower = a.abundance < b.abundance ? a : b;
                shared = mean;
                break;
            }
        }
    }
    const keptLower = one({
        liquidType: lower.name, hydroPercent: 12, atmCode: exotic,
        meanTempK: shared, lowTempK: shared, highTempK: shared,
    });
    assert.equal(keptLower.liquidType, lower.name);
    assert.equal(keptLower.liquidStatus.outcome, 'known-valid');

    let tieMean = null;
    for (let left = 0; left < policy.liquids.length && tieMean == null; left += 1) {
        for (let right = left + 1; right < policy.liquids.length; right += 1) {
            const a = policy.liquids[left];
            const b = policy.liquids[right];
            if (a.abundance !== b.abundance) continue;
            const mean = Math.max(a.mp, b.mp);
            if (mean > Math.min(a.bp, b.bp)) continue;
            const open = policy.liquids.filter((row) => mean >= row.mp && mean <= row.bp);
            const top = Math.max(...open.map((row) => row.abundance));
            if (open.filter((row) => row.abundance === top).length >= 2) {
                tieMean = mean;
                break;
            }
        }
    }
    const tied = one({
        liquidType: unknown, hydroPercent: 12, atmCode: exotic,
        meanTempK: tieMean, lowTempK: tieMean, highTempK: tieMean,
    });
    const open = policy.liquids.filter((row) => tieMean >= row.mp && tieMean <= row.bp);
    const top = Math.max(...open.map((row) => row.abundance));
    assert.equal(tied.liquidType, open.find((row) => row.abundance === top).name);

    const upside = one({
        liquidType: water.name, hydroPercent: 30, atmCode: ordinary,
        lowTempK: water.bp, meanTempK: midpoint, highTempK: water.mp,
    });
    assert.equal(upside.lowTempK, water.bp);
    assert.equal(upside.highTempK, water.mp);
    assert.equal(upside.liquidType, water.name);
    assert.equal(upside.liquidStatus.outcome, 'known-valid');
    const upsideRun = reconcileTree(treeWith({
        liquidType: water.name, hydroPercent: 30, atmCode: ordinary,
        lowTempK: water.bp, meanTempK: midpoint, highTempK: water.mp,
    }), environmentPolicy);
    assert.equal(upsideRun.diagnostics.some((item) => item.kind === 'temperature-inverted'), true);

    const rejected = {
        ...policy,
        liquid: { ...policy.liquid, q2: { ...policy.liquid.q2, choice: 'b' } },
    };
    assert.throws(() => reconcileTree(treeWith({ hydroPercent: 0, liquidType: ice }), rejected), /accepted Q2 and Q3/);
});

const MARCHES_INDEX = path.join(root, 'truth-local/v2/sectors/Spinward_Marches/index.json');

test('Spinward Marches liquid reconciliation counts, in memory only', { skip: !existsSync(MARCHES_INDEX), timeout: 180000 }, () => {
    const index = JSON.parse(readFileSync(MARCHES_INDEX, 'utf8'));
    const beforeReports = [];
    const afterReports = [];
    const changed = {};
    const outcomes = {};
    const unresolved = {};
    const kinds = {};
    let bodiesSeen = 0;
    let changedBodies = 0;
    let unresolvedBodies = 0;
    for (const entry of Object.values(index.hexes)) {
        if (!entry || !entry.tree) continue;
        const tree = JSON.parse(readFileSync(path.join(root, 'truth-local/objects', entry.tree), 'utf8'));
        beforeReports.push(auditTree(tree));
        const result = reconcileTree(tree, environmentPolicy);
        afterReports.push(auditTree(result.tree));
        for (const item of result.diagnostics) kinds[item.kind] = (kinds[item.kind] || 0) + 1;
        const beforeBodies = bodies(tree);
        const afterBodies = bodies(result.tree);
        assert.equal(afterBodies.length, beforeBodies.length);
        afterBodies.forEach((item, index) => {
            bodiesSeen += 1;
            const status = item.body.liquidStatus;
            assert.equal(typeof status.outcome, 'string');
            outcomes[status.outcome] = (outcomes[status.outcome] || 0) + 1;
            if (status.status === 'unresolved') {
                unresolvedBodies += 1;
                unresolved[status.outcome] = (unresolved[status.outcome] || 0) + 1;
            }
            const beforeLiquid = beforeBodies[index].body.liquidType === undefined ? null : beforeBodies[index].body.liquidType;
            const afterLiquid = item.body.liquidType === undefined ? null : item.body.liquidType;
            if (beforeLiquid !== afterLiquid) {
                changedBodies += 1;
                changed[status.outcome] = (changed[status.outcome] || 0) + 1;
            }
        });
    }
    console.log('LIQUID_RECONCILE ' + JSON.stringify({
        bodiesSeen,
        changedBodies,
        changed,
        unresolvedBodies,
        unresolved,
        outcomes,
        kinds,
        auditBefore: countAudit(beforeReports),
        auditAfter: countAudit(afterReports),
    }));
    assert.ok(bodiesSeen > 0);
});
