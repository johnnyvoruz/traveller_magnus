/**
 * AQ1. rollD3. assets/dice_conventions.txt lines 19 to 26, via d3Face:
 * 1–2 is 1, 3–4 is 2, 5–6 is 3. One die is D3. Two dice are 2D3.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { rollD3 } from '../../apps/web/src/dice/roll.ts';

function faces(values) {
    let i = 0;
    return () => values[i++];
}

test('D3 and 2D3 keep every face and total the halved faces', () => {
    const one = rollD3(1, faces([1]));
    assert.equal(one.mode, 'd3');
    assert.deepEqual(one.dice, [1]);
    assert.deepEqual(one.kept, [true]);
    assert.equal(one.total, 1);
    assert.equal(one.dm, 0);

    const two = rollD3(2, faces([2, 3, 9]));
    assert.equal(two.mode, '2d3');
    assert.deepEqual(two.dice, [2, 3]);
    assert.deepEqual(two.kept, [true, true]);
    assert.equal(two.total, 3);
    assert.equal(two.dm, 0);

    const high = rollD3(2, faces([5, 6]));
    assert.equal(high.total, 6);
    assert.equal(rollD3(1, faces([4])).total, 2);
});
