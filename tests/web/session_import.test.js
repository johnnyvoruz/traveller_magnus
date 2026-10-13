/**
 * The session must not pull zod into the first chunk, and a recovery refusal must not sign the browser out.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { loadSession, readAllowanceFields, session, signOut } from '../../apps/web/src/account/session.ts';

const source = readFileSync(new URL('../../apps/web/src/account/session.ts', import.meta.url), 'utf8');

function valueImports(text) {
    const clean = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const found = [];
    for (const match of clean.matchAll(/import\s+([^;]*?)\s+from\s+['"]@voyage\/shared['"]/g)) {
        const clause = match[1].trim();
        if (clause.startsWith('type ')) continue;
        if (clause.startsWith('{')) {
            const inner = clause.slice(1, clause.lastIndexOf('}'));
            const values = inner.split(',').map((item) => item.trim()).filter((item) => item && !item.startsWith('type '));
            if (values.length) found.push(values.join(', '));
            continue;
        }
        found.push(clause);
    }
    return found;
}

test('session.ts imports nothing but types from @voyage/shared', () => {
    assert.deepEqual(valueImports(source), []);
});

test('the allowance hand check accepts the four fields, including an admin', () => {
    const resetsAt = '2026-10-13T00:00:00.000Z';
    assert.deepEqual(readAllowanceFields({ limit: 100, used: 60, remaining: 40, resetsAt, extra: true }), {
        limit: 100, used: 60, remaining: 40, resetsAt,
    });
    assert.deepEqual(readAllowanceFields({ limit: null, used: 0, remaining: null, resetsAt }), {
        limit: null, used: 0, remaining: null, resetsAt,
    });
    assert.equal(readAllowanceFields({ limit: 0, used: 0, remaining: 0, resetsAt }), null);
    assert.equal(readAllowanceFields({ limit: 1, used: 1.5, remaining: 0, resetsAt }), null);
    assert.equal(readAllowanceFields({ limit: 1, used: 0, remaining: 0, resetsAt: 'tomorrow' }), null);
});

function json(status, body) {
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

test('GET /api/me carries the passkey fields, and a recovery refusal sets the gate', async () => {
    await signOut(async () => json(200, {}));
    await loadSession(async () => json(200, {
        ok: true,
        data: {
            id: 'ada', email: 'ada@users.invalid', role: 'user', profile: { handle: 'ada' },
            username: 'ada', hasPasskey: true, unusedRecoveryCodes: 9, linkedProviders: ['twitter', 1],
            allowance: { limit: 100, used: 1, remaining: 99, resetsAt: '2026-10-13T00:00:00.000Z' },
        },
    }));
    assert.equal(session.gate, 'open');
    assert.equal(session.user.username, 'ada');
    assert.equal(session.user.hasPasskey, true);
    assert.equal(session.user.unusedRecoveryCodes, 9);
    assert.deepEqual(session.user.linkedProviders, ['twitter']);
    assert.equal(session.allowance.remaining, 99);
    await signOut(async () => json(200, {}));
    await loadSession(async () => json(403, {
        ok: false,
        error: { code: 'passkey_required', message: 'Add a passkey before you use the rest of this account.' },
    }));
    assert.equal(session.gate, 'recovery');
    assert.equal(session.user, null);
    assert.equal(session.allowance, null);
});

test('sign-out passes a recovery refusal through and stays signed in when the request throws', async () => {
    await signOut(async () => json(200, {}));
    await loadSession(async () => json(200, {
        ok: true,
        data: { id: 'ada', email: null, role: 'user', profile: null, allowance: { limit: 10, used: 0, remaining: 10, resetsAt: '2026-10-13T00:00:00.000Z' } },
    }));
    const sentence = 'Add a passkey before you use the rest of this account.';
    const refused = await signOut(async () => json(403, { code: 'passkey_required', message: sentence }));
    assert.deepEqual(refused, { ok: false, code: 'passkey_required', message: sentence });
    assert.equal(session.user.id, 'ada');
    assert.equal(session.allowance.remaining, 10);
    assert.equal(session.gate, 'recovery');
    const offline = await signOut(async () => { throw new Error('down'); });
    assert.deepEqual(offline, { ok: false, code: 'network', message: 'The server could not be reached. You are still signed in.' });
    assert.equal(session.user.id, 'ada');
    assert.equal(session.allowance.remaining, 10);
    assert.equal(session.gate, 'recovery');
});

test('sign-out posts a JSON body, and a 415 or a 500 leaves the session', async () => {
    await signOut(async () => json(200, {}));
    await loadSession(async () => json(200, {
        ok: true,
        data: { id: 'ada', email: null, role: 'user', profile: null, allowance: { limit: 10, used: 0, remaining: 10, resetsAt: '2026-10-13T00:00:00.000Z' } },
    }));
    const calls = [];
    const refused = await signOut(async (url, init) => {
        calls.push({
            url: String(url),
            body: init && init.body,
            type: new Headers(init && init.headers).get('content-type'),
        });
        return json(415, {});
    });
    assert.deepEqual(calls[0], { url: '/api/auth/sign-out', body: '{}', type: 'application/json' });
    assert.deepEqual(refused, { ok: false, code: 'sign_out_failed', message: 'Sign-out did not finish. You are still signed in.' });
    assert.equal(session.user.id, 'ada');
    assert.equal(session.allowance.remaining, 10);
    const failed = await signOut(async () => json(500, { code: 'internal', message: 'Sign-out failed.' }));
    assert.deepEqual(failed, { ok: false, code: 'internal', message: 'Sign-out failed.' });
    assert.equal(session.user.id, 'ada');
    assert.equal(session.gate, 'open');
    const done = await signOut(async () => json(200, { success: true }));
    assert.deepEqual(done, { ok: true });
    assert.equal(session.user, null);
    assert.equal(session.allowance, null);
});
