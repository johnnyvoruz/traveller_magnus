/**
 * The passkey client over a stub server and a stub navigator.credentials.
 * Codes stay on the return value. The libraries are not imported until a ceremony runs.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
    CEREMONY_CANCELLED, PASSKEY_UNAVAILABLE, _fetchForTests, _loadPasskeyClientForTests,
    addPasskey, listLinkedAccounts, listPasskeys, passkeySupported, redeemRecovery,
    regenerateRecoveryCodes, removePasskey, renamePasskey, setUsername, signInWithPasskey,
    linkProvider, signUp, startSocial, unlinkAccount,
} from '../../apps/web/src/account/passkey.ts';
import { loadSession, session, signOut } from '../../apps/web/src/account/session.ts';

const source = readFileSync(new URL('../../apps/web/src/account/passkey.ts', import.meta.url), 'utf8');
const TAKEN = 'That username is taken.';
const RESERVED = 'That username is reserved.';
const SIGNUP_LIMIT = 'You can start 5 passkey sign-ups an hour from this network. Try again later.';
const RECOVERY_LIMIT = 'Too many incorrect recovery codes. Try again in 15 minutes.';
const LAST_PASSKEY = 'This passkey is the only way to sign in. Add another passkey, or link Google, Discord, or X, before you remove it.';
const LAST_PROVIDER = 'This is the only linked provider on an account with no passkey. Add a passkey before you unlink it.';
const REQUIRED = 'Add a passkey before you use the rest of this account.';
const RESET = '2026-10-13T00:00:00.000Z';
const CODES = ['AAAA-BBBB-CCC1', 'AAAA-BBBB-CCC2', 'AAAA-BBBB-CCC3', 'AAAA-BBBB-CCC4', 'AAAA-BBBB-CCC5', 'AAAA-BBBB-CCC6', 'AAAA-BBBB-CCC7', 'AAAA-BBBB-CCC8', 'AAAA-BBBB-CCC9', 'AAAA-BBBB-CC10'];

function json(status, body) {
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function me(id, over = {}) {
    return json(200, {
        ok: true,
        data: {
            id, email: null, role: 'user', profile: { handle: id },
            username: id, hasPasskey: true, unusedRecoveryCodes: 10, linkedProviders: [],
            allowance: { limit: 100, used: 0, remaining: 40, resetsAt: RESET },
            ...over,
        },
    });
}

let loads = 0;
function browser(on) {
    // Node's navigator is a getter with no setter. Replace the property for this file.
    Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        writable: true,
        value: on ? { credentials: { create() {}, get() {} } } : {},
    });
}

function install(handler) {
    loads = 0;
    const calls = [];
    _loadPasskeyClientForTests(async () => {
        loads += 1;
        return {
            signIn: { passkey: () => handler.passkey() },
            passkey: { addPasskey: (opts) => handler.add(opts) },
        };
    });
    _fetchForTests(async (url, init) => {
        const call = {
            url: String(url),
            method: init && init.method ? init.method : 'GET',
            body: init && init.body ? JSON.parse(init.body) : null,
            credentials: init && init.credentials,
        };
        calls.push(call);
        return handler.http(call);
    });
    return calls;
}

async function reset() {
    browser(false);
    _loadPasskeyClientForTests(null);
    _fetchForTests(null);
    await signOut(async () => json(200, {}));
}

test('the passkey module does not statically import the libraries, and it keeps codes out of storage', () => {
    assert.equal(/^\s*import\s+.*better-auth/m.test(source), false);
    assert.equal(source.includes('localStorage'), false);
    assert.equal(source.includes('sessionStorage'), false);
    assert.equal(source.includes('console.'), false);
});

test('no WebAuthn answers before any ceremony or request', async () => {
    await reset();
    const calls = install({
        http: () => json(500, {}),
        add: () => { throw new Error('ceremony'); },
        passkey: () => { throw new Error('ceremony'); },
    });
    assert.equal(passkeySupported(), false);
    for (const done of [await signUp('ranger'), await signInWithPasskey(), await addPasskey('Phone')]) {
        assert.equal(done.ok, false);
        assert.equal(done.code, PASSKEY_UNAVAILABLE);
        assert.equal(done.message, 'This browser cannot create a passkey.');
    }
    assert.equal(calls.length, 0);
    assert.equal(loads, 0);
});

test('sign-up: taken, reserved, the hourly limit, a cancelled ceremony, then the ten codes once', async () => {
    await reset();
    browser(true);
    let mode = 'taken';
    const calls = install({
        add: () => {
            if (mode === 'taken') return { data: null, error: { code: 'username_taken', message: TAKEN } };
            if (mode === 'reserved') return { data: null, error: { code: 'username_reserved', message: RESERVED } };
            if (mode === 'limit') return { data: null, error: { code: 'signup_limit', message: SIGNUP_LIMIT } };
            if (mode === 'cancel') return { data: null, error: { code: 'ERROR_CEREMONY_ABORTED', message: 'The operation either timed out or was not allowed.' } };
            if (mode === 'throw') {
                const error = new Error('see cause');
                error.code = 'ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY';
                error.cause = { name: 'NotAllowedError' };
                throw error;
            }
            if (mode === 'plugin') return { data: null, error: { code: 'CHALLENGE_NOT_FOUND', message: 'Challenge not found.' } };
            if (mode === 'wrapped') return { data: null, error: { code: 'ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY', message: 'Auth cancelled' } };
            return { data: { id: 'pk' }, error: null };
        },
        passkey: () => ({ data: null, error: null }),
        http: (call) => {
            if (call.url.includes('/api/me')) return me('ranger', { unusedRecoveryCodes: 10 });
            if (call.url.includes('/recovery/reveal')) return json(200, { codes: CODES });
            return json(404, { code: 'missing', message: 'missing' });
        },
    });
    assert.deepEqual(await signUp('Ranger'), { ok: false, code: 'username_taken', message: TAKEN });
    mode = 'reserved';
    assert.deepEqual(await signUp('admin'), { ok: false, code: 'username_reserved', message: RESERVED });
    mode = 'limit';
    assert.deepEqual(await signUp('ranger'), { ok: false, code: 'signup_limit', message: SIGNUP_LIMIT });
    mode = 'cancel';
    const closed = await signUp('ranger');
    assert.equal(closed.code, CEREMONY_CANCELLED);
    assert.equal(closed.message, 'You closed the passkey prompt.');
    mode = 'throw';
    assert.equal((await signUp('ranger')).code, CEREMONY_CANCELLED);
    mode = 'plugin';
    assert.deepEqual(await signUp('ranger'), { ok: false, code: 'ceremony_failed', message: 'The passkey could not be used. Try again.' });
    mode = 'wrapped';
    assert.deepEqual(await signUp('ranger'), { ok: false, code: 'ceremony_cancelled', message: 'You closed the passkey prompt.' });
    mode = 'ok';
    const store = new Map();
    globalThis.localStorage = { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => { store.set(key, String(value)); } };
    const made = await signUp('Ranger');
    assert.equal(made.ok, true);
    assert.deepEqual(made.codes, CODES);
    const ceremony = calls.find((call) => call.url.includes('/recovery/reveal'));
    assert.ok(ceremony);
    assert.equal(ceremony.credentials, 'include');
    assert.equal(JSON.stringify(session).includes('AAAA-BBBB'), false);
    assert.equal([...store.values()].join('').includes('AAAA'), false);
    assert.equal(session.user.id, 'ranger');
    assert.equal(loads > 0, true);
});

test('sign-up sends the username and createSession, and a failed reveal keeps the server sentence', async () => {
    await reset();
    browser(true);
    let seen = null;
    install({
        add: (opts) => { seen = opts; return { data: {}, error: null }; },
        passkey: () => ({ data: null, error: null }),
        http: (call) => {
            if (call.url.includes('/api/me')) return me('ranger');
            if (call.url.includes('/recovery/reveal')) return json(400, { code: 'recovery_shown', message: 'These recovery codes have already been shown.' });
            return json(404, {});
        },
    });
    const done = await signUp('ranger');
    assert.deepEqual(seen, { name: 'ranger', createSession: true });
    assert.deepEqual(done, { ok: false, code: 'recovery_shown', message: 'These recovery codes have already been shown.' });
});

test('sign-in replaces the previous account allowance', async () => {
    await reset();
    browser(true);
    await loadSession(async () => me('ada', { allowance: { limit: 100, used: 60, remaining: 40, resetsAt: RESET } }));
    assert.equal(session.allowance.remaining, 40);
    install({
        add: () => ({ data: null, error: null }),
        passkey: () => ({ data: { user: { username: 'bea' } }, error: null }),
        http: (call) => (call.url.includes('/api/me')
            ? me('bea', { allowance: { limit: 100, used: 91, remaining: 9, resetsAt: RESET } })
            : json(404, {})),
    });
    const done = await signInWithPasskey();
    assert.deepEqual(done, { ok: true, username: 'bea' });
    assert.equal(session.user.id, 'bea');
    assert.equal(session.allowance.remaining, 9);
    assert.equal(session.gate, 'open');
    install({
        add: () => ({ data: null, error: { code: 'ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY', message: 'Auth cancelled' } }),
        passkey: () => ({ data: null, error: { code: 'ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY', message: 'Auth cancelled' } }),
        http: () => json(500, {}),
    });
    assert.deepEqual(await signInWithPasskey(), { ok: false, code: 'ceremony_cancelled', message: 'You closed the passkey prompt.' });
    assert.deepEqual(await addPasskey('Phone'), { ok: false, code: 'ceremony_cancelled', message: 'You closed the passkey prompt.' });
    assert.equal(session.user.id, 'bea');
});

test('redeem: invalid, the limit, then a recovery gate without reading /api/me', async () => {
    await reset();
    await loadSession(async () => me('ada', { allowance: { limit: 100, used: 0, remaining: 40, resetsAt: RESET } }));
    let mode = 'bad';
    const calls = install({
        add: () => ({ data: null, error: null }),
        passkey: () => ({ data: null, error: null }),
        http: (call) => {
            if (call.url.includes('/api/me')) return json(500, { code: 'should-not', message: 'no' });
            if (mode === 'bad') return json(400, { code: 'recovery_invalid', message: 'That recovery code is not valid.' });
            if (mode === 'limit') return json(429, { code: 'recovery_limit', message: RECOVERY_LIMIT });
            return json(200, { mustAddPasskey: true });
        },
    });
    assert.deepEqual(await redeemRecovery('ranger', 'AAAA-BBBB-CCCC'), { ok: false, code: 'recovery_invalid', message: 'That recovery code is not valid.' });
    mode = 'limit';
    assert.deepEqual(await redeemRecovery('ranger', 'AAAABBBBCCCC'), { ok: false, code: 'recovery_limit', message: RECOVERY_LIMIT });
    assert.equal(session.allowance.remaining, 40);
    mode = 'ok';
    assert.deepEqual(await redeemRecovery('ranger', 'AAAA-BBBB-CCCC'), { ok: true, mustAddPasskey: true });
    assert.equal(session.gate, 'recovery');
    assert.equal(session.user, null);
    assert.equal(session.allowance, null);
    assert.equal(calls.some((call) => call.url.includes('/api/me')), false);
    assert.deepEqual(calls.at(-1).body, { username: 'ranger', code: 'AAAA-BBBB-CCCC' });
});

test('add, list, rename, and remove pass the server sentences and reveal only the first passkey', async () => {
    await reset();
    browser(true);
    await loadSession(async () => me('ada', { hasPasskey: false, unusedRecoveryCodes: 0 }));
    let reveals = 0;
    install({
        add: () => ({ data: { id: 'p2' }, error: null }),
        passkey: () => ({ data: null, error: null }),
        http: (call) => {
            if (call.url.includes('/api/me')) return me('ada', { hasPasskey: true, unusedRecoveryCodes: reveals ? 10 : 9 });
            if (call.url.includes('/recovery/reveal')) { reveals += 1; return json(200, { codes: CODES }); }
            if (call.url.includes('list-user-passkeys')) return json(200, [{ id: 'p1', name: 'Laptop', createdAt: '2026-10-12T20:00:00.000Z', publicKey: 'x' }]);
            if (call.url.includes('update-passkey')) return json(200, { passkey: { id: call.body.id, name: call.body.name } });
            if (call.url.includes('delete-passkey')) return json(400, { code: 'last_passkey', message: LAST_PASSKEY });
            return json(404, { code: 'missing', message: 'missing' });
        },
    });
    const first = await addPasskey('Phone');
    assert.equal(first.ok, true);
    assert.deepEqual(first.codes, CODES);
    assert.equal(JSON.stringify(session).includes('AAAA-BBBB'), false);
    const second = await addPasskey('Tablet');
    assert.deepEqual(second, { ok: true, codes: null });
    assert.deepEqual(await listPasskeys(), { ok: true, passkeys: [{ id: 'p1', name: 'Laptop', createdAt: '2026-10-12T20:00:00.000Z' }] });
    assert.equal(loads, 1);
    const beforeList = loads;
    await listPasskeys();
    assert.equal(loads, beforeList);
    assert.deepEqual(await renamePasskey('p1', 'Desk'), { ok: true, passkey: { id: 'p1', name: 'Desk', createdAt: null } });
    assert.deepEqual(await removePasskey('p1'), { ok: false, code: 'last_passkey', message: LAST_PASSKEY });
    await signOut(async () => json(200, {}));
    session.gate = 'recovery';
    const finished = await addPasskey('Phone');
    assert.deepEqual(finished, { ok: true, codes: null });
    assert.equal(reveals, 1);
});

test('regenerate, username, unlink, and the provider start', async () => {
    await reset();
    await loadSession(async () => me('ada'));
    const calls = install({
        add: () => ({ data: null, error: null }),
        passkey: () => ({ data: null, error: null }),
        http: (call) => {
            if (call.url.includes('/api/me')) return me('ada', { username: 'ranger', linkedProviders: ['google'], unusedRecoveryCodes: 10 });
            if (call.url.includes('/recovery/regenerate')) {
                if (call.body && call.method === 'POST') return json(200, { codes: CODES });
            }
            if (call.url.endsWith('/api/auth/username')) return json(400, { code: 'username_invalid', message: 'Use 3 to 24 letters, digits, or underscores.' });
            if (call.url.includes('list-accounts')) return json(200, [{ id: 'acc-google', providerId: 'google' }]);
            if (call.url.includes('unlink-account')) return json(400, { code: 'last_provider', message: LAST_PROVIDER });
            if (call.url.includes('sign-in/social')) return json(200, { url: 'https://accounts.example/google' });
            if (call.url.includes('passkey_required')) return json(403, { message: REQUIRED, code: 'passkey_required' });
            return json(404, { code: 'missing', message: call.url });
        },
    });
    const codes = await regenerateRecoveryCodes();
    assert.deepEqual(codes.codes, CODES);
    assert.equal(JSON.stringify(session).includes('AAAA-BBBB'), false);
    assert.deepEqual(await setUsername('no'), { ok: false, code: 'username_invalid', message: 'Use 3 to 24 letters, digits, or underscores.' });
    assert.deepEqual(await listLinkedAccounts(), { ok: true, accounts: [{ id: 'acc-google', providerId: 'google' }] });
    assert.deepEqual(await unlinkAccount('acc-google'), { ok: false, code: 'last_provider', message: LAST_PROVIDER });
    assert.deepEqual(await startSocial('google'), { ok: true, url: 'https://accounts.example/google' });
    assert.deepEqual(calls.find((call) => call.url.includes('sign-in/social')).body, { provider: 'google', disableRedirect: true });
    assert.equal(loads, 0);
});

test('linkProvider posts link-social and keeps the already-linked sentence', async () => {
    await reset();
    await loadSession(async () => me('ada'));
    const calls = install({
        add: () => ({ data: null, error: null }),
        passkey: () => ({ data: null, error: null }),
        http: (call) => {
            if (call.url.includes('/api/me')) return me('ada');
            if (call.url.includes('link-social') && call.body && call.body.provider === 'google') {
                return json(200, { url: 'https://accounts.example/link', redirect: true });
            }
            if (call.url.includes('link-social')) {
                return json(409, { code: 'SOCIAL_ACCOUNT_ALREADY_LINKED', message: 'Social account already linked' });
            }
            return json(404, { code: 'missing', message: call.url });
        },
    });
    assert.deepEqual(await linkProvider('google', '/account'), { ok: true, url: 'https://accounts.example/link' });
    assert.deepEqual(calls.find((call) => call.url.includes('link-social')).body, {
        provider: 'google', disableRedirect: true, callbackURL: '/account',
    });
    assert.deepEqual(await linkProvider('discord', '/account'), {
        ok: false, code: 'SOCIAL_ACCOUNT_ALREADY_LINKED', message: 'Social account already linked',
    });
    assert.equal(calls.some((call) => String(call.url).includes('sign-in/social')), false);
});

test('a recovery session is refused regenerate, and the gate follows', async () => {
    await reset();
    await loadSession(async () => me('ada'));
    install({
        add: () => ({ data: null, error: null }),
        passkey: () => ({ data: null, error: null }),
        http: () => json(403, { code: 'passkey_required', message: REQUIRED }),
    });
    const done = await regenerateRecoveryCodes();
    assert.deepEqual(done, { ok: false, code: 'passkey_required', message: REQUIRED });
    assert.equal(session.gate, 'recovery');
    assert.equal(session.user, null);
    assert.equal(session.allowance, null);
});
