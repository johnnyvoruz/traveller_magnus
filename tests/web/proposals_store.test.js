import assert from 'node:assert/strict';
import { test } from 'node:test';
import { listTokens, makeToken, revokeToken } from '../../apps/web/src/account/tokens.ts';
import { resetCampaign } from '../../apps/web/src/campaign/commit.ts';
import { POLL_MS, stopCampaignPoll, watchCampaignPanel } from '../../apps/web/src/campaign/poll.ts';
import { loadBatch, notePendingCount, proposals, resetProposals, resolve, submitPasted } from '../../apps/web/src/campaign/proposals.ts';
import { pendingProposalCount } from '../../apps/web/src/campaign/read.ts';
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

const HELD = 'cr_11111111-1111-4111-8111-111111111111';
const MADE = 'cr_22222222-2222-4222-8222-222222222222';
const BATCH = 'pb_0123456789ABCDEFGHJKMNPQRS';
const UPDATE = 'pp_0123456789ABCDEFGHJKMNPQRS';
const CREATE = 'pp_1123456789ABCDEFGHJKMNPQRS';
const STAMP = '2026-10-18T16:00:00.000Z';
const EVIDENCE = [{ at: '01:12:40', quote: 'I owe you one, Harlan.' }];

function jsonResponse(status, body) {
    return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function record(id, over = {}) {
    return {
        id,
        type: 'person',
        kind: 'contact',
        name: 'Harlan Teague',
        summary: '',
        details: '',
        tags: [],
        anchor: null,
        when: null,
        visibility: 'referee',
        playerNotes: null,
        sheet: null,
        status: null,
        images: null,
        provenance: null,
        rev: 4,
        createdAt: STAMP,
        updatedAt: STAMP,
        deleted: false,
        ...over,
    };
}

function source() {
    return { kind: 'transcript', label: 'Session 12', realDate: '2026-10-16' };
}

function batch(proposals, over = {}) {
    return {
        id: BATCH,
        source: source(),
        state: 'open',
        counts: { pending: proposals.length, accepted: 0, dropped: 0 },
        createdAt: STAMP,
        reviewedAt: null,
        expiresAt: '2026-11-17T16:00:00.000Z',
        reviewUrl: 'https://traveller.voyage/campaign/proposals/' + BATCH,
        pasted: true,
        proposals,
        ...over,
    };
}

function stored(id, proposal, over = {}) {
    return {
        id,
        ordinal: 0,
        proposal,
        targetId: proposal.op === 'record.create' ? MADE : HELD,
        state: 'pending',
        appliedRev: null,
        decidedAt: null,
        note: null,
        ...over,
    };
}

function ready() {
    resetCampaign();
    resetProposals();
    stopCampaignPoll();
    toasts.splice(0, toasts.length);
    campaign.status = 'ready';
    campaign.role = 'owner';
    campaign.universeId = 'uni-play';
    campaign.seq = 3;
    campaign.records[HELD] = record(HELD);
    campaign.settings = {
        party: { vesselIds: [], aboard: {}, memberIds: [], anchor: null },
        kinds: {},
        calendar: { dateFormat: 'imperial' },
        rev: 0,
    };
}

test('an accept sends the rev the store holds, and an applied create lands', async () => {
    ready();
    const update = stored(UPDATE, {
        op: 'record.update',
        id: HELD,
        baseRev: 1,
        append: { details: 'Owes a favour.' },
        evidence: EVIDENCE,
    });
    const create = stored(CREATE, {
        op: 'record.create',
        ref: 'harlan-note',
        record: {
            type: 'note',
            kind: '',
            name: 'Berthing fee',
            summary: '',
            details: 'Unpaid.',
            tags: [],
            anchor: null,
        },
        evidence: EVIDENCE,
    }, { targetId: MADE, ordinal: 1 });
    let body = null;
    transport.fetch = async (url, init) => {
        const target = String(url);
        if (target.endsWith('/' + BATCH)) return jsonResponse(200, { ok: true, data: batch([update, create]) });
        body = JSON.parse(init.body);
        return jsonResponse(200, {
            ok: true,
            data: {
                batch: batch([
                    { ...update, state: 'accepted', appliedRev: 5 },
                    { ...create, state: 'accepted', appliedRev: 1, targetId: MADE },
                ], { counts: { pending: 0, accepted: 2, dropped: 0 } }),
                applied: [
                    { proposalId: UPDATE, table: 'records', id: HELD, rev: 5, seq: 8 },
                    { proposalId: CREATE, table: 'records', id: MADE, rev: 1, seq: 9 },
                ],
                conflicts: [],
            },
        });
    };
    await resolve(BATCH, [
        { proposalId: UPDATE, action: 'accept' },
        { proposalId: CREATE, action: 'accept' },
    ]);
    assert.equal(body.decisions[0].baseRev, 4);
    assert.equal(body.decisions[1].baseRev, undefined);
    assert.equal(campaign.records[HELD].rev, 5);
    assert.equal(campaign.records[HELD].details, 'Owes a favour.');
    assert.equal(campaign.records[MADE].name, 'Berthing fee');
    assert.equal(campaign.records[MADE].visibility, 'referee');
    assert.equal(campaign.records[MADE].rev, 1);
    assert.equal(campaign.seq, 9);
});

test('a conflict leaves the card and shows the server row', async () => {
    ready();
    const update = stored(UPDATE, {
        op: 'record.update',
        id: HELD,
        baseRev: 4,
        set: { name: 'Harlan' },
        evidence: EVIDENCE,
    });
    const current = record(HELD, { name: 'Server copy', rev: 9 });
    transport.fetch = async (url) => {
        const target = String(url);
        if (target.endsWith('/' + BATCH)) return jsonResponse(200, { ok: true, data: batch([update]) });
        return jsonResponse(200, {
            ok: true,
            data: {
                batch: batch([{ ...update, state: 'pending' }]),
                applied: [],
                conflicts: [{ proposalId: UPDATE, table: 'records', id: HELD, current }],
            },
        });
    };
    await resolve(BATCH, [{ proposalId: UPDATE, action: 'accept' }]);
    assert.equal(campaign.records[HELD].name, 'Server copy');
    assert.equal(campaign.records[HELD].rev, 9);
    assert.equal(proposals.batch.proposals[0].state, 'pending');
    assert.equal(proposals.conflicts[0].current.name, 'Server copy');
    assert.equal(toasts.some((toast) => toast.message.includes('server copy')), true);
});

test('a pasted reply goes to the owner door with the reply\'s own key', async () => {
    ready();
    const text = '{"format":"voyage-proposals","schemaVersion":1,"idempotencyKey":"7d2f1c4e-5b3a-4c9e-9f0a-1b2c3d4e5f60","source":{"kind":"transcript","label":"Session 12","realDate":"2026-10-16"},"proposals":[{"op":"question","text":"Did the party pay the berthing fee?","evidence":[{"at":"01:20:05","quote":"We will sort the berth later."}]}]}';
    let sent = null;
    let headers = null;
    transport.fetch = async (url, init) => {
        sent = { url: String(url), body: JSON.parse(init.body), method: init.method };
        headers = init.headers;
        return jsonResponse(201, {
            ok: true,
            data: {
                batch: batch([stored(UPDATE, sent.body.proposals[0], { targetId: null })], { counts: { pending: 1, accepted: 0, dropped: 0 } }),
            },
        });
    };
    const result = await submitPasted(text);
    assert.equal(result.ok, true);
    assert.equal(result.sent, true);
    assert.equal(sent.method, 'POST');
    assert.equal(sent.url, '/api/universes/uni-play/campaign/proposals');
    assert.equal(sent.body.idempotencyKey, '7d2f1c4e-5b3a-4c9e-9f0a-1b2c3d4e5f60');
    assert.equal(headers.has('Authorization'), false);
    assert.equal(proposals.batch.pasted, true);
    assert.equal(proposals.pending, 1);
});

test('a refusal carries the server sentence', async () => {
    ready();
    const text = '{"format":"voyage-proposals","schemaVersion":1,"idempotencyKey":"7d2f1c4e-5b3a-4c9e-9f0a-1b2c3d4e5f60","source":{"kind":"transcript","label":"Session 12","realDate":"2026-10-16"},"proposals":[{"op":"question","text":"Did the party pay the berthing fee?","evidence":[{"at":"01:20:05","quote":"We will sort the berth later."}]}]}';
    transport.fetch = async () => jsonResponse(503, {
        ok: false,
        error: { code: 'proposals_unavailable', message: 'Proposals are not available yet.' },
    });
    const result = await submitPasted(text);
    assert.equal(result.ok, true);
    assert.equal(result.sent, false);
    assert.equal(result.message, 'Proposals are not available yet.');
    assert.equal(proposals.batch, null);
    assert.equal(proposals.error, 'offline');
});

test('tokens list, make and revoke', async () => {
    ready();
    const row = {
        id: 'tok-1',
        name: 'Session',
        prefix: 'voy_abc',
        scopes: ['campaign:read', 'proposals:write'],
        universeId: 'uni-play',
        createdAt: STAMP,
        expiresAt: '2027-10-18T16:00:00.000Z',
        lastUsedAt: null,
        revokedAt: null,
    };
    const calls = [];
    transport.fetch = async (url, init) => {
        calls.push({ url: String(url), method: init && init.method ? init.method : 'GET', body: init && init.body ? JSON.parse(init.body) : null });
        if (String(url) === '/api/tokens' && (!init || !init.method)) return jsonResponse(200, { ok: true, data: { items: [row] } });
        if (init && init.method === 'POST') return jsonResponse(201, { ok: true, data: { token: 'voy_secret', row } });
        return jsonResponse(200, { ok: true, data: {} });
    };
    const listed = await listTokens();
    assert.equal(listed[0].prefix, 'voy_abc');
    const made = await makeToken({ name: 'Session', scopes: ['proposals:write'], universeId: 'uni-play' });
    assert.equal(made.token, 'voy_secret');
    assert.equal(await revokeToken('tok-1'), true);
    assert.equal(calls[1].body.scopes[0], 'proposals:write');
    assert.equal(calls[2].method, 'DELETE');
    assert.equal(calls[2].url, '/api/tokens/tok-1');
});

test('a poll page refreshes the pending count', async () => {
    ready();
    notePendingCount(0);
    assert.equal(pendingProposalCount({ counts: { pendingProposals: 3 } }), 3);
    assert.equal(pendingProposalCount({ records: [] }), null);
    const timers = [];
    transport.schedule = (fn, ms) => {
        timers.push({ fn, ms });
        return () => {};
    };
    transport.fetch = async () => jsonResponse(200, {
        ok: true,
        data: {
            records: [],
            links: [],
            journal: [],
            settings: campaign.settings,
            clock: null,
            seq: 4,
            done: true,
            counts: { pendingProposals: 6 },
        },
    });
    watchCampaignPanel(true);
    assert.equal(timers[0].ms, POLL_MS);
    await timers[0].fn();
    assert.equal(proposals.pending, 6);
    stopCampaignPoll();
});

test('loadBatch keeps the batch the screen reviews', async () => {
    ready();
    const update = stored(UPDATE, {
        op: 'question',
        text: 'Did they pay?',
        evidence: EVIDENCE,
    }, { targetId: null });
    transport.fetch = async () => jsonResponse(200, { ok: true, data: batch([update]) });
    const loaded = await loadBatch(BATCH);
    assert.equal(loaded.id, BATCH);
    assert.equal(proposals.batch.proposals[0].proposal.op, 'question');
});
