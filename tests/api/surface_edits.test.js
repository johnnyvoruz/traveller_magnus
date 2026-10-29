import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { PublishRefusal, publishedHex } from '../../apps/api/src/jobs/publish_queue.ts';
import { readPublishSources } from '../../apps/api/src/universe/publish_read.ts';
import { readSurface, writeSurface } from '../../apps/api/src/universe/surfaces.ts';
import { SURFACE_PAYLOAD_MAX, SURFACE_TOO_LARGE } from '../../packages/shared/src/schemas/surface.ts';
import { removeTree, runWrangler } from './session.js';
import { startDev, stopDev } from './server.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const NOW = '2026-10-27T20:37:00.000Z';
const HEX = 'Spinward/1910';

const paint = {
    format: 1,
    n: 2,
    digest: 'ab12cd34:40',
    surface: 'hybrid-surface-4',
    edits: [{ row: 0, col: 0, terrain: 'OC', note: 'bay' }],
};

function open() {
    const db = new DatabaseSync(':memory:');
    const sql = {
        exec(query, ...params) {
            const statement = query.trim();
            if (/^(begin|commit|rollback)\b/i.test(statement)) {
                db.exec(statement);
                return [];
            }
            const prepared = db.prepare(statement);
            if (/^(select|with|pragma)\b/i.test(statement)) return prepared.all(...params);
            prepared.run(...params);
            return [];
        },
        transaction(fn) {
            db.exec('BEGIN');
            try {
                const result = fn();
                db.exec('COMMIT');
                return result;
            } catch (err) {
                db.exec('ROLLBACK');
                throw err;
            }
        },
    };
    db.exec(`CREATE TABLE hexes (
        hex_key TEXT PRIMARY KEY,
        deleted INTEGER,
        base_hash TEXT,
        tree_hash TEXT,
        summary TEXT
    )`);
    db.prepare(`INSERT INTO hexes (hex_key, deleted, base_hash, tree_hash, summary) VALUES (?, 0, 'abc', NULL, NULL)`).run(HEX);
    return { db, sql };
}

