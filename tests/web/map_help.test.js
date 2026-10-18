/**
 * DU36: the map's own help, in place. It opens by itself once, after a first visit's line of help, and
 * every line it says is pinned here to the code that does it, so the help cannot drift from the map.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { helpDue, POINTER_BUILD, POINTER_HELP, TOUCH_BUILD, TOUCH_HELP } from '../../apps/web/src/workspace/map_help.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => fs.readFileSync(path.join(root, 'apps/web/src', rel), 'utf8');

test('the help opens by itself once: after the line of help, on a clear map, never again', () => {
    const base = { seen: false, hintDone: true, chartReady: true, paneOpen: false, buildOn: false };
    assert.equal(helpDue(base), true);
    assert.equal(helpDue({ ...base, seen: true }), false, 'never again');
    assert.equal(helpDue({ ...base, hintDone: false }), false, 'not over the first line of help');
    assert.equal(helpDue({ ...base, chartReady: false }), false);
    assert.equal(helpDue({ ...base, paneOpen: true }), false);
    assert.equal(helpDue({ ...base, buildOn: true }), false);
});

test('every line is something the map does', () => {
    const input = read('map/input.ts');
    for (const key of ["'ArrowLeft'", "'ArrowRight'", "'ArrowUp'", "'ArrowDown'", "event.key === '+'", "event.key === '-'"]) assert.ok(input.includes(key), key);
    assert.match(input, /el\.addEventListener\('wheel', onWheel/);
    assert.match(input, /pinchStart = pinchOf\(\)/);
    const view = read('views/MapView.vue');
    assert.match(view, /id: 'home',\s+name: 'Home view',\s+keys: \['Home'\]/);
    assert.match(view, /doubleClick: \(sx, sy\) => \{[\s\S]*?router\.push\(\{ path: orbitPath\(/);
    assert.match(view, /KeyU: 'nw',\s+KeyI: 'n',\s+KeyO: 'ne',\s+KeyN: 'sw',\s+KeyM: 's',\s+Comma: 'se',/);
    assert.match(view, /moveSelection\(step, event\.shiftKey\)/);
    assert.match(view, /@contextmenu="onBuildMenu"/);
    assert.match(read('workspace/build/commands.ts'), /\{ id: 'build-select', name: 'Select hexes', keys: \['s'\] \}/);
    const pointer = read('workspace/build/pointer.ts');
    assert.match(pointer, /if \(press\.shift\) return press\.alt \? 'box-take' : 'box-add';/);
    assert.match(pointer, /if \(press\.tool && !press\.space\)/);
    assert.match(input, /A second finger ends the box and the two fingers move the chart\./);
    // The lines say those, and nothing else.
    const keys = (groups) => groups.flatMap((group) => group.lines.flatMap((line) => line.keys));
    assert.deepEqual(keys(POINTER_HELP), ['Drag', 'Wheel', '←', '↑', '→', '↓', '+', '-', 'Home', 'Click', 'Double-click']);
    assert.deepEqual(keys([POINTER_BUILD]), ['S', 'Shift+drag', 'Space+drag', 'U', 'I', 'O', 'N', 'M', ',', 'Right-click']);
    assert.deepEqual(keys(TOUCH_HELP), ['Drag', 'Pinch', 'Tap']);
    assert.deepEqual(keys([TOUCH_BUILD]), ['Drag']);
});

test('the map view shows the "?" and remembers the help was seen', () => {
    const view = read('views/MapView.vue');
    assert.match(view, /<MapHelp v-if="!shipSheet" :build="buildOffered" :auto="helpAuto" @seen="helpWasSeen" \/>/);
    assert.match(view, /storageSet\(HELP_KEY, '1'\);/);
    const help = read('workspace/MapHelp.vue');
    assert.match(help, /aria-label="How to use the map"/);
    assert.match(help, /@media \(pointer: coarse\)/);
});
