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

const NAME = 'links travel in a package (F16)';
const B = 'cr_22222222-2222-4222-8222-222222222222';
const C = 'cr_33333333-3333-4333-8333-333333333333';
const AB = 'cl_44444444-4444-4444-8444-444444444444';
const BC = 'cl_55555555-5555-4555-8555-555555555555';
function link(id, from, to) {
    return { id, from, to, kind: 'contact', role: 'friend', order: 0, since: null, until: null, notes: 'met at the port', visibility: 'referee', provenance: null, rev: 1, createdAt: STAMP_TIME, updatedAt: STAMP_TIME, deleted: false, baseRev: 0 };
}
if (process.env.RUN_API_TESTS !== '1') {
    test(NAME, { skip: 'set RUN_API_TESTS=1' }, () => {});
} else if (!existsSync(wranglerBin)) {
    test(NAME, { skip: 'wrangler is absent' }, () => {});
} else {
    test(NAME + ': links with both ends published ship, install with provenance, and go on remove', { timeout: 400000 }, async () => {
        const persistTo = mkdtempSync(path.join(tmpdir(), 'voyage-links-'));
        const port = 18885;
        const base = `http://127.0.0.1:${port}`;
        let child = null;
        try {
            runWrangler(['d1', 'migrations', 'apply', 'voyage', '--local', '--persist-to', persistTo]);
            const stamp = randomBytes(4).toString('hex');
            const version = `lnk${stamp}`;
            const author = userCookie(`lka${stamp}`, `lka${stamp}@localhost`, persistTo);
            const reader = userCookie(`lkb${stamp}`, `lkb${stamp}@localhost`, persistTo);
            const aHeaders = { 'content-type': 'application/json', cookie: author };
            const bHeaders = { 'content-type': 'application/json', cookie: reader };
            sqlFile(persistTo, `
INSERT INTO truth_versions (version, engine_version, milieu, seed, settings, sectors, state, started_at, released_at, sectors_total, sectors_done, sectors_failed)
VALUES ('${version}', '1.1.0', 'M1105', 'TravellerMagnus', '${SETTINGS}', '[]', 'released', '${STAMP_TIME}', '${STAMP_TIME}', 0, 0, '[]');
`);
            const chartBody = '{"chart":true}';
            const chartHash = createHash('sha256').update(chartBody).digest('hex');
            const chartEntry = { tree: chartHash, type: 'SYSTEM_PRESENT', name: 'Charted', uwp: 'A000000-0', allegiance: '', zone: '', bases: '', tradeCodes: [], pbg: '', ix: 0, partial: null };
            r2Put(persistTo, `truth/${version}/manifest.json`, JSON.stringify({ sectors: [{ slug: 'Chart', x: 0, y: 0 }] }));
            r2Put(persistTo, `truth/${version}/sectors/Chart/index.json`, JSON.stringify({ hexes: { 1910: chartEntry } }));
            r2Put(persistTo, `objects/${chartHash}`, chartBody);
            child = startDev({ port, persistTo, inspectorPort: 19885 });
            await up(base);
            const made = async (headers, name) => {
                const res = await jsonFetch(`${base}/api/universes`, { method: 'POST', headers, body: JSON.stringify({ name, truthVersion: version, editionDefault: 'MgT2E' }) });
                assert.equal(res.status, 201, JSON.stringify(res.body));
                return res.body.data.id;
            };
            const source = await made(aHeaders, 'Source');
            const seeded = await jsonFetch(`${base}/api/universes/${source}/campaign/changes`, {
                method: 'PATCH', headers: aHeaders,
                body: JSON.stringify({ records: [record(RECORD), { ...record(B), name: 'B' }, { ...record(C), name: 'C' }], links: [link(AB, RECORD, B), link(BC, B, C)] }),
            });
            assert.equal(seeded.status, 200, JSON.stringify(seeded.body));
            const created = await jsonFetch(`${base}/api/packages`, { method: 'POST', headers: aHeaders, body: JSON.stringify({ title: 'Two people', kind: 'people', description: '', tags: [], universeId: source }) });
            assert.equal(created.status, 201, JSON.stringify(created.body));
            const packageId = created.body.data.id;
            const v1 = await jsonFetch(`${base}/api/packages/${packageId}/versions`, { method: 'POST', headers: aHeaders, body: JSON.stringify({ universeId: source, hexKeys: ['Chart/1910'], recordIds: [RECORD, B] }) });
            assert.equal(v1.status, 202, JSON.stringify(v1.body));
            await settle(base, packageId, 1, author);
            const manifest = JSON.parse(r2Get(persistTo, `packages/${packageId}/1/manifest.json`));
            assert.equal(manifest.records.links.count, 1, 'only the link with both ends published');
            const shipped = JSON.parse(r2Get(persistTo, `objects/${manifest.records.links.contentHash}`));
            assert.deepEqual(shipped.map((l) => [l.id, l.from, l.to, l.visibility, l.notes]), [[AB, RECORD, B, 'referee', 'met at the port']]);

            const target = await made(bHeaders, 'Target');
            const preview = await jsonFetch(`${base}/api/universes/${target}/install/preview?packageId=${packageId}&version=1`, { headers: { cookie: reader } });
            assert.equal(preview.status, 200, JSON.stringify(preview.body));
            const installed = await jsonFetch(`${base}/api/universes/${target}/install`, {
                method: 'POST', headers: bHeaders,
                body: JSON.stringify({ packageId, version: 1, resolutions: {}, recordResolutions: {}, expect: { conflicts: preview.body.data.conflicts } }),
            });
            assert.equal(installed.status, 200, JSON.stringify(installed.body));
            assert.equal(installed.body.data.records, 2);
            assert.equal(installed.body.data.links, 1);
            const campaign = await jsonFetch(`${base}/api/universes/${target}/campaign`, { headers: { cookie: reader } });
            const live = campaign.body.data.links.filter((l) => !l.deleted);
            assert.equal(live.length, 1);
            assert.equal(live[0].id, AB);
            assert.equal(live[0].visibility, 'referee');
            assert.equal(live[0].provenance.mode, 'package');
            assert.equal(live[0].provenance.installId, installed.body.data.installId);

            const removed = await jsonFetch(`${base}/api/universes/${target}/installs/${installed.body.data.installId}`, { method: 'DELETE', headers: bHeaders });
            assert.equal(removed.status, 200, JSON.stringify(removed.body));
            const after = await jsonFetch(`${base}/api/universes/${target}/campaign`, { headers: { cookie: reader } });
            assert.equal(after.body.data.links.filter((l) => !l.deleted).length, 0);
            assert.equal(after.body.data.records.filter((r) => !r.deleted).length, 0);
        } finally {
            if (child) stopDev(child.pid);
            rmSync(persistTo, { recursive: true, force: true });
        }
    });
}
