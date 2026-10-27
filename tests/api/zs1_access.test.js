/**
 * ZS1 round B: who may call what, black-box on the worker (findings/zs1_access.md).
 * A stranger, a player, a revoked player, a player of another campaign, a token
 * for another campaign, a revoked, expired or narrow token, a banned owner's
 * token, and a signed-out caller. A referee-only string starts with ZREF_.
 * Own port 18911 (inspector 19911) and a temp D1; agent access is on in that D1 only.
 */
import assert from 'node:assert/strict';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { removeTree, runWrangler } from './session.js';
import { startDev, stopDev, wranglerBin } from './server.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = 18911;
const STAMP = '2026-10-18T00:00:00.000Z';

function authSecret() {
    const text = readFileSync(path.join(root, 'apps', 'api', '.dev.vars'), 'utf8');
    const line = text.split(/\r?\n/).find((item) => item.startsWith('BETTER_AUTH_SECRET='));
    if (!line) throw new Error('BETTER_AUTH_SECRET is unset');
    const value = line.slice('BETTER_AUTH_SECRET='.length).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) return value.slice(1, -1);
    return value;
}

function sqlFile(persistTo, sql) {
    const dir = mkdtempSync(path.join(tmpdir(), 'voyage-zs1-sql-'));
    const file = path.join(dir, 'rows.sql');
    writeFileSync(file, sql);
    try {
        runWrangler(['d1', 'execute', 'voyage', '--local', '--persist-to', persistTo, '--file', file]);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

function accountSql(people) {
    const now = Date.now();
    const expires = now + 30 * 24 * 60 * 60 * 1000;
    const secret = authSecret();
    const lines = [];
    const cookies = {};
    for (const person of people) {
        const token = randomBytes(32).toString('hex');
        const sessionId = `${person.id}-${randomBytes(4).toString('hex')}`;
        lines.push(`INSERT INTO user (id, name, email, email_verified, created_at, updated_at, role, banned)
VALUES ('${person.id}', '${person.id}', '${person.id}@localhost', 1, ${now}, ${now}, 'user', ${person.banned ? 1 : 0});`);
        lines.push(`INSERT INTO profile (user_id, handle, display_name, created_at)
VALUES ('${person.id}', '${person.handle}', '${person.handle}', '${STAMP}');`);
        lines.push(`INSERT INTO session (id, expires_at, token, created_at, updated_at, user_id)
VALUES ('${sessionId}', ${expires}, '${token}', ${now}, ${now}, '${person.id}');`);
        const signature = createHmac('sha256', secret).update(token).digest('base64');
        cookies[person.id] = `__Secure-better-auth.session_token=${encodeURIComponent(`${token}.${signature}`)}`;
    }
    return { sql: lines.join('\n'), cookies };
}

function tokenSql(id, userId, secret, expiresAt, revokedAt = null) {
    const hash = createHash('sha256').update(secret).digest('hex');
    return `INSERT INTO access_tokens (id, user_id, name, prefix, token_hash, scopes, universe_id, created_at, expires_at, last_used_at, revoked_at)
VALUES ('${id}', '${userId}', '${id}', '${secret.slice(0, 12)}', '${hash}', '["campaign:read","proposals:write"]', NULL, '${STAMP}', '${expiresAt}', NULL, ${revokedAt ? `'${revokedAt}'` : 'NULL'});`;
}

function rid(n) {
    return `cr_${n.toString(16).padStart(8, '0')}-0000-4000-8000-0000000005a1`;
}

function jid(n) {
    return `cj_${n.toString(16).padStart(8, '0')}-0000-4000-8000-0000000005a1`;
}

function record(id, over = {}) {
    return {
        id, type: 'place', kind: '', name: 'Place', summary: '', details: '', tags: [], anchor: null, when: null,
        visibility: 'referee', playerNotes: null, sheet: null, status: null, images: null, provenance: null,
        rev: 0, createdAt: STAMP, updatedAt: STAMP, deleted: false, baseRev: 0, ...over,
    };
}

function entry(id, over = {}) {
    return {
        id, kind: 'note', title: '', body: '', when: null, realDate: null, sequence: null, author: 'referee',
        visibility: 'players', anchor: null, mentions: [], rev: 0, createdAt: STAMP, updatedAt: STAMP,
        deleted: false, baseRev: 0, ...over,
    };
}

function evidence() {
    return [{ at: '00:01', quote: 'Heard at the table.' }];
}

function batch(key, proposals) {
    return { format: 'voyage-proposals', schemaVersion: 1, idempotencyKey: key, source: { kind: 'notes', label: 'ZS1', realDate: null }, proposals };
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function up(url) {
    const deadline = Date.now() + 90000;
    let last = '';
    while (Date.now() < deadline) {
        try {
            const response = await fetch(`${url}/api/health`);
            if (response.ok) return;
            last = `status ${response.status}`;
        } catch (err) {
            last = err instanceof Error ? err.message : String(err);
        }
        await sleep(400);
    }
    throw new Error(last || 'wrangler dev did not answer /api/health');
}

async function jsonFetch(url, options = {}) {
    const response = await fetch(url, options);
    const text = await response.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text }; }
    return { status: response.status, body, headers: response.headers, text };
}

if (process.env.RUN_API_TESTS !== '1') {
    test('zs1 access on the worker', { skip: 'set RUN_API_TESTS=1' }, () => {});
} else if (!existsSync(wranglerBin)) {
    test('zs1 access on the worker', { skip: 'wrangler is absent' }, () => {});
} else {
    test('zs1 access on the worker', { timeout: 300000 }, async (t) => {
        const persistTo = mkdtempSync(path.join(tmpdir(), 'voyage-zs1-'));
        const base = `http://127.0.0.1:${PORT}`;
        const people = [
            { id: 'zs-oa', handle: 'zsoa' },
            { id: 'zs-ob', handle: 'zsob' },
            { id: 'zs-pa', handle: 'zspa' },
            { id: 'zs-ra', handle: 'zsra' },
            { id: 'zs-pb', handle: 'zspb' },
            { id: 'zs-x', handle: 'zsx' },
            { id: 'zs-ban', handle: 'zsban', banned: true },
        ];
        const { sql, cookies } = accountSql(people);
        const expired = `tv_pat_${'x'.repeat(43)}`;
        const banned = `tv_pat_${'y'.repeat(43)}`;
        const players = `tv_pat_${'z'.repeat(43)}`;
        let child = null;
        try {
            runWrangler(['d1', 'migrations', 'apply', 'voyage', '--local', '--persist-to', persistTo]);
            sqlFile(persistTo, `${sql}
INSERT INTO platform_flags (key, value, updated_at, updated_by) VALUES ('agent_access', 'on', '${STAMP}', 'zs-oa');
${tokenSql('at_zs1_expired', 'zs-oa', expired, '2020-01-01T00:00:00.000Z')}
${tokenSql('at_zs1_banned', 'zs-ban', banned, '2099-01-01T00:00:00.000Z')}
${tokenSql('at_zs1_player', 'zs-pa', players, '2099-01-01T00:00:00.000Z')}
`);
            child = startDev({ port: PORT, persistTo, inspectorPort: 19911 });
            await up(base);
            const c = cookies;
            const json = (cookie) => ({ 'content-type': 'application/json', cookie, origin: base });
            const bearer = (secret) => ({ 'content-type': 'application/json', authorization: `Bearer ${secret}` });

            async function universe(cookie, name) {
                const made = await jsonFetch(`${base}/api/universes`, { method: 'POST', headers: json(cookie), body: JSON.stringify({ name, truthVersion: null, editionDefault: 'MgT2E' }) });
                assert.equal(made.status, 201, JSON.stringify(made.body));
                return made.body.data.id;
            }
            const A = await universe(c['zs-oa'], 'ZS1 A');
            const A2 = await universe(c['zs-oa'], 'ZS1 A2');
            const B = await universe(c['zs-ob'], 'ZS1 B');
            const at = (id) => `${base}/api/universes/${id}`;

            async function change(id, cookie, body) {
                const res = await jsonFetch(`${at(id)}/campaign/changes`, { method: 'PATCH', headers: json(cookie), body: JSON.stringify(body) });
                assert.equal(res.status, 200, JSON.stringify(res.body));
                assert.deepEqual(res.body.data.conflicts, [], JSON.stringify(res.body));
            }
            const H = rid(1);
            const P = rid(2);
            const CR = rid(3);
            const BR = rid(9);
            await change(A, c['zs-oa'], {
                records: [
                    record(H, { name: 'ZREF_place', details: 'ZREF_details' }),
                    record(P, { name: 'ZPLAY_place', visibility: 'players', details: `See [[${H}]] and ${H}.\n:::referee\nZREF_block\n:::\nStill here.` }),
                ],
            });
            await change(A, c['zs-oa'], { journal: [entry(jid(1), { title: 'ZPLAY_note', body: `Met [[${H}|ZREF_label]].\r\n:::referee\r\nZREF_crlf\r\n:::\r\nDone.` })] });
            const lone = await jsonFetch(`${at(A)}/campaign/changes`, {
                method: 'PATCH',
                headers: json(c['zs-oa']),
                body: JSON.stringify({ records: [record(CR, { name: 'ZPLAY_cr', visibility: 'players', details: 'Open.\r:::referee\rZREF_lonecr\r:::\rStill.' })] }),
            });
            await change(B, c['zs-ob'], { records: [record(BR, { name: 'ZREF_other' })] });

            async function joinAll(id, owner, who) {
                const invite = await jsonFetch(`${at(id)}/players/invite`, { method: 'POST', headers: json(owner) });
                assert.equal(invite.body?.ok, true, JSON.stringify(invite.body));
                const token = invite.body.data.url.split('/join/')[1];
                for (const cookie of who) {
                    const claimed = await jsonFetch(`${base}/api/join`, { method: 'POST', headers: json(cookie), body: JSON.stringify({ token }) });
                    assert.equal(claimed.status, 200, JSON.stringify(claimed.body));
                }
            }
            await joinAll(A, c['zs-oa'], [c['zs-pa'], c['zs-ra']]);
            await joinAll(B, c['zs-ob'], [c['zs-pb']]);
            const archived = await jsonFetch(`${at(A)}/players/zs-ra`, { method: 'DELETE', headers: json(c['zs-oa']) });
            assert.equal(archived.body?.data?.status, 'archived', JSON.stringify(archived.body));

            async function mint(cookie, name, scopes, universeId) {
                const res = await jsonFetch(`${base}/api/tokens`, { method: 'POST', headers: json(cookie), body: JSON.stringify({ name, scopes, universeId }) });
                assert.equal(res.status, 201, JSON.stringify(res.body?.error));
                return res.body.data;
            }
            const both = ['campaign:read', 'proposals:write'];
            const tA = (await mint(c['zs-oa'], 'A', both, A)).token;
            const tA2 = (await mint(c['zs-oa'], 'A2', both, A2)).token;
            const tRead = (await mint(c['zs-oa'], 'read', ['campaign:read'], A)).token;
            const tWrite = (await mint(c['zs-oa'], 'write', ['proposals:write'], A)).token;
            const tFree = (await mint(c['zs-oa'], 'free', both, null)).token;
            const tB = (await mint(c['zs-ob'], 'B', both, B)).token;
            const tProbe = (await mint(c['zs-oa'], 'probe', both, A)).token;
            const tShape = (await mint(c['zs-oa'], 'shape', both, A)).token;
            const gone = await mint(c['zs-oa'], 'gone', both, A);
            const revoked = await jsonFetch(`${base}/api/tokens/${gone.row.id}`, { method: 'DELETE', headers: json(c['zs-oa']) });
            assert.equal(revoked.status < 300, true, JSON.stringify(revoked.body));
            const tGone = gone.token;

            const memberRead = (id, cookie) => jsonFetch(`${at(id)}/campaign?after=0&limit=1000`, { headers: { cookie } });
            const agentPaths = (id) => [
                `${at(id)}/campaign?after=0&limit=1000`,
                `${at(id)}/campaign/index`,
                `${at(id)}/campaign/records?ids=${H}`,
                `${at(id)}/campaign/search?q=ZREF`,
                `${at(id)}/campaign/proposals`,
            ];

            await t.test('a signed-out caller is refused everywhere', async () => {
                for (const url of [...agentPaths(A), `${at(A)}/campaign/export`, `${base}/api/tokens`, `${base}/api/agent/campaigns`]) {
                    const res = await jsonFetch(url);
                    assert.equal(res.status, 401, `${url} ${res.status}`);
                    assert.equal(res.text.includes('ZREF_'), false, url);
                }
                const post = await jsonFetch(`${at(A)}/campaign/proposals`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(batch('zs1-out-0001', [{ op: 'question', text: 'Who?', evidence: evidence() }])) });
                assert.equal(post.status, 401, post.text);
            });

            await t.test('a stranger and a player of another campaign read A as missing', async () => {
                for (const who of ['zs-x', 'zs-pb']) {
                    for (const url of [...agentPaths(A), `${at(A)}/campaign/export`]) {
                        const res = await jsonFetch(url, { headers: { cookie: c[who] } });
                        assert.equal(res.status, 404, `${who} ${url} ${res.status}`);
                        assert.equal(res.text.includes('ZREF_'), false, url);
                    }
                    const post = await jsonFetch(`${at(A)}/campaign/proposals`, { method: 'POST', headers: json(c[who]), body: JSON.stringify(batch(`zs1-${who}-01`, [{ op: 'question', text: 'Who?', evidence: evidence() }])) });
                    assert.equal(post.status === 403 || post.status === 404, true, `${who} ${post.text}`);
                }
                const list = await jsonFetch(`${at(A)}/campaign/proposals`, { headers: bearer(tA) });
                assert.equal(list.text.includes('zs1-zs-'), false);
            });

            await t.test('ZS1 FINDING: a stranger posting a paste to a real campaign gets the missing-campaign answer', async () => {
                const body = JSON.stringify(batch('zs1-oracle-01', [{ op: 'question', text: 'Who?', evidence: evidence() }]));
                const real = await jsonFetch(`${at(A)}/campaign/proposals`, { method: 'POST', headers: json(c['zs-x']), body });
                const missing = await jsonFetch(`${base}/api/universes/uni_missing/campaign/proposals`, { method: 'POST', headers: json(c['zs-x']), body });
                assert.equal(missing.status, 404, missing.text);
                assert.deepEqual({ status: real.status, body: real.body }, { status: missing.status, body: missing.body });
            });

            await t.test('a player reads the players view and nothing of the owner tools', async () => {
                const res = await memberRead(A, c['zs-pa']);
                assert.equal(res.status, 200, res.text);
                assert.equal(res.text.includes('ZPLAY_place'), true);
                for (const leak of ['ZREF_place', 'ZREF_details', 'ZREF_block', 'ZREF_crlf', 'ZREF_label', H, 'ZREF_other']) {
                    assert.equal(res.text.includes(leak), false, leak);
                }
                for (const url of agentPaths(A).slice(1).concat(`${at(A)}/campaign/export`)) {
                    const owner = await jsonFetch(url, { headers: { cookie: c['zs-pa'] } });
                    assert.equal(owner.status, 404, `${url} ${owner.status}`);
                    assert.equal(owner.text.includes('ZREF_'), false, url);
                }
                const post = await jsonFetch(`${at(A)}/campaign/proposals`, { method: 'POST', headers: json(c['zs-pa']), body: JSON.stringify(batch('zs1-player-01', [{ op: 'question', text: 'Who?', evidence: evidence() }])) });
                assert.equal(post.status, 403, post.text);
                const list = await jsonFetch(`${base}/api/agent/campaigns`, { headers: { cookie: c['zs-pa'] } });
                assert.equal(list.status, 200, list.text);
                assert.deepEqual(list.body.data.items, []);
                const write = await jsonFetch(`${at(A)}/campaign/changes`, { method: 'PATCH', headers: json(c['zs-pa']), body: JSON.stringify({ records: [record(rid(20), { name: 'ZPLAY_forged', visibility: 'players' })] }) });
                assert.equal(write.status >= 400, true, write.text);
                const after = await memberRead(A, c['zs-oa']);
                assert.equal(after.text.includes('ZPLAY_forged'), false);
            });

            await t.test('a revoked player is refused at once', async () => {
                const res = await memberRead(A, c['zs-ra']);
                assert.equal(res.status, 403, res.text);
                assert.equal(res.text.includes('ZPLAY_place'), false);
                const index = await jsonFetch(`${at(A)}/campaign/index`, { headers: { cookie: c['zs-ra'] } });
                assert.equal(index.status, 404, index.text);
            });

            await t.test('a token reads only the one campaign it is bound to, as its owner', async () => {
                for (const url of agentPaths(A)) {
                    const own = await jsonFetch(url, { headers: bearer(tA) });
                    assert.equal(own.status, 200, `${url} ${own.text.slice(0, 200)}`);
                    for (const [name, secret] of [['A2', tA2], ['B', tB], ['player', players]]) {
                        const res = await jsonFetch(url, { headers: bearer(secret) });
                        assert.equal(res.status, 404, `${name} ${url} ${res.status}`);
                        assert.equal(res.text.includes('ZREF_'), false, `${name} ${url}`);
                    }
                }
                const free = await jsonFetch(`${at(A)}/campaign/index`, { headers: bearer(tFree) });
                assert.equal(free.status, 200, free.text);
                const freeOther = await jsonFetch(`${at(B)}/campaign/index`, { headers: bearer(tFree) });
                assert.equal(freeOther.status, 404, freeOther.text);
                const spoof = await jsonFetch(`${at(B)}/campaign/index`, { headers: { ...bearer(tA), 'x-voyage-user-id': 'zs-ob', 'x-voyage-universe-id': B } });
                assert.equal(spoof.status, 404, spoof.text);
                const listed = await jsonFetch(`${base}/api/agent/campaigns`, { headers: bearer(players) });
                assert.equal(listed.status, 200, listed.text);
                assert.equal(listed.text.includes(A), false);
            });

            await t.test('a revoked, expired, banned or made-up token is refused', async () => {
                for (const [name, secret] of [['revoked', tGone], ['expired', expired], ['banned', banned], ['made up', `tv_pat_${'q'.repeat(43)}`], ['no prefix', 'q'.repeat(50)]]) {
                    for (const url of [`${at(A)}/campaign/index`, `${base}/api/agent/campaigns`]) {
                        const res = await jsonFetch(url, { headers: bearer(secret) });
                        assert.equal(res.status === 401 || res.status === 403, true, `${name} ${url} ${res.status} ${res.text}`);
                        assert.equal(res.text.includes('ZREF_'), false);
                    }
                }
            });

            await t.test('a token holds only the scopes it names', async () => {
                const read = await jsonFetch(`${at(A)}/campaign/proposals`, { method: 'POST', headers: bearer(tRead), body: JSON.stringify(batch('zs1-scope-01', [{ op: 'question', text: 'Who?', evidence: evidence() }])) });
                assert.equal(read.status, 403, read.text);
                assert.equal(read.body?.error?.code, 'scope_missing');
                const write = await jsonFetch(`${at(A)}/campaign/index`, { headers: bearer(tWrite) });
                assert.equal(write.status, 403, write.text);
                assert.equal(write.body?.error?.code, 'scope_missing');
            });

            await t.test('a token cannot reach a cookie-only route', async () => {
                const routes = [
                    ['PATCH', `${at(A)}/campaign/changes`, '{}'],
                    ['GET', `${at(A)}/campaign/export`, null],
                    ['GET', `${at(A)}/players`, null],
                    ['POST', `${at(A)}/players/invite`, null],
                    ['GET', `${base}/api/tokens`, null],
                    ['POST', `${base}/api/table-sets`, JSON.stringify({ copyOf: 'official:trade' })],
                    ['DELETE', `${at(A)}`, null],
                ];
                for (const [method, url, body] of routes) {
                    const res = await jsonFetch(url, { method, headers: bearer(tA), ...(body ? { body } : {}) });
                    assert.equal(res.status, 401, `${method} ${url} ${res.status} ${res.text.slice(0, 200)}`);
                }
                const still = await jsonFetch(`${at(A)}/campaign/index`, { headers: bearer(tA) });
                assert.equal(still.status, 200);
            });

            await t.test('a proposal cannot name another campaign or a field its op does not hold', async () => {
                const post = (key, proposals, secret = tA) => jsonFetch(`${at(A)}/campaign/proposals`, { method: 'POST', headers: bearer(secret), body: JSON.stringify(batch(key, proposals)) });
                const foreign = await post('zs1-foreign-01', [{ op: 'record.update', id: BR, baseRev: 0, set: { name: 'ZPLAY_taken' }, evidence: evidence() }], tProbe);
                const missing = await post('zs1-foreign-02', [{ op: 'record.update', id: rid(0x77), baseRev: 0, set: { name: 'ZPLAY_taken' }, evidence: evidence() }], tProbe);
                assert.equal(foreign.status, 400, foreign.text);
                assert.deepEqual(foreign.body, missing.body);
                const shapes = [
                    { op: 'record.update', id: H, baseRev: 0, set: { visibility: 'players' }, evidence: evidence() },
                    { op: 'record.update', id: H, baseRev: 0, set: { name: 'x', images: [] }, evidence: evidence() },
                    { op: 'record.update', id: H, baseRev: 0, universeId: B, set: { name: 'x' }, evidence: evidence() },
                    { op: 'record.create', ref: 'zs', record: { type: 'place', kind: '', name: 'x', summary: '', details: '', tags: [], anchor: null, visibility: 'players' }, evidence: evidence() },
                    { op: 'record.create', ref: 'zs', record: { type: 'place', kind: '', name: 'x', summary: '', details: '', tags: [], anchor: null, sheet: {} }, evidence: evidence() },
                    { op: 'journal.create', entry: { kind: 'note', title: 'x', body: '', when: null, realDate: null, sequence: null, anchor: null, visibility: 'players' }, evidence: evidence() },
                    { op: 'journal.create', entry: { kind: 'note', title: 'x', body: '', when: null, realDate: null, sequence: null, anchor: null, author: 'players' }, evidence: evidence() },
                    { op: 'link.create', link: { from: { id: P }, to: { id: BR }, kind: 'contact' }, evidence: evidence() },
                ];
                for (const [i, shape] of shapes.entries()) {
                    const res = await post(`zs1-shape-${String(i).padStart(2, '0')}`, [shape], tShape);
                    assert.equal(res.status, 400, `${i} ${res.text.slice(0, 300)}`);
                }
                const extra = await jsonFetch(`${at(A)}/campaign/proposals`, { method: 'POST', headers: bearer(tProbe), body: JSON.stringify({ ...batch('zs1-extra-01', [{ op: 'question', text: 'Who?', evidence: evidence() }]), universeId: B }) });
                assert.equal(extra.status, 400, extra.text);
                const before = await jsonFetch(`${at(B)}/campaign?after=0&limit=1000`, { headers: { cookie: c['zs-ob'] } });
                assert.equal(before.text.includes('ZREF_other'), true);
                assert.equal(before.text.includes('ZPLAY_taken'), false);
            });

            await t.test('a batch is resolved only by its own owner on its own campaign', async () => {
                const full = await memberRead(A, c['zs-oa']);
                const rev = full.body.data.records.find((row) => row.id === H).rev;
                const made = await jsonFetch(`${at(A)}/campaign/proposals`, { method: 'POST', headers: bearer(tA), body: JSON.stringify(batch('zs1-resolve-01', [{ op: 'record.update', id: H, baseRev: rev, set: { name: 'ZREF_renamed' }, evidence: evidence() }])) });
                assert.equal(made.status < 300, true, made.text);
                const batchId = made.body.data.batch.id;
                const proposalId = made.body.data.batch.proposals[0].id;
                const decision = JSON.stringify({ decisions: [{ proposalId, action: 'accept', baseRev: rev }] });
                const tries = [
                    ['player', `${at(A)}/campaign/proposals/${batchId}/resolve`, c['zs-pa'], 404],
                    ['stranger', `${at(A)}/campaign/proposals/${batchId}/resolve`, c['zs-x'], 404],
                    ['other owner on own campaign', `${at(B)}/campaign/proposals/${batchId}/resolve`, c['zs-ob'], 404],
                    ['owner on the wrong campaign', `${at(A2)}/campaign/proposals/${batchId}/resolve`, c['zs-oa'], 404],
                ];
                for (const [name, url, cookie, status] of tries) {
                    const res = await jsonFetch(url, { method: 'POST', headers: json(cookie), body: decision });
                    assert.equal(res.status, status, `${name} ${res.status} ${res.text.slice(0, 200)}`);
                }
                for (const [name, url, cookie] of [['player', `${at(A)}/campaign/proposals/${batchId}`, c['zs-pa']], ['other owner', `${at(B)}/campaign/proposals/${batchId}`, c['zs-ob']]]) {
                    const res = await jsonFetch(url, { method: 'DELETE', headers: json(cookie) });
                    assert.equal(res.status, 404, `${name} ${res.status}`);
                    const read = await jsonFetch(url, { headers: { cookie } });
                    assert.equal(read.status, 404, `${name} read ${read.status}`);
                }
                const accepted = await jsonFetch(`${at(A)}/campaign/proposals/${batchId}/resolve`, { method: 'POST', headers: json(c['zs-oa']), body: decision });
                assert.equal(accepted.status, 200, accepted.text.slice(0, 300));
                assert.equal(accepted.body.data.applied.length, 1, accepted.text.slice(0, 400));
                const member = await memberRead(A, c['zs-pa']);
                assert.equal(member.text.includes('ZREF_renamed'), false);
                const owner = await memberRead(A, c['zs-oa']);
                assert.equal(owner.text.includes('ZREF_renamed'), true);
            });

            await t.test('table sets stay with their owner and the campaigns that chose them', async () => {
                const made = await jsonFetch(`${base}/api/table-sets`, { method: 'POST', headers: json(c['zs-oa']), body: JSON.stringify({ copyOf: 'official:trade', name: 'ZREF_set' }) });
                assert.equal(made.status, 201, made.text.slice(0, 300));
                const id = made.body.data.id ?? made.body.data.row?.id;
                assert.ok(id, made.text.slice(0, 300));
                const url = `${base}/api/table-sets/${id}`;
                assert.equal((await jsonFetch(url)).status, 401);
                for (const who of ['zs-x', 'zs-pb', 'zs-pa', 'zs-ob']) {
                    const res = await jsonFetch(url, { headers: { cookie: c[who] } });
                    assert.equal(res.status, 404, `${who} ${res.status}`);
                    assert.equal(res.text.includes('ZREF_set'), false, who);
                }
                const put = await jsonFetch(url, { method: 'PUT', headers: json(c['zs-ob']), body: JSON.stringify({ name: 'x' }) });
                assert.equal(put.status, 404, put.text.slice(0, 200));
                const del = await jsonFetch(url, { method: 'DELETE', headers: json(c['zs-ob']) });
                assert.equal(del.status, 404, del.text.slice(0, 200));
                const copy = await jsonFetch(`${base}/api/table-sets`, { method: 'POST', headers: json(c['zs-ob']), body: JSON.stringify({ copyOf: id }) });
                assert.equal(copy.status, 404, copy.text.slice(0, 200));
                const mine = await jsonFetch(url, { headers: { cookie: c['zs-oa'] } });
                assert.equal(mine.status, 200, mine.text.slice(0, 200));
            });

            await t.test('the demo body holds no referee text, id or account', async () => {
                sqlFile(persistTo, `UPDATE universes SET demo = 1 WHERE id = '${A}';`);
                const res = await jsonFetch(`${base}/api/demo/campaign`);
                assert.equal(res.status, 200, res.text.slice(0, 300));
                assert.equal(res.text.includes('ZPLAY_place'), true);
                for (const leak of ['ZREF_place', 'ZREF_details', 'ZREF_block', 'ZREF_crlf', 'ZREF_label', 'ZREF_renamed', H, 'zs-oa', 'zs-pa', 'zsoa', 'zspa']) {
                    assert.equal(res.text.includes(leak), false, leak);
                }
            });

            await t.test('ZS1 SECURITY: a lone-CR referee block is absent for players and the demo', async () => {
                assert.equal(lone.status, 200, lone.text.slice(0, 300));
                const member = await memberRead(A, c['zs-pa']);
                assert.equal(member.text.includes('ZPLAY_cr'), true);
                assert.equal(member.text.includes('ZREF_lonecr'), false, 'member read');
                const demo = await jsonFetch(`${base}/api/demo/campaign`);
                assert.equal(demo.text.includes('ZREF_lonecr'), false, 'demo');
            });

            await t.test('MCP holds the same binding', async () => {
                const call = (secret, name, args) => jsonFetch(`${base}/mcp`, {
                    method: 'POST',
                    headers: { ...bearer(secret), accept: 'application/json, text/event-stream' },
                    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
                });
                const own = await call(tA, 'read_campaign_index', { universeId: A });
                assert.equal(own.status, 200, own.text.slice(0, 300));
                assert.equal(own.text.includes('ZREF_renamed'), true, own.text.slice(0, 300));
                for (const [name, secret] of [['A2', tA2], ['B', tB], ['player', players]]) {
                    const res = await call(secret, 'read_campaign_index', { universeId: A });
                    assert.equal(res.text.includes('ZREF_'), false, name);
                    assert.equal(res.text.includes('No such universe'), true, `${name} ${res.text.slice(0, 300)}`);
                }
                const narrow = await call(tRead, 'submit_proposals', { universeId: A, batch: batch('zs1-mcp-01', [{ op: 'question', text: 'Who?', evidence: evidence() }]) });
                assert.equal(narrow.text.includes('scope_missing'), true, narrow.text.slice(0, 300));
                for (const [name, secret] of [['revoked', tGone], ['expired', expired], ['banned', banned]]) {
                    const res = await call(secret, 'list_campaigns', {});
                    assert.equal(res.status === 401 || res.status === 403, true, `${name} ${res.status}`);
                }
            });
        } finally {
            stopDev(child?.pid);
            removeTree(persistTo);
        }
    });
}