/**
 * CC3: the mayday query is a once-per-page claim, and the emergency theme
 * is chosen from event metadata. No path matches the archive's text.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { createMaydayGate, maydayKeyPresent } from '../../apps/web/src/living/comms/mayday.ts';

test('mayday is claimed once, and a miss does not spend the claim', () => {
    const first = createMaydayGate();
    assert.equal(first.claim(false), false);
    assert.equal(first.claim(true), true);
    assert.equal(first.claim(true), false);
    const later = createMaydayGate();
    assert.equal(later.claim(false), false);
    assert.equal(later.claim(true), true);
});

test('the query key counts with a value or without one', () => {
    assert.equal(maydayKeyPresent({}), false);
    assert.equal(maydayKeyPresent({ date: '1105-001' }), false);
    assert.equal(maydayKeyPresent({ mayday: null }), true);
    assert.equal(maydayKeyPresent({ mayday: '' }), true);
    assert.equal(maydayKeyPresent({ mayday: '1' }), true);
});

test('the orbit view reads the key from the router, and the theme is metadata', () => {
    const root = new URL('../../apps/web/src/', import.meta.url);
    const read = (rel) => fs.readFileSync(new URL(rel, root), 'utf8');
    const orbit = read('views/OrbitView.vue');
    const controller = read('living/comms/controller.ts');
    const receiver = read('living/CommsReceiver.vue');
    const render = read('living/comms/receiver_render.ts');
    const tokens = read('design/tokens.css');
    assert.match(orbit, /maydayKeyPresent\(route\.query\)/);
    assert.match(orbit, /pageMayday\.claim/);
    assert.doesNotMatch(orbit, /globalThis\.location/);
    assert.doesNotMatch(orbit, /location\.search/);
    assert.doesNotMatch(controller, /under attack/);
    assert.doesNotMatch(controller, /Mayday, Mayday/);
    assert.match(controller, /ev\.theme === 'emergency'/);
    assert.match(controller, /recordOnce !== false/);
    assert.match(receiver, /data-comms-theme/);
    assert.match(render, /dataset\.commsTheme/);
    assert.match(tokens, /--comms-emergency:\s*#e32d3f/);
    assert.match(tokens, /--comms-emergency-hi:\s*#ff5360/);
    assert.match(tokens, /--comms-emergency-glow:/);
    assert.match(tokens, /--comms-theme-in:\s*700ms/);
    assert.match(tokens, /--comms-theme-out:\s*900ms/);
    assert.doesNotMatch(receiver, /under attack/);
    assert.doesNotMatch(render, /under attack/);
});
