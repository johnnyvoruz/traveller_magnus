import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { runWrangler } from './session.js';
import { startDev, stopDev, wranglerBin } from './server.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const port = 18849;
const inspectorPort = 19849;
const persistTo = path.join(root, '.tmp', 'lane-b-no0012');
const base = `http://127.0.0.1:${port}`;

function authSecret() {
    const text = readFileSync(path.join(root, 'apps', 'api', '.dev.vars'), 'utf8');
    const line = text.split(/\r?\n/).find((item) => item.startsWith('BETTER_AUTH_SECRET='));
    if (!line) throw new Error('BETTER_AUTH_SECRET is unset');
    const value = line.slice('BETTER_AUTH_SECRET='.length).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) return value.slice(1, -1);
    return value;
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

function sqlFile(sql) {
    const dir = mkdtempSync(path.join(root, '.tmp', 'lane-b-sql-'));
    const file = path.join(dir, 'apply.sql');
    writeFileSync(file, sql);
    try {
        runWrangler(['d1', 'execute', 'voyage', '--local', '--persist-to', persistTo, '--file', file]);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

function userCookie(userId, email) {
    const now = Date.now();
    const expires = now + 30 * 24 * 60 * 60 * 1000;
    const token = randomBytes(32).toString('hex');
    sqlFile(`
INSERT INTO user (id, name, email, email_verified, created_at, updated_at, role, banned)
VALUES ('${userId}', '${userId}', '${email}', 1, ${now}, ${now}, 'user', 0);
INSERT INTO session (id, expires_at, token, created_at, updated_at, user_id)
VALUES ('${userId}-session', ${expires}, '${token}', ${now}, ${now}, '${userId}');
`);
    const signature = createHmac('sha256', authSecret()).update(token).digest('base64');
    return `__Secure-better-auth.session_token=${encodeURIComponent(`${token}.${signature}`)}`;
}

async function call(path, cookie, options = {}) {
    const headers = {};
    if (cookie) headers.cookie = cookie;
    if (options.body !== undefined) headers['content-type'] = 'application/json';
    const response = await fetch(`${base}${path}`, {
        method: options.method ?? 'GET',
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    const text = await response.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text }; }
    return { status: response.status, body };
}

if (process.env.RUN_API_TESTS !== '1') {
    test('signed-in routes without migration 0012', { skip: 'set RUN_API_TESTS=1' }, () => {});
} else if (!existsSync(wranglerBin)) {
    test('signed-in routes without migration 0012', { skip: 'wrangler is absent' }, () => {});
} else {
    test('signed-in routes without migration 0012', { timeout: 180000 }, async () => {
        rmSync(persistTo, { recursive: true, force: true });
        let child;
        try {
            runWrangler(['d1', 'migrations', 'apply', 'voyage', '--local', '--persist-to', persistTo]);
            sqlFile(`
DROP INDEX IF EXISTS user_username_unique;
ALTER TABLE user DROP COLUMN username;
ALTER TABLE session DROP COLUMN must_add_passkey;
DROP TABLE IF EXISTS passkey;
DROP TABLE IF EXISTS recovery_code;
DROP TABLE IF EXISTS recovery_failure;
DROP TABLE IF EXISTS recovery_envelope;
DROP TABLE IF EXISTS passkey_signup;
`);
            const cookie = userCookie('pre0012', 'pre0012@example.com');
            child = startDev({ port, persistTo, inspectorPort });
            await up(base);

            const me = await call('/api/me', cookie);
            assert.equal(me.status, 200, JSON.stringify(me.body));
            assert.equal(me.body.data.username, null);
            assert.equal(me.body.data.hasPasskey, false);
            assert.equal(me.body.data.unusedRecoveryCodes, 0);
            assert.deepEqual(me.body.data.linkedProviders, []);
            assert.equal(typeof me.body.data.profile.handle, 'string');

            const list = await call('/api/universes', cookie);
            assert.equal(list.status, 200, JSON.stringify(list.body));

            const session = await call('/api/auth/get-session', cookie);
            assert.equal(session.status, 200, JSON.stringify(session.body));
            assert.equal(session.body.user.email, 'pre0012@example.com');

            const passkey = await call('/api/auth/passkey/generate-register-options?name=Ada_Lane', null);
            assert.equal(passkey.status, 503, JSON.stringify(passkey.body));
            assert.equal(passkey.body.code, 'passkey_unavailable');
            assert.equal(passkey.body.message, 'Passkey sign-in is not available yet.');
            const username = await call('/api/auth/username', cookie, { method: 'POST', body: { username: 'ada_lane' } });
            assert.equal(username.status, 503, JSON.stringify(username.body));
            const recovery = await call('/api/auth/recovery/redeem', null, {
                method: 'POST',
                body: { username: 'ada_lane', code: 'AAAA-AAAA-AAAA' },
            });
            assert.equal(recovery.status, 503, JSON.stringify(recovery.body));

            for (const name of ['google', 'discord', 'twitter']) {
                const start = await call('/api/auth/sign-in/social', null, {
                    method: 'POST',
                    body: { provider: name, disableRedirect: true },
                });
                if (start.status === 200) assert.equal(typeof start.body.url, 'string');
                else {
                    assert.equal(start.status, 404, name);
                    assert.equal(start.body.code, 'PROVIDER_NOT_FOUND');
                }
            }
        } finally {
            if (child) stopDev(child.pid);
            rmSync(persistTo, { recursive: true, force: true });
        }
    });
}
