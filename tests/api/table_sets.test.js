/**
 * Table sets on the worker (contracts/b_table_sets.md, TS4).
 * Own port and own persist. The official passenger file is the copy source.
 */
import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { removeTree, runWrangler } from './session.js';
import { startDev, stopDev, wranglerBin } from './server.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const STAMP = '2026-10-17T00:00:00.000Z';

function authSecret() {
    const text = readFileSync(path.join(root, 'apps', 'api', '.dev.vars'), 'utf8');
    const line = text.split(/\r?\n/).find((item) => item.startsWith('BETTER_AUTH_SECRET='));
    if (!line) throw new Error('BETTER_AUTH_SECRET is unset');
    const value = line.slice('BETTER_AUTH_SECRET='.length).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) return value.slice(1, -1);
    return value;
}

function sqlFile(persistTo, sql) {
    const dir = mkdtempSync(path.join(tmpdir(), 'voyage-ts4-'));
    const file = path.join(dir, 'rows.sql');
    writeFileSync(file, sql);
    try {
        runWrangler(['d1', 'execute', 'voyage', '--local', '--persist-to', persistTo, '--file', file]);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

function userCookie(userId, email, persistTo) {
    const now = Date.now();
    const expires = now + 30 * 24 * 60 * 60 * 1000;
    const token = randomBytes(32).toString('hex');
    const sessionId = `${userId}-${randomBytes(8).toString('hex')}`;
    sqlFile(persistTo, `
INSERT INTO user (id, name, email, email_verified, created_at, updated_at, role, banned)
VALUES ('${userId}', '${userId}', '${email}', 1, ${now}, ${now}, 'user', 0);
INSERT INTO session (id, expires_at, token, created_at, updated_at, user_id)
VALUES ('${sessionId}', ${expires}, '${token}', ${now}, ${now}, '${userId}');
`);
    const signature = createHmac('sha256', authSecret()).update(token).digest('base64');
    return `__Secure-better-auth.session_token=${encodeURIComponent(`${token}.${signature}`)}`;
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
    throw new Error(last || 'wrangler did not answer /api/health');
}

async function jsonFetch(url, options = {}) {
    const response = await fetch(url, options);
    const text = await response.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text }; }
    return { status: response.status, body, headers: response.headers };
}

function sqliteFiles(dir, out = []) {
    let names = [];
    try { names = readdirSync(dir); } catch { return out; }
    for (const name of names) {
        const full = path.join(dir, name);
        let info;
        try { info = statSync(full); } catch { continue; }
        if (info.isDirectory()) sqliteFiles(full, out);
        else if (name.endsWith('.sqlite')) out.push(full);
    }
    return out;
}

