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
    test('undo of an import', { skip: 'set RUN_API_TESTS=1' }, () => {});
} else if (!existsSync(wranglerBin)) {
    test('undo of an import', { skip: 'wrangler is absent' }, () => {});
} else {
    test('undo of an import: all or nothing, once, refused after later edits, own sectors go', { timeout: 400000 }, async () => {
        const persistTo = mkdtempSync(path.join(tmpdir(), 'voyage-restore-'));
        const port = 18878;
        const base = `http://127.0.0.1:${port}`;
        let child = null;
        try {
            runWrangler(['d1', 'migrations', 'apply', 'voyage', '--local', '--persist-to', persistTo]);
            const stamp = randomBytes(4).toString('hex');
            const version = `rst${stamp}`;
            const author = userCookie(`rsa${stamp}`, `rsa${stamp}@localhost`, persistTo);
            const reader = userCookie(`rsb${stamp}`, `rsb${stamp}@localhost`, persistTo);
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
            r2Put(persistTo, `truth/${version}/manifest.json`, JSON.stringify({ sectors: [{ slug: 'Chart', x: 0, y: 0 }, { slug: 'Demo', x: 1, y: 0 }] }));
            r2Put(persistTo, `truth/${version}/sectors/Chart/index.json`, JSON.stringify({ hexes: { '0101': chartEntry } }));
            r2Put(persistTo, `objects/${chartHash}`, chartBody);
            child = startDev({ port, persistTo, inspectorPort: 19878 });
            await up(base);

            const made = async (headers, name) => {
                const res = await jsonFetch(`${base}/api/universes`, { method: 'POST', headers, body: JSON.stringify({ name, truthVersion: version, editionDefault: 'MgT2E' }) });
                assert.equal(res.status, 201, JSON.stringify(res.body));
                const id = res.body.data.id;
                assert.equal((await jsonFetch(`${base}/api/universes/${id}/sectors`, { headers: { cookie: headers.cookie } })).status, 200);
                return id;
            };
            const blank = async (headers, universeId, key, baseRev = 0) => {
                const [sector, local] = key.split('/');
                const res = await jsonFetch(`${base}/api/universes/${universeId}/hexes/${encodeURIComponent(sector)}/${local}/blank`, {
                    method: 'POST', headers, body: JSON.stringify({ baseRev }),
                });
                assert.equal(res.status, 200, JSON.stringify(res.body));
                return res.body.data;
            };
            const hexRead = async (universeId, key) => {
                const [sector, local] = key.split('/');
                const res = await jsonFetch(`${base}/api/universes/${universeId}/hexes/${encodeURIComponent(sector)}/${local}`, { headers: { cookie: reader } });
                assert.equal(res.status, 200, JSON.stringify(res.body));
                return res.body.data;
            };
            const source = await made(aHeaders, 'Source');
            const target = await made(bHeaders, 'Target');
            await blank(aHeaders, source, 'Demo/1910');
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
                body: JSON.stringify({ universeId: source, hexKeys: ['Demo/1910', 'Chart/0101'], recordIds: [RECORD] }),
            });
            assert.equal(v1.status, 202, JSON.stringify(v1.body));
            await settle(base, packageId, 1, author);

            const installPath = `${base}/api/universes/${target}/install`;
            const install = async (extra = {}) => {
                const res = await jsonFetch(installPath, {
                    method: 'POST', headers: bHeaders,
                    body: JSON.stringify({ packageId, version: 1, resolutions: {}, recordResolutions: {}, expect: { conflicts: 0 }, ...extra }),
                });
                assert.equal(res.status, 200, JSON.stringify(res.body));
                return res.body.data;
            };
            const restorePath = (snapshotId) => `${base}/api/universes/${target}/snapshots/${snapshotId}/restore`;
            const restore = (snapshotId, headers = bHeaders) => jsonFetch(restorePath(snapshotId), { method: 'POST', headers, body: '{}' });
            const bytesOf = async () => {
                const file = path.join(mkdtempSync(path.join(tmpdir(), 'voyage-q-')), 'q.sql');
                writeFileSync(file, `SELECT object_bytes AS b FROM universes WHERE id = '${target}';`);
                const out = runWrangler(['d1', 'execute', 'voyage', '--local', '--persist-to', persistTo, '--json', '--file', file]);
                return JSON.parse(String(out))[0].results[0].b;
            };

            const chartPath = `${base}/api/universes/${target}/hexes/Chart/0101`;
            const chartBefore = await jsonFetch(chartPath, { headers: { cookie: reader } });
            const first = await install();
            const afterInstall = await hexRead(target, 'Demo/1910');
            assert.equal(afterInstall.state, 'override', JSON.stringify(afterInstall));
            assert.equal((await hexRead(target, 'Chart/0101')).state, 'removed');
            const charged = await bytesOf();
            assert.ok(charged > 0);

            const signedOut = await jsonFetch(restorePath(first.snapshotId), { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
            assert.equal(signedOut.status, 401);
            const notOwner = await restore(first.snapshotId, aHeaders);
            assert.equal(notOwner.status, 404);
            assert.equal(notOwner.body.error.message, 'No such universe.');
            const unknown = await restore('in_missing');
            assert.equal(unknown.status, 404);
            assert.equal(unknown.body.error.message, 'There is no such undo point.');

            // A generate job leaves an undo point too; it is not restored here.
            const job = await jsonFetch(`${base}/api/universes/${target}/generate`, {
                method: 'POST', headers: bHeaders,
                body: JSON.stringify({ hexKeys: ['Demo/0501', 'Demo/0502'], edition: 'MgT2E', generator: 'top-down' }),
            });
            assert.equal(job.status, 202, JSON.stringify(job.body));
            const wrongKind = await restore(job.body.data.jobId);
            assert.equal(wrongKind.status, 400);
            assert.equal(wrongKind.body.error.code, 'validation');
            assert.equal(wrongKind.body.error.message, 'Only an undo point made by an import can be restored here.');

            const beforeUndo = await bytesOf();
            const undone = await restore(first.snapshotId);
            assert.equal(undone.status, 200, JSON.stringify(undone.body));
            assert.deepEqual(undone.body.data, { snapshotId: first.snapshotId, hexes: 2, records: 1, sectors: 0 });
            const gone = await jsonFetch(`${base}/api/universes/${target}/hexes/Demo/1910`, { headers: { cookie: reader } });
            assert.equal(gone.status, 404, JSON.stringify(gone.body));
            assert.equal(gone.body.error.message, 'No such hex.');
            // Chart/0101 reads as it did before the import (no stored row).
            const chartBack = await jsonFetch(chartPath, { headers: { cookie: reader } });
            assert.deepEqual([chartBack.status, chartBack.body], [chartBefore.status, chartBefore.body]);
            const campaign = await jsonFetch(`${base}/api/universes/${target}/campaign`, { headers: { cookie: reader } });
            const left = campaign.body.data.records.find((row) => row.id === RECORD);
            assert.ok(!left || left.deleted === true, JSON.stringify(left));
            let list = await jsonFetch(`${base}/api/universes/${target}/installs`, { headers: { cookie: reader } });
            assert.equal(list.body.data.items.length, 1);
            assert.equal(list.body.data.items[0].removed, true);
            assert.equal(list.body.data.items[0].updateAvailable, false);
            // The generate job may still be charging; the undo itself gives nothing back.
            assert.ok(await bytesOf() >= beforeUndo, 'no quota refund (contract F13)');

            const twice = await restore(first.snapshotId);
            assert.equal(twice.status, 409);
            assert.equal(twice.body.error.code, 'conflict');
            assert.equal(twice.body.error.message, 'This import is already undone.');

            // Import again, edit one system, and the undo is refused with that hex named.
            const second = await install();
            assert.equal(second.installId, first.installId);
            list = await jsonFetch(`${base}/api/universes/${target}/installs`, { headers: { cookie: reader } });
            assert.equal(list.body.data.items[0].removed, false);
            const present = await hexRead(target, 'Demo/1910');
            const edited = await jsonFetch(`${base}/api/universes/${target}/hexes/Demo/1910/remove`, {
                method: 'POST', headers: bHeaders, body: JSON.stringify({ baseRev: present.rev }),
            });
            assert.equal(edited.status, 200, JSON.stringify(edited.body));
            const refused = await restore(second.snapshotId);
            assert.equal(refused.status, 409);
            assert.equal(refused.body.error.message, 'Some systems or records changed after the import. Undo those changes first, then try again.');
            assert.deepEqual(refused.body.error.details.hexKeys, ['Demo/1910']);
            assert.deepEqual(refused.body.error.details.recordIds, []);
            assert.equal((await hexRead(target, 'Chart/0101')).state, 'removed', 'nothing was written');

            // A placed import into empty space makes a sector; its undo takes the sector away.
            const placedTarget = await made(bHeaders, 'Placed');
            const placement = { anchor: 'Demo/1910', to: '~slot_-3_0/1910' };
            const preview = await jsonFetch(`${base}/api/universes/${placedTarget}/install/preview?packageId=${packageId}&version=1&anchor=${encodeURIComponent(placement.anchor)}&to=${encodeURIComponent(placement.to)}`, { headers: { cookie: reader } });
            assert.equal(preview.status, 200, JSON.stringify(preview.body));
            // Demo/1910 lands in slot (-3,0); Chart/0101, 50 columns west of it, lands in column 1 of slot (-4,0).
            assert.deepEqual(preview.body.data.sectorsCreated.map((plan) => plan.slot).sort((a, b) => a.x - b.x), [{ x: -4, y: 0 }, { x: -3, y: 0 }]);
            const madeId = preview.body.data.sectorsCreated.find((plan) => plan.slot.x === -3).id;
            const placed = await jsonFetch(`${base}/api/universes/${placedTarget}/install`, {
                method: 'POST', headers: bHeaders,
                body: JSON.stringify({ packageId, version: 1, placement, resolutions: {}, recordResolutions: {}, expect: { conflicts: preview.body.data.conflicts } }),
            });
            assert.equal(placed.status, 200, JSON.stringify(placed.body));
            let sectors = await jsonFetch(`${base}/api/universes/${placedTarget}/sectors`, { headers: { cookie: reader } });
            assert.ok(sectors.body.data.items.some((item) => item.id === madeId), JSON.stringify(sectors.body.data));
            const placedUndo = await jsonFetch(`${base}/api/universes/${placedTarget}/snapshots/${placed.body.data.snapshotId}/restore`, { method: 'POST', headers: bHeaders, body: '{}' });
            assert.equal(placedUndo.status, 200, JSON.stringify(placedUndo.body));
            assert.equal(placedUndo.body.data.sectors, 2);
            sectors = await jsonFetch(`${base}/api/universes/${placedTarget}/sectors`, { headers: { cookie: reader } });
            assert.equal(sectors.body.data.items.some((item) => item.id === madeId), false);
        } finally {
            if (child) stopDev(child.pid);
            rmSync(persistTo, { recursive: true, force: true });
        }
    });
}