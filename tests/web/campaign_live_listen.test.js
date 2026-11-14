/**
 * BV1b (findings/live_records_plan.md): the campaign panel listens. A socket to B's `GET .../campaign/live`
 * while the panel is open; `{ t: 'changed', seq }` pulls the same read the poll makes, unless a save is in
 * flight; no thirty-second timer while the socket is up; two failed upgrades, or a blocked socket, fall back to
 * the timer; a hidden tab pulls nothing and, shown again, pulls once; closing the panel closes the socket.
 */
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { pending, resetCampaign } from '../../apps/web/src/campaign/commit.ts';
import { campaignLiveUrl, campaignSocket, POLL_MS, RETRY_MS, SAVE_WAIT_MS, stopCampaignPoll, watchCampaignPanel } from '../../apps/web/src/campaign/poll.ts';
import { campaign, transport } from '../../apps/web/src/campaign/store.ts';

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
        const at = listeners.indexOf(fn);
        if (at >= 0) listeners.splice(at, 1);
    },
};
const setVisible = (visible) => {
    document.visibilityState = visible ? 'visible' : 'hidden';
    for (const fn of [...listeners]) fn();
};

const HELD = 'cr_11111111-1111-1111-1111-111111111111';
const NEXT = 'cr_22222222-2222-2222-2222-222222222222';
const STAMP = '2026-10-04T00:00:00.000Z';
const record = (id) => ({ id, type: 'place', kind: '', name: id === HELD ? 'Downport' : 'Startown', summary: '', details: '', tags: [], anchor: null, when: null, visibility: 'players', playerNotes: null, sheet: null, status: null, images: null, provenance: null, rev: 1, createdAt: STAMP, updatedAt: STAMP, deleted: false });
const settings = () => ({ party: { vesselIds: [], aboard: {}, memberIds: [], anchor: null }, kinds: {}, calendar: { dateFormat: 'imperial' }, rev: 0 });

let timers = [];
let sockets = [];
let reads = [];

function ready() {
    resetCampaign();
    stopCampaignPoll();
    listeners.splice(0, listeners.length);
    document.visibilityState = 'visible';
    campaign.role = 'owner';
    campaign.status = 'ready';
    campaign.universeId = 'uni-play';
    campaign.seq = 4;
    campaign.settings = settings();
    campaign.records[HELD] = record(HELD);
    timers = [];
    sockets = [];
    reads = [];
    transport.schedule = (fn, ms) => {
        const item = { fn, ms, dead: false };
        timers.push(item);
        return () => { item.dead = true; };
    };
    transport.fetch = async (url) => {
        reads.push(String(url));
        const body = { data: { records: [record(NEXT)], links: [], journal: [], settings: settings(), clock: null, seq: 9, done: true } };
        return { ok: true, status: 200, json: async () => body };
    };
    campaignSocket.open = (url, handlers) => {
        const one = { url, handlers, closed: false, close() { this.closed = true; } };
        sockets.push(one);
        return one;
    };
}

const live = (ms) => timers.filter((item) => !item.dead && item.ms === ms);
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
    pending.value = false;
    stopCampaignPoll();
});

test('the socket opens with the panel; up, it turns the timer off; a change pulls the same read', async () => {
    ready();
    watchCampaignPanel(true);
    assert.equal(sockets.length, 1);
    assert.equal(sockets[0].url, '/api/universes/uni-play/campaign/live');
    assert.equal(campaignLiveUrl('a b'), '/api/universes/a%20b/campaign/live');
    assert.equal(live(POLL_MS).length, 1, 'while it connects, the timer stands');
    sockets[0].handlers.onOpen();
    assert.equal(live(POLL_MS).length, 0, 'up: no timer');
    sockets[0].handlers.onMessage(JSON.stringify({ t: 'changed', seq: 9 }));
    await settle();
    assert.deepEqual(reads, ['/api/universes/uni-play/campaign?after=4&limit=1000']);
    assert.equal(campaign.seq, 9);
    assert.ok(campaign.records[NEXT], 'the row arrived');
    assert.ok(campaign.records[HELD], 'nothing cleared');
    assert.equal(live(POLL_MS).length, 0, 'still no timer after the pull');
});

test('a seq already held, another kind, or words that are not JSON: no pull', async () => {
    ready();
    watchCampaignPanel(true);
    sockets[0].handlers.onOpen();
    sockets[0].handlers.onMessage(JSON.stringify({ t: 'changed', seq: 4 }));
    sockets[0].handlers.onMessage(JSON.stringify({ t: 'hello' }));
    sockets[0].handlers.onMessage('not json');
    await settle();
    assert.deepEqual(reads, []);
});

test('a save in flight: no pull until its answer is back, then one', async () => {
    ready();
    watchCampaignPanel(true);
    sockets[0].handlers.onOpen();
    pending.value = true;
    sockets[0].handlers.onMessage(JSON.stringify({ t: 'changed', seq: 9 }));
    await settle();
    assert.deepEqual(reads, []);
    const wait = live(SAVE_WAIT_MS);
    assert.equal(wait.length, 1);
    pending.value = false;
    wait[0].fn();
    await settle();
    assert.equal(reads.length, 1);
});

test('two failed upgrades: the thirty-second timer, no third socket; a blocked socket: the timer at once', () => {
    ready();
    watchCampaignPanel(true);
    sockets[0].handlers.onClose();
    const retry = live(RETRY_MS);
    assert.equal(retry.length, 1);
    retry[0].fn();
    retry[0].dead = true;
    assert.equal(sockets.length, 2);
    sockets[1].handlers.onError();
    sockets[1].handlers.onClose();
    assert.equal(live(RETRY_MS).length, 0);
    assert.equal(live(POLL_MS).length, 1, 'the poll is the fallback');
    assert.equal(sockets.length, 2);
    stopCampaignPoll();
    ready();
    campaignSocket.open = () => { throw new Error('blocked'); };
    watchCampaignPanel(true);
    assert.equal(live(POLL_MS).length, 1);
});

test('hidden: a change waits; shown, one pull; a socket down when shown: one pull, and it opens again', async () => {
    ready();
    watchCampaignPanel(true);
    sockets[0].handlers.onOpen();
    setVisible(false);
    sockets[0].handlers.onMessage(JSON.stringify({ t: 'changed', seq: 9 }));
    await settle();
    assert.deepEqual(reads, []);
    setVisible(true);
    await settle();
    assert.equal(reads.length, 1);
    // Dropped while up: one catch-up pull, and a fresh socket after the wait.
    campaign.seq = 9;
    sockets[0].handlers.onClose();
    await settle();
    assert.equal(reads.length, 2);
    live(RETRY_MS)[0].fn();
    assert.equal(sockets.length, 2);
});

test('closing the panel closes the socket; opening it again starts afresh', () => {
    ready();
    watchCampaignPanel(true);
    watchCampaignPanel(false);
    assert.equal(sockets[0].closed, true);
    assert.equal(live(POLL_MS).length, 0);
    watchCampaignPanel(true);
    assert.equal(sockets.length, 2);
});
