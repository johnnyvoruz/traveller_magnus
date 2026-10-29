import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CAMPAIGN_UNIVERSE_KEY, campaign, createCampaign, deleteCampaign, listCampaigns, markMembershipGone, noteUnauthorized, openCampaign, pinTruthVersion, renameCampaign, resetCampaignState, setCampaignDate, switchCampaign, transport } from '../../apps/web/src/campaign/store.ts';
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

function page(records, seq, done, clock = null) {
    return { records, links: [], settings: settings(), clock, seq, done };
}

function harness(seed = []) {
    const server = {
        universes: seed.map((row) => universeRow(row)),
        posts: [],
        patches: [],
        renames: [],
        deletes: [],
        renameStatus: 0,
        deleteStatus: 0,
        pages: {},
        failPatch: false,
        failPost: false,
        failList: false,
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
        if (target === '/api/me/playing' && method === 'GET') {
            return jsonResponse(200, { ok: true, data: { items: [] } });
        }
        if (target === '/api/universes' && method === 'GET') {
            if (server.failList) {
                server.failList = false;
                return jsonResponse(500, { ok: false, error: { code: 'internal', message: 'no' } });
            }
            return jsonResponse(200, { ok: true, data: server.universes });
        }
        if (target === '/api/universes' && method === 'POST') {
            const body = JSON.parse(init.body);
            server.posts.push(body);
            const prior = server.universes.find((row) => row.id === body.id);
            if (server.failPost) {
                server.failPost = false;
                if (!prior && body.id) {
                    server.universes.push(universeRow({
                        id: body.id,
                        name: body.name,
                        truthVersion: body.truthVersion,
                        editionDefault: body.editionDefault,
                    }));
                }
                throw new Error('offline');
            }
            if (prior) return jsonResponse(200, { ok: true, data: prior });
            const row = universeRow({
                id: body.id,
                name: body.name,
                truthVersion: body.truthVersion,
                editionDefault: body.editionDefault,
            });
            if (row.id && server.pages['uni-1'] && !server.pages[row.id]) server.pages[row.id] = server.pages['uni-1'];
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
            for (const row of body.journal || []) {
                const rev = typeof row.rev === 'number' ? row.rev : row.baseRev;
                applied.push({ table: 'journal', id: row.id, rev: rev + 1, seq: seq++ });
            }
            if (body.clock) {
                applied.push({
                    table: 'clock',
                    id: 'campaignTime',
                    rev: body.clock.baseRev + 1,
                    seq: seq++,
                });
            }
            return jsonResponse(200, { ok: true, data: { applied, conflicts: [] } });
        }
        const universeOne = target.match(/^\/api\/universes\/([^/]+)$/);
        if (universeOne && method === 'PATCH') {
            const id = decodeURIComponent(universeOne[1]);
            const body = JSON.parse(init.body);
            server.renames.push({ id, name: body.name });
            if (server.renameStatus) {
                const status = server.renameStatus;
                server.renameStatus = 0;
                return jsonResponse(status, { ok: false, error: { code: 'refused', message: 'no' } });
            }
            if (!body.name) return jsonResponse(400, { ok: false, error: { code: 'invalid', message: 'no' } });
            const index = server.universes.findIndex((row) => row.id === id);
            const current = index >= 0 ? server.universes[index] : universeRow({ id });
            const updated = { ...current, name: body.name, slug: 'renamed', later: 'drop-me' };
            if (index >= 0) server.universes[index] = updated;
            return jsonResponse(200, { ok: true, data: updated });
        }
        if (universeOne && method === 'DELETE') {
            const id = decodeURIComponent(universeOne[1]);
            server.deletes.push(id);
            if (server.deleteStatus) {
                const status = server.deleteStatus;
                server.deleteStatus = 0;
                return jsonResponse(status, { ok: false, error: { code: 'refused', message: 'no' } });
            }
            server.universes = server.universes.filter((row) => row.id !== id);
            return jsonResponse(200, { ok: true });
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
    assert.match(box.server.posts[0].id, /^uni_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    assert.equal(box.server.posts[0].name, 'My map');
    assert.equal(box.server.posts[0].truthVersion, 'v5');
    assert.equal(box.server.posts[0].editionDefault, 'MgT2E');
    assert.equal(campaign.universeId, box.server.posts[0].id);
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

test('open keeps the clock from a later page', async () => {
    memory.clear();
    resetCampaign();
    const box = harness();
    const first = record({ id: VESSEL, name: 'Beowulf' });
    const second = record({ id: PERSON, type: 'person', name: 'Voss', anchor: null });
    box.server.pages['uni-1'] = [
        { after: 0, body: page([first], 1, false, null) },
        { after: 1, body: page([second], 2, true, { days: 15, rev: 2 }) },
    ];
    await open(box);
    assert.deepEqual(campaign.clock, { days: 15, rev: 2 });
});

test('setCampaignDate sends the clock and keeps the first baseRev', async () => {
    memory.clear();
    resetCampaign();
    const box = harness();
    box.server.pages['uni-1'] = [{ after: 0, body: page([], 0, true) }];
    await open(box);
    assert.equal(campaign.clock, null);
    setCampaignDate(10.5);
    setCampaignDate(11.25);
    assert.equal(campaign.clock.days, 11.25);
    assert.equal(campaign.clock.rev, 0);
    await flushCampaign();
    assert.deepEqual(box.server.patches[0].body.clock, { days: 11.25, baseRev: 0 });
    assert.deepEqual(campaign.clock, { days: 11.25, rev: 1 });
    assert.equal(pending.value, false);
});

test('a clock conflict takes the server clock and raises one toast', async () => {
    memory.clear();
    resetCampaign();
    const box = harness();
    box.server.pages['uni-1'] = [{ after: 0, body: page([], 0, true, { days: 3, rev: 4 }) }];
    await open(box);
    setCampaignDate(9);
    box.server.conflict = {
        applied: [],
        conflicts: [{ table: 'clock', id: 'campaignTime', current: { days: 3, rev: 4 } }],
    };
    await flushCampaign();
    assert.deepEqual(campaign.clock, { days: 3, rev: 4 });
    assert.equal(toasts.length, 1);
    assert.equal(toasts[0].message, 'Saved changes conflicted with a newer copy. The server copy is now shown.');
});

test('a clock conflict with no stored date clears the local clock', async () => {
    memory.clear();
    resetCampaign();
    const box = harness();
    box.server.pages['uni-1'] = [{ after: 0, body: page([], 0, true) }];
    await open(box);
    setCampaignDate(9);
    box.server.conflict = {
        applied: [],
        conflicts: [{ table: 'clock', id: 'campaignTime', current: null }],
    };
    await flushCampaign();
    assert.equal(campaign.clock, null);
    assert.equal(toasts.length, 1);
});

test('a create retries the same id after a network failure and ends with one universe', async () => {
    memory.clear();
    resetCampaign();
    const box = harness();
    await open(box, 'missing');
    box.server.failPost = true;
    const first = await createCampaign('Retry game');
    assert.equal(first, null);
    assert.equal(campaign.status, 'error');
    const second = await createCampaign('Retry game');
    assert.equal(box.server.posts.length, 2);
    assert.equal(box.server.posts[0].id, box.server.posts[1].id);
    assert.match(box.server.posts[0].id, /^uni_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    assert.equal(campaign.universes.length, 1);
    assert.equal(campaign.universeId, box.server.posts[0].id);
    assert.equal(second && second.id, box.server.posts[0].id);
    assert.equal(campaign.status, 'ready');
});

test('a failed create and a failed list leave the open campaign ready', async () => {
    memory.clear();
    resetCampaign();
    const box = harness([universeRow({ id: 'uni-1', name: 'Alpha game' })]);
    const row = record({ id: VESSEL, name: 'Beowulf' });
    box.server.pages['uni-1'] = [{ after: 0, body: page([row], 1, true) }];
    await open(box, 'uni-1');
    assert.equal(campaign.status, 'ready');
    assert.equal(campaign.records[VESSEL].name, 'Beowulf');
    box.server.failPost = true;
    const created = await createCampaign('Nope');
    assert.equal(created, null);
    assert.equal(campaign.status, 'ready');
    assert.equal(campaign.universeId, 'uni-1');
    assert.equal(campaign.records[VESSEL].name, 'Beowulf');
    box.server.failList = true;
    const listed = await listCampaigns();
    assert.equal(listed, null);
    assert.equal(campaign.status, 'ready');
    assert.equal(campaign.universeId, 'uni-1');
    assert.equal(campaign.records[VESSEL].name, 'Beowulf');
    assert.equal(campaign.universes[0].name, 'Alpha game');
});

const JOURNAL = 'cj_44444444-4444-4444-4444-444444444444';

function entry(over = {}) {
    return {
        id: JOURNAL,
        kind: 'note',
        title: 'At the starport',
        body: '',
        when: null,
        realDate: null,
        sequence: null,
        author: 'referee',
        visibility: 'referee',
        anchor: null,
        mentions: [],
        rev: 1,
        createdAt: STAMP,
        updatedAt: STAMP,
        deleted: false,
        ...over,
    };
}

test('a page with a journal fills it, and a page without one leaves it empty', async () => {
    memory.clear();
    resetCampaign();
    const box = harness([universeRow({ id: 'uni-1' })]);
    box.server.pages['uni-1'] = [{ after: 0, body: page([], 1, true) }];
    await open(box, 'uni-1');
    assert.deepEqual(campaign.journal, {});
    box.server.pages['uni-1'] = [{ after: 0, body: { ...page([], 2, true), journal: [entry()] } }];
    await open(box, 'uni-1');
    assert.equal(campaign.journal[JOURNAL].title, 'At the starport');
    assert.equal(campaign.journal[JOURNAL].rev, 1);
});

test('a journal commit flushes, takes the applied rev, conflicts, and a failed send is restored', async () => {
    memory.clear();
    resetCampaign();
    const box = harness([universeRow({ id: 'uni-1' })]);
    box.server.pages['uni-1'] = [{ after: 0, body: page([], 1, true) }];
    await open(box, 'uni-1');
    const row = entry({ rev: 0, title: 'Local' });
    commit({ journal: [{ ...row, baseRev: 0 }] });
    await flushCampaign();
    assert.equal(box.server.patches.length, 1);
    assert.equal(box.server.patches[0].body.journal[0].id, JOURNAL);
    assert.equal(box.server.patches[0].body.journal[0].baseRev, 0);
    assert.equal(campaign.journal[JOURNAL].rev, 1);
    assert.equal(pending.value, false);

    commit({ journal: [{ ...campaign.journal[JOURNAL], title: 'Edited', baseRev: 1 }] });
    box.server.conflict = {
        applied: [],
        conflicts: [{ table: 'journal', id: JOURNAL, current: entry({ title: 'Server', rev: 4 }) }],
    };
    await flushCampaign();
    assert.equal(campaign.journal[JOURNAL].title, 'Server');
    assert.equal(campaign.journal[JOURNAL].rev, 4);
    assert.equal(toasts[0].message, 'Saved changes conflicted with a newer copy. The server copy is now shown.');

    commit({ journal: [{ ...campaign.journal[JOURNAL], title: 'Again', baseRev: 4 }] });
    box.server.failPatch = true;
    await flushCampaign();
    assert.equal(lastError.value, 'offline');
    assert.equal(pending.value, true);
    assert.equal(campaign.journal[JOURNAL].title, 'Again');
    await flushCampaign();
    assert.equal(box.server.patches[box.server.patches.length - 1].body.journal[0].title, 'Again');
    assert.equal(box.server.patches[box.server.patches.length - 1].body.journal[0].baseRev, 4);
    assert.equal(campaign.journal[JOURNAL].rev, 5);
    assert.equal(lastError.value, '');
    assert.equal(pending.value, false);
});

test('resetCampaignState drops the open campaign, the pin, and a create that has not landed', async () => {
    memory.clear();
    resetCampaign();
    const box = harness([universeRow({ id: 'uni-1', name: 'Alpha game' })]);
    box.server.pages['uni-1'] = [{ after: 0, body: page([record()], 1, true) }];
    await open(box, 'uni-1');
    pinTruthVersion('v10');
    box.server.failPost = true;
    const failed = await createCampaign('Held');
    assert.equal(failed, null);
    const heldId = box.server.posts[0].id;
    assert.equal(box.server.posts[0].truthVersion, 'v10');
    resetCampaignState();
    assert.equal(campaign.status, 'signed-out');
    assert.equal(campaign.role, null);
    assert.equal(campaign.universeId, null);
    assert.equal(campaign.records[VESSEL], undefined);
    assert.deepEqual(campaign.universes, []);
    assert.equal(transport.fetch, fetch);
    await open(box, 'uni-1');
    const created = await createCampaign('After');
    const again = box.server.posts[box.server.posts.length - 1];
    assert.notEqual(again.id, heldId);
    assert.equal(again.truthVersion, 'v5');
    assert.equal(created && created.id, again.id);
    assert.equal(campaign.status, 'ready');
});

test('pinTruthVersion is what the next new campaign stores, until an open replaces it', async () => {
    memory.clear();
    resetCampaign();
    const box = harness([universeRow({ id: 'uni-1' })]);
    box.server.pages['uni-1'] = [{ after: 0, body: page([], 1, true) }];
    await open(box, 'uni-1');
    pinTruthVersion('v10');
    await createCampaign('Pinned');
    assert.equal(box.server.posts[0].truthVersion, 'v10');
    pinTruthVersion(null);
    await createCampaign('Unpinned');
    assert.equal(box.server.posts[1].truthVersion, null);
    await open(box, 'uni-1');
    await createCampaign('Opened');
    assert.equal(box.server.posts[2].truthVersion, 'v5');
});

test('noteUnauthorized signs the store out, and markMembershipGone keeps the campaign list', async () => {
    memory.clear();
    resetCampaign();
    const box = harness([universeRow({ id: 'uni-1', name: 'Alpha game' })]);
    box.server.pages['uni-1'] = [{ after: 0, body: { ...page([record()], 1, true), journal: [entry()] } }];
    await open(box, 'uni-1');
    campaign.playing = [{ universeId: 'uni-1', name: 'Alpha game' }];
    noteUnauthorized();
    assert.equal(campaign.status, 'signed-out');
    assert.equal(campaign.role, null);
    assert.equal(campaign.universeId, null);
    assert.deepEqual(campaign.universes, []);
    assert.deepEqual(campaign.playing, []);
    assert.equal(campaign.records[VESSEL], undefined);
    assert.equal(campaign.journal[JOURNAL], undefined);

    await open(box, 'uni-1');
    campaign.playing = [{ universeId: 'uni-1', name: 'Alpha game' }];
    markMembershipGone();
    assert.equal(campaign.status, 'gone');
    assert.equal(campaign.role, 'player');
    assert.equal(campaign.universeId, null);
    assert.equal(campaign.settings, null);
    assert.equal(campaign.clock, null);
    assert.equal(campaign.records[VESSEL], undefined);
    assert.equal(campaign.journal[JOURNAL], undefined);
    assert.deepEqual(campaign.universes.map((row) => row.id), ['uni-1']);
    assert.equal(campaign.playing.length, 1);
});

test('renameCampaign stores the server row, drops an unknown key, and a refusal leaves the name', async () => {
    memory.clear();
    resetCampaign();
    const box = harness([universeRow({ id: 'uni-1', name: 'Alpha game' })]);
    box.server.pages['uni-1'] = [{ after: 0, body: page([record()], 1, true) }];
    await open(box, 'uni-1');
    await renameCampaign('uni-1', 'Beta game');
    assert.equal(campaign.universes[0].name, 'Beta game');
    assert.equal(campaign.universes[0].slug, 'renamed');
    assert.equal(campaign.universes[0].later, undefined);
    assert.equal(campaign.universeId, 'uni-1');
    assert.equal(campaign.records[VESSEL].name, 'Beowulf');
    await renameCampaign('uni/odd', 'Odd game');
    assert.deepEqual(box.server.renames[1], { id: 'uni/odd', name: 'Odd game' });
    assert.equal(campaign.universes[campaign.universes.length - 1].id, 'uni/odd');
    assert.equal(campaign.universes[campaign.universes.length - 1].later, undefined);
    await assert.rejects(() => renameCampaign('uni-1', ''), /could not be renamed/);
    assert.equal(campaign.universes[0].name, 'Beta game');
    assert.equal(box.server.renames[2].name, '');
    box.server.renameStatus = 500;
    await assert.rejects(() => renameCampaign('uni-1', 'Gamma'), /could not be renamed/);
    assert.equal(campaign.universes[0].name, 'Beta game');
    assert.equal(campaign.status, 'ready');
    box.server.renameStatus = 401;
    await renameCampaign('uni-1', 'Gone');
    assert.equal(campaign.status, 'signed-out');
    assert.deepEqual(campaign.universes, []);
    assert.equal(campaign.universeId, null);
});

test('deleteCampaign drops a closed campaign, then the open one, and clears the device key', async () => {
    memory.clear();
    resetCampaign();
    const box = harness([
        universeRow({ id: 'uni-1', name: 'Alpha' }),
        universeRow({ id: 'uni-2', name: 'Beta' }),
        universeRow({ id: 'ab/cd', name: 'Slash' }),
    ]);
    box.server.pages['uni-1'] = [{ after: 0, body: page([record()], 1, true) }];
    box.server.pages['uni-2'] = [{ after: 0, body: page([record({ id: PERSON, type: 'person', name: 'Voss', anchor: null })], 1, true) }];
    await open(box, 'uni-1');
    await deleteCampaign('uni-1');
    assert.equal(campaign.universeId, 'uni-2');
    assert.equal(campaign.records[PERSON].name, 'Voss');
    assert.equal(campaign.records[VESSEL], undefined);
    assert.equal(campaign.status, 'ready');
    assert.equal(memory.get(CAMPAIGN_UNIVERSE_KEY), 'uni-2');
    memory.set(CAMPAIGN_UNIVERSE_KEY, 'ab/cd');
    await deleteCampaign('ab/cd');
    assert.deepEqual(box.server.deletes, ['uni-1', 'ab/cd']);
    assert.equal(memory.get(CAMPAIGN_UNIVERSE_KEY), '');
    assert.equal(campaign.universeId, 'uni-2');
    assert.equal(campaign.records[PERSON].name, 'Voss');
    await deleteCampaign('uni-2');
    assert.equal(campaign.universeId, null);
    assert.deepEqual(campaign.records, {});
    assert.equal(campaign.status, 'ready');
    assert.equal(memory.get(CAMPAIGN_UNIVERSE_KEY), '');
    assert.deepEqual(campaign.universes, []);
});

test('deleteCampaign leaves an unsaved open campaign, and a refusal does not remove it', async () => {
    memory.clear();
    resetCampaign();
    const box = harness([
        universeRow({ id: 'uni-1', name: 'Alpha' }),
        universeRow({ id: 'uni-2', name: 'Beta' }),
    ]);
    box.server.pages['uni-1'] = [{ after: 0, body: page([], 1, true) }];
    box.server.pages['uni-2'] = [{ after: 0, body: page([], 1, true) }];
    await open(box, 'uni-1');
    commit({ records: [{ ...record({ id: OTHER, name: 'Queued', rev: 0, anchor: null }), baseRev: 0 }] });
    box.server.failPatch = true;
    await deleteCampaign('uni-1');
    assert.deepEqual(box.server.deletes, []);
    assert.equal(pending.value, true);
    assert.equal(campaign.universeId, 'uni-1');
    assert.equal(campaign.records[OTHER].name, 'Queued');
    await deleteCampaign('uni-2');
    assert.deepEqual(box.server.deletes, ['uni-2']);
    assert.equal(pending.value, true);
    assert.equal(campaign.universeId, 'uni-1');
    assert.equal(campaign.records[OTHER].name, 'Queued');
    await flushCampaign();
    assert.equal(pending.value, false);
    box.server.deleteStatus = 500;
    await assert.rejects(() => deleteCampaign('uni-1'), /could not be deleted/);
    assert.equal(campaign.status, 'ready');
    assert.equal(campaign.universeId, 'uni-1');
    assert.deepEqual(campaign.universes.map((row) => row.id), ['uni-1']);
    box.server.deleteStatus = 401;
    await deleteCampaign('uni-1');
    assert.equal(campaign.status, 'signed-out');
    assert.equal(campaign.universeId, null);
    assert.deepEqual(campaign.universes, []);
    assert.equal(box.server.deletes[box.server.deletes.length - 1], 'uni-1');
});
