/**
 * DU3 "Where is everyone": the Party tab's first card. Each ship with its place at the campaign date,
 * the people aboard it under it, then the people aboard no ship, each with the hex a Locate flies to.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { everyoneWhere, standsAt } from '../../apps/web/src/workspace/party_everyone.ts';

const id = (n) => 'cr_' + String(n).padStart(8, '0') + '-0000-4000-8000-000000000000';
const record = (n, type, name, anchor = null) => ({
    id: id(n), type, name, summary: '', details: '', tags: [], anchor, visibility: 'referee', playerNotes: '', images: [],
    sheet: null, when: null, status: null, rev: 1, updatedAt: '2026-10-17T00:00:00.000Z', deleted: false,
});
const at = (hexKey, label = '') => ({ kind: 'system', hexKey, locationLabel: label });

const ship = record(1, 'vessel', 'Bright Ledger', at('Spinward_Marches/1910', 'Regina'));
const tender = record(2, 'vessel', 'Far Tender', null);
const ilsa = record(3, 'person', 'Ilsa Varn');
const doc = record(4, 'person', 'Doc Mareth');
const juno = record(5, 'person', 'Juno Kell');
const records = Object.fromEntries([ship, tender, ilsa, doc, juno].map((r) => [r.id, r]));
const DAYS = 1105 * 365 + 2;

test('ships in party order, each followed by who is aboard it, then who is ashore', () => {
    const party = { vesselIds: [ship.id, tender.id], aboard: { [ilsa.id]: ship.id, [juno.id]: tender.id }, memberIds: [ilsa.id, doc.id, juno.id], anchor: at('Spinward_Marches/1810', 'Jenghe') };
    const rows = everyoneWhere(party, records, DAYS);
    assert.deepEqual(rows.map((row) => row.record.name), ['Bright Ledger', 'Ilsa Varn', 'Far Tender', 'Juno Kell', 'Doc Mareth']);
    assert.deepEqual(rows.map((row) => row.words), [
        'Regina system · Spinward Marches 1910',
        'Aboard Bright Ledger',
        'Nowhere in particular',
        'Aboard Far Tender',
        'Ashore · Jenghe system · Spinward Marches 1810',
    ]);
    assert.deepEqual(rows.map((row) => row.hexKey), ['Spinward_Marches/1910', 'Spinward_Marches/1910', null, null, 'Spinward_Marches/1810']);
    assert.deepEqual(rows.map((row) => row.lead), [true, false, false, false, false]);
    assert.equal(rows[1].aboard.id, ship.id);
    assert.equal(rows[4].aboard, null);
});

test('ashore with no place says so, or the person\'s own place; with no ship at all nobody is ashore', () => {
    const party = { vesselIds: [ship.id], aboard: {}, memberIds: [doc.id], anchor: null };
    assert.equal(everyoneWhere(party, records, DAYS)[1].words, 'Ashore, nowhere in particular');
    // With the party's own anchor nowhere, a person's own record says where they are.
    const placed = { ...doc, anchor: at('Spinward_Marches/1719', 'Bael') };
    const own = everyoneWhere(party, { ...records, [doc.id]: placed }, DAYS)[1];
    assert.equal(own.words, 'Ashore · Bael system · Spinward Marches 1719');
    assert.equal(own.hexKey, 'Spinward_Marches/1719');
    const shipless = { vesselIds: [], aboard: {}, memberIds: [doc.id], anchor: at('Spinward_Marches/1810', 'Jenghe') };
    assert.deepEqual(everyoneWhere(shipless, records, DAYS).map((row) => row.words), ['Jenghe system · Spinward Marches 1810']);
});

test('a ship under way says the strip\'s words and locates the system it is in', () => {
    const track = [{ mode: 'flight', from: at('Spinward_Marches/1910', 'Regina'), to: at('Spinward_Marches/1910', 'Regina'), departs: DAYS - 1, arrives: DAYS + 3 }];
    const sailing = { ...ship, status: { track } };
    const party = { vesselIds: [ship.id], aboard: {}, memberIds: [], anchor: null };
    const [row] = everyoneWhere(party, { ...records, [ship.id]: sailing }, DAYS);
    assert.equal(row.hexKey, 'Spinward_Marches/1910');
    assert.notEqual(row.words, 'Regina system · Spinward Marches 1910');
    assert.ok(row.words.length > 0);
});

test('DU3b: aboard no ship, one rule: the party\'s anchor when it has one, else the person\'s own record', () => {
    const placed = { ...doc, anchor: at('Spinward_Marches/1719', 'Bael') };
    const all = { ...records, [doc.id]: placed };
    const withAnchor = { vesselIds: [ship.id], aboard: {}, memberIds: [doc.id], anchor: at('Spinward_Marches/1810', 'Jenghe') };
    assert.deepEqual(standsAt(withAnchor, all, placed, DAYS), { words: 'Jenghe system · Spinward Marches 1810', hexKey: 'Spinward_Marches/1810' });
    const noAnchor = { ...withAnchor, anchor: null };
    assert.deepEqual(standsAt(noAnchor, all, placed, DAYS), { words: 'Bael system · Spinward Marches 1719', hexKey: 'Spinward_Marches/1719' });
    // The card says the same.
    assert.equal(everyoneWhere(noAnchor, all, DAYS)[1].words, 'Ashore · Bael system · Spinward Marches 1719');
});

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('the Party tab shows the card first, with a Locate per row that has a place', () => {
    const panel = fs.readFileSync(path.join(root, 'apps/web/src/workspace/PartyPanel.vue'), 'utf8');
    const card = panel.indexOf('data-everyone');
    assert.ok(card > 0 && card < panel.indexOf('<section class="party-ship">'), 'before the ships');
    assert.match(panel, /<h3 id="party-everyone-h" class="ui-heading ui-kicker">Where is everyone<\/h3>/);
    assert.match(panel, /v-if="row\.hexKey"\s+type="button"\s+class="ui-btn party-locate"/);
    assert.match(panel, /startLocate\(id, row\.hexKey, \(\) => \{/);
    // DU3b: the people rows say where a member aboard no ship is by the card's rule.
    assert.match(panel, /const standing = shipId \? '' : standsAt\(party\.value, campaign\.records, record, days\.value\)\.words;/);
});
