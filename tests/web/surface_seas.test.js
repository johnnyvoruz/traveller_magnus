// Enhanced sea cover and sea ice. Expected numbers are computed here from the
// stated formulas and from the generated exotic-liquids table.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildSector } from '@voyage/generation';
import { MgT2EData } from '../../packages/engines/src/generated/rules/mgt2e_data.js';
import { TRUTH_SEED, TRUTH_SETTINGS } from '../../tools/truth/settings.js';
import { pickSystem } from '../../apps/web/src/dossier/model.ts';
import { EXOTIC_LIQUIDS } from '../../apps/web/src/surface/enhanced/liquids.ts';
import { coverage, latitudeTempK, seaIce, substance } from '../../apps/web/src/surface/enhanced/seas.ts';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const engineVersion = require('../../packages/engines/package.json').version;

function meltingK(name) {
    const row = MgT2EData.atmosphereExtended.exoticLiquids.find((item) => item.name === name);
    if (!row) throw new Error('missing liquid ' + name);
    return row.mp;
}

function amplitude(mean, low, high) {
    return Math.max(0, Math.min(1.5 * (mean - low), 3 * (high - mean)));
}

function expectedTemp(mean, low, high, latDeg) {
    const sine = Math.sin(latDeg * Math.PI / 180);
    return mean + amplitude(mean, low, high) * (1 / 3 - sine * sine);
}

function expectedCap(mean, low, high, melting) {
    const span = amplitude(mean, low, high);
    const sin2 = 1 / 3 - (melting - mean) / span;
    return Math.asin(Math.sqrt(sin2)) * 180 / Math.PI;
}

test('the exotic liquids copy is the generated rules table', () => {
    const fromRules = MgT2EData.atmosphereExtended.exoticLiquids.map((row) => ({
        name: row.name,
        meltingK: row.mp,
    }));
    assert.deepEqual(EXOTIC_LIQUIDS, fromRules);
    assert.equal(new Set(fromRules.map((row) => row.name)).size, fromRules.length);
});

test('coverage uses the percent, else the hydro digit, and can be zero', () => {
    assert.equal(coverage({ hydroPercent: 45 }), 45 / 100);
    assert.equal(coverage({ hydroPercent: 250 }), 1);
    assert.equal(coverage({ hydroPercent: -4 }), 0);
    assert.equal(coverage({ hydroCode: 7 }), 7 / 10);
    assert.equal(coverage({ uwp: 'A788899-C' }), 8 / 10);
    assert.equal(coverage({ hydroCode: 0, hydroPercent: 3 }), 3 / 100);
    assert.equal(coverage({ hydroPercent: 0, hydroCode: 8 }), 0);
    assert.equal(coverage({}), null);
    assert.equal(coverage({ hydroPercent: Number.NaN }), null);
    assert.equal(coverage(null), null);
});

test('substance is the named table row, and Ice is frozen water', () => {
    const water = meltingK('Water');
    assert.deepEqual(substance({ liquidType: 'Water' }), { name: 'Water', meltingK: water, frozenByData: false });
    assert.deepEqual(substance({ liquidType: 'Methane' }), { name: 'Methane', meltingK: meltingK('Methane'), frozenByData: false });
    assert.deepEqual(substance({ liquidType: 'Ice' }), { name: 'Water', meltingK: water, frozenByData: true });
    assert.equal(substance({ liquidType: 'Unknown Exotic Liquid' }), null);
    assert.equal(substance({}), null);
    assert.equal(substance({ liquidType: '' }), null);
});

test('latitude temperature follows the formula and stays inside the given range', () => {
    const body = { meanTempK: 280, lowTempK: 250, highTempK: 310 };
    for (const lat of [0, 23, 45, 66, 90, -40]) {
        assert.equal(latitudeTempK(body, lat), expectedTemp(280, 250, 310, lat));
    }
    const equator = latitudeTempK(body, 0);
    const pole = latitudeTempK(body, 90);
    assert.ok(equator >= 250 && equator <= 310);
    assert.ok(pole >= 250 && pole <= 310);
    assert.equal(latitudeTempK({ meanTempK: 280, highTempK: 310 }, 0), null);
    assert.equal(latitudeTempK({ meanTempK: 280, lowTempK: 300, highTempK: 310 }, 0), null);

    let weighted = 0;
    let weight = 0;
    const steps = 200001;
    for (let i = 0; i < steps; i++) {
        const lat = -90 + (180 * (i + 0.5)) / steps;
        const area = Math.cos(lat * Math.PI / 180);
        weighted += latitudeTempK(body, lat) * area;
        weight += area;
    }
    assert.ok(Math.abs(weighted / weight - 280) < 1e-6);
});

