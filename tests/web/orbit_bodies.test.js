/**
 * The orbit view's body chips and paths (apps/web/src/orbit/bodies.ts). Bodies are named by
 * the dossier's keys; this file defines no second scheme.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    bodyChips, chipHolding, dossierPath, findChip, orbitPath, shortLabel, subsectorLetter,
} from '../../apps/web/src/orbit/bodies.ts';

const row = (key, name, moon = false, tag = '') => ({
    key, name, facts: [], tag, uwp: '', moon, glyph: { kind: key.startsWith('s') ? 'star' : (moon ? 'moon' : 'world'), star: '' },
});

const rows = [
    row('s0', 'F7 V'),
    row('s1', 'BD V'),
    row('w0', 'Regina A-I'),
    row('w2', 'Regina A-II'),
    row('w2m0', 'Regina A-II-a', true),
    row('w2m1', 'Regina A-II-b', true),
    row('w4', 'Regina A-IV'),
    row('w4m1', 'Regina', true, 'Mainworld'),
];

test('a label is the name without the system name in front, as the legacy scan label', () => {
    assert.equal(shortLabel('Regina A-II', 'Regina'), 'A-II');
    assert.equal(shortLabel('Regina', 'Regina'), 'Regina');
    assert.equal(shortLabel('F7 V', 'Regina'), 'F7 V');
    assert.equal(shortLabel('Reginald A-I', 'Regina'), 'Reginald A-I');
    assert.equal(shortLabel('Regina A-II', ''), 'Regina A-II');
});

test('chips are one per star and world in the tree order, each world holding its moons', () => {
    const chips = bodyChips(rows, 'Regina');
    assert.deepEqual(chips.map((chip) => chip.key), ['s0', 's1', 'w0', 'w2', 'w4']);
    assert.deepEqual(chips.map((chip) => chip.label), ['F7 V', 'BD V', 'A-I', 'A-II', 'A-IV']);
    assert.deepEqual(chips[3].moons.map((moon) => moon.key), ['w2m0', 'w2m1']);
    assert.deepEqual(chips[3].moons.map((moon) => moon.label), ['A-II-a', 'A-II-b']);
    assert.deepEqual(chips[0].moons, []);
    // The keys are the dossier's own, unchanged.
    for (const chip of chips) assert.ok(rows.some((item) => item.key === chip.key));
    // The mainworld is marked wherever it sits.
    assert.equal(chips[4].moons[0].mainworld, true);
    assert.equal(chips[4].mainworld, false);
    assert.equal(chips[4].moons[0].label, 'Regina');
    assert.deepEqual(bodyChips([], 'Regina'), []);
});

test('a selected key finds its chip, and the chip that holds it', () => {
    const chips = bodyChips(rows, 'Regina');
    assert.equal(findChip(chips, 'w2m1').name, 'Regina A-II-b');
    assert.equal(chipHolding(chips, 'w2m1').key, 'w2');
    assert.equal(findChip(chips, 's1').key, 's1');
    assert.equal(chipHolding(chips, 's1').key, 's1');
    assert.equal(findChip(chips, 'w9'), null);
    assert.equal(findChip(chips, null), null);
    assert.equal(chipHolding(chips, ''), null);
});

test('paths: the dossier on the map, and the orbit view, with or without a body', () => {
    assert.equal(dossierPath('Spinward_Marches', '1910'), '/s/Spinward_Marches/1910');
    assert.equal(dossierPath('Spinward_Marches', '1910', 'w4m1'), '/s/Spinward_Marches/1910/b/w4m1');
    assert.equal(orbitPath('Spinward_Marches', '1910'), '/s/Spinward_Marches/1910/orbit');
    assert.equal(orbitPath('Spinward_Marches', '1910', 'w4m1'), '/s/Spinward_Marches/1910/orbit/b/w4m1');
    assert.equal(orbitPath('Spinward_Marches', '1910', null), '/s/Spinward_Marches/1910/orbit');
    // A sector slug that needs escaping is escaped once.
    assert.equal(orbitPath('user~My Sector', '0101'), '/s/user~My%20Sector/0101/orbit');
});

test('the subsector letter runs A to P across four columns of eight and four rows of ten', () => {
    assert.equal(subsectorLetter('0101'), 'A');
    assert.equal(subsectorLetter('0810'), 'A');
    assert.equal(subsectorLetter('0901'), 'B');
    assert.equal(subsectorLetter('1910'), 'C');
    assert.equal(subsectorLetter('1911'), 'G');
    assert.equal(subsectorLetter('3240'), 'P');
    assert.equal(subsectorLetter('0140'), 'M');
    assert.equal(subsectorLetter('3301'), '');
    assert.equal(subsectorLetter('abcd'), '');
});
