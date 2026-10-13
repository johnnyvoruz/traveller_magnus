import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { runWrangler } from './session.js';
import { startDev, stopDev, wranglerBin } from './server.js';
import { createSoftwareAuthenticator } from './software_authenticator.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const port = 18847;
const inspectorPort = 19847;
const persistTo = path.join(root, '.tmp', 'lane-b-passkeys');
const base = `http://127.0.0.1:${port}`;

function authSecret() {
    const text = readFileSync(path.join(root, 'apps', 'api', '.dev.vars'), 'utf8');
    const line = text.split(/\r?\n/).find((item) => item.startsWith('BETTER_AUTH_SECRET='));
    if (!line) throw new Error('BETTER_AUTH_SECRET is unset');
    const value = line.slice('BETTER_AUTH_SECRET='.length).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) return value.slice(1, -1);
    return value;
}

function betterAuthUrl() {
    const toml = readFileSync(path.join(root, 'apps', 'api', 'wrangler.toml'), 'utf8');
    let url = toml.match(/BETTER_AUTH_URL\s*=\s*"([^"]+)"/)?.[1] ?? 'https://traveller.voyage';
    const varsPath = path.join(root, 'apps', 'api', '.dev.vars');
    if (existsSync(varsPath)) {
        const line = readFileSync(varsPath, 'utf8').split(/\r?\n/).find((item) => item.startsWith('BETTER_AUTH_URL='));
        if (line) {
            const value = line.slice('BETTER_AUTH_URL='.length).trim();
            url = value.replace(/^['"]|['"]$/g, '');
        }
    }
    return new URL(url);
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

function d1(sql) {
    const out = runWrangler(['d1', 'execute', 'voyage', '--local', '--persist-to', persistTo, '--json', '--command', sql]);
    const parsed = JSON.parse(out);
    const table = Array.isArray(parsed) ? parsed.at(-1) : parsed;
    return table.results ?? [];
}

function sqlFile(sql) {
    const dir = mkdtempSync(path.join(tmpdir(), 'voyage-passkey-'));
    const file = path.join(dir, 'rows.sql');
    writeFileSync(file, sql);
    try {
        runWrangler(['d1', 'execute', 'voyage', '--local', '--persist-to', persistTo, '--file', file]);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

function sessionCookie(userId, email) {
    const now = Date.now();
    const expires = now + 30 * 24 * 60 * 60 * 1000;
    const token = randomBytes(32).toString('hex');
    const sessionId = `${userId}-${randomBytes(8).toString('hex')}`;
    sqlFile(`
INSERT INTO user (id, name, email, email_verified, created_at, updated_at, role, banned)
VALUES ('${userId}', '${userId}', '${email}', 1, ${now}, ${now}, 'user', 0);
INSERT INTO session (id, expires_at, token, created_at, updated_at, user_id)
VALUES ('${sessionId}', ${expires}, '${token}', ${now}, ${now}, '${userId}');
INSERT INTO account (id, account_id, provider_id, user_id, created_at, updated_at)
VALUES ('${userId}-google', 'google-${userId}', 'google', '${userId}', ${now}, ${now});
`);
    const signature = createHmac('sha256', authSecret()).update(token).digest('base64');
    return `__Secure-better-auth.session_token=${encodeURIComponent(`${token}.${signature}`)}`;
}

function remember(jar, response) {
    const list = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [];
    for (const line of list) {
        const pair = line.split(';')[0] ?? '';
        const eq = pair.indexOf('=');
        if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
}

function cookieHeader(jar) {
    return [...jar.entries()].map(([key, value]) => `${key}=${value}`).join('; ');
}

async function call(url, jar, options = {}) {
    const headers = { origin: options.origin, ...(options.headers ?? {}) };
    const cookie = cookieHeader(jar);
    if (cookie) headers.cookie = cookie;
    if (options.body !== undefined) headers['content-type'] = 'application/json';
    const response = await fetch(url, {
        method: options.method ?? 'GET',
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    remember(jar, response);
    const text = await response.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text }; }
    return { status: response.status, body };
}

if (process.env.RUN_API_TESTS !== '1') {
    test('username and passkey sign-in', { skip: 'set RUN_API_TESTS=1' }, () => {});
} else if (!existsSync(wranglerBin)) {
    test('username and passkey sign-in', { skip: 'wrangler is absent' }, () => {});
} else {
    test('username and passkey sign-in', { timeout: 180000 }, async () => {
        rmSync(persistTo, { recursive: true, force: true });
        const party = betterAuthUrl();
        const origin = party.origin;
        let child;
        try {
            runWrangler(['d1', 'migrations', 'apply', 'voyage', '--local', '--persist-to', persistTo]);
            child = startDev({ port, persistTo, inspectorPort });
            await up(base);
            const auth = (jar, path, options = {}) => call(`${base}/api/auth${path}`, jar, { ...options, origin });
            const app = (jar, path, options = {}) => call(`${base}${path}`, jar, { ...options, origin });

            const providers = await app(new Map(), '/api/providers');
            assert.equal(providers.status, 200);
            for (const [name, host] of [['google', 'accounts.google.com'], ['discord', 'discord.com'], ['twitter', 'twitter.com']]) {
                const start = await auth(new Map(), '/sign-in/social', {
                    method: 'POST',
                    body: { provider: name, disableRedirect: true },
                });
                if (providers.body.data[name]) {
                    assert.equal(start.status, 200, `${name} ${JSON.stringify(start.body)}`);
                    assert.equal(typeof start.body.url, 'string');
                    assert.equal(start.body.url.includes(host), true, name);
                } else {
                    assert.equal(start.status, 404, name);
                    assert.equal(start.body.code, 'PROVIDER_NOT_FOUND');
                }
            }

            const authn = await createSoftwareAuthenticator();
            const jar = new Map();
            const options = await auth(jar, '/passkey/generate-register-options?name=Ada_Lane');
            assert.equal(options.status, 200, JSON.stringify(options.body));
            assert.equal(options.body.rp.id, party.hostname);
            const created = await auth(jar, '/passkey/verify-registration', {
                method: 'POST',
                body: {
                    response: await authn.registrationResponse({ challenge: options.body.challenge, rpID: options.body.rp.id, origin }),
                    name: 'Ada_Lane',
                    createSession: true,
                },
            });
            assert.equal(created.status, 200, JSON.stringify(created.body));
            const userId = created.body.user.id;
            const rows = d1(`SELECT email, email_verified AS emailVerified, username FROM user WHERE id = '${userId}'`);
            assert.equal(rows.length, 1);
            assert.equal(rows[0].username, 'ada_lane');
            assert.equal(String(rows[0].email).endsWith('@users.invalid'), true);
            assert.equal(rows[0].email.includes('@'), true);
            assert.equal(Number(rows[0].emailVerified), 0);
            assert.equal(d1(`SELECT handle FROM profile WHERE user_id = '${userId}'`)[0].handle, 'ada_lane');
            assert.equal(d1(`SELECT user_id FROM generation_allowance WHERE user_id = '${userId}'`).length, 1);
            assert.equal(d1(`SELECT id FROM passkey WHERE user_id = '${userId}'`).length, 1);

            const shown = await auth(jar, '/recovery/reveal', { method: 'POST', body: {} });
            assert.equal(shown.status, 200, JSON.stringify(shown.body));
            assert.equal(shown.body.codes.length, 10);
            const again = await auth(jar, '/recovery/reveal', { method: 'POST', body: {} });
            assert.equal(again.status, 400, JSON.stringify(again.body));
            const freshCodes = await auth(jar, '/recovery/regenerate', { method: 'POST', body: {} });
            assert.equal(freshCodes.status, 200, JSON.stringify(freshCodes.body));
            assert.equal(freshCodes.body.codes.length, 10);
            const stale = await auth(new Map(), '/recovery/redeem', {
                method: 'POST',
                body: { username: 'Ada_Lane', code: shown.body.codes[0] },
            });
            assert.equal(stale.status, 400, JSON.stringify(stale.body));

            const recovery = new Map();
            const redeemed = await auth(recovery, '/recovery/redeem', {
                method: 'POST',
                body: { username: 'ada_lane', code: freshCodes.body.codes[0] },
            });
            assert.equal(redeemed.status, 200, JSON.stringify(redeemed.body));
            assert.equal(redeemed.body.mustAddPasskey, true);
            const blocked = await app(recovery, '/api/me');
            assert.equal(blocked.status, 403, JSON.stringify(blocked.body));
            assert.equal(blocked.body.error.code, 'passkey_required');
            const blockedAuth = await auth(recovery, '/get-session');
            assert.equal(blockedAuth.status, 403, JSON.stringify(blockedAuth.body));

            const second = await createSoftwareAuthenticator();
            const addOptions = await auth(recovery, '/passkey/generate-register-options?name=Second_key');
            assert.equal(addOptions.status, 200, JSON.stringify(addOptions.body));
            const added = await auth(recovery, '/passkey/verify-registration', {
                method: 'POST',
                body: {
                    response: await second.registrationResponse({ challenge: addOptions.body.challenge, rpID: addOptions.body.rp.id, origin }),
                    name: 'Second key',
                    createSession: true,
                },
            });
            assert.equal(added.status, 200, JSON.stringify(added.body));
            const me = await app(recovery, '/api/me');
            assert.equal(me.status, 200, JSON.stringify(me.body));
            assert.equal(me.body.data.username, 'ada_lane');
            assert.equal(me.body.data.hasPasskey, true);
            assert.equal(me.body.data.unusedRecoveryCodes, 9);
            assert.deepEqual(me.body.data.linkedProviders, []);
            assert.equal(me.body.data.profile.handle, 'ada_lane');

            const leaving = new Map();
            const leavingRedeem = await auth(leaving, '/recovery/redeem', {
                method: 'POST',
                body: { username: 'ada_lane', code: freshCodes.body.codes[1] },
            });
            assert.equal(leavingRedeem.status, 200, JSON.stringify(leavingRedeem.body));
            const signedOutSession = await auth(leaving, '/sign-out', { method: 'POST', body: {} });
            assert.equal(signedOutSession.status, 200, JSON.stringify(signedOutSession.body));
            assert.equal(signedOutSession.body.success, true);
            const afterSignOut = await app(leaving, '/api/me');
            assert.equal(afterSignOut.status, 401, JSON.stringify(afterSignOut.body));

            const signedOut = new Map();
            const authOptions = await auth(signedOut, '/passkey/generate-authenticate-options');
            assert.equal(authOptions.status, 200, JSON.stringify(authOptions.body));
            const signedIn = await auth(signedOut, '/passkey/verify-authentication', {
                method: 'POST',
                body: {
                    response: await authn.authenticationResponse({ challenge: authOptions.body.challenge, rpID: party.hostname, origin }),
                },
            });
            assert.equal(signedIn.status, 200, JSON.stringify(signedIn.body));
            assert.equal(signedIn.body.user.username, 'ada_lane');
            const bareSignOut = await auth(signedOut, '/sign-out', { method: 'POST' });
            assert.equal(bareSignOut.status, 200, JSON.stringify(bareSignOut.body));
            assert.equal(bareSignOut.body.success, true);
            const afterBare = await app(signedOut, '/api/me');
            assert.equal(afterBare.status, 401, JSON.stringify(afterBare.body));

            const reused = await auth(new Map(), '/recovery/redeem', {
                method: 'POST',
                body: { username: 'ada_lane', code: freshCodes.body.codes[0] },
            });
            assert.equal(reused.status, 400, JSON.stringify(reused.body));
            for (let attempt = 1; attempt <= 3; attempt++) {
                const bad = await auth(new Map(), '/recovery/redeem', {
                    method: 'POST',
                    body: { username: 'ada_lane', code: 'ZZZZ-ZZZZ-ZZZZ' },
                });
                assert.equal(bad.status, 400, `attempt ${attempt} ${JSON.stringify(bad.body)}`);
            }
            const locked = await auth(new Map(), '/recovery/redeem', {
                method: 'POST',
                body: { username: 'ada_lane', code: 'YYYY-YYYY-YYYY' },
            });
            assert.equal(locked.status, 429, JSON.stringify(locked.body));

            const listed = await auth(recovery, '/passkey/list-user-passkeys');
            assert.equal(listed.status, 200, JSON.stringify(listed.body));
            assert.equal(listed.body.length, 2);
            assert.equal(typeof listed.body[0].createdAt, 'string');
            assert.equal(Number.isNaN(Date.parse(listed.body[0].createdAt)), false);
            const removed = await auth(recovery, '/passkey/delete-passkey', { method: 'POST', body: { id: listed.body[0].id } });
            assert.equal(removed.status, 200, JSON.stringify(removed.body));
            const last = await auth(recovery, '/passkey/delete-passkey', { method: 'POST', body: { id: listed.body[1].id } });
            assert.equal(last.status, 400, JSON.stringify(last.body));
            assert.equal(last.body.code, 'last_passkey');

            const renamed = await auth(recovery, '/username', { method: 'POST', body: { username: 'Ada_Lane_2' } });
            assert.equal(renamed.status, 200, JSON.stringify(renamed.body));
            assert.equal(renamed.body.username, 'ada_lane_2');
            assert.equal(d1(`SELECT handle FROM profile WHERE user_id = '${userId}'`)[0].handle, 'ada_lane_2');

            const early = await auth(new Map(), '/passkey/generate-register-options?name=early_stop');
            assert.equal(early.status, 200, JSON.stringify(early.body));
            assert.equal(d1(`SELECT id FROM user WHERE username = 'early_stop'`).length, 0);

            const taken = await auth(new Map(), '/passkey/generate-register-options?name=ada_lane_2');
            assert.equal(taken.status, 400, JSON.stringify(taken.body));
            assert.equal(taken.body.code, 'username_taken');
            const reserved = await auth(new Map(), '/passkey/generate-register-options?name=Admin');
            assert.equal(reserved.status, 400, JSON.stringify(reserved.body));
            assert.equal(reserved.body.code, 'username_reserved');

            const socialId = 'socialb';
            const socialJar = new Map();
            const socialCookie = sessionCookie(socialId, 'socialb@example.com');
            const eq = socialCookie.indexOf('=');
            socialJar.set(socialCookie.slice(0, eq), socialCookie.slice(eq + 1));
            const socialMe = await app(socialJar, '/api/me');
            assert.equal(socialMe.status, 200, JSON.stringify(socialMe.body));
            assert.equal(socialMe.body.data.hasPasskey, false);
            assert.deepEqual(socialMe.body.data.linkedProviders, ['google']);
            const accounts = await auth(socialJar, '/list-accounts');
            assert.equal(accounts.status, 200, JSON.stringify(accounts.body));
            assert.equal(Array.isArray(accounts.body), true);
            assert.equal(accounts.body.length, 1);
            assert.equal(typeof accounts.body[0].id, 'string');
            assert.equal(accounts.body[0].providerId, 'google');
            assert.equal(typeof accounts.body[0].accountId, 'string');
            assert.equal(accounts.body[0].userId, socialId);
            assert.equal(Array.isArray(accounts.body[0].scopes), true);
            assert.equal(typeof accounts.body[0].createdAt, 'string');
            assert.equal(typeof accounts.body[0].updatedAt, 'string');
            const socialAuthn = await createSoftwareAuthenticator();
            const socialOptions = await auth(socialJar, '/passkey/generate-register-options?name=Laptop');
            assert.equal(socialOptions.status, 200, JSON.stringify(socialOptions.body));
            const socialAdded = await auth(socialJar, '/passkey/verify-registration', {
                method: 'POST',
                body: {
                    response: await socialAuthn.registrationResponse({ challenge: socialOptions.body.challenge, rpID: socialOptions.body.rp.id, origin }),
                    name: 'Laptop',
                },
            });
            assert.equal(socialAdded.status, 200, JSON.stringify(socialAdded.body));
            const socialPasskey = d1(`SELECT id FROM passkey WHERE user_id = '${socialId}'`);
            assert.equal(socialPasskey.length, 1);
            const unlinked = await auth(socialJar, '/unlink-account', { method: 'POST', body: { accountId: `${socialId}-google` } });
            assert.equal(unlinked.status, 200, JSON.stringify(unlinked.body));
            const cannot = await auth(socialJar, '/passkey/delete-passkey', { method: 'POST', body: { id: socialPasskey[0].id } });
            assert.equal(cannot.status, 400, JSON.stringify(cannot.body));
            assert.equal(cannot.body.code, 'last_passkey');
            const onlyProvider = sessionCookie('socialc', 'socialc@example.com');
            const providerJar = new Map();
            const providerEq = onlyProvider.indexOf('=');
            providerJar.set(onlyProvider.slice(0, providerEq), onlyProvider.slice(providerEq + 1));
            const refused = await auth(providerJar, '/unlink-account', { method: 'POST', body: { accountId: 'socialc-google' } });
            assert.equal(refused.status, 400, JSON.stringify(refused.body));
            assert.equal(refused.body.code, 'last_provider');

            for (const name of ['rate_one', 'rate_two', 'rate_three']) {
                const started = await auth(new Map(), `/passkey/generate-register-options?name=${name}`);
                assert.equal(started.status, 200, `${name} ${JSON.stringify(started.body)}`);
                assert.equal(d1(`SELECT id FROM user WHERE username = '${name}'`).length, 0);
            }
            const sixth = await auth(new Map(), '/passkey/generate-register-options?name=rate_four');
            assert.equal(sixth.status, 429, JSON.stringify(sixth.body));
            assert.equal(sixth.body.code, 'signup_limit');
            assert.equal(d1(`SELECT id FROM user WHERE username = 'rate_four'`).length, 0);
        } finally {
            stopDev(child?.pid);
        }
    });
}
