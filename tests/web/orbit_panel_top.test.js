/**
 * On the orbit view the panel uses the same top as the map, under the search row.
 * A top of --chrome-inset put the title under the search field.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = readFileSync(new URL('../../apps/web/src/views/OrbitView.vue', import.meta.url), 'utf8');

test('the orbit panel starts under the search row', () => {
    assert.match(source, /panelTop: null/);
    assert.doesNotMatch(source, /panelTop: 'var\(--chrome-inset\)'/);
});
