/**
 * The record screens' logic (apps/web/src/workspace/records.ts and actions.ts, with
 * shell/toast.ts): the nine types, the list's filter and counts, what a create, an edit, a
 * delete and a restore send, and the delete's undo.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CAMPAIGN_LIMITS, CAMPAIGN_RECORD_TYPES, CampaignRecord, RecordChange } from '@voyage/shared';
import { commit, pending, resetCampaign } from '../../apps/web/src/campaign/commit.ts';
import { campaign, transport } from '../../apps/web/src/campaign/store.ts';
import { TOAST_ACTION_MS, TOAST_MS, clearToasts, dismissToast, showToast, toasts } from '../../apps/web/src/shell/toast.ts';
import {
    createRecord, deleteRecord, forgetDeleted, justCreated, recentlyDeleted, restoreRecord, saveRecord,
} from '../../apps/web/src/workspace/actions.ts';
import {
    RECORD_TYPES, addTag, cleanDetails, cleanName, cleanSummary, cleanTag, created, edited, filterRecords, liveRecords,
    matches, newRecord, placeLine, removed, restored, typeCounts, typeInfo, unchanged,
} from '../../apps/web/src/workspace/records.ts';

const STAMP = '2026-10-04T12:00:00.000Z';
const id = (n) => 'cr_' + String(n).padStart(8, '0') + '-0000-4000-8000-000000000000';
const make = (n, type, name, over = {}) => ({ ...newRecord(type, id(n), STAMP), name, rev: 1, ...over });

test('the nine types, each with its words and its icon', () => {
    assert.deepEqual(RECORD_TYPES.map((info) => info.type), [...CAMPAIGN_RECORD_TYPES]);
    assert.equal(RECORD_TYPES.length, 9);
    assert.deepEqual(typeInfo('person'), { type: 'person', one: 'Person', a: 'a person', many: 'People', icon: 'user' });
    assert.equal(typeInfo('organization').a, 'an organization');
    assert.equal(typeInfo('vessel').many, 'Vessels');
    assert.equal(new Set(RECORD_TYPES.map((info) => info.icon)).size, 9, 'no two types share an icon');
    assert.equal(typeInfo('nonsense').type, 'person');
});

test('a new record is a whole, valid row with a name to be seen by', () => {
    for (const type of CAMPAIGN_RECORD_TYPES) {
        const record = newRecord(type, id(1), STAMP);
        assert.equal(CampaignRecord.safeParse(record).success, true, type);
        assert.equal(record.name, 'New ' + typeInfo(type).one.toLowerCase());
        assert.equal(record.anchor, null);
        assert.equal(record.visibility, 'referee');
        assert.equal(record.rev, 0);
        assert.equal(RecordChange.safeParse(created(record)).success, true);
        assert.equal(created(record).baseRev, 0);
    }
});

test('the list: live records only, one type or all, narrowed by what is typed, by name', () => {
    const records = {
        a: make(1, 'person', 'Captain Idris Voss', { summary: 'Master of the Far Margin', tags: ['patron'] }),
        b: make(2, 'place', 'Bay 4 Drydock', { details: 'Voss berths here.' }),
        c: make(3, 'person', 'broker Hana Sol'),
        d: make(4, 'item', 'Amber Berth tab', { deleted: true }),
        e: make(5, 'person', 'Åsa 10'),
        f: make(6, 'person', 'Åsa 9'),
    };
    const live = liveRecords(records);
    assert.equal(live.length, 5);
    assert.deepEqual(typeCounts(live), { all: 5, person: 4, place: 1, business: 0, organization: 0, job: 0, event: 0, item: 0, note: 0, vessel: 0 });
    const names = (filter) => filterRecords(live, filter).map((record) => record.name);
    assert.deepEqual(names({ type: 'all', query: '' }), ['Åsa 9', 'Åsa 10', 'Bay 4 Drydock', 'broker Hana Sol', 'Captain Idris Voss']);
    assert.deepEqual(names({ type: 'person', query: '' }), ['Åsa 9', 'Åsa 10', 'broker Hana Sol', 'Captain Idris Voss']);
    // The search reads the name, the summary, the details and the tags; case is ignored; every word must be there.
    assert.deepEqual(names({ type: 'all', query: 'voss' }), ['Bay 4 Drydock', 'Captain Idris Voss']);
    assert.deepEqual(names({ type: 'person', query: 'VOSS' }), ['Captain Idris Voss']);
    assert.deepEqual(names({ type: 'all', query: 'far master' }), ['Captain Idris Voss']);
    assert.deepEqual(names({ type: 'all', query: 'patron' }), ['Captain Idris Voss']);
    assert.deepEqual(names({ type: 'all', query: 'nobody' }), []);
    assert.equal(matches(records.a, '   '), true);
});

test('where a record is, in words', () => {
    assert.equal(placeLine(make(1, 'person', 'A')), 'Nowhere in particular');
    assert.equal(placeLine(make(1, 'person', 'A', { anchor: { kind: 'system', hexKey: 'Spinward_Marches/1910' } })), 'Spinward Marches 1910');
    assert.equal(placeLine(make(1, 'person', 'A', { anchor: { kind: 'system', hexKey: 'Spinward_Marches/1910', bodyKey: 'w4m1', locationLabel: 'Regina' } })), 'Spinward Marches 1910 · Regina');
    assert.equal(placeLine(make(1, 'person', 'A', { anchor: { kind: 'record', id: id(2) } })), 'With another record');
});

test('text is cleaned and held to the limits before it is stored', () => {
    assert.equal(cleanName('  Captain   Idris\tVoss \n'), 'Captain Idris Voss');
    assert.equal(cleanName('   '), '');
    assert.equal(cleanName('x'.repeat(500)).length, CAMPAIGN_LIMITS.name);
    assert.equal(cleanSummary(' two\nlines  here '), 'two lines here');
    assert.equal(cleanSummary('y'.repeat(900)).length, CAMPAIGN_LIMITS.summary);
    assert.equal(cleanDetails('one  \r\ntwo\t\n\nthree  '), 'one\ntwo\n\nthree');
    assert.equal(cleanDetails('z'.repeat(30000)).length, CAMPAIGN_LIMITS.details);
    assert.equal(cleanTag('  house,  cast '), 'house cast');
    assert.equal(cleanTag('t'.repeat(90)).length, CAMPAIGN_LIMITS.tag);
    assert.deepEqual(addTag(['patron'], ' Debt '), ['patron', 'Debt']);
    assert.deepEqual(addTag(['patron'], 'PATRON'), ['patron'], 'no repeat, whatever the case');
    assert.deepEqual(addTag(['patron'], '  ,  '), ['patron']);
    const full = Array.from({ length: CAMPAIGN_LIMITS.tags }, (_, i) => 't' + i);
    assert.deepEqual(addTag(full, 'one more'), full);
});

test('the changes a screen sends: whole rows on the revision held, and a tombstone for a delete', () => {
    const record = make(1, 'person', 'Captain Idris Voss', { rev: 4, tags: ['patron'] });
    Object.freeze(record.tags);
    Object.freeze(record);
    const change = edited(record, { summary: 'Master of the Far Margin', tags: ['patron', 'debt'] }, '2026-10-05T00:00:00.000Z');
    assert.equal(RecordChange.safeParse(change).success, true);
    assert.equal(change.baseRev, 4);
    assert.equal(change.rev, 4);
    assert.equal(change.name, 'Captain Idris Voss');
    assert.equal(change.summary, 'Master of the Far Margin');
    assert.deepEqual(change.tags, ['patron', 'debt']);
    assert.equal(change.updatedAt, '2026-10-05T00:00:00.000Z');
    assert.equal(change.createdAt, STAMP);
    assert.deepEqual(removed(record), { id: record.id, baseRev: 4, deleted: true });
    const back = restored({ ...record, deleted: true, rev: 5 }, '2026-10-06T00:00:00.000Z');
    assert.equal(back.deleted, false);
    assert.equal(back.baseRev, 5);
    assert.equal(RecordChange.safeParse(back).success, true);
    // A patch that changes nothing is not sent.
    assert.equal(unchanged(record, { name: 'Captain Idris Voss', tags: ['patron'] }), true);
    assert.equal(unchanged(record, { tags: ['patron', 'debt'] }), false);
    assert.equal(unchanged(record, { type: 'place' }), false);
});

test('create, edit, delete and undo against the store, with nothing sent yet', () => {
    globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
    resetCampaign();
    forgetDeleted();
    clearToasts();
    // The queue is held: these are the store's own changes, before any request.
    transport.schedule = () => () => {};
    campaign.universeId = 'un_test';
    campaign.status = 'ready';

    const made = createRecord('person');
    assert.match(made, /^cr_[0-9a-f-]{36}$/);
    assert.equal(justCreated.value, made);
    assert.equal(campaign.records[made].name, 'New person');
    assert.equal(pending.value, true);

    assert.equal(saveRecord(made, { name: 'Captain Idris Voss' }), true);
    assert.equal(campaign.records[made].name, 'Captain Idris Voss');
    assert.equal(saveRecord(made, { name: 'Captain Idris Voss' }), false, 'an unchanged field sends nothing');
    assert.equal(saveRecord('cr_missing', { name: 'x' }), false);

    // Delete: gone from the list, kept as a tombstone, said in a toast that can undo it.
    assert.equal(deleteRecord(made), true);
    assert.equal(campaign.records[made].deleted, true);
    assert.equal(liveRecords(campaign.records).length, 0);
    assert.deepEqual(recentlyDeleted.map((item) => [item.id, item.name, item.type]), [[made, 'Captain Idris Voss', 'person']]);
    assert.equal(toasts.length, 1);
    assert.equal(toasts[0].message, 'Deleted Captain Idris Voss.');
    assert.equal(toasts[0].action.label, 'Undo');
    assert.equal(toasts[0].ms, TOAST_ACTION_MS);
    assert.equal(deleteRecord(made), false, 'it cannot be deleted twice');
    assert.equal(saveRecord(made, { name: 'x' }), false, 'a deleted record is not edited');

    // Undo, from the toast: back as it was, and off the recently deleted list.
    toasts[0].action.run();
    assert.equal(campaign.records[made].deleted, false);
    assert.equal(campaign.records[made].name, 'Captain Idris Voss');
    assert.equal(recentlyDeleted.length, 0);
    assert.equal(restoreRecord(made), false, 'there is nothing left to restore');

    // Deleted again and restored from "Recently deleted" instead.
    deleteRecord(made);
    assert.equal(recentlyDeleted.length, 1);
    assert.equal(restoreRecord(made), true);
    assert.equal(campaign.records[made].deleted, false);

    // Signing out forgets the session's list.
    deleteRecord(made);
    forgetDeleted();
    assert.equal(recentlyDeleted.length, 0);
    assert.equal(justCreated.value, null);
    resetCampaign();
    void commit;
});

test('toasts: at most two, an action makes one stay longer, and each can be dismissed', () => {
    clearToasts();
    const first = showToast('one');
    assert.deepEqual([toasts[0].message, toasts[0].action, toasts[0].ms], ['one', null, TOAST_MS]);
    let ran = 0;
    const second = showToast('two', { action: { label: 'Undo', run: () => { ran += 1; } } });
    showToast('three', { ms: 1234 });
    assert.deepEqual(toasts.map((toast) => toast.message), ['two', 'three']);
    assert.equal(toasts[0].ms, TOAST_ACTION_MS);
    assert.equal(toasts[1].ms, 1234);
    toasts[0].action.run();
    assert.equal(ran, 1);
    dismissToast(first);
    assert.equal(toasts.length, 2, 'dismissing one that has gone changes nothing');
    dismissToast(second);
    assert.deepEqual(toasts.map((toast) => toast.message), ['three']);
    clearToasts();
    assert.equal(toasts.length, 0);
});
