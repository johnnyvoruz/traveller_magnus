import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { runWrangler } from './session.js';
import { withDevServer, wranglerBin } from './server.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function authSecret() {
    const text = readFileSync(path.join(root, 'apps', 'api', '.dev.vars'), 'utf8');
    const line = text.split(/\r?\n/).find((item) => item.startsWith('BETTER_AUTH_SECRET='));
    if (!line) throw new Error('BETTER_AUTH_SECRET is unset');
    const value = line.slice('BETTER_AUTH_SECRET='.length).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        return value.slice(1, -1);
    }
    return value;
}

function userCookie(userId, email) {
    const now = Date.now();
    const expires = now + 30 * 24 * 60 * 60 * 1000;
    const token = randomBytes(32).toString('hex');
    const sessionId = `${userId}-${randomBytes(8).toString('hex')}`;
    const sql = `
INSERT INTO user (id, name, email, email_verified, created_at, updated_at, role, banned)
VALUES ('${userId}', '${userId}', '${email}', 1, ${now}, ${now}, 'user', 0)
ON CONFLICT(id) DO UPDATE SET updated_at = ${now};
INSERT INTO session (id, expires_at, token, created_at, updated_at, user_id)
VALUES ('${sessionId}', ${expires}, '${token}', ${now}, ${now}, '${userId}');
`;
    const dir = mkdtempSync(path.join(tmpdir(), 'voyage-user-'));
    const file = path.join(dir, 'user.sql');
    writeFileSync(file, sql);
    runWrangler(['d1', 'execute', 'voyage', '--local', '--file', file]);
    const signature = createHmac('sha256', authSecret()).update(token).digest('base64');
    return `__Secure-better-auth.session_token=${encodeURIComponent(`${token}.${signature}`)}`;
}

function execute(sql) {
    const dir = mkdtempSync(path.join(tmpdir(), 'voyage-sql-'));
    const file = path.join(dir, 'query.sql');
    writeFileSync(file, sql);
    runWrangler(['d1', 'execute', 'voyage', '--local', '--file', file]);
}

async function jsonFetch(url, options) {
    const response = await fetch(url, options);
    const body = await response.json();
    return { status: response.status, body };
}

