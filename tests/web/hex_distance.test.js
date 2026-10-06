import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getHexDistance } from '../../packages/engines/src/core/hex.js';
import { hexDistance, parsecsBetween } from '../../apps/web/src/map/geometry.ts';

function sectorAt(slug) {
    if (slug === 'Spinward_Marches') return { sx: -4, sy: -1 };
    if (slug === 'Deneb') return { sx: -3, sy: -1 };
    return null;
}

test('hexDistance matches getHexDistance, including negatives and both column parities', () => {
    let count = 0;
    let even = 0;
    let odd = 0;
    for (let q1 = -20; q1 <= 20; q1++) {
        for (let r1 = -8; r1 <= 8; r1++) {
            const pairs = [
                [q1, r1],
                [q1 + 1, r1],
                [q1 + 3, r1 - 5],
                [-q1 - 7, r1 + 4],
                [q1 + 32, r1 - 40],
            ];
            for (const [q2, r2] of pairs) {
                assert.equal(hexDistance({ q: q1, r: r1 }, { q: q2, r: r2 }), getHexDistance(q1, r1, q2, r2));
                count += 1;
                if ((q1 & 1) === 0) even += 1;
                else odd += 1;
            }
        }
    }
    assert.equal(count, 3485);
    assert.ok(even > 1000);
    assert.ok(odd > 1000);
});

test('Regina to Feri is five parsecs, counted one hex at a time', () => {
    // Spinward Marches is sx -4, sy -1. Regina 1910 is an even column.
    // Its neighbour one column higher and one row lower is 2009.
    // Feri 2005 is four rows further toward 01 on that odd column: 2008, 2007, 2006, 2005.
    // Five hexes.
    assert.equal(parsecsBetween('Spinward_Marches/1910', 'Spinward_Marches/2005', sectorAt), 5);
    assert.equal(parsecsBetween('Spinward_Marches/2005', 'Spinward_Marches/1910', sectorAt), 5);
});

test('one step across the Spinward Marches and Deneb edge', () => {
    // 3210 is the odd column on the Deneb side of Spinward Marches. Its neighbour
    // at the same row, one column higher, is Deneb 0110. One hex.
    assert.equal(parsecsBetween('Spinward_Marches/3210', 'Deneb/0110', sectorAt), 1);
    assert.equal(parsecsBetween('Deneb/0110', 'Spinward_Marches/3210', sectorAt), 1);
});

test('the same hex is zero; a bad key or an unknown sector is null', () => {
    assert.equal(parsecsBetween('Spinward_Marches/1910', 'Spinward_Marches/1910', sectorAt), 0);
    assert.equal(parsecsBetween('Spinward_Marches/191', 'Spinward_Marches/1910', sectorAt), null);
    assert.equal(parsecsBetween('Spinward_Marches/1910', 'no-slash', sectorAt), null);
    assert.equal(parsecsBetween('Foreven/1910', 'Spinward_Marches/1910', sectorAt), null);
});
