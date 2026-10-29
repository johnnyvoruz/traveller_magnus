/**
 * CU45: a sector address names its subsectors, and a subsector address names its worlds.
 * The panel draws this column when Build is off. The pixels are checked in a browser
 * (findings/ui_design_shots/sc_CU45_address.mjs).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { addressColumn, worldCountLine } from '../../apps/web/src/dossier/model.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const index = {
    name: 'Spinward Marches',
    hexes: {
        '0101': { name: 'Example', uwp: 'A788899-C', zone: 'A' },
        '1909': { name: 'Regina', uwp: 'B000000-0', zone: '' },
        '1910': { name: '', uwp: 'X000000-0', zone: 'R' },
    },
    metadata: { names: { C: 'Regina' } },
};

test('a sector address lists every subsector with its letter, name and world count', () => {
    const column = addressColumn(index, null);
    assert.ok(column && column.kind === 'sector');
    assert.equal(column.name, 'Spinward Marches');
    assert.equal(column.subsectors.length, 16);
    assert.deepEqual(column.subsectors[0], { letter: 'A', name: 'Subsector A', worlds: 1, countLine: '1 world' });
    assert.deepEqual(column.subsectors[1], { letter: 'B', name: 'Subsector B', worlds: 0, countLine: '0 worlds' });
    assert.deepEqual(column.subsectors[2], { letter: 'C', name: 'Regina', worlds: 2, countLine: '2 worlds' });
    assert.equal(worldCountLine(1), '1 world');
});

test('a subsector address lists its worlds in hex order, with the UWP, starport and zone', () => {
    const column = addressColumn(index, 'C');
    assert.ok(column && column.kind === 'subsector');
    assert.equal(column.name, 'Regina');
    assert.equal(column.letter, 'C');
    assert.deepEqual(column.worlds.map((world) => world.hex), ['1909', '1910']);
    assert.equal(column.worlds[0].name, 'Regina');
    assert.equal(column.worlds[0].uwp, 'B000000-0');
    assert.equal(column.worlds[0].starport, 'B — Good Starport');
    assert.equal(column.worlds[0].zone, '');
    assert.equal(column.worlds[0].line, '1909 · B — Good Starport');
    assert.equal(column.worlds[1].name, '1910');
    assert.equal(column.worlds[1].starport, 'X — No starport');
    assert.equal(column.worlds[1].zone, 'Red');
    assert.equal(column.worlds[1].line, '1910 · X — No starport · Red');
    const amber = addressColumn(index, 'A');
    assert.ok(amber && amber.kind === 'subsector');
    assert.equal(amber.worlds[0].zone, 'Amber');
    assert.equal(amber.worlds[0].starport, 'A — Excellent Starport');
    assert.equal(addressColumn(index, 'Q'), null);
});

test('the panel draws that column and keeps the sign-in line at its foot', () => {
    const panel = fs.readFileSync(path.join(root, 'apps/web/src/dossier/DossierPanel.vue'), 'utf8');
    assert.match(panel, /addressColumn\(index, place\.letter\)/);
    assert.match(panel, /aria-label="Subsectors"/);
    assert.match(panel, /aria-label="Worlds"/);
    const column = panel.slice(panel.indexOf('v-else-if="browseOff"'));
    assert.match(column, /Sign in<\/button> to build here\./);
    assert.match(column, /Build is off\. Switch it on to select hexes and generate them in this/);
});
