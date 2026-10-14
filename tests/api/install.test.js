import assert from 'node:assert/strict';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

if (process.env.RUN_API_TESTS !== '1') {
    test('package install routes', { skip: 'set RUN_API_TESTS=1' }, () => {});
} else if (!existsSync(wranglerBin)) {
    test('package install routes', { skip: 'wrangler is absent' }, () => {});
} else {
    test('install in place: preview outcomes, conflicts, snapshot, provenance, updates, limits', { timeout: 400000 }, async () => {
        const persistTo = mkdtempSync(path.join(tmpdir(), 'voyage-install-'));
        const port = 18876;
        const base = `http://127.0.0.1:${port}`;
        let child = null;
        try {
            runWrangler(['d1', 'migrations', 'apply', 'voyage', '--local', '--persist-to', persistTo]);
            const stamp = randomBytes(4).toString('hex');
            const version = `ins${stamp}`;
            const author = userCookie(`ina${stamp}`, `ina${stamp}@localhost`, persistTo);
            const reader = userCookie(`inb${stamp}`, `inb${stamp}@localhost`, persistTo);
            const aHeaders = { 'content-type': 'application/json', cookie: author };
            const bHeaders = { 'content-type': 'application/json', cookie: reader };
            sqlFile(persistTo, `
INSERT INTO truth_versions (version, engine_version, milieu, seed, settings, sectors, state, started_at, released_at, sectors_total, sectors_done, sectors_failed)
VALUES ('${version}', '1.1.0', 'M1105', 'TravellerMagnus', '${SETTINGS}', '[]', 'released', '${STAMP_TIME}', '${STAMP_TIME}', 0, 0, '[]');
`);
            const chartBody = '{"chart":true}';
            const chartHash = createHash('sha256').update(chartBody).digest('hex');
            const chartEntry = {
                tree: chartHash, type: 'SYSTEM_PRESENT', name: 'Charted', uwp: 'A000000-0', allegiance: '',
                zone: '', bases: '', tradeCodes: [], pbg: '', ix: 0, partial: null,
            };
            r2Put(persistTo, `truth/${version}/manifest.json`, '{"sectors":[]}');
            r2Put(persistTo, `truth/${version}/sectors/Chart/index.json`, JSON.stringify({ hexes: { '0101': chartEntry, '0102': chartEntry } }));
            r2Put(persistTo, `objects/${chartHash}`, chartBody);
            child = startDev({ port, persistTo, inspectorPort: 19876 });
            await up(base);

            const made = async (headers, name, truthVersion, editionDefault = 'MgT2E') => {
                const res = await jsonFetch(`${base}/api/universes`, { method: 'POST', headers, body: JSON.stringify({ name, truthVersion, editionDefault }) });
                assert.equal(res.status, 201, JSON.stringify(res.body));
                return res.body.data.id;
            };
            const source = await made(aHeaders, 'Source', version);
            const target = await made(bHeaders, 'Target', version);
            const otherEdition = await made(bHeaders, 'Classic', version, 'CT');
            const blank = async (headers, universeId, key, baseRev = 0) => {
                const [sector, local] = key.split('/');
                const res = await jsonFetch(`${base}/api/universes/${universeId}/hexes/${encodeURIComponent(sector)}/${local}/blank`, {
                    method: 'POST', headers, body: JSON.stringify({ baseRev }),
                });
                assert.equal(res.status, 200, JSON.stringify(res.body));
                return res.body.data;
            };
            const demo = await blank(aHeaders, source, 'Demo/1910');
            const struck = await jsonFetch(`${base}/api/universes/${source}/hexes/Chart/0101/remove`, {
                method: 'POST', headers: aHeaders, body: JSON.stringify({ baseRev: 0 }),
            });
            assert.equal(struck.status, 200, JSON.stringify(struck.body));
            const seeded = await jsonFetch(`${base}/api/universes/${source}/campaign/changes`, {
                method: 'PATCH', headers: aHeaders, body: JSON.stringify({ records: [record(RECORD)] }),
            });
            assert.equal(seeded.status, 200, JSON.stringify(seeded.body));

            const created = await jsonFetch(`${base}/api/packages`, {
                method: 'POST', headers: aHeaders,
                body: JSON.stringify({ title: 'Belt', kind: 'subsector', description: '', tags: [], universeId: source }),
            });
            assert.equal(created.status, 201, JSON.stringify(created.body));
            const packageId = created.body.data.id;
            const v1 = await jsonFetch(`${base}/api/packages/${packageId}/versions`, {
                method: 'POST', headers: aHeaders,
                body: JSON.stringify({ universeId: source, hexKeys: ['Demo/1910', 'Chart/0101', 'Chart/0102'], recordIds: [RECORD] }),
            });
            assert.equal(v1.status, 202, JSON.stringify(v1.body));
            await settle(base, packageId, 1, author);

            const previewPath = (universeId, v) => `${base}/api/universes/${universeId}/install/preview?packageId=${packageId}&version=${v}`;
            const signedOut = await jsonFetch(previewPath(target, 1));
            assert.equal(signedOut.status, 401);
            assert.equal(signedOut.body.error.message, 'Sign in required.');
            const notMine = await jsonFetch(previewPath(source, 1), { headers: { cookie: reader } });
            assert.equal(notMine.status, 404);
            assert.equal(notMine.body.error.message, 'No such universe.');
            const noVersion = await jsonFetch(previewPath(target, 7), { headers: { cookie: reader } });
            assert.equal(noVersion.status, 404);
            assert.equal(noVersion.body.error.message, 'No such version.');
            const noPackage = await jsonFetch(`${base}/api/universes/${target}/install/preview?packageId=pk_missing&version=1`, { headers: { cookie: reader } });
            assert.equal(noPackage.status, 404);
            assert.equal(noPackage.body.error.message, 'No such package.');
            const badQuery = await jsonFetch(`${base}/api/universes/${target}/install/preview?packageId=${packageId}&version=x`, { headers: { cookie: reader } });
            assert.equal(badQuery.status, 400);
            assert.equal(badQuery.body.error.message, 'Invalid request.');
            const placed = await jsonFetch(`${previewPath(target, 1)}&placement=%7B%7D`, { headers: { cookie: reader } });
            assert.equal(placed.status, 400);
            const edition = await jsonFetch(previewPath(otherEdition, 1), { headers: { cookie: reader } });
            assert.equal(edition.status, 400);
            assert.equal(edition.body.error.message, 'This package is for a different edition.');

            // A referee edit under Demo/1910 (blank, then remove) makes that hex a conflict.
            const mine = await blank(bHeaders, target, 'Demo/1910');
            const removedMine = await jsonFetch(`${base}/api/universes/${target}/hexes/Demo/1910/remove`, {
                method: 'POST', headers: bHeaders, body: JSON.stringify({ baseRev: mine.rev }),
            });
            assert.equal(removedMine.status, 200, JSON.stringify(removedMine.body));
            const preview = await jsonFetch(previewPath(target, 1), { headers: { cookie: reader } });
            assert.equal(preview.status, 200, JSON.stringify(preview.body));
            const outcome = Object.fromEntries(preview.body.data.hexes.map((hex) => [hex.to, hex.outcome]));
            assert.deepEqual(outcome, { 'Demo/1910': 'conflict', 'Chart/0101': 'replaces chart', 'Chart/0102': 'already installed' });
            assert.equal(preview.body.data.conflicts, 1);
            assert.equal(preview.body.data.records.add, 1);
            assert.equal(preview.body.data.placement, null);
            assert.ok(preview.body.data.bytes > 0);

            const installPath = `${base}/api/universes/${target}/install`;
            const unresolved = await jsonFetch(installPath, {
                method: 'POST', headers: bHeaders,
                body: JSON.stringify({ packageId, version: 1, resolutions: {}, recordResolutions: {}, expect: { conflicts: 1 } }),
            });
            assert.equal(unresolved.status, 409);
            assert.equal(unresolved.body.error.message, 'Choose theirs or mine for every conflict.');
            assert.deepEqual(unresolved.body.error.details.hexKeys, ['Demo/1910']);
            const stale = await jsonFetch(installPath, {
                method: 'POST', headers: bHeaders,
                body: JSON.stringify({ packageId, version: 1, resolutions: { 'Demo/1910': 'mine' }, recordResolutions: {}, expect: { conflicts: 0 } }),
            });
            assert.equal(stale.status, 409);
            assert.equal(stale.body.error.message, 'The map changed. Preview again.');
            const foreign = await jsonFetch(installPath, {
                method: 'POST', headers: { ...bHeaders, origin: 'https://evil.example' },
                body: JSON.stringify({ packageId, version: 1, resolutions: { 'Demo/1910': 'mine' }, recordResolutions: {}, expect: { conflicts: 1 } }),
            });
            assert.equal(foreign.status, 403);

            sqlFile(persistTo, `UPDATE universes SET object_bytes = ${250 * 1024 * 1024} WHERE id = '${target}';`);
            const full = await jsonFetch(installPath, {
                method: 'POST', headers: bHeaders,
                body: JSON.stringify({ packageId, version: 1, resolutions: { 'Demo/1910': 'mine' }, recordResolutions: {}, expect: { conflicts: 1 } }),
            });
            assert.equal(full.status, 400);
            assert.equal(full.body.error.code, 'too_large');
            assert.equal(full.body.error.message, 'This universe is out of space.');
            sqlFile(persistTo, `UPDATE universes SET object_bytes = 0 WHERE id = '${target}';`);

            const installed = await jsonFetch(installPath, {
                method: 'POST', headers: bHeaders,
                body: JSON.stringify({ packageId, version: 1, resolutions: { 'Demo/1910': 'mine' }, recordResolutions: {}, expect: { conflicts: 1 } }),
            });
            assert.equal(installed.status, 200, JSON.stringify(installed.body));
            assert.equal(installed.body.data.written, 1);
            assert.equal(installed.body.data.skipped, 2);
            assert.equal(installed.body.data.records, 1);
            assert.match(installed.body.data.installId, /^in_/);

            const hexRead = async (universeId, cookie, key) => {
                const [sector, local] = key.split('/');
                return jsonFetch(`${base}/api/universes/${universeId}/hexes/${encodeURIComponent(sector)}/${local}`, { headers: { cookie } });
            };
            const chartRow = await hexRead(target, reader, 'Chart/0101');
            assert.equal(chartRow.status, 200, JSON.stringify(chartRow.body));
            assert.equal(chartRow.body.data.state, 'removed', JSON.stringify(chartRow.body));
            const kept = await hexRead(target, reader, 'Demo/1910');
            assert.equal(kept.body.data.state, 'removed', JSON.stringify(kept.body));
            const campaign = await jsonFetch(`${base}/api/universes/${target}/campaign`, { headers: { cookie: reader } });
            const copied = campaign.body.data.records.find((row) => row.id === RECORD);
            assert.ok(copied, JSON.stringify(campaign.body.data.records));
            assert.equal(copied.provenance.mode, 'copy');
            assert.equal(copied.provenance.universeId, source);

            const again = await jsonFetch(previewPath(target, 1), { headers: { cookie: reader } });
            const againOutcome = Object.fromEntries(again.body.data.hexes.map((hex) => [hex.to, hex.outcome]));
            assert.equal(againOutcome['Chart/0101'], 'already installed');
            assert.equal(again.body.data.records.replace, 1);
            assert.equal(again.body.data.bytes, 0);

            let list = await jsonFetch(`${base}/api/universes/${target}/installs`, { headers: { cookie: reader } });
            assert.equal(list.status, 200, JSON.stringify(list.body));
            assert.equal(list.body.data.items.length, 1);
            assert.equal(list.body.data.items[0].version, 1);
            assert.equal(list.body.data.items[0].updateAvailable, false);

            await blank(aHeaders, source, 'Demo/1911');
            const v2 = await jsonFetch(`${base}/api/packages/${packageId}/versions`, {
                method: 'POST', headers: aHeaders,
                body: JSON.stringify({ universeId: source, hexKeys: ['Demo/1910', 'Demo/1911', 'Chart/0101'], recordIds: [] }),
            });
            assert.equal(v2.status, 202, JSON.stringify(v2.body));
            await settle(base, packageId, 2, author);
            list = await jsonFetch(`${base}/api/universes/${target}/installs`, { headers: { cookie: reader } });
            assert.equal(list.body.data.items[0].latestVersion, 2);
            assert.equal(list.body.data.items[0].updateAvailable, true);
            const update = await jsonFetch(previewPath(target, 2), { headers: { cookie: reader } });
            const updateOutcome = Object.fromEntries(update.body.data.hexes.map((hex) => [hex.to, hex.outcome]));
            assert.equal(updateOutcome['Demo/1911'], 'new');
            assert.equal(updateOutcome['Chart/0101'], 'already installed');
            const took = await jsonFetch(installPath, {
                method: 'POST', headers: bHeaders,
                body: JSON.stringify({ packageId, version: 2, resolutions: { 'Demo/1910': 'theirs' }, recordResolutions: {}, expect: { conflicts: update.body.data.conflicts } }),
            });
            assert.equal(took.status, 200, JSON.stringify(took.body));
            assert.equal(took.body.data.installId, installed.body.data.installId);
            const theirs = await hexRead(target, reader, 'Demo/1910');
            assert.equal(theirs.body.data.treeHash, demo.treeHash);
            list = await jsonFetch(`${base}/api/universes/${target}/installs`, { headers: { cookie: reader } });
            assert.equal(list.body.data.items.length, 1);
            assert.equal(list.body.data.items[0].version, 2);
            assert.equal(list.body.data.items[0].updateAvailable, false);
            const page = await jsonFetch(`${base}/api/packages/${packageId}`);
            assert.equal(page.body.data.installs, 1);

            // Worker deployed before 0015: the install routes answer 503, the rest keep working.
            sqlFile(persistTo, `DROP TABLE package_installs;`);
            const early = await jsonFetch(`${base}/api/universes/${target}/installs`, { headers: { cookie: reader } });
            assert.equal(early.status, 503);
            assert.equal(early.body.error.message, 'The marketplace is being updated. Try again soon.');
            const stillListed = await jsonFetch(`${base}/api/packages?sort=updated`);
            assert.equal(stillListed.status, 200);
            const migration = readFileSync(path.join(root, 'apps/api/src/db/migrations/0015_marketplace.sql'), 'utf8').split('--> statement-breakpoint').join('\n');
            sqlFile(persistTo, migration);
            const back = await jsonFetch(`${base}/api/universes/${target}/installs`, { headers: { cookie: reader } });
            assert.equal(back.status, 200, JSON.stringify(back.body));
        } finally {
            if (child) stopDev(child.pid);
            rmSync(persistTo, { recursive: true, force: true });
        }
    });
}