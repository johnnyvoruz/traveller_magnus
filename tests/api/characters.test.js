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
    test('characters live', { skip: 'set RUN_API_TESTS=1' }, () => {});
} else {
    test('characters live', { timeout: 180000 }, async () => {
        if (!process.env.VOYAGE_API_PORT) process.env.VOYAGE_API_PORT = '8807';
        if (!process.env.VOYAGE_INSPECTOR_PORT) process.env.VOYAGE_INSPECTOR_PORT = '9337';
        if (!process.env.VOYAGE_PERSIST_TO) process.env.VOYAGE_PERSIST_TO = path.join(root, '.tmp', 'character-api-8807');
        const { withDevServer } = await import('./server.js');
        const { runWrangler } = await import('./session.js');
        const { WebSocket } = await import('undici');

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
            const body = await response.json();
            return { status: response.status, body };
        }

        function listen(url, cookie) {
            const messages = [];
            const ws = new WebSocket(url, { headers: { cookie } });
            let settled = false;
            const opened = new Promise((resolve, reject) => {
                ws.addEventListener('open', () => {
                    settled = true;
                    resolve();
                });
                ws.addEventListener('error', () => {
                    if (!settled) {
                        settled = true;
                        reject(new Error('socket failed'));
                    }
                });
            });
            ws.addEventListener('message', (event) => {
                messages.push(JSON.parse(String(event.data)));
            });
            return { ws, messages, opened, send(value) { ws.send(JSON.stringify(value)); } };
        }

        runWrangler(['d1', 'migrations', 'apply', 'voyage', '--local']);
        await withDevServer(async (base) => {
            const stamp = randomBytes(4).toString('hex');
            const owner = userCookie(`chA${stamp}`, `cha${stamp}@localhost`);
            const editor = userCookie(`chB${stamp}`, `chb${stamp}@localhost`);
            const ownerHeaders = { 'content-type': 'application/json', cookie: owner };
            const editorHeaders = { 'content-type': 'application/json', cookie: editor };

            const created = await jsonFetch(`${base}/api/characters`, {
                method: 'POST',
                headers: ownerHeaders,
                body: JSON.stringify({ name: 'Voss' }),
            });
            assert.equal(created.status, 201, JSON.stringify(created.body));
            const id = created.body.data.character.id;

            const hidden = await jsonFetch(`${base}/api/characters/${id}`, { headers: { cookie: editor } });
            assert.equal(hidden.status, 404);
            const hiddenLive = await jsonFetch(`${base}/api/characters/${id}/live`, { headers: { cookie: editor } });
            assert.equal(hiddenLive.status, 404);

            const invite = await jsonFetch(`${base}/api/characters/${id}/invites`, {
                method: 'POST',
                headers: { ...ownerHeaders, 'x-forwarded-host': new URL(base).host },
            });
            assert.equal(invite.status, 201, JSON.stringify(invite.body));
            assert.equal(invite.body.data.url.startsWith(`${base}/claim/`), true, invite.body.data.url);
            const token = invite.body.data.url.slice(invite.body.data.url.lastIndexOf('/') + 1);
            const claimed = await jsonFetch(`${base}/api/characters/claim`, {
                method: 'POST',
                headers: editorHeaders,
                body: JSON.stringify({ token }),
            });
            assert.equal(claimed.status, 200, JSON.stringify(claimed.body));
            assert.equal(claimed.body.data.characterId, id);

            const ownerSocket = listen(`${base.replace('http', 'ws')}/api/characters/${id}/live`, owner);
            const editorSocket = listen(`${base.replace('http', 'ws')}/api/characters/${id}/live`, editor);
            try {
                await ownerSocket.opened;
                await editorSocket.opened;
                const helloBy = Date.now() + 5000;
                let hello;
                while (Date.now() < helloBy) {
                    hello = ownerSocket.messages.find((message) => message.t === 'hello');
                    if (hello) break;
                    await new Promise((resolve) => setTimeout(resolve, 50));
                }
                assert.ok(hello, JSON.stringify(ownerSocket.messages));
                assert.equal(hello.you.role, 'owner');
                ownerSocket.send({ t: 'set', id: 'live-1', field: 'Title', value: 'Scout' });
                const seen = Date.now() + 5000;
                while (Date.now() < seen && !editorSocket.messages.some((message) => message.t === 'set' && message.value === 'Scout')) {
                    await new Promise((resolve) => setTimeout(resolve, 50));
                }
                assert.equal(editorSocket.messages.some((message) => message.t === 'set' && message.field === 'Title' && message.value === 'Scout'), true);
                assert.equal(ownerSocket.messages.some((message) => message.t === 'ack' && message.id === 'live-1'), true);
            } finally {
                ownerSocket.ws.close();
                editorSocket.ws.close();
            }
        });
    });
}
