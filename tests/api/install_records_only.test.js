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


const NAME = 'records-only packages (F18)';
const R2 = 'cr_22222222-2222-4222-8222-222222222222';
const R3 = 'cr_33333333-3333-4333-8333-333333333333';
const OWN = '~0123456789ABCDEFGHJKMNPQRS/0101';

function truthRow(persistTo, version) {
    sqlFile(persistTo, `
INSERT INTO truth_versions (version, engine_version, milieu, seed, settings, sectors, state, started_at, released_at, sectors_total, sectors_done, sectors_failed)
VALUES ('${version}', '1.1.0', 'M1105', 'TravellerMagnus', '${SETTINGS}', '[]', 'released', '${STAMP_TIME}', '${STAMP_TIME}', 0, 0, '[]');
`);
    r2Put(persistTo, `truth/${version}/manifest.json`, JSON.stringify({ sectors: [{ slug: 'Chart', x: 0, y: 0 }] }));
    r2Put(persistTo, `truth/${version}/sectors/Chart/index.json`, JSON.stringify({ hexes: {} }));
}

if (process.env.RUN_API_TESTS !== '1') {
    test(NAME, { skip: 'set RUN_API_TESTS=1' }, () => {});
} else if (!existsSync(wranglerBin)) {
    test(NAME, { skip: 'wrangler is absent' }, () => {});
} else {
    test(NAME + ': publish, preview, install in place, placement refused, anchors across truth versions', { timeout: 400000 }, async () => {
        const persistTo = mkdtempSync(path.join(tmpdir(), 'voyage-records-only-'));
        const port = 18889;
        const base = `http://127.0.0.1:${port}`;
        let child = null;
        try {
            runWrangler(['d1', 'migrations', 'apply', 'voyage', '--local', '--persist-to', persistTo]);
            const stamp = randomBytes(4).toString('hex');
            const from = `roa${stamp}`;
            const other = `rob${stamp}`;
            truthRow(persistTo, from);
            truthRow(persistTo, other);
            const author = userCookie(`roa${stamp}`, `roa${stamp}@localhost`, persistTo);
            const reader = userCookie(`rob${stamp}`, `rob${stamp}@localhost`, persistTo);
            const aHeaders = { 'content-type': 'application/json', cookie: author };
            const bHeaders = { 'content-type': 'application/json', cookie: reader };
            child = startDev({ port, persistTo, inspectorPort: 19889 });
            await up(base);
            const made = async (headers, name, truthVersion) => {
                const res = await jsonFetch(`${base}/api/universes`, { method: 'POST', headers, body: JSON.stringify({ name, truthVersion, editionDefault: 'MgT2E' }) });
                assert.equal(res.status, 201, JSON.stringify(res.body));
                return res.body.data.id;
            };
            const source = await made(aHeaders, 'Source', from);
            const seeded = await jsonFetch(`${base}/api/universes/${source}/campaign/changes`, {
                method: 'PATCH', headers: aHeaders,
                body: JSON.stringify({ records: [
                    { ...record(RECORD), name: 'At the chart', anchor: { kind: 'system', hexKey: 'Chart/1910' } },
                    { ...record(R2), name: 'In an own sector', anchor: { kind: 'system', hexKey: OWN } },
                    { ...record(R3), name: 'Nowhere', anchor: null },
                ] }),
            });
            assert.equal(seeded.status, 200, JSON.stringify(seeded.body));
            const created = await jsonFetch(`${base}/api/packages`, { method: 'POST', headers: aHeaders, body: JSON.stringify({ title: 'Three people', kind: 'people', description: '', tags: [], universeId: source }) });
            assert.equal(created.status, 201, JSON.stringify(created.body));
            const packageId = created.body.data.id;

            const empty = await jsonFetch(`${base}/api/packages/${packageId}/versions`, { method: 'POST', headers: aHeaders, body: JSON.stringify({ universeId: source, hexKeys: [], recordIds: [] }) });
            assert.equal(empty.status, 400);
            assert.equal(empty.body.error.code, 'validation');
            assert.equal(empty.body.error.message, 'A package needs at least one hex or one record.');

            const v1 = await jsonFetch(`${base}/api/packages/${packageId}/versions`, { method: 'POST', headers: aHeaders, body: JSON.stringify({ universeId: source, hexKeys: [], recordIds: [RECORD, R2, R3] }) });
            assert.equal(v1.status, 202, JSON.stringify(v1.body));
            await settle(base, packageId, 1, author);
            const manifest = JSON.parse(r2Get(persistTo, `packages/${packageId}/1/manifest.json`));
            assert.deepEqual(manifest.hexes, {});
            assert.equal(manifest.records.count, 3);
            assert.equal(manifest.truthVersion, from, 'where the records came from');
            const page = await jsonFetch(`${base}/api/packages/${packageId}`);
            assert.equal(page.body.data.hexCount, 0);
            assert.equal(page.body.data.versions[0].recordCount, 3);
            assert.equal(page.body.data.recordCount, 3, 'the page carries the record count');
            const listed = await jsonFetch(`${base}/api/packages?kind=people`);
            assert.equal(listed.status, 200, JSON.stringify(listed.body));
            const roCard = listed.body.data.items.find((item) => item.id === packageId);
            assert.equal(roCard.hexCount, 0);
            assert.equal(roCard.recordCount, 3, 'a records-only card carries its record count');
            const mineList = await jsonFetch(`${base}/api/packages?mine=1`, { headers: { cookie: author } });
            assert.equal(mineList.body.data.items.find((item) => item.id === packageId).recordCount, 3);

            // A campaign on another truth version.
            const target = await made(bHeaders, 'Target', other);
            const preview = await jsonFetch(`${base}/api/universes/${target}/install/preview?packageId=${packageId}&version=1`, { headers: { cookie: reader } });
            assert.equal(preview.status, 200, JSON.stringify(preview.body));
            assert.deepEqual(preview.body.data.hexes, []);
            assert.equal(preview.body.data.placement, null);
            assert.deepEqual(preview.body.data.records, { add: 3, replace: 0, conflicts: [], anchorsDropped: 1 });

            const placedPreview = await jsonFetch(`${base}/api/universes/${target}/install/preview?packageId=${packageId}&version=1&anchor=Chart/1910&to=Chart/1911`, { headers: { cookie: reader } });
            assert.equal(placedPreview.status, 400);
            assert.equal(placedPreview.body.error.message, 'That request could not be read. Try again.');
            const placed = await jsonFetch(`${base}/api/universes/${target}/install`, {
                method: 'POST', headers: bHeaders,
                body: JSON.stringify({ packageId, version: 1, placement: { anchor: 'Chart/1910', to: 'Chart/1911' }, resolutions: {}, recordResolutions: {}, expect: { conflicts: 0 } }),
            });
            assert.equal(placed.status, 400);
            assert.equal(placed.body.error.message, 'That request could not be read. Try again.');

            const installed = await jsonFetch(`${base}/api/universes/${target}/install`, {
                method: 'POST', headers: bHeaders,
                body: JSON.stringify({ packageId, version: 1, resolutions: {}, recordResolutions: {}, expect: { conflicts: 0 } }),
            });
            assert.equal(installed.status, 200, JSON.stringify(installed.body));
            assert.equal(installed.body.data.records, 3);
            assert.equal(installed.body.data.written, 0);
            const campaign = await jsonFetch(`${base}/api/universes/${target}/campaign`, { headers: { cookie: reader } });
            const byId = Object.fromEntries(campaign.body.data.records.filter((r) => !r.deleted).map((r) => [r.id, r]));
            assert.deepEqual(byId[RECORD].anchor, { kind: 'system', hexKey: 'Chart/1910' }, 'a chart anchor is kept across truth versions');
            assert.equal(byId[R2].anchor, null, 'an own-sector anchor is dropped');
            assert.equal(byId[R3].anchor, null);
            assert.equal(byId[R2].provenance.mode, 'package');
            const list = await jsonFetch(`${base}/api/universes/${target}/installs`, { headers: { cookie: reader } });
            const row = list.body.data.items.find((item) => item.packageId === packageId);
            assert.equal(row.hexCount, 0);
            assert.equal(row.recordCount, 3);
            assert.equal(row.placement, null);
        } finally {
            if (child) stopDev(child.pid);
            rmSync(persistTo, { recursive: true, force: true });
        }
    });
}
