import assert from 'node:assert/strict';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { runWrangler } from './session.js';
import { withDevServer, wranglerBin } from './server.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const QUOTA = 250 * 1024 * 1024;

function jsonFrom(text) {
    const start = text.indexOf('[');
    const objectStart = text.indexOf('{');
    const at = start === -1 ? objectStart : objectStart === -1 ? start : Math.min(start, objectStart);
    if (at === -1) throw new Error(text);
    return JSON.parse(text.slice(at));
}

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

function objectBytes(id) {
    const rows = jsonFrom(runWrangler([
        'd1', 'execute', 'voyage', '--local', '--json', '--command',
        `SELECT object_bytes AS n FROM universes WHERE id = '${id}'`,
    ]));
    return Number(rows[0].results[0].n);
}

function sha(bytes) {
    return createHash('sha256').update(bytes).digest('hex');
}

function tinyWebp(mark) {
    const body = Buffer.alloc(16);
    body.write('RIFF', 0);
    body.writeUInt32LE(8, 4);
    body.write('WEBP', 8);
    body.writeUInt32LE(mark, 12);
    return body;
}

async function jsonFetch(url, options) {
    const response = await fetch(url, options);
    const body = await response.json();
    return { status: response.status, body };
}

if (process.env.RUN_API_TESTS !== '1') {
    test('universe objects', { skip: 'set RUN_API_TESTS=1' }, () => {});
} else if (!existsSync(wranglerBin)) {
    test('universe objects', { skip: 'wrangler is absent' }, () => {});
} else {
    test('universe objects', { timeout: 180000 }, async () => {
        await withDevServer(async (base) => {
            const stamp = randomBytes(4).toString('hex');
            const owner = userCookie(`k14a${stamp}`, `k14a${stamp}@localhost`);
            const other = userCookie(`k14b${stamp}`, `k14b${stamp}@localhost`);
            const headers = { cookie: owner };
            const created = await jsonFetch(`${base}/api/universes`, {
                method: 'POST',
                headers: { ...headers, 'content-type': 'application/json' },
                body: JSON.stringify({ name: 'Objects', truthVersion: null, editionDefault: 'MgT2E' }),
            });
            assert.equal(created.status, 201, JSON.stringify(created.body));
            const id = created.body.data.id;
            assert.equal(objectBytes(id), 0);

            const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
            const pngHash = sha(png);
            const notWebp = await jsonFetch(`${base}/api/universes/${id}/objects/${pngHash}`, {
                method: 'PUT',
                headers,
                body: png,
            });
            assert.equal(notWebp.status, 400, JSON.stringify(notWebp.body));
            assert.equal(notWebp.body.error.code, 'validation');
            assert.equal(objectBytes(id), 0);

            const webp = tinyWebp(1);
            const hash = sha(webp);
            const wrong = await jsonFetch(`${base}/api/universes/${id}/objects/${'ab'.repeat(32)}`, {
                method: 'PUT',
                headers,
                body: webp,
            });
            assert.equal(wrong.status, 400, JSON.stringify(wrong.body));
            assert.equal(wrong.body.error.code, 'validation');
            assert.equal(objectBytes(id), 0);

            const foreign = await jsonFetch(`${base}/api/universes/${id}/objects/${hash}`, {
                method: 'PUT',
                headers: { ...headers, origin: 'https://evil.example' },
                body: webp,
            });
            assert.equal(foreign.status, 403);
            assert.equal(foreign.body.error.code, 'forbidden');
            assert.equal(objectBytes(id), 0);

            const uploaded = await jsonFetch(`${base}/api/universes/${id}/objects/${hash}`, {
                method: 'PUT',
                headers,
                body: webp,
            });
            assert.equal(uploaded.status, 201, JSON.stringify(uploaded.body));
            assert.equal(uploaded.body.data.hash, hash);
            assert.equal(uploaded.body.data.bytes, webp.length);
            assert.equal(objectBytes(id), webp.length);

            const repeated = await jsonFetch(`${base}/api/universes/${id}/objects/${hash}`, {
                method: 'PUT',
                headers,
                body: webp,
            });
            assert.equal(repeated.status, 200, JSON.stringify(repeated.body));
            assert.equal(repeated.body.data.hash, hash);
            assert.equal(objectBytes(id), webp.length);

            const stolenGet = await fetch(`${base}/api/universes/${id}/objects/${hash}`, { headers: { cookie: other } });
            assert.equal(stolenGet.status, 404);
            const stolenPut = await jsonFetch(`${base}/api/universes/${id}/objects/${hash}`, {
                method: 'PUT',
                headers: { cookie: other },
                body: webp,
            });
            assert.equal(stolenPut.status, 404);
            assert.equal(stolenPut.body.error.code, 'not_found');
            assert.equal(objectBytes(id), webp.length);

            const streamed = await fetch(`${base}/api/universes/${id}/objects/${hash}`, { headers });
            assert.equal(streamed.status, 200);
            assert.equal(streamed.headers.get('content-type'), 'image/webp');
            assert.equal(streamed.headers.get('cache-control'), 'private, immutable');
            assert.deepEqual(Buffer.from(await streamed.arrayBuffer()), webp);

            const missing = await fetch(`${base}/api/universes/${id}/objects/${sha(tinyWebp(9))}`, { headers });
            assert.equal(missing.status, 404);

            const second = tinyWebp(2);
            execute(`UPDATE universes SET object_bytes = ${QUOTA - second.length + 1} WHERE id = '${id}'`);
            const over = await jsonFetch(`${base}/api/universes/${id}/objects/${sha(second)}`, {
                method: 'PUT',
                headers,
                body: second,
            });
            assert.equal(over.status, 400, JSON.stringify(over.body));
            assert.equal(over.body.error.code, 'too_large');
            assert.equal(objectBytes(id), QUOTA - second.length + 1);
            const stillThere = await jsonFetch(`${base}/api/universes/${id}/objects/${hash}`, {
                method: 'PUT',
                headers,
                body: webp,
            });
            assert.equal(stillThere.status, 200, JSON.stringify(stillThere.body));
            assert.equal(objectBytes(id), QUOTA - second.length + 1);
        });
    });
}
