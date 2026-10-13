import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { generateHex } from '@voyage/generation';
import { stable } from '@voyage/shared';
import enginesPackage from '../../packages/engines/package.json' with { type: 'json' };
import { DEFAULT_GENERATION_SEED, DEFAULT_GENERATION_SETTINGS } from '../../apps/api/src/universe/defaults.ts';
import { runWrangler } from './session.js';
import { startDev, stopDev } from './server.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

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
    const file = path.join(persistTo, 'user.sql');
    writeFileSync(file, sql);
    runWrangler(['d1', 'execute', 'voyage', '--local', '--persist-to', persistTo, '--file', file]);
    const signature = createHmac('sha256', authSecret()).update(token).digest('base64');
    return `__Secure-better-auth.session_token=${encodeURIComponent(`${token}.${signature}`)}`;
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function jsonFetch(url, options) {
    const response = await fetch(url, options);
    const text = await response.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text }; }
    return { status: response.status, body, text };
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

async function waitJob(base, id, cookie, jobId) {
    const deadline = Date.now() + 180000;
    let job = null;
    while (Date.now() < deadline) {
        const read = await jsonFetch(`${base}/api/universes/${id}/jobs/${jobId}`, { headers: { cookie } });
        assert.equal(read.status, 200, JSON.stringify(read.body));
        job = read.body.data;
        if (job.state === 'done' || job.state === 'failed' || job.state === 'stopped') return job;
        await sleep(30);
    }
    throw new Error(`job did not finish ${JSON.stringify(job)}`);
}

function columnKeys(sector, columns, rows) {
    const keys = [];
    for (let column = 1; column <= columns; column += 1) {
        for (let row = 1; row <= rows; row += 1) {
            keys.push(`${sector}/${String(column).padStart(2, '0')}${String(row).padStart(2, '0')}`);
        }
    }
    return keys;
}