test('sea ice kinds follow the written order', () => {
    const water = meltingK('Water');
    const methane = meltingK('Methane');

    const hot = { hydroPercent: 60, liquidType: 'Water', meanTempK: 300, lowTempK: water, highTempK: 320 };
    assert.equal(latitudeTempK(hot, 0), expectedTemp(300, water, 320, 0));
    assert.equal(seaIce(hot).kind, 'none');

    const methaneCaps = { hydroPercent: 40, liquidType: 'Methane', meanTempK: 95, lowTempK: 80, highTempK: 110 };
    const caps = seaIce(methaneCaps);
    assert.equal(caps.kind, 'caps');
    assert.equal(caps.fromLatDeg, expectedCap(95, 80, 110, methane));
    assert.ok(caps.fromLatDeg > 0 && caps.fromLatDeg < 90);

    const methaneAll = { hydroPercent: 40, liquidType: 'Methane', meanTempK: 80, lowTempK: 70, highTempK: 85 };
    assert.ok(85 < methane);
    assert.equal(seaIce(methaneAll).kind, 'all');

    const unknown = { hydroPercent: 40, liquidType: 'Unknown Exotic Liquid', meanTempK: 100, lowTempK: 90, highTempK: 110 };
    assert.equal(substance(unknown), null);
    assert.equal(seaIce(unknown).kind, 'none');

    const missing = { hydroPercent: 40, liquidType: 'Water', lowTempK: 250, highTempK: 300 };
    assert.equal(latitudeTempK(missing, 45), null);
    assert.equal(seaIce(missing).kind, 'none');

    const contradictory = { hydroPercent: 40, liquidType: 'Water', meanTempK: 280, lowTempK: 300, highTempK: 310 };
    assert.equal(latitudeTempK(contradictory, 0), null);
    assert.equal(seaIce(contradictory).kind, 'none');

    const locked = { hydroPercent: 40, liquidType: 'Water', meanTempK: 280, lowTempK: 250, highTempK: 300, tidallyLocked: true };
    assert.equal(expectedCap(280, 250, 300, water) > 0, true);
    assert.equal(seaIce(locked).kind, 'locked');
    assert.equal(seaIce({ ...locked, tidallyLocked: false, isTwilightZone: true }).kind, 'locked');
    assert.equal(seaIce({ ...locked, isMoon: true }).kind, 'caps');

    const frozen = { hydroPercent: 20, liquidType: 'Ice', meanTempK: 260, lowTempK: 240, highTempK: 290 };
    assert.equal(seaIce(frozen).kind, 'all');
    assert.equal(seaIce({ hydroPercent: 0, liquidType: 'Ice', meanTempK: 200, lowTempK: 180, highTempK: 220 }).kind, 'none');
});

function catalogue(slug) {
    const listed = JSON.parse(fs.readFileSync(path.join(ROOT, 'universe/raw/sectors.json'), 'utf8'))
        .sectors.find((sector) => sector.slug === slug);
    return { name: listed.name, x: listed.x, y: listed.y, tags: listed.tags, canonical: listed.canonical };
}

function bodiesOf(system) {
    const rows = [];
    for (const world of system.worlds || []) {
        if (!world || world.type === 'Empty') continue;
        rows.push(world);
        for (const moon of world.moons || []) {
            if (!moon || moon.type === 'Empty') continue;
            rows.push(moon);
        }
    }
    return rows;
}

function describe(systemName, body) {
    const liquid = substance(body);
    let ice;
    try {
        ice = seaIce(body);
    } catch (err) {
        ice = { kind: 'unresolved', why: err instanceof Error ? err.message : String(err) };
    }
    return {
        system: systemName,
        body: body.name || body.type || '',
        type: body.type || '',
        moon: body.isMoon === true,
        coverage: coverage(body),
        substance: liquid ? liquid.name + (liquid.frozenByData ? ' (frozen by data)' : '') : null,
        seaIce: ice.kind,
        fromLatDeg: ice.kind === 'caps' ? ice.fromLatDeg : null,
        why: ice.why,
    };
}

test('Regina and Zeycude sea ice table', async () => {
    const marches = await buildSector({
        slug: 'Spinward_Marches',
        tsv: fs.readFileSync(path.join(ROOT, 'universe/raw/Spinward_Marches.tsv'), 'utf8'),
        metadataXml: fs.readFileSync(path.join(ROOT, 'universe/raw/Spinward_Marches.xml'), 'utf8'),
        pinned: { seed: TRUTH_SEED, settings: TRUTH_SETTINGS, engineVersion },
        version: 'v2',
        catalogue: catalogue('Spinward_Marches'),
    });
    const table = [];
    for (const [hex, systemName] of [['1910', 'Regina'], ['0101', 'Zeycude']]) {
        const entry = marches.index.hexes[hex];
        assert.equal(entry.name, systemName);
        const tree = JSON.parse(marches.objects.get(entry.tree));
        const system = pickSystem(tree.body);
        assert.ok(system);
        for (const body of bodiesOf(system)) table.push(describe(systemName, body));
    }
    console.log('SEA_ICE_TABLE ' + JSON.stringify(table));
    assert.ok(table.length > 0);
    assert.ok(table.some((row) => row.system === 'Regina' && row.type === 'Mainworld'));
    assert.ok(table.some((row) => row.system === 'Zeycude'));
});
