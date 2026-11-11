/**
 * A member's characters are a list. Assigning one that another member holds moves it.
 * An id outside the party is refused. While the list table is absent, the column is the list.
 */
import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { PlayerList, PlayerPeople } from '../../packages/shared/src/schemas/players.ts';
import { runWrangler } from './session.js';
import { startDev, stopDev } from './server.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ADA = 'cr_00000000-0000-4000-8000-0000000000b2';
const BEN = 'cr_00000000-0000-4000-8000-0000000000b3';
const NOW = '2026-11-07T00:00:00.000Z';
const INVALID = 'Invalid request.';

function authSecret() {
    const text = readFileSync(path.join(root, 'apps', 'api', '.dev.vars'), 'utf8');
    const line = text.split(/\r?\n/).find((item) => item.startsWith('BETTER_AUTH_SECRET='));
    if (!line) throw new Error('BETTER_AUTH_SECRET is unset');
    const value = line.slice('BETTER_AUTH_SECRET='.length).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) return value.slice(1, -1);
    return value;
}

function userCookie(userId, email, persistTo) {
    const now = Date.now();
    const expires = now + 30 * 24 * 60 * 60 * 1000;
    const token = randomBytes(32).toString('hex');
    const sessionId = `${userId}-${randomBytes(8).toString('hex')}`;
    const sql = `
INSERT INTO user (id, name, email, email_verified, created_at, updated_at, role, banned)
VALUES ('${userId}', '${userId}', '${email}', 1, ${now}, ${now}, 'user', 0);
INSERT INTO session (id, expires_at, token, created_at, updated_at, user_id)
VALUES ('${sessionId}', ${expires}, '${token}', ${now}, ${now}, '${userId}');
`;
    const dir = mkdtempSync(path.join(tmpdir(), 'voyage-user-'));
    const file = path.join(dir, 'user.sql');
    writeFileSync(file, sql);
    try {
        runWrangler(['d1', 'execute', 'voyage', '--local', '--persist-to', persistTo, '--file', file]);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
    const signature = createHmac('sha256', authSecret()).update(token).digest('base64');
    return `__Secure-better-auth.session_token=${encodeURIComponent(`${token}.${signature}`)}`;
}

function sqlFile(persistTo, name, sql) {
    const dir = mkdtempSync(path.join(tmpdir(), 'voyage-people-'));
    const file = path.join(dir, name);
    writeFileSync(file, sql);
    try {
        return runWrangler(['d1', 'execute', 'voyage', '--local', '--persist-to', persistTo, '--file', file]);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

function firstJson(text) {
    const at = text.search(/[\[{]/);
    if (at < 0) throw new Error(text);
    let depth = 0;
    let quote = false;
    let escape = false;
    for (let i = at; i < text.length; i += 1) {
        const ch = text[i];
        if (quote) {
            if (escape) escape = false;
            else if (ch === '\\') escape = true;
            else if (ch === '"') quote = false;
            continue;
        }
        if (ch === '"') quote = true;
        else if (ch === '{' || ch === '[') depth += 1;
        else if (ch === '}' || ch === ']') {
            depth -= 1;
            if (depth === 0) return JSON.parse(text.slice(at, i + 1));
        }
    }
    throw new Error(text);
}

function columnOf(persistTo, universeId, userId) {
    const text = runWrangler(['d1', 'execute', 'voyage', '--local', '--persist-to', persistTo, '--command',
        `SELECT person_id AS personId FROM universe_members WHERE universe_id = '${universeId}' AND user_id = '${userId}'`]);
    const parsed = firstJson(text);
    const table = Array.isArray(parsed) ? parsed[0] : parsed;
    const rows = table.results ?? [];
    return rows[0]?.personId ?? null;
}

async function jsonFetch(url, options) {
    const response = await fetch(url, options);
    const text = await response.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text }; }
    return { status: response.status, body };
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

function person(id, name) {
    return {
        id, type: 'person', kind: '', name, summary: '', details: '', tags: [], anchor: null, when: null,
        visibility: 'players', playerNotes: null, sheet: null, status: null, images: null,
        rev: 0, createdAt: NOW, updatedAt: NOW, deleted: false, provenance: null, baseRev: 0,
    };
}

if (process.env.RUN_API_TESTS !== '1') {
    test('a member\'s characters are a list', { skip: 'set RUN_API_TESTS=1' }, () => {});
} else {
    test('a member\'s characters are a list', { timeout: 240000 }, async () => {
        const ownedPersist = !process.env.VOYAGE_PERSIST_TO;
        const persistTo = process.env.VOYAGE_PERSIST_TO || mkdtempSync(path.join(tmpdir(), 'voyage-member-people-'));
        const port = Number(process.env.VOYAGE_API_PORT || 18964);
        const inspectorPort = Number(process.env.VOYAGE_INSPECTOR_PORT || 19964);
        const base = `http://127.0.0.1:${port}`;
        let child = null;
        try {
            runWrangler(['d1', 'migrations', 'apply', 'voyage', '--local', '--persist-to', persistTo]);
            const stamp = randomBytes(4).toString('hex');
            const adaId = `mpada${stamp}`;
            const benId = `mpben${stamp}`;
            const owner = userCookie(`mpown${stamp}`, `mpown${stamp}@localhost`, persistTo);
            const ada = userCookie(adaId, `${adaId}@localhost`, persistTo);
            const ben = userCookie(benId, `${benId}@localhost`, persistTo);
            const ownerHeaders = { 'content-type': 'application/json', cookie: owner, origin: base };
            const adaHeaders = { 'content-type': 'application/json', cookie: ada, origin: base };
            child = startDev({ port, persistTo, inspectorPort });
            await up(base);

            const created = await jsonFetch(`${base}/api/universes`, {
                method: 'POST', headers: ownerHeaders,
                body: JSON.stringify({ name: 'Character list', truthVersion: null, editionDefault: 'MgT2E' }),
            });
            assert.equal(created.status, 201, JSON.stringify(created.body));
            const id = created.body.data.id;
            const seeded = await jsonFetch(`${base}/api/universes/${id}/campaign/changes`, {
                method: 'PATCH', headers: ownerHeaders,
                body: JSON.stringify({
                    records: [person(ADA, 'Ada'), person(BEN, 'Ben')],
                    settings: {
                        party: { vesselIds: [], aboard: {}, memberIds: [ADA, BEN], anchor: null },
                        kinds: {},
                        calendar: { dateFormat: 'imperial' },
                        rev: 0,
                        baseRev: 0,
                    },
                }),
            });
            assert.equal(seeded.status, 200, JSON.stringify(seeded.body));
            const invite = await jsonFetch(`${base}/api/universes/${id}/players/invite`, { method: 'POST', headers: ownerHeaders });
            assert.equal(invite.status, 200, JSON.stringify(invite.body));
            const token = invite.body.data.url.split('/join/')[1];
            for (const headers of [adaHeaders, { 'content-type': 'application/json', cookie: ben, origin: base }]) {
                const joined = await jsonFetch(`${base}/api/join`, { method: 'POST', headers, body: JSON.stringify({ token }) });
                assert.equal(joined.status, 200, JSON.stringify(joined.body));
            }

            const listed = await jsonFetch(`${base}/api/universes/${id}/players/${adaId}`, {
                method: 'PATCH', headers: ownerHeaders, body: JSON.stringify({ personIds: [ADA, BEN] }),
            });
            assert.equal(listed.status, 200, JSON.stringify(listed.body));
            assert.equal(PlayerPeople.safeParse(listed.body.data).success, true, JSON.stringify(listed.body));
            assert.deepEqual(listed.body.data, { personId: ADA, personIds: [ADA, BEN], moved: [] });
            assert.equal(columnOf(persistTo, id, adaId), ADA);

            const players = await jsonFetch(`${base}/api/universes/${id}/players`, { headers: { cookie: owner } });
            assert.equal(players.status, 200, JSON.stringify(players.body));
            assert.equal(PlayerList.safeParse(players.body.data).success, true, JSON.stringify(players.body));
            const adaRow = players.body.data.playing.find((row) => row.userId === adaId);
            assert.deepEqual(adaRow.personIds, [ADA, BEN]);
            assert.equal(adaRow.personId, ADA);

            const own = await jsonFetch(`${base}/api/universes/${id}/players/me`, { headers: { cookie: ada } });
            assert.deepEqual(own.body.data, { personId: ADA, personIds: [ADA, BEN] });

            const outside = await jsonFetch(`${base}/api/universes/${id}/players/${adaId}`, {
                method: 'PATCH', headers: ownerHeaders, body: JSON.stringify({ personIds: [ADA, 'cr_outside'] }),
            });
            assert.equal(outside.status, 400, JSON.stringify(outside.body));
            assert.equal(outside.body.error.message, INVALID);

            const duplicate = await jsonFetch(`${base}/api/universes/${id}/players/${adaId}`, {
                method: 'PATCH', headers: ownerHeaders, body: JSON.stringify({ personIds: [ADA, ADA] }),
            });
            assert.equal(duplicate.status, 400, JSON.stringify(duplicate.body));
            assert.equal(duplicate.body.error.message, INVALID);

            const moved = await jsonFetch(`${base}/api/universes/${id}/players/${benId}`, {
                method: 'PATCH', headers: ownerHeaders, body: JSON.stringify({ personId: ADA }),
            });
            assert.equal(moved.status, 200, JSON.stringify(moved.body));
            assert.deepEqual(moved.body.data.moved, [{ personId: ADA, fromUserId: adaId }]);
            assert.deepEqual(moved.body.data.personIds, [ADA]);
            assert.equal(columnOf(persistTo, id, benId), ADA);
            assert.equal(columnOf(persistTo, id, adaId), BEN);
            const after = await jsonFetch(`${base}/api/universes/${id}/players/me`, { headers: { cookie: ada } });
            assert.deepEqual(after.body.data, { personId: BEN, personIds: [BEN] });
        } finally {
            if (child) stopDev(child.pid);
        }

        const barePersist = mkdtempSync(path.join(tmpdir(), 'voyage-member-column-'));
        const barePort = port + 1;
        let bare = null;
        try {
            runWrangler(['d1', 'migrations', 'apply', 'voyage', '--local', '--persist-to', barePersist]);
            sqlFile(barePersist, 'drop.sql', 'DROP TABLE universe_member_people;\n');
            const stamp = randomBytes(4).toString('hex');
            const memberId = `mpcol${stamp}`;
            const owner = userCookie(`mpcow${stamp}`, `mpcow${stamp}@localhost`, barePersist);
            const member = userCookie(memberId, `${memberId}@localhost`, barePersist);
            const ownerHeaders = { 'content-type': 'application/json', cookie: owner, origin: `http://127.0.0.1:${barePort}` };
            const memberHeaders = { 'content-type': 'application/json', cookie: member, origin: `http://127.0.0.1:${barePort}` };
            bare = startDev({ port: barePort, persistTo: barePersist, inspectorPort: inspectorPort + 1 });
            const bareBase = `http://127.0.0.1:${barePort}`;
            await up(bareBase);
            const created = await jsonFetch(`${bareBase}/api/universes`, {
                method: 'POST', headers: ownerHeaders,
                body: JSON.stringify({ name: 'Column list', truthVersion: null, editionDefault: 'MgT2E' }),
            });
            assert.equal(created.status, 201, JSON.stringify(created.body));
            const id = created.body.data.id;
            const seeded = await jsonFetch(`${bareBase}/api/universes/${id}/campaign/changes`, {
                method: 'PATCH', headers: ownerHeaders,
                body: JSON.stringify({
                    records: [person(ADA, 'Ada'), person(BEN, 'Ben')],
                    settings: {
                        party: { vesselIds: [], aboard: {}, memberIds: [ADA, BEN], anchor: null },
                        kinds: {},
                        calendar: { dateFormat: 'imperial' },
                        rev: 0,
                        baseRev: 0,
                    },
                }),
            });
            assert.equal(seeded.status, 200, JSON.stringify(seeded.body));
            const invite = await jsonFetch(`${bareBase}/api/universes/${id}/players/invite`, { method: 'POST', headers: ownerHeaders });
            const token = invite.body.data.url.split('/join/')[1];
            const joined = await jsonFetch(`${bareBase}/api/join`, { method: 'POST', headers: memberHeaders, body: JSON.stringify({ token }) });
            assert.equal(joined.status, 200, JSON.stringify(joined.body));
            const one = await jsonFetch(`${bareBase}/api/universes/${id}/players/me`, {
                method: 'PATCH', headers: memberHeaders, body: JSON.stringify({ personId: ADA }),
            });
            assert.equal(one.status, 200, JSON.stringify(one.body));
            assert.deepEqual(one.body.data, { personId: ADA, personIds: [ADA], moved: [] });
            assert.equal(columnOf(barePersist, id, memberId), ADA);
            const read = await jsonFetch(`${bareBase}/api/universes/${id}/players/me`, { headers: { cookie: member } });
            assert.deepEqual(read.body.data, { personId: ADA, personIds: [ADA] });
            const many = await jsonFetch(`${bareBase}/api/universes/${id}/players/me`, {
                method: 'PATCH', headers: memberHeaders, body: JSON.stringify({ personIds: [ADA, BEN] }),
            });
            assert.equal(many.status, 400, JSON.stringify(many.body));
            assert.equal(many.body.error.message, INVALID);
            const cleared = await jsonFetch(`${bareBase}/api/universes/${id}/players/me`, {
                method: 'PATCH', headers: memberHeaders, body: JSON.stringify({ personId: null }),
            });
            assert.deepEqual(cleared.body.data, { personId: null, personIds: [], moved: [] });
            assert.equal(columnOf(barePersist, id, memberId), null);
        } finally {
            if (bare) stopDev(bare.pid);
            rmSync(barePersist, { recursive: true, force: true });
            if (ownedPersist) rmSync(persistTo, { recursive: true, force: true });
        }
    });
}