if (process.env.RUN_API_TESTS !== '1') {
    test('generate speed on the worker', { skip: 'set RUN_API_TESTS=1' }, () => {});
} else {
    test('a job matches the generator byte for byte, stop and undo hold, and the budget answers', { timeout: 180000 }, async () => {
        const persistTo = mkdtempSync(path.join(tmpdir(), 'voyage-speed-'));
        const port = 18846;
        const inspectorPort = 19846;
        const base = `http://127.0.0.1:${port}`;
        let child = null;
        try {
            runWrangler(['d1', 'migrations', 'apply', 'voyage', '--local', '--persist-to', persistTo]);
            const stamp = randomBytes(4).toString('hex');
            const userId = `spd${stamp}`;
            const cookie = userCookie(userId, `${userId}@localhost`, persistTo);
            const allowance = path.join(persistTo, 'allowance.sql');
            writeFileSync(allowance, `INSERT INTO generation_allowance (user_id, daily_limit, day, used) VALUES ('${userId}', 10000, '', 0);\n`);
            runWrangler(['d1', 'execute', 'voyage', '--local', '--persist-to', persistTo, '--file', allowance]);
            rmSync(allowance);
            child = startDev({ port, persistTo, inspectorPort, args: ['--var', 'GENERATE_PAUSE:40'] });
            await up(base);
            const headers = { 'content-type': 'application/json', cookie };
            const created = await jsonFetch(`${base}/api/universes`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ name: 'Speed', truthVersion: null, editionDefault: 'MgT2E' }),
            });
            assert.equal(created.status, 201, JSON.stringify(created.body));
            const id = created.body.data.id;

            const pair = ['blank/0101', 'blank/0102'];
            const posted = await jsonFetch(`${base}/api/universes/${id}/generate`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ hexKeys: pair, edition: 'MgT2E', generator: 'top-down', density: 'every' }),
            });
            assert.equal(posted.status, 202, JSON.stringify(posted.body));
            const job = await waitJob(base, id, cookie, posted.body.data.jobId);
            assert.equal(job.state, 'done', JSON.stringify(job));
            assert.deepEqual(job.placed, pair);
            const hex = await jsonFetch(`${base}/api/universes/${id}/hexes/blank/0101`, { headers: { cookie } });
            assert.equal(hex.status, 200, JSON.stringify(hex.body));
            const expected = stable(generateHex({
                hexKey: 'blank/0101',
                edition: 'MgT2E',
                mode: 'top-down',
                summary: { type: 'SYSTEM_PRESENT' },
                pinned: {
                    seed: DEFAULT_GENERATION_SEED,
                    settings: DEFAULT_GENERATION_SETTINGS,
                    engineVersion: enginesPackage.version,
                },
            }));
            const object = await fetch(`${base}/api/universes/${id}/objects/${hex.body.data.treeHash}`, { headers: { cookie } });
            assert.equal(object.status, 200);
            assert.equal(await object.text(), expected);
            const universe = await jsonFetch(`${base}/api/universes/${id}`, { headers: { cookie } });
            assert.equal(universe.status, 200, JSON.stringify(universe.body));
            assert.ok(universe.body.data.objectBytes > 0);
            assert.equal(universe.body.data.hexOverrideCount, 2);

            const wide = columnKeys('wide', 32, 20);
            const growing = await jsonFetch(`${base}/api/universes/${id}/generate`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ hexKeys: wide, edition: 'MgT2E', generator: 'top-down', density: 'every' }),
            });
            assert.equal(growing.status, 202, JSON.stringify(growing.body));
            const jobId = growing.body.data.jobId;
            let stopped = null;
            const stopBy = Date.now() + 60000;
            while (Date.now() < stopBy) {
                const read = await jsonFetch(`${base}/api/universes/${id}/jobs/${jobId}`, { headers: { cookie } });
                const live = read.body.data;
                if (live.state === 'running' && live.done > 0 && live.done < live.total) {
                    stopped = await jsonFetch(`${base}/api/universes/${id}/jobs/${jobId}/stop`, { method: 'POST', headers });
                    break;
                }
                if (live.state === 'done' || live.state === 'failed' || live.state === 'stopped') {
                    stopped = { status: 200, body: { data: live }, raced: true };
                    break;
                }
                await sleep(5);
            }
            assert.ok(stopped, 'stop window elapsed');
            assert.equal(stopped.status, 200, JSON.stringify(stopped.body));
            const afterStop = await waitJob(base, id, cookie, jobId);
            assert.equal(stopped.raced, undefined, JSON.stringify(afterStop));
            assert.equal(afterStop.state, 'stopped', JSON.stringify(afterStop));
            assert.ok(afterStop.done > 0 && afterStop.done < afterStop.total, JSON.stringify(afterStop));
            assert.ok(afterStop.placed.length > 0);
            const undone = await jsonFetch(`${base}/api/universes/${id}/jobs/${jobId}/undo`, { method: 'POST', headers });
            assert.equal(undone.status, 200, JSON.stringify(undone.body));
            assert.equal(undone.body.data.restored, afterStop.placed.length);
            if (afterStop.placed[0]) {
                const [sector, local] = afterStop.placed[0].split('/');
                const gone = await jsonFetch(`${base}/api/universes/${id}/hexes/${sector}/${local}`, { headers: { cookie } });
                assert.equal(gone.status, 404, afterStop.placed[0]);
            }

            const small = await jsonFetch(`${base}/api/universes/${id}/jobs/${posted.body.data.jobId}/undo`, { method: 'POST', headers });
            assert.equal(small.status, 200, JSON.stringify(small.body));
            assert.equal(small.body.data.restored, 2);

            let limited = null;
            for (let index = 0; index < 121; index += 1) {
                limited = await jsonFetch(`${base}/api/universes/${id}/jobs/${posted.body.data.jobId}/stop`, { method: 'POST', headers });
            }
            assert.equal(limited.status, 429, JSON.stringify(limited.body));
            assert.equal(limited.body.error.message, 'Too many requests.');
            const refused = await jsonFetch(`${base}/api/universes/${id}/generate`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ hexKeys: ['blank/0201', 'blank/0202'], edition: 'MgT2E', generator: 'top-down' }),
            });
            assert.equal(refused.status, 429, JSON.stringify(refused.body));
            assert.equal(refused.body.error.message, 'Too many requests.');
        } finally {
            if (child) stopDev(child.pid);
            await sleep(300);
            rmSync(persistTo, { recursive: true, force: true });
        }
    });
}
