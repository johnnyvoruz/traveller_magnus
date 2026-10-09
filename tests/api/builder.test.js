import assert from 'node:assert/strict';
import { randomBytes, createHmac } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { chartEntry } from '@voyage/generation';
import { SectorHex } from '@voyage/shared';
import { runWrangler } from './session.js';
import { startDev, stopDev } from './server.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function authSecret() {
    const text = readFileSync(path.join(root, 'apps', 'api', '.dev.vars'), 'utf8');
    const line = text.split(/\r?\n/).find((item) => item.startsWith('BETTER_AUTH_SECRET='));
    if (!line) throw new Error('BETTER_AUTH_SECRET is unset');
    const value = line.slice('BETTER_AUTH_SECRET='.length).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        return value.slice(1, -1);
    }
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
    try {
        body = text ? JSON.parse(text) : null;
    } catch {
        body = { raw: text };
    }
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

if (process.env.RUN_API_TESTS !== '1') {
    test('builder on the worker', { skip: 'set RUN_API_TESTS=1' }, () => {});
} else {
    test('one hex, a job, and undo on a private worker', { timeout: 300000 }, async () => {
        const persistTo = mkdtempSync(path.join(tmpdir(), 'voyage-builder-'));
        const port = 18831;
        const inspectorPort = 19831;
        const base = `http://127.0.0.1:${port}`;
        let child = null;
        try {
            runWrangler(['d1', 'migrations', 'apply', 'voyage', '--local', '--persist-to', persistTo]);
            const stamp = randomBytes(4).toString('hex');
            const cookie = userCookie(`bld${stamp}`, `bld${stamp}@localhost`, persistTo);
            const headers = { 'content-type': 'application/json', cookie };
            child = startDev({ port, persistTo, inspectorPort });
            await up(base);

            const providers = await jsonFetch(`${base}/api/providers`);
            assert.equal(providers.status, 200, JSON.stringify(providers.body));
            for (const name of ['twitter', 'discord', 'google']) {
                assert.equal(typeof providers.body.data[name], 'boolean', name);
            }

            const created = await jsonFetch(`${base}/api/universes`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ name: 'Blank map', truthVersion: null, editionDefault: 'MgT2E' }),
            });
            assert.equal(created.status, 201, JSON.stringify(created.body));
            const id = created.body.data.id;
            const hex = (local) => `${base}/api/universes/${id}/hexes/blank/${local}`;

            const refused = await jsonFetch(`${base}/api/universes/${id}/generate`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    hexKeys: ['blank/1910'],
                    edition: 'MgT2E',
                    generator: 'bottom-up',
                    baseRev: 0,
                }),
            });
            assert.equal(refused.status, 400, JSON.stringify(refused.body));
            assert.equal(refused.body.error.details.reason, 'generator_unavailable');

            const first = await jsonFetch(`${base}/api/universes/${id}/generate`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    hexKeys: ['blank/1910'],
                    edition: 'MgT2E',
                    generator: 'top-down',
                    roll: 0,
                    baseRev: 0,
                }),
            });
            assert.equal(first.status, 200, JSON.stringify(first.body));
            const row = first.body.data.rows[0];
            assert.equal(row.hexKey, 'blank/1910');
            assert.equal(row.state, 'own');
            assert.equal(row.roll, 0);
            assert.equal(row.rev, 1);
            assert.match(row.treeHash, /^[0-9a-f]{64}$/);

            const object = await jsonFetch(`${base}/api/universes/${id}/objects/${row.treeHash}`, { headers: { cookie } });
            assert.equal(object.status, 200, JSON.stringify(object.body));
            assert.equal(object.body.kind, 'tree');
            assert.equal(object.body.hexKey, 'blank/1910');
            const indexed = SectorHex.parse(chartEntry(object.body.body, row.treeHash));
            assert.deepEqual(row.entry, indexed);
            assert.equal(row.entry.name.length > 0, true);
            assert.equal(row.entry.uwp.length > 0, true);
            const preview = await jsonFetch(`${base}/api/generate/preview`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    edition: 'MgT2E',
                    mode: 'top-down',
                    seed: 'TravellerMagnus',
                    settings: {
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
                    },
                    hexKey: 'blank/1910',
                    inputs: { type: 'SYSTEM_PRESENT' },
                }),
            });
            assert.equal(preview.status, 200, JSON.stringify(preview.body));
            assert.equal(preview.body.data.hash, row.treeHash);
            assert.deepEqual(preview.body.data.entry, indexed);

            const page = await jsonFetch(`${base}/api/universes/${id}/hexes?sector=blank`, { headers: { cookie } });
            assert.equal(page.status, 200, JSON.stringify(page.body));
            assert.equal(page.body.data.items.length, 1);

            const rolled = await jsonFetch(`${base}/api/universes/${id}/generate`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    hexKeys: ['blank/1910'],
                    edition: 'MgT2E',
                    generator: 'top-down',
                    roll: 1,
                    filledToo: true,
                    baseRev: row.rev,
                }),
            });
            assert.equal(rolled.status, 200, JSON.stringify(rolled.body));
            const second = rolled.body.data.rows[0];
            assert.equal(second.roll, 1);
            assert.notEqual(second.treeHash, row.treeHash);

            const stale = await jsonFetch(`${base}/api/universes/${id}/generate`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    hexKeys: ['blank/1910'],
                    edition: 'MgT2E',
                    generator: 'top-down',
                    roll: 2,
                    filledToo: true,
                    baseRev: 0,
                }),
            });
            assert.equal(stale.status, 409, JSON.stringify(stale.body));
            assert.equal(stale.body.error.code, 'conflict');
            assert.equal(stale.body.error.details.current.rev, second.rev);

            const removed = await jsonFetch(`${hex('1910')}/remove`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ baseRev: second.rev }),
            });
            assert.equal(removed.status, 200, JSON.stringify(removed.body));
            assert.equal(removed.body.data.state, 'own');
            assert.equal(removed.body.data.rev, 0);

            const restored = await jsonFetch(`${hex('1910')}/restore`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ baseRev: 0 }),
            });
            assert.equal(restored.status, 400, JSON.stringify(restored.body));
            assert.equal(restored.body.error.details.reason, 'no_chart');

            const reverted = await jsonFetch(`${hex('1910')}/revert`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ toRev: 1, baseRev: 0 }),
            });
            assert.equal(reverted.status, 200, JSON.stringify(reverted.body));
            assert.equal(reverted.body.data.treeHash, row.treeHash);
            assert.equal(reverted.body.data.rev, 3);

            const aow = await jsonFetch(`${base}/api/universes/${id}/generate`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    hexKeys: ['blank/1911'],
                    edition: 'AoW',
                    generator: 'bottom-up',
                    baseRev: 0,
                }),
            });
            assert.equal(aow.status, 200, JSON.stringify(aow.body));
            assert.equal(aow.body.data.rows[0].state, 'own');
            const aowObject = await jsonFetch(`${base}/api/universes/${id}/objects/${aow.body.data.rows[0].treeHash}`, { headers: { cookie } });
            assert.equal(aowObject.status, 200, JSON.stringify(aowObject.body));
            assert.equal(aowObject.body.kind, 'tree');
            assert.equal(aowObject.body.hexKey, 'blank/1911');

            const accepted = await jsonFetch(`${base}/api/universes/${id}/generate`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    hexKeys: ['blank/0101', 'blank/0102', 'blank/0103'],
                    edition: 'MgT2E',
                    generator: 'top-down',
                }),
            });
            assert.equal(accepted.status, 202, JSON.stringify(accepted.body));
            const jobId = accepted.body.data.jobId;
            let job = null;
            const deadline = Date.now() + 120000;
            while (Date.now() < deadline) {
                const read = await jsonFetch(`${base}/api/universes/${id}/jobs/${jobId}`, { headers: { cookie } });
                assert.equal(read.status, 200, JSON.stringify(read.body));
                job = read.body.data;
                if (job.state === 'done' || job.state === 'failed' || job.state === 'stopped') break;
                await sleep(500);
            }
            assert.equal(job.state, 'done', JSON.stringify(job));
            assert.equal(job.done, 3, JSON.stringify(job));
            assert.equal(job.failed, 0, JSON.stringify(job));

            const undo = await jsonFetch(`${base}/api/universes/${id}/jobs/${jobId}/undo`, {
                method: 'POST',
                headers,
            });
            assert.equal(undo.status, 200, JSON.stringify(undo.body));
            assert.equal(undo.body.data.restored, 3, JSON.stringify(undo.body));
            assert.deepEqual(undo.body.data.conflicts, []);

            const gone = await jsonFetch(`${hex('0101')}`, { headers: { cookie } });
            assert.equal(gone.status, 404, JSON.stringify(gone.body));

            const again = await jsonFetch(`${base}/api/universes/${id}/jobs/${jobId}/undo`, {
                method: 'POST',
                headers,
            });
            assert.equal(again.status, 400, JSON.stringify(again.body));
            assert.equal(again.body.error.details.reason, 'already_undone');
        } finally {
            if (child) stopDev(child.pid);
            rmSync(persistTo, { recursive: true, force: true });
        }
    });
}
