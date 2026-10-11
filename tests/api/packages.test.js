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

if (process.env.RUN_API_TESTS !== '1') {
    test('marketplace routes', { skip: 'set RUN_API_TESTS=1' }, () => {});
} else if (!existsSync(wranglerBin)) {
    test('marketplace routes', { skip: 'wrangler is absent' }, () => {});
} else {
    test('marketplace routes enforce the stub contract', { timeout: 300000 }, async () => {
        const persistTo = mkdtempSync(path.join(tmpdir(), 'voyage-packages-'));
        const port = 18874;
        const base = `http://127.0.0.1:${port}`;
        let child = null;
        try {
            runWrangler(['d1', 'migrations', 'apply', 'voyage', '--local', '--persist-to', persistTo]);
            const stamp = randomBytes(4).toString('hex');
            const version = `mkt${stamp}`;
            const owner = userCookie(`mkt${stamp}`, `mkt${stamp}@localhost`, persistTo);
            const other = userCookie(`mku${stamp}`, `mku${stamp}@localhost`, persistTo);
            const headers = { 'content-type': 'application/json', cookie: owner };
            sqlFile(persistTo, `
INSERT INTO truth_versions (version, engine_version, milieu, seed, settings, sectors, state, started_at, released_at, sectors_total, sectors_done, sectors_failed)
VALUES ('${version}', '1.1.0', 'M1105', 'TravellerMagnus', '${SETTINGS}', '[]', 'released', '${STAMP_TIME}', '${STAMP_TIME}', 0, 0, '[]');
`);
            const chartBody = '{"chart":true}';
            const chartHash = createHash('sha256').update(chartBody).digest('hex');
            const chartEntry = {
                tree: chartHash, type: 'SYSTEM_PRESENT', name: 'Charted', uwp: '', allegiance: '',
                zone: '', bases: '', tradeCodes: [], pbg: '', ix: 0, partial: null,
            };
            r2Put(persistTo, `truth/${version}/manifest.json`, '{"sectors":[]}');
            r2Put(persistTo, `truth/${version}/sectors/Chart/index.json`, JSON.stringify({ hexes: { '0101': chartEntry } }));
            r2Put(persistTo, `objects/${chartHash}`, chartBody);
            child = startDev({ port, persistTo, inspectorPort: 19874 });
            await up(base);

            for (const [method, pathName] of [
                ['GET', '/api/packages'],
                ['POST', '/api/packages'],
                ['GET', '/api/packages/pk_missing'],
                ['POST', '/api/packages/pk_missing/versions'],
                ['GET', '/api/packages/pk_missing/versions/1'],
            ]) {
                const response = await jsonFetch(`${base}${pathName}`, {
                    method,
                    headers: method === 'GET' ? {} : { 'content-type': 'application/json' },
                    body: method === 'GET' ? undefined : '{}',
                });
                assert.equal(response.status, 401, `${method} ${pathName} ${JSON.stringify(response.body)}`);
                assert.equal(response.body.error.code, 'unauthenticated');
                assert.equal(response.body.error.message, 'Sign in required.');
            }

            const bare = await jsonFetch(`${base}/api/universes`, {
                method: 'POST', headers, body: JSON.stringify({ name: 'Bare', truthVersion: null, editionDefault: 'MgT2E' }),
            });
            assert.equal(bare.status, 201, JSON.stringify(bare.body));
            const refused = await jsonFetch(`${base}/api/packages`, {
                method: 'POST', headers, body: JSON.stringify({
                    title: 'Nope', kind: 'subsector', description: '', tags: [], universeId: bare.body.data.id,
                }),
            });
            assert.equal(refused.status, 400, JSON.stringify(refused.body));
            assert.equal(refused.body.error.message, 'This universe is not on a published chart.');

            const foreignOrigin = await jsonFetch(`${base}/api/packages`, {
                method: 'POST',
                headers: { ...headers, origin: 'https://evil.example' },
                body: JSON.stringify({ title: 'Evil', kind: 'subsector', description: '', tags: [], universeId: bare.body.data.id }),
            });
            assert.equal(foreignOrigin.status, 403);
            assert.equal(foreignOrigin.body.error.message, 'Origin check failed.');

            const createdUniverse = await jsonFetch(`${base}/api/universes`, {
                method: 'POST', headers, body: JSON.stringify({ name: 'Charted map', truthVersion: version, editionDefault: 'MgT2E' }),
            });
            assert.equal(createdUniverse.status, 201, JSON.stringify(createdUniverse.body));
            const universeId = createdUniverse.body.data.id;
            const secondUniverse = await jsonFetch(`${base}/api/universes`, {
                method: 'POST',
                headers: { 'content-type': 'application/json', cookie: other },
                body: JSON.stringify({ name: 'Theirs', truthVersion: version, editionDefault: 'MgT2E' }),
            });
            assert.equal(secondUniverse.status, 201, JSON.stringify(secondUniverse.body));
            const ownSecond = await jsonFetch(`${base}/api/universes`, {
                method: 'POST', headers, body: JSON.stringify({ name: 'Other chart', truthVersion: version, editionDefault: 'MgT2E' }),
            });
            assert.equal(ownSecond.status, 201, JSON.stringify(ownSecond.body));

            const created = await jsonFetch(`${base}/api/packages`, {
                method: 'POST', headers, body: JSON.stringify({
                    title: '  Regina belt  ', kind: ' subsector ', description: 'A slice.', tags: ['belt'], universeId,
                }),
            });
            assert.equal(created.status, 201, JSON.stringify(created.body));
            assert.equal(created.body.data.title, 'Regina belt');
            assert.equal(created.body.data.kind, 'subsector');
            assert.equal(created.body.data.latestVersion, 0);
            assert.equal(created.body.data.hexCount, 0);
            assert.equal(created.body.data.truthVersion, version);
            assert.equal(created.body.data.edition, 'MgT2E');
            assert.deepEqual(created.body.data.tags, ['belt']);
            assert.match(created.body.data.id, /^pk_[0-9A-HJKMNP-TV-Z]{26}$/);
            assert.equal(created.body.data.authorHandle.length > 0, true);
            const packageId = created.body.data.id;

            const hidden = await jsonFetch(`${base}/api/packages/${packageId}`, { headers: { cookie: other } });
            assert.equal(hidden.status, 404);
            assert.equal(hidden.body.error.code, 'not_found');
            assert.equal(hidden.body.error.message, 'No such package.');
            const hiddenVersion = await jsonFetch(`${base}/api/packages/${packageId}/versions/1`, { headers: { cookie: other } });
            assert.equal(hiddenVersion.status, 404);
            assert.equal(hiddenVersion.body.error.message, 'No such package.');
            const otherList = await jsonFetch(`${base}/api/packages`, { headers: { cookie: other } });
            assert.equal(otherList.status, 200);
            assert.equal(otherList.body.data.items.some((item) => item.id === packageId), false);

            const badLimit = await jsonFetch(`${base}/api/packages?limit=nope`, { headers: { cookie: owner } });
            assert.equal(badLimit.status, 400);
            assert.equal(badLimit.body.error.message, 'Invalid limit.');
            const duplicate = await jsonFetch(`${base}/api/packages/${packageId}/versions`, {
                method: 'POST', headers, body: JSON.stringify({ universeId, hexKeys: ['Demo/1910', 'Demo/1910'], recordIds: [] }),
            });
            assert.equal(duplicate.status, 400, JSON.stringify(duplicate.body));
            assert.equal(duplicate.body.error.message, 'Invalid request.');
            assert.ok(duplicate.body.error.details.fieldErrors.hexKeys.includes('duplicate hex key'));
            const tooManyHexes = await jsonFetch(`${base}/api/packages/${packageId}/versions`, {
                method: 'POST', headers,
                body: JSON.stringify({ universeId, hexKeys: Array.from({ length: 1281 }, (_, i) => `s${i}/0101`), recordIds: [] }),
            });
            assert.equal(tooManyHexes.status, 400);
            assert.equal(tooManyHexes.body.error.code, 'too_large');
            assert.equal(tooManyHexes.body.error.message, 'A package holds at most 1280 hexes.');
            const tooManyRecords = await jsonFetch(`${base}/api/packages/${packageId}/versions`, {
                method: 'POST', headers,
                body: JSON.stringify({
                    universeId,
                    hexKeys: ['Demo/1910'],
                    recordIds: Array.from({ length: 501 }, (_, i) => `cr_${String(i).padStart(8, '0')}-1111-4111-8111-111111111111`),
                }),
            });
            assert.equal(tooManyRecords.status, 400);
            assert.equal(tooManyRecords.body.error.message, 'A package holds at most 500 records.');
            const missingHex = await jsonFetch(`${base}/api/packages/${packageId}/versions`, {
                method: 'POST', headers, body: JSON.stringify({ universeId, hexKeys: ['Demo/9999'], recordIds: [] }),
            });
            assert.equal(missingHex.status, 400, JSON.stringify(missingHex.body));
            assert.equal(missingHex.body.error.message, 'A hex is not in this universe.');
            assert.equal(missingHex.body.error.details.hexKey, 'Demo/9999');
            const missingRecord = await jsonFetch(`${base}/api/packages/${packageId}/versions`, {
                method: 'POST', headers, body: JSON.stringify({ universeId, hexKeys: ['Chart/0101'], recordIds: [MISSING_RECORD] }),
            });
            assert.equal(missingRecord.status, 400, JSON.stringify(missingRecord.body));
            assert.equal(missingRecord.body.error.message, 'No such record.');
            assert.equal(missingRecord.body.error.details.recordId, MISSING_RECORD);
            const wrongUniverse = await jsonFetch(`${base}/api/packages/${packageId}/versions`, {
                method: 'POST', headers,
                body: JSON.stringify({ universeId: ownSecond.body.data.id, hexKeys: ['Chart/0101'], recordIds: [] }),
            });
            assert.equal(wrongUniverse.status, 400);
            assert.equal(wrongUniverse.body.error.message, 'This package publishes from a different universe.');
            const foreignUniverse = await jsonFetch(`${base}/api/packages/${packageId}/versions`, {
                method: 'POST', headers,
                body: JSON.stringify({ universeId: secondUniverse.body.data.id, hexKeys: ['Chart/0101'], recordIds: [] }),
            });
            assert.equal(foreignUniverse.status, 404);
            assert.equal(foreignUniverse.body.error.message, 'No such universe.');

            const blank = await jsonFetch(`${base}/api/universes/${universeId}/hexes/Demo/1910/blank`, {
                method: 'POST', headers, body: JSON.stringify({ baseRev: 0 }),
            });
            assert.equal(blank.status, 200, JSON.stringify(blank.body));
            const treeHash = blank.body.data.treeHash;
            const made = await jsonFetch(`${base}/api/universes/${universeId}/sectors`, {
                method: 'POST', headers, body: JSON.stringify({ name: 'Far Reach', slot: { x: 4, y: 8 } }),
            });
            assert.equal(made.status, 201, JSON.stringify(made.body));
            const ownBlank = await jsonFetch(`${base}/api/universes/${universeId}/hexes/${encodeURIComponent(made.body.data.id)}/0102/blank`, {
                method: 'POST', headers, body: JSON.stringify({ baseRev: 0 }),
            });
            assert.equal(ownBlank.status, 200, JSON.stringify(ownBlank.body));
            const ownKey = `${made.body.data.id}/0102`;
            const seeded = await jsonFetch(`${base}/api/universes/${universeId}/campaign/changes`, {
                method: 'PATCH', headers, body: JSON.stringify({ records: [record(RECORD)] }),
            });
            assert.equal(seeded.status, 200, JSON.stringify(seeded.body));

            const published = await jsonFetch(`${base}/api/packages/${packageId}/versions`, {
                method: 'POST', headers,
                body: JSON.stringify({ universeId, hexKeys: ['Demo/1910', 'Chart/0101', ownKey], recordIds: [RECORD] }),
            });
            assert.equal(published.status, 202, JSON.stringify(published.body));
            assert.equal(published.body.data.version, 1);
            assert.equal(published.body.data.jobId, `${packageId}:1`);
            const settled = await untilSettled(base, packageId, 1, owner);
            assert.equal(settled.body.data.state, 'done', JSON.stringify(settled.body));
            assert.equal(settled.body.data.manifestHash.length, 64);
            assert.equal(settled.body.data.error, null);
            assert.equal(settled.body.data.hexCount, 3);
            assert.equal(settled.body.data.recordCount, 1);
            const manifestText = r2Get(persistTo, `packages/${packageId}/1/manifest.json`);
            const manifest = JSON.parse(manifestText);
            assert.equal(manifest.hexes['Demo/1910'].treeHash, treeHash);
            assert.equal(manifest.hexes['Chart/0101'].summary.name, 'Charted');
            assert.equal(manifest.hexes['Chart/0101'].treeHash, chartHash);
            assert.equal(manifest.hexes[ownKey].baseHash, null);
            assert.equal(manifest.records.count, 1);
            assert.equal(manifest.truthVersion, version);

            const again = await jsonFetch(`${base}/api/packages/${packageId}/versions`, {
                method: 'POST', headers,
                body: JSON.stringify({ universeId, hexKeys: ['Demo/1910', 'Chart/0101', ownKey], recordIds: [RECORD] }),
            });
            assert.equal(again.status, 202, JSON.stringify(again.body));
            const againSettled = await untilSettled(base, packageId, 2, owner);
            assert.equal(againSettled.body.data.state, 'done', JSON.stringify(againSettled.body));
            const secondManifest = JSON.parse(r2Get(persistTo, `packages/${packageId}/2/manifest.json`));
            assert.equal(secondManifest.hexes['Demo/1910'].treeHash, treeHash);
            assert.equal(secondManifest.records.contentHash, manifest.records.contentHash);

            const removed = await jsonFetch(`${base}/api/universes/${universeId}/hexes/Demo/1910/remove`, {
                method: 'POST', headers, body: JSON.stringify({ baseRev: blank.body.data.rev }),
            });
            assert.equal(removed.status, 200, JSON.stringify(removed.body));
            assert.equal(r2Get(persistTo, `packages/${packageId}/1/manifest.json`), manifestText);
            r2Put(persistTo, `truth/${version}/sectors/Chart/index.json`, JSON.stringify({
                hexes: { '0101': { ...chartEntry, name: 'Renamed' } },
            }));
            assert.equal(JSON.parse(r2Get(persistTo, `packages/${packageId}/1/manifest.json`)).hexes['Chart/0101'].summary.name, 'Charted');

            const deletedRecord = await jsonFetch(`${base}/api/universes/${universeId}/campaign/changes`, {
                method: 'PATCH', headers,
                body: JSON.stringify({ records: [{ id: RECORD, baseRev: seeded.body.data.applied[0].rev, deleted: true }] }),
            });
            assert.equal(deletedRecord.status, 200, JSON.stringify(deletedRecord.body));
            const tombstone = await jsonFetch(`${base}/api/packages/${packageId}/versions`, {
                method: 'POST', headers, body: JSON.stringify({ universeId, hexKeys: ['Chart/0101'], recordIds: [RECORD] }),
            });
            assert.equal(tombstone.status, 400);
            assert.equal(tombstone.body.error.message, 'No such record.');

            const capPackage = await jsonFetch(`${base}/api/packages`, {
                method: 'POST', headers, body: JSON.stringify({
                    title: 'Capped', kind: 'notes', description: '', tags: [], universeId,
                }),
            });
            assert.equal(capPackage.status, 201, JSON.stringify(capPackage.body));
            const capId = capPackage.body.data.id;
            const inserts = [];
            for (let versionNumber = 1; versionNumber <= 100; versionNumber += 1) {
                inserts.push(`('${capId}', ${versionNumber}, 'failed', 1, 0, '["Chart/0101"]', '[]', '${STAMP_TIME}')`);
            }
            sqlFile(persistTo, `INSERT INTO package_versions (package_id, version, state, hex_count, record_count, hex_keys, record_ids, created_at) VALUES ${inserts.join(', ')};`);
            const capped = await jsonFetch(`${base}/api/packages/${capId}/versions`, {
                method: 'POST', headers, body: JSON.stringify({ universeId, hexKeys: ['Chart/0101'], recordIds: [] }),
            });
            assert.equal(capped.status, 400, JSON.stringify(capped.body));
            assert.equal(capped.body.error.message, 'This package has too many versions.');

            const page = await jsonFetch(`${base}/api/packages?limit=1`, { headers: { cookie: owner } });
            assert.equal(page.status, 200, JSON.stringify(page.body));
            assert.equal(page.body.data.items.length, 1);
            assert.equal(typeof page.body.data.nextCursor, 'string');
            const rest = await jsonFetch(`${base}/api/packages?limit=1&cursor=${encodeURIComponent(page.body.data.nextCursor)}`, { headers: { cookie: owner } });
            assert.equal(rest.status, 200, JSON.stringify(rest.body));
            assert.equal(rest.body.data.items.length, 1);
            const seen = new Set([page.body.data.items[0].id, rest.body.data.items[0].id]);
            assert.equal(seen.has(packageId), true);
            assert.equal(seen.has(capId), true);
            const card = page.body.data.items.find((item) => item.id === packageId) ?? rest.body.data.items.find((item) => item.id === packageId);
            assert.equal(card.latestVersion, 2);
            assert.equal(card.hexCount, 3);
            const full = await jsonFetch(`${base}/api/packages/${packageId}`, { headers: { cookie: owner } });
            assert.equal(full.status, 200, JSON.stringify(full.body));
            assert.equal(full.body.data.description, 'A slice.');
            assert.equal(full.body.data.versions[0].version, 2);
            assert.equal(full.body.data.versions[1].version, 1);
            assert.equal(full.body.data.versions[0].state, 'done');
            const noVersion = await jsonFetch(`${base}/api/packages/${packageId}/versions/9`, { headers: { cookie: owner } });
            assert.equal(noVersion.status, 404);
            assert.equal(noVersion.body.error.message, 'No such version.');
        } finally {
            if (child) stopDev(child.pid);
            rmSync(persistTo, { recursive: true, force: true });
        }
    });
}
