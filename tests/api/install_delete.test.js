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
    test('remove an import', { skip: 'set RUN_API_TESTS=1' }, () => {});
} else if (!existsSync(wranglerBin)) {
    test('remove an import', { skip: 'wrangler is absent' }, () => {});
} else {
    test('remove an import: a plain delete, edited rows too; one import per package', { timeout: 400000 }, async () => {
        const persistTo = mkdtempSync(path.join(tmpdir(), 'voyage-remove-'));
        const port = 18879;
        const base = `http://127.0.0.1:${port}`;
        let child = null;
        try {
            runWrangler(['d1', 'migrations', 'apply', 'voyage', '--local', '--persist-to', persistTo]);
            const stamp = randomBytes(4).toString('hex');
            const version = `rmv${stamp}`;
            const author = userCookie(`rma${stamp}`, `rma${stamp}@localhost`, persistTo);
            const reader = userCookie(`rmb${stamp}`, `rmb${stamp}@localhost`, persistTo);
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
            r2Put(persistTo, `truth/${version}/sectors/Chart/index.json`, JSON.stringify({ hexes: { 1910: chartEntry } }));
            r2Put(persistTo, `objects/${chartHash}`, chartBody);
            child = startDev({ port, persistTo, inspectorPort: 19879 });
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
            const hexAt = (universeId, key) => {
                const [sector, local] = key.split('/');
                return jsonFetch(`${base}/api/universes/${universeId}/hexes/${encodeURIComponent(sector)}/${local}`, { headers: { cookie: reader } });
            };
            const source = await made(aHeaders, 'Source');
            const target = await made(bHeaders, 'Target');
            await blank(aHeaders, source, 'Chart/3201');
            await blank(aHeaders, source, 'Demo/1910');
            const seeded = await jsonFetch(`${base}/api/universes/${source}/campaign/changes`, {
                method: 'PATCH', headers: aHeaders, body: JSON.stringify({ records: [record(RECORD)] }),
            });
            assert.equal(seeded.status, 200, JSON.stringify(seeded.body));
            const created = await jsonFetch(`${base}/api/packages`, {
                method: 'POST', headers: aHeaders,
                body: JSON.stringify({ title: 'Edge', kind: 'subsector', description: '', tags: [], universeId: source }),
            });
            assert.equal(created.status, 201, JSON.stringify(created.body));
            const packageId = created.body.data.id;
            const v1 = await jsonFetch(`${base}/api/packages/${packageId}/versions`, {
                method: 'POST', headers: aHeaders,
                body: JSON.stringify({ universeId: source, hexKeys: ['Chart/3201', 'Demo/1910'], recordIds: [RECORD] }),
            });
            assert.equal(v1.status, 202, JSON.stringify(v1.body));
            await settle(base, packageId, 1, author);

            // Placed one sector west: Demo/1910 lands on charted Chart/1910, Chart/3201 in a new own sector at slot (-1,0).
            const placement = { anchor: 'Demo/1910', to: 'Chart/1910' };
            const previewPath = (v, extra = '') => `${base}/api/universes/${target}/install/preview?packageId=${packageId}&version=${v}${extra}`;
            const placedQuery = `&anchor=${encodeURIComponent(placement.anchor)}&to=${encodeURIComponent(placement.to)}`;
            const chartBefore = await hexAt(target, 'Chart/1910');
            const preview = await jsonFetch(previewPath(1, placedQuery), { headers: { cookie: reader } });
            assert.equal(preview.status, 200, JSON.stringify(preview.body));
            assert.equal(preview.body.data.sectorsCreated.length, 1);
            assert.deepEqual(preview.body.data.sectorsCreated[0].slot, { x: -1, y: 0 });
            const madeId = preview.body.data.sectorsCreated[0].id;
            const outcomes = Object.fromEntries(preview.body.data.hexes.map((hex) => [hex.from, [hex.to, hex.outcome]]));
            assert.deepEqual(outcomes, { 'Demo/1910': ['Chart/1910', 'replaces chart'], 'Chart/3201': [`${madeId}/3201`, 'new'] });
            const installPath = `${base}/api/universes/${target}/install`;
            const install = (body) => jsonFetch(installPath, {
                method: 'POST', headers: bHeaders,
                body: JSON.stringify({ packageId, resolutions: {}, recordResolutions: {}, expect: { conflicts: 0 }, ...body }),
            });
            const first = await install({ version: 1, placement });
            assert.equal(first.status, 200, JSON.stringify(first.body));
            assert.equal('snapshotId' in first.body.data, false);
            const installId = first.body.data.installId;
            assert.equal((await hexAt(target, 'Chart/1910')).body.data.state, 'override');
            assert.equal((await hexAt(target, `${madeId}/3201`)).body.data.state, 'own');

            // One import per package per campaign: preview and install both refuse a second.
            const ALREADY = 'This campaign already has this package. Remove it first, or take its update.';
            const againInPlace = await jsonFetch(previewPath(1), { headers: { cookie: reader } });
            assert.equal(againInPlace.status, 409, JSON.stringify(againInPlace.body));
            assert.equal(againInPlace.body.error.message, ALREADY);
            const againPlaced = await jsonFetch(previewPath(1, `&anchor=Demo%2F1910&to=Chart%2F1909`), { headers: { cookie: reader } });
            assert.equal(againPlaced.status, 409);
            assert.equal(againPlaced.body.error.message, ALREADY);
            const secondInstall = await install({ version: 1, placement: { anchor: 'Demo/1910', to: 'Chart/1909' } });
            assert.equal(secondInstall.status, 409);
            assert.equal(secondInstall.body.error.code, 'conflict');
            assert.equal(secondInstall.body.error.message, ALREADY);

            // An update is the same row and keeps its placement: Demo/1911 follows to Chart/1911.
            await blank(aHeaders, source, 'Demo/1911');
            const v2 = await jsonFetch(`${base}/api/packages/${packageId}/versions`, {
                method: 'POST', headers: aHeaders,
                body: JSON.stringify({ universeId: source, hexKeys: ['Chart/3201', 'Demo/1910', 'Demo/1911'], recordIds: [RECORD] }),
            });
            assert.equal(v2.status, 202, JSON.stringify(v2.body));
            await settle(base, packageId, 2, author);
            const update = await jsonFetch(previewPath(2, `&installId=${installId}`), { headers: { cookie: reader } });
            assert.equal(update.status, 200, JSON.stringify(update.body));
            assert.deepEqual(update.body.data.placement, placement);
            const updated = Object.fromEntries(update.body.data.hexes.map((hex) => [hex.from, [hex.to, hex.outcome]]));
            assert.deepEqual(updated['Demo/1911'], ['Chart/1911', 'new']);
            const took = await install({ version: 2, installId, expect: { conflicts: update.body.data.conflicts } });
            assert.equal(took.status, 200, JSON.stringify(took.body));
            assert.equal(took.body.data.installId, installId);
            let list = await jsonFetch(`${base}/api/universes/${target}/installs`, { headers: { cookie: reader } });
            assert.equal(list.body.data.items.length, 1);
            assert.equal(list.body.data.items[0].version, 2);
            assert.deepEqual(list.body.data.items[0].placement, placement);
            assert.equal('removed' in list.body.data.items[0], false);

            // An imported system edited since is still part of the import.
            const present = (await hexAt(target, 'Chart/1910')).body.data;
            const edited = await jsonFetch(`${base}/api/universes/${target}/hexes/Chart/1910/remove`, {
                method: 'POST', headers: bHeaders, body: JSON.stringify({ baseRev: present.rev }),
            });
            assert.equal(edited.status, 200, JSON.stringify(edited.body));

            const removePath = (id) => `${base}/api/universes/${target}/installs/${id}`;
            const signedOut = await jsonFetch(removePath(installId), { method: 'DELETE' });
            assert.equal(signedOut.status, 401);
            const notOwner = await jsonFetch(removePath(installId), { method: 'DELETE', headers: { cookie: author } });
            assert.equal(notOwner.status, 404);
            assert.equal(notOwner.body.error.message, 'No such universe.');
            const unknown = await jsonFetch(removePath('in_missing'), { method: 'DELETE', headers: { cookie: reader } });
            assert.equal(unknown.status, 404);
            assert.equal(unknown.body.error.message, 'No such import.');

            const removed = await jsonFetch(removePath(installId), { method: 'DELETE', headers: { cookie: reader } });
            assert.equal(removed.status, 200, JSON.stringify(removed.body));
            assert.deepEqual(removed.body.data, { hexes: 3, records: 1, sectors: 1 });
            const chartBack = await hexAt(target, 'Chart/1910');
            assert.deepEqual([chartBack.status, chartBack.body], [chartBefore.status, chartBefore.body]);
            assert.equal((await hexAt(target, 'Chart/1911')).status, 404, 'an own row with no chart under it is gone');
            const sectors = await jsonFetch(`${base}/api/universes/${target}/sectors`, { headers: { cookie: reader } });
            assert.equal(sectors.body.data.items.some((item) => item.id === madeId), false, JSON.stringify(sectors.body.data));
            const campaign = await jsonFetch(`${base}/api/universes/${target}/campaign`, { headers: { cookie: reader } });
            const left = campaign.body.data.records.find((row) => row.id === RECORD);
            assert.ok(!left || left.deleted === true, JSON.stringify(left));
            list = await jsonFetch(`${base}/api/universes/${target}/installs`, { headers: { cookie: reader } });
            assert.deepEqual(list.body.data.items, []);
            const twice = await jsonFetch(removePath(installId), { method: 'DELETE', headers: { cookie: reader } });
            assert.equal(twice.status, 404);

            // Removed, it can be imported again.
            const back = await install({ version: 2, placement });
            assert.equal(back.status, 200, JSON.stringify(back.body));
        } finally {
            if (child) stopDev(child.pid);
            rmSync(persistTo, { recursive: true, force: true });
        }
    });
}