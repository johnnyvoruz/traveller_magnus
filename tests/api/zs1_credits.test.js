/**
 * ZS1 round C: the credit register (BT1c), black-box on the worker (findings/zs1_access.md).
 * Contract (directives/contracts/b_player_credits.md:59): a stranger, and an account with
 * no access to the character, is 404 "No such character." The campaign owner meant at
 * :23 is the owner of a campaign the character plays in.
 * Own port 18912 (inspector 19912) and a temp D1.
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
const PORT = 18912;
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
    test('zs1 credits on the worker', { skip: 'set RUN_API_TESTS=1' }, () => {});
} else if (!existsSync(wranglerBin)) {
    test('zs1 credits on the worker', { skip: 'wrangler is absent' }, () => {});
} else {
    test('zs1 credits on the worker', { timeout: 300000 }, async (t) => {
        const persistTo = mkdtempSync(path.join(tmpdir(), 'voyage-zs1-'));
        const base = `http://127.0.0.1:${PORT}`;
        const { sql, cookies: c } = accountSql([
            { id: 'zc-owner', handle: 'zcowner' },
            { id: 'zc-player', handle: 'zcplayer' },
            { id: 'zc-x', handle: 'zcx' },
        ]);
        let child = null;
        try {
            runWrangler(['d1', 'migrations', 'apply', 'voyage', '--local', '--persist-to', persistTo]);
            sqlFile(persistTo, sql);
            child = startDev({ port: PORT, persistTo, inspectorPort: 19912 });
            await up(base);
            const json = (cookie) => ({ 'content-type': 'application/json', cookie, origin: base });
            const made = await jsonFetch(`${base}/api/characters`, { method: 'POST', headers: json(c['zc-owner']), body: JSON.stringify({ name: 'Voss' }) });
            assert.equal(made.status, 201, made.text.slice(0, 300));
            const id = made.body.data.character.id;
            const ledger = `${base}/api/characters/${encodeURIComponent(id)}/ledger`;
            const line = (memo) => JSON.stringify({ kind: 'pay', amount: 5000, memo });
            const own = await jsonFetch(ledger, { method: 'POST', headers: json(c['zc-owner']), body: line('ZPLAY_berth') });
            assert.equal(own.status, 201, own.text.slice(0, 300));
            const lineId = own.body.data.id;

            await t.test('a signed-out caller, a stranger and a player with no grant read and write nothing', async () => {
                assert.equal((await jsonFetch(ledger)).status, 401);
                assert.equal((await jsonFetch(ledger, { method: 'POST', headers: { 'content-type': 'application/json', origin: base }, body: line('x') })).status, 401);
                for (const who of ['zc-x', 'zc-player']) {
                    const read = await jsonFetch(ledger, { headers: { cookie: c[who] } });
                    assert.equal(read.status, 404, `${who} ${read.text}`);
                    assert.equal(read.text.includes('ZPLAY_berth'), false);
                    const post = await jsonFetch(ledger, { method: 'POST', headers: json(c[who]), body: line('ZREF_stranger') });
                    assert.equal(post.status, 404, `${who} ${post.text}`);
                    for (const verb of ['void', 'accept']) {
                        const res = await jsonFetch(`${ledger}/${lineId}/${verb}`, { method: 'POST', headers: json(c[who]), body: '{}' });
                        assert.equal(res.status, 404, `${who} ${verb} ${res.text}`);
                    }
                }
                const evil = await jsonFetch(ledger, { method: 'POST', headers: { ...json(c['zc-owner']), origin: 'https://evil.example' }, body: line('x') });
                assert.equal(evil.status, 403, evil.text);
            });

            await t.test('ZS1 SECURITY: naming a character in your own campaign does not make you its referee', {
                todo: 'SECURITY ZS1: campaignReferee trusts any owned campaign whose sheet names the id; PATCH /campaign/changes takes any characterId',
            }, async () => {
                const universe = await jsonFetch(`${base}/api/universes`, { method: 'POST', headers: json(c['zc-x']), body: JSON.stringify({ name: 'Not Voss table', truthVersion: null, editionDefault: 'MgT2E' }) });
                assert.equal(universe.status, 201, universe.text);
                const named = await jsonFetch(`${base}/api/universes/${universe.body.data.id}/campaign/changes`, {
                    method: 'PATCH',
                    headers: json(c['zc-x']),
                    body: JSON.stringify({ records: [record(rid(0x51), { type: 'person', name: 'Voss', sheet: { schema: 'mgt2e', characterId: id } })] }),
                });
                assert.equal(named.status, 200, named.text.slice(0, 300));
                const post = await jsonFetch(ledger, { method: 'POST', headers: json(c['zc-x']), body: line('ZREF_forged') });
                const read = await jsonFetch(ledger, { headers: { cookie: c['zc-owner'] } });
                assert.equal(read.text.includes('ZREF_forged'), false, `the owner's register holds the stranger's line (post ${post.status})`);
                assert.equal(post.status, 404, post.text.slice(0, 300));
            });
        } finally {
            stopDev(child?.pid);
            removeTree(persistTo);
        }
    });
}