/**
 * The daily allowance: one number on the session, replaced by generate answers,
 * and a 429 that writes nothing.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadSession, noteAllowance, readAllowance, session, signOut } from '../../apps/web/src/account/session.ts';
import { AllowanceRefused, allowanceCovers, allowanceResetsLocal } from '../../apps/web/src/builder/allowance.ts';
import { asBuildStore } from '../../apps/web/src/builder/screen.ts';
import { openMap } from '../../apps/web/src/builder/store.ts';

const KEY = 'spin/1910';
const HASH = 'ab'.repeat(32);
const STAMP = '2026-10-12T00:00:00.000Z';
const RESET = '2026-10-13T00:00:00.000Z';
const SENTENCE = 'You can generate 1 more system today. The allowance resets at 00:00 UTC.';

function allow(remaining, over = {}) {
    return { limit: 100, used: 100 - remaining, remaining, resetsAt: RESET, ...over };
}

function row(over = {}) {
    return {
        hexKey: KEY,
        state: 'override',
        treeHash: HASH,
        baseHash: null,
        roll: 0,
        rev: 1,
        updatedAt: STAMP,
        ...over,
    };
}

function jobDone() {
    return {
        id: 'job-1',
        kind: 'generate',
        state: 'done',
        total: 2,
        done: 0,
        failed: 0,
        skipped: 0,
        placed: [],
        failures: [],
        createdAt: STAMP,
        finishedAt: STAMP,
    };
}

function json(data, status = 200) {
    return { ok: status >= 200 && status < 300, status, json: async () => ({ ok: true, data }) };
}

function me(id, role, allowance) {
    const data = { id, email: null, role, profile: null };
    if (allowance !== undefined) data.allowance = allowance;
    return json(data);
}

function refusal(message, details) {
    return {
        ok: false,
        status: 429,
        json: async () => ({ ok: false, error: { code: 'generation_allowance', message, details } }),
    };
}

function fake(handler) {
    const calls = [];
    const fetchImpl = async (url, init = {}) => {
        const body = init.body ? JSON.parse(init.body) : null;
        const call = { url: String(url), method: init.method, body };
        calls.push(call);
        return handler(call);
    };
    fetchImpl.calls = calls;
    return fetchImpl;
}

function open(fetchImpl) {
    return openMap({
        fetch: fetchImpl,
        truthVersion: 'v9',
        universeId: 'uni-1',
        universeName: 'Mine',
        seed: 'TravellerMagnus',
        settings: { generationPopMax: 1 },
    });
}

async function quiet() {
    return { ok: true, status: 200, json: async () => ({}) };
}

async function reset() {
    await signOut(quiet);
}

async function signIn(id, role, allowance) {
    await reset();
    await loadSession(async (url) => (String(url).includes('/api/me') ? me(id, role, allowance) : quiet()));
}

test('an unknown allowance and an admin are not blocked, and the reset is a Date', () => {
    assert.equal(allowanceCovers(null, 80), true);
    assert.equal(allowanceCovers({ limit: null, used: 0, remaining: null, resetsAt: RESET }, 80), true);
    assert.equal(allowanceCovers(allow(5), 5), true);
    assert.equal(allowanceCovers(allow(5), 6), false);
    const date = allowanceResetsLocal(allow(1));
    assert.equal(date.getTime(), Date.parse(RESET));
    assert.equal(allowanceResetsLocal(null), null);
});

test('GET /api/me sets the allowance, and an admin has nulls', async () => {
    await signIn('ada', 'user', allow(40));
    assert.equal(session.user.id, 'ada');
    assert.equal(readAllowance().remaining, 40);
    assert.equal(readAllowance().limit, 100);
    await signIn('admin', 'admin', { limit: null, used: 0, remaining: null, resetsAt: RESET });
    assert.equal(session.allowance.limit, null);
    assert.equal(session.allowance.remaining, null);
    assert.equal(session.allowance.used, 0);
    assert.equal(allowanceCovers(readAllowance(), 1000), true);
    await reset();
});

test('one generate, a preview, a job accept and a made sector replace the number', async () => {
    await signIn('ada', 'user', allow(40));
    let phase = 'one';
    const fetchImpl = fake((call) => {
        if (call.url.includes('/hexes?')) return json({ items: [], nextCursor: null });
        if (call.url === '/api/generate/preview') return json({ envelope: { ok: true }, hash: HASH, allowance: allow(39) });
        if (call.url.endsWith('/generate') && phase === 'one') return json({ rows: [row()], skipped: [], allowance: allow(38) });
        if (call.url.endsWith('/generate') && phase === 'omit') return json({ rows: [row({ rev: 2 })], skipped: [] });
        if (call.url.endsWith('/generate') && phase === 'job') return json({ jobId: 'job-1', allowance: allow(20) });
        if (call.url.includes('/jobs/')) return json(jobDone());
        if (call.url.endsWith('/generate') && phase === 'grow') {
            return json({
                sectors: [{
                    id: '~0123456789ABCDEFGHJKMNPQRS',
                    slot: { x: 4, y: -7 },
                    name: 'Far',
                    subsectors: ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
                    rev: 1,
                    deleted: false,
                }],
                rows: [],
                skipped: [],
                jobId: null,
                allowance: allow(12),
            });
        }
        throw new Error('unexpected ' + call.url);
    });
    const map = open(fetchImpl);
    const screen = asBuildStore(map);
    await map.preview(KEY, 'MgT2E', 'top-down', 1);
    assert.equal(map.allowance().remaining, 39);
    await map.generate({ hexKeys: [KEY], edition: 'MgT2E', generator: 'top-down', roll: 0, filledToo: true }).finished;
    assert.equal(map.allowance().remaining, 38);
    assert.equal(map.row(KEY).rev, 1);
    phase = 'omit';
    await map.generate({ hexKeys: [KEY], edition: 'MgT2E', generator: 'top-down', roll: 2, filledToo: true }).finished;
    assert.equal(map.allowance().remaining, 38);
    phase = 'job';
    await map.generate({
        hexKeys: ['spin/1910', 'spin/1911'],
        edition: 'MgT2E',
        generator: 'top-down',
        roll: 0,
        filledToo: true,
    }).finished;
    assert.equal(screen.allowance().remaining, 20);
    assert.equal(map.job.value.undo.id.startsWith('undo-'), true);
    phase = 'grow';
    const act = map.generateGrowing({
        hexKeys: ['~slot_4_-7/0101'],
        edition: 'MgT2E',
        generator: 'top-down',
        roll: 0,
        filledToo: true,
        makeSectors: [{ name: 'Far', slot: { x: 4, y: -7 } }],
    });
    await act.finished;
    assert.equal(map.allowance().remaining, 12);
    map.close();
    await reset();
});

test('a 429 leaves the map and the job untouched and updates the number', async () => {
    await signIn('ada', 'user', allow(1));
    const details = { code: 'generation_allowance', remaining: 0, limit: 100, resetsAt: RESET };
    const fetchImpl = fake((call) => {
        if (call.url.includes('/hexes?')) return json({ items: [], nextCursor: null });
        if (call.url.endsWith('/generate')) return refusal(SENTENCE, details);
        if (call.url === '/api/generate/preview') return refusal(SENTENCE, details);
        throw new Error('unexpected ' + call.url);
    });
    const map = open(fetchImpl);
    const screen = asBuildStore(map);
    await assert.rejects(
        () => map.generate({ hexKeys: [KEY], edition: 'MgT2E', generator: 'top-down', roll: 0, filledToo: false }).finished,
        (err) => {
            assert.equal(err instanceof AllowanceRefused, true);
            assert.equal(err.code, 'generation_allowance');
            assert.equal(err.message, SENTENCE);
            assert.equal(err.remaining, 0);
            assert.equal(err.limit, 100);
            assert.equal(err.resetsAt, RESET);
            return true;
        },
    );
    assert.equal(map.row(KEY), null);
    assert.equal(map.job.value, null);
    assert.equal(map.lastError.value, '');
    assert.equal(fetchImpl.calls.some((call) => call.url.includes('/jobs/')), false);
    assert.equal(map.allowance().remaining, 0);
    assert.equal(map.allowance().used, 100);
    await assert.rejects(
        () => screen.preview(KEY, { engine: 'MgT2E', generator: 'top-down' }, 3, null),
        (err) => err instanceof AllowanceRefused && err.message === SENTENCE,
    );
    const limited = fake((call) => {
        if (call.url === '/api/generate/preview') {
            return { ok: false, status: 429, json: async () => ({ ok: false, error: { code: 'rate_limited', message: 'Too many requests.', details: { code: 'rate_limited' } } }) };
        }
        throw new Error('unexpected ' + call.url);
    });
    const other = open(limited);
    await assert.rejects(
        () => other.preview(KEY, 'MgT2E', 'top-down', 0),
        (err) => {
            assert.equal(err instanceof AllowanceRefused, false);
            assert.equal(err.message, 'Too many requests.');
            return true;
        },
    );
    assert.equal(other.allowance().remaining, 0);
    map.close();
    other.close();
    await reset();
});

test('signed out holds nothing, and a second account never shows the first number', async () => {
    await signIn('ada', 'user', allow(40));
    const fetchImpl = fake((call) => {
        if (call.url.endsWith('/generate')) return json({ rows: [row()], skipped: [], allowance: allow(1) });
        throw new Error('unexpected ' + call.url);
    });
    await reset();
    assert.equal(session.user, null);
    assert.equal(readAllowance(), null);
    const map = open(fetchImpl);
    await map.generate({ hexKeys: [KEY], edition: 'MgT2E', generator: 'top-down', roll: 0, filledToo: true }).finished;
    assert.equal(session.allowance, null);
    assert.equal(map.allowance(), null);
    map.close();

    let release = () => {};
    const gate = new Promise((resolve) => { release = resolve; });
    const pending = loadSession(async (url) => {
        if (!String(url).includes('/api/me')) return quiet();
        await gate;
        return me('ada', 'user', allow(40));
    });
    await signOut(quiet);
    release();
    await pending;
    assert.equal(session.user, null);
    assert.equal(session.allowance, null);
    await loadSession(async (url) => (String(url).includes('/api/me') ? me('bea', 'user', allow(9)) : quiet()));
    assert.equal(session.user.id, 'bea');
    assert.equal(readAllowance().remaining, 9);
    noteAllowance(allow(1), 'ada');
    assert.equal(session.allowance.remaining, 9);
    await reset();
});

test('a read after resetsAt asks GET /api/me once', async () => {
    await reset();
    const stale = allow(4, { resetsAt: '2026-10-12T00:00:00.000Z' });
    const fresh = allow(100, { used: 0, resetsAt: RESET });
    let body = me('ada', 'user', stale);
    const urls = [];
    const fetchImpl = async (url) => {
        urls.push(String(url));
        if (String(url).includes('/api/me')) return body;
        return quiet();
    };
    await loadSession(fetchImpl);
    assert.equal(urls.filter((url) => url.includes('/api/me')).length, 1);
    body = me('ada', 'user', fresh);
    const now = Date.parse(stale.resetsAt);
    assert.equal(readAllowance(now).remaining, 4);
    const started = Date.now();
    while (readAllowance(now).remaining !== 100) {
        if (Date.now() - started > 1000) throw new Error('the allowance was not replaced');
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
    assert.equal(urls.filter((url) => url.includes('/api/me')).length, 2);
    readAllowance(Date.parse(RESET) - 1);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(urls.filter((url) => url.includes('/api/me')).length, 2);
    await reset();
});