if (process.env.RUN_API_TESTS !== '1') {
    test('universes catalogue', { skip: 'set RUN_API_TESTS=1' }, () => {});
} else if (!existsSync(wranglerBin)) {
    test('universes catalogue', { skip: 'wrangler is absent' }, () => {});
} else {
    test('universes catalogue', { timeout: 180000 }, async () => {
        await withDevServer(async (base) => {
            const unsigned = [
                ['GET', '/api/universes'],
                ['POST', '/api/universes'],
                ['GET', '/api/universes/missing'],
                ['PATCH', '/api/universes/missing'],
                ['DELETE', '/api/universes/missing'],
            ];
            for (const [method, pathName] of unsigned) {
                const response = await jsonFetch(`${base}${pathName}`, {
                    method,
                    headers: method === 'GET' ? {} : { 'content-type': 'application/json' },
                    body: method === 'GET' ? undefined : '{}',
                });
                assert.equal(response.status, 401, `${method} ${pathName}`);
                assert.equal(response.body.error.code, 'unauthenticated');
            }

            const stamp = randomBytes(4).toString('hex');
            const owner = userCookie(`k2a${stamp}`, `k2a${stamp}@localhost`);
            const other = userCookie(`k2b${stamp}`, `k2b${stamp}@localhost`);
            const headers = { 'content-type': 'application/json', cookie: owner };

            const foreign = await jsonFetch(`${base}/api/universes`, {
                method: 'POST',
                headers: { ...headers, origin: 'https://evil.example' },
                body: JSON.stringify({ name: 'Nope', truthVersion: null, editionDefault: 'MgT2E' }),
            });
            assert.equal(foreign.status, 403);
            assert.equal(foreign.body.error.code, 'forbidden');

            const created = await jsonFetch(`${base}/api/universes`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ name: 'My campaign', truthVersion: null, editionDefault: 'MgT2E' }),
            });
            assert.equal(created.status, 201, JSON.stringify(created.body));
            assert.equal(created.body.ok, true);
            assert.equal(created.body.data.name, 'My campaign');
            assert.equal(created.body.data.truthVersion, null);
            assert.equal(created.body.data.editionDefault, 'MgT2E');
            assert.equal(created.body.data.engineVersion, '1.0.0');
            assert.equal(created.body.data.deletedAt, null);
            const id = created.body.data.id;

            const list = await jsonFetch(`${base}/api/universes`, { headers: { cookie: owner } });
            assert.equal(list.status, 200);
            assert.ok(list.body.data.some((row) => row.id === id));

            const hidden = await jsonFetch(`${base}/api/universes/${id}`, { headers: { cookie: other } });
            assert.equal(hidden.status, 404);
            assert.equal(hidden.body.error.code, 'not_found');

            const building = `k2build${stamp}`;
            const released = `k2rel${stamp}`;
            execute(`
INSERT INTO truth_versions (version, engine_version, state, started_at, sectors_total, sectors_done)
VALUES ('${building}', '1.0.0', 'building', '2026-10-04T00:00:00.000Z', 0, 0);
INSERT INTO truth_versions (version, engine_version, state, started_at, released_at, sectors_total, sectors_done)
VALUES ('${released}', '1.0.0', 'released', '2026-10-04T00:00:00.000Z', '2026-10-04T00:00:00.000Z', 0, 0);
`);
            const unreleased = await jsonFetch(`${base}/api/universes`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ name: 'Unreleased', truthVersion: building, editionDefault: 'MgT2E' }),
            });
            assert.equal(unreleased.status, 400);
            assert.equal(unreleased.body.error.code, 'validation');

            const pinned = await jsonFetch(`${base}/api/universes`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ name: 'Pinned', truthVersion: released, editionDefault: 'MgT2E' }),
            });
            assert.equal(pinned.status, 201);
            assert.equal(pinned.body.data.truthVersion, released);

            const third = await jsonFetch(`${base}/api/universes`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ name: 'Third', truthVersion: null, editionDefault: 'MgT2E' }),
            });
            assert.equal(third.status, 201);

            for (let n = 4; n <= 10; n += 1) {
                const extra = await jsonFetch(`${base}/api/universes`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ name: `Campaign ${n}`, truthVersion: null, editionDefault: 'MgT2E' }),
                });
                assert.equal(extra.status, 201, JSON.stringify(extra.body));
            }

            const eleventh = await jsonFetch(`${base}/api/universes`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ name: 'Eleventh', truthVersion: null, editionDefault: 'MgT2E' }),
            });
            assert.equal(eleventh.status, 400);
            assert.equal(eleventh.body.error.code, 'too_large');
            assert.equal(eleventh.body.error.message, 'Ten universes per account.');

            const renamed = await jsonFetch(`${base}/api/universes/${pinned.body.data.id}`, {
                method: 'PATCH',
                headers,
                body: JSON.stringify({ name: 'Pinned renamed' }),
            });
            assert.equal(renamed.status, 200);
            assert.equal(renamed.body.data.name, 'Pinned renamed');

            const removed = await jsonFetch(`${base}/api/universes/${id}`, { method: 'DELETE', headers });
            assert.equal(removed.status, 200);
            assert.ok(removed.body.data.deletedAt);
            assert.ok(removed.body.data.purgeAfter);

            const after = await jsonFetch(`${base}/api/universes`, { headers: { cookie: owner } });
            assert.equal(after.body.data.some((row) => row.id === id), false);
            const gone = await jsonFetch(`${base}/api/universes/${id}`, { headers: { cookie: owner } });
            assert.equal(gone.status, 404);

            const again = await jsonFetch(`${base}/api/universes`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ name: 'After delete', truthVersion: null, editionDefault: 'MgT2E' }),
            });
            assert.equal(again.status, 201);
        });
    });
}
