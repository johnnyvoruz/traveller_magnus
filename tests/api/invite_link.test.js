/**
 * The referee reads the live invite link back after a reload.
 * A member and a stranger get the missing-universe answer. A gone link's token is not in the body.
 */
import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { runWrangler } from './session.js';
import { startDev, stopDev } from './server.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const NOT_UNIVERSE = 'No such universe.';

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
    runWrangler(['d1', 'execute', 'voyage', '--local', '--persist-to', persistTo, '--file', file]);
    const signature = createHmac('sha256', authSecret()).update(token).digest('base64');
    return `__Secure-better-auth.session_token=${encodeURIComponent(`${token}.${signature}`)}`;
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
    test('the live invite link, read after a reload', { skip: 'set RUN_API_TESTS=1' }, () => {});
} else {
    test('the live invite link, read after a reload', { timeout: 180000 }, async () => {
        const ownedPersist = !process.env.VOYAGE_PERSIST_TO;
        const persistTo = process.env.VOYAGE_PERSIST_TO || mkdtempSync(path.join(tmpdir(), 'voyage-invite-link-'));
        const port = Number(process.env.VOYAGE_API_PORT || 18934);
        const inspectorPort = Number(process.env.VOYAGE_INSPECTOR_PORT || 19934);
        const base = `http://127.0.0.1:${port}`;
        let child = null;
        try {
            runWrangler(['d1', 'migrations', 'apply', 'voyage', '--local', '--persist-to', persistTo]);
            const stamp = randomBytes(4).toString('hex');
            const owner = userCookie(`ivown${stamp}`, `ivown${stamp}@localhost`, persistTo);
            const member = userCookie(`ivmem${stamp}`, `ivmem${stamp}@localhost`, persistTo);
            const stranger = userCookie(`ivstr${stamp}`, `ivstr${stamp}@localhost`, persistTo);
            const headers = { 'content-type': 'application/json', cookie: owner };
            child = startDev({ port, persistTo, inspectorPort });
            await up(base);

            const created = await jsonFetch(`${base}/api/universes`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ name: 'Invite read', truthVersion: null, editionDefault: 'MgT2E' }),
            });
            assert.equal(created.status, 201, JSON.stringify(created.body));
            const id = created.body.data.id;
            const readUrl = `${base}/api/universes/${id}/invite`;

            const empty = await jsonFetch(readUrl, { headers: { cookie: owner } });
            assert.equal(empty.status, 200, JSON.stringify(empty.body));
            assert.deepEqual(empty.body.data, { link: null });
            assert.match(empty.cache ?? '', /private/);
            assert.match(empty.cache ?? '', /no-store/);

            const made = await jsonFetch(`${base}/api/universes/${id}/players/invite`, { method: 'POST', headers });
            assert.equal(made.status, 200, JSON.stringify(made.body));
            const token = made.body.data.url.split('/join/')[1];
            assert.ok(token);

            const live = await jsonFetch(readUrl, { headers: { cookie: owner } });
            assert.equal(live.status, 200, JSON.stringify(live.body));
            assert.equal(live.body.data.link.url, made.body.data.url);
            assert.equal(live.body.data.link.expiresAt, made.body.data.expiresAt);
            assert.equal(typeof live.body.data.link.createdAt, 'string');
            assert.ok(live.body.data.link.createdAt.length > 0);
            assert.equal(Object.hasOwn(live.body.data.link, 'token'), false);
            assert.equal(Object.hasOwn(live.body.data.link, 'role'), false);
            assert.equal(Object.hasOwn(live.body.data.link, 'uses'), false);
            assert.equal(live.body.data.link.url.includes(token), true);

            const again = await jsonFetch(readUrl, { headers: { cookie: owner } });
            assert.equal(again.body.data.link.url, live.body.data.link.url);
            assert.equal(again.body.data.link.createdAt, live.body.data.link.createdAt);

            const joined = await jsonFetch(`${base}/api/join`, {
                method: 'POST',
                headers: { 'content-type': 'application/json', cookie: member, origin: base },
                body: JSON.stringify({ token }),
            });
            assert.equal(joined.status, 200, JSON.stringify(joined.body));

            const memberRead = await jsonFetch(readUrl, { headers: { cookie: member } });
            assert.equal(memberRead.status, 404, JSON.stringify(memberRead.body));
            assert.equal(memberRead.body.error.message, NOT_UNIVERSE);
            assert.equal(JSON.stringify(memberRead.body).includes(token), false);

            const strangerRead = await jsonFetch(readUrl, { headers: { cookie: stranger } });
            assert.equal(strangerRead.status, 404, JSON.stringify(strangerRead.body));
            assert.equal(strangerRead.body.error.message, NOT_UNIVERSE);
            assert.equal(JSON.stringify(strangerRead.body).includes(token), false);

            const signedOut = await jsonFetch(readUrl);
            assert.equal(signedOut.status, 401, JSON.stringify(signedOut.body));
            assert.equal(signedOut.body.error.message, 'Sign in to continue.');

            const revoked = await jsonFetch(`${base}/api/universes/${id}/players/invite`, { method: 'DELETE', headers });
            assert.equal(revoked.status, 200, JSON.stringify(revoked.body));
            const gone = await jsonFetch(readUrl, { headers: { cookie: owner } });
            assert.equal(gone.status, 200, JSON.stringify(gone.body));
            assert.deepEqual(gone.body.data, { link: null });
            assert.equal(JSON.stringify(gone.body).includes(token), false);
        } finally {
            if (child) stopDev(child.pid);
            if (ownedPersist) rmSync(persistTo, { recursive: true, force: true });
        }
    });
}
