/**
 * The ship page's socket (BV1a). One notice per open panel when a campaign write lands.
 * A closed socket hears nothing. The upgrade goes through the headers middleware.
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
const SHIP = 'cr_00000000-0000-4000-8000-0000000000c1';

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
    rmSync(dir, { recursive: true, force: true });
    const signature = createHmac('sha256', authSecret()).update(token).digest('base64');
    return `__Secure-better-auth.session_token=${encodeURIComponent(`${token}.${signature}`)}`;
}

async function jsonFetch(url, options) {
    const response = await fetch(url, options);
    const text = await response.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text }; }
    return { status: response.status, body };
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

function listen(WebSocket, url, cookie) {
    const messages = [];
    const ws = new WebSocket(url, { headers: { cookie } });
    let settled = false;
    const opened = new Promise((resolve, reject) => {
        ws.addEventListener('open', () => {
            settled = true;
            resolve();
        });
        ws.addEventListener('error', () => {
            if (!settled) {
                settled = true;
                reject(new Error('socket failed'));
            }
        });
    });
    const closed = new Promise((resolve) => ws.addEventListener('close', () => resolve()));
    ws.addEventListener('message', (event) => {
        messages.push(JSON.parse(String(event.data)));
    });
    return { ws, messages, opened, closed, send(value) { ws.send(value); } };
}

if (process.env.RUN_API_TESTS !== '1') {
    test('the campaign socket', { skip: 'set RUN_API_TESTS=1' }, () => {});
} else {
    test('the campaign socket', { timeout: 180000 }, async () => {
        const persistTo = process.env.VOYAGE_PERSIST_TO || mkdtempSync(path.join(tmpdir(), 'voyage-live-'));
        const port = Number(process.env.VOYAGE_API_PORT || 18962);
        const inspectorPort = Number(process.env.VOYAGE_INSPECTOR_PORT || 19962);
        const base = `http://127.0.0.1:${port}`;
        let child = null;
        const sockets = [];
        try {
            runWrangler(['d1', 'migrations', 'apply', 'voyage', '--local', '--persist-to', persistTo]);
            const stamp = randomBytes(4).toString('hex');
            const owner = userCookie(`lvown${stamp}`, `lvown${stamp}@localhost`, persistTo);
            const stranger = userCookie(`lvstr${stamp}`, `lvstr${stamp}@localhost`, persistTo);
            const ownerHeaders = { 'content-type': 'application/json', cookie: owner, origin: base };
            child = startDev({ port, persistTo, inspectorPort });
            await up(base);
            const created = await jsonFetch(`${base}/api/universes`, {
                method: 'POST',
                headers: ownerHeaders,
                body: JSON.stringify({ name: 'Live records', truthVersion: null, editionDefault: 'MgT2E' }),
            });
            assert.equal(created.status, 201, JSON.stringify(created.body));
            const id = created.body.data.id;
            const live = `${base}/api/universes/${id}/campaign/live`;
            const changes = `${base}/api/universes/${id}/campaign/changes`;
            const seeded = await jsonFetch(changes, {
                method: 'PATCH',
                headers: ownerHeaders,
                body: JSON.stringify({
                    records: [{
                        id: SHIP,
                        type: 'vessel',
                        kind: '',
                        name: 'Kestrel',
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
                        rev: 0,
                        createdAt: '2026-11-10T00:00:00.000Z',
                        updatedAt: '2026-11-10T00:00:00.000Z',
                        deleted: false,
                        provenance: null,
                        baseRev: 0,
                    }],
                }),
            });
            assert.equal(seeded.status, 200, JSON.stringify(seeded.body));
            const storedRev = seeded.body.data.applied.find((row) => row.id === SHIP).rev;
            const plain = await jsonFetch(live, { headers: { cookie: owner } });
            assert.equal(plain.status, 400);
            assert.equal(plain.body.error.message, 'That request could not be read. Try again.');
            const signedOut = await jsonFetch(live);
            assert.equal(signedOut.status, 401);
            const other = await jsonFetch(live, { headers: { cookie: stranger } });
            assert.equal(other.status, 404);
            assert.equal(other.body.error.message, 'No such universe.');

            const { WebSocket } = await import('undici');
            const open = listen(WebSocket, live.replace('http', 'ws'), owner);
            const shut = listen(WebSocket, live.replace('http', 'ws'), owner);
            sockets.push(open, shut);
            await open.opened;
            await shut.opened;
            open.send('hello');
            await sleep(200);
            assert.equal(open.messages.length, 0);
            shut.ws.close();
            await shut.closed;
            await sleep(200);
            const renamed = await jsonFetch(changes, {
                method: 'PATCH',
                headers: ownerHeaders,
                body: JSON.stringify({
                    records: [{
                        id: SHIP,
                        type: 'vessel',
                        kind: '',
                        name: 'Kestrel Dawn',
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
                        rev: storedRev,
                        createdAt: '2026-11-10T00:00:00.000Z',
                        updatedAt: '2026-11-10T00:00:00.000Z',
                        deleted: false,
                        provenance: null,
                        baseRev: storedRev,
                    }],
                }),
            });
            assert.equal(renamed.status, 200, JSON.stringify(renamed.body));
            const seq = renamed.body.data.applied.find((row) => row.id === SHIP).seq;
            const deadline = Date.now() + 5000;
            while (open.messages.length < 1 && Date.now() < deadline) await sleep(50);
            assert.equal(open.messages.length, 1);
            assert.deepEqual(open.messages[0], { t: 'changed', seq });
            await sleep(300);
            assert.equal(shut.messages.length, 0);
        } finally {
            for (const socket of sockets) {
                try { socket.ws.close(); } catch { /* already closed */ }
            }
            if (child) stopDev(child.pid);
            if (!process.env.VOYAGE_PERSIST_TO) rmSync(persistTo, { recursive: true, force: true });
        }
    });
}
