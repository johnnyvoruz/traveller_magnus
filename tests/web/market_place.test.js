/**
 * place.ts (phase 4b): the client outline lands where the server will put the piece. Both sides
 * get the same keys, placement and sector slots; the server side is called the way
 * apps/api/src/routes/installs.ts calls it.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { placeCells, placeKeys } from '@voyage/shared';
import { anchorUnder, byOutcome, hexWords, landingWords, outcomeWords, placedKeys, placementWords, previewLine, removeWords } from '../../apps/web/src/workspace/market/place.ts';

const SLOTS = new Map([['spin', { x: 0, y: 0 }], ['troj', { x: 1, y: 0 }], ['deep', { x: 0, y: 1 }]]);
const slotOf = (slug) => SLOTS.get(slug) ?? null;
const slugAt = (sx, sy) => [...SLOTS].find(([, s]) => s.x === sx && s.y === sy)?.[0] ?? `~slot_${sx}_${sy}`;
const KEYS = ['spin/0101', 'spin/0102', 'spin/0201', 'spin/0202', 'spin/0301'];

function server(keys, placement) {
    const cells = placeCells(keys, placement, slotOf, (slug) => slotOf(slug));
    const map = placeKeys(cells, slugAt);
    return keys.map((key) => map.get(key));
}

for (const [name, to] of [
    ['in place', 'spin/0101'],
    ['an odd-column drag', 'spin/0710'],
    ['an even-column drag', 'spin/0810'],
    ['across a sector edge', 'spin/3105'],
    ['down across a sector edge', 'spin/1040'],
    ['onto empty space', '~slot_2_0/0101'],
]) {
    test(`the client agrees with the server: ${name}`, () => {
        const placement = { anchor: 'spin/0101', to };
        const client = placedKeys(KEYS, placement, slotOf, slugAt);
        assert.equal(client.error, '');
        assert.deepEqual(client.keys, server(KEYS, placement));
    });
}

test('in place keeps every key, and a sector edge splits the piece', () => {
    assert.deepEqual(placedKeys(KEYS, { anchor: 'spin/0101', to: 'spin/0101' }, slotOf, slugAt).keys, KEYS);
    const split = placedKeys(KEYS, { anchor: 'spin/0101', to: 'spin/3105' }, slotOf, slugAt).keys;
    assert.equal(split.some((key) => key.startsWith('spin/')), true);
    assert.equal(split.some((key) => key.startsWith('troj/')), true);
});

test('a piece off the edge of the map is refused in a sentence', () => {
    const out = placedKeys(KEYS, { anchor: 'spin/0101', to: '~slot_1000_0/3201' }, slotOf, slugAt);
    assert.deepEqual(out, { keys: [], error: 'The piece does not fit on the map.' });
    const bad = placedKeys(KEYS, { anchor: 'spin/9999', to: 'spin/0101' }, slotOf, slugAt);
    assert.deepEqual(bad, { keys: [], error: 'The piece cannot go there.' });
});

test('anchorUnder names the package hex under a placed hex', () => {
    const placed = placedKeys(KEYS, { anchor: 'spin/0101', to: 'spin/3105' }, slotOf, slugAt).keys;
    assert.equal(anchorUnder(KEYS, placed, placed[3]), KEYS[3]);
    assert.equal(anchorUnder(KEYS, placed, 'deep/0101'), null);
});

test('outcome, preview, placement and Remove sentences', () => {
    assert.deepEqual(['new', 'replaces chart', 'replaces own', 'conflict', 'already installed'].map(outcomeWords),
        ['New', 'Replaces the chart', 'Replaces yours', 'Conflict', 'Already the same']);
    const preview = {
        hexes: [{ hexKey: 'a/0101', outcome: 'conflict' }, { hexKey: 'a/0102', outcome: 'new' }, { hexKey: 'a/0103', outcome: 'new' }],
        records: { add: 1, replace: 0, conflicts: [] },
        sectorsCreated: [],
        conflicts: 1,
    };
    assert.deepEqual(byOutcome(preview).map((g) => [g.outcome, g.hexes.length]), [['new', 2], ['conflict', 1]]);
    assert.equal(previewLine(preview), '3 hexes, 1 record, 1 conflict.');
    assert.equal(removeWords({ hexCount: 3 }, 2), 'Removes 3 systems and 2 records that came from this package, including any you changed.');
    assert.equal(removeWords({ hexCount: 1 }, 1), 'Removes 1 system and 1 record that came from this package, including any you changed.');
    assert.equal(placementWords({ placement: null }), 'In place');
    assert.equal(placementWords({ placement: { anchor: 'a/0101', to: 'troj/3205' } }), 'Placed at troj 3205');
    assert.equal(hexWords('Spinward_Marches/3110'), 'Spinward Marches 3110');
    assert.equal(hexWords('~slot_2_-1/0101'), 'empty space, hex 0101');
    assert.equal(hexWords('~01M4XX0A1W5QXSR99ZM9Z3H2VS/0102'), 'your own sector, hex 0102');
    assert.equal(landingWords(5, 'Spinward_Marches/3110'), '5 hexes, starting at Spinward Marches 3110.');
});