test('paint stays off the hex row and rides out with a published hex', () => {
    const { db, sql } = open();
    assert.deepEqual(readSurface(sql, HEX, 'w0'), { rev: 0, edits: null });
    const saved = writeSurface(sql, HEX, 'w0', { baseRev: 0, edits: paint }, NOW);
    assert.equal(saved.rev, 1);
    assert.equal(saved.edits.edits[0].note, 'bay');
    const hex = db.prepare(`SELECT deleted, base_hash, tree_hash, summary FROM hexes WHERE hex_key = ?`).get(HEX);
    assert.equal(hex.deleted, 0);
    assert.equal(hex.base_hash, 'abc');
    assert.equal(hex.tree_hash, null);
    assert.equal(hex.summary, null);
    assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM sqlite_master WHERE name = 'hexes' AND type = 'table'`).get().n, 1);

    assert.throws(
        () => writeSurface(sql, HEX, 'w0', { baseRev: 0, edits: paint }, NOW),
        (err) => err.code === 'conflict' && err.message === 'This map changed. Reload it, then try again.' && err.details.code === 'surface_changed',
    );
    assert.equal(readSurface(sql, HEX, 'w0').rev, 1);

    const huge = { baseRev: 1, edits: 'x'.repeat(SURFACE_PAYLOAD_MAX) };
    assert.throws(
        () => writeSurface(sql, HEX, 'w0', huge, NOW),
        (err) => err.message === SURFACE_TOO_LARGE,
    );
    assert.equal(readSurface(sql, HEX, 'w0').edits.edits[0].note, 'bay');

    writeSurface(sql, HEX, 'w3m1', { baseRev: 0, edits: { ...paint, edits: [{ row: 1, col: 0, terrain: 'DE' }] } }, NOW);
    const cleared = writeSurface(sql, HEX, 'w0', { baseRev: 1, edits: null }, NOW);
    assert.deepEqual(cleared, { rev: 0, edits: null });
    assert.deepEqual(readSurface(sql, HEX, 'w0'), { rev: 0, edits: null });
    assert.equal(readSurface(sql, HEX, 'w3m1').rev, 1);

    const sources = readPublishSources(sql, { hexKeys: [HEX, 'Gone/0102'], recordIds: [] });
    assert.equal(sources.hexes[0].found, true);
    assert.equal(sources.hexes[0].surfaces.w0, undefined);
    assert.equal(sources.hexes[0].surfaces.w3m1.edits[0].terrain, 'DE');
    assert.equal(sources.hexes[1].found, false);
    const packed = publishedHex(sources.hexes[0], null);
    assert.equal(packed.baseHash, 'abc');
    assert.equal(packed.surfaces.w3m1.n, 2);
    assert.equal(Object.hasOwn(packed, 'treeHash'), false);
    const chartOnly = publishedHex(sources.hexes[1], { name: 'Regina' });
    assert.equal(chartOnly.summary.name, 'Regina');
    assert.equal(Object.hasOwn(chartOnly, 'surfaces'), false);
    const carried = publishedHex({
        hexKey: 'Chart/1910', found: false, deleted: false, baseHash: null, treeHash: null, summary: null,
        surfaces: { w0: paint },
    }, { name: 'Regina' });
    assert.equal(carried.surfaces.w0.digest, paint.digest);
    assert.equal(carried.summary.name, 'Regina');
    assert.throws(
        () => publishedHex({
            hexKey: 'Gone/0101', found: false, deleted: false, baseHash: null, treeHash: null, summary: null,
            surfaces: { w0: paint },
        }, null),
        (err) => err instanceof PublishRefusal,
    );
    const after = db.prepare(`SELECT deleted, base_hash FROM hexes WHERE hex_key = ?`).get(HEX);
    assert.equal(after.deleted, 0);
    assert.equal(after.base_hash, 'abc');
});

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
    test('surface edit routes', { skip: 'set RUN_API_TESTS=1' }, () => {});
} else {
    test('surface edit routes', { timeout: 180000 }, async () => {
        const persistTo = mkdtempSync(path.join(tmpdir(), 'voyage-surface-'));
        const port = 18916;
        const inspectorPort = 19916;
        const base = `http://127.0.0.1:${port}`;
        let child = null;
        try {
            runWrangler(['d1', 'migrations', 'apply', 'voyage', '--local', '--persist-to', persistTo]);
            const stamp = randomBytes(4).toString('hex');
            const cookie = userCookie(`sfown${stamp}`, `sfown${stamp}@localhost`, persistTo);
            const player = userCookie(`sfply${stamp}`, `sfply${stamp}@localhost`, persistTo);
            const stranger = userCookie(`sfstr${stamp}`, `sfstr${stamp}@localhost`, persistTo);
            const headers = { 'content-type': 'application/json', cookie };
            child = startDev({ port, persistTo, inspectorPort });
            await up(base);

            const created = await jsonFetch(`${base}/api/universes`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ name: 'Paint', truthVersion: null, editionDefault: 'MgT2E' }),
            });
            assert.equal(created.status, 201, JSON.stringify(created.body));
            const id = created.body.data.id;
            const url = `${base}/api/universes/${id}/builder/hexes/Spinward/1910/surface/w0`;

            const invite = await jsonFetch(`${base}/api/universes/${id}/players/invite`, { method: 'POST', headers });
            assert.equal(invite.status, 200, JSON.stringify(invite.body));
            const token = invite.body.data.url.split('/join/')[1];
            const joined = await jsonFetch(`${base}/api/join`, {
                method: 'POST',
                headers: { 'content-type': 'application/json', cookie: player, origin: base },
                body: JSON.stringify({ token }),
            });
            assert.equal(joined.status, 200, JSON.stringify(joined.body));

            const empty = await jsonFetch(url, { headers: { cookie } });
            assert.equal(empty.status, 200, JSON.stringify(empty.body));
            assert.deepEqual(empty.body.data, { rev: 0, edits: null });

            const blocked = await jsonFetch(url, {
                method: 'PUT',
                headers: { 'content-type': 'application/json', cookie, origin: 'https://evil.example' },
                body: JSON.stringify({ baseRev: 0, edits: paint }),
            });
            assert.equal(blocked.status, 403, JSON.stringify(blocked.body));
            assert.equal(blocked.body.error.message, 'That request was blocked. Reload the page and try again.');

            const signedOut = await jsonFetch(url, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ baseRev: 0, edits: paint }) });
            assert.equal(signedOut.status, 401, JSON.stringify(signedOut.body));
            assert.equal(signedOut.body.error.message, 'Sign in to continue.');

            const put = await jsonFetch(url, { method: 'PUT', headers, body: JSON.stringify({ baseRev: 0, edits: paint }) });
            assert.equal(put.status, 200, JSON.stringify(put.body));
            assert.equal(put.body.data.rev, 1);
            assert.equal(put.body.data.edits.edits[0].terrain, 'OC');

            const playerRead = await jsonFetch(url, { headers: { cookie: player } });
            assert.equal(playerRead.status, 200, JSON.stringify(playerRead.body));
            assert.equal(playerRead.body.data.rev, 1);

            const playerPut = await jsonFetch(url, {
                method: 'PUT',
                headers: { 'content-type': 'application/json', cookie: player },
                body: JSON.stringify({ baseRev: 1, edits: { ...paint, edits: [{ row: 0, col: 0, terrain: 'DE' }] } }),
            });
            assert.equal(playerPut.status, 404, JSON.stringify(playerPut.body));
            assert.equal(playerPut.body.error.message, 'No such universe.');

            const strangerPut = await jsonFetch(url, {
                method: 'PUT',
                headers: { 'content-type': 'application/json', cookie: stranger },
                body: JSON.stringify({ baseRev: 1, edits: null }),
            });
            assert.equal(strangerPut.status, 404, JSON.stringify(strangerPut.body));
            assert.equal(strangerPut.body.error.message, 'No such universe.');
            const strangerRead = await jsonFetch(url, { headers: { cookie: stranger } });
            assert.equal(strangerRead.status, 404, JSON.stringify(strangerRead.body));
            assert.equal(strangerRead.body.error.message, 'No such universe.');

            const stale = await jsonFetch(url, { method: 'PUT', headers, body: JSON.stringify({ baseRev: 0, edits: paint }) });
            assert.equal(stale.status, 409, JSON.stringify(stale.body));
            assert.equal(stale.body.error.message, 'This map changed. Reload it, then try again.');
            assert.equal(stale.body.error.details.code, 'surface_changed');
            assert.equal(stale.body.error.details.current.rev, 1);

            const capped = await jsonFetch(url, {
                method: 'PUT',
                headers,
                body: JSON.stringify({ baseRev: 1, edits: 'x'.repeat(SURFACE_PAYLOAD_MAX) }),
            });
            assert.equal(capped.status, 400, JSON.stringify(capped.body));
            assert.equal(capped.body.error.message, SURFACE_TOO_LARGE);

            const kept = await jsonFetch(url, { headers: { cookie } });
            assert.equal(kept.status, 200, JSON.stringify(kept.body));
            assert.equal(kept.body.data.rev, 1);
            assert.equal(kept.body.data.edits.edits[0].note, 'bay');

            const cleared = await jsonFetch(url, { method: 'PUT', headers, body: JSON.stringify({ baseRev: 1, edits: null }) });
            assert.equal(cleared.status, 200, JSON.stringify(cleared.body));
            assert.deepEqual(cleared.body.data, { rev: 0, edits: null });
            const gone = await jsonFetch(url, { headers: { cookie: player } });
            assert.deepEqual(gone.body.data, { rev: 0, edits: null });
        } finally {
            if (child) stopDev(child.pid);
            removeTree(persistTo);
        }
    });
}
