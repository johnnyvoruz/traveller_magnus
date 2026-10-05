/**
 * A deck plan is stored on a vessel's sheet through the campaign commit queue.
 * The shared schema keeps sheet as unknown JSON. These tests fail if a parse
 * drops deckPlan. Nothing is sent: the flush timer is held.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CAMPAIGN_LIMITS, CampaignRecord } from '@voyage/shared';
import { importDeckPlan, removeDeckPlan } from '../../apps/web/src/deckplan/attach.ts';
import { pending, resetCampaign } from '../../apps/web/src/campaign/commit.ts';
import { campaign, transport } from '../../apps/web/src/campaign/store.ts';
import { newRecord } from '../../apps/web/src/workspace/records.ts';

const STAMP = '2026-10-04T12:00:00.000Z';
const id = (n) => 'cr_' + String(n).padStart(8, '0') + '-0000-4000-8000-000000000000';

const plan = {
    meta: 'Traveller Geomorph Ship',
    name: 'Hand Sample',
    parts: [{ code: 'SE-239', corner: [0, 0], rotation: 90 }],
};

function setup() {
    globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
    resetCampaign();
    transport.schedule = () => () => {};
    campaign.universeId = 'un_test';
    campaign.status = 'ready';
}

function hold(record) {
    campaign.records[record.id] = record;
    return record;
}

test('CampaignRecord keeps sheet.deckPlan, and a JSON round trip keeps it too', () => {
    const record = {
        ...newRecord('vessel', id(1), STAMP),
        sheet: { hull: 'A', deckPlan: plan },
    };
    const parsed = CampaignRecord.safeParse(record);
    assert.equal(parsed.success, true);
    assert.equal(parsed.data.sheet.hull, 'A');
    assert.deepEqual(parsed.data.sheet.deckPlan, plan);
    // apps/api jsonText / parseJson are JSON.stringify and JSON.parse. Neither drops keys.
    assert.deepEqual(JSON.parse(JSON.stringify(parsed.data.sheet)), { hull: 'A', deckPlan: plan });
    assert.equal(CAMPAIGN_LIMITS.patchBytes, 1_000_000);
});

test('importDeckPlan stores the plan on a vessel and keeps the rest of the sheet', () => {
    setup();
    const vessel = hold({ ...newRecord('vessel', id(2), STAMP), name: 'Far Margin', rev: 3, sheet: { hull: 'A' } });
    const result = importDeckPlan(vessel.id, JSON.stringify(plan));
    assert.deepEqual(result, { ok: true });
    const stored = campaign.records[vessel.id];
    assert.equal(stored.sheet.hull, 'A');
    assert.deepEqual(stored.sheet.deckPlan, plan);
    assert.equal(stored.name, 'Far Margin');
    assert.equal(stored.rev, 3);
    assert.notEqual(stored.updatedAt, STAMP);
    assert.equal(pending.value, true);
    const round = CampaignRecord.safeParse(stored);
    assert.equal(round.success, true);
    assert.deepEqual(round.data.sheet.deckPlan, plan);
    resetCampaign();
});

test('a person cannot take a deck plan', () => {
    setup();
    const person = hold({ ...newRecord('person', id(3), STAMP), name: 'Idris', rev: 2, sheet: { notes: 'pilot' } });
    const before = JSON.stringify(person);
    const result = importDeckPlan(person.id, JSON.stringify(plan));
    assert.deepEqual(result, { ok: false, message: 'A deck plan can only be added to a vessel.' });
    assert.equal(JSON.stringify(campaign.records[person.id]), before);
    assert.equal(pending.value, false);
    resetCampaign();
});

test('a file that is not a shipyard plan is refused', () => {
    setup();
    const vessel = hold({ ...newRecord('vessel', id(4), STAMP), rev: 1 });
    assert.deepEqual(importDeckPlan(vessel.id, '{'), { ok: false, message: 'This file is not JSON.' });
    assert.equal(campaign.records[vessel.id].sheet, null);
    assert.deepEqual(
        importDeckPlan(vessel.id, JSON.stringify({ meta: 'other', name: 'No', parts: [] })),
        { ok: false, message: 'This is not a Geomorph Shipyard file.' },
    );
    assert.equal(campaign.records[vessel.id].sheet, null);
    assert.equal(pending.value, false);
    resetCampaign();
});

test('a sheet that is not a document is left alone', () => {
    setup();
    const vessel = hold({ ...newRecord('vessel', id(5), STAMP), rev: 1, sheet: ['not', 'a', 'document'] });
    const result = importDeckPlan(vessel.id, JSON.stringify(plan));
    assert.deepEqual(result, { ok: false, message: "This vessel's sheet is not a document, so the plan was not saved." });
    assert.deepEqual(campaign.records[vessel.id].sheet, ['not', 'a', 'document']);
    resetCampaign();
});

test('a plan that does not fit the 1 MB patch is not saved', () => {
    setup();
    const vessel = hold({ ...newRecord('vessel', id(6), STAMP), rev: 1, sheet: { hull: 'A' } });
    const before = JSON.stringify(campaign.records[vessel.id]);
    const huge = {
        meta: 'Traveller Geomorph Ship',
        name: 'Big',
        parts: [{ code: 'X'.repeat(1_000_000), corner: [0, 0], rotation: 0 }],
    };
    const result = importDeckPlan(vessel.id, JSON.stringify(huge));
    assert.equal(result.ok, false);
    assert.equal(result.message, 'This deck plan is too large to save. It has to fit in one update.');
    assert.equal(JSON.stringify(campaign.records[vessel.id]), before);
    assert.equal(pending.value, false);
    resetCampaign();
});

test('removeDeckPlan clears the plan and leaves other sheet keys', () => {
    setup();
    const vessel = hold({ ...newRecord('vessel', id(7), STAMP), rev: 4, sheet: { hull: 'A' } });
    assert.equal(importDeckPlan(vessel.id, JSON.stringify(plan)).ok, true);
    const removed = removeDeckPlan(vessel.id);
    assert.deepEqual(removed, { ok: true });
    assert.deepEqual(campaign.records[vessel.id].sheet, { hull: 'A' });
    assert.deepEqual(removeDeckPlan(vessel.id), { ok: false, message: 'This vessel has no deck plan.' });
    assert.deepEqual(campaign.records[vessel.id].sheet, { hull: 'A' });
    resetCampaign();
});

test('removing the only sheet key stores null', () => {
    setup();
    const vessel = hold(newRecord('vessel', id(8), STAMP));
    assert.equal(importDeckPlan(vessel.id, JSON.stringify(plan)).ok, true);
    assert.equal(removeDeckPlan(vessel.id).ok, true);
    assert.equal(campaign.records[vessel.id].sheet, null);
    resetCampaign();
});

test('a missing record and a deleted vessel are refused', () => {
    setup();
    assert.deepEqual(importDeckPlan(id(9), JSON.stringify(plan)), { ok: false, message: 'That record is not in this campaign.' });
    const vessel = hold({ ...newRecord('vessel', id(10), STAMP), deleted: true, rev: 2, sheet: { deckPlan: plan } });
    const before = JSON.stringify(vessel);
    assert.deepEqual(removeDeckPlan(vessel.id), { ok: false, message: 'This vessel has been deleted.' });
    assert.equal(JSON.stringify(campaign.records[vessel.id]), before);
    resetCampaign();
});
