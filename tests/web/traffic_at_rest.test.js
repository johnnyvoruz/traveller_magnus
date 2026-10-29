/**
 * AQ1. trafficAtRest is true when positionAt returns an anchor, and false
 * when the ship is in flight or has no place yet.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { trafficAtRest } from '../../apps/web/src/living/traffic.ts';

const from = { kind: 'system', hexKey: 'Spinward_Marches/1910' };
const to = { kind: 'system', hexKey: 'Spinward_Marches/1910', bodyKey: 'w1' };

function track(leg) {
    return { id: 'ship', name: 'Ship', kind: 'trader', shape: 'circle', legs: [leg] };
}

test('a docked ship is at rest, a ship in flight is not, and a day before departure is nowhere', () => {
    const docked = track({ from, to, departs: 10, arrives: 10, mode: 'docked' });
    assert.equal(trafficAtRest(docked, 9), false);
    assert.equal(trafficAtRest(docked, 10), true);
    assert.equal(trafficAtRest({ legs: [] }, 10), false);

    const flight = track({ from, to, departs: 10, arrives: 12, mode: 'flight' });
    assert.equal(trafficAtRest(flight, 11), false);
    assert.equal(trafficAtRest(flight, 12), true);
});
