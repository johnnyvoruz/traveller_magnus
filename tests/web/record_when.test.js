/**
 * A record's date: the typed start and optional end, the campaign date copied onto the
 * record, and the write through saveRecord. The campaign clock is never moved.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { CampaignRecord, RecordChange } from '@voyage/shared';
import { resetCampaign, pending } from '../../apps/web/src/campaign/commit.ts';
import { campaign, transport } from '../../apps/web/src/campaign/store.ts';
import { totalDays } from '../../apps/web/src/orbit/clock.ts';
import { createRecord, saveRecord } from '../../apps/web/src/workspace/actions.ts';
import { edited, newRecord } from '../../apps/web/src/workspace/records.ts';
import {
    DATE_HINT, NO_CLOCK, ORDER_HINT, endFromClock, sameRecordWhen, whenFromClock, whenFromEnd, whenFromStart,
} from '../../apps/web/src/workspace/record_when.ts';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const page = fs.readFileSync(path.join(root, 'apps/web/src/workspace/RecordPage.vue'), 'utf8');
const view = fs.readFileSync(path.join(root, 'apps/web/src/workspace/RecordWhen.vue'), 'utf8');
const STAMP = '2026-10-11T00:00:00.000Z';
const id = 'cr_00000001-0000-4000-8000-000000000000';
const start = { year: 1105, day: 40 };
const end = { year: 1105, day: 48 };

test('a typed date, a cleared date, and an end that has to follow the start', () => {
    assert.deepEqual(whenFromStart('040-1105', undefined), { when: { start } });
    assert.deepEqual(whenFromStart('40/1105', undefined), { when: { start } });
    assert.deepEqual(whenFromStart('040 1105', end), { when: { start, end } });
    assert.deepEqual(whenFromStart('   ', end), { when: null });
    assert.deepEqual(whenFromStart('40', undefined), { error: 'bad' });
    assert.deepEqual(whenFromStart('000-1105', undefined), { error: 'bad' });
    assert.deepEqual(whenFromStart('366-1105', undefined), { error: 'bad' });
    assert.deepEqual(whenFromStart('040-1106', end), { error: 'order' });
    assert.deepEqual(whenFromEnd('048-1105', start), { when: { start, end } });
    assert.deepEqual(whenFromEnd('040-1105', start), { when: { start, end: start } });
    assert.deepEqual(whenFromEnd('', start), { when: { start } });
    assert.deepEqual(whenFromEnd('039-1105', start), { error: 'order' });
    assert.deepEqual(whenFromEnd('nope', start), { error: 'bad' });
    assert.equal(DATE_HINT.includes('DDD-YYYY'), true);
    assert.equal(ORDER_HINT.includes('on or after'), true);
    assert.equal(sameRecordWhen({ start, end }, { start: { ...start }, end: { ...end } }), true);
    assert.equal(sameRecordWhen({ start, end }, { start }), false);
    assert.equal(sameRecordWhen(null, null), true);
});

test('the campaign date is copied onto the record and the clock is not a writer here', () => {
    const days = totalDays(1105, 40);
    assert.deepEqual(whenFromClock(days, undefined), { when: { start } });
    assert.deepEqual(whenFromClock(days + 0.5, end), { when: { start, end } });
    assert.deepEqual(whenFromClock(totalDays(1106, 1), end), { error: 'order' });
    assert.deepEqual(endFromClock(totalDays(1105, 48), start), { when: { start, end } });
    assert.deepEqual(endFromClock(totalDays(1105, 39), start), { error: 'order' });
    assert.equal(NO_CLOCK, 'No campaign date yet.');
    const record = { ...newRecord('job', id, STAMP), rev: 2, when: { start } };
    const change = edited(record, { when: { start, end } }, STAMP);
    assert.equal(RecordChange.safeParse(change).success, true);
    assert.equal(CampaignRecord.safeParse({ ...record, when: change.when, rev: 2 }).success, true);
});

test('saveRecord stores when and leaves the campaign clock where it was', () => {
    globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
    resetCampaign();
    transport.schedule = () => () => {};
    campaign.universeId = 'un_test';
    campaign.status = 'ready';
    const days = totalDays(1105, 2);
    campaign.clock = { days, rev: 3 };
    const made = createRecord('person');
    assert.equal(campaign.records[made].when, null);
    assert.equal(saveRecord(made, { when: { start } }), true);
    assert.deepEqual(campaign.records[made].when, { start });
    assert.equal(saveRecord(made, { when: { start: { ...start } } }), false);
    assert.equal(saveRecord(made, { when: null }), true);
    assert.equal(campaign.records[made].when, null);
    assert.equal(campaign.clock.days, days);
    assert.equal(campaign.clock.rev, 3);
    assert.equal(pending.value, true);
});

test('the date field sits on every record page and does not move the clock', () => {
    const tag = page.match(/<RecordWhen\b[^>]*>/);
    assert.ok(tag, 'RecordPage renders the date field');
    assert.doesNotMatch(tag[0], /v-if/);
    assert.match(page, /@save="setWhen"/);
    assert.match(page, /class="rec-ident"/);
    assert.doesNotMatch(page, /setCampaignDate/);
    assert.doesNotMatch(view, /setCampaignDate/);
    assert.match(view, /No date/);
    assert.match(view, /Set a date/);
    assert.match(view, /Use the campaign date/);
    assert.match(view, /Add an end date/);
    assert.match(view, /aria-label="Clear the date"/);
    assert.match(view, /aria-label="Date, as DDD-YYYY"/);
    assert.match(view, /aria-label="End date, as DDD-YYYY"/);
    assert.match(view, /placeholder="DDD-YYYY"/);
    assert.match(view, /inputmode="numeric"/);
    assert.match(view, /DATE_HINT/);
    assert.match(view, /ORDER_HINT/);
    assert.match(view, /NO_CLOCK/);
});
