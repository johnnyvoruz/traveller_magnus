/**
 * The surface map's hover line (stream E, E13): temperatures are not called an engine.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const caption = readFileSync(new URL('../../apps/web/src/surface/caption.ts', import.meta.url), 'utf8');

test('a hybrid sheet says where its temperatures come from', () => {
    assert.match(caption, /tempSource === 'engine' \? 'from its figures' : 'from its climate word only'/);
    assert.doesNotMatch(caption, /Temperatures: ' \+ \(w\.tempSource === 'engine' \? 'engine'/);
});
