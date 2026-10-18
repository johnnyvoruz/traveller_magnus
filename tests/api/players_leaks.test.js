/**
 * P2b1 leak suite skeleton. Review §5, plus the system-hex companion.
 * Each assertion is the contract shape. A 404 from a route that is not built
 * yet fails these checks. It is not what the test expects.
 * Cases 27 and 29 are the pure tests in players_logic.test.js.
 */
import assert from 'node:assert/strict';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { playersView } from '@voyage/shared';
import { PlayersPage } from '../../packages/shared/src/schemas/players.ts';
import { planPack } from '../../apps/web/src/pack/plan.ts';
import { runWrangler } from './session.js';
import { startDev, stopDev, wranglerBin } from './server.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const STAMP = '2026-10-04T00:00:00.000Z';
const HEX = 'Spinward_Marches/1910';
const PORT = 18893;
const H = 'cr_00000000-0000-4000-8000-000000000001';
const P = 'cr_00000000-0000-4000-8000-000000000002';
const V = 'cr_00000000-0000-4000-8000-000000000003';
const PP = 'cr_00000000-0000-4000-8000-000000000004';
const RP = 'cr_00000000-0000-4000-8000-000000000005';
const ORG = 'cr_00000000-0000-4000-8000-000000000006';
const CREW = 'cl_00000000-0000-4000-8000-000000000001';
const ALLY = 'cl_00000000-0000-4000-8000-000000000002';
const MEMBER_LINK = 'cl_00000000-0000-4000-8000-000000000003';
const S = 'cj_00000000-0000-4000-8000-000000000001';
const N0 = 'cj_00000000-0000-4000-8000-000000000002';
const PUB = 'cj_00000000-0000-4000-8000-000000000003';
const ORIGIN_SENTENCE = 'That request was blocked. Reload the page and try again.';
const FULL_SENTENCE = 'This campaign has 255 players, the most it can have.';

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

function sha(bytes) {
    return createHash('sha256').update(bytes).digest('hex');
}

function tinyWebp(mark) {
    const body = Buffer.alloc(16);
    body.write('RIFF', 0);
    body.writeUInt32LE(8, 4);
    body.write('WEBP', 8);
    body.writeUInt32LE(mark, 12);
    return body;
}

function rid(n) {
    return `cr_${n.toString(16).padStart(8, '0')}-0000-4000-8000-000000000000`;
}

function jid(n) {
    return `cj_${n.toString(16).padStart(8, '0')}-0000-4000-8000-000000000000`;
}

function lid(n) {
    return `cl_${n.toString(16).padStart(8, '0')}-0000-4000-8000-000000000000`;
}

function record(id, over = {}) {
    return {
        id,
        type: 'place',
        kind: '',
        name: 'Place',
        summary: '',
        details: '',
        tags: [],
        anchor: null,
        when: null,
        visibility: 'referee',
        playerNotes: null,
        sheet: null,
        status: null,
        images: null,
        provenance: null,
        rev: 0,
        createdAt: STAMP,
        updatedAt: STAMP,
        deleted: false,
        baseRev: 0,
        ...over,
    };
}

function link(id, from, to, over = {}) {
    return {
        id,
        from,
        to,
        kind: 'contact',
        role: '',
        order: 0,
        since: null,
        until: null,
        notes: '',
        visibility: 'players',
        provenance: null,
        rev: 0,
        createdAt: STAMP,
        updatedAt: STAMP,
        deleted: false,
        baseRev: 0,
        ...over,
    };
}

function entry(id, over = {}) {
    return {
        id,
        kind: 'note',
        title: '',
        body: '',
        when: null,
        realDate: null,
        sequence: null,
        author: 'referee',
        visibility: 'referee',
        anchor: null,
        mentions: [],
        rev: 0,
        createdAt: STAMP,
        updatedAt: STAMP,
        deleted: false,
        baseRev: 0,
        ...over,
    };
}

