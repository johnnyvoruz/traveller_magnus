/**
 * SystemFacts from a chart row alone, and from the row plus the tree.
 * The orbit fixture is Regina (Spinward Marches 1910), built the same way as
 * tests/web/orbit_system.test.js. One chart row for each starport class.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildSector } from '@voyage/generation';
import { TRUTH_SEED, TRUTH_SETTINGS } from '../../tools/truth/settings.js';
import { bodyKeys, mainworldProfile, pickSystem } from '../../apps/web/src/dossier/model.ts';
import { highportOf } from '../../apps/web/src/orbit/highport.ts';
import { partyFromShip, systemFacts } from '../../apps/web/src/living/facts.ts';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const engineVersion = require('../../packages/engines/package.json').version;

function entry(starport, over = {}) {
    return {
        name: 'Port ' + starport,
        uwp: starport + '788899-C',
        zone: starport === 'X' ? 'R' : '',
        bases: starport === 'A' ? 'NS' : starport === 'B' ? 'W' : '',
        tradeCodes: ['Ri'],
        pbg: '313',
        ...over,
    };
}

function chart(starport, over = {}, sourceOver = {}) {
    return systemFacts({
        hexKey: 'Spinward_Marches/1910',
        entry: entry(starport, over),
        sectorName: 'Spinward Marches',
        subsectorNames: { C: 'Regina' },
        day: 47,
        ...sourceOver,
    });
}

test('a chart row alone decodes the UWP, the PBG and the zone, for each starport class', () => {
    for (const starport of ['A', 'B', 'C', 'D', 'E', 'X']) {
        const facts = chart(starport);
        assert.equal(facts.starport, starport);
        assert.equal(facts.size, 7);
        assert.equal(facts.atm, 8);
        assert.equal(facts.hydro, 8);
        assert.equal(facts.pop, 8);
        assert.equal(facts.gov, 9);
        assert.equal(facts.law, 9);
        assert.equal(facts.tl, 12);
        assert.equal(facts.belts, 1);
        assert.equal(facts.gasGiants, 3);
        assert.equal(facts.highport, null);
        assert.equal(facts.moons, 0);
        assert.equal(facts.otherBodies, 0);
        assert.deepEqual(facts.bodies, {});
        assert.equal(facts.party, 'away');
        assert.equal(facts.day, 47);
        assert.equal(facts.sector, 'Spinward Marches');
        assert.equal(facts.subsector, 'Regina');
        assert.deepEqual(facts.tradeCodes, ['Ri']);
        assert.equal(facts.zone, starport === 'X' ? 'red' : '');
        assert.equal(facts.name, 'Port ' + starport);
    }
    assert.equal(chart('A').xboat, false);
    assert.equal(chart('A').bases, 'NS');
    assert.equal(chart('B').xboat, true);
    assert.equal(chart('B').bases, 'W');
    const bare = chart('C', {}, {
        routes: [{ Start: '1910', End: '1911' }],
    });
    assert.equal(bare.xboat, true);
    const typed = chart('C', {}, {
        routes: [{ Start: '1910', End: '1911', Type: 'Trade' }],
    });
    assert.equal(typed.xboat, false);
    const xboat = chart('E', {}, {
        routes: [{ Start: '1808', End: '1910', Type: 'Xboat', Allegiance: 'Im', Color: 'Red' }],
    });
    assert.equal(xboat.xboat, true);
    const elsewhere = chart('E', {}, {
        routes: [{ Start: '1808', End: '1809' }],
    });
    assert.equal(elsewhere.xboat, false);
    const leadIgnored = chart('A', {}, { lead: 'docked' });
    assert.equal(leadIgnored.party, 'away');
    assert.equal(chart('D', { zone: 'A' }).zone, 'amber');
    assert.equal(chart('D', { zone: 'green' }).zone, 'green');
    assert.equal(chart('D', { pbg: '50' }).belts, 5);
    assert.equal(chart('D', { pbg: '50' }).gasGiants, 0);
});

test('the tree adds the highport, the moons, the counts and the party', () => {
    const profile = {
        starport: 'C',
        starportProfile: 'C-HY:DN',
        size: 6,
        atm: 1,
        hydro: 0,
        pop: 4,
        gov: 1,
        law: 2,
        tl: 9,
        tradeCodes: ['Lo'],
    };
    const state = {
        name: 'Dome',
        travelZone: 'A',
        bases: 'S',
        gasGiantCount: 2,
        beltCount: 4,
        mgt2eData: profile,
        mgtSystem: {
            stars: [{ name: 'Sun' }],
            worlds: [
                { type: 'Gas Giant', name: 'Giant' },
                {
                    type: 'Mainworld',
                    name: 'Dome',
                    moons: [{ type: 'Rock', name: 'Pebble' }, { type: 'Empty' }],
                },
                { type: 'Planetoid Belt', name: 'The Belt' },
            ],
        },
    };
    const facts = systemFacts({
        hexKey: 'Spinward_Marches/1910',
        entry: entry('A', { pbg: '901', tradeCodes: ['Ri'], zone: '', bases: 'NS' }),
        sectorName: 'Spinward Marches',
        subsectorNames: { C: 'Regina' },
        state,
        day: 2,
    });
    assert.equal(facts.name, 'Dome');
    assert.equal(facts.starport, 'C');
    assert.equal(facts.size, 6);
    assert.equal(facts.atm, 1);
    assert.equal(facts.hydro, 0);
    assert.equal(facts.pop, 4);
    assert.equal(facts.gov, 1);
    assert.equal(facts.law, 2);
    assert.equal(facts.tl, 9);
    assert.deepEqual(facts.tradeCodes, ['Lo']);
    assert.equal(facts.zone, 'amber');
    assert.equal(facts.bases, 'S');
    assert.equal(facts.highport, true);
    assert.equal(facts.gasGiants, 2);
    assert.equal(facts.belts, 4);
    assert.equal(facts.moons, 1);
    assert.equal(facts.otherBodies, 3);
    assert.equal(facts.bodies.gasGiant, 'Giant');
    assert.equal(facts.bodies.belt, 'The Belt');
    assert.equal(facts.bodies.moon, 'Pebble');
    assert.equal(facts.bodies.body, 'Giant');
    assert.equal(facts.party, 'away');
    assert.equal(facts.xboat, false);

    const noHighport = { ...state, mgt2eData: { ...profile, starportProfile: 'C-HN:DN' } };
    assert.equal(systemFacts({
        hexKey: 'Spinward_Marches/1910',
        entry: entry('C'),
        sectorName: 'Spinward Marches',
        state: noHighport,
        day: 2,
    }).highport, false);

    const missing = { ...state, mgt2eData: { ...profile, starportProfile: '' } };
    assert.equal(systemFacts({
        hexKey: 'Spinward_Marches/1910',
        entry: entry('C'),
        sectorName: 'Spinward Marches',
        state: missing,
        day: 2,
    }).highport, null);

    assert.equal(partyFromShip('jump'), 'inJump');
    assert.equal(partyFromShip('docked'), 'docked');
    assert.equal(partyFromShip('flight'), 'inSystem');
    assert.equal(partyFromShip('orbit'), 'inSystem');
    assert.equal(partyFromShip('hold'), 'inSystem');
    assert.equal(partyFromShip('none'), 'away');
    assert.equal(partyFromShip(null), 'away');
    assert.equal(systemFacts({
        hexKey: 'Spinward_Marches/1910',
        entry: entry('C'),
        sectorName: 'Spinward Marches',
        state,
        lead: 'docked',
        day: 2,
    }).party, 'docked');
});

function catalogue(slug) {
    const listed = JSON.parse(fs.readFileSync(path.join(ROOT, 'universe/raw/sectors.json'), 'utf8'))
        .sectors.find((sector) => sector.slug === slug);
    return { name: listed.name, x: listed.x, y: listed.y, tags: listed.tags, canonical: listed.canonical };
}

test('Regina, the orbit fixture, agrees with the chart row and with the tree', async () => {
    const marches = await buildSector({
        slug: 'Spinward_Marches',
        tsv: fs.readFileSync(path.join(ROOT, 'universe/raw/Spinward_Marches.tsv'), 'utf8'),
        metadataXml: fs.readFileSync(path.join(ROOT, 'universe/raw/Spinward_Marches.xml'), 'utf8'),
        pinned: { seed: TRUTH_SEED, settings: TRUTH_SETTINGS, engineVersion },
        version: 'v2',
        catalogue: catalogue('Spinward_Marches'),
    });
    const regina = marches.index.hexes['1910'];
    assert.ok(regina);
    const source = {
        hexKey: 'Spinward_Marches/1910',
        entry: regina,
        sectorName: marches.index.name,
        subsectorNames: marches.index.metadata.names,
        routes: marches.index.metadata.routes,
        day: 2,
    };
    const chartOnly = systemFacts(source);
    assert.equal(chartOnly.highport, null);
    assert.equal(chartOnly.moons, 0);
    assert.equal(chartOnly.otherBodies, 0);
    assert.equal(chartOnly.party, 'away');
    assert.equal(chartOnly.starport, regina.uwp.charAt(0));
    assert.equal(chartOnly.name, regina.name);
    assert.equal(chartOnly.day, 2);
    assert.ok(chartOnly.subsector);

    const tree = JSON.parse(marches.objects.get(regina.tree));
    const withTree = systemFacts({ ...source, state: tree.body, lead: 'orbit' });
    const profile = mainworldProfile(tree.body);
    const system = pickSystem(tree.body);
    assert.ok(system);
    assert.equal(withTree.moons, bodyKeys(system).filter((key) => /m\d+$/.test(key)).length);
    assert.equal(withTree.party, 'inSystem');
    assert.equal(withTree.starport, typeof profile.starport === 'string' && /^[ABCDEX]$/i.test(profile.starport)
        ? profile.starport.toUpperCase()
        : regina.uwp.charAt(0));
    const port = highportOf(profile);
    const match = /^([A-EX])-H([YN]):D([YN])/.exec(String(profile.starportProfile || ''));
    const expectedHighport = port ? true : match ? false : null;
    assert.equal(withTree.highport, expectedHighport);
    if (typeof tree.body.gasGiantCount === 'number') assert.equal(withTree.gasGiants, tree.body.gasGiantCount);
    if (typeof tree.body.beltCount === 'number') assert.equal(withTree.belts, tree.body.beltCount);
    const way = String(withTree.bases).includes('W');
    const touched = (marches.index.metadata.routes || []).some((route) => {
        if (!route || typeof route !== 'object') return false;
        const type = route.Type || '';
        const bare = type === '' && !route.Allegiance && !route.Color;
        const marked = type === 'Xboat';
        if (!bare && !marked) return false;
        return route.Start === '1910' || route.End === '1910';
    });
    assert.equal(withTree.xboat, way || touched);
});
