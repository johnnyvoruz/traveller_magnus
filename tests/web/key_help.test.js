/**
 * DU13 (UX backlog U13): keyboard help from the registry. `?` opens a sheet of every key the registry
 * holds, grouped; the palette says the key beside each command. Nothing is listed by hand: a command
 * registered with a key, Q for the quick note, shows up by itself.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { keyGroups, keysWords, keyWords } from '../../apps/web/src/shell/key_help.ts';

test('a key as it is pressed', () => {
    assert.equal(keyWords('q'), 'Q');
    assert.equal(keyWords('W'), 'Shift+W');
    assert.equal(keyWords(' '), 'Space');
    assert.equal(keyWords('Escape'), 'Esc');
    assert.equal(keyWords('Ctrl+K'), 'Ctrl+K');
    assert.equal(keyWords('['), '[');
    assert.equal(keyWords('Home'), 'Home');
    assert.equal(keysWords(['/', 'Ctrl+K']), '/ or Ctrl+K');
    assert.equal(keysWords(['t', 'T']), 'T', 'one key typed both ways is said once');
    assert.equal(keysWords(['k', 'Ctrl+Enter']), 'K or Ctrl+Enter');
    assert.equal(keysWords([]), '');
    assert.equal(keysWords(undefined), '');
});

test('the registry\'s commands with keys, grouped, in the order registered; a new one appears by itself', () => {
    const registered = [
        { id: 'search', name: 'Search', keys: ['/', 'Ctrl+K'], run() {} },
        { id: 'quick-note', name: 'Quick note', keys: ['q'], runnable: () => false, run() {} },
        { id: 'build-select', name: 'Select hexes', keys: ['s'], run() {} },
        { id: 'orbit-fit', name: 'Fit the system', keys: ['f'], run() {} },
        { id: 'campaign', name: 'Campaign', run() {} },
    ];
    assert.deepEqual(keyGroups(registered), [
        { title: 'Build', rows: [{ name: 'Select hexes', keys: 'S', on: true }] },
        { title: 'Orbit view', rows: [{ name: 'Fit the system', keys: 'F', on: true }] },
        { title: 'Everywhere', rows: [{ name: 'Search', keys: '/ or Ctrl+K', on: true }, { name: 'Quick note', keys: 'Q', on: false }] },
    ]);
});

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => fs.readFileSync(path.join(root, 'apps/web/src', rel), 'utf8');

test('? opens the sheet from the search box, which is on every screen; the palette says each key', () => {
    const omni = read('components/OmniBox.vue');
    assert.match(omni, /id: 'keyboard-help',\s+name: 'Keyboard shortcuts',\s+keys: \['\?'\],/);
    assert.match(omni, /<KeyHelp v-if="keysOpen" @close="keysOpen = false" \/>/);
    assert.match(omni, /detail: keys \? 'Command · ' \+ keys : 'Command'/);
    const sheet = read('workspace/KeyHelp.vue');
    assert.match(sheet, /const groups = computed\(\(\) => keyGroups\(commands\(\)\)\);/);
    assert.match(sheet, /<div class="ui-modal key-help" role="dialog" aria-modal="true"/);
});