function playerNote(id, over = {}) {
    return entry(id, { author: 'players', visibility: 'players', title: 'ZPLAY_note', ...over });
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function sqlFile(persistTo, sql) {
    const file = path.join(mkdtempSync(path.join(tmpdir(), 'voyage-sql-')), 'query.sql');
    writeFileSync(file, sql);
    return runWrangler(['d1', 'execute', 'voyage', '--local', '--persist-to', persistTo, '--file', file]);
}

function trySql(persistTo, sql) {
    try {
        sqlFile(persistTo, sql);
        return true;
    } catch {
        return false;
    }
}

async function jsonFetch(url, options = {}) {
    const response = await fetch(url, options);
    const text = await response.text();
    let body = null;
    try {
        body = text ? JSON.parse(text) : null;
    } catch {
        body = { raw: text };
    }
    return { status: response.status, body, headers: response.headers, text };
}

function cookieHeader(cookie, extra = {}) {
    return { cookie, ...extra };
}

function page(res, what) {
    assert.equal(res.body?.ok, true, `${what}: expected { ok: true, data } for the players page`);
    const data = res.body.data;
    assert.ok(Array.isArray(data.records), `${what}: records`);
    assert.ok(Array.isArray(data.links), `${what}: links`);
    assert.ok(Array.isArray(data.journal), `${what}: journal`);
    assert.equal(typeof data.seq, 'number', `${what}: seq`);
    assert.equal(typeof data.done, 'boolean', `${what}: done`);
    return data;
}

function applied(res, what) {
    assert.equal(res.body?.ok, true, `${what}: expected { ok: true, data } with applied changes`);
    assert.ok(Array.isArray(res.body.data.applied), `${what}: applied`);
    assert.deepEqual(res.body.data.conflicts, [], `${what}: no conflicts`);
    return res.body.data;
}

function denied(res, what) {
    assert.equal(res.body?.ok, false, `${what}: expected { ok: false, error }`);
    assert.equal(res.body.error?.code, 'forbidden', what);
    assert.equal(res.body.error?.message, 'You cannot change that.', what);
    assert.equal(Object.hasOwn(res.body.error, 'current'), false, `${what}: the hidden row stays out`);
    assert.equal(res.text.includes('ZREF_'), false, what);
}

function invalid(res, what) {
    assert.equal(res.status, 400, what);
    assert.equal(res.body?.ok, false, what);
    assert.equal(res.body.error?.code, 'validation', what);
    assert.equal(res.body.error?.message, 'Invalid request.', what);
}

function stranger(res, what) {
    assert.equal(res.status, 404, what);
    assert.deepEqual(res.body, { ok: false, error: { code: 'not_found', message: 'No such universe.' } }, what);
}

function noMarker(text, what) {
    assert.equal(text.includes('ZREF_'), false, `${what}: referee marker`);
}

const HASH_A = sha(tinyWebp(1));
const HASH_B = sha(tinyWebp(2));

function packFixture() {
    const records = {
        [H]: record(H, { name: 'ZREF_place', visibility: 'referee', anchor: { kind: 'system', hexKey: HEX } }),
        [P]: record(P, { name: 'ZPLAY_place', visibility: 'players' }),
        [PP]: record(PP, { type: 'person', name: 'ZPLAY_person', visibility: 'players' }),
        [V]: record(V, { type: 'vessel', name: 'ZPLAY_ship', visibility: 'players' }),
    };
    const links = {
        [CREW]: link(CREW, PP, V, { kind: 'crew' }),
        [ALLY]: link(ALLY, PP, H, { kind: 'ally' }),
    };
    const journal = {
        [N0]: entry(N0, { title: 'ZPLAY_note', visibility: 'players', author: 'players' }),
        [S]: entry(S, { kind: 'session', title: 'ZREF_session', sequence: 1, visibility: 'referee' }),
    };
    const settings = {
        party: { vesselIds: [V], aboard: { [PP]: V }, memberIds: [PP], anchor: null },
        kinds: {},
        calendar: { dateFormat: 'imperial' },
        rev: 0,
    };
    return { name: 'Pack', clockDays: null, records, links, journal, settings };
}

test('the pack and the member read agree', () => {
    const fixture = packFixture();
    const view = playersView({
        records: Object.values(fixture.records),
        links: Object.values(fixture.links),
        journal: Object.values(fixture.journal),
        settings: fixture.settings,
        clock: null,
    });
    const plan = planPack(fixture);
    const ids = (rows) => rows.map((row) => row.id).sort();
    const ends = (rows, from, to) => rows.map((row) => `${row[from]}->${row[to]}`).sort();
    assert.deepEqual(ids(plan.records), ids(view.records));
    assert.deepEqual(ids(plan.entries), ids(view.journal));
    assert.deepEqual(ends(plan.links, 'fromId', 'toId'), ends(view.links, 'from', 'to'));
});

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
    throw new Error(last || 'wrangler dev did not answer /api/health');
}

function accountSql(people) {
    const now = Date.now();
    const expires = now + 30 * 24 * 60 * 60 * 1000;
    const when = new Date(now).toISOString();
    const secret = authSecret();
    const lines = [];
    const cookies = {};
    for (const person of people) {
        const token = randomBytes(32).toString('hex');
        const sessionId = `${person.id}-${randomBytes(4).toString('hex')}`;
        lines.push(`INSERT INTO user (id, name, email, email_verified, created_at, updated_at, role, banned)
VALUES ('${person.id}', '${person.id}', '${person.id}@localhost', 1, ${now}, ${now}, 'user', 0);`);
        lines.push(`INSERT INTO profile (user_id, handle, display_name, created_at)
VALUES ('${person.id}', '${person.handle}', '${person.handle}', '${when}');`);
        lines.push(`INSERT INTO session (id, expires_at, token, created_at, updated_at, user_id)
VALUES ('${sessionId}', ${expires}, '${token}', ${now}, ${now}, '${person.id}');`);
        const signature = createHmac('sha256', secret).update(token).digest('base64');
        cookies[person.id] = `__Secure-better-auth.session_token=${encodeURIComponent(`${token}.${signature}`)}`;
    }
    return { sql: lines.join('\n'), cookies };
}

