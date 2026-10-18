/**
 * An orbit address with no body opens on the mainworld (apps/web/src/orbit/opening.ts).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { openingKey } from '../../apps/web/src/orbit/opening.ts';

test('an address with no body opens on the mainworld', () => {
    assert.equal(openingKey('', 'w4m1', false), 'w4m1');
});

test('a named body is left alone, and so is a visit the visitor cleared', () => {
    assert.equal(openingKey('w0', 'w4m1', false), null);
    assert.equal(openingKey('', 'w4m1', true), null);
    assert.equal(openingKey('', null, false), null);
});
