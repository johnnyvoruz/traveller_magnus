/**
 * BT1f: POST /api/characters/:id/ledger/mode stores meta.credits.
 * Own port 18914 when the runner has not assigned one.
 */
import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

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

if (process.env.RUN_API_TESTS !== '1') {
    test('ledger mode on the worker', { skip: 'set RUN_API_TESTS=1' }, () => {});
} else {
    test('ledger mode on the worker', { timeout: 180000 }, async () => {
        if (!process.env.VOYAGE_API_PORT) process.env.VOYAGE_API_PORT = '18914';
        if (!process.env.VOYAGE_INSPECTOR_PORT) process.env.VOYAGE_INSPECTOR_PORT = '19914';
        if (!process.env.VOYAGE_PERSIST_TO) {
            process.env.VOYAGE_PERSIST_TO = path.join(root, '.tmp', 'character-ledger-mode-18914');
        }
        const { withDevServer } = await import('./server.js');
        const { runWrangler } = await import('./session.js');

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

        async function jsonFetch(url, options = {}) {
            const response = await fetch(url, options);
            const text = await response.text();
            let body = null;
            try {
                body = JSON.parse(text);
            } catch {
                body = { text };
            }
            return { status: response.status, body, text };
        }

        runWrangler(['d1', 'migrations', 'apply', 'voyage', '--local']);
        await withDevServer(async (base) => {
            const stamp = randomBytes(4).toString('hex');
            const owner = userCookie(`lmA${stamp}`, `lma${stamp}@localhost`);
            const editor = userCookie(`lmB${stamp}`, `lmb${stamp}@localhost`);
            const stranger = userCookie(`lmC${stamp}`, `lmc${stamp}@localhost`);
            const headers = (cookie, origin = base) => ({ 'content-type': 'application/json', cookie, origin });

            const created = await jsonFetch(`${base}/api/characters`, {
                method: 'POST',
                headers: headers(owner),
                body: JSON.stringify({ name: 'Voss' }),
            });
            assert.equal(created.status, 201, created.text.slice(0, 300));
            const id = created.body.data.character.id;
            const mode = `${base}/api/characters/${encodeURIComponent(id)}/ledger/mode`;
            const ledger = `${base}/api/characters/${encodeURIComponent(id)}/ledger`;

            const invite = await jsonFetch(`${base}/api/characters/${id}/invites`, {
                method: 'POST',
                headers: { ...headers(owner), 'x-forwarded-host': new URL(base).host },
            });
            assert.equal(invite.status, 201, invite.text.slice(0, 300));
            const token = invite.body.data.url.slice(invite.body.data.url.lastIndexOf('/') + 1);
            const claimed = await jsonFetch(`${base}/api/characters/claim`, {
                method: 'POST',
                headers: headers(editor),
                body: JSON.stringify({ token }),
            });
            assert.equal(claimed.status, 200, claimed.text.slice(0, 300));

            const signedOut = await jsonFetch(mode, {
                method: 'POST',
                headers: { 'content-type': 'application/json', origin: base },
                body: JSON.stringify({ credits: 'detailed' }),
            });
            assert.equal(signedOut.status, 401);

            const evil = await jsonFetch(mode, {
                method: 'POST',
                headers: headers(owner, 'https://evil.example'),
                body: JSON.stringify({ credits: 'detailed' }),
            });
            assert.equal(evil.status, 403, evil.text.slice(0, 300));

            const other = await jsonFetch(mode, {
                method: 'POST',
                headers: headers(stranger),
                body: JSON.stringify({ credits: 'detailed' }),
            });
            assert.equal(other.status, 404, other.text.slice(0, 300));
            assert.equal(other.body.error.message, 'No such character.');

            const posted = await jsonFetch(ledger, {
                method: 'POST',
                headers: headers(owner),
                body: JSON.stringify({ kind: 'pay', amount: 80, memo: 'berth' }),
            });
            assert.equal(posted.status, 201, posted.text.slice(0, 300));
            const lineId = posted.body.data.id;

            const opened = await jsonFetch(mode, {
                method: 'POST',
                headers: headers(owner),
                body: JSON.stringify({ credits: 'detailed' }),
            });
            assert.equal(opened.status, 200, opened.text.slice(0, 300));
            assert.deepEqual(opened.body.data, { credits: 'detailed' });

            const bad = await jsonFetch(mode, {
                method: 'POST',
                headers: headers(editor),
                body: JSON.stringify({ credits: 'both' }),
            });
            assert.equal(bad.status, 400, bad.text.slice(0, 300));
            assert.equal(bad.body.error.message, 'Invalid request.');

            const closed = await jsonFetch(mode, {
                method: 'POST',
                headers: headers(editor),
                body: JSON.stringify({ credits: 'simple' }),
            });
            assert.equal(closed.status, 200, closed.text.slice(0, 300));
            assert.deepEqual(closed.body.data, { credits: 'simple' });

            const page = await jsonFetch(ledger, { headers: { cookie: owner } });
            assert.equal(page.status, 200, page.text.slice(0, 300));
            assert.equal(page.body.data.credits, 'simple');
            assert.equal(page.body.data.balance, 80);
            assert.equal(page.body.data.lines.length, 1);
            assert.equal(page.body.data.lines[0].id, lineId);
            assert.equal(page.body.data.lines[0].memo, 'berth');
        });
    });
}
