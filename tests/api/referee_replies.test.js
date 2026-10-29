/**
 * A reply the referee wrote carries authorRole. A member's reply does not.
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
const STAMP = '2026-10-29T00:00:00.000Z';
const PARENT = 'cj_00000000-0000-4000-8000-0000000000a1';
const OWNER_REPLY = 'cj_00000000-0000-4000-8000-0000000000a2';
const MEMBER_REPLY = 'cj_00000000-0000-4000-8000-0000000000a3';

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

function note(id, over = {}) {
    return {
        id,
        kind: 'note',
        title: 'At the starport',
        body: 'The berth is paid.',
        when: null,
        realDate: null,
        sequence: null,
        author: 'players',
        visibility: 'players',
        anchor: null,
        mentions: [],
        rev: 0,
        createdAt: STAMP,
        updatedAt: STAMP,
        deleted: false,
        baseRev: 0,
        ...over,
    };
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

if (process.env.RUN_API_TESTS !== '1') {
    test('the referee\'s reply says so', { skip: 'set RUN_API_TESTS=1' }, () => {});
} else {
    test('the referee\'s reply says so', { timeout: 180000 }, async () => {
        const ownedPersist = !process.env.VOYAGE_PERSIST_TO;
        const persistTo = process.env.VOYAGE_PERSIST_TO || mkdtempSync(path.join(tmpdir(), 'voyage-referee-reply-'));
        const port = Number(process.env.VOYAGE_API_PORT || 18935);
        const inspectorPort = Number(process.env.VOYAGE_INSPECTOR_PORT || 19935);
        const base = `http://127.0.0.1:${port}`;
        let child = null;
        try {
            runWrangler(['d1', 'migrations', 'apply', 'voyage', '--local', '--persist-to', persistTo]);
            const stamp = randomBytes(4).toString('hex');
            const owner = userCookie(`rfown${stamp}`, `rfown${stamp}@localhost`, persistTo);
            const member = userCookie(`rfmem${stamp}`, `rfmem${stamp}@localhost`, persistTo);
            const ownerHeaders = { 'content-type': 'application/json', cookie: owner, origin: base };
            const memberHeaders = { 'content-type': 'application/json', cookie: member, origin: base };
            child = startDev({ port, persistTo, inspectorPort });
            await up(base);

            const created = await jsonFetch(`${base}/api/universes`, {
                method: 'POST',
                headers: ownerHeaders,
                body: JSON.stringify({ name: 'Referee replies', truthVersion: null, editionDefault: 'MgT2E' }),
            });
            assert.equal(created.status, 201, JSON.stringify(created.body));
            const id = created.body.data.id;

            const invite = await jsonFetch(`${base}/api/universes/${id}/players/invite`, { method: 'POST', headers: ownerHeaders });
            assert.equal(invite.status, 200, JSON.stringify(invite.body));
            const token = invite.body.data.url.split('/join/')[1];
            const joined = await jsonFetch(`${base}/api/join`, {
                method: 'POST',
                headers: memberHeaders,
                body: JSON.stringify({ token }),
            });
            assert.equal(joined.status, 200, JSON.stringify(joined.body));

            const changes = `${base}/api/universes/${id}/campaign/changes`;
            const parent = await jsonFetch(changes, {
                method: 'PATCH',
                headers: ownerHeaders,
                body: JSON.stringify({ journal: [note(PARENT, { title: 'Briefing' })] }),
            });
            assert.equal(parent.status, 200, JSON.stringify(parent.body));

            const ownerReply = await jsonFetch(changes, {
                method: 'PATCH',
                headers: ownerHeaders,
                body: JSON.stringify({ journal: [note(OWNER_REPLY, { parent: PARENT, title: 'From the referee', body: 'Hold here.' })] }),
            });
            assert.equal(ownerReply.status, 200, JSON.stringify(ownerReply.body));

            const memberReply = await jsonFetch(changes, {
                method: 'PATCH',
                headers: memberHeaders,
                body: JSON.stringify({
                    journal: [note(MEMBER_REPLY, { parent: PARENT, title: 'From a player', body: 'Copy.', authorRole: 'referee' })],
                }),
            });
            assert.equal(memberReply.status, 200, JSON.stringify(memberReply.body));

            const replies = `${base}/api/universes/${id}/campaign?parent=${PARENT}`;
            for (const cookie of [owner, member]) {
                const read = await jsonFetch(replies, { headers: { cookie } });
                assert.equal(read.status, 200, JSON.stringify(read.body));
                const rows = read.body.data.journal;
                const referee = rows.find((row) => row.id === OWNER_REPLY);
                const player = rows.find((row) => row.id === MEMBER_REPLY);
                assert.ok(referee, JSON.stringify(rows.map((row) => row.id)));
                assert.ok(player);
                assert.equal(referee.authorRole, 'referee');
                assert.equal(Object.hasOwn(player, 'authorRole'), false);
                assert.equal(Object.hasOwn(referee, 'authorId'), false);
                assert.equal(Object.hasOwn(player, 'authorId'), false);
            }
        } finally {
            if (child) stopDev(child.pid);
            if (ownedPersist) rmSync(persistTo, { recursive: true, force: true });
        }
    });
}
