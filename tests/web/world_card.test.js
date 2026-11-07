/**
 * DH3: the World card in Edit this system. The rules file's shape (every entry with its source line in
 * assets/2eWorldCreation.txt), the lists for Starport, Size and Atmosphere, the words beside every cell
 * (none for Tech Level; the "9+" law row for 9 and above), the legacy order of the chart fields, the UWP
 * string from the cells; the editor and the hand designer are pinned.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { CELLS, UWP_CODES, WORLD_SECTION_IDS, cellField, cellOf, digitOf, listFor, orderChart, uwpOf, wordsFor } from '../../apps/web/src/workspace/build/world_card.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (file) => fs.readFileSync(path.join(here, '../../apps/web/src', file), 'utf8');
const rules = JSON.parse(fs.readFileSync(path.join(here, '../../rules/mgt2e_uwp_codes.json'), 'utf8'));
const text = fs.readFileSync(path.join(here, '../../assets/2eWorldCreation.txt'), 'utf8').split(/\r?\n/);
const LINE = /^assets\/2eWorldCreation\.txt:(\d+)(?:-(\d+))?$/;

test('the rules file: every entry cites its lines in the text, and the counts are the text\'s tables', () => {
    const tables = [
        ['starport', 'classes', 'code', 6], ['size', 'codes', 'code', 11], ['atmosphere', 'codes', 'code', 16], ['hydrographics', 'codes', 'code', 11],
        ['population', 'codes', 'code', 13], ['government', 'codes', 'code', 16], ['lawLevel', 'levels', 'level', 10],
    ];
    for (const [section, list, key, count] of tables) {
        const rows = rules[section][list];
        assert.equal(rows.length, count, section);
        assert.match(rules[section].source, LINE, section + ' cites its span');
        for (const row of rows) {
            const cited = LINE.exec(row.source);
            assert.ok(cited, section + ' ' + row[key] + ' cites a line');
            const from = Number(cited[1]);
            const to = cited[2] ? Number(cited[2]) : from;
            assert.ok(from >= 1 && to <= text.length && to >= from, row.source);
            // The entry's code or level stands in its cited lines, as the text prints it ("10 (A)" for A).
            const span = text.slice(from - 1, to).join(' ');
            // The starport table prints its letters bare; the digit tables print a letter as "10 (A)".
            const printed = row[key] === '9+' ? '9+' : section !== 'starport' && /^[A-F]$/.test(row[key]) ? '(' + row[key] + ')' : row[key];
            assert.ok(span.includes(printed), section + ' ' + row[key] + ' is printed in ' + row.source + ': ' + span.slice(0, 80));
        }
    }
    assert.equal(rules.techLevel.communications.length, 4);
    assert.ok(rules.techLevel.note.includes('no words per Tech Level'));
    assert.deepEqual(UWP_CODES.size.codes.map((row) => row.code), ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'A']);
});

test('the words of a few digits, as the text has them', () => {
    assert.equal(wordsFor('st', 'A'), 'Excellent · berthing 1D x Cr1000 · Refined fuel');
    assert.equal(wordsFor('st', 'X'), 'No Starport · berthing 0 · no fuel');
    assert.equal(wordsFor('s', 4), '6,400km · Mars · 0.35 G');
    assert.equal(wordsFor('s', 0), 'Less than 1,000km · Asteroid, orbital complex · negligible gravity');
    assert.equal(wordsFor('s', 'B'), '', 'the text\'s table stops at A');
    assert.equal(wordsFor('a', 6), 'Standard · Earth · 0.71-1.49');
    assert.equal(wordsFor('a', 'B'), 'Corrosive · Venus · Varies · Vacc Suit');
    assert.equal(wordsFor('h', 7), '66%–75% · Earth-like world');
    assert.equal(wordsFor('p', 9), 'Billions · 1,000,000,000+ · Present day Earth');
    assert.equal(wordsFor('p', 6), 'Millions · 1,000,000+', 'the text\'s dash is no description');
    assert.equal(wordsFor('g', 4), 'Representative Democracy · Ruling functions are performed by elected representatives.');
    assert.equal(wordsFor('g', 'F'), 'Totalitarian Oligarchy · Government by an all-powerful minority which maintains absolute control through widespread coercion and oppression.');
    assert.equal(wordsFor('l', 4), 'Weapons banned: Light assault weapons and submachine guns · armour banned: Cloth');
    assert.equal(wordsFor('l', 7), 'Weapons banned: Shotguns', 'no armour row in the text');
    assert.equal(wordsFor('l', 9), 'Weapons banned: All weapons · armour banned: All armour');
    assert.equal(wordsFor('l', 'C'), wordsFor('l', 9), 'the text\'s "9+" row for 9 and above');
    assert.equal(wordsFor('tl', 12), '', 'the text gives no words per Tech Level');
    assert.equal(wordsFor('s', null), '');
    assert.equal(wordsFor('s', ''), '');
});

test('the lists: Starport, Size and Atmosphere from the tables; the other cells stay boxes', () => {
    assert.deepEqual(listFor('st').map((item) => item.value), ['A', 'B', 'C', 'D', 'E', 'X']);
    assert.equal(listFor('st')[0].label, 'A · Excellent', "the code and the table's first word (DF37); the full words stand under the cell");
    assert.equal(listFor('s').length, 11);
    assert.equal(listFor('s')[10].label, 'A · 16,000km');
    assert.equal(listFor('a').length, 16);
    assert.equal(listFor('a')[15].label, 'F · Unusual');
    assert.equal(listFor('a')[2].label, '2 · Very Thin, Tainted');
    for (const cell of ['h', 'p', 'g', 'l', 'tl']) assert.equal(listFor(cell), null, cell);
    const field = (id, kind, value) => ({ id, label: id, kind, permission: 'type', value, options: [] });
    const size = cellField(field('profile.s', 'number', 10));
    assert.equal(size.kind, 'choice');
    assert.equal(size.value, 'A', 'the number as its ehex digit, which the server takes for any cell');
    assert.equal(size.options.length, 11);
    assert.equal(cellField(field('profile.st', 'text', 'c')).value, 'C');
    assert.equal(cellField(field('body_1.profile.a', 'text', '6')).kind, 'choice', 'a hand body\'s cell too');
    const hydro = cellField(field('profile.h', 'number', 7));
    assert.equal(hydro.kind, 'text', 'hydrographics stays a box');
    assert.equal(hydro.value, '7');
    assert.equal(cellField(field('profile.g', 'number', 10)).value, 'A', 'the box reads the digit the chart writes, not 10');
    assert.equal(cellField(field('chart.zone', 'choice', 'Green')).kind, 'choice');
    assert.equal(cellField({ ...field('profile.s', 'number', 4), permission: 'read' }).kind, 'number', 'a read-only cell is words, not a list');
});

test('the cells, the digit, the chart order and the UWP string', () => {
    assert.deepEqual(CELLS, ['st', 's', 'a', 'h', 'p', 'g', 'l', 'tl']);
    assert.deepEqual(WORLD_SECTION_IDS, ['name', 'profile', 'chart']);
    assert.equal(cellOf('profile.tl'), 'tl');
    assert.equal(cellOf('hand_3.profile.st'), 'st');
    assert.equal(cellOf('profile.x'), null);
    assert.equal(cellOf('chart.pbg'), null);
    assert.equal(digitOf(10), 'A');
    assert.equal(digitOf(33), 'Z');
    assert.equal(digitOf(' c '), 'C');
    assert.equal(digitOf(true), '');
    assert.equal(digitOf(null), '');
    const f = (id) => ({ id, label: id, kind: 'text', permission: 'type', value: '', options: [] });
    const ordered = orderChart([f('chart.stellar'), f('chart.base.naval'), f('chart.trade'), f('chart.gasGiant'), f('chart.notes'), f('chart.zone'), f('chart.base.scout'), f('chart.pbg'), f('chart.allegiance'), f('chart.region'), f('chart.new')]);
    assert.deepEqual(ordered.map((item) => item.id), ['chart.zone', 'chart.allegiance', 'chart.region', 'chart.notes', 'chart.base.naval', 'chart.base.scout', 'chart.gasGiant', 'chart.trade', 'chart.pbg', 'chart.stellar', 'chart.new']);
    const cells = [['profile.st', 'A'], ['profile.s', 7], ['profile.a', 8], ['profile.h', 8], ['profile.p', 8], ['profile.g', 9], ['profile.l', 9], ['profile.tl', 12]].map(([id, value]) => ({ ...f(id), value }));
    assert.equal(uwpOf(cells), 'A788899-C');
    assert.equal(uwpOf(cells.slice(0, 4)), 'A788???-?');
});

test('pins: the card first in the editor with the lists and the words, the string under the cells; the hand designer\'s cells the same', () => {
    const editor = src('workspace/build/SystemEditor.vue');
    assert.match(editor, /<section v-if="world\.length" class="sysed-section sysed-world" data-section="world">/);
    assert.match(editor, /<h3 class="ui-heading ui-kicker">World<\/h3>/);
    assert.match(editor, /:field="cellField\(field\)"/);
    assert.match(editor, /data-digit-words="cellOf\(field\.id\)"/);
    assert.match(editor, /<p v-if="section\.id === 'profile'" class="sysed-uwp" data-uwp-string>/);
    assert.match(editor, /orderChart\(group\.fields\)/);
    assert.match(editor, /sections\.filter\(\(section\) => section\.id !== 'rules' && !\(WORLD_SECTION_IDS as readonly string\[\]\)\.includes\(section\.id\)\)/, 'the rest of the form follows as before');
    assert.doesNotMatch(editor, /#[0-9a-f]{3,6}\b/i, 'tokens only');
    const hand = src('workspace/build/HandDesigner.vue');
    assert.match(hand, /:field="cellField\(field\)"/);
    assert.match(hand, /data-digit-words="cellOf\(field\.id\)"/);
    const card = src('workspace/build/world_card.ts');
    assert.match(card, /generated\/rules\/mgt2e_uwp_codes\.js/, 'the words come from the rules file through the wrapper');
    assert.doesNotMatch(card, /Balkanisation|Representative|Vacc Suit/, 'no word of the text is typed into the code');
});
