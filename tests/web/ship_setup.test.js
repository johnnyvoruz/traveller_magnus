/**
 * DU45: Set up the ship, the card above the vessel page's sections. The eleven boxes are the sheet's own
 * fields (named as rules/mgt2e_ship_sheet_fields.json names them), the numbers read as the gauges read
 * them, the card folds once every box has a number, and a write is the sheet's own save.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { UPKEEP_FIELDS } from '../../apps/web/src/campaign/ship_finance.ts';
import { capacityTons } from '../../apps/web/src/campaign/cargo.ts';
import { fuelCapacityTons } from '../../apps/web/src/campaign/refuel.ts';
import { SETUP_FIELDS, setupDone, setupLeft, setupLine, setupNumber, setupNumbers, setupSave } from '../../apps/web/src/workspace/ship_setup.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (file) => fs.readFileSync(path.join(here, '../../apps/web/src', file), 'utf8');
const rules = JSON.parse(fs.readFileSync(path.join(here, '../../rules/mgt2e_ship_sheet_fields.json'), 'utf8'));
const sheetNames = new Set(JSON.stringify(rules).match(/"name": ?"[^"]+"/g).map((hit) => hit.replace(/"name": ?"/, '').slice(0, -1)));

const STAMP = '2026-11-01T12:00:00.000Z';
const vessel = (over = {}) => ({
    id: 'cr_12121212-1212-4212-8212-121212121212', type: 'vessel', kind: '', name: 'Kestrel Dawn', summary: '', details: '', tags: [], anchor: null, when: null,
    visibility: 'referee', playerNotes: null, sheet: null, status: null, images: null, provenance: null, rev: 1, createdAt: STAMP, updatedAt: STAMP, deleted: false, ...over,
});
const full = { 'Jump Drive Output': '2', 'Manoeuvre Drive Output': '1', 'Fuel Capacity': '41', 'Cargo Capacity': '64', 'Staterooms': '10', 'Low Berths': '6', 'Mortgage Cost': '160,000', 'Maintenance Cost': '13,000', 'Life Support Cost': '20,000', 'Salary Cost': '5,000', 'Running Cost': '3,200' };

test('the eleven boxes are sheet fields, named as the rules file names them; the costs are ship_finance\'s five', () => {
    assert.equal(SETUP_FIELDS.length, 11);
    for (const field of SETUP_FIELDS) assert.equal(sheetNames.has(field.name), true, field.name + ' is a box on the sheet');
    assert.deepEqual(SETUP_FIELDS.filter((f) => f.row === 'ship').map((f) => f.name), ['Jump Drive Output', 'Manoeuvre Drive Output', 'Fuel Capacity', 'Cargo Capacity', 'Staterooms', 'Low Berths']);
    assert.deepEqual(SETUP_FIELDS.filter((f) => f.row === 'cost').map((f) => f.name), [...UPKEEP_FIELDS]);
    for (const field of SETUP_FIELDS) assert.equal(field.why.length > 0 && !field.why.includes('\n'), true, 'one line each');
});

test('a box reads as the gauges read it; the card folds once every box has a number', () => {
    for (const raw of ['41', '41 t', '41 tons', '12,500', ' 2 ']) {
        assert.equal(setupNumber(raw), fuelCapacityTons({ 'Fuel Capacity': raw }), raw);
        assert.equal(setupNumber(raw), capacityTons({ 'Cargo Capacity': raw }), raw);
    }
    assert.equal(setupNumber(''), null);
    assert.equal(setupNumber('J-2'), -2, 'the first number as typed; the sheet keeps the text');
    assert.equal(setupNumber(true), null);
    assert.equal(setupNumber(undefined), null);
    const none = setupNumbers(null);
    assert.equal(setupDone(none), false);
    assert.equal(setupLeft(none), 11);
    const some = setupNumbers({ 'Jump Drive Output': '2', 'Cargo Capacity': '64 t' });
    assert.equal(some['Cargo Capacity'], 64);
    assert.equal(setupLeft(some), 9);
    assert.equal(setupDone(some), false);
    const all = setupNumbers(full);
    assert.equal(setupDone(all), true);
    assert.equal(setupLeft(all), 0);
    assert.equal(setupLine(all), 'Set up: J-2, 1 G, 41 t fuel, 64 t hold, 10 staterooms, 6 low berths, Cr201,200 a month');
    assert.equal(setupLine(setupNumbers({ ...full, Staterooms: '1', 'Low Berths': '1' })), 'Set up: J-2, 1 G, 41 t fuel, 64 t hold, 1 stateroom, 1 low berth, Cr201,200 a month');
});

test('a write is the sheet\'s own save: the sheet alone once the manifest has moved; sheet and status together before', () => {
    const moved = vessel({ sheet: { schema: 'mgt2e_ship_sheet@1', fields: { 'Jump Drive Output': '2', 'Cargo Type 1': 'Grain' } }, status: { cargo: [{ label: 'Grain', tons: 12 }], passengers: [] } });
    const values = { 'Jump Drive Output': '2', 'Cargo Type 1': 'Grain', 'Cargo Tons 1': '12' };
    const one = setupSave(moved, values, 'Fuel Capacity', ' 41 ');
    assert.equal(one.kind, 'record');
    assert.equal(one.sheet.fields['Fuel Capacity'], '41', 'trimmed');
    assert.equal(one.sheet.fields['Jump Drive Output'], '2', 'the other boxes stay');
    assert.equal(one.sheet.fields['Cargo Type 1'], undefined, 'the manifest rows are not written to the sheet');
    assert.equal(one.sheet.schema, 'mgt2e_ship_sheet@1');
    const cleared = setupSave(moved, { ...values, 'Fuel Capacity': '41' }, 'Fuel Capacity', '   ');
    assert.equal(cleared.sheet.fields['Fuel Capacity'], undefined, 'a blank clears the box');
    const old = vessel({ sheet: { schema: 'mgt2e_ship_sheet@1', fields: { 'Cargo Type 1': 'Grain', 'Cargo Tons 1': '12' } }, status: null });
    const two = setupSave(old, { 'Cargo Type 1': 'Grain', 'Cargo Tons 1': '12' }, 'Staterooms', '10');
    assert.equal(two.kind, 'trade');
    assert.equal(two.sheet.fields['Staterooms'], '10');
    assert.equal(two.sheet.fields['Cargo Type 1'], undefined, 'the rows move into the status, as any sheet edit moves them');
    assert.deepEqual(two.status.cargo.map((lot) => lot.label), ['Grain']);
});

test('the card sits above the vessel page\'s sections and its boxes are the sheet\'s fields (pins)', () => {
    const page = src('workspace/RecordPage.vue');
    assert.match(page, /<ShipSetup v-if="record\.type === 'vessel'" :id="id" :read-only="readOnly" \/>\s+<TrackBlock v-if="record\.type === 'vessel'"/, 'first among the vessel sections');
    const card = src('workspace/ShipSetup.vue');
    assert.match(card, /:data-setup-field="field\.name" :title="field\.why" @change="save\(field\.name\)" @keydown\.enter\.prevent="save\(field\.name\)"/);
    assert.match(card, /if \(change\.kind === 'trade'\) writeTrade\(now, \{ sheet: change\.sheet, status: change\.status \}\);\s+else saveRecord\(props\.id, \{ sheet: change\.sheet \}\);/, 'the sheet\'s own save');
    assert.match(card, /<p v-if="!open" class="setup-line" data-setup-line>\{\{ line \}\}<\/p>/, 'the folded line');
    assert.match(card, /data-setup-edit @click="editing = true"/);
    assert.doesNotMatch(card, /#[0-9a-f]{3,6}\b/i, 'tokens only');
    const sheet = src('workspace/ShipSheet.vue');
    assert.match(sheet, /const moved = Array\.isArray\(status\.cargo\) && Array\.isArray\(status\.passengers\);/, 'the sheet\'s own rule the card copies');
});
