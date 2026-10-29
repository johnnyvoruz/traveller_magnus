import assert from 'node:assert/strict';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { runWrangler } from './session.js';
import { startDev, stopDev, wranglerBin } from './server.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const RECORD = 'cr_11111111-1111-4111-8111-111111111111';
const MISSING_RECORD = 'cr_22222222-2222-4222-8222-222222222222';
const STAMP_TIME = '2026-10-11T00:00:00.000Z';
const SETTINGS = JSON.stringify({
    generationPopMax: 20,
    generationPopMod: 0,
    generationTlMax: 20,
    generationTlMod: 0,
    generationUseRealisticStellar: false,
    generationUseTlFloor: false,
    generationRttSettlement: 2,
    generationRttTL: 15,
    generationStarportMax: 'A',
    generationStarportMod: 0,
    generationNoTravelZones: false,
    generationPopCheckFrequency: 100,
});

function authSecret() {
    const text = readFileSync(path.join(root, 'apps/api/.dev.vars'), 'utf8');
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
    const file = path.join(mkdtempSync(path.join(tmpdir(), 'voyage-user-')), 'user.sql');
    writeFileSync(file, `
INSERT INTO user (id, name, email, email_verified, created_at, updated_at, role, banned)
VALUES ('${userId}', '${userId}', '${email}', 1, ${now}, ${now}, 'user', 0);
INSERT INTO session (id, expires_at, token, created_at, updated_at, user_id)
VALUES ('${sessionId}', ${expires}, '${token}', ${now}, ${now}, '${userId}');
`);
    runWrangler(['d1', 'execute', 'voyage', '--local', '--persist-to', persistTo, '--file', file]);
    const signature = createHmac('sha256', authSecret()).update(token).digest('base64');
    return `__Secure-better-auth.session_token=${encodeURIComponent(`${token}.${signature}`)}`;
}

function sqlFile(persistTo, sql) {
    const file = path.join(mkdtempSync(path.join(tmpdir(), 'voyage-sql-')), 'query.sql');
    writeFileSync(file, sql);
    runWrangler(['d1', 'execute', 'voyage', '--local', '--persist-to', persistTo, '--file', file]);
}

function r2Put(persistTo, key, text) {
    const file = path.join(mkdtempSync(path.join(tmpdir(), 'voyage-r2-')), 'body');
    writeFileSync(file, text);
    runWrangler(['r2', 'object', 'put', `voyage-public/${key}`, '--file', file, '--local', '--persist-to', persistTo]);
}

