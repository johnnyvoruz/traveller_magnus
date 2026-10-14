import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
    CODE_SENTENCES,
    baseParts,
    editionWords,
    hasBaseWords,
    headlineParts,
    ribbonCellWords,
    stellarWords,
    tradeWords,
    zoneWords,
} from '../../apps/web/src/dossier/code_words.ts';

test('every stored sentence is one plain sentence', () => {
    const keys = Object.keys(CODE_SENTENCES);
    assert.ok(keys.length >= 40);
    for (const key of keys) {
        const text = CODE_SENTENCES[key];
        assert.match(text, /^[A-Z]/, key);
        assert.match(text, /\.$/, key);
        assert.equal(text.includes('#'), false, key);
    }
});

test('the Regina headline explains the extension, the trade number and importance, and not the credit figure', () => {
    const parts = headlineParts('Importance 4 · D7E+5 · WTN 10 · Cr233280');
    assert.equal(parts.length, 4);
    assert.match(parts[0].words, /starport, tech level, bases and trade codes/);
    assert.match(parts[1].words, /resources, labor, infrastructure and efficiency/);
    assert.match(parts[2].words, /passenger and freight/);
    assert.equal(parts[3].words, null);
    assert.equal(headlineParts('Cr233280')[0].words, null);
});

test('a code with no cited meaning stays quiet', () => {
    assert.equal(tradeWords('Ph'), null);
    assert.equal(tradeWords('An'), null);
    assert.equal(tradeWords('Cp'), null);
    assert.equal(zoneWords('Q'), null);
    assert.equal(editionWords('AoW'), null);
    assert.equal(editionWords('RTT'), null);
    assert.equal(ribbonCellWords('Nobility', 'B'), null);
});

test('sourced codes resolve', () => {
    assert.match(tradeWords('Ri'), /economic powerhouse/);
    assert.match(tradeWords('Sa'), /satellite/);
    assert.match(zoneWords('A'), /amber/i);
    assert.match(zoneWords('R'), /interdicted/);
    assert.equal(editionWords('MgT2E'), 'Mongoose 2nd Edition.');
    assert.match(ribbonCellWords('Port', 'A'), /excellent starport/);
    assert.match(ribbonCellWords('Hyd', '8'), /surface is liquid/);
    assert.equal(hasBaseWords('NS'), true);
    assert.deepEqual(baseParts('NS').map((part) => part.letter), ['N', 'S']);
    assert.match(baseParts('N')[0].words, /naval/i);
    assert.equal(baseParts('?')[0].words, null);
    assert.match(stellarWords('F7 V'), /main sequence/);
    assert.equal(stellarWords('F7 V').includes('white dwarf'), false);
    assert.match(stellarWords('G2 D'), /white dwarf/);
    assert.equal(stellarWords('BD'), null);
});

test('the dossier rows render the note, and the credit figure is not given a sentence', () => {
    const root = new URL('../../apps/web/src/dossier/', import.meta.url);
    const socio = fs.readFileSync(new URL('SocioBlock.vue', root), 'utf8');
    const rows = fs.readFileSync(new URL('StatRows.vue', root), 'utf8');
    const ribbon = fs.readFileSync(new URL('UwpRibbon.vue', root), 'utf8');
    const stars = fs.readFileSync(new URL('StellarLines.vue', root), 'utf8');
    const overview = fs.readFileSync(new URL('DossierOverview.vue', root), 'utf8');
    assert.match(socio, /headlineParts/);
    assert.match(rows, /labelWords/);
    assert.match(rows, /hasBaseWords/);
    assert.match(rows, /tradeWords/);
    assert.match(ribbon, /ribbonCellWords/);
    assert.match(stars, /stellarWords/);
    assert.match(overview, /quiet/);
    assert.equal(socio.includes('Cr means'), false);
});
