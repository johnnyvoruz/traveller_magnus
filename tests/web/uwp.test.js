import assert from 'node:assert/strict';
import { test } from 'node:test';
import { baseMarks, hasGasGiant, starport, worldHasWater, worldIsBelt } from '../../apps/web/src/map/uwp.ts';

test('display rules read only the characters the default filters name', () => {
    assert.equal(worldIsBelt('A788899-C'), false);
    assert.equal(worldHasWater('A788899-C'), true);
    assert.equal(starport('A788899-C'), 'A');

    assert.equal(worldIsBelt('X000000-0'), true);
    assert.equal(worldHasWater('X000000-0'), false);

    assert.equal(worldIsBelt('C8858??-4'), false);
    assert.equal(worldHasWater('C8858??-4'), true);

    assert.equal(worldIsBelt('???????-?'), false);
    assert.equal(worldHasWater('???????-?'), false);
    assert.equal(starport('???????-?'), '?');

    assert.equal(hasGasGiant('703'), true);
    assert.equal(hasGasGiant('700'), false);

    assert.deepEqual(baseMarks('NS'), { naval: true, scout: true, text: '' });
    assert.deepEqual(baseMarks('NW'), { naval: true, scout: false, text: 'NW' });
    assert.deepEqual(baseMarks(''), { naval: false, scout: false, text: '' });
});
