import assert from 'node:assert/strict';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { generateHex } from '@voyage/generation';
import { stable } from '@voyage/shared';
import enginesPackage from '../../packages/engines/package.json' with { type: 'json' };
import { DEFAULT_GENERATION_SEED, DEFAULT_GENERATION_SETTINGS } from '../../apps/api/src/universe/defaults.ts';
import { ensureReservationTable, OBJECT_QUOTA_BYTES, QUOTA_SENTENCE, releaseBytes, reserveBytes, reservedBytes } from '../../apps/api/src/universe/quota.ts';
import { removeTree, runWrangler } from './session.js';
import { startDev, stopDev, wranglerBin } from './server.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const QUOTA = OBJECT_QUOTA_BYTES;

function openSql() {
    const db = new DatabaseSync(':memory:');
    return {
        exec(query, ...params) {
            const statement = db.prepare(query);
            if (query.trim().toUpperCase().startsWith('SELECT')) return statement.all(...params);
            statement.run(...params);
            return [];
        },
    };
}

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
    const file = path.join(persistTo, `user-${userId}.sql`);
    writeFileSync(file, sql);
    runWrangler(['d1', 'execute', 'voyage', '--local', '--persist-to', persistTo, '--file', file]);
    const signature = createHmac('sha256', authSecret()).update(token).digest('base64');
    return `__Secure-better-auth.session_token=${encodeURIComponent(`${token}.${signature}`)}`;
}

function sqlFile(persistTo, sql) {
    const file = path.join(persistTo, `quota-${randomBytes(4).toString('hex')}.sql`);
    writeFileSync(file, sql);
    runWrangler(['d1', 'execute', 'voyage', '--local', '--persist-to', persistTo, '--file', file]);
}

function jsonFrom(text) {
    const start = text.indexOf('[');
    const objectStart = text.indexOf('{');
    const at = start === -1 ? objectStart : objectStart === -1 ? start : Math.min(start, objectStart);
    if (at === -1) throw new Error(text);
    return JSON.parse(text.slice(at));
}

