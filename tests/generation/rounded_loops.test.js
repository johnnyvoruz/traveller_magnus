import assert from 'node:assert/strict';
import { test } from 'node:test';
import { outlineLoops } from '@voyage/generation';
import { roundedLoops } from '../../packages/generation/src/polities.ts';

function round3(n) {
    return Number(n.toFixed(3));
}

function expected(hexes) {
    return outlineLoops(hexes).map((loop) => loop.points.map(round3));
}

test('roundedLoops is the outline in parsecs, each coordinate to 3 decimals', () => {
    assert.deepEqual(roundedLoops([]), []);
    const one = [{ q: 0, r: 0 }];
    const loops = roundedLoops(one);
    assert.deepEqual(loops, expected(one));
    assert.equal(loops.length, 1);
    assert.equal(loops[0].length, 12);
    assert.equal(loops[0].every((n) => {
        const text = String(n);
        const dot = text.indexOf('.');
        return dot < 0 || text.length - dot - 1 <= 3;
    }), true);
    const negative = [{ q: -3, r: -4 }];
    assert.deepEqual(roundedLoops(negative), expected(negative));
    assert.deepEqual(
        roundedLoops([{ q: 1, r: 0 }, { q: 1, r: 0 }]),
        expected([{ q: 1, r: 0 }]),
    );
});
