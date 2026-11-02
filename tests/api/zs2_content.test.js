/**
 * ZS2 rounds 2 to 5 on the worker (findings/zs2_content.md): the paste route, uploads, previews
 * and links, and response headers. A test marked `todo` proves an open finding: it fails today,
 * and the fix drops `todo`. Own port 18922 (inspector 19922) and a temp D1.
 */
import assert from 'node:assert/strict';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { applyTags } from '../../apps/api/src/preview_tags.ts';
import { removeTree, runWrangler } from './session.js';
import { startDev, stopDev, wranglerBin } from './server.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = 18922;
const STAMP = '2026-10-31T00:00:00.000Z';
const HTML = { accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8' };
const SHELL = '<!doctype html><html><head><title>Traveller.voyage</title>'
    + '<meta name="description" content="d" /><meta property="og:title" content="t" /><meta property="og:description" content="d" />'
    + '<script type="module" src="/a.js"></script></head><body></body></html>';
const BREAKOUT = '0;url=https://evil.example/$2 http-equiv=refresh x=$2';

function metaTags(html) {
    return [...html.matchAll(/<meta\b[^>]*>/gi)].map((match) => match[0]);
}

/** The attribute names of a tag as a browser reads them, quoted values skipped. */
function attributes(tag) {
    return [...tag.replace(/^<meta/i, '').replace(/"[^"]*"/g, '""').matchAll(/([^\s=>/"]+)\s*=/g)].map((match) => match[1].toLowerCase());
}

function holdsShape(html) {
    assert.equal((html.match(/<script/gi) ?? []).length, 1);
    assert.equal((html.match(/<\/title>/gi) ?? []).length, 1);
    for (const tag of metaTags(html)) {
        for (const name of attributes(tag)) assert.equal(['name', 'property', 'content', 'charset'].includes(name), true, tag);
    }
}

test('ZS2: markup and quotes in a name stay inside the tag', () => {
    for (const name of ['</title><script>alert(1)</script>', '"><meta http-equiv=refresh content=0>', 'a\r\nb', '<meta>', '&quot;']) {
        holdsShape(applyTags(SHELL, { title: name, description: name }));
    }
});

test('ZS2 SECURITY: a dollar pattern in a name stays text', () => {
    for (const name of [BREAKOUT, '$1', '$2', '$&', '$`', "$'"]) {
        const html = applyTags(SHELL, { title: name, description: name });
        const text = name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const attr = text.replace(/"/g, '&quot;');
        holdsShape(html);
        assert.equal(html.includes(`content="${attr}"`), true, name);
        assert.equal(html.includes(`<title>${text}</title>`), true, name);
    }
});

function authSecret() {
    const text = readFileSync(path.join(root, 'apps', 'api', '.dev.vars'), 'utf8');
    const line = text.split(/\r?\n/).find((item) => item.startsWith('BETTER_AUTH_SECRET='));
    if (!line) throw new Error('BETTER_AUTH_SECRET is unset');
    const value = line.slice('BETTER_AUTH_SECRET='.length).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) return value.slice(1, -1);
    return value;
}

