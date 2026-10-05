import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CAMPAIGN_UNIVERSE_KEY, campaign, openCampaign, switchCampaign } from '../../apps/web/src/campaign/store.ts';
import { commit, flushCampaign, lastError, newRecordId, pending, resetCampaign } from '../../apps/web/src/campaign/commit.ts';
import { recordsAtHex } from '../../apps/web/src/campaign/index.ts';
import { toasts } from '../../apps/web/src/shell/toast.ts';

const memory = new Map();
globalThis.localStorage = {
    getItem(key) { return memory.has(key) ? memory.get(key) : null; },
    setItem(key, value) { memory.set(String(key), String(value)); },
    removeItem(key) { memory.delete(key); },
};

const VESSEL = 'cr_11111111-1111-1111-1111-111111111111';
const PERSON = 'cr_22222222-2222-2222-2222-222222222222';
const OTHER = 'cr_33333333-3333-3333-3333-333333333333';
const STAMP = '2026-10-04T00:00:00.000Z';
const HEX = 'Spinward_Marches/1910';

function jsonResponse(status, body) {
    return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function record(over = {}) {
    return {
        id: VESSEL,
        type: 'vessel',
        kind: '',
        name: 'Beowulf',
        summary: '',
        details: '',
        tags: [],
        anchor: { kind: 'system', hexKey: HEX, locationLabel: 'Regina' },
        when: null,
        visibility: 'referee',
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
        party: { vesselId: null, memberIds: [], anchor: null },
        kinds: {},
        calendar: { dateFormat: 'imperial' },
        rev: 0,
    };
}

function universeRow(over = {}) {
    return {
        id: 'uni-a',
        ownerId: 'user-1',
        name: 'My campaign',
        slug: 'my-campaign',
        truthVersion: 'v5',
        engineVersion: '1.0.0',
        editionDefault: 'MgT2E',
        createdAt: STAMP,
        updatedAt: STAMP,
        deletedAt: null,
        purgeAfter: null,
        hexOverrideCount: 0,
        objectBytes: 0,
        lastSnapshotAt: null,
        ...over,
    };
}

function page(records, seq, done) {
    return { records, links: [], settings: settings(), seq, done };
}

function harness(seed = []) {
    const server = {
        universes: seed.map((row) => universeRow(row)),
        posts: [],
        patches: [],
        pages: {},
        failPatch: false,
        conflict: null,
    };
    const timers = [];
    const schedule = (fn, ms) => {
        const item = { fn, ms, dead: false };
        timers.push(item);
        return () => { item.dead = true; };
    };
    const fetchImpl = async (url, init = {}) => {
        assert.equal(init.credentials, 'same-origin');
        const method = init.method || 'GET';
        const target = String(url);
        if (init.body != null) {
            assert.equal(new Headers(init.headers).get('content-type'), 'application/json');
        }
        if (target === '/api/universes' && method === 'GET') {
            return jsonResponse(200, { ok: true, data: server.universes });
        }
        if (target === '/api/universes' && method === 'POST') {
            const body = JSON.parse(init.body);
            server.posts.push(body);
            const row = universeRow({
                id: 'uni-' + server.posts.length,
                name: body.name,
                truthVersion: body.truthVersion,
                editionDefault: body.editionDefault,
            });
            server.universes.push(row);
            return jsonResponse(201, { ok: true, data: row });
        }
        const campaignUrl = target.match(/^\/api\/universes\/([^/]+)\/campaign\?after=(\d+)/);
        if (campaignUrl && method === 'GET') {
            const id = decodeURIComponent(campaignUrl[1]);
            const after = Number(campaignUrl[2]);
            const list = server.pages[id] || [{ after: 0, body: page([], 0, true) }];
            const hit = list.find((item) => item.after === after) || list[list.length - 1];
            return jsonResponse(200, { ok: true, data: hit.body });
        }
        const changes = target.match(/^\/api\/universes\/([^/]+)\/campaign\/changes$/);
        if (changes && method === 'PATCH') {
            const body = JSON.parse(init.body);
            server.patches.push({ id: decodeURIComponent(changes[1]), body });
            if (server.failPatch) {
                server.failPatch = false;
                throw new Error('offline');
            }
            if (server.conflict) {
                const result = server.conflict;
                server.conflict = null;
                return jsonResponse(200, { ok: true, data: result });
            }
            let seq = 1;
            const applied = (body.records || []).map((row) => ({
                table: 'records', id: row.id, rev: row.rev + 1, seq: seq++,
            }));
            return jsonResponse(200, { ok: true, data: { applied, conflicts: [] } });
        }
        throw new Error('unexpected ' + method + ' ' + target);
    };
    return { server, fetchImpl, schedule, timers };
}

function open(box, universeId) {
    return openCampaign({
        fetch: box.fetchImpl,
        truthVersion: 'v5',
        schedule: box.schedule,
        universeId,
    });
}

test('first open creates one campaign and a second open does not', async () => {
    memory.clear();
    resetCampaign();
    const box = harness();
    box.server.pages['uni-1'] = [{ after: 0, body: page([], 0, true) }];
    await open(box);
    await open(box);
    assert.equal(box.server.posts.length, 1);
    assert.deepEqual(box.server.posts[0], {
        name: 'My campaign',
        truthVersion: 'v5',
        editionDefault: 'MgT2E',
    });
    assert.equal(campaign.universeId, 'uni-1');
    assert.equal(campaign.status, 'ready');
});

test('pages load until done', async () => {
    memory.clear();
    resetCampaign();
    const box = harness();
    const first = record({ id: VESSEL, name: 'Beowulf' });
    const second = record({ id: PERSON, type: 'person', name: 'Voss', anchor: null });
    box.server.pages['uni-1'] = [
        { after: 0, body: page([first], 1, false) },
        { after: 1, body: page([second], 2, true) },
    ];
    await open(box);
    assert.equal(campaign.records[VESSEL].name, 'Beowulf');
    assert.equal(campaign.records[PERSON].name, 'Voss');
    assert.equal(campaign.seq, 2);
});

test('commit then flush sends one batched body', async () => {
    memory.clear();
    resetCampaign();
    const box = harness();
    box.server.pages['uni-1'] = [{ after: 0, body: page([], 0, true) }];
    await open(box);
    const alpha = record({ id: VESSEL, name: 'Alpha', rev: 0 });
    const beta = record({ id: PERSON, type: 'person', name: 'Beta', rev: 0, anchor: null });
    commit({ records: [{ ...alpha, baseRev: 0 }, { ...beta, baseRev: 0 }] });
    assert.equal(box.timers.length, 1);
    assert.equal(box.timers[0].ms, 800);
    await flushCampaign();
    assert.equal(box.server.patches.length, 1);
    assert.deepEqual(box.server.patches[0].body.records.map((row) => row.id), [VESSEL, PERSON]);
    assert.equal(box.timers[0].dead, true);
    assert.equal(pending.value, false);
});

test('a conflict replaces the row and raises one toast', async () => {
    memory.clear();
    resetCampaign();
    const box = harness();
    const stored = record({ id: PERSON, type: 'person', name: 'Voss', anchor: null });
    box.server.pages['uni-1'] = [{ after: 0, body: page([stored], 1, true) }];
    await open(box);
    commit({ records: [{ ...stored, name: 'Local name', baseRev: 1 }] });
    box.server.conflict = {
        applied: [],
        conflicts: [{
            table: 'records',
            id: PERSON,
            current: record({ id: PERSON, type: 'person', name: 'Server name', rev: 2, anchor: null }),
        }],
    };
    await flushCampaign();
    assert.equal(campaign.records[PERSON].name, 'Server name');
    assert.equal(campaign.records[PERSON].rev, 2);
    assert.equal(toasts.length, 1);
    assert.equal(toasts[0].message, 'Saved changes conflicted with a newer copy. The server copy is now shown.');
});

test('a failed flush keeps the queue and a later flush sends it once', async () => {
    memory.clear();
    resetCampaign();
    const box = harness();
    box.server.pages['uni-1'] = [{ after: 0, body: page([], 0, true) }];
    await open(box);
    const row = record({ id: PERSON, type: 'person', name: 'Queued', rev: 0, anchor: null });
    commit({ records: [{ ...row, baseRev: 0 }] });
    box.server.failPatch = true;
    await flushCampaign();
    assert.equal(box.server.patches.length, 1);
    assert.equal(lastError.value, 'offline');
    assert.equal(pending.value, true);
    await flushCampaign();
    assert.equal(box.server.patches.length, 2);
    assert.equal(box.server.patches[1].body.records[0].id, PERSON);
    assert.equal(box.server.patches[1].body.records[0].name, 'Queued');
    assert.equal(pending.value, false);
    assert.equal(lastError.value, '');
});

test('records at a hex include a person aboard a vessel anchored there', async () => {
    memory.clear();
    resetCampaign();
    const box = harness([universeRow({ id: 'uni-a' })]);
    const vessel = record({ id: VESSEL, type: 'vessel', name: 'Beowulf' });
    const person = record({
        id: PERSON,
        type: 'person',
        name: 'Voss',
        anchor: { kind: 'record', id: VESSEL },
    });
    box.server.pages['uni-a'] = [{ after: 0, body: page([vessel, person], 2, true) }];
    await open(box);
    assert.deepEqual(recordsAtHex(HEX), [VESSEL, PERSON]);
    assert.equal(newRecordId().startsWith('cr_'), true);
});

test('switch drops the other campaign\'s rows', async () => {
    memory.clear();
    resetCampaign();
    const box = harness([
        universeRow({ id: 'uni-a', name: 'Alpha game' }),
        universeRow({ id: 'uni-b', name: 'Beta game' }),
    ]);
    const alpha = record({ id: VESSEL, type: 'vessel', name: 'From Alpha' });
    const beta = record({
        id: OTHER,
        type: 'person',
        name: 'From Beta',
        anchor: { kind: 'system', hexKey: 'Spinward_Marches/0101' },
    });
    box.server.pages['uni-a'] = [{ after: 0, body: page([alpha], 1, true) }];
    box.server.pages['uni-b'] = [{ after: 0, body: page([beta], 1, true) }];
    await open(box, 'uni-a');
    assert.equal(campaign.records[VESSEL].name, 'From Alpha');
    await switchCampaign('uni-b');
    assert.equal(campaign.universeId, 'uni-b');
    assert.equal(campaign.records[VESSEL], undefined);
    assert.equal(campaign.records[OTHER].name, 'From Beta');
    assert.deepEqual(recordsAtHex(HEX), []);
    assert.deepEqual(recordsAtHex('Spinward_Marches/0101'), [OTHER]);
});

test('open uses the campaign this device used last', async () => {
    memory.clear();
    resetCampaign();
    const box = harness([
        universeRow({ id: 'uni-a', name: 'Alpha game' }),
        universeRow({ id: 'uni-b', name: 'Beta game' }),
    ]);
    const alpha = record({ id: VESSEL, name: 'From Alpha' });
    const beta = record({ id: OTHER, type: 'person', name: 'From Beta', anchor: null });
    box.server.pages['uni-a'] = [{ after: 0, body: page([alpha], 1, true) }];
    box.server.pages['uni-b'] = [{ after: 0, body: page([beta], 1, true) }];
    memory.set(CAMPAIGN_UNIVERSE_KEY, 'uni-b');
    await open(box);
    assert.equal(box.server.posts.length, 0);
    assert.equal(campaign.universeId, 'uni-b');
    assert.equal(campaign.records[OTHER].name, 'From Beta');
    assert.equal(campaign.records[VESSEL], undefined);
    assert.equal(memory.get(CAMPAIGN_UNIVERSE_KEY), 'uni-b');
});
