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

const NAME = 'an install outlives its source (F15)';
if (process.env.RUN_API_TESTS !== '1') {
    test(NAME, { skip: 'set RUN_API_TESTS=1' }, () => {});
} else if (!existsSync(wranglerBin)) {
    test(NAME, { skip: 'wrangler is absent' }, () => {});
} else {
    test(NAME + ': the manifest carries own-sector slots; deleting the source and taking the package down claws nothing back', { timeout: 400000 }, async () => {
        const persistTo = mkdtempSync(path.join(tmpdir(), 'voyage-gone-'));
        const port = 18883;
        const base = `http://127.0.0.1:${port}`;
        let child = null;
        try {
            runWrangler(['d1', 'migrations', 'apply', 'voyage', '--local', '--persist-to', persistTo]);
            const stamp = randomBytes(4).toString('hex');
            const version = `gon${stamp}`;
            const author = userCookie(`gna${stamp}`, `gna${stamp}@localhost`, persistTo);
            const reader = userCookie(`gnb${stamp}`, `gnb${stamp}@localhost`, persistTo);
            const admin = userCookie(`gnc${stamp}`, `gnc${stamp}@localhost`, persistTo);
            sqlFile(persistTo, `UPDATE user SET role = 'admin' WHERE id = 'gnc${stamp}';`);
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
            r2Put(persistTo, `truth/${version}/manifest.json`, JSON.stringify({ sectors: [{ slug: 'Chart', x: 0, y: 0 }] }));
            r2Put(persistTo, `truth/${version}/sectors/Chart/index.json`, JSON.stringify({ hexes: { 1910: chartEntry } }));
            r2Put(persistTo, `objects/${chartHash}`, chartBody);
            child = startDev({ port, persistTo, inspectorPort: 19883 });
            await up(base);

            const made = async (headers, name) => {
                const res = await jsonFetch(`${base}/api/universes`, { method: 'POST', headers, body: JSON.stringify({ name, truthVersion: version, editionDefault: 'MgT2E' }) });
                assert.equal(res.status, 201, JSON.stringify(res.body));
                return res.body.data.id;
            };
            const hexPath = (universeId, key) => {
                const at = key.lastIndexOf('/');
                return `${base}/api/universes/${universeId}/hexes/${encodeURIComponent(key.slice(0, at))}/${key.slice(at + 1)}`;
            };
            const source = await made(aHeaders, 'Source');
            const sector = await jsonFetch(`${base}/api/universes/${source}/sectors`, { method: 'POST', headers: aHeaders, body: JSON.stringify({ name: 'Far Reach', slot: { x: 5, y: 5 } }) });
            assert.equal(sector.status, 201, JSON.stringify(sector.body));
            const own = sector.body.data.id;
            for (const local of ['0101', '0102']) {
                const res = await jsonFetch(hexPath(source, `${own}/${local}`) + '/blank', { method: 'POST', headers: aHeaders, body: JSON.stringify({ baseRev: 0 }) });
                assert.equal(res.status, 200, JSON.stringify(res.body));
            }
            const placeRecord = { ...record(RECORD), anchor: { kind: 'system', hexKey: `${own}/0101` } };
            const seeded = await jsonFetch(`${base}/api/universes/${source}/campaign/changes`, { method: 'PATCH', headers: aHeaders, body: JSON.stringify({ records: [placeRecord] }) });
            assert.equal(seeded.status, 200, JSON.stringify(seeded.body));
            const created = await jsonFetch(`${base}/api/packages`, { method: 'POST', headers: aHeaders, body: JSON.stringify({ title: 'Far piece', kind: 'sector piece', description: '', tags: [], universeId: source }) });
            assert.equal(created.status, 201, JSON.stringify(created.body));
            const packageId = created.body.data.id;
            const v1 = await jsonFetch(`${base}/api/packages/${packageId}/versions`, { method: 'POST', headers: aHeaders, body: JSON.stringify({ universeId: source, hexKeys: [`${own}/0101`, `${own}/0102`], recordIds: [RECORD] }) });
            assert.equal(v1.status, 202, JSON.stringify(v1.body));
            await settle(base, packageId, 1, author);
            const manifest = JSON.parse(r2Get(persistTo, `packages/${packageId}/1/manifest.json`));
            assert.deepEqual(manifest.ownSectors, { [own]: { x: 5, y: 5 } });

            // Placed onto the chart: 0101 lands on Chart/1910, 0102 on Chart/1911.
            const placement = { anchor: `${own}/0101`, to: 'Chart/1910' };
            const query = `&anchor=${encodeURIComponent(placement.anchor)}&to=${encodeURIComponent(placement.to)}`;
            const previewIn = (target) => jsonFetch(`${base}/api/universes/${target}/install/preview?packageId=${packageId}&version=1${query}`, { headers: { cookie: reader } });
            const landing = (preview) => Object.fromEntries(preview.body.data.hexes.map((hex) => [hex.from, [hex.to, hex.outcome]]));
            const target = await made(bHeaders, 'Target');
            const before = await previewIn(target);
            assert.equal(before.status, 200, JSON.stringify(before.body));
            const expected = { [`${own}/0101`]: ['Chart/1910', 'replaces chart'], [`${own}/0102`]: ['Chart/1911', 'new'] };
            assert.deepEqual(landing(before), expected);
            const installed = await jsonFetch(`${base}/api/universes/${target}/install`, {
                method: 'POST', headers: bHeaders,
                body: JSON.stringify({ packageId, version: 1, placement, resolutions: {}, recordResolutions: {}, expect: { conflicts: 0 } }),
            });
            assert.equal(installed.status, 200, JSON.stringify(installed.body));

            const snapshot = async () => {
                const out = {};
                for (const key of ['Chart/1910', 'Chart/1911']) {
                    const hex = await jsonFetch(hexPath(target, key), { headers: { cookie: reader } });
                    assert.equal(hex.status, 200, JSON.stringify(hex.body));
                    const hash = hex.body.data.treeHash;
                    const object = await fetch(`${base}/api/universes/${target}/objects/${hash}`, { headers: { cookie: reader } });
                    assert.equal(object.status, 200, key);
                    out[key] = { row: hex.body.data, object: await object.text() };
                }
                const campaign = await jsonFetch(`${base}/api/universes/${target}/campaign`, { headers: { cookie: reader } });
                assert.equal(campaign.status, 200, JSON.stringify(campaign.body));
                out.records = campaign.body.data.records;
                return JSON.stringify(out);
            };
            const kept = await snapshot();
            assert.match(kept, /Chart\/1910/);
            assert.equal(JSON.parse(kept).records.length, 1);
            assert.equal(JSON.parse(kept).records[0].anchor.hexKey, 'Chart/1910');

            // The author deletes the source map. A new placed preview reads the slots from the manifest.
            const deleted = await jsonFetch(`${base}/api/universes/${source}`, { method: 'DELETE', headers: aHeaders });
            assert.equal(deleted.status < 300, true, JSON.stringify(deleted.body));
            const other = await made(bHeaders, 'Other');
            const after = await previewIn(other);
            assert.equal(after.status, 200, JSON.stringify(after.body));
            assert.deepEqual(landing(after), expected);
            assert.equal(await snapshot(), kept);

            // An admin takes the package down. The copy in the campaign stays whole.
            const down = await jsonFetch(`${base}/api/admin/packages/${packageId}/takedown`, {
                method: 'POST', headers: { 'content-type': 'application/json', cookie: admin }, body: JSON.stringify({ reason: 'Test.' }),
            });
            assert.equal(down.status, 200, JSON.stringify(down.body));
            assert.equal(await snapshot(), kept);
        } finally {
            if (child) stopDev(child.pid);
            rmSync(persistTo, { recursive: true, force: true });
        }
    });
}