function sqlFile(persistTo, sql) {
    const dir = mkdtempSync(path.join(tmpdir(), 'voyage-zs2-sql-'));
    const file = path.join(dir, 'rows.sql');
    writeFileSync(file, sql);
    try {
        runWrangler(['d1', 'execute', 'voyage', '--local', '--persist-to', persistTo, '--file', file]);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

function r2Put(persistTo, key, text) {
    const dir = mkdtempSync(path.join(tmpdir(), 'voyage-zs2-r2-'));
    const file = path.join(dir, 'body');
    writeFileSync(file, text);
    try {
        runWrangler(['r2', 'object', 'put', `voyage-public/${key}`, '--file', file, '--local', '--persist-to', persistTo]);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

function accountSql(people) {
    const now = Date.now();
    const expires = now + 30 * 24 * 60 * 60 * 1000;
    const secret = authSecret();
    const lines = [];
    const cookies = {};
    for (const person of people) {
        const token = randomBytes(32).toString('hex');
        const sessionId = `${person.id}-${randomBytes(4).toString('hex')}`;
        lines.push(`INSERT INTO user (id, name, email, email_verified, created_at, updated_at, role, banned)
VALUES ('${person.id}', '${person.id}', '${person.id}@localhost', 1, ${now}, ${now}, 'user', 0);`);
        lines.push(`INSERT INTO profile (user_id, handle, display_name, created_at)
VALUES ('${person.id}', '${person.handle}', '${person.handle}', '${STAMP}');`);
        lines.push(`INSERT INTO session (id, expires_at, token, created_at, updated_at, user_id)
VALUES ('${sessionId}', ${expires}, '${token}', ${now}, ${now}, '${person.id}');`);
        const signature = createHmac('sha256', secret).update(token).digest('base64');
        cookies[person.id] = `__Secure-better-auth.session_token=${encodeURIComponent(`${token}.${signature}`)}`;
    }
    return { sql: lines.join('\n'), cookies };
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
    throw new Error(last || 'wrangler dev did not answer /api/health');
}

async function jsonFetch(url, options = {}) {
    const response = await fetch(url, { redirect: 'manual', ...options });
    const text = await response.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text }; }
    return { status: response.status, body, headers: response.headers, text };
}

function sha(bytes) {
    return createHash('sha256').update(bytes).digest('hex');
}

function webpHeader(rest) {
    const tail = Buffer.from(rest, 'utf8');
    const head = Buffer.alloc(12);
    head.write('RIFF', 0, 'latin1');
    head.writeUInt32LE(tail.length + 4, 4);
    head.write('WEBP', 8, 'latin1');
    return Buffer.concat([head, tail]);
}

function batch(key, proposals) {
    return { format: 'voyage-proposals', schemaVersion: 1, idempotencyKey: key, source: { kind: 'notes', label: 'ZS2', realDate: null }, proposals };
}

const evidence = [{ at: '00:01', quote: 'Heard at the table.' }];
const person = { type: 'person', kind: '', name: 'Ada', summary: '', details: '', tags: [] };

if (process.env.RUN_API_TESTS !== '1') {
    test('zs2 on the worker', { skip: 'set RUN_API_TESTS=1' }, () => {});
} else if (!existsSync(wranglerBin)) {
    test('zs2 on the worker', { skip: 'wrangler is absent' }, () => {});
} else {
    test('zs2 on the worker', { timeout: 300000 }, async (t) => {
        const persistTo = mkdtempSync(path.join(tmpdir(), 'voyage-zs2-'));
        const base = `http://127.0.0.1:${PORT}`;
        const { sql, cookies: c } = accountSql([
            { id: 'z2-o', handle: 'ztwoowner' },
            { id: 'z2-p', handle: 'ztwoplayer' },
        ]);
        const version = `z2${randomBytes(3).toString('hex')}`;
        const marks = {
            markup: 'pm_0123456789ABCDEFGHJKMNPQR0',
            dollar: 'pm_0123456789ABCDEFGHJKMNPQR1',
        };
        const live = 'zs2-live-token';
        const hostile = '</title><script>alert(1)</script><meta http-equiv=refresh content=0>" onload="alert(1)';
        let child = null;
        try {
            runWrangler(['d1', 'migrations', 'apply', 'voyage', '--local', '--persist-to', persistTo]);
            sqlFile(persistTo, `${sql}
INSERT INTO truth_versions (version, engine_version, milieu, seed, settings, sectors, state, started_at, released_at, sectors_total, sectors_done, sectors_failed)
VALUES ('${version}', '1.2.0', 'M1105', 'TravellerMagnus', '{}', '[]', 'released', '${STAMP}', '${STAMP}', 0, 0, '[]');
`);
            r2Put(persistTo, `truth/${version}/manifest.json`, JSON.stringify({ sectors: [{ slug: 'Chart', x: 0, y: 0 }] }));
            r2Put(persistTo, `truth/${version}/sectors/Chart/index.json`, JSON.stringify({ name: 'Chart', hexes: { '1910': { name: 'Regina', uwp: 'A788899-C' } } }));
            child = startDev({ port: PORT, persistTo, inspectorPort: 19922 });
            await up(base);
            const json = (cookie) => ({ 'content-type': 'application/json', cookie, origin: base });
            const at = (id) => `${base}/api/universes/${id}`;
            const made = await jsonFetch(`${base}/api/universes`, { method: 'POST', headers: json(c['z2-o']), body: JSON.stringify({ name: 'ZS2 A', truthVersion: version, editionDefault: 'MgT2E' }) });
            assert.equal(made.status, 201, made.text.slice(0, 300));
            const A = made.body.data.id;
            sqlFile(persistTo, `
UPDATE universes SET public_games = 1 WHERE id = '${A}';
INSERT INTO public_ships (mark_id, universe_id, truth_version, sector_slug, local_hex, ship_name, aboard_names, updated_at)
VALUES ('${marks.markup}', '${A}', '${version}', 'Chart', '1910', '${hostile.replaceAll("'", "''")}', '[]', '${STAMP}');
INSERT INTO public_ships (mark_id, universe_id, truth_version, sector_slug, local_hex, ship_name, aboard_names, updated_at)
VALUES ('${marks.dollar}', '${A}', '${version}', 'Chart', '1910', '${BREAKOUT}', '[]', '${STAMP}');
INSERT INTO universe_invites (id, universe_id, token, token_hash, role, expires_at, revoked_at, uses, created_at)
VALUES ('z2-invite', '${A}', NULL, '${sha(live)}', 'player', '2036-01-01T00:00:00.000Z', NULL, 0, '${STAMP}');
`);

            await t.test('round 4: a ship name with markup stays inside the card', async () => {
                const page = await jsonFetch(`${base}/ship/${marks.markup}`, { headers: HTML });
                assert.equal(page.status, 200);
                assert.equal(page.text.includes('<script>alert(1)'), false);
                assert.equal(page.text.includes('<meta http-equiv'), false);
                for (const tag of metaTags(page.text)) assert.equal(attributes(tag).includes('onload'), false, tag);
            });

            await t.test('round 4 SECURITY: a ship name cannot add an attribute to the page', async () => {
                const page = await jsonFetch(`${base}/ship/${marks.dollar}`, { headers: HTML });
                assert.equal(page.status, 200);
                assert.equal(page.text.includes(BREAKOUT), true);
                for (const tag of metaTags(page.text)) assert.equal(attributes(tag).includes('http-equiv'), false, tag);
            });

            await t.test('round 4 SECURITY: a campaign name cannot add an attribute to an invite page', async () => {
                sqlFile(persistTo, `UPDATE universes SET name = '${BREAKOUT}' WHERE id = '${A}';`);
                const page = await jsonFetch(`${base}/join/${live}`, { headers: HTML });
                sqlFile(persistTo, `UPDATE universes SET name = 'ZS2 A' WHERE id = '${A}';`);
                assert.equal(page.status, 200);
                assert.equal(page.text.includes(BREAKOUT), true);
                for (const tag of metaTags(page.text)) assert.equal(attributes(tag).includes('http-equiv'), false, tag);
            });

            await t.test('round 4: sign-in does not return to another site', async () => {
                for (const callbackURL of ['/', 'https://evil.example/', '//evil.example/', '/\\evil.example/', 'javascript:alert(1)']) {
                    const res = await jsonFetch(`${base}/api/auth/sign-in/social`, { method: 'POST', headers: json(''), body: JSON.stringify({ provider: 'google', callbackURL }) });
                    assert.equal(res.text.includes('evil.example'), false, callbackURL);
                    if (callbackURL === '/') assert.equal(res.body?.code, 'PROVIDER_NOT_FOUND', res.text.slice(0, 200));
                    else assert.equal(res.body?.code, 'INVALID_CALLBACK_URL', `${callbackURL}: ${res.text.slice(0, 200)}`);
                }
            });

            await t.test('round 3: only WebP gets in', async () => {
                const put = (bytes, hash = sha(bytes), type = 'image/webp') => jsonFetch(`${at(A)}/objects/${hash}`, { method: 'PUT', headers: { cookie: c['z2-o'], origin: base, 'content-type': type }, body: bytes });
                const refused = [
                    Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(1)</script></svg>'),
                    Buffer.from('\x89PNG\r\n\x1a\n<script>alert(1)</script>', 'latin1'),
                    Buffer.from('<!doctype html><script>alert(1)</script>'),
                    Buffer.from('GIF89a/*<script>alert(1)</script>'),
                ];
                for (const bytes of refused) {
                    assert.equal((await put(bytes)).status, 400);
                    assert.equal((await put(bytes, sha(bytes), 'text/html')).status, 400);
                }
                const named = await jsonFetch(`${at(A)}/objects/page.html`, { method: 'PUT', headers: { cookie: c['z2-o'], origin: base }, body: webpHeader('x') });
                assert.equal(named.status, 400);
                const wrongHash = await put(webpHeader('x'), 'a'.repeat(64));
                assert.equal(wrongHash.status, 400);
                const big = Buffer.alloc(8 * 1024 * 1024 + 1);
                big.write('RIFF', 0, 'latin1');
                big.write('WEBP', 8, 'latin1');
                assert.equal((await put(big)).status, 400);
            });

            await t.test('round 3: a polyglot is served as an image, never as a page', async () => {
                const bytes = webpHeader('<!doctype html><script>alert(document.domain)</script>');
                const hash = sha(bytes);
                const stored = await jsonFetch(`${at(A)}/objects/${hash}`, { method: 'PUT', headers: { cookie: c['z2-o'], origin: base, 'content-type': 'text/html' }, body: bytes });
                assert.equal(stored.status, 201, stored.text.slice(0, 200));
                const read = await jsonFetch(`${at(A)}/objects/${hash}`, { headers: { cookie: c['z2-o'] } });
                assert.equal(read.status, 200);
                assert.equal(read.headers.get('content-type'), 'image/webp');
                assert.equal((await jsonFetch(`${at(A)}/objects/${hash}`)).status, 401);
            });

            await t.test('round 3 FINDING: an object carries nosniff', async () => {
                const bytes = webpHeader('plain');
                const hash = sha(bytes);
                await jsonFetch(`${at(A)}/objects/${hash}`, { method: 'PUT', headers: { cookie: c['z2-o'], origin: base }, body: bytes });
                const read = await jsonFetch(`${at(A)}/objects/${hash}`, { headers: { cookie: c['z2-o'] } });
                assert.equal(read.headers.get('x-content-type-options'), 'nosniff');
                assert.equal(read.headers.get('content-disposition'), `inline; filename="${hash}.webp"`);
            });

            await t.test('round 2: the paste route refuses hostile JSON in a sentence', async () => {
                const paste = (body) => jsonFetch(`${at(A)}/campaign/proposals`, { method: 'POST', headers: json(c['z2-o']), body });
                const hostileBodies = [
                    '',
                    'not json',
                    '['.repeat(100000) + ']'.repeat(100000),
                    '{"a":'.repeat(100000) + '1' + '}'.repeat(100000),
                    JSON.stringify({ a: 'x'.repeat(10_000_000) }),
                    '{"__proto__":{"admin":true}}',
                    JSON.stringify(batch('zs2-num-0001', [{ op: 'record.create', ref: 'a', record: { ...person, name: 7 }, evidence }])),
                    JSON.stringify(batch('zs2-vis-0001', [{ op: 'record.create', ref: 'a', record: { ...person, visibility: 'players' }, evidence }])),
                    JSON.stringify(batch('zs2-pro-0001', [{ op: 'record.create', ref: 'a', record: person, evidence }])).replace('"name":"Ada"', '"name":"Ada","__proto__":{"admin":true}'),
                ];
                for (const body of hostileBodies) {
                    const res = await paste(body);
                    assert.equal(res.status >= 400 && res.status < 500, true, `${body.slice(0, 60)} -> ${res.status} ${res.text.slice(0, 200)}`);
                    assert.equal(typeof res.body?.error?.message ?? res.body?.message, 'string', body.slice(0, 60));
                }
            });

            await t.test('round 2: duplicate refs and spoofed ids write nothing until the referee accepts, and reach no other row', async () => {
                const paste = (body) => jsonFetch(`${at(A)}/campaign/proposals`, { method: 'POST', headers: json(c['z2-o']), body: JSON.stringify(body) });
                const twin = await paste(batch('zs2-dup-0001', [
                    { op: 'record.create', ref: 'ada', record: person, evidence },
                    { op: 'record.create', ref: 'ada', record: { ...person, name: 'Adä' }, evidence },
                ]));
                assert.equal(twin.status >= 200 && twin.status < 500, true, twin.text.slice(0, 200));
                assert.notEqual(twin.status, 500);
                const read = await jsonFetch(`${at(A)}/campaign?after=0&limit=1000`, { headers: { cookie: c['z2-o'] } });
                assert.equal(read.status, 200);
                assert.equal(read.text.includes('Ada'), false);
            });

            await t.test('round 4: the export keeps its file name to one header line', async () => {
                sqlFile(persistTo, `UPDATE universes SET name = 'a' || char(13) || char(10) || 'x-evil: 1' WHERE id = '${A}';`);
                const res = await jsonFetch(`${at(A)}/campaign/export`, { headers: { cookie: c['z2-o'] } });
                sqlFile(persistTo, `UPDATE universes SET name = 'ZS2 A' WHERE id = '${A}';`);
                assert.equal(res.status, 200, res.text.slice(0, 200));
                assert.equal(res.headers.get('x-evil'), null);
                assert.equal(/[\r\n]/.test(res.headers.get('content-disposition') ?? ''), false);
            });

            await t.test('round 4: a campaign name outside Latin-1 still exports', async () => {
                const name = 'Marches — トラベラー 🚀';
                sqlFile(persistTo, `UPDATE universes SET name = '${name}' WHERE id = '${A}';`);
                const res = await jsonFetch(`${at(A)}/campaign/export`, { headers: { cookie: c['z2-o'] } });
                sqlFile(persistTo, `UPDATE universes SET name = 'ZS2 A' WHERE id = '${A}';`);
                assert.equal(res.status, 200, res.text.slice(0, 200));
            });

            await t.test('round 5: every API answer is JSON or an image, never HTML with a person\'s text', async () => {
                const res = await jsonFetch(`${base}/api/public-ships/${marks.markup}`);
                assert.match(res.headers.get('content-type') ?? '', /application\/json/);
                const missing = await jsonFetch(`${base}/api/%3Cscript%3Ealert(1)%3C%2Fscript%3E`);
                assert.equal(missing.status, 404);
                assert.match(missing.headers.get('content-type') ?? '', /application\/json/);
                assert.equal(missing.text.includes('<script'), false);
            });

            await t.test('round 5 FINDING: the app page and the API send the security headers', async () => {
                for (const url of [`${base}/`, `${base}/api/health`, `${base}/ship/${marks.markup}`]) {
                    const res = await jsonFetch(url, { headers: HTML });
                    assert.equal(res.headers.get('x-content-type-options'), 'nosniff', url);
                    assert.equal(res.headers.get('referrer-policy'), 'strict-origin-when-cross-origin', url);
                    assert.equal(res.headers.get('x-frame-options'), 'DENY', url);
                }
                const page = await jsonFetch(`${base}/`, { headers: HTML });
                const policy = page.headers.get('content-security-policy-report-only') ?? '';
                assert.match(policy, /script-src/);
                assert.match(policy, /frame-ancestors 'none'/);
                assert.equal(page.headers.get('content-security-policy'), null);
            });

            await t.test('round 5: the character room socket still opens', async () => {
                const { WebSocket } = await import('undici');
                const made = await jsonFetch(`${base}/api/characters`, {
                    method: 'POST',
                    headers: json(c['z2-o']),
                    body: JSON.stringify({ name: 'Voss' }),
                });
                assert.equal(made.status, 201, made.text.slice(0, 300));
                const id = made.body.data.character.id;
                const ws = new WebSocket(`${base.replace('http', 'ws')}/api/characters/${id}/live`, { headers: { cookie: c['z2-o'] } });
                try {
                    await new Promise((resolve, reject) => {
                        const timer = setTimeout(() => reject(new Error('socket failed')), 5000);
                        ws.addEventListener('open', () => {
                            clearTimeout(timer);
                            resolve(undefined);
                        });
                        ws.addEventListener('error', () => {
                            clearTimeout(timer);
                            reject(new Error('socket failed'));
                        });
                    });
                } finally {
                    ws.close();
                }
            });

            await t.test('round 1: a member can store a body of brackets, so the parser finding is reachable by a player', async () => {
                const invite = await jsonFetch(`${at(A)}/players/invite`, { method: 'POST', headers: json(c['z2-o']) });
                assert.equal(invite.status, 200, invite.text.slice(0, 200));
                const token = invite.body.data.url.split('/join/')[1];
                const joined = await jsonFetch(`${base}/api/join`, { method: 'POST', headers: json(c['z2-p']), body: JSON.stringify({ token }) });
                assert.equal(joined.status, 200, joined.text.slice(0, 200));
                const note = {
                    id: 'cj_00000001-0000-4000-8000-0000000005b2', kind: 'note', title: '', body: '['.repeat(100000), when: null, realDate: null, sequence: null,
                    author: 'players', visibility: 'players', anchor: null, mentions: [], rev: 0, createdAt: STAMP, updatedAt: STAMP, deleted: false, baseRev: 0,
                };
                const wrote = await jsonFetch(`${at(A)}/campaign/changes`, { method: 'PATCH', headers: json(c['z2-p']), body: JSON.stringify({ journal: [note] }) });
                assert.equal(wrote.status, 200, wrote.text.slice(0, 300));
                const read = await jsonFetch(`${at(A)}/campaign?after=0&limit=1000`, { headers: { cookie: c['z2-o'] } });
                assert.equal(read.text.includes('['.repeat(100000)), true);
            });
        } finally {
            stopDev(child?.pid);
            removeTree(persistTo);
        }
    });
}
