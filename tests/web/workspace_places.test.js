/**
 * Where campaign records are (apps/web/src/workspace/places.ts, pick.ts, locate.ts, and the
 * anchor in records.ts and actions.ts): the anchor a screen stores, the place a record
 * resolves to, the records at a system and on a body, picking a system and the locator.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CampaignAnchor, CampaignRecord, RecordChange } from '@voyage/shared';
import { resetCampaign } from '../../apps/web/src/campaign/commit.ts';
import { campaign, transport } from '../../apps/web/src/campaign/store.ts';
import { clearToasts } from '../../apps/web/src/shell/toast.ts';
import { createRecord, forgetDeleted, saveRecord } from '../../apps/web/src/workspace/actions.ts';
import { locateOriginY, locating, startLocate, stopLocate } from '../../apps/web/src/workspace/locate.ts';
import { beginPick, cancelPick, endPick, offerSystem, picking } from '../../apps/web/src/workspace/pick.ts';
import {
    bodyCounts, bodyMatched, hexKeyOf, hexWords, liveById, parseHexKey, placeWords, recordsHere, resolvePlace, sameAnchor,
    systemAnchor, withinSystem,
} from '../../apps/web/src/workspace/places.ts';
import { edited, newRecord, placeLine, unchanged } from '../../apps/web/src/workspace/records.ts';

const STAMP = '2026-10-05T12:00:00.000Z';
const REGINA = 'Spinward_Marches/1910';
const id = (n) => 'cr_' + String(n).padStart(8, '0') + '-0000-4000-8000-000000000000';
const make = (n, type, name, anchor = null, over = {}) => ({ ...newRecord(type, id(n), STAMP, anchor), name, rev: 1, ...over });
const byId = (list) => Object.fromEntries(list.map((record) => [record.id, record]));

test('hex keys: made, read back and said in words', () => {
    assert.equal(hexKeyOf('Spinward_Marches', '1910'), REGINA);
    assert.deepEqual(parseHexKey(REGINA), { slug: 'Spinward_Marches', hex: '1910' });
    assert.equal(parseHexKey('Spinward_Marches'), null);
    assert.equal(parseHexKey('Spinward_Marches/19'), null);
    assert.equal(parseHexKey('/1910'), null);
    assert.equal(hexWords(REGINA), 'Spinward Marches 1910');
    assert.equal(hexWords('nonsense'), 'nonsense');
});

test('the anchor a screen stores: the hex key, the body key and a name beside it', () => {
    const system = systemAnchor(REGINA, '  Regina ', null);
    assert.deepEqual(system, { kind: 'system', hexKey: REGINA, locationLabel: 'Regina' });
    const world = systemAnchor(REGINA, 'Regina', { key: 'w3', name: 'Regina A-IV' });
    assert.deepEqual(world, { kind: 'system', hexKey: REGINA, bodyKey: 'w3', locationLabel: 'Regina A-IV' });
    const moon = systemAnchor(REGINA, 'Regina', { key: 'w3m1', name: '' });
    assert.deepEqual(moon, { kind: 'system', hexKey: REGINA, bodyKey: 'w3m1' });
    assert.deepEqual(systemAnchor(REGINA, '', null), { kind: 'system', hexKey: REGINA });
    for (const anchor of [system, world, moon]) assert.equal(CampaignAnchor.safeParse(anchor).success, true);
    // A new record made at a place is a whole, valid row.
    const record = newRecord('person', id(1), STAMP, world);
    assert.equal(CampaignRecord.safeParse(record).success, true);
    assert.deepEqual(record.anchor, world);
    assert.equal(placeLine(record), 'Spinward Marches 1910 · Regina A-IV');
});

test('two anchors are the same when they say the same place', () => {
    const a = systemAnchor(REGINA, 'Regina', { key: 'w3', name: 'Regina A-IV' });
    assert.equal(sameAnchor(a, { ...a }), true);
    assert.equal(sameAnchor(a, systemAnchor(REGINA, 'Regina', null)), false);
    assert.equal(sameAnchor(a, systemAnchor(REGINA, 'Regina', { key: 'w4', name: 'Regina A-IV' })), false);
    assert.equal(sameAnchor(a, null), false);
    assert.equal(sameAnchor(null, null), true);
    assert.equal(sameAnchor({ kind: 'record', id: id(2) }, { kind: 'record', id: id(2) }), true);
    assert.equal(sameAnchor({ kind: 'record', id: id(2) }, { kind: 'record', id: id(3) }), false);
    assert.equal(sameAnchor({ kind: 'record', id: id(2) }, a), false);
    // A patch that keeps the place is not sent; one that moves it is.
    const record = make(1, 'person', 'Voss', a);
    assert.equal(unchanged(record, { anchor: { ...a } }), true);
    assert.equal(unchanged(record, { anchor: null }), false);
    const change = edited(record, { anchor: null }, STAMP);
    assert.equal(change.anchor, null);
    assert.equal(RecordChange.safeParse(change).success, true);
});

test('where a record is, through a vessel it is aboard; and the records at a system and on a body', () => {
    const records = byId([
        make(1, 'vessel', 'Far Margin', systemAnchor(REGINA, 'Regina', { key: 'w3', name: 'Regina A-IV' })),
        make(2, 'person', 'Captain Voss', { kind: 'record', id: id(1) }),
        make(3, 'place', 'Bay 4', systemAnchor(REGINA, 'Regina', null)),
        make(4, 'person', 'Broker Sol', systemAnchor(REGINA, 'Regina', { key: 'w3m1', name: 'Regina A-IV a' })),
        make(5, 'person', 'Elsewhere', systemAnchor('Spinward_Marches/2007', 'Roup', { key: 'w3', name: 'Roup' })),
        make(6, 'note', 'Nowhere'),
        make(7, 'item', 'Gone', systemAnchor(REGINA, 'Regina', null), { deleted: true }),
        make(8, 'person', 'Aboard a wreck', { kind: 'record', id: id(7) }),
    ]);
    const live = liveById(records);
    assert.equal(Object.keys(live).length, 7);
    assert.deepEqual(resolvePlace(id(1), live), { hexKey: REGINA, bodyKey: 'w3', label: 'Regina A-IV' });
    assert.deepEqual(resolvePlace(id(2), live), { hexKey: REGINA, bodyKey: 'w3', label: 'Regina A-IV' });
    assert.deepEqual(resolvePlace(id(3), live), { hexKey: REGINA, bodyKey: null, label: 'Regina' });
    assert.equal(resolvePlace(id(6), live), null);
    assert.equal(resolvePlace(id(8), live), null, 'aboard a deleted record is nowhere');
    assert.deepEqual(placeWords(resolvePlace(id(1), live)), ['Regina A-IV', 'Spinward Marches 1910']);
    assert.deepEqual(placeWords({ hexKey: REGINA, bodyKey: null, label: '' }), ['Spinward Marches 1910']);
    // A system as a whole says so: its mainworld often has the same name.
    assert.deepEqual(placeWords(resolvePlace(id(3), live)), ['Regina system', 'Spinward Marches 1910']);
    assert.equal(placeLine(records[id(3)]), 'Spinward Marches 1910 · Regina system');
    assert.equal(placeLine(records[id(1)]), 'Spinward Marches 1910 · Regina A-IV');
    assert.equal(placeLine(records[id(2)]), 'With another record');

    const names = (list) => list.map((record) => record.name);
    assert.deepEqual(names(recordsHere(records, REGINA, null)), ['Bay 4', 'Broker Sol', 'Captain Voss', 'Far Margin']);
    assert.deepEqual(names(recordsHere(records, REGINA, 'w3')), ['Captain Voss', 'Far Margin']);
    assert.deepEqual(names(recordsHere(records, REGINA, 'w3m1')), ['Broker Sol']);
    assert.deepEqual(names(recordsHere(records, REGINA, 'w9')), []);
    // The same body key in another system is another body.
    assert.deepEqual(names(recordsHere(records, 'Spinward_Marches/2007', 'w3')), ['Elsewhere']);
    assert.deepEqual(names(recordsHere(records, 'Spinward_Marches/0101', null)), []);
    assert.deepEqual(bodyCounts(records, REGINA), { w3: 2, w3m1: 1 });
    assert.deepEqual(bodyCounts(records, 'Spinward_Marches/0101'), {});

    assert.equal(withinSystem(resolvePlace(id(3), live), 'Regina'), 'In this system');
    assert.equal(withinSystem(resolvePlace(id(1), live), 'Regina'), 'A-IV');
    assert.equal(withinSystem({ hexKey: REGINA, bodyKey: 'w3', label: 'Regina' }, 'Regina'), 'Regina');
    assert.equal(withinSystem({ hexKey: REGINA, bodyKey: 'w3', label: '' }, 'Regina'), 'On a world here');
});

test('a body anchor is checked against the bodies the system has now', () => {
    const place = { hexKey: REGINA, bodyKey: 'w3', label: 'Regina A-IV' };
    assert.equal(bodyMatched(place, ['s0', 'w0', 'w3']), true);
    assert.equal(bodyMatched(place, ['s0', 'w0']), false);
    assert.equal(bodyMatched(place, null), true, 'nothing is said against it until the bodies are known');
    assert.equal(bodyMatched({ hexKey: REGINA, bodyKey: null, label: 'Regina' }, []), true);
});

test('picking a system: the map or the omnibox hands it over, once, to whoever asked', () => {
    endPick();
    assert.equal(picking.value, false);
    assert.equal(offerSystem({ slug: 'Spinward_Marches', hex: '1910', name: 'Regina' }), false, 'with no pick on, the system opens as usual');
    const taken = [];
    let cancelled = 0;
    beginPick((system) => { taken.push(system.name); endPick(); }, () => { cancelled += 1; });
    assert.equal(picking.value, true);
    assert.equal(offerSystem({ slug: 'Spinward_Marches', hex: '1910', name: 'Regina' }), true);
    assert.deepEqual(taken, ['Regina']);
    assert.equal(picking.value, false);
    assert.equal(offerSystem({ slug: 'Spinward_Marches', hex: '2007', name: 'Roup' }), false);
    // Esc on the map ends a pick and tells the one who started it.
    beginPick(() => {}, () => { cancelled += 1; });
    cancelPick();
    assert.equal(cancelled, 1);
    assert.equal(picking.value, false);
    cancelPick();
    assert.equal(cancelled, 1, 'there is nothing left to cancel');
    // A second pick ends the first.
    let first = 0;
    beginPick(() => {}, () => { first += 1; });
    beginPick((system) => { taken.push(system.name); });
    assert.equal(first, 1);
    assert.equal(picking.value, true);
    offerSystem({ slug: 'Spinward_Marches', hex: '2007', name: 'Roup' });
    assert.deepEqual(taken, ['Regina', 'Roup']);
    endPick();
});

test('the locator: one record at a time, and its line keeps its height when its button has gone', () => {
    stopLocate();
    assert.equal(locating.recordId, null);
    let y = 240;
    const turn = locating.turn;
    startLocate(id(1), REGINA, () => y);
    assert.deepEqual([locating.recordId, locating.hexKey, locating.turn], [id(1), REGINA, turn + 1]);
    assert.equal(locateOriginY(), 240);
    y = 300;
    assert.equal(locateOriginY(), 300);
    y = null;
    assert.equal(locateOriginY(), 300, 'the last height is kept');
    // Asked for again, it is a new turn: the map flies again.
    startLocate(id(1), REGINA, () => 120);
    assert.equal(locating.turn, turn + 2);
    startLocate(id(2), 'Spinward_Marches/2007', () => 80);
    assert.equal(locating.recordId, id(2));
    assert.equal(locateOriginY(), 80);
    stopLocate();
    assert.deepEqual([locating.recordId, locating.hexKey], [null, '']);
    assert.equal(locateOriginY(), 80);
});

test('a record made at a place, and a place set, moved and cleared, against the store', () => {
    globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
    resetCampaign();
    forgetDeleted();
    clearToasts();
    transport.schedule = () => () => {};
    campaign.universeId = 'un_test';
    campaign.status = 'ready';

    const here = systemAnchor(REGINA, 'Regina', { key: 'w3', name: 'Regina A-IV' });
    const made = createRecord('place', here);
    assert.deepEqual(campaign.records[made].anchor, here);
    assert.deepEqual(recordsHere(campaign.records, REGINA, 'w3').map((record) => record.id), [made]);

    assert.equal(saveRecord(made, { anchor: { ...here } }), false, 'the same place sends nothing');
    assert.equal(saveRecord(made, { anchor: systemAnchor(REGINA, 'Regina', null) }), true);
    assert.deepEqual(campaign.records[made].anchor, { kind: 'system', hexKey: REGINA, locationLabel: 'Regina' });
    assert.deepEqual(recordsHere(campaign.records, REGINA, 'w3'), []);
    assert.equal(recordsHere(campaign.records, REGINA, null).length, 1);
    assert.equal(saveRecord(made, { anchor: null }), true);
    assert.equal(campaign.records[made].anchor, null);
    assert.equal(recordsHere(campaign.records, REGINA, null).length, 0);
    resetCampaign();
});
