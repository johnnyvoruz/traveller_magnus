import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { betterAuth } from 'better-auth';
import { genericOAuth } from 'better-auth/plugins';
import { linkRefusal } from '../../apps/api/src/auth/auth_http.ts';
import { accountLinking } from '../../apps/api/src/auth/linking.ts';
import { PROVIDER_ALREADY_LINKED } from '../../apps/api/src/auth/passkey_words.ts';

const base = 'http://127.0.0.1:8787';

function listen() {
    const profiles = new Map();
    const server = createServer((req, res) => {
        const url = new URL(req.url ?? '/', 'http://127.0.0.1');
        if (url.pathname === '/authorize') {
            const code = `code-${profiles.size + 1}`;
            profiles.set(code, pending);
            const back = new URL(url.searchParams.get('redirect_uri') ?? '');
            back.searchParams.set('code', code);
            back.searchParams.set('state', url.searchParams.get('state') ?? '');
            res.writeHead(302, { location: back.toString() });
            res.end();
            return;
        }
        if (url.pathname === '/token') {
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ access_token: 'token', token_type: 'bearer' }));
            return;
        }
        if (url.pathname === '/userinfo') {
            const code = tokens.get('token');
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end(JSON.stringify(code ?? {}));
            return;
        }
        res.writeHead(404);
        res.end();
    });
    let pending = {};
    const tokens = new Map();
    return new Promise((resolve) => {
        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            const port = typeof address === 'object' && address ? address.port : 0;
            resolve({
                server,
                origin: `http://127.0.0.1:${port}`,
                setProfile(profile) {
                    pending = profile;
                    tokens.set('token', profile);
                },
            });
        });
    });
}

function jarFrom(response) {
    const jar = new Map();
    const list = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [];
    for (const line of list) {
        const pair = line.split(';')[0] ?? '';
        const eq = pair.indexOf('=');
        if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
    return jar;
}

function merge(jar, response) {
    for (const [key, value] of jarFrom(response)) jar.set(key, value);
}

function cookie(jar) {
    return [...jar.entries()].map(([key, value]) => `${key}=${value}`).join('; ');
}

async function call(auth, jar, path, options = {}) {
    const headers = { origin: base, ...(options.headers ?? {}) };
    const baked = cookie(jar);
    if (baked) headers.cookie = baked;
    if (options.body !== undefined) headers['content-type'] = 'application/json';
    const response = await auth.handler(new Request(`${base}/api/auth${path}`, {
        method: options.method ?? 'GET',
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        redirect: 'manual',
    }));
    merge(jar, response);
    const text = await response.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text }; }
    return { status: response.status, body, location: response.headers.get('location') };
}

test('a passkey account links a provider and a second account is refused', async () => {
    const oauth = await listen();
    const auth = betterAuth({
        baseURL: base,
        secret: 'link-test-secret-link-test-secret',
        emailAndPassword: { enabled: true },
        account: { accountLinking },
        trustedOrigins: [base],
        plugins: [
            genericOAuth({
                config: [{
                    providerId: 'testbox',
                    clientId: 'testbox',
                    clientSecret: 'testbox',
                    pkce: false,
                    authorizationUrl: `${oauth.origin}/authorize`,
                    tokenUrl: `${oauth.origin}/token`,
                    userInfoUrl: `${oauth.origin}/userinfo`,
                }],
            }),
        ],
    });
    try {
        const first = new Map();
        const created = await call(auth, first, '/sign-up/email', {
            method: 'POST',
            body: { email: 'ada@users.invalid', password: 'passkey-account-secret', name: 'Ada' },
        });
        assert.equal(created.status, 200, JSON.stringify(created.body));
        const userId = created.body.user.id;
        oauth.setProfile({
            id: 'provider-ada',
            email: 'ada.real@example.test',
            email_verified: true,
            name: 'Ada Real',
        });
        const started = await call(auth, first, '/link-social', {
            method: 'POST',
            body: { provider: 'testbox', disableRedirect: true, callbackURL: `${base}/done` },
        });
        assert.equal(started.status, 200, JSON.stringify(started.body));
        const authorized = await fetch(started.body.url, { redirect: 'manual' });
        const callback = new URL(authorized.headers.get('location'));
        const linked = await call(auth, first, `${callback.pathname.replace('/api/auth', '')}${callback.search}`);
        assert.ok(linked.status >= 300 && linked.status < 400, JSON.stringify(linked));
        const session = await call(auth, first, '/get-session');
        assert.equal(session.status, 200, JSON.stringify(session.body));
        assert.equal(session.body.user.id, userId);
        const accounts = await call(auth, first, '/list-accounts');
        assert.equal(Array.isArray(accounts.body), true);
        assert.equal(accounts.body.some((row) => row.providerId === 'testbox' && row.id), true);

        const signedIn = await call(auth, first, '/sign-in/social', {
            method: 'POST',
            body: { provider: 'testbox', disableRedirect: true, callbackURL: `${base}/done` },
        });
        assert.equal(signedIn.status, 200, JSON.stringify(signedIn.body));
        oauth.setProfile({
            id: 'provider-other',
            email: 'other@example.test',
            email_verified: true,
            name: 'Other',
        });
        const otherAuth = await fetch(signedIn.body.url, { redirect: 'manual' });
        const otherCallback = new URL(otherAuth.headers.get('location'));
        const otherJar = new Map(first);
        const switched = await call(auth, otherJar, `${otherCallback.pathname.replace('/api/auth', '')}${otherCallback.search}`);
        assert.ok(switched.status >= 300 && switched.status < 400, JSON.stringify(switched));
        const otherSession = await call(auth, otherJar, '/get-session');
        assert.notEqual(otherSession.body.user.id, userId);

        const second = new Map();
        const again = await call(auth, second, '/sign-up/email', {
            method: 'POST',
            body: { email: 'bea@users.invalid', password: 'passkey-account-secret', name: 'Bea' },
        });
        assert.equal(again.status, 200, JSON.stringify(again.body));
        oauth.setProfile({
            id: 'provider-ada',
            email: 'ada.real@example.test',
            email_verified: true,
            name: 'Ada Real',
        });
        const retry = await call(auth, second, '/link-social', {
            method: 'POST',
            body: { provider: 'testbox', disableRedirect: true, callbackURL: `${base}/done` },
        });
        assert.equal(retry.status, 200, JSON.stringify(retry.body));
        const retryAuth = await fetch(retry.body.url, { redirect: 'manual' });
        const retryCallback = new URL(retryAuth.headers.get('location'));
        const refused = await call(auth, second, `${retryCallback.pathname.replace('/api/auth', '')}${retryCallback.search}`);
        const rewritten = linkRefusal(new Response(null, { status: refused.status, headers: { location: refused.location ?? '' } }));
        const described = new URL(rewritten.headers.get('location') ?? '');
        assert.equal(described.searchParams.get('error'), 'account_already_linked_to_different_user');
        assert.equal(described.searchParams.get('error_description'), PROVIDER_ALREADY_LINKED);
    } finally {
        oauth.server.close();
    }
});
