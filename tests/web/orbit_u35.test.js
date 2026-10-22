/**
 * U35 remainder: the empty-ship line only while the campaign panel is open, and Space
 * still plays from a Time-drawer field that does not take a space.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const strip = readFileSync(new URL('../../apps/web/src/orbit/ShipStrip.vue', import.meta.url), 'utf8');
const view = readFileSync(new URL('../../apps/web/src/views/OrbitView.vue', import.meta.url), 'utf8');

test('No ships here is shown only while the campaign panel is open', () => {
    assert.match(strip, /<p v-else-if="campaignOpen" class="orbit-ships-none">No ships here\.<\/p>/);
    assert.match(view, /:campaign-open="campaignOpen"/);
});

test('Space still plays from a number, time, or range field', () => {
    const handler = view.slice(view.indexOf('function onKey'), view.indexOf('function onKey') + 900);
    assert.match(handler, /field\.type === 'number'/);
    assert.match(handler, /field\.type === 'time'/);
    assert.match(handler, /field\.type === 'range'/);
    assert.match(handler, /if \(passesSpace\)/);
    assert.match(handler, /togglePlay\(\)/);
    assert.match(handler, /if \(field\) return/);
});