function r2Get(persistTo, key) {
    const file = path.join(mkdtempSync(path.join(tmpdir(), 'voyage-r2-')), 'out');
    runWrangler(['r2', 'object', 'get', `voyage-public/${key}`, '--file', file, '--local', '--persist-to', persistTo]);
    return readFileSync(file, 'utf8');
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

function record(id) {
    return {
        id,
        type: 'place',
        kind: '',
        name: 'Startown',
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
        createdAt: STAMP_TIME,
        updatedAt: STAMP_TIME,
        deleted: false,
        baseRev: 0,
    };
}

async function untilSettled(base, packageId, version, cookie) {
    const deadline = Date.now() + 45000;
    let last = null;
    while (Date.now() < deadline) {
        last = await jsonFetch(`${base}/api/packages/${packageId}/versions/${version}`, { headers: { cookie } });
        const state = last.body?.data?.state;
        if (state === 'done' || state === 'failed') return last;
        await sleep(250);
    }
    return last;
}

async function settle(base, packageId, version, cookie) {
    const done = await untilSettled(base, packageId, version, cookie);
    assert.equal(done.body.data.state, 'done', JSON.stringify(done.body));
}


import { generateHex } from '@voyage/generation';
import { stable } from '@voyage/shared';
import enginesPackage from '../../packages/engines/package.json' with { type: 'json' };
import { DEFAULT_GENERATION_SEED, DEFAULT_GENERATION_SETTINGS } from '../../apps/api/src/universe/defaults.ts';

const NAME = 'installs through the quota reservation; catalogue family and author';
const QUOTA = 250 * 1024 * 1024;
const FULL = 'This universe is out of space.';

function treeSize(hexKey) {
    return Buffer.byteLength(stable(generateHex({
        hexKey,
        edition: 'MgT2E',
        mode: 'top-down',
        summary: { type: 'SYSTEM_PRESENT' },
        pinned: { seed: DEFAULT_GENERATION_SEED, settings: DEFAULT_GENERATION_SETTINGS, engineVersion: enginesPackage.version },
    })));
}

function webp(size, mark) {
    const body = Buffer.alloc(size);
    body.write('RIFF', 0);
    body.writeUInt32LE(size - 8, 4);
    body.write('WEBP', 8);
    body.writeUInt32LE(mark, 12);
    return body;
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

/** The job's reservation row in this run's own state, or null when it is not written yet. */
function reservationOf(persistTo, jobId) {
    for (const file of sqliteFiles(persistTo)) {
        let db;
        try { db = new DatabaseSync(file, { readOnly: true }); } catch { continue; }
        try {
            const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'object_reservations'`).all();
            if (!tables.length) continue;
            const row = db.prepare(`SELECT bytes, expires_at AS expiresAt FROM object_reservations WHERE id = ?`).get(jobId);
            if (row) return { bytes: Number(row.bytes), expiresAt: Number(row.expiresAt) };
        } catch {
            // A locked file, or a sqlite file that is not this object.
        } finally {
            try { db.close(); } catch { /* already closed */ }
        }
    }
    return null;
}

function objectBytes(persistTo, id) {
    const out = runWrangler(['d1', 'execute', 'voyage', '--local', '--persist-to', persistTo, '--json', '--command', `SELECT object_bytes AS n FROM universes WHERE id = '${id}'`]);
    const at = out.indexOf('[');
    return Number(JSON.parse(out.slice(at))[0].results[0].n);
}

if (process.env.RUN_API_TESTS !== '1') {
    test(NAME, { skip: 'set RUN_API_TESTS=1' }, () => {});
} else if (!existsSync(wranglerBin)) {
    test(NAME, { skip: 'wrangler is absent' }, () => {});
} else {
    test(NAME, { timeout: 400000 }, async () => {
        const ownedPersist = !process.env.VOYAGE_PERSIST_TO;
        const persistTo = process.env.VOYAGE_PERSIST_TO || mkdtempSync(path.join(tmpdir(), 'voyage-install-reserve-'));
        const port = Number(process.env.VOYAGE_API_PORT || 18897);
        const inspectorPort = Number(process.env.VOYAGE_INSPECTOR_PORT || 19897);
        const base = `http://127.0.0.1:${port}`;
        let child = null;
        try {
            runWrangler(['d1', 'migrations', 'apply', 'voyage', '--local', '--persist-to', persistTo]);
            const stamp = randomBytes(4).toString('hex');
            const author = userCookie(`ira${stamp}`, `ira${stamp}@localhost`, persistTo);
            const reader = userCookie(`irb${stamp}`, `irb${stamp}@localhost`, persistTo);
            const aHeaders = { 'content-type': 'application/json', cookie: author };
            const bHeaders = { 'content-type': 'application/json', cookie: reader };
            child = startDev({ port, persistTo, inspectorPort, args: ['--var', 'GENERATE_PAUSE:20000', '--var', 'QUOTA_RESERVATION_MS:4000'] });
            await up(base);
            const made = async (headers, name) => {
                const res = await jsonFetch(`${base}/api/universes`, { method: 'POST', headers, body: JSON.stringify({ name, truthVersion: null, editionDefault: 'MgT2E' }) });
                assert.equal(res.status, 201, JSON.stringify(res.body));
                return res.body.data.id;
            };
            const generateNow = async (headers, id, hexKey) => {
                const res = await jsonFetch(`${base}/api/universes/${id}/generate`, { method: 'POST', headers, body: JSON.stringify({ hexKeys: [hexKey], edition: 'MgT2E', generator: 'top-down', roll: 0, baseRev: 0 }) });
                assert.equal(res.status, 200, JSON.stringify(res.body));
            };
            const publish = async (headers, universeId, title, kind, hexKeys, recordIds) => {
                const created = await jsonFetch(`${base}/api/packages`, { method: 'POST', headers, body: JSON.stringify({ title, kind, description: '', tags: [], universeId }) });
                assert.equal(created.status, 201, JSON.stringify(created.body));
                const id = created.body.data.id;
                const v1 = await jsonFetch(`${base}/api/packages/${id}/versions`, { method: 'POST', headers, body: JSON.stringify({ universeId, hexKeys, recordIds }) });
                assert.equal(v1.status, 202, JSON.stringify(v1.body));
                await settle(base, id, 1, headers.cookie);
                return id;
            };

            // A one-hex package from the author's universe.
            const source = await made(aHeaders, 'Source');
            await generateNow(aHeaders, source, 'blank/1910');
            const seeded = await jsonFetch(`${base}/api/universes/${source}/campaign/changes`, { method: 'PATCH', headers: aHeaders, body: JSON.stringify({ records: [record(RECORD)] }) });
            assert.equal(seeded.status, 200, JSON.stringify(seeded.body));
            const piece = await publish(aHeaders, source, 'One hex', 'subsector', ['blank/1910'], []);

            const install = (universeId) => jsonFetch(`${base}/api/universes/${universeId}/install`, {
                method: 'POST', headers: bHeaders,
                body: JSON.stringify({ packageId: piece, version: 1, resolutions: {}, recordResolutions: {}, expect: { conflicts: 0 } }),
            });

            // 1. A generate job holds the room; the install is refused, then accepted once the hold ends.
            const target = await made(bHeaders, 'Target');
            const preview = await jsonFetch(`${base}/api/universes/${target}/install/preview?packageId=${piece}&version=1`, { headers: { cookie: reader } });
            assert.equal(preview.status, 200, JSON.stringify(preview.body));
            const need = preview.body.data.bytes;
            assert.ok(need > 0, 'the install copies at least one object');
            const jobKeys = ['blank/0101', 'blank/0102', 'blank/0103'];
            const slice = jobKeys.reduce((sum, key) => sum + treeSize(key), 0);
            assert.ok(need + 64 <= slice, `the job holds more than the install needs (${need} vs ${slice})`);
            sqlFile(persistTo, `UPDATE universes SET object_bytes = ${QUOTA - slice} WHERE id = '${target}';`);
            const posted = await jsonFetch(`${base}/api/universes/${target}/generate`, { method: 'POST', headers: bHeaders, body: JSON.stringify({ hexKeys: jobKeys, edition: 'MgT2E', generator: 'top-down' }) });
            assert.equal(posted.status, 202, JSON.stringify(posted.body));
            const jobId = posted.body.data.jobId;
            let hold = null;
            const holdBy = Date.now() + 60000;
            while (Date.now() < holdBy) {
                const read = await jsonFetch(`${base}/api/universes/${target}/jobs/${jobId}`, { headers: { cookie: reader } });
                const live = read.body?.data;
                if (live?.state === 'failed') assert.fail(JSON.stringify(live));
                hold = reservationOf(persistTo, jobId);
                if (hold && hold.expiresAt > Date.now()) break;
                await sleep(30);
            }
            assert.ok(hold && hold.expiresAt > Date.now(), 'the job never reserved its objects');
            const refused = await install(target);
            assert.equal(refused.status, 400, JSON.stringify(refused.body));
            assert.equal(refused.body.error.code, 'too_large');
            assert.equal(refused.body.error.message, FULL, 'the same sentence as a full universe');
            assert.equal(objectBytes(persistTo, target), QUOTA - slice, 'a refused install charges nothing');

            while (Date.now() < hold.expiresAt + 250) await sleep(50);
            const accepted = await install(target);
            assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
            assert.equal(objectBytes(persistTo, target), QUOTA - slice + need);
            // The install released its own hold: the rest of the room fits exactly.
            const fill = webp(slice - need, 7);
            const filled = await fetch(`${base}/api/universes/${target}/objects/${createHash('sha256').update(fill).digest('hex')}`, {
                method: 'PUT', headers: { cookie: reader, 'content-type': 'image/webp' }, body: fill,
            });
            assert.equal(filled.status, 201, await filled.text());
            assert.equal(objectBytes(persistTo, target), QUOTA);

            // 2. An install alone, as before: exactly up to the cap is allowed, one byte over is not.
            const alone = await made(bHeaders, 'Alone');
            sqlFile(persistTo, `UPDATE universes SET object_bytes = ${QUOTA - need + 1} WHERE id = '${alone}';`);
            const over = await install(alone);
            assert.equal(over.status, 400, JSON.stringify(over.body));
            assert.equal(over.body.error.message, FULL);
            sqlFile(persistTo, `UPDATE universes SET object_bytes = ${QUOTA - need} WHERE id = '${alone}';`);
            const fits = await install(alone);
            assert.equal(fits.status, 200, JSON.stringify(fits.body));
            assert.equal(objectBytes(persistTo, alone), QUOTA);

            // 3. Catalogue: family= (repeatable, the store's first-match rule) and author= (a handle).
            const people = await publish(aHeaders, source, 'Crew', 'people', [], [RECORD]);
            const contactMap = await publish(aHeaders, source, 'Contact map', 'Contact map', [], [RECORD]);
            const lore = await publish(aHeaders, source, 'Lore', 'Lore', [], [RECORD]);
            const readerSource = await made(bHeaders, 'Reader source');
            const readerSeed = await jsonFetch(`${base}/api/universes/${readerSource}/campaign/changes`, { method: 'PATCH', headers: bHeaders, body: JSON.stringify({ records: [record(RECORD)] }) });
            assert.equal(readerSeed.status, 200, JSON.stringify(readerSeed.body));
            const ships = await publish(bHeaders, readerSource, 'Ships', 'Ship roster', [], [RECORD]);
            const ids = async (query) => {
                const res = await jsonFetch(`${base}/api/packages?${query}`);
                assert.equal(res.status, 200, `${query} ${JSON.stringify(res.body)}`);
                return res.body.data.items.map((item) => item.id).sort();
            };
            const sorted = (...list) => list.slice().sort();
            assert.deepEqual(await ids('family=people'), [people], 'a kind with an earlier family\'s word is not people');
            assert.deepEqual(await ids('family=map'), sorted(piece, contactMap));
            assert.deepEqual(await ids('family=people&family=other'), sorted(people, lore));
            assert.deepEqual(await ids('family=ship'), [ships]);
            const authorHandle = (await jsonFetch(`${base}/api/packages/${people}`)).body.data.authorHandle;
            const readerHandle = (await jsonFetch(`${base}/api/packages/${ships}`)).body.data.authorHandle;
            assert.ok(authorHandle && readerHandle && authorHandle !== readerHandle);
            assert.deepEqual(await ids(`author=${encodeURIComponent(readerHandle)}`), [ships]);
            assert.deepEqual(await ids(`author=${encodeURIComponent(authorHandle)}`), sorted(piece, people, contactMap, lore));
            assert.deepEqual(await ids(`author=${encodeURIComponent(authorHandle)}&family=ship`), [], 'AND across keys');
            assert.deepEqual(await ids(`author=nobody${stamp}`), []);
            assert.deepEqual(await ids('kind=people&family=people'), [people], 'kind= still works');
            const bad = await jsonFetch(`${base}/api/packages?family=dragons`);
            assert.equal(bad.status, 400);
            assert.equal(bad.body.error.message, 'That request could not be read. Try again.');
        } finally {
            if (child) stopDev(child.pid);
            await sleep(300);
            if (ownedPersist) rmSync(persistTo, { recursive: true, force: true });
        }
    });
}
