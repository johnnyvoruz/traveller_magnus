import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { auditTree, countAudit } from './environment_audit.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FIXTURE = path.join(ROOT, 'tests/golden/fixtures/engine_corrections');

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function sha256(file) {
    return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function bodyNamed(report, name) {
    const found = report.bodies.filter((body) => body.name === name);
    assert.equal(found.length, 1, name);
    return found[0];
}

function ids(body) {
    return body.rows.map((row) => row.id);
}

const manifest = readJson(path.join(FIXTURE, 'manifest.json'));
const regina = readJson(path.join(FIXTURE, manifest.regina.file));
const zeycude = readJson(path.join(FIXTURE, manifest.zeycude.file));
const reginaAudit = auditTree(regina);
const zeycudeAudit = auditTree(zeycude);

test('frozen Regina and Zeycude trees keep seed, settings, engine version, and sha256', () => {
    for (const entry of [manifest.regina, manifest.zeycude]) {
        const file = path.join(FIXTURE, entry.file);
        assert.equal(sha256(file), entry.sha256);
        const tree = readJson(file);
        assert.equal(tree.engineVersion, entry.engineVersion);
        assert.equal(tree.derivation.seed, entry.seed);
        assert.deepEqual(tree.derivation.settings, entry.settings);
        assert.equal(tree.hexKey, entry.hex);
    }
    assert.equal(manifest.regina.sha256, '008c00902a7992a40caa1202f2cec0a736a6f1ffef28c92332599fdfdc02b1ae');
    assert.equal(manifest.zeycude.sha256, 'f2d127322cb7cb2b2c7cc7492b4af5af0a4816be80939409cbe9469d46ad8a79');
});

test('Regina mainworld shows the chart-code split and the forbidden-zone endpoint', () => {
    const mainworld = bodyNamed(reginaAudit, 'Regina');
    assert.deepEqual(ids(mainworld), ['B01', 'B02', 'B03', 'B11']);
    assert.equal(mainworld.rows[0].values.atm, 8);
    assert.equal(mainworld.rows[0].values.atmCode, 10);
    assert.equal(mainworld.rows[0].values.hydro, 8);
    assert.equal(mainworld.rows[0].values.hydroCode, 6);
    assert.equal(mainworld.rows[1].values.isMoon, true);
    assert.equal(mainworld.rows[2].values.uwp, 'A788899-C');
    assert.equal(mainworld.rows[2].values.uwpSecondary, 'A7A6899-C');
    assert.equal(mainworld.rows[3].values.baselineOrbit, 5);
    assert.equal(mainworld.rows[3].values.zoneMax, 5);
});

test('Regina A-X-c is Oxygen outside its table, and A-I Carbonic Acid is not flagged', () => {
    const hot = bodyNamed(reginaAudit, 'Regina A-X-c');
    assert.deepEqual(ids(hot), ['B04', 'B07']);
    const liquid = hot.rows[0].values;
    assert.equal(liquid.liquidType, 'Oxygen');
    assert.ok(liquid.meanTempK > liquid.bp);
    assert.ok(liquid.lowTempK > liquid.bp);
    assert.ok(liquid.highTempK > liquid.bp);

    const acid = bodyNamed(reginaAudit, 'Regina A-I');
    assert.equal(acid.liquidType, 'Carbonic Acid');
    assert.deepEqual(acid.rows, []);
});

test('Regina C-II-g is an unknown liquid from the non-primary star, not a table miss', () => {
    const moon = bodyNamed(reginaAudit, 'Regina C-II-g');
    assert.equal(moon.liquidType, 'Unknown Exotic Liquid');
    assert.deepEqual(ids(moon), ['B07', 'R01']);
    assert.equal(moon.rows[0].values.parentStarIdx, 2);
    assert.ok(!ids(moon).includes('B04'));
});

test('Hydro digit 0 with a positive percentage is not zero-coverage ice', () => {
    const thin = bodyNamed(reginaAudit, 'Regina A-II-a');
    assert.equal(thin.hydroPercent, 4);
    assert.equal(thin.liquidType, 'Ice');
    assert.ok(!ids(thin).includes('B06'));

    const zeycudeMain = bodyNamed(zeycudeAudit, 'Zeycude');
    assert.ok(zeycudeMain.hydroPercent > 0);
    assert.equal(zeycudeMain.rows.find((row) => row.id === 'B01').values.hydro, 0);
    assert.ok(!ids(zeycudeMain).includes('B06'));
});

test('Spinward Marches truth-local v2: the 30 zero-coverage Ice mainworlds, and the row counts', () => {
    const index = readJson(path.join(ROOT, 'truth-local/v2/sectors/Spinward_Marches/index.json'));
    const reports = [];
    const ice = [];
    for (const [hex, entry] of Object.entries(index.hexes)) {
        if (!entry || !entry.tree) continue;
        const tree = readJson(path.join(ROOT, 'truth-local/objects', entry.tree));
        const report = auditTree(tree);
        reports.push(report);
        for (const body of report.bodies) {
            if (!body.mainworld || body.liquidType !== 'Ice' || body.hydroPercent !== 0) continue;
            assert.ok(ids(body).includes('B06'), `${hex} ${body.name}`);
            ice.push(`${hex} ${body.name}`);
        }
    }
    assert.equal(ice.length, 30);
    const counts = countAudit(reports);
    assert.equal(counts.mainworlds, 439);
    console.log('ENVIRONMENT_AUDIT ' + JSON.stringify({
        bodies: counts.bodies,
        mainworlds: counts.mainworlds,
        all: counts.all,
        mainworld: counts.mainworld,
    }));
});
