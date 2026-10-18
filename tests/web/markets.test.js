import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { parseHex, parsecsBetween } from '../../apps/web/src/map/geometry.ts';
import { marketFromIndex, marketsNearby, populationDigit, wtnOf } from '../../apps/web/src/campaign/markets.ts';

function sectorAt(slug) {
    if (slug === 'Spinward_Marches') return { sx: -4, sy: -1 };
    if (slug === 'Deneb') return { sx: -3, sy: -1 };
    return null;
}

function world(hexKey, over = {}) {
    return {
        hexKey,
        name: hexKey,
        starport: 'C',
        tradeCodes: [],
        population: '5',
        wtn: null,
        ...over,
    };
}

test('nearby worlds stay inside the range and sort by distance', () => {
    const origin = 'Spinward_Marches/1910';
    const worlds = [
        world(origin, { name: 'Regina', starport: 'A', tradeCodes: ['Ri'], population: '8', wtn: 10 }),
        world('Spinward_Marches/2005', { name: 'Far' }),
        world('Spinward_Marches/1911', { name: 'Next' }),
        world('no-slash'),
    ];
    const near = marketsNearby(origin, worlds, 2, sectorAt);
    assert.deepEqual(near.map((row) => row.name), ['Regina', 'Next']);
    assert.equal(near[0].parsecs, 0);
    assert.equal(near[0].wtn, 10);
    assert.ok(near[1].parsecs > 0 && near[1].parsecs <= 2);
    const wide = marketsNearby(origin, worlds, 6, sectorAt);
    assert.equal(wide.length, 3);
    assert.equal(wide[wide.length - 1].name, 'Far');
    assert.equal(marketsNearby(origin, worlds, 3, sectorAt).length, 0);
});

test('an index row keeps its starport, codes and population character, and has no WTN', () => {
    const row = marketFromIndex('Spinward_Marches', '1910', {
        tree: null,
        type: 'SYSTEM_PRESENT',
        name: 'Regina',
        uwp: 'A788899-C',
        allegiance: 'ImDd',
        zone: '',
        bases: 'NS',
        tradeCodes: ['Ri', 'Pa'],
        pbg: '703',
        ix: 4,
        partial: null,
    });
    assert.equal(row.hexKey, 'Spinward_Marches/1910');
    assert.equal(row.starport, 'A');
    assert.deepEqual(row.tradeCodes, ['Ri', 'Pa']);
    assert.equal(row.population, '8');
    assert.equal(row.wtn, null);
    assert.equal(populationDigit('?5A1???-?'), '');
    assert.equal(wtnOf({ mgtSocio: { WTN: 10 } }), 10);
    assert.equal(wtnOf({}), null);
    assert.equal(wtnOf(null), null);
});

const INDEX = 'truth-local/v10/sectors/Spinward_Marches/index.json';
const chartHere = fs.existsSync(INDEX);

test('Regina subsector markets within 2, 4 and 6 parsecs', { skip: chartHere ? false : 'truth-local/v10 is not in this checkout' }, () => {
    const index = JSON.parse(fs.readFileSync(INDEX, 'utf8'));
    const worlds = [];
    for (const [local, row] of Object.entries(index.hexes)) {
        const parsed = parseHex(local);
        if (!parsed || parsed.col < 17 || parsed.col > 24 || parsed.row < 1 || parsed.row > 10) continue;
        worlds.push(marketFromIndex('Spinward_Marches', local, row));
    }
    const origin = 'Spinward_Marches/1910';
    const regina = worlds.find((item) => item.hexKey === origin);
    assert.equal(regina.name, 'Regina');
    assert.equal(regina.starport, index.hexes['1910'].uwp.charAt(0));
    assert.equal(regina.population, index.hexes['1910'].uwp.charAt(4));
    assert.deepEqual(regina.tradeCodes, index.hexes['1910'].tradeCodes);
    assert.equal(regina.wtn, null);
    for (const range of [2, 4, 6]) {
        const rows = marketsNearby(origin, worlds, range, sectorAt);
        assert.equal(rows[0].hexKey, origin);
        assert.equal(rows[0].parsecs, 0);
        let previous = -1;
        for (const row of rows) {
            assert.ok(row.parsecs <= range);
            assert.ok(row.parsecs >= previous);
            previous = row.parsecs;
        }
        const counted = worlds.filter((item) => {
            const distance = parsecsBetween(origin, item.hexKey, sectorAt);
            return distance != null && distance <= range;
        });
        assert.equal(rows.length, counted.length, 'range ' + range);
    }
    const treePath = 'truth-local/objects/' + index.hexes['1910'].tree;
    if (fs.existsSync(treePath)) {
        const tree = JSON.parse(fs.readFileSync(treePath, 'utf8'));
        assert.equal(typeof tree.body.mgtSocio.WTN, 'number');
        assert.equal(wtnOf(tree.body), tree.body.mgtSocio.WTN);
    }
});
