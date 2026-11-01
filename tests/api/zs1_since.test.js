/**
 * ZS1b: everything shipped after the ZS1 map of 2026-10-19 (findings/zs1_access.md, "Since").
 * The invite read, replies, "Written by", the paste door with agent access off, table sets, the
 * demo, public cards, the credit register's other routes, and what a package publishes.
 * A test marked `todo` proves an open finding: it fails today, and the fix drops `todo`.
 * A referee-only string starts with ZREF_. Own port 18921 (inspector 19921) and a temp D1.
 */
import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { recordForPublish } from '../../apps/api/src/universe/publish_read.ts';
import { publicCardJournal, publicFinishedLegs, redactPublicCardText } from '../../packages/shared/src/public_hex.ts';
import { removeTree, runWrangler } from './session.js';
import { startDev, stopDev, wranglerBin } from './server.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = 18921;
const STAMP = '2026-10-31T00:00:00.000Z';
const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const HIDDEN_ID = 'cr_22222222-2222-4222-8222-222222222222';

function rid(n) {
    return `cr_${n.toString(16).padStart(8, '0')}-0000-4000-8000-0000000005b1`;
}

function jid(n) {
    return `cj_${n.toString(16).padStart(8, '0')}-0000-4000-8000-0000000005b1`;
}

function lid(n) {
    return `cl_${n.toString(16).padStart(8, '0')}-0000-4000-8000-0000000005b1`;
}

function authSecret() {
    const text = readFileSync(path.join(root, 'apps', 'api', '.dev.vars'), 'utf8');
    const line = text.split(/\r?\n/).find((item) => item.startsWith('BETTER_AUTH_SECRET='));
    if (!line) throw new Error('BETTER_AUTH_SECRET is unset');
    const value = line.slice('BETTER_AUTH_SECRET='.length).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) return value.slice(1, -1);
    return value;
}

