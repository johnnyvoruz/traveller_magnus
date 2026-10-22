/**
 * AQ1 round 1. Odd-q offset and cube coordinates are inverses.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cubeOf, offsetOf, placeLists, placeSummary } from '@voyage/shared';

test('cube and offset undo each other, for an even column and an odd one', () => {
    for (const q of [0, 1, 2, -1, 7]) {
        for (const r of [0, 1, 4, -3]) {
            const cube = cubeOf(q, r);
            assert.equal(cube.x, q);
            assert.deepEqual(offsetOf(cube.x, cube.z), { q, r });
        }
    }
    assert.deepEqual(cubeOf(2, 3), { x: 2, z: 2 });
    assert.deepEqual(offsetOf(1, 0), { q: 1, r: 0 });
});

test('a summary and a list copy move a key, and a suffixed key, and leave every other string', () => {
    const map = new Map([['Spinward_Marches/1910', 'Regina/0101']]);
    const summary = { name: 'Mora', hex: 'Spinward_Marches/1910', nested: ['Spinward_Marches/1910-GG'] };
    const moved = placeSummary(summary, map);
    assert.equal(moved.hex, 'Regina/0101');
    assert.deepEqual(moved.nested, ['Regina/0101-GG']);
    assert.equal(moved.name, 'Mora');
    assert.equal(summary.hex, 'Spinward_Marches/1910');
    assert.deepEqual(placeLists({ ends: ['Other/0101', 'Spinward_Marches/1910'] }, map).ends, ['Other/0101', 'Regina/0101']);
    assert.equal(placeSummary('Spinward_Marches/1910', new Map()).valueOf(), 'Spinward_Marches/1910');
});