/** The worker refuses a new foreign id, so a pre-check choice is written on the Durable Object file. */
function plantForeignChoice(persistTo, foreignId) {
    for (const file of sqliteFiles(persistTo)) {
        let db;
        try { db = new DatabaseSync(file); } catch { continue; }
        try {
            const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'lists'`).all();
            if (!tables.length) {
                db.close();
                continue;
            }
            const row = db.prepare(`SELECT payload FROM lists WHERE kind = 'campaignSettings'`).get();
            if (!row) {
                db.close();
                continue;
            }
            const payload = JSON.parse(row.payload);
            payload.tableSets = { ...(payload.tableSets ?? {}), randomPassenger: foreignId };
            db.prepare(`UPDATE lists SET payload = ? WHERE kind = 'campaignSettings'`).run(JSON.stringify(payload));
            db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
            db.close();
            return;
        } catch (err) {
            try { db.close(); } catch { /* already closed */ }
            throw err;
        }
    }
    throw new Error('campaign settings were not in the local state.');
}

if (process.env.RUN_API_TESTS !== '1') {
    test('table sets on the worker', { skip: 'set RUN_API_TESTS=1' }, () => {});
} else if (!existsSync(wranglerBin)) {
    test('table sets on the worker', { skip: 'wrangler is absent' }, () => {});
} else {
    test('table sets on the worker', { timeout: 180000 }, async () => {
        const persistTo = path.join(root, '.tmp', 'lane-b-ts4');
        removeTree(persistTo);
        const port = 18895;
        const base = `http://127.0.0.1:${port}`;
        const stamp = randomBytes(3).toString('hex');
        const version = `ts${stamp}`;
        const ownerId = `tsa${stamp}`;
        const playerId = `tsb${stamp}`;
        const archivedId = `tsc${stamp}`;
        const strangerId = `tsd${stamp}`;
        let child;
        try {
            runWrangler(['d1', 'migrations', 'apply', 'voyage', '--local', '--persist-to', persistTo]);
            sqlFile(persistTo, `
INSERT INTO truth_versions (version, engine_version, state, started_at, released_at, sectors_total, sectors_done)
VALUES ('${version}', '1.2.0', 'released', '${STAMP}', '${STAMP}', 0, 0);
`);
            const owner = userCookie(ownerId, `${ownerId}@localhost`, persistTo);
            const player = userCookie(playerId, `${playerId}@localhost`, persistTo);
            const archived = userCookie(archivedId, `${archivedId}@localhost`, persistTo);
            const stranger = userCookie(strangerId, `${strangerId}@localhost`, persistTo);
            child = startDev({ port, persistTo, inspectorPort: 19895 });
            await up(base);
            const headers = { 'content-type': 'application/json', cookie: owner, origin: base };
            const sets = `${base}/api/table-sets`;

            const signedOut = await jsonFetch(`${sets}?kind=randomPassenger`);
            assert.equal(signedOut.status, 401);
            assert.equal(signedOut.body.error.code, 'unauthenticated');
            assert.equal(signedOut.body.error.message, 'Sign in to continue.');

            const noKind = await jsonFetch(sets, { headers: { cookie: owner } });
            assert.equal(noKind.status, 400);
            assert.equal(noKind.body.error.code, 'validation');
            assert.equal(noKind.body.error.message, 'Invalid request.');

            const badKind = await jsonFetch(`${sets}?kind=patrons`, { headers: { cookie: owner } });
            assert.equal(badKind.status, 400);
            assert.equal(badKind.body.error.message, 'Invalid request.');
            assert.equal(badKind.body.error.details.problems[0].words, 'This app has no roller for that table.');

            const blocked = await jsonFetch(sets, {
                method: 'POST',
                headers: { ...headers, origin: 'https://evil.example' },
                body: JSON.stringify({ copyOf: 'official:randomPassenger' }),
            });
            assert.equal(blocked.status, 403);
            assert.equal(blocked.body.error.code, 'forbidden');

            const created = await jsonFetch(sets, {
                method: 'POST',
                headers,
                body: JSON.stringify({ copyOf: 'official:randomPassenger', name: 'House passengers' }),
            });
            assert.equal(created.status, 201, JSON.stringify(created.body));
            const id = created.body.data.id;
            assert.match(id, /^ts_/);
            assert.equal(created.body.data.kind, 'randomPassenger');
            assert.equal(created.body.data.name, 'House passengers');
            assert.equal(created.body.data.basedOn, 'official:randomPassenger');
            assert.equal(created.body.data.rev, 1);
            assert.equal(created.body.data.set.id, id);
            assert.equal(created.body.data.set.tables.dice, 'D66');
            assert.equal(created.body.data.set.schemaVersion, 1);
            assert.equal(created.headers.get('cache-control'), 'private, no-store');

            const listed = await jsonFetch(`${sets}?kind=randomPassenger`, { headers: { cookie: owner } });
            assert.equal(listed.status, 200);
            assert.equal(listed.body.data.items.length, 1);
            assert.equal(Object.hasOwn(listed.body.data.items[0], 'tables'), false);
            assert.equal(listed.headers.get('cache-control'), 'private, no-store');

            const read = await jsonFetch(`${sets}/${id}`, { headers: { cookie: owner } });
            assert.equal(read.status, 200);
            assert.equal(read.body.data.tables.entries[0].text, 'Refugee – Political');
            assert.equal(Object.hasOwn(read.body.data, 'objectKey'), false);

            const broken = await jsonFetch(sets, {
                method: 'POST',
                headers,
                body: JSON.stringify({ kind: 'randomPassenger', name: 'Broken', tables: { dice: 'D66', entries: [] } }),
            });
            assert.equal(broken.status, 400);
            assert.equal(broken.body.error.code, 'validation');
            assert.equal(broken.body.error.message, 'Invalid request.');
            assert.ok(broken.body.error.details.problems.length > 0);

            const unknown = await jsonFetch(sets, {
                method: 'POST',
                headers,
                body: JSON.stringify({ kind: 'patrons', name: 'Patrons', tables: {} }),
            });
            assert.equal(unknown.status, 400);
            assert.equal(unknown.body.error.details.problems[0].words, 'This app has no roller for that table.');

            const huge = JSON.parse(readFileSync(path.join(root, 'rules', 'mgt2e_random_passenger.json'), 'utf8'));
            huge.entries[0].text = 'x'.repeat(300 * 1024);
            const over = await jsonFetch(sets, {
                method: 'POST',
                headers,
                body: JSON.stringify({ kind: 'randomPassenger', name: 'Huge', tables: huge }),
            });
            assert.equal(over.status, 400);
            assert.equal(over.body.error.code, 'too_large');
            assert.equal(over.body.error.message, 'A table set is at most 256 KB.');

            const otherCopy = await jsonFetch(sets, {
                method: 'POST',
                headers: { 'content-type': 'application/json', cookie: stranger, origin: base },
                body: JSON.stringify({ copyOf: id }),
            });
            assert.equal(otherCopy.status, 404);
            assert.equal(otherCopy.body.error.message, 'No such table set.');

            const copied = await jsonFetch(sets, {
                method: 'POST',
                headers,
                body: JSON.stringify({ copyOf: id }),
            });
            assert.equal(copied.status, 201, JSON.stringify(copied.body));
            assert.equal(copied.body.data.basedOn, id);
            assert.equal(copied.body.data.name, 'House passengers');
            const copyId = copied.body.data.id;

            const renamed = await jsonFetch(`${sets}/${id}`, {
                method: 'PUT',
                headers,
                body: JSON.stringify({ baseRev: 1, name: 'House revised', tables: created.body.data.set.tables }),
            });
            assert.equal(renamed.status, 200, JSON.stringify(renamed.body));
            assert.equal(renamed.body.data.rev, 2);
            assert.equal(renamed.body.data.name, 'House revised');
            assert.equal(renamed.body.data.set.name, 'House revised');

            const stale = await jsonFetch(`${sets}/${id}`, {
                method: 'PUT',
                headers,
                body: JSON.stringify({ baseRev: 1, tables: created.body.data.set.tables }),
            });
            assert.equal(stale.status, 409);
            assert.equal(stale.body.error.code, 'conflict');
            assert.equal(stale.body.error.message, 'Someone else saved this table set. Reload it and try again.');

            const kindChange = await jsonFetch(`${sets}/${id}`, {
                method: 'PUT',
                headers,
                body: JSON.stringify({ baseRev: 2, kind: 'trade', tables: created.body.data.set.tables }),
            });
            assert.equal(kindChange.status, 400);
            assert.equal(kindChange.body.error.message, 'Invalid request.');

            const universe = await jsonFetch(`${base}/api/universes`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ name: 'Table game', truthVersion: version, editionDefault: 'MgT2E' }),
            });
            assert.equal(universe.status, 201, JSON.stringify(universe.body));
            const universeId = universe.body.data.id;
            const chosen = await jsonFetch(`${base}/api/universes/${universeId}/campaign/changes`, {
                method: 'PATCH',
                headers,
                body: JSON.stringify({
                    settings: {
                        party: { vesselIds: [], aboard: {}, memberIds: [], anchor: null },
                        kinds: {},
                        calendar: { dateFormat: 'imperial' },
                        tableSets: { randomPassenger: id },
                        rev: 0,
                        baseRev: 0,
                    },
                }),
            });
            assert.equal(chosen.status, 200, JSON.stringify(chosen.body));
            assert.equal(chosen.body.data.applied[0].table, 'settings');

            const invite = await jsonFetch(`${base}/api/universes/${universeId}/players/invite`, {
                method: 'POST',
                headers,
            });
            assert.equal(invite.status, 200, JSON.stringify(invite.body));
            const token = invite.body.data.url.split('/join/')[1];
            for (const cookie of [player, archived]) {
                const joined = await jsonFetch(`${base}/api/join`, {
                    method: 'POST',
                    headers: { 'content-type': 'application/json', cookie, origin: base },
                    body: JSON.stringify({ token }),
                });
                assert.equal(joined.status, 200, JSON.stringify(joined.body));
            }
            const dropped = await jsonFetch(`${base}/api/universes/${universeId}/players/${archivedId}`, {
                method: 'DELETE',
                headers,
            });
            assert.equal(dropped.status, 200, JSON.stringify(dropped.body));

            const playerRead = await jsonFetch(`${sets}/${id}`, { headers: { cookie: player } });
            assert.equal(playerRead.status, 200, JSON.stringify(playerRead.body));
            assert.equal(playerRead.body.data.id, id);
            assert.equal(playerRead.body.data.tables.dice, 'D66');

            const foreign = await jsonFetch(sets, {
                method: 'POST',
                headers: { 'content-type': 'application/json', cookie: stranger, origin: base },
                body: JSON.stringify({ copyOf: 'official:randomPassenger', name: 'Another account' }),
            });
            assert.equal(foreign.status, 201, JSON.stringify(foreign.body));
            const foreignId = foreign.body.data.id;
            const pointed = await jsonFetch(`${base}/api/universes/${universeId}/campaign/changes`, {
                method: 'PATCH',
                headers,
                body: JSON.stringify({
                    settings: {
                        party: { vesselIds: [], aboard: {}, memberIds: [], anchor: null },
                        kinds: {},
                        calendar: { dateFormat: 'imperial' },
                        tableSets: { randomPassenger: foreignId },
                        rev: 0,
                        baseRev: chosen.body.data.applied[0].rev,
                    },
                }),
            });
            assert.equal(pointed.status, 404, JSON.stringify(pointed.body));
            assert.equal(pointed.body.error.code, 'not_found');
            assert.equal(pointed.body.error.message, 'No such table set.');
            const stillChosen = await jsonFetch(`${sets}/${id}`, { headers: { cookie: player } });
            assert.equal(stillChosen.status, 200, JSON.stringify(stillChosen.body));
            const playerForeign = await jsonFetch(`${sets}/${foreignId}`, { headers: { cookie: player } });
            const foreignMissing = await jsonFetch(`${sets}/ts_missing`, { headers: { cookie: player } });
            assert.equal(playerForeign.status, 404);
            assert.equal(JSON.stringify(playerForeign.body), JSON.stringify(foreignMissing.body));

            const tradeSet = await jsonFetch(sets, {
                method: 'POST',
                headers,
                body: JSON.stringify({ copyOf: 'official:trade', name: 'House trade' }),
            });
            assert.equal(tradeSet.status, 201, JSON.stringify(tradeSet.body));
            const wrongKind = await jsonFetch(`${base}/api/universes/${universeId}/campaign/changes`, {
                method: 'PATCH',
                headers,
                body: JSON.stringify({
                    settings: {
                        party: { vesselIds: [], aboard: {}, memberIds: [], anchor: null },
                        kinds: {},
                        calendar: { dateFormat: 'imperial' },
                        tableSets: { randomPassenger: tradeSet.body.data.id },
                        rev: 0,
                        baseRev: chosen.body.data.applied[0].rev,
                    },
                }),
            });
            assert.equal(wrongKind.status, 404, JSON.stringify(wrongKind.body));
            assert.equal(wrongKind.body.error.message, 'No such table set.');
            const dropTrade = await jsonFetch(`${sets}/${tradeSet.body.data.id}`, { method: 'DELETE', headers });
            assert.equal(dropTrade.status, 200, JSON.stringify(dropTrade.body));

            const droppedChoice = await jsonFetch(`${sets}/${id}`, { method: 'DELETE', headers });
            assert.equal(droppedChoice.status, 200, JSON.stringify(droppedChoice.body));
            const calendar = await jsonFetch(`${base}/api/universes/${universeId}/campaign/changes`, {
                method: 'PATCH',
                headers,
                body: JSON.stringify({
                    settings: {
                        party: { vesselIds: [], aboard: {}, memberIds: [], anchor: null },
                        kinds: {},
                        calendar: { dateFormat: 'long' },
                        tableSets: { randomPassenger: id },
                        rev: 0,
                        baseRev: chosen.body.data.applied[0].rev,
                    },
                }),
            });
            assert.equal(calendar.status, 200, JSON.stringify(calendar.body));
            assert.equal(calendar.body.data.applied[0].table, 'settings');
            assert.equal(calendar.body.data.conflicts.length, 0);
            const keptDeleted = await jsonFetch(`${base}/api/universes/${universeId}/campaign?after=0&limit=1`, { headers: { cookie: owner } });
            assert.equal(keptDeleted.status, 200, JSON.stringify(keptDeleted.body));
            assert.equal(keptDeleted.body.data.settings.calendar.dateFormat, 'long');
            assert.equal(keptDeleted.body.data.settings.tableSets.randomPassenger, id);

            const official = await jsonFetch(`${base}/api/universes/${universeId}/campaign/changes`, {
                method: 'PATCH',
                headers,
                body: JSON.stringify({
                    settings: {
                        party: { vesselIds: [], aboard: {}, memberIds: [], anchor: null },
                        kinds: {},
                        calendar: { dateFormat: 'long' },
                        tableSets: { randomPassenger: 'official:randomPassenger' },
                        rev: 0,
                        baseRev: calendar.body.data.applied[0].rev,
                    },
                }),
            });
            assert.equal(official.status, 200, JSON.stringify(official.body));
            assert.equal(official.body.data.applied[0].table, 'settings');

            stopDev(child.pid);
            child = null;
            await sleep(1000);
            plantForeignChoice(persistTo, foreignId);
            child = startDev({ port, persistTo, inspectorPort: 19895 });
            await up(base);
            const party = await jsonFetch(`${base}/api/universes/${universeId}/campaign/changes`, {
                method: 'PATCH',
                headers,
                body: JSON.stringify({
                    settings: {
                        party: { vesselIds: [], aboard: {}, memberIds: [], anchor: null },
                        kinds: {},
                        calendar: { dateFormat: 'long' },
                        tableSets: { randomPassenger: foreignId },
                        rev: 0,
                        baseRev: official.body.data.applied[0].rev,
                    },
                }),
            });
            assert.equal(party.status, 200, JSON.stringify(party.body));
            assert.equal(party.body.data.applied[0].table, 'settings');
            assert.equal(party.body.data.conflicts.length, 0);
            const keptForeign = await jsonFetch(`${base}/api/universes/${universeId}/campaign?after=0&limit=1`, { headers: { cookie: owner } });
            assert.equal(keptForeign.status, 200, JSON.stringify(keptForeign.body));
            assert.equal(keptForeign.body.data.settings.tableSets.randomPassenger, foreignId);

            const playerOther = await jsonFetch(`${sets}/${copyId}`, { headers: { cookie: player } });
            assert.equal(playerOther.status, 404);
            assert.equal(playerOther.body.error.message, 'No such table set.');

            const playerList = await jsonFetch(`${sets}?kind=randomPassenger`, { headers: { cookie: player } });
            assert.equal(playerList.status, 200);
            assert.equal(playerList.body.data.items.some((item) => item.id === id), false);

            const missing = await jsonFetch(`${sets}/ts_missing`, { headers: { cookie: stranger } });
            const strangerRead = await jsonFetch(`${sets}/${id}`, { headers: { cookie: stranger } });
            const archivedRead = await jsonFetch(`${sets}/${id}`, { headers: { cookie: archived } });
            assert.equal(missing.status, 404);
            assert.equal(JSON.stringify(strangerRead.body), JSON.stringify(missing.body));
            assert.equal(JSON.stringify(archivedRead.body), JSON.stringify(missing.body));

            const removed = await jsonFetch(`${sets}/${copyId}`, { method: 'DELETE', headers });
            assert.equal(removed.status, 200);
            const gone = await jsonFetch(`${sets}/${copyId}`, { headers: { cookie: owner } });
            assert.equal(gone.status, 404);
            assert.equal(JSON.stringify(gone.body), JSON.stringify(missing.body));
            const again = await jsonFetch(`${sets}/${copyId}`, { method: 'DELETE', headers });
            assert.equal(again.status, 404);

            const trade = await jsonFetch(`${sets}?kind=trade`, { headers: { cookie: owner } });
            assert.equal(trade.body.data.items.length, 0);

            // The chosen passenger set and its copy are both deleted, so no live set remains.
            let made = 0;
            while (made < 20) {
                const extra = await jsonFetch(sets, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ copyOf: 'official:trade', name: `Trade ${made}` }),
                });
                assert.equal(extra.status, 201, JSON.stringify(extra.body));
                made += 1;
            }
            const cap = await jsonFetch(sets, {
                method: 'POST',
                headers,
                body: JSON.stringify({ copyOf: 'official:trade', name: 'One too many' }),
            });
            assert.equal(cap.status, 400);
            assert.equal(cap.body.error.code, 'too_large');
            assert.equal(cap.body.error.message, 'An account holds at most 20 table sets.');
        } finally {
            stopDev(child?.pid);
            if (persistTo) removeTree(persistTo);
        }
    });
}
