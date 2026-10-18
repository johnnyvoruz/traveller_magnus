import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resetCampaign } from '../../apps/web/src/campaign/commit.ts';
import { pending } from '../../apps/web/src/campaign/commit.ts';
import { POLL_MS, stopCampaignPoll, watchCampaignPanel } from '../../apps/web/src/campaign/poll.ts';
import { campaign, transport } from '../../apps/web/src/campaign/store.ts';
import { toasts } from '../../apps/web/src/shell/toast.ts';

const memory = new Map();
globalThis.localStorage = {
    getItem(key) { return memory.has(key) ? memory.get(key) : null; },
    setItem(key, value) { memory.set(String(key), String(value)); },
    removeItem(key) { memory.delete(key); },
};

const listeners = [];
globalThis.document = {
    visibilityState: 'visible',
    addEventListener(_type, fn) { listeners.push(fn); },
    removeEventListener(_type, fn) {
        const index = listeners.indexOf(fn);
        if (index >= 0) listeners.splice(index, 1);
    },
};

const HELD = 'cr_11111111-1111-1111-1111-111111111111';
const NEXT = 'cr_22222222-2222-2222-2222-222222222222';
const STAMP = '2026-10-04T00:00:00.000Z';

function jsonResponse(status, body) {
    return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function record(id, over = {}) {
    return {
        id,
        type: 'place',
        kind: '',
        name: id === HELD ? 'Downport' : 'Startown',
        summary: '',
        details: '',
        tags: [],
        anchor: null,
        when: null,
        visibility: 'players',
        playerNotes: null,
        sheet: null,
        status: null,
        images: null,
        provenance: null,
        rev: 1,
        createdAt: STAMP,
        updatedAt: STAMP,
        deleted: false,
        ...over,
    };
}

function settings() {
    return {
        party: { vesselIds: [], aboard: {}, memberIds: [], anchor: null },
        kinds: {},
        calendar: { dateFormat: 'imperial' },
        rev: 0,
    };
}

function page(records, over = {}) {
    return {
        records,
        links: [],
        journal: [],
        settings: settings(),
        clock: null,
        seq: 5,
        done: true,
        ...over,
    };
}

function ready(role) {
    resetCampaign();
    stopCampaignPoll();
    listeners.splice(0, listeners.length);
    document.visibilityState = 'visible';
    campaign.role = role;
    campaign.status = 'ready';
    campaign.universeId = 'uni-play';
    campaign.seq = 4;
    campaign.settings = settings();
    campaign.records[HELD] = record(HELD);
}

function timersOf() {
    const timers = [];
    transport.schedule = (fn, ms) => {
        const item = { fn, ms, dead: false };
        timers.push(item);
        return () => { item.dead = true; };
    };
    return timers;
}

test('a poll merges the next page and leaves the list in place', async () => {
    ready('owner');
    const timers = timersOf();
    let url = '';
    transport.fetch = async (target) => {
        url = String(target);
        return jsonResponse(200, { ok: true, data: page([record(NEXT)]) });
    };
    watchCampaignPanel(true);
    assert.equal(timers.length, 1);
    assert.equal(timers[0].ms, POLL_MS);
    assert.equal(POLL_MS, 30000);
    await timers[0].fn();
    assert.match(url, /\/api\/universes\/uni-play\/campaign\?after=4&limit=1000/);
    assert.equal(campaign.records[HELD].name, 'Downport');
    assert.equal(campaign.records[NEXT].name, 'Startown');
    assert.equal(campaign.seq, 5);
    assert.equal(toasts.length, 0);
    assert.equal(timers.length, 2);
    assert.equal(timers[1].dead, false);
    watchCampaignPanel(false);
    assert.equal(timers[1].dead, true);
    stopCampaignPoll();
});

test('the timer stops when the tab is hidden', async () => {
    ready('player');
    const timers = timersOf();
    let calls = 0;
    transport.fetch = async () => {
        calls += 1;
        return jsonResponse(200, { ok: true, data: page([], { visible: { records: [HELD], links: [], journal: [] } }) });
    };
    watchCampaignPanel(true);
    assert.equal(timers.length, 1);
    document.visibilityState = 'hidden';
    for (const fn of [...listeners]) fn();
    assert.equal(timers[0].dead, true);
    assert.equal(timers.length, 1);
    await timers[0].fn();
    assert.equal(calls, 0);
    document.visibilityState = 'visible';
    for (const fn of [...listeners]) fn();
    assert.equal(timers.length, 2);
    assert.equal(timers[1].dead, false);
    stopCampaignPoll();
});

test('a 403 clears a player and the timer stops', async () => {
    ready('player');
    const timers = timersOf();
    let calls = 0;
    transport.fetch = async () => {
        calls += 1;
        return jsonResponse(403, { ok: false, error: { code: 'not_a_member', message: 'archived' } });
    };
    watchCampaignPanel(true);
    await timers[0].fn();
    assert.equal(calls, 1);
    assert.equal(campaign.status, 'gone');
    assert.equal(campaign.records[HELD], undefined);
    assert.equal(timers.length, 1);
    assert.equal(toasts.length, 0);
    stopCampaignPoll();
});

test('a 403 stops an owner poll and leaves the rows', async () => {
    ready('owner');
    const timers = timersOf();
    transport.fetch = async () => jsonResponse(403, { ok: false, error: { code: 'forbidden', message: 'no' } });
    watchCampaignPanel(true);
    await timers[0].fn();
    assert.equal(campaign.status, 'ready');
    assert.equal(campaign.records[HELD].name, 'Downport');
    assert.equal(timers.length, 1);
    assert.equal(toasts.length, 0);
    stopCampaignPoll();
});

test('a save in flight waits, and both roles use the same wait', () => {
    ready('player');
    const timers = timersOf();
    pending.value = true;
    watchCampaignPanel(true);
    timers[0].fn();
    assert.equal(timers.length, 2);
    pending.value = false;
    stopCampaignPoll();
    ready('owner');
    const again = timersOf();
    watchCampaignPanel(true);
    assert.equal(again[0].ms, POLL_MS);
    watchCampaignPanel(false);
    assert.equal(again[0].dead, true);
    stopCampaignPoll();
});
