/**
 * The ship sheet's fields (apps/web/src/workspace/ship_sheet.ts): the 312 fields of the
 * PDF through the generated wrapper, laid out in the PDF's sections and order, numbered
 * series as tables, values stored under the PDF's own names beside the deck plan.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    fieldNamed, fieldsOf, filledCount, isTall, SHEET_RULES, sheetSections, sheetWithFields, valueOf, withValue,
} from '../../apps/web/src/workspace/ship_sheet.ts';

test('the 312 fields come through the generated wrapper, with the PDF as their source', () => {
    assert.equal(SHEET_RULES.fields.length, 312);
    assert.match(SHEET_RULES.source, /Ship Sheet 2026_fillable\.pdf$/);
    assert.equal(SHEET_RULES.fields.filter((f) => f.type === 'checkbox').length, 66);
    assert.equal(fieldNamed('Hull Points').type, 'text');
    assert.equal(fieldNamed('Armour Critical Hit 1').type, 'checkbox');
    assert.equal(fieldNamed('nonsense'), null);
    assert.equal(isTall(fieldNamed('Distinguishing Features')), true);
    assert.equal(isTall(fieldNamed('Name')), false);
});

test('the sections come in page order and keep the PDF’s spellings', () => {
    const sections = sheetSections();
    assert.deepEqual(sections.map((s) => s.page + ' ' + s.name), [
        '1 Ship Data File', '1 Weapons', '1 Ship SHeet', '1 Drives', '1 Ammunition', '1 Screens & Point Defence Batteries',
        '1 Critical Hits', '1 Quirks', '2 Cargo Hold Contents', '2 Ship’s Computer', '2 Sensors', '2 Accommodation',
        '2 Passengers', '2 Crew', '2 Systems', '2 Notes',
    ]);
    const every = sections.flatMap((s) => s.blocks.flatMap((b) => (b.kind === 'row' ? b.cells.map((c) => c.field) : b.cells.flat().filter(Boolean))));
    assert.equal(every.length, 312, 'every field is laid out once');
    assert.equal(new Set(every.map((f) => f.name)).size, 312);
});

test('numbered series are tables: weapons across the page, the critical hits as rows of ticks', () => {
    const sections = sheetSections();
    const weapons = sections.find((s) => s.name === 'Weapons').blocks[0];
    assert.equal(weapons.kind, 'table');
    assert.deepEqual(weapons.columns, ['Turret Mount', 'Turret Weapon', 'Turret TL', 'Turret Range', 'Turret Damage', 'Turret Traits']);
    assert.equal(weapons.numbers.length, 8);
    assert.equal(weapons.flipped, false);
    assert.equal(weapons.cells[0][1].name, 'Turret Weapon 1');
    const hits = sections.find((s) => s.name === 'Critical Hits').blocks[0];
    assert.equal(hits.kind, 'table');
    assert.equal(hits.flipped, true);
    assert.equal(hits.columns.length, 11);
    assert.deepEqual(hits.numbers, [1, 2, 3, 4, 5, 6]);
    assert.equal(hits.columns[0], 'Armour Critical Hit');
    assert.equal(hits.cells[0][5].name, 'Armour Critical Hit 6');
    const cargo = sections.find((s) => s.name === 'Cargo Hold Contents');
    assert.equal(cargo.blocks[0].kind, 'row');
    assert.equal(cargo.blocks[0].cells[0].label, 'Cargo Capacity');
    assert.deepEqual(cargo.blocks[1].columns, ['Cargo Type', 'Cargo Tons', 'Cargo Notes']);
});

test('values are stored under the PDF’s names, empties dropped, the deck plan kept beside them', () => {
    const name = fieldNamed('Name');
    const hit = fieldNamed('Armour Critical Hit 1');
    assert.equal(valueOf(null, name), '');
    assert.equal(valueOf(null, hit), false);
    let values = withValue(null, name, 'Far Margin');
    values = withValue(values, hit, true);
    assert.deepEqual(values, { Name: 'Far Margin', 'Armour Critical Hit 1': true });
    assert.deepEqual(withValue(values, hit, false), { Name: 'Far Margin' });
    assert.deepEqual(withValue(values, name, '   '), { 'Armour Critical Hit 1': true });
    assert.equal(filledCount(values), 2);
    const sheet = sheetWithFields({ deckPlan: { meta: 'Traveller Geomorph Ship', name: 'x', parts: [] } }, values);
    assert.equal(sheet.schema, 'mgt2e_ship_sheet@1');
    assert.deepEqual(sheet.deckPlan, { meta: 'Traveller Geomorph Ship', name: 'x', parts: [] });
    assert.deepEqual(fieldsOf(sheet), values);
    assert.equal(fieldsOf(null), null);
    assert.equal(fieldsOf({ deckPlan: {} }), null);
    assert.deepEqual(fieldsOf({ fields: { Name: 'x', Bad: 3 } }), { Name: 'x' }, 'a value of another type is left out');
    assert.deepEqual(sheetWithFields(null, {}), { fields: {}, schema: 'mgt2e_ship_sheet@1' });
});
