import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { removeTree, runWrangler } from './session.js';
import { startDev, stopDev, wranglerBin } from './server.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function authSecret() {
    const text = readFileSync(path.join(root, 'apps', 'api', '.dev.vars'), 'utf8');
    const line = text.split(/\r?\n/).find((item) => item.startsWith('BETTER_AUTH_SECRET='));
    if (!line) throw new Error('BETTER_AUTH_SECRET is unset');
    const value = line.slice('BETTER_AUTH_SECRET='.length).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) return value.slice(1, -1);
    return value;
}

function sqlFile(persistTo, sql) {
    const dir = mkdtempSync(path.join(tmpdir(), 'voyage-mcp-'));
    const file = path.join(dir, 'rows.sql');
    writeFileSync(file, sql);
    try {
        runWrangler(['d1', 'execute', 'voyage', '--local', '--persist-to', persistTo, '--file', file]);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

function userCookie(userId, email, persistTo) {
    const now = Date.now();
    const expires = now + 30 * 24 * 60 * 60 * 1000;
    const token = randomBytes(32).toString('hex');
    const sessionId = `${userId}-${randomBytes(8).toString('hex')}`;
    sqlFile(persistTo, `
INSERT INTO user (id, name, email, email_verified, created_at, updated_at, role, banned)
VALUES ('${userId}', '${userId}', '${email}', 1, ${now}, ${now}, 'user', 0);
INSERT INTO session (id, expires_at, token, created_at, updated_at, user_id)
VALUES ('${sessionId}', ${expires}, '${token}', ${now}, ${now}, '${userId}');
`);
    const signature = createHmac('sha256', authSecret()).update(token).digest('base64');
    return `__Secure-better-auth.session_token=${encodeURIComponent(`${token}.${signature}`)}`;
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
    throw new Error(last || 'wrangler did not answer /api/health');
}

async function jsonFetch(url, options = {}) {
    const response = await fetch(url, options);
    const text = await response.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text }; }
    return { status: response.status, body, headers: response.headers, text };
}

if (process.env.RUN_API_TESTS !== '1') {
    test('mcp on the worker', { skip: 'set RUN_API_TESTS=1' }, () => {});
} else if (!existsSync(wranglerBin)) {
    test('mcp on the worker', { skip: 'wrangler is absent' }, () => {});
} else {
    test('mcp on the worker', { timeout: 180000 }, async () => {
        const persistTo = path.join(root, '.tmp', 'lane-b-mcp');
        removeTree(persistTo);
        const port = 18894;
        const base = `http://127.0.0.1:${port}`;
        const stamp = randomBytes(3).toString('hex');
        let child;
        try {
            runWrangler(['d1', 'migrations', 'apply', 'voyage', '--local', '--persist-to', persistTo]);
            const ownerId = `mcp${stamp}`;
            const owner = userCookie(ownerId, `${ownerId}@localhost`, persistTo);
            sqlFile(persistTo, `
INSERT INTO platform_flags (key, value, updated_at, updated_by)
VALUES ('agent_access', 'on', '2026-10-17T00:00:00.000Z', '${ownerId}');
`);
            child = startDev({ port, persistTo, inspectorPort: 19894 });
            await up(base);
            const cookie = { 'content-type': 'application/json', cookie: owner, origin: base };
            const created = await jsonFetch(`${base}/api/universes`, {
                method: 'POST',
                headers: cookie,
                body: JSON.stringify({ name: 'MCP table', truthVersion: null, editionDefault: 'MgT2E' }),
            });
            assert.equal(created.status, 201, JSON.stringify(created.body));
            const minted = await jsonFetch(`${base}/api/tokens`, {
                method: 'POST',
                headers: cookie,
                body: JSON.stringify({
                    name: 'MCP agent',
                    scopes: ['campaign:read', 'proposals:write'],
                    universeId: created.body.data.id,
                }),
            });
            assert.equal(minted.status, 201, JSON.stringify(minted.body?.error));
            const secret = minted.body.data.token;
            const call = {
                jsonrpc: '2.0',
                id: 1,
                method: 'tools/list',
                params: {},
            };
            const headers = {
                'content-type': 'application/json',
                accept: 'application/json, text/event-stream',
            };
            const cookieOnly = await jsonFetch(`${base}/mcp`, {
                method: 'POST',
                headers: { ...headers, cookie: owner },
                body: JSON.stringify(call),
            });
            assert.equal(cookieOnly.status, 401, cookieOnly.text);
            assert.equal(cookieOnly.body?.error?.code, 'token_invalid');
            assert.equal(cookieOnly.headers.get('www-authenticate'), 'Bearer error="invalid_token"');
            const missing = await jsonFetch(`${base}/mcp`, { method: 'POST', headers, body: JSON.stringify(call) });
            assert.equal(missing.status, 401, missing.text);
            assert.equal(missing.body?.error?.code, 'token_invalid');
            const evil = await jsonFetch(`${base}/mcp`, {
                method: 'POST',
                headers: { ...headers, authorization: `Bearer ${secret}`, origin: 'https://evil.example' },
                body: JSON.stringify(call),
            });
            assert.equal(evil.status, 403, evil.text);
            assert.equal(evil.body?.error?.code, 'forbidden');
            const got = await jsonFetch(`${base}/mcp`, { method: 'GET', headers: { authorization: `Bearer ${secret}` } });
            const deleted = await jsonFetch(`${base}/mcp`, { method: 'DELETE', headers: { authorization: `Bearer ${secret}` } });
            assert.equal(got.status, 405, got.text);
            assert.equal(deleted.status, 405, deleted.text);
            const listed = await jsonFetch(`${base}/mcp`, {
                method: 'POST',
                headers: { ...headers, authorization: `Bearer ${secret}` },
                body: JSON.stringify(call),
            });
            assert.equal(listed.status, 200, listed.text.slice(0, 500));
            for (const name of ['list_campaigns', 'read_campaign_index', 'read_records', 'search_records', 'submit_proposals', 'read_proposal_batch']) {
                assert.equal(listed.text.includes(name), true, name);
            }
            assert.equal(listed.text.includes(secret), false);
        } finally {
            stopDev(child?.pid);
            removeTree(persistTo);
        }
    });
}