function sqlFile(persistTo, sql) {
    const dir = mkdtempSync(path.join(tmpdir(), 'voyage-zs1b-sql-'));
    const file = path.join(dir, 'rows.sql');
    writeFileSync(file, sql);
    try {
        runWrangler(['d1', 'execute', 'voyage', '--local', '--persist-to', persistTo, '--file', file]);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

function r2Put(persistTo, key, text) {
    const dir = mkdtempSync(path.join(tmpdir(), 'voyage-zs1b-r2-'));
    const file = path.join(dir, 'body');
    writeFileSync(file, text);
    try {
        runWrangler(['r2', 'object', 'put', `voyage-public/${key}`, '--file', file, '--local', '--persist-to', persistTo]);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

function r2Get(persistTo, key) {
    const dir = mkdtempSync(path.join(tmpdir(), 'voyage-zs1b-r2-'));
    const file = path.join(dir, 'out');
    try {
        runWrangler(['r2', 'object', 'get', `voyage-public/${key}`, '--file', file, '--local', '--persist-to', persistTo]);
        return readFileSync(file, 'utf8');
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

function record(id, over = {}) {
    return {
        id, type: 'place', kind: '', name: 'Place', summary: '', details: '', tags: [], anchor: null, when: null,
        visibility: 'referee', playerNotes: null, sheet: null, status: null, images: null, provenance: null,
        rev: 0, createdAt: STAMP, updatedAt: STAMP, deleted: false, baseRev: 0, ...over,
    };
}

function link(id, from, to, over = {}) {
    return {
        id, from, to, kind: 'contact', role: '', order: 0, since: null, until: null, notes: '', visibility: 'referee',
        provenance: null, rev: 0, createdAt: STAMP, updatedAt: STAMP, deleted: false, baseRev: 0, ...over,
    };
}

function entry(id, over = {}) {
    return {
        id, kind: 'note', title: '', body: '', when: null, realDate: null, sequence: null, author: 'referee',
        visibility: 'players', anchor: null, mentions: [], rev: 0, createdAt: STAMP, updatedAt: STAMP,
        deleted: false, baseRev: 0, ...over,
    };
}

function playerNote(id, over = {}) {
    return entry(id, { author: 'players', visibility: 'players', ...over });
}

function batch(key, proposals) {
    return { format: 'voyage-proposals', schemaVersion: 1, idempotencyKey: key, source: { kind: 'notes', label: 'ZS1b', realDate: null }, proposals };
}

function question() {
    return { op: 'question', text: 'Who?', evidence: [{ at: '00:01', quote: 'Heard at the table.' }] };
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
    const response = await fetch(url, options);
    const text = await response.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text }; }
    return { status: response.status, body, headers: response.headers, text };
}

test('ZS1b: a :::referee block with lone CR breaks is stripped from a published copy', () => {
    const out = recordForPublish({ id: 'x', visibility: 'players', details: 'Open.\r:::referee\rZREF_lonecr\r:::\rStill.' });
    assert.equal(JSON.stringify(out).includes('ZREF_lonecr'), false);
});

test('ZS1b SECURITY: a referee-only record publishes its name, kind and tags, as the form says, and nothing else of its own', () => {
    const out = recordForPublish({
        id: HIDDEN_ID,
        type: 'vessel',
        kind: 'Far Trader',
        name: 'Beowulf',
        tags: ['ship'],
        visibility: 'referee',
        summary: 'ZREF_summary',
        details: 'ZREF_details',
        playerNotes: 'ZREF_notes',
        sheet: { line: 'ZREF_sheet' },
        status: { cargo: [{ name: 'ZREF_cargo' }], ledger: [{ memo: 'ZREF_ledger' }], track: [{ note: 'ZREF_track' }] },
        images: [{ hash: HASH_A, thumbHash: HASH_B, caption: 'ZREF_caption' }],
        anchor: { kind: 'system', hexKey: 'Core/2118', locationLabel: 'ZREF_label' },
    });
    const text = JSON.stringify(out);
    assert.equal(text.includes('ZREF_'), false, text);
    assert.equal(text.includes(HASH_A), false, 'a hidden picture is copied to the public bucket');
    assert.equal(out.name, 'Beowulf');
});

test('ZS1b SECURITY: a players record keeps no label of a record players cannot see once published', () => {
    const out = recordForPublish({ id: 'x', visibility: 'players', details: `Meets [[${HIDDEN_ID}|ZREF_label]].` });
    assert.equal(JSON.stringify(out).includes('ZREF_label'), false);
});

test('ZS1b SECURITY: a public card holds no :::referee passage', () => {
    const notes = publicCardJournal([{
        id: 'a', deleted: false, visibility: 'public', title: 'Regina', when: null, realDate: null, updatedAt: STAMP,
        body: 'We docked.\n:::referee\nZREF_block\n:::\nAll well.',
    }]);
    assert.equal(notes[0].body.includes('ZREF_block'), false);
    assert.equal(notes[0].body.includes(':::'), false);
});

test('ZS1b SECURITY: a public card holds no mention label of a record', () => {
    const notes = publicCardJournal([{
        id: 'a', deleted: false, visibility: 'public', title: `See [[${HIDDEN_ID}|ZREF_title]]`, when: null, realDate: null, updatedAt: STAMP,
        body: `Met [[${HIDDEN_ID}|ZREF_body]].`,
    }]);
    assert.equal(JSON.stringify(notes).includes('ZREF_'), false);
});

test('ZS1b SECURITY: a stored card keeps no image caption, track note, or place label, and a hex mention keeps its label', () => {
    const notes = publicCardJournal([{
        id: 'a', deleted: false, visibility: 'public', title: 'Regina', body: 'All well.',
        when: null, realDate: null, updatedAt: STAMP,
        images: [{ caption: 'ZREF_caption' }],
    }]);
    assert.equal(JSON.stringify(notes).includes('ZREF_caption'), false);
    assert.equal(Object.hasOwn(notes[0], 'images'), false);
    const stored = redactPublicCardText('Docked.\n:::referee\nZREF_stored\n:::\nStill [[cr_22222222-2222-4222-8222-222222222222|ZREF_storedlabel]].');
    assert.equal(stored.includes('ZREF_'), false);
    assert.equal(stored.includes('Docked.'), true);
    assert.equal(stored.includes('Still'), true);
    const hexLabel = redactPublicCardText('At [[hex:Spinward_Marches/1910|Regina]].');
    assert.equal(hexLabel, 'At Regina.');
    const ship = 'cr_11111111-1111-4111-8111-111111111111';
    const vessel = {
        id: ship,
        type: 'vessel',
        visibility: 'players',
        deleted: false,
        name: 'Far',
        status: {
            track: [{
                from: { kind: 'system', hexKey: 'Spinward_Marches/1910', locationLabel: 'ZREF_from' },
                to: { kind: 'system', hexKey: 'Spinward_Marches/1911', locationLabel: 'ZREF_to' },
                departs: 1,
                arrives: 2,
                mode: 'jump',
                note: 'ZREF_tracknote',
            }],
        },
    };
    const legs = publicFinishedLegs(vessel, { [ship]: vessel }, 10);
    assert.equal(JSON.stringify(legs).includes('ZREF_'), false);
    assert.deepEqual(legs, [{ from: 'Spinward_Marches/1910', to: 'Spinward_Marches/1911', departs: 1, arrives: 2 }]);
});

if (process.env.RUN_API_TESTS !== '1') {
    test('zs1b on the worker', { skip: 'set RUN_API_TESTS=1' }, () => {});
} else if (!existsSync(wranglerBin)) {
    test('zs1b on the worker', { skip: 'wrangler is absent' }, () => {});
} else {
    test('zs1b on the worker', { timeout: 300000 }, async (t) => {
        const persistTo = mkdtempSync(path.join(tmpdir(), 'voyage-zs1b-'));
        const base = `http://127.0.0.1:${PORT}`;
        const { sql, cookies: c } = accountSql([
            { id: 'zb-o', handle: 'zbowner' },
            { id: 'zb-p', handle: 'zbplayer' },
            { id: 'zb-q', handle: 'zbother' },
            { id: 'zb-r', handle: 'zbgone' },
            { id: 'zb-y', handle: 'zbrival' },
            { id: 'zb-x', handle: 'zbstranger' },
        ]);
        const version = `zb${randomBytes(3).toString('hex')}`;
        let child = null;
        try {
            runWrangler(['d1', 'migrations', 'apply', 'voyage', '--local', '--persist-to', persistTo]);
            sqlFile(persistTo, `${sql}
INSERT INTO truth_versions (version, engine_version, milieu, seed, settings, sectors, state, started_at, released_at, sectors_total, sectors_done, sectors_failed)
VALUES ('${version}', '1.2.0', 'M1105', 'TravellerMagnus', '{}', '[]', 'released', '${STAMP}', '${STAMP}', 0, 0, '[]');
`);
            r2Put(persistTo, `truth/${version}/manifest.json`, JSON.stringify({ sectors: [{ slug: 'Chart', x: 0, y: 0 }] }));
            r2Put(persistTo, `truth/${version}/sectors/Chart/index.json`, JSON.stringify({ name: 'Chart', hexes: {} }));
            child = startDev({ port: PORT, persistTo, inspectorPort: 19921 });
            await up(base);
            const json = (cookie) => ({ 'content-type': 'application/json', cookie, origin: base });
            const at = (id) => `${base}/api/universes/${id}`;

            async function universe(cookie, name, truthVersion = null) {
                const made = await jsonFetch(`${base}/api/universes`, { method: 'POST', headers: json(cookie), body: JSON.stringify({ name, truthVersion, editionDefault: 'MgT2E' }) });
                assert.equal(made.status, 201, made.text.slice(0, 300));
                return made.body.data.id;
            }
            const changes = (id, cookie, body) => jsonFetch(`${at(id)}/campaign/changes`, { method: 'PATCH', headers: json(cookie), body: JSON.stringify(body) });
            async function change(id, cookie, body) {
                const res = await changes(id, cookie, body);
                assert.equal(res.status, 200, res.text.slice(0, 300));
                assert.deepEqual(res.body.data.conflicts, [], res.text.slice(0, 300));
                return res;
            }
            const read = (id, cookie, query = '') => jsonFetch(`${at(id)}/campaign?after=0&limit=1000${query}`, { headers: { cookie } });

            const A = await universe(c['zb-o'], 'ZS1b A', version);
            const Y = await universe(c['zb-y'], 'ZS1b Y');
            const invite = await jsonFetch(`${at(A)}/players/invite`, { method: 'POST', headers: json(c['zb-o']) });
            assert.equal(invite.status, 200, invite.text.slice(0, 300));
            const token = invite.body.data.url.split('/join/')[1];
            for (const who of ['zb-p', 'zb-q', 'zb-r']) {
                const joined = await jsonFetch(`${base}/api/join`, { method: 'POST', headers: json(c[who]), body: JSON.stringify({ token }) });
                assert.equal(joined.status, 200, joined.text.slice(0, 300));
            }
            const gone = await jsonFetch(`${at(A)}/players/zb-r`, { method: 'DELETE', headers: json(c['zb-o']) });
            assert.equal(gone.status, 200, gone.text.slice(0, 300));

            await t.test('the invite read is the owner\'s alone, and only there is the token or the count', async () => {
                const owner = await jsonFetch(`${at(A)}/invite`, { headers: { cookie: c['zb-o'] } });
                assert.equal(owner.status, 200, owner.text.slice(0, 300));
                assert.equal(owner.body.data.link.url.includes(token), true);
                assert.equal(owner.body.data.link.uses, 3);
                assert.match(owner.headers.get('cache-control') ?? '', /no-store/);
                assert.equal((await jsonFetch(`${at(A)}/invite`)).status, 401);
                for (const who of ['zb-p', 'zb-r', 'zb-x', 'zb-y']) {
                    const res = await jsonFetch(`${at(A)}/invite`, { headers: { cookie: c[who] } });
                    assert.equal(res.status, 404, `${who} ${res.status}`);
                    assert.equal(res.text.includes(token), false, who);
                }
                const preview = await jsonFetch(`${base}/api/join/${token}`);
                assert.equal(preview.status, 200, preview.text.slice(0, 300));
                assert.deepEqual(Object.keys(preview.body.data).sort(), ['expiresAt', 'name', 'ownerHandle']);
                assert.equal(preview.text.includes(token), false);
                const page = await read(A, c['zb-p']);
                assert.equal(page.text.includes(token), false);
            });

            const HIDE = rid(1);
            const TOP = jid(1);
            const SECRET = jid(2);
            await change(A, c['zb-o'], {
                records: [record(HIDE, { name: 'ZREF_place' })],
                journal: [
                    entry(TOP, { title: 'ZPLAY_top', body: 'Open.' }),
                    entry(SECRET, { title: 'ZREF_entry', body: 'ZREF_entrybody', visibility: 'referee' }),
                ],
            });

            await t.test('a member writes as themself: no authorRole, no authorName, no referee voice', async () => {
                const MINE = jid(10);
                const forged = playerNote(MINE, { parent: TOP, body: 'ZPLAY_reply', authorRole: 'referee', authorName: 'The Referee' });
                await change(A, c['zb-p'], { journal: [forged] });
                for (const who of ['zb-p', 'zb-q']) {
                    const res = await read(A, c[who], `&parent=${TOP}`);
                    assert.equal(res.status, 200, res.text.slice(0, 300));
                    const row = res.body.data.journal.find((item) => item.id === MINE);
                    assert.ok(row, res.text.slice(0, 300));
                    assert.equal(row.authorName, 'zbplayer');
                    assert.equal(row.authorRole, undefined);
                    assert.equal(res.text.includes('zb-p'), false, 'an account id');
                    assert.equal(res.text.includes('authorId'), false);
                    if (who === 'zb-p') assert.equal(typeof row.rev, 'number');
                    else assert.equal(row.rev, undefined);
                }
                const owner = await read(A, c['zb-o'], `&parent=${TOP}`);
                const seen = owner.body.data.journal.find((item) => item.id === MINE);
                assert.equal(seen.authorName, 'zbplayer');
                assert.equal(seen.authorRole, undefined);
                assert.equal(owner.text.includes('authorId'), false);
            });

            await t.test('the owner\'s own reply alone carries authorRole, and a top-level entry stores no author', async () => {
                const REPLY = jid(11);
                await change(A, c['zb-o'], { journal: [playerNote(REPLY, { parent: TOP, body: 'ZPLAY_refereereply' })] });
                const member = await read(A, c['zb-q'], `&parent=${TOP}`);
                const row = member.body.data.journal.find((item) => item.id === REPLY);
                assert.equal(row.authorRole, 'referee');
                assert.equal(row.authorName, 'zbowner');
                const page = await read(A, c['zb-q']);
                const top = page.body.data.journal.find((item) => item.id === TOP);
                assert.equal(top.authorName, undefined);
                assert.equal(top.authorRole, undefined);
                assert.equal(page.text.includes('ZREF_'), false);
            });

            await t.test('a member cannot speak for the referee, or touch another\'s row', async () => {
                const notes = [
                    [entry(jid(20), { author: 'referee', visibility: 'players' }), 'author referee'],
                    [playerNote(jid(21), { visibility: 'referee' }), 'visibility referee'],
                    [playerNote(jid(22), { visibility: 'public' }), 'visibility public'],
                    [entry(TOP, { title: 'ZPLAY_forged', author: 'players', baseRev: 1 }), 'the owner\'s entry'],
                ];
                for (const [row, name] of notes) {
                    const res = await changes(A, c['zb-p'], { journal: [row] });
                    assert.equal(res.status, 403, `${name} ${res.status} ${res.text.slice(0, 200)}`);
                }
                const other = await changes(A, c['zb-q'], { journal: [playerNote(jid(10), { body: 'ZPLAY_edited', baseRev: 1 })] });
                assert.equal(other.status, 403, other.text.slice(0, 200));
                const remove = await changes(A, c['zb-q'], { journal: [{ id: jid(10), baseRev: 1, deleted: true }] });
                assert.equal(remove.status, 403, remove.text.slice(0, 200));
                const archived = await changes(A, c['zb-r'], { journal: [playerNote(jid(23))] });
                assert.equal(archived.status, 403, archived.text.slice(0, 200));
                const stranger = await changes(A, c['zb-x'], { journal: [playerNote(jid(24))] });
                assert.equal(stranger.status, 404, stranger.text.slice(0, 200));
                const signedOut = await jsonFetch(`${at(A)}/campaign/changes`, { method: 'PATCH', headers: { 'content-type': 'application/json', origin: base }, body: '{}' });
                assert.equal(signedOut.status, 401);
            });

            await t.test('ZS1b FINDING: a reply under an entry the referee took back is gone for players', async () => {
                const ENTRY = jid(30);
                await change(A, c['zb-o'], { journal: [entry(ENTRY, { title: 'ZPLAY_shared' })] });
                await change(A, c['zb-o'], { journal: [playerNote(jid(31), { parent: ENTRY, body: 'ZREF_underback' })] });
                await change(A, c['zb-o'], { journal: [entry(ENTRY, { title: 'ZPLAY_shared', visibility: 'referee', baseRev: 1 })] });
                const res = await read(A, c['zb-p'], `&parent=${ENTRY}`);
                assert.equal(res.text.includes('ZREF_underback'), false, res.text.slice(0, 300));
            });

            await t.test('ZS1b FINDING: a reply to a referee-only entry answers like a reply to no entry', async () => {
                const hidden = await changes(A, c['zb-p'], { journal: [playerNote(jid(32), { parent: SECRET })] });
                const missing = await changes(A, c['zb-p'], { journal: [playerNote(jid(33), { parent: jid(0xdead) })] });
                assert.equal(missing.status, 400, missing.text.slice(0, 200));
                assert.equal(hidden.status, missing.status, hidden.text.slice(0, 200));
                assert.equal(hidden.body.error.message, missing.body.error.message);
            });

            await t.test('the paste door with agent access off: the owner alone, and no token anywhere', async () => {
                const url = `${at(A)}/campaign/proposals`;
                const body = (key) => JSON.stringify(batch(key, [question()]));
                const noRow = 'tv_pat_' + 'q'.repeat(43);
                const paused = await jsonFetch(url, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${noRow}` }, body: body('zs1b-paused-1') });
                assert.equal(paused.status, 503, paused.text.slice(0, 200));
                assert.equal(paused.body.error.code, 'agents_paused');
                const list = await jsonFetch(`${base}/api/tokens`, { headers: { cookie: c['zb-o'] } });
                assert.equal(list.status, 503, list.text.slice(0, 200));
                const mint = await jsonFetch(`${base}/api/tokens`, { method: 'POST', headers: json(c['zb-o']), body: JSON.stringify({ name: 'x', scopes: ['campaign:read'], universeId: A }) });
                assert.equal(mint.status, 503, mint.text.slice(0, 200));
                const mcp = await jsonFetch(`${base}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: `Bearer ${noRow}` }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }) });
                assert.equal(mcp.status, 503, mcp.text.slice(0, 200));
                assert.equal((await jsonFetch(url, { method: 'POST', headers: { 'content-type': 'application/json', origin: base }, body: body('zs1b-out-001') })).status, 401);
                const stranger = await jsonFetch(url, { method: 'POST', headers: json(c['zb-x']), body: body('zs1b-str-001') });
                assert.equal(stranger.status, 404, stranger.text.slice(0, 200));
                assert.equal(stranger.body.error.message, 'No such universe.');
                const rival = await jsonFetch(url, { method: 'POST', headers: json(c['zb-y']), body: body('zs1b-riv-001') });
                assert.equal(rival.status, 404, rival.text.slice(0, 200));
                const archived = await jsonFetch(url, { method: 'POST', headers: json(c['zb-r']), body: body('zs1b-arc-001') });
                assert.equal(archived.status, 403, archived.text.slice(0, 200));
                const member = await jsonFetch(url, { method: 'POST', headers: json(c['zb-p']), body: body('zs1b-mem-001') });
                assert.equal(member.status, 403, member.text.slice(0, 200));
                const evil = await jsonFetch(url, { method: 'POST', headers: { ...json(c['zb-o']), origin: 'https://evil.example' }, body: body('zs1b-evl-001') });
                assert.equal(evil.status, 403, evil.text.slice(0, 200));
                const big = await jsonFetch(url, { method: 'POST', headers: json(c['zb-o']), body: JSON.stringify(batch('zs1b-big-001', [{ ...question(), text: 'x'.repeat(3 * 1024 * 1024) }])) });
                assert.equal(big.status, 400, big.text.slice(0, 200));
                const owner = await jsonFetch(url, { method: 'POST', headers: json(c['zb-o']), body: body('zs1b-own-001') });
                assert.equal(owner.status < 300, true, owner.text.slice(0, 300));
                assert.equal(owner.body.data.batch.pasted, true);
                const page = await read(A, c['zb-p']);
                assert.equal(page.text.includes('pendingProposals'), false);
                assert.equal(page.text.includes('Who?'), false);
            });

            await t.test('a table set reaches only the campaign that names it', async () => {
                const made = await jsonFetch(`${base}/api/table-sets`, { method: 'POST', headers: json(c['zb-o']), body: JSON.stringify({ copyOf: 'official:trade', name: 'ZREF_set' }) });
                assert.equal(made.status, 201, made.text.slice(0, 300));
                const id = made.body.data.id;
                const rival = await jsonFetch(`${base}/api/table-sets`, { method: 'POST', headers: json(c['zb-y']), body: JSON.stringify({ copyOf: 'official:trade', name: 'ZREF_rival' }) });
                assert.equal(rival.status, 201, rival.text.slice(0, 300));
                const url = `${base}/api/table-sets/${id}`;
                const settings = async (universeId, cookie, tableSets) => {
                    const page = await read(universeId, cookie);
                    const { rev, ...rest } = page.body.data.settings;
                    return changes(universeId, cookie, { settings: { ...rest, tableSets, rev, baseRev: rev } });
                };
                const stolen = await settings(Y, c['zb-y'], { trade: id });
                assert.equal(stolen.status, 404, stolen.text.slice(0, 200));
                assert.equal((await settings(A, c['zb-o'], { trade: rival.body.data.id })).status, 404);
                assert.equal((await settings(A, c['zb-o'], { randomPassenger: id })).status, 404, 'the wrong kind');
                assert.equal((await jsonFetch(url, { headers: { cookie: c['zb-p'] } })).status, 404, 'not chosen yet');
                await change(A, c['zb-o'], await (async () => {
                    const page = await read(A, c['zb-o']);
                    const { rev, ...rest } = page.body.data.settings;
                    return { settings: { ...rest, tableSets: { trade: id }, rev, baseRev: rev } };
                })());
                const member = await jsonFetch(url, { headers: { cookie: c['zb-p'] } });
                assert.equal(member.status, 200, member.text.slice(0, 200));
                for (const who of ['zb-r', 'zb-x', 'zb-y']) {
                    const res = await jsonFetch(url, { headers: { cookie: c[who] } });
                    assert.equal(res.status, 404, `${who} ${res.status}`);
                }
                const memberPut = await jsonFetch(url, { method: 'PUT', headers: json(c['zb-p']), body: JSON.stringify({ baseRev: 1, tables: {} }) });
                assert.equal(memberPut.status, 404, memberPut.text.slice(0, 200));
                const memberCopy = await jsonFetch(`${base}/api/table-sets`, { method: 'POST', headers: json(c['zb-p']), body: JSON.stringify({ copyOf: id }) });
                assert.equal(memberCopy.status, 404, memberCopy.text.slice(0, 200));
                const memberWrite = await changes(A, c['zb-p'], { settings: { party: { vesselIds: [], aboard: {}, memberIds: [], anchor: null }, kinds: {}, calendar: { dateFormat: 'imperial' }, tableSets: { trade: 'official:trade' }, rev: 0, baseRev: 0 } });
                assert.equal(memberWrite.status, 403, memberWrite.text.slice(0, 200));
            });

            const PERSON = rid(40);
            const VESSEL = rid(41);
            const PUBLIC_ENTRY = jid(40);
            await t.test('the public card and the unfurl', async () => {
                await change(A, c['zb-o'], {
                    records: [
                        record(VESSEL, { type: 'vessel', name: 'ZPLAY_ship', visibility: 'players', anchor: { kind: 'system', hexKey: 'Spinward_Marches/1910' } }),
                        record(PERSON, { type: 'person', name: 'ZREF_aboard' }),
                    ],
                });
                const page = await read(A, c['zb-o']);
                const { rev, ...rest } = page.body.data.settings;
                await change(A, c['zb-o'], {
                    settings: { ...rest, party: { vesselIds: [VESSEL], aboard: { [PERSON]: VESSEL }, memberIds: [PERSON], anchor: null }, rev, baseRev: rev },
                    journal: [entry(PUBLIC_ENTRY, { title: 'ZPLAY_public', body: 'ZPLAY_open', visibility: 'public' })],
                });
                const on = await jsonFetch(`${at(A)}/public-games`, { method: 'PATCH', headers: json(c['zb-o']), body: JSON.stringify({ public: true }) });
                assert.equal(on.status, 200, on.text.slice(0, 200));
                const feed = await jsonFetch(`${base}/api/public-games?truthVersion=${version}&sector=Spinward_Marches`);
                assert.equal(feed.text.includes('ZREF_'), false, feed.text.slice(0, 300));
                const mark = feed.body.hexes[0].ships[0].mark;
                const card = await jsonFetch(`${base}/api/public-ships/${mark}`);
                assert.equal(card.status, 200, card.text.slice(0, 300));
                assert.equal(card.text.includes('ZPLAY_public'), true);
                assert.equal(card.text.includes('ZREF_'), false, card.text.slice(0, 300));
                const html = { accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8' };
                const live = await fetch(`${base}/ship/${mark}`, { headers: html });
                const liveText = await live.text();
                assert.equal(liveText.includes('ZPLAY_ship'), true);
                assert.equal(liveText.includes('ZREF_'), false);
                const joinPage = await (await fetch(`${base}/join/${token}`, { headers: html })).text();
                assert.equal(joinPage.includes('ZS1b A'), true);
                assert.equal(joinPage.includes(token), false);
                assert.equal(joinPage.includes('zbowner'), false);
                const off = await jsonFetch(`${at(A)}/public-games`, { method: 'PATCH', headers: json(c['zb-o']), body: JSON.stringify({ public: false }) });
                assert.equal(off.status, 200);
                assert.equal((await jsonFetch(`${base}/api/public-ships/${mark}`)).status, 404);
                const closed = await (await fetch(`${base}/ship/${mark}`, { headers: html })).text();
                assert.equal(closed.includes('ZPLAY_ship'), false);
            });

            await t.test('ZS1b SECURITY: a referee passage in a public journal entry stays off the public card', async () => {
                const page = await read(A, c['zb-o']);
                const row = page.body.data.journal.find((item) => item.id === PUBLIC_ENTRY);
                await change(A, c['zb-o'], { journal: [entry(PUBLIC_ENTRY, { title: 'ZPLAY_public', body: `Docked.\n:::referee\nZREF_cardblock\n:::\nMet [[${HIDE}|ZREF_cardlabel]].`, visibility: 'public', baseRev: row.rev })] });
                const on = await jsonFetch(`${at(A)}/public-games`, { method: 'PATCH', headers: json(c['zb-o']), body: JSON.stringify({ public: true }) });
                assert.equal(on.status, 200, on.text.slice(0, 200));
                const feed = await jsonFetch(`${base}/api/public-games?truthVersion=${version}&sector=Spinward_Marches`);
                const card = await jsonFetch(`${base}/api/public-ships/${feed.body.hexes[0].ships[0].mark}`);
                assert.equal(card.status, 200, card.text.slice(0, 300));
                await jsonFetch(`${at(A)}/public-games`, { method: 'PATCH', headers: json(c['zb-o']), body: JSON.stringify({ public: false }) });
                assert.equal(card.text.includes('ZREF_'), false, card.text.slice(0, 400));
            });

            await t.test('the credit register\'s other routes: mode, void and accept', async () => {
                const made = await jsonFetch(`${base}/api/characters`, { method: 'POST', headers: json(c['zb-p']), body: JSON.stringify({ name: 'Bea' }) });
                assert.equal(made.status, 201, made.text.slice(0, 300));
                const id = made.body.data.character.id;
                const ledger = `${base}/api/characters/${encodeURIComponent(id)}/ledger`;
                const line = (memo) => JSON.stringify({ kind: 'pay', amount: 500, memo });
                await change(A, c['zb-o'], { records: [record(rid(50), { type: 'person', name: 'Bea', visibility: 'players', sheet: { schema: 'mgt2e', characterId: id } })] });
                const post = await jsonFetch(ledger, { method: 'POST', headers: json(c['zb-o']), body: line('ZPLAY_share') });
                assert.equal(post.status, 201, post.text.slice(0, 300));
                assert.equal(post.body.data.pending, 1);
                const lineId = post.body.data.id;
                assert.equal((await jsonFetch(ledger, { headers: { cookie: c['zb-o'] } })).status, 404, 'the referee is not an editor: no read');
                assert.equal((await jsonFetch(`${ledger}/${lineId}/void`, { method: 'POST', headers: json(c['zb-o']), body: '{}' })).status, 404);
                const own = await jsonFetch(`${ledger}/${lineId}/accept`, { method: 'POST', headers: json(c['zb-o']), body: '{}' });
                assert.equal(own.status, 400, own.text.slice(0, 200));
                assert.equal((await jsonFetch(`${ledger}/mode`, { method: 'POST', headers: json(c['zb-o']), body: JSON.stringify({ credits: 'detailed' }) })).status, 404);
                for (const who of ['zb-q', 'zb-x', 'zb-y']) {
                    assert.equal((await jsonFetch(ledger, { headers: { cookie: c[who] } })).status, 404, who);
                    assert.equal((await jsonFetch(ledger, { method: 'POST', headers: json(c[who]), body: line('ZREF_x') })).status, 404, who);
                    assert.equal((await jsonFetch(`${ledger}/${lineId}/accept`, { method: 'POST', headers: json(c[who]), body: '{}' })).status, 404, who);
                    assert.equal((await jsonFetch(`${ledger}/mode`, { method: 'POST', headers: json(c[who]), body: JSON.stringify({ credits: 'simple' }) })).status, 404, who);
                }
                const pending = await jsonFetch(ledger, { headers: { cookie: c['zb-p'] } });
                assert.equal(pending.body.data.balance, 0);
                const accepted = await jsonFetch(`${ledger}/${lineId}/accept`, { method: 'POST', headers: json(c['zb-p']), body: '{}' });
                assert.equal(accepted.status, 200, accepted.text.slice(0, 200));
                assert.equal((await jsonFetch(ledger, { headers: { cookie: c['zb-p'] } })).body.data.balance, 500);
                const mode = await jsonFetch(`${ledger}/mode`, { method: 'POST', headers: json(c['zb-p']), body: JSON.stringify({ credits: 'simple' }) });
                assert.equal(mode.status, 200, mode.text.slice(0, 200));
                const bad = await jsonFetch(`${ledger}/mode`, { method: 'POST', headers: json(c['zb-p']), body: JSON.stringify({ credits: 'free' }) });
                assert.equal(bad.status, 400, bad.text.slice(0, 200));
                const evil = await jsonFetch(`${ledger}/mode`, { method: 'POST', headers: { ...json(c['zb-p']), origin: 'https://evil.example' }, body: JSON.stringify({ credits: 'detailed' }) });
                assert.equal(evil.status, 403, evil.text.slice(0, 200));
            });

            await t.test('ZS1b FINDING: a credit line holds a bounded linkId, as it does a bounded memo', async () => {
                const made = await jsonFetch(`${base}/api/characters`, { method: 'POST', headers: json(c['zb-q']), body: JSON.stringify({ name: 'Cal' }) });
                const ledger = `${base}/api/characters/${encodeURIComponent(made.body.data.character.id)}/ledger`;
                const res = await jsonFetch(ledger, { method: 'POST', headers: json(c['zb-q']), body: JSON.stringify({ kind: 'transfer', amount: 5, memo: 'x', linkId: 'z'.repeat(200_000) }) });
                assert.equal(res.status, 400, `status ${res.status}`);
            });

            await t.test('the demo body holds nothing of an account', async () => {
                sqlFile(persistTo, `UPDATE universes SET demo = 1 WHERE id = '${A}';`);
                const res = await jsonFetch(`${base}/api/demo/campaign`);
                assert.equal(res.status, 200, res.text.slice(0, 300));
                assert.equal(res.text.includes('ZPLAY_top'), true);
                for (const leak of ['ZREF_place', 'ZREF_entry', 'ZREF_set', 'ZPLAY_reply', 'zb-o', 'zb-p', 'zbowner', 'zbplayer', token, HIDE]) {
                    assert.equal(res.text.includes(leak), false, leak);
                }
                assert.equal(res.body.data.visible, undefined);
                assert.equal(res.body.data.pendingProposals, undefined);
                assert.equal(res.text.includes('"rev"'), false);
                assert.equal(res.text.includes('authorName'), false);
                sqlFile(persistTo, `UPDATE universes SET demo = 0 WHERE id = '${A}';`);
            });

            const P = rid(60);
            const H = rid(61);
            await change(A, c['zb-o'], {
                records: [
                    record(P, { name: 'ZPLAY_pub', visibility: 'players' }),
                    record(H, { name: 'ZPLAY_hidden_name', details: 'ZREF_hiddendetails' }),
                ],
            });
            await change(A, c['zb-o'], { links: [link(lid(1), P, H, { role: 'ZPLAY_role', notes: 'Knows.\n:::referee\nZREF_linkblock\n:::' })] });

            await t.test('ZS1b SECURITY: a published link carries no referee passage', async () => {
                const created = await jsonFetch(`${base}/api/packages`, { method: 'POST', headers: json(c['zb-o']), body: JSON.stringify({ title: 'Gate', kind: 'people', description: '', tags: [], universeId: A }) });
                assert.equal(created.status, 201, created.text.slice(0, 300));
                const packageId = created.body.data.id;
                const sent = await jsonFetch(`${base}/api/packages/${packageId}/versions`, { method: 'POST', headers: json(c['zb-o']), body: JSON.stringify({ universeId: A, hexKeys: [], recordIds: [P, H] }) });
                assert.equal(sent.status, 202, sent.text.slice(0, 300));
                const deadline = Date.now() + 45000;
                let state = '';
                while (Date.now() < deadline && state !== 'done' && state !== 'failed') {
                    const got = await jsonFetch(`${base}/api/packages/${packageId}/versions/1`, { headers: { cookie: c['zb-o'] } });
                    state = got.body?.data?.state ?? '';
                    await sleep(250);
                }
                assert.equal(state, 'done');
                const manifest = JSON.parse(r2Get(persistTo, `packages/${packageId}/1/manifest.json`));
                const records = r2Get(persistTo, `objects/${manifest.records.contentHash}`);
                assert.equal(records.includes('ZREF_hiddendetails'), false);
                const links = r2Get(persistTo, `objects/${manifest.records.links.contentHash}`);
                assert.equal(links.includes('ZREF_linkblock'), false, links.slice(0, 300));
            });
        } finally {
            stopDev(child?.pid);
            removeTree(persistTo);
        }
    });
}