function objectBytes(persistTo, id) {
    const rows = jsonFrom(runWrangler([
        'd1', 'execute', 'voyage', '--local', '--persist-to', persistTo, '--json', '--command',
        `SELECT object_bytes AS n FROM universes WHERE id = '${id}'`,
    ]));
    return Number(rows[0].results[0].n);
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function up(base) {
    const deadline = Date.now() + 90000;
    while (Date.now() < deadline) {
        try {
            const response = await fetch(`${base}/api/health`);
            if (response.ok) return;
        } catch {
            // wrangler is still booting
        }
        await sleep(300);
    }
    throw new Error('wrangler dev did not answer /api/health');
}

async function jsonFetch(url, options) {
    const response = await fetch(url, options);
    const body = await response.json();
    return { status: response.status, body };
}

function webp(size, mark) {
    const body = Buffer.alloc(size);
    body.write('RIFF', 0);
    body.writeUInt32LE(size - 8, 4);
    body.write('WEBP', 8);
    body.writeUInt32LE(mark, 12);
    return body;
}

function sha(bytes) {
    return createHash('sha256').update(bytes).digest('hex');
}

function treeSize(hexKey) {
    const bytes = stable(generateHex({
        hexKey,
        edition: 'MgT2E',
        mode: 'top-down',
        summary: { type: 'SYSTEM_PRESENT' },
        pinned: {
            seed: DEFAULT_GENERATION_SEED,
            settings: DEFAULT_GENERATION_SETTINGS,
            engineVersion: enginesPackage.version,
        },
    }));
    return Buffer.byteLength(bytes);
}

test('a failed put releases, and an expired reservation stops counting', () => {
    const sql = openSql();
    ensureReservationTable(sql);
    const now = 1_000;
    assert.equal(reserveBytes(sql, { id: 'job-a', bytes: 100, objectBytes: QUOTA - 100, now, ttlMs: 1_000 }).ok, true);
    assert.equal(reserveBytes(sql, { id: 'job-b', bytes: 1, objectBytes: QUOTA - 100, now, ttlMs: 1_000 }).ok, false);
    releaseBytes(sql, 'job-a', 100);
    assert.equal(reservedBytes(sql), 0);
    assert.equal(reserveBytes(sql, { id: 'job-b', bytes: 100, objectBytes: QUOTA - 100, now, ttlMs: 1_000 }).ok, true);
    releaseBytes(sql, 'job-b', 100);

    assert.equal(reserveBytes(sql, { id: 'dead', bytes: 50, objectBytes: 0, now, ttlMs: 1_000 }).ok, true);
    assert.equal(reserveBytes(sql, { id: 'live', bytes: QUOTA, objectBytes: 0, now: now + 999, ttlMs: 1_000 }).ok, false);
    assert.equal(reserveBytes(sql, { id: 'live', bytes: QUOTA, objectBytes: 0, now: now + 1_000, ttlMs: 1_000 }).ok, true);
    assert.equal(reservedBytes(sql), QUOTA);

    const again = openSql();
    ensureReservationTable(again);
    assert.equal(reserveBytes(again, { id: 'slice', bytes: 10, objectBytes: 0, now, ttlMs: 1_000 }).ok, true);
    assert.equal(reserveBytes(again, { id: 'slice', bytes: 15, objectBytes: 0, now: now + 10, ttlMs: 1_000 }).ok, true);
    assert.equal(reservedBytes(again), 25);

    const exact = openSql();
    ensureReservationTable(exact);
    assert.equal(reserveBytes(exact, { id: 'exact', bytes: QUOTA, objectBytes: 0, now, ttlMs: 1_000 }).ok, true);
    assert.equal(reserveBytes(exact, { id: 'over', bytes: 1, objectBytes: QUOTA, now, ttlMs: 1_000 }).ok, false);
});

if (process.env.RUN_API_TESTS !== '1') {
    test('quota reservation on the worker', { skip: 'set RUN_API_TESTS=1' }, () => {});
} else if (!existsSync(wranglerBin)) {
    test('quota reservation on the worker', { skip: 'wrangler is absent' }, () => {});
} else {
    test('two writers cannot pass 250 MB, a dead reservation expires, and one writer is unchanged', { timeout: 180000 }, async () => {
        const persistTo = mkdtempSync(path.join(tmpdir(), 'voyage-quota-'));
        const port = 18890;
        const base = `http://127.0.0.1:${port}`;
        let child = null;
        try {
            runWrangler(['d1', 'migrations', 'apply', 'voyage', '--local', '--persist-to', persistTo]);
            const stamp = randomBytes(4).toString('hex');
            const cookie = userCookie(`qta${stamp}`, `qta${stamp}@localhost`, persistTo);
            const headers = { cookie, 'content-type': 'application/json' };
            child = startDev({
                port,
                persistTo,
                inspectorPort: 19890,
                args: ['--var', 'GENERATE_PAUSE:20000', '--var', 'QUOTA_RESERVATION_MS:4000'],
            });
            await up(base);

            const created = await jsonFetch(`${base}/api/universes`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ name: 'Quota', truthVersion: null, editionDefault: 'MgT2E' }),
            });
            assert.equal(created.status, 201, JSON.stringify(created.body));
            const id = created.body.data.id;

            const first = await jsonFetch(`${base}/api/universes/${id}/generate`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ hexKeys: ['blank/1910'], edition: 'MgT2E', generator: 'top-down', roll: 0, baseRev: 0 }),
            });
            assert.equal(first.status, 200, JSON.stringify(first.body));
            assert.equal(objectBytes(persistTo, id), treeSize('blank/1910'));

            sqlFile(persistTo, `UPDATE universes SET object_bytes = ${QUOTA} WHERE id = '${id}';`);
            const alone = await jsonFetch(`${base}/api/universes/${id}/generate`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ hexKeys: ['blank/1911'], edition: 'MgT2E', generator: 'top-down', roll: 0, baseRev: 0 }),
            });
            assert.equal(alone.status, 400, JSON.stringify(alone.body));
            assert.equal(alone.body.error.code, 'too_large');
            assert.equal(alone.body.error.message, QUOTA_SENTENCE);
            assert.equal(objectBytes(persistTo, id), QUOTA);

            const left = webp(1000, 1);
            const right = webp(2000, 2);
            const room = left.length + right.length - 1;
            sqlFile(persistTo, `UPDATE universes SET object_bytes = ${QUOTA - room} WHERE id = '${id}';`);
            const put = (bytes) => fetch(`${base}/api/universes/${id}/objects/${sha(bytes)}`, {
                method: 'PUT',
                headers: { cookie, 'content-type': 'image/webp' },
                body: bytes,
            });
            const raced = await Promise.all([put(left), put(right)]);
            const bodies = await Promise.all(raced.map((item) => item.json()));
            const statuses = raced.map((item) => item.status).sort((a, b) => a - b);
            assert.deepEqual(statuses, [201, 400], JSON.stringify(bodies));
            const refusedBody = bodies[raced.findIndex((item) => item.status === 400)];
            assert.equal(refusedBody.error.message, QUOTA_SENTENCE);
            const winner = raced[0].status === 201 ? left.length : right.length;
            const afterRace = objectBytes(persistTo, id);
            assert.equal(afterRace, QUOTA - room + winner);
            assert.ok(afterRace <= QUOTA);

            const slice = treeSize('blank/0101') + treeSize('blank/0102');
            sqlFile(persistTo, `UPDATE universes SET object_bytes = ${QUOTA - slice} WHERE id = '${id}';`);
            const posted = await jsonFetch(`${base}/api/universes/${id}/generate`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ hexKeys: ['blank/0101', 'blank/0102'], edition: 'MgT2E', generator: 'top-down' }),
            });
            assert.equal(posted.status, 202, JSON.stringify(posted.body));
            const jobId = posted.body.data.jobId;
            const probe = webp(64, 9);
            let held = null;
            const holdBy = Date.now() + 60000;
            while (Date.now() < holdBy) {
                const read = await jsonFetch(`${base}/api/universes/${id}/jobs/${jobId}`, { headers: { cookie } });
                const live = read.body.data;
                if (live.state === 'failed') assert.fail(JSON.stringify(live));
                // The batch marks the job done, then the consumer pauses before finishCounts.
                if (live.done > 0 || live.state === 'done') {
                    // Probe before the local D1 read. That read can take longer than the
                    // four-second reservation when other suites are on the same disk.
                    held = await put(probe);
                    assert.equal(objectBytes(persistTo, id), QUOTA - slice, JSON.stringify(live));
                    break;
                }
                await sleep(30);
            }
            assert.ok(held, 'the job never reserved its objects');
            const heldBody = await held.json();
            assert.equal(held.status, 400, JSON.stringify(heldBody));
            assert.equal(heldBody.error.message, QUOTA_SENTENCE);
            await sleep(5000);
            const expired = await put(webp(64, 10));
            const expiredBody = await expired.json();
            assert.equal(expired.status, 201, JSON.stringify(expiredBody));
            const finished = await waitJob(base, id, cookie, jobId);
            assert.equal(finished.state, 'done', JSON.stringify(finished));
            // The batch marks the job done before finishCounts. The probe landed in that gap,
            // after the reservation expired, so finishCounts then takes the universe over the cap by the probe.
            const chargeBy = Date.now() + 30000;
            let charged = objectBytes(persistTo, id);
            while (charged !== QUOTA + probe.length && Date.now() < chargeBy) {
                await sleep(200);
                charged = objectBytes(persistTo, id);
            }
            assert.equal(charged, QUOTA + probe.length);
        } finally {
            if (child) stopDev(child.pid);
            removeTree(persistTo);
        }
    });
}

async function waitJob(base, id, cookie, jobId) {
    const deadline = Date.now() + 90000;
    let job = null;
    while (Date.now() < deadline) {
        const read = await jsonFetch(`${base}/api/universes/${id}/jobs/${jobId}`, { headers: { cookie } });
        assert.equal(read.status, 200, JSON.stringify(read.body));
        job = read.body.data;
        if (job.state === 'done' || job.state === 'failed' || job.state === 'stopped') return job;
        await sleep(100);
    }
    throw new Error(`job did not finish ${JSON.stringify(job)}`);
}
