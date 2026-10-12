import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { densityKeeps } from '@voyage/generation';
import { runWrangler } from './session.js';
import { startDev, stopDev } from './server.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SEED = 'TravellerMagnus';

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
    runWrangler(['d1', 'execute', 'voyage', '--local', '--persist-to', persistTo, '--file', file]);
    const signature = createHmac('sha256', authSecret()).update(token).digest('base64');
    return `__Secure-better-auth.session_token=${encodeURIComponent(`${token}.${signature}`)}`;
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

function subsector() {
    const keys = [];
    for (let column = 1; column <= 8; column += 1) {
        for (let row = 1; row <= 10; row += 1) {
            keys.push(`blank/${String(column).padStart(2, '0')}${String(row).padStart(2, '0')}`);
        }
    }
    return keys;
}

function expectPlaced(density, keys) {
    return keys.filter((hexKey) => densityKeeps({
        universeSeed: SEED,
        hexKey,
        density,
        alone: false,
        holds: false,
        filledToo: false,
    }) === 'write');
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

async function waitJob(base, id, headers, jobId) {
    const deadline = Date.now() + 600000;
    let job = null;
    while (Date.now() < deadline) {
        const read = await jsonFetch(`${base}/api/universes/${id}/jobs/${jobId}`, { headers: { cookie: headers.cookie } });
        assert.equal(read.status, 200, JSON.stringify(read.body));
        job = read.body.data;
        if (job.state === 'done' || job.state === 'failed' || job.state === 'stopped') return job;
        await sleep(400);
    }
    throw new Error(`job ${jobId} did not finish: ${JSON.stringify(job)}`);
}

if (process.env.RUN_API_TESTS !== '1') {
    test('generate density on the worker', { skip: 'set RUN_API_TESTS=1' }, () => {});
} else {
    test('density leaves empty hexes empty, and one hex is always written', { timeout: 1500000 }, async () => {
        const persistTo = mkdtempSync(path.join(tmpdir(), 'voyage-density-'));
        const port = 18841;
        const inspectorPort = 19841;
        const base = `http://127.0.0.1:${port}`;
        let child = null;
        try {
            runWrangler(['d1', 'migrations', 'apply', 'voyage', '--local', '--persist-to', persistTo]);
            const stamp = randomBytes(4).toString('hex');
            const cookie = userCookie(`den${stamp}`, `den${stamp}@localhost`, persistTo);
            const headers = { 'content-type': 'application/json', cookie };
            child = startDev({ port, persistTo, inspectorPort });
            await up(base);
            const created = await jsonFetch(`${base}/api/universes`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ name: 'Density', truthVersion: null, editionDefault: 'MgT2E' }),
            });
            assert.equal(created.status, 201, JSON.stringify(created.body));
            const id = created.body.data.id;

            const one = await jsonFetch(`${base}/api/universes/${id}/generate`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    hexKeys: ['blank/1910'],
                    edition: 'MgT2E',
                    generator: 'top-down',
                    density: 'sparse',
                    baseRev: 0,
                }),
            });
            assert.equal(one.status, 200, JSON.stringify(one.body));
            assert.equal(one.body.data.rows.length, 1);
            assert.equal(one.body.data.leftEmpty, 0);
            assert.deepEqual(one.body.data.skipped, []);

            const absent = await jsonFetch(`${base}/api/universes/${id}/generate`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    hexKeys: ['blank/1911', 'blank/1912', 'blank/1913'],
                    edition: 'MgT2E',
                    generator: 'top-down',
                }),
            });
            assert.equal(absent.status, 202, JSON.stringify(absent.body));
            const all = await waitJob(base, id, headers, absent.body.data.jobId);
            assert.equal(all.state, 'done', JSON.stringify(all));
            assert.equal(all.leftEmpty, 0);
            assert.equal(all.done, 3);
            assert.deepEqual(all.placed, ['blank/1911', 'blank/1912', 'blank/1913']);
            const tail = await jsonFetch(`${base}/api/universes/${id}/jobs/${absent.body.data.jobId}?since=2`, { headers: { cookie } });
            assert.deepEqual(tail.body.data.placed, ['blank/1913']);
            const badSince = await jsonFetch(`${base}/api/universes/${id}/jobs/${absent.body.data.jobId}?since=no`, { headers: { cookie } });
            assert.equal(badSince.status, 400);

            const keys = subsector();
            const counts = {};
            for (const density of ['sparse', 'standard', 'dense', 'every']) {
                const posted = await jsonFetch(`${base}/api/universes/${id}/generate`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ hexKeys: keys, edition: 'MgT2E', generator: 'top-down', density }),
                });
                assert.equal(posted.status, 202, JSON.stringify(posted.body));
                const job = await waitJob(base, id, headers, posted.body.data.jobId);
                assert.equal(job.state, 'done', JSON.stringify({ density, job }));
                const want = expectPlaced(density, keys);
                assert.deepEqual(job.placed, want, density);
                assert.equal(job.leftEmpty, keys.length - want.length, density);
                assert.equal(job.skipped, 0, density);
                if (density !== 'every') assert.ok(job.placed.length < 80, density);
                counts[density] = job.placed.length;
                const undone = await jsonFetch(`${base}/api/universes/${id}/jobs/${posted.body.data.jobId}/undo`, {
                    method: 'POST',
                    headers,
                });
                assert.equal(undone.status, 200, JSON.stringify(undone.body));
                assert.equal(undone.body.data.restored, want.length, density);
                const gone = await jsonFetch(`${base}/api/universes/${id}/hexes/blank/0101`, { headers: { cookie } });
                if (want.includes('blank/0101')) assert.equal(gone.status, 404, density);
            }

            const again = await jsonFetch(`${base}/api/universes/${id}/generate`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ hexKeys: keys, edition: 'MgT2E', generator: 'top-down', density: 'standard' }),
            });
            const second = await waitJob(base, id, headers, again.body.data.jobId);
            assert.equal(second.placed.length, counts.standard);
            assert.deepEqual(second.placed, expectPlaced('standard', keys));
            await jsonFetch(`${base}/api/universes/${id}/jobs/${again.body.data.jobId}/undo`, { method: 'POST', headers });

            const locals = ['0101', '0102', '0103'];
            let emptySector = null;
            for (let attempt = 0; attempt < 24; attempt += 1) {
                const sector = await jsonFetch(`${base}/api/universes/${id}/generate`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                        hexKeys: locals.map((local) => `~slot_4_4/${local}`),
                        edition: 'MgT2E',
                        generator: 'top-down',
                        density: 'sparse',
                        makeSectors: [{ name: 'Empty box', slot: { x: 4, y: 4 } }],
                    }),
                });
                assert.equal(sector.status, 202, JSON.stringify(sector.body));
                assert.equal(sector.body.data.sectors.length, 1);
                const madeId = sector.body.data.sectors[0].id;
                const job = await waitJob(base, id, headers, sector.body.data.jobId);
                assert.equal(job.state, 'done', JSON.stringify(job));
                const resolved = locals.map((local) => `${madeId}/${local}`);
                const want = expectPlaced('sparse', resolved);
                assert.deepEqual(job.placed, want, `attempt ${attempt}`);
                assert.equal(job.leftEmpty, resolved.length - want.length, `attempt ${attempt}`);
                if (want.length === 0) {
                    emptySector = sector;
                    break;
                }
                const undo = await jsonFetch(`${base}/api/universes/${id}/sectors/undo-generate`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ jobId: sector.body.data.jobId }),
                });
                assert.equal(undo.status, 200, JSON.stringify(undo.body));
            }
            assert.ok(emptySector, 'a new sector whose three hexes all roll empty');
            const still = await jsonFetch(`${base}/api/universes/${id}/sectors`, { headers: { cookie } });
            assert.equal(still.status, 200, JSON.stringify(still.body));
            const found = (still.body.data.items ?? still.body.data).some((item) => item.name === 'Empty box');
            assert.equal(found, true, JSON.stringify(still.body));
            const sectorUndo = await jsonFetch(`${base}/api/universes/${id}/sectors/undo-generate`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ jobId: emptySector.body.data.jobId }),
            });
            assert.equal(sectorUndo.status, 200, JSON.stringify(sectorUndo.body));
        } finally {
            if (child) stopDev(child.pid);
            rmSync(persistTo, { recursive: true, force: true });
        }
    });
}
