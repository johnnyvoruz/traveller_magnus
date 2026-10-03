import assert from 'node:assert/strict';
import { test } from 'node:test';
import { outlineLoops } from '../../apps/web/src/map/outline.ts';
import { polityHexes } from '../../apps/web/src/map/polity_layer.ts';

const COLOUR = '#336699';

function owners(spec) {
    const chars = new Array(1280).fill('.');
    for (const [hhhh, digit] of spec) {
        const col = Number(hhhh.slice(0, 2));
        const row = Number(hhhh.slice(2, 4));
        chars[(col - 1) * 40 + (row - 1)] = digit;
    }
    return chars.join('');
}

function sector(slug, x, canonical, polities, owned) {
    return { slug, x, y: 0, canonical, polities, owners: owners(owned) };
}

test('polities join across sectors on the drawn layer and skip a missing owners field', () => {
    const shared = [{ name: 'Imperium', color: COLOUR }];
    const overview = {
        truthVersion: 'v3',
        sectors: [
            sector('A', 0, true, shared, [['0101', '0']]),
            sector('B', 1, true, shared, [['0101', '0']]),
            sector('C', 2, false, shared, [['0101', '0']]),
        ],
    };
    const manifest = {
        sectors: [
            { slug: 'A', canonical: true },
            { slug: 'B', canonical: true },
            { slug: 'C', canonical: false },
        ],
    };
    const joined = polityHexes(overview, 'canonical', manifest);
    assert.equal(joined.length, 1);
    assert.equal(joined[0].name, 'Imperium');
    assert.equal(joined[0].color, COLOUR);
    assert.deepEqual(joined[0].hexes.map((hex) => hex.q + ',' + hex.r).sort(), ['0,0', '32,0']);

    const all = polityHexes(overview, 'all', manifest);
    assert.equal(all.length, 1);
    assert.deepEqual(all[0].hexes.map((hex) => hex.q + ',' + hex.r).sort(), ['0,0', '32,0', '64,0']);

    const other = {
        truthVersion: 'v3',
        sectors: [
            sector('A', 0, true, shared, [['0101', '0']]),
            sector('B', 1, true, [{ name: 'Other', color: COLOUR }], [['0101', '0']]),
        ],
    };
    const manifestAB = { sectors: [{ slug: 'A', canonical: true }, { slug: 'B', canonical: true }] };
    const split = polityHexes(other, 'all', manifestAB);
    assert.deepEqual(split.map((shape) => shape.name), ['Imperium', 'Other']);

    assert.deepEqual(polityHexes({ truthVersion: 'v2', sectors: [{ slug: 'A', x: 0, y: 0 }] }, 'all', manifestAB), []);
});

test('a filled 150 by 200 polity reports outline milliseconds', (t) => {
    const hexes = [];
    for (let q = 0; q < 150; q++) {
        for (let r = 0; r < 200; r++) hexes.push({ q, r });
    }
    const started = performance.now();
    const loops = outlineLoops(hexes);
    const ms = performance.now() - started;
    t.diagnostic(`polity outline 150x200: ${ms.toFixed(1)} ms (${loops.length} loops)`);
    assert.equal(hexes.length, 30000);
    assert.ok(loops.length >= 1);
});
