/**
 * The orbit view's control drawers (slice 2 follow-up 6; findings/orbit_drawers_design.md):
 * three tabs with their keys, one drawer open at a time, Esc closes it first, a press on
 * the picture closes it, and the groups land one step apart only while opening.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DRAWERS, ORBIT_COMMANDS } from '../../apps/web/src/orbit/commands.ts';
import { escapeStep, groupDelaySteps, pressCloses, toggleDrawer } from '../../apps/web/src/orbit/drawers.ts';

test('three drawers, Time / View / Layers, on T, Y and L, each a command with that key', () => {
    assert.deepEqual(DRAWERS.map((d) => [d.id, d.label, d.key]), [['time', 'Time', 't'], ['view', 'View', 'y'], ['layers', 'Layers', 'l']]);
    for (const drawer of DRAWERS) {
        const command = ORBIT_COMMANDS.find((item) => item.id === drawer.command);
        assert.ok(command, drawer.command);
        assert.ok(command.keys.includes(drawer.key), drawer.id + ' has its key');
    }
    // The keys that worked before the drawers still mean the same thing.
    const keyOf = (id) => ORBIT_COMMANDS.find((item) => item.id === id).keys[0];
    assert.equal(keyOf('orbit-play'), ' ');
    assert.equal(keyOf('orbit-week'), 'w');
    assert.equal(keyOf('orbit-scrub'), 's');
    assert.equal(keyOf('orbit-speed'), 'v');
    assert.equal(keyOf('orbit-go-campaign'), 'c');
    assert.equal(keyOf('orbit-set-campaign'), 'C');
    assert.equal(keyOf('orbit-fit'), 'f');
    assert.equal(keyOf('orbit-layout-orbits'), '1');
    assert.equal(keyOf('orbit-layer-paths'), '4');
});

test('one drawer at a time: a tab opens its drawer, the same tab closes it, another tab swaps', () => {
    assert.equal(toggleDrawer('', 'time'), 'time');
    assert.equal(toggleDrawer('time', 'time'), '');
    assert.equal(toggleDrawer('time', 'view'), 'view');
    assert.equal(toggleDrawer('layers', 'layers'), '');
});

test('Escape closes the drawer before a popover, the body and the map', () => {
    assert.equal(escapeStep({ drawer: 'time', popover: true, body: true }), 'drawer');
    assert.equal(escapeStep({ drawer: '', popover: true, body: true }), 'popover');
    assert.equal(escapeStep({ drawer: '', popover: false, body: true }), 'body');
    assert.equal(escapeStep({ drawer: '', popover: false, body: false }), 'map');
});

test('a press on the picture closes the drawer; one on the drawer or the header does not', () => {
    assert.equal(pressCloses({ inDrawer: false, inHeader: false }), true);
    assert.equal(pressCloses({ inDrawer: true, inHeader: false }), false);
    assert.equal(pressCloses({ inDrawer: false, inHeader: true }), false);
});

test('the groups land one step apart while opening, together while closing', () => {
    assert.deepEqual([0, 1, 2, 3].map((i) => groupDelaySteps(i, true)), [0, 1, 2, 3]);
    assert.deepEqual([0, 1, 2, 3].map((i) => groupDelaySteps(i, false)), [0, 0, 0, 0]);
});
