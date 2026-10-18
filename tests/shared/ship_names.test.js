/**
 * The engine list and the browser list name a ship the same way.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SHIP_ADJECTIVES as engineAdjectives, SHIP_NOUNS as engineNouns, shipNameFor as engineName } from '../../packages/engines/src/core/ship_names.js';
import { SHIP_ADJECTIVES, SHIP_NOUNS, shipNameFor } from '../../packages/shared/src/ship_names.ts';

test('the two ship-name lists agree, and shipNameFor agrees', () => {
    assert.equal(engineAdjectives.length, 60);
    assert.equal(engineNouns.length, 60);
    assert.deepEqual(SHIP_ADJECTIVES, engineAdjectives);
    assert.deepEqual(SHIP_NOUNS, engineNouns);
    for (const seed of [1, 2, 99]) assert.equal(shipNameFor(seed), engineName(seed));
    assert.match(shipNameFor(1), /^[A-Z][a-z]+ [A-Z][a-z]+$/);
});
