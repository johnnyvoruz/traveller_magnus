/**
 * A playing member reads their own character. The owner is refused.
 * A member with no tie reads null and an empty list.
 */
import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { PlayerSelf } from '../../packages/shared/src/schemas/players.ts';
import { runWrangler } from './session.js';
import { startDev, stopDev } from './server.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const NOT_UNIVERSE = 'No such universe.';
const PERSON = 'per_ada';

function authSecret() {
    const text = readFileSync(path.join(root, 'apps', 'api', '.dev.vars'), 'utf8');
    const line = text.split(/\r?\n/).find((item) => item.startsWith('BETTER_AUTH_SECRET='));
    if (!line) throw new Error('BETTER_AUTH_SECRET is unset');
    const value = line.slice('BETTER_AUTH_SECRET='.length).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) return value.slice(1, -1);
    return value;
}

function userCookie(userId, email, persistTo) {
    const now = Date.now();
    const expires = now + 30 * 24 * 60 * 60 * 1000;
    const token = randomBytes(32).toString('hex');
    const sessionId = `${userId}-${randomBytes(8).toString('hex')}`;
    const sql = `
INSERT INTO user (id, name, email, email_verified, created_at, updated_at, role, banned)
VALUES ('${userId}', '${userId}', '${email}', 1, ${now}, ${now}, 'user', 0);
INSERT INTO session (id, expires_at, token, created_at, updated_at, user_id)
VALUES ('${sessionId}', ${expires}, '${token}', ${now}, ${now}, '${userId}');
`;
    const dir = mkdtempSync(path.join(tmpdir(), 'voyage-user-'));
    const file = path.join(dir, 'user.sql');
    writeFileSync(file, sql);
    try {
        runWrangler(['d1', 'execute', 'voyage', '--local', '--persist-to', persistTo, '--file', file]);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
    const signature = createHmac('sha256', authSecret()).update(token).digest('base64');
    return `__Secure-better-auth.session_token=${encodeURIComponent(`${token}.${signature}`)}`;
}

function tiePerson(persistTo, universeId, userId) {
    if (!/^[A-Za-z0-9_-]+$/.test(universeId) || !/^[A-Za-z0-9_-]+$/.test(userId)) {
        throw new Error('refused to write an id into SQL');
    }
    const dir = mkdtempSync(path.join(tmpdir(), 'voyage-me-'));
    const file = path.join(dir, 'tie.sql');
    writeFileSync(file, `UPDATE universe_members SET person_id = '${PERSON}' WHERE universe_id = '${universeId}' AND user_id = '${userId}';
INSERT INTO universe_member_people (universe_id, user_id, person_id, position, created_at)
VALUES ('${universeId}', '${userId}', '${PERSON}', 0, '2026-11-07T00:00:00.000Z');
`);
    try {
        runWrangler(['d1', 'execute', 'voyage', '--local', '--persist-to', persistTo, '--file', file]);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

async function jsonFetch(url, options) {
    const response = await fetch(url, options);
    const text = await response.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text }; }
    return { status: response.status, body, cache: response.headers.get('cache-control') };
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
        await sleep(500);
    }
    throw new Error(last || 'wrangler did not answer /api/health');
}

if (process.env.RUN_API_TESTS !== '1') {
    test('a member reads their own character', { skip: 'set RUN_API_TESTS=1' }, () => {});
} else {
    test('a member reads their own character', { timeout: 180000 }, async () => {
        const ownedPersist = !process.env.VOYAGE_PERSIST_TO;
        const persistTo = process.env.VOYAGE_PERSIST_TO || mkdtempSync(path.join(tmpdir(), 'voyage-players-me-'));
        const port = Number(process.env.VOYAGE_API_PORT || 18963);
        const inspectorPort = Number(process.env.VOYAGE_INSPECTOR_PORT || 19963);
        const base = `http://127.0.0.1:${port}`;
        let child = null;
        try {
            runWrangler(['d1', 'migrations', 'apply', 'voyage', '--local', '--persist-to', persistTo]);
            const stamp = randomBytes(4).toString('hex');
            const memberId = `bm3m${stamp}`;
            const owner = userCookie(`bm3o${stamp}`, `bm3o${stamp}@localhost`, persistTo);
            const member = userCookie(memberId, `${memberId}@localhost`, persistTo);
            const headers = { 'content-type': 'application/json', cookie: owner, origin: base };
            child = startDev({ port, persistTo, inspectorPort });
            await up(base);

            const created = await jsonFetch(`${base}/api/universes`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ name: 'Own character', truthVersion: null, editionDefault: 'MgT2E' }),
            });
            assert.equal(created.status, 201, JSON.stringify(created.body));
            const id = created.body.data.id;
            const meUrl = `${base}/api/universes/${id}/players/me`;

            const invite = await jsonFetch(`${base}/api/universes/${id}/players/invite`, { method: 'POST', headers });
            assert.equal(invite.status, 200, JSON.stringify(invite.body));
            const token = invite.body.data.url.split('/join/')[1];
            const joined = await jsonFetch(`${base}/api/join`, {
                method: 'POST',
                headers: { 'content-type': 'application/json', cookie: member, origin: base },
                body: JSON.stringify({ token }),
            });
            assert.equal(joined.status, 200, JSON.stringify(joined.body));

            const none = await jsonFetch(meUrl, { headers: { cookie: member } });
            assert.equal(none.status, 200, JSON.stringify(none.body));
            assert.equal(PlayerSelf.safeParse(none.body.data).success, true);
            assert.deepEqual(none.body.data, { personId: null, personIds: [] });
            assert.match(none.cache ?? '', /private/);
            assert.match(none.cache ?? '', /no-store/);

            const ownerRead = await jsonFetch(meUrl, { headers: { cookie: owner } });
            assert.equal(ownerRead.status, 404, JSON.stringify(ownerRead.body));
            assert.equal(ownerRead.body.error.message, NOT_UNIVERSE);
            assert.match(ownerRead.cache ?? '', /no-store/);

            tiePerson(persistTo, id, memberId);
            const own = await jsonFetch(meUrl, { headers: { cookie: member } });
            assert.equal(own.status, 200, JSON.stringify(own.body));
            assert.deepEqual(own.body.data, { personId: PERSON, personIds: [PERSON] });
            assert.match(own.cache ?? '', /no-store/);
        } finally {
            if (child) stopDev(child.pid);
            if (ownedPersist) rmSync(persistTo, { recursive: true, force: true });
        }
    });
}