if (process.env.RUN_API_TESTS !== '1') {
    test('players leaks on the worker', { skip: 'set RUN_API_TESTS=1' }, () => {});
} else if (!existsSync(wranglerBin)) {
    test('players leaks on the worker', { skip: 'wrangler is absent' }, () => {});
} else {
    test('players leaks on the worker', { timeout: 300000 }, async (t) => {
        const persistTo = mkdtempSync(path.join(tmpdir(), 'voyage-players-'));
        const base = `http://127.0.0.1:${PORT}`;
        const people = [
            { id: 'pl-owner', handle: 'plowner' },
            { id: 'pl-m1', handle: 'plm1' },
            { id: 'pl-m2', handle: 'plm2' },
            { id: 'pl-m3', handle: 'plm3' },
            { id: 'pl-u', handle: 'plother' },
            { id: 'pl-full', handle: 'plfull' },
        ];
        const { sql, cookies } = accountSql(people);
        let child = null;
        try {
            runWrangler(['d1', 'migrations', 'apply', 'voyage', '--local', '--persist-to', persistTo]);
            sqlFile(persistTo, sql);
            child = startDev({ port: PORT, persistTo, inspectorPort: 19893 });
            await up(base);
            const owner = cookies['pl-owner'];
            const m1 = cookies['pl-m1'];
            const m2 = cookies['pl-m2'];
            const m3 = cookies['pl-m3'];
            const other = cookies['pl-u'];
            const full = cookies['pl-full'];
            let liveToken = '';
            const headers = { 'content-type': 'application/json', cookie: owner };
            const created = await jsonFetch(`${base}/api/universes`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ name: 'Players proof', truthVersion: null, editionDefault: 'MgT2E' }),
            });
            assert.equal(created.status, 201, JSON.stringify(created.body));
            const id = created.body.data.id;
            const universe = `${base}/api/universes/${id}`;

            async function putObject(bytes, hash) {
                const put = await jsonFetch(`${universe}/objects/${hash}`, {
                    method: 'PUT',
                    headers: { cookie: owner, 'content-type': 'application/json' },
                    body: bytes,
                });
                assert.equal(put.status, 201, JSON.stringify(put.body));
            }
            await putObject(tinyWebp(1), HASH_A);
            await putObject(tinyWebp(2), HASH_B);

            async function change(body, who = owner) {
                return jsonFetch(`${universe}/campaign/changes`, {
                    method: 'PATCH',
                    headers: { 'content-type': 'application/json', cookie: who },
                    body: JSON.stringify(body),
                });
            }
            async function ownerChange(body) {
                const res = await change(body);
                assert.equal(res.status, 200, JSON.stringify(res.body));
                assert.deepEqual(res.body.data.conflicts, [], JSON.stringify(res.body));
                return res.body.data;
            }

            const image = (hash, caption) => ({ hash, thumbHash: hash, width: 1, height: 1, bytes: 16, ...(caption ? { caption } : {}) });
            await ownerChange({
                records: [
                    record(H, {
                        name: 'ZREF_place',
                        visibility: 'referee',
                        anchor: { kind: 'system', hexKey: HEX, locationLabel: 'Regina' },
                        images: [image(HASH_B)],
                    }),
                    record(P, {
                        name: 'ZPLAY_place',
                        visibility: 'players',
                        anchor: { kind: 'system', hexKey: HEX, locationLabel: 'Regina' },
                        images: [image(HASH_A, `See [[${H}|ZREF_label]] and [[${P}|ZPLAY_place]]`)],
                    }),
                    record(V, {
                        type: 'vessel',
                        name: 'ZPLAY_ship',
                        visibility: 'players',
                        anchor: { kind: 'record', id: P },
                        status: {
                            track: [{
                                from: { kind: 'record', id: P },
                                to: { kind: 'record', id: H },
                                departs: 1,
                                arrives: 2,
                                mode: 'flight',
                            }],
                            cargo: [{ itemId: H, label: 'ore', tons: 1 }],
                        },
                    }),
                    record(PP, { type: 'person', name: 'ZPLAY_person', visibility: 'players' }),
                    record(RP, {
                        type: 'person',
                        name: 'ZREF_person',
                        visibility: 'referee',
                        sheet: { schema: 'mgt2e', characterId: 'ch_ZREF' },
                    }),
                    record(ORG, { type: 'organization', name: 'ZREF_org', visibility: 'referee' }),
                ],
            });
            await ownerChange({
                links: [
                    link(CREW, PP, V, { kind: 'crew' }),
                    link(ALLY, PP, RP, { kind: 'ally' }),
                    link(MEMBER_LINK, V, ORG, { kind: 'member' }),
                ],
            });
            await ownerChange({
                journal: [
                    entry(S, { kind: 'session', title: 'ZREF_session', body: 'ZREF_session', sequence: 1 }),
                    entry(N0, { title: 'ZPLAY_refnote', body: 'ZPLAY_refnote', author: 'referee', visibility: 'players' }),
                    entry(PUB, { title: 'ZPLAY_public', body: 'ZPLAY_public', visibility: 'public' }),
                ],
            });
            await ownerChange({
                settings: {
                    party: {
                        vesselIds: [V],
                        aboard: { [PP]: V, [RP]: V },
                        memberIds: [PP, RP],
                        anchor: { kind: 'record', id: H },
                    },
                    kinds: { person: ['pilot'] },
                    calendar: { dateFormat: 'imperial' },
                    rev: 0,
                    baseRev: 0,
                },
            });
            await ownerChange({ clock: { days: 10, baseRev: 0 } });
            const setupInvite = await jsonFetch(`${universe}/players/invite`, { method: 'POST', headers: { cookie: owner } });
            assert.equal(setupInvite.body?.ok, true, JSON.stringify(setupInvite.body));
            const setupToken = setupInvite.body.data.url.split('/join/')[1];
            for (const cookie of [m1, m2, m3]) {
                const claimed = await jsonFetch(`${base}/api/join`, {
                    method: 'POST',
                    headers: { cookie, 'content-type': 'application/json' },
                    body: JSON.stringify({ token: setupToken }),
                });
                assert.equal(claimed.status, 200, JSON.stringify(claimed.body));
            }
            const archivedM3 = await jsonFetch(`${universe}/players/pl-m3`, { method: 'DELETE', headers: { cookie: owner } });
            assert.equal(archivedM3.body?.data?.status, 'archived', JSON.stringify(archivedM3.body));

            async function read(who, query = 'after=0&limit=1000') {
                return jsonFetch(`${universe}/campaign?${query}`, { headers: cookieHeader(who) });
            }
            async function ownerSeq() {
                const res = await read(owner);
                assert.equal(res.body?.ok, true, JSON.stringify(res.body));
                return res.body.data.seq;
            }

            await t.test('member read holds no referee marker', async () => {
                const res = await read(m1);
                const data = page(res, 'member read');
                noMarker(res.text, 'member read');
                assert.equal(res.text.includes('ZPLAY_'), true);
                assert.equal(JSON.stringify(data.journal).includes('ZPLAY_public'), true);
                assert.equal(data.journal.some((row) => row.id === S), false);
                assert.equal(data.records.some((row) => row.id === RP || row.id === H), false);
                assert.equal(res.text.includes('ch_ZREF'), false);
                assert.ok(data.visible, 'visible rides on after=0');
            });

            await t.test('member read parses as the client page', async () => {
                const data = page(await read(m1), 'client page');
                const parsed = PlayersPage.safeParse(data);
                assert.equal(parsed.success, true, JSON.stringify(parsed.error?.issues?.slice(0, 4)));
            });

            await t.test('party lists hold no hidden id', async () => {
                const data = page(await read(m1), 'party');
                assert.deepEqual(data.settings.party.memberIds, [PP]);
                assert.deepEqual(data.settings.party.vesselIds, [V]);
                assert.deepEqual(data.settings.party.aboard, { [PP]: V });
                assert.deepEqual(data.settings.party.anchor, { kind: 'system', hexKey: HEX });
            });

            await t.test('a ship leg to a hidden place shows the hex and not the name', async () => {
                const data = page(await read(m1), 'track');
                const ship = data.records.find((row) => row.id === V);
                assert.ok(ship, 'the players ship is in the read');
                assert.deepEqual(ship.status.track[0].to, { kind: 'system', hexKey: HEX });
                assert.equal(Object.hasOwn(ship.status.cargo[0], 'itemId'), false);
                noMarker(JSON.stringify(ship), 'track');
            });

            await t.test('a link with one hidden end is absent', async () => {
                const data = page(await read(m1), 'links');
                const ids = data.links.map((row) => row.id);
                assert.deepEqual(ids, [CREW]);
            });

            await t.test('a mention of a hidden record reads "a record"', async () => {
                const data = page(await read(m1), 'mention');
                const place = data.records.find((row) => row.id === P);
                const caption = place?.images?.[0]?.caption ?? '';
                assert.equal(caption.includes('a record'), true);
                assert.equal(caption.includes('ZREF_label'), false);
                const mentions = JSON.stringify(data.journal.map((row) => row.mentions));
                assert.equal(mentions.includes(H), false);
                assert.equal(mentions.includes(RP), false);
            });

            await t.test('a member reads a players image and not a referee one', async () => {
                const ok = await fetch(`${universe}/objects/${HASH_A}`, { headers: { cookie: m1 } });
                assert.equal(ok.status, 200);
                assert.equal(ok.headers.get('cache-control'), 'private, immutable');
                const hidden = await jsonFetch(`${universe}/objects/${HASH_B}`, { headers: { cookie: m1 } });
                const random = await jsonFetch(`${universe}/objects/${'cd'.repeat(32)}`, { headers: { cookie: m1 } });
                assert.equal(hidden.status, 404);
                assert.deepEqual(hidden.body, random.body);
                const put = await jsonFetch(`${universe}/objects/${HASH_A}`, { method: 'PUT', headers: { cookie: m1 }, body: tinyWebp(1) });
                stranger(put, 'member put');
            });

            await t.test('a record made players then referee leaves the open tab', async () => {
                const before = await ownerSeq();
                await ownerChange({ records: [record(P, {
                    name: 'ZPLAY_place',
                    visibility: 'referee',
                    baseRev: 1,
                    images: [image(HASH_A, `See [[${H}|ZREF_label]]`)],
                })] });
                const res = await read(m1, `after=${before}&limit=1000`);
                const data = page(res, 'hide place');
                assert.equal((data.visible?.records ?? []).includes(P), false);
                assert.equal(data.records.some((row) => row.id === P), false);
            });

            await t.test('a deleted players record leaves the poll', async () => {
                const before = await ownerSeq();
                await ownerChange({ records: [{ id: PP, baseRev: 1, deleted: true }] });
                const data = page(await read(m1, `after=${before}&limit=1000`), 'delete person');
                assert.equal((data.visible?.records ?? []).includes(PP), false);
                assert.equal((data.visible?.links ?? []).includes(CREW), false);
                assert.equal(data.records.some((row) => row.id === PP), false);
                assert.equal(data.links.some((row) => row.id === CREW), false);
                assert.equal(JSON.stringify(data).includes('"deleted":true'), false);
            });

            await t.test('a hidden record created after the member seq sends nothing', async () => {
                const before = page(await read(m1), 'before hidden create');
                const beforeVisible = JSON.stringify(before.visible ?? null);
                const seq = await ownerSeq();
                const hiddenId = rid(50);
                await ownerChange({ records: [record(hiddenId, { name: 'ZREF_later', visibility: 'referee' })] });
                const data = page(await read(m1, `after=${seq}&limit=1000`), 'hidden create');
                assert.deepEqual(data.records, []);
                assert.equal(JSON.stringify(data.visible ?? null), beforeVisible);
                assert.ok(data.visible, 'visible is present when seq moved');
                assert.ok(data.seq > seq);
            });

            await t.test('a stale write against an entry the member cannot see returns no row', async () => {
                const seq = await ownerSeq();
                for (const journal of [
                    [entry(S, { baseRev: 0, author: 'players', visibility: 'players', kind: 'note', sequence: null, title: 'no' })],
                    [entry(S, { baseRev: 1, author: 'players', visibility: 'players', kind: 'note', sequence: null, title: 'no' })],
                    [{ id: S, baseRev: 1, deleted: true }],
                ]) {
                    const res = await change({ journal }, m1);
                    denied(res, 'hidden journal write');
                }
                assert.equal(await ownerSeq(), seq);
            });

            await t.test('a member can write only their own players note', async () => {
                const seq = await ownerSeq();
                const note = playerNote(jid(20));
                const attempts = [
                    { records: [record(rid(60), { name: 'ZPLAY_no', visibility: 'players' })] },
                    { links: [link(lid(20), PP, V, { kind: 'crew' })] },
                    { settings: { party: { vesselIds: [], aboard: {}, memberIds: [], anchor: null }, kinds: {}, calendar: { dateFormat: 'imperial' }, rev: 0, baseRev: 0 } },
                    { clock: { days: 11, baseRev: 0 } },
                    { journal: [entry(jid(21), { kind: 'session', sequence: 2, title: 'no' })] },
                    { journal: [entry(jid(22), { kind: 'handout', visibility: 'players', author: 'players' })] },
                    { journal: [entry(jid(23), { kind: 'rumor', visibility: 'players', author: 'players' })] },
                    { journal: [playerNote(jid(24), { author: 'referee' })] },
                    { journal: [playerNote(jid(25), { visibility: 'referee' })] },
                    { journal: [playerNote(jid(26), { visibility: 'public' })] },
                    { journal: [playerNote(jid(27), { images: [image(HASH_A)] })] },
                    { records: [record(rid(61), { name: 'ZPLAY_two', visibility: 'players' })], journal: [note] },
                ];
                for (const body of attempts) {
                    denied(await change(body, m1), 'member write');
                }
                const hiddenAnchor = await change({ journal: [playerNote(jid(28), { anchor: { kind: 'record', id: H } })] }, m1);
                invalid(hiddenAnchor, 'hidden anchor');
                assert.equal(await ownerSeq(), seq);
            });

            await t.test('a member cannot edit or delete another member note', async () => {
                const created = applied(await change({ journal: [playerNote(jid(30))] }, m1), 'own note');
                assert.equal(created.applied[0].rev, 1);
                denied(await change({ journal: [playerNote(jid(30), { baseRev: 1, title: 'ZPLAY_edit' })] }, m2), 'other update');
                denied(await change({ journal: [{ id: jid(30), baseRev: 1, deleted: true }] }, m2), 'other delete');
                applied(await change({ journal: [{ id: jid(30), baseRev: 1, deleted: true }] }, owner), 'owner delete');
            });

            await t.test("a member's note round-trips with their name", async () => {
                applied(await change({ journal: [playerNote(jid(31))] }, m1), 'round trip');
                const mine = page(await read(m1), 'author self');
                const note = mine.journal.find((row) => row.id === jid(31));
                assert.equal(note?.rev, 1);
                assert.equal(note?.authorName, 'plm1');
                const theirs = page(await read(m2), 'author other');
                const seen = theirs.journal.find((row) => row.id === jid(31));
                assert.equal(Object.hasOwn(seen, 'rev'), false);
                assert.equal(seen?.authorName, 'plm1');
                const owners = page(await read(owner), 'author owner');
                const owned = owners.journal.find((row) => row.id === jid(31));
                assert.equal(owned?.author, 'players');
                assert.equal(Object.hasOwn(owned, 'author_id'), false);
                assert.equal(owned?.authorName, 'plm1');
            });

            await t.test('a note anchored to a hidden record is refused like a missing one', async () => {
                const missing = rid(70);
                const hidden = await change({ journal: [playerNote(jid(32), { anchor: { kind: 'record', id: H } })] }, m1);
                const absent = await change({ journal: [playerNote(jid(33), { anchor: { kind: 'record', id: missing } })] }, m1);
                invalid(hidden, 'hidden anchor');
                invalid(absent, 'missing anchor');
                assert.equal(hidden.text, absent.text);
            });

            await t.test('a note anchored to a system hex is accepted', async () => {
                const idNote = jid(34);
                applied(await change({
                    journal: [playerNote(idNote, { anchor: { kind: 'system', hexKey: HEX } })],
                }, m1), 'system anchor');
                const data = page(await read(m1), 'system anchor read');
                const note = data.journal.find((row) => row.id === idNote);
                assert.deepEqual(note?.anchor, { kind: 'system', hexKey: HEX });
            });

            await t.test('an image hidden with its record stops at once', async () => {
                const data = page(await read(m1), 'hidden image');
                assert.equal(JSON.stringify(data).includes(HASH_A), false);
                const res = await jsonFetch(`${universe}/objects/${HASH_A}`, { headers: { cookie: m1 } });
                const random = await jsonFetch(`${universe}/objects/${'cd'.repeat(32)}`, { headers: { cookie: m1 } });
                assert.equal(res.status, 404);
                assert.deepEqual(res.body, random.body);
            });

            await t.test('owner routes answer a member as a stranger', async () => {
                const paths = [
                    ['GET', `${universe}/campaign/export`],
                    ['GET', `${universe}/hexes`],
                    ['POST', `${universe}/generate`],
                    ['GET', `${universe}/install/preview`],
                    ['PATCH', `${universe}/public-games`],
                    ['PUT', `${universe}/objects/${HASH_A}`],
                    ['GET', `${universe}/sectors`],
                    ['GET', `${universe}/jobs/x`],
                ];
                for (const [method, url] of paths) {
                    const asMember = await jsonFetch(url, { method, headers: { cookie: m1, 'content-type': 'application/json' }, body: method === 'GET' ? undefined : '{}' });
                    const asOther = await jsonFetch(url, { method, headers: { cookie: other, 'content-type': 'application/json' }, body: method === 'GET' ? undefined : '{}' });
                    stranger(asMember, url);
                    assert.equal(asMember.text, asOther.text, url);
                }
            });

            await t.test('a non-member on a member route gets 404', async () => {
                const missing = await jsonFetch(`${base}/api/universes/missing/campaign?after=0&limit=1000`, { headers: { cookie: other } });
                const campaign = await jsonFetch(`${universe}/campaign?after=0&limit=1000`, { headers: { cookie: other } });
                const me = await jsonFetch(`${universe}/players/me`, {
                    method: 'PATCH',
                    headers: { cookie: other, 'content-type': 'application/json' },
                    body: JSON.stringify({ personId: null }),
                });
                const missingMe = await jsonFetch(`${base}/api/universes/missing/players/me`, {
                    method: 'PATCH',
                    headers: { cookie: other, 'content-type': 'application/json' },
                    body: JSON.stringify({ personId: null }),
                });
                stranger(campaign, 'non-member campaign');
                stranger(me, 'non-member me');
                assert.equal(campaign.text, missing.text);
                assert.equal(me.text, missingMe.text);
            });

            await t.test('an archived member is refused at once', async () => {
                const campaign = await read(m3);
                assert.equal(campaign.status, 403);
                assert.equal(campaign.body?.error?.code, 'not_a_member');
                const write = await change({ journal: [playerNote(jid(40))] }, m3);
                assert.equal(write.status, 403);
                assert.equal(write.body?.error?.code, 'not_a_member');
                const playing = await jsonFetch(`${base}/api/me/playing`, { headers: { cookie: m3 } });
                pageList(playing);
                assert.equal(playing.body.data.items.some((row) => row.id === id), false);
                const list = await jsonFetch(`${universe}/players`, { headers: { cookie: owner } });
                assert.equal(list.body?.ok, true, 'players list');
                const archived = list.body.data.archived.find((row) => row.userId === 'pl-m3');
                assert.equal(archived?.handle, 'plm3');
                assert.equal(archived?.status, 'archived');
            });

            function pageList(res) {
                assert.equal(res.body?.ok, true, 'expected { ok: true, data } for the playing list');
                assert.ok(Array.isArray(res.body.data.items), 'playing items');
            }

            await t.test('a revoked link cannot be claimed and a new one can', async () => {
                const made = await jsonFetch(`${universe}/players/invite`, { method: 'POST', headers: { cookie: owner } });
                assert.equal(made.body?.ok, true, 'invite');
                const token = made.body.data.url.split('/join/')[1];
                const revoked = await jsonFetch(`${universe}/players/invite`, { method: 'DELETE', headers: { cookie: owner } });
                assert.deepEqual(revoked.body?.data, { revoked: true });
                const oldClaim = await jsonFetch(`${base}/api/join`, {
                    method: 'POST',
                    headers: { cookie: other, 'content-type': 'application/json' },
                    body: JSON.stringify({ token }),
                });
                assert.equal(oldClaim.status, 400);
                assert.equal(oldClaim.body?.error?.code, 'invite_revoked');
                const again = await jsonFetch(`${universe}/players/invite`, { method: 'POST', headers: { cookie: owner } });
                const next = again.body.data.url.split('/join/')[1];
                const claimed = await jsonFetch(`${base}/api/join`, {
                    method: 'POST',
                    headers: { cookie: m1, 'content-type': 'application/json' },
                    body: JSON.stringify({ token: next }),
                });
                assert.equal(claimed.status, 200);
                assert.equal(claimed.body?.data?.universeId, id);
                const still = await jsonFetch(`${base}/api/join`, {
                    method: 'POST',
                    headers: { cookie: other, 'content-type': 'application/json' },
                    body: JSON.stringify({ token }),
                });
                assert.equal(still.body?.error?.code, 'invite_revoked');
            });

            await t.test('an expired link cannot be claimed', async () => {
                trySql(persistTo, `UPDATE universe_invites SET expires_at = '2000-01-01T00:00:00.000Z' WHERE universe_id = '${id}' AND revoked_at IS NULL;`);
                const preview = await jsonFetch(`${universe}/players/invite`, { method: 'POST', headers: { cookie: owner } });
                const token = preview.body?.data?.url?.split('/join/')[1] ?? 'missing-token';
                trySql(persistTo, `UPDATE universe_invites SET expires_at = '2000-01-01T00:00:00.000Z' WHERE universe_id = '${id}';`);
                const claim = await jsonFetch(`${base}/api/join`, {
                    method: 'POST',
                    headers: { cookie: full, 'content-type': 'application/json' },
                    body: JSON.stringify({ token }),
                });
                assert.equal(claim.status, 400);
                assert.equal(claim.body?.error?.code, 'invite_expired');
            });

            await t.test('the owner cannot claim their own link', async () => {
                const made = await jsonFetch(`${universe}/players/invite`, { method: 'POST', headers: { cookie: owner } });
                const token = made.body?.data?.url?.split('/join/')[1] ?? 'missing-token';
                const claim = await jsonFetch(`${base}/api/join`, {
                    method: 'POST',
                    headers: { cookie: owner, 'content-type': 'application/json' },
                    body: JSON.stringify({ token }),
                });
                assert.equal(claim.status, 403);
                assert.equal(claim.body?.error?.code, 'forbidden');
            });

            await t.test('the 256th active member is refused', async () => {
                const made = await jsonFetch(`${universe}/players/invite`, { method: 'POST', headers: { cookie: owner } });
                assert.equal(made.body?.ok, true, JSON.stringify(made.body));
                liveToken = made.body.data.url.split('/join/')[1];
                const now = Date.now();
                for (let start = 0; start < 253; start += 50) {
                    const lines = [];
                    const end = Math.min(253, start + 50);
                    for (let n = start; n < end; n += 1) {
                        const userId = `pl-seat-${n}`;
                        lines.push(`INSERT INTO user (id, name, email, email_verified, created_at, updated_at, role, banned)
VALUES ('${userId}', '${userId}', '${userId}@localhost', 1, ${now}, ${now}, 'user', 0);`);
                        lines.push(`INSERT INTO universe_members (universe_id, user_id, role, person_id, status, archived_at, archived_by, created_at)
VALUES ('${id}', '${userId}', 'player', NULL, 'active', NULL, NULL, '${STAMP}');`);
                    }
                    sqlFile(persistTo, lines.join('\n'));
                }
                const seat = await jsonFetch(`${base}/api/join`, {
                    method: 'POST',
                    headers: { cookie: other, 'content-type': 'application/json' },
                    body: JSON.stringify({ token: liveToken }),
                });
                assert.equal(seat.body?.error?.code, 'campaign_full');
                assert.equal(seat.body?.error?.message, FULL_SENTENCE);
            });

            await t.test('a member the referee archived cannot rejoin by the live link', async () => {
                const claim = await jsonFetch(`${base}/api/join`, {
                    method: 'POST',
                    headers: { cookie: m3, 'content-type': 'application/json' },
                    body: JSON.stringify({ token: liveToken }),
                });
                assert.equal(claim.status, 403);
                assert.equal(claim.body?.error?.code, 'not_a_member');
                assert.equal(claim.body?.error?.details?.reason, 'archived');
                const left = await jsonFetch(`${universe}/players/pl-m2`, { method: 'DELETE', headers: { cookie: m2 } });
                assert.equal(left.body?.data?.status, 'archived');
                const back = await jsonFetch(`${base}/api/join`, {
                    method: 'POST',
                    headers: { cookie: m2, 'content-type': 'application/json' },
                    body: JSON.stringify({ token: liveToken }),
                });
                assert.equal(back.status, 200);
                assert.equal(back.body?.data?.universeId, id);
            });

            await t.test('join is rate limited', async () => {
                let last = null;
                for (let n = 0; n < 4; n += 1) {
                    last = await jsonFetch(`${base}/api/join`, {
                        method: 'POST',
                        headers: { cookie: full, 'content-type': 'application/json' },
                        body: JSON.stringify({ token: `rate-${n}` }),
                    });
                }
                assert.equal(last.status, 429);
                assert.equal(last.body?.error?.code, 'rate_limited');
                assert.equal(last.body?.error?.message, 'Too many requests.');
                assert.equal(last.headers.get('retry-after'), '10');
            });

            await t.test('client x-voyage headers are ignored', async () => {
                const plain = await read(m1);
                const forged = await jsonFetch(`${universe}/campaign?after=0&limit=1000`, {
                    headers: {
                        cookie: m1,
                        'x-voyage-member': 'pl-owner',
                        'x-voyage-user-id': 'pl-owner',
                        'x-voyage-worker': 'generate',
                    },
                });
                page(plain, 'plain read');
                page(forged, 'forged read');
                assert.equal(forged.text, plain.text);
                const write = await jsonFetch(`${universe}/campaign/changes`, {
                    method: 'PATCH',
                    headers: {
                        cookie: m1,
                        'content-type': 'application/json',
                        'x-voyage-member': 'pl-owner',
                        'x-voyage-user-id': 'pl-owner',
                        'x-voyage-worker': 'generate',
                    },
                    body: JSON.stringify({ records: [record(rid(80), { name: 'ZPLAY_forge', visibility: 'players' })] }),
                });
                denied(write, 'forged record write');
            });

            await t.test("a member cannot spend the referee's budget", async () => {
                let last = null;
                for (let n = 0; n < 11; n += 1) {
                    last = await change({ journal: [playerNote(jid(100 + n))] }, m1);
                }
                assert.equal(last.status, 429);
                assert.equal(last.body?.error?.code, 'rate_limited');
                const ownerWrite = await change({ journal: [entry(jid(200), { title: 'ZREF_after', visibility: 'referee' })] });
                applied(ownerWrite, 'owner still writes');
            });

            await t.test('campaign reads are not cacheable', async () => {
                const ownerRead = await read(owner);
                const memberRead = await read(m1);
                const players = await jsonFetch(`${universe}/players`, { headers: { cookie: owner } });
                const playing = await jsonFetch(`${base}/api/me/playing`, { headers: { cookie: m1 } });
                for (const res of [ownerRead, memberRead, players, playing]) {
                    assert.equal(res.headers.get('cache-control'), 'private, no-store');
                }
            });

            await t.test('only own notes carry rev', async () => {
                const data = page(await read(m1), 'rev');
                const mine = data.journal.find((row) => row.id === jid(31));
                assert.equal(typeof mine?.rev, 'number');
                const ref = data.journal.find((row) => row.id === N0);
                const pub = data.journal.find((row) => row.id === PUB);
                assert.equal(Object.hasOwn(ref ?? {}, 'rev'), false);
                assert.equal(Object.hasOwn(pub ?? {}, 'rev'), false);
                for (const row of [...data.records, ...data.links]) assert.equal(Object.hasOwn(row, 'rev'), false);
                assert.equal(Object.hasOwn(data.settings ?? {}, 'rev'), false);
                assert.equal(data.clock == null || Object.hasOwn(data.clock, 'rev'), false);
                assert.equal(JSON.stringify(data).includes('provenance'), false);
            });

            await t.test('a member read across pages keeps links whose ends came earlier', async () => {
                const made = await jsonFetch(`${base}/api/universes`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ name: 'Players pages', truthVersion: null, editionDefault: 'MgT2E' }),
                });
                assert.equal(made.status, 201, JSON.stringify(made.body));
                const wide = `${base}/api/universes/${made.body.data.id}`;
                const batch = [];
                batch.push(record(P, { name: 'ZPLAY_place', visibility: 'players', images: [image(HASH_A, `At [[${P}|ZPLAY_place]]`)] }));
                batch.push(record(V, { type: 'vessel', name: 'ZPLAY_ship', visibility: 'players' }));
                batch.push(record(PP, { type: 'person', name: 'ZPLAY_person', visibility: 'players' }));
                for (let n = 1000; n < 1998; n += 1) {
                    batch.push(record(rid(n), { name: `Pad ${n}`, visibility: 'players' }));
                }
                for (let offset = 0; offset < batch.length; offset += 200) {
                    const slice = await jsonFetch(`${wide}/campaign/changes`, {
                        method: 'PATCH',
                        headers,
                        body: JSON.stringify({ records: batch.slice(offset, offset + 200) }),
                    });
                    assert.equal(slice.status, 200, JSON.stringify(slice.body));
                }
                const linked = await jsonFetch(`${wide}/campaign/changes`, {
                    method: 'PATCH',
                    headers,
                    body: JSON.stringify({ links: [link(CREW, PP, V, { kind: 'crew' })] }),
                });
                assert.equal(linked.status, 200, JSON.stringify(linked.body));
                const wideInvite = await jsonFetch(`${wide}/players/invite`, { method: 'POST', headers: { cookie: owner } });
                assert.equal(wideInvite.body?.ok, true, JSON.stringify(wideInvite.body));
                const wideJoin = await jsonFetch(`${base}/api/join`, {
                    method: 'POST',
                    headers: { cookie: m1, 'content-type': 'application/json' },
                    body: JSON.stringify({ token: wideInvite.body.data.url.split('/join/')[1] }),
                });
                assert.equal(wideJoin.status, 200, JSON.stringify(wideJoin.body));
                const res = await jsonFetch(`${wide}/campaign?after=0&limit=1000`, { headers: { cookie: m1 } });
                const data = page(res, 'paged read');
                assert.equal(data.links.some((row) => row.id === CREW), true);
                const place = data.records.find((row) => row.id === P);
                assert.equal(place?.images?.[0]?.caption?.includes('ZPLAY_place'), true);
                assert.equal(place?.images?.[0]?.caption?.includes('a record'), false);
            });

            await t.test('member mutations check Origin', async () => {
                const evil = { origin: 'https://evil.example', cookie: m1, 'content-type': 'application/json' };
                const write = await jsonFetch(`${universe}/campaign/changes`, {
                    method: 'PATCH',
                    headers: evil,
                    body: JSON.stringify({ journal: [playerNote(jid(40))] }),
                });
                assert.equal(write.status, 403);
                assert.equal(write.body?.error?.code, 'forbidden');
                assert.equal(write.body?.error?.message, ORIGIN_SENTENCE);
                const join = await jsonFetch(`${base}/api/join`, {
                    method: 'POST',
                    headers: { ...evil, cookie: other },
                    body: JSON.stringify({ token: 'live-token' }),
                });
                assert.equal(join.body?.error?.message, ORIGIN_SENTENCE);
                const me = await jsonFetch(`${universe}/players/me`, {
                    method: 'PATCH',
                    headers: evil,
                    body: JSON.stringify({ personId: null }),
                });
                assert.equal(me.body?.error?.message, ORIGIN_SENTENCE);
                const gone = await jsonFetch(`${universe}/players/pl-m1`, { method: 'DELETE', headers: evil });
                assert.equal(gone.body?.error?.message, ORIGIN_SENTENCE);
            });

            await t.test('playing carries what the map needs and nothing else', async () => {
                const playing = await jsonFetch(`${base}/api/me/playing`, { headers: { cookie: m1 } });
                assert.equal(playing.body?.ok, true, 'playing list');
                const item = playing.body.data.items.find((row) => row.id === id);
                assert.deepEqual(Object.keys(item).sort(), ['id', 'name', 'ownerHandle', 'truthVersion']);
                assert.equal(item.ownerHandle, 'plowner');
                const removed = await jsonFetch(`${universe}`, { method: 'DELETE', headers: { cookie: owner } });
                assert.equal(removed.status, 200, JSON.stringify(removed.body));
                const after = await jsonFetch(`${base}/api/me/playing`, { headers: { cookie: m1 } });
                assert.equal(after.body.data.items.some((row) => row.id === id), false);
                const gone = await read(m1);
                stranger(gone, 'deleted universe');
            });
        } finally {
            stopDev(child?.pid);
        }
    });
}
