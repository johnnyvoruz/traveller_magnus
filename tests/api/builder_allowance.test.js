import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { rollHoldsSystem } from '@voyage/generation';
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

function userCookie(userId, email, persistTo, role = 'user') {
    const now = Date.now();
    const expires = now + 30 * 24 * 60 * 60 * 1000;
    const token = randomBytes(32).toString('hex');
    const sessionId = `${userId}-${randomBytes(8).toString('hex')}`;
    const sql = `
INSERT INTO user (id, name, email, email_verified, created_at, updated_at, role, banned)
VALUES ('${userId}', '${userId}', '${email}', 1, ${now}, ${now}, '${role}', 0);
INSERT INTO session (id, expires_at, token, created_at, updated_at, user_id)
VALUES ('${sessionId}', ${expires}, '${token}', ${now}, ${now}, '${userId}');
`;
    const dir = mkdtempSync(path.join(tmpdir(), 'voyage-user-'));
    const file = path.join(dir, 'user.sql');
    writeFileSync(file, sql);
    try {
        runWrangler(['d1', 'execute', 'voyage', '--local', '--persist-to', persistTo, '--file', file]);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
    const signature = createHmac('sha256', authSecret()).update(token).digest('base64');
    return `__Secure-better-auth.session_token=${encodeURIComponent(`${token}.${signature}`)}`;
}

function sqlFile(persistTo, sql) {
    const file = path.join(persistTo, `allowance-${randomBytes(4).toString('hex')}.sql`);
    writeFileSync(file, sql);
    try {
        runWrangler(['d1', 'execute', 'voyage', '--local', '--persist-to', persistTo, '--file', file]);
    } finally {
        rmSync(file, { force: true });
    }
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

const PREVIEW = {
    edition: 'MgT2E',
    mode: 'top-down',
    seed: SEED,
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
};

function generateBody(hexKeys, extra = {}) {
    const body = {
        hexKeys,
        edition: 'MgT2E',
        generator: 'top-down',
        roll: 0,
        ...extra,
    };
    if (hexKeys.length === 1 && body.baseRev === undefined) body.baseRev = 0;
    return body;
}

function pairUnderSparse() {
    let write = null;
    let empty = null;
    for (let col = 1; col <= 32 && (!write || !empty); col += 1) {
        for (let row = 1; row <= 40 && (!write || !empty); row += 1) {
            const local = `${String(col).padStart(2, '0')}${String(row).padStart(2, '0')}`;
            const keeps = rollHoldsSystem(SEED, `blank/${local}`, 2);
            if (keeps && !write) write = local;
            if (!keeps && !empty) empty = local;
        }
    }
    if (!write || !empty) throw new Error('sparse roll had no mixed pair');
    return { write, empty };
}

if (process.env.RUN_API_TESTS !== '1') {
    test('generation allowance on the worker', { skip: 'set RUN_API_TESTS=1' }, () => {});
} else {
    test('a daily allowance caps non-admins and resets with the UTC day', { timeout: 300000 }, async () => {
        const persistTo = mkdtempSync(path.join(tmpdir(), 'voyage-allow-'));
        const port = 18843;
        const inspectorPort = 19843;
        const base = `http://127.0.0.1:${port}`;
        let child = null;
        try {
            runWrangler(['d1', 'migrations', 'apply', 'voyage', '--local', '--persist-to', persistTo]);
            const stamp = randomBytes(4).toString('hex');
            const ids = {
                cap: `cap${stamp}`,
                whole: `whl${stamp}`,
                race: `rce${stamp}`,
                clock: `clk${stamp}`,
                admin: `adm${stamp}`,
                raised: `rse${stamp}`,
                bare: `bar${stamp}`,
                sparse: `sps${stamp}`,
            };
            const cookies = {
                cap: userCookie(ids.cap, `${ids.cap}@localhost`, persistTo),
                whole: userCookie(ids.whole, `${ids.whole}@localhost`, persistTo),
                race: userCookie(ids.race, `${ids.race}@localhost`, persistTo),
                clock: userCookie(ids.clock, `${ids.clock}@localhost`, persistTo),
                admin: userCookie(ids.admin, `${ids.admin}@localhost`, persistTo, 'admin'),
                raised: userCookie(ids.raised, `${ids.raised}@localhost`, persistTo),
                bare: userCookie(ids.bare, `${ids.bare}@localhost`, persistTo),
                sparse: userCookie(ids.sparse, `${ids.sparse}@localhost`, persistTo),
            };
            sqlFile(persistTo, `
INSERT INTO generation_allowance (user_id, daily_limit, day, used) VALUES
('${ids.cap}', 5, '', 0),
('${ids.whole}', 3, '', 0),
('${ids.race}', 1, '', 0),
('${ids.clock}', 2, '1999-01-01', 2),
('${ids.admin}', 1, '', 0),
('${ids.raised}', 1, '', 0),
('${ids.sparse}', 1, '', 0);
`);
            child = startDev({ port, persistTo, inspectorPort });
            await up(base);

            const headersOf = (cookie) => ({ 'content-type': 'application/json', cookie });
            async function universe(cookie, name) {
                const created = await jsonFetch(`${base}/api/universes`, {
                    method: 'POST',
                    headers: headersOf(cookie),
                    body: JSON.stringify({ name, truthVersion: null, editionDefault: 'MgT2E' }),
                });
                assert.equal(created.status, 201, JSON.stringify(created.body));
                return created.body.data.id;
            }
            async function me(cookie) {
                const read = await jsonFetch(`${base}/api/me`, { headers: { cookie } });
                assert.equal(read.status, 200, JSON.stringify(read.body));
                return read.body.data.allowance;
            }
            async function postGenerate(cookie, id, hexKeys, extra) {
                return jsonFetch(`${base}/api/universes/${id}/generate`, {
                    method: 'POST',
                    headers: headersOf(cookie),
                    body: JSON.stringify(generateBody(hexKeys, extra)),
                });
            }
            async function absent(cookie, id, local) {
                const read = await jsonFetch(`${base}/api/universes/${id}/hexes/blank/${local}`, { headers: { cookie } });
                assert.equal(read.status, 404, `${local} ${JSON.stringify(read.body)}`);
            }

            const bare = await me(cookies.bare);
            assert.equal(bare.limit, 100);
            assert.equal(bare.used, 0);
            assert.equal(bare.remaining, 100);
            assert.match(bare.resetsAt, /^\d{4}-\d{2}-\d{2}T00:00:00.000Z$/);

            const capId = await universe(cookies.cap, 'Cap');
            const preview = await jsonFetch(`${base}/api/generate/preview`, {
                method: 'POST',
                headers: headersOf(cookies.cap),
                body: JSON.stringify(PREVIEW),
            });
            assert.equal(preview.status, 200, JSON.stringify(preview.body));
            assert.equal(preview.body.data.allowance.used, 1);
            assert.equal(preview.body.data.allowance.remaining, 4);
            assert.equal(preview.body.data.allowance.limit, 5);

            const first = await postGenerate(cookies.cap, capId, ['blank/1910']);
            assert.equal(first.status, 200, JSON.stringify(first.body));
            assert.equal(first.body.data.rows.length, 1);
            assert.equal(first.body.data.allowance.used, 2);
            const rev = first.body.data.rows[0].rev;

            const skipped = await postGenerate(cookies.cap, capId, ['blank/1910'], { baseRev: rev });
            assert.equal(skipped.status, 200, JSON.stringify(skipped.body));
            assert.deepEqual(skipped.body.data.skipped, ['blank/1910']);
            assert.equal(skipped.body.data.allowance.used, 2);

            const again = await postGenerate(cookies.cap, capId, ['blank/1910'], { filledToo: true, roll: 1, baseRev: rev });
            assert.equal(again.status, 200, JSON.stringify(again.body));
            assert.equal(again.body.data.allowance.used, 3);

            const beforeHand = (await me(cookies.cap)).used;
            const blank = await jsonFetch(`${base}/api/universes/${capId}/hexes/blank/0108/blank`, {
                method: 'POST',
                headers: headersOf(cookies.cap),
                body: JSON.stringify({ edition: 'MgT2E', baseRev: 0 }),
            });
            assert.equal(blank.status, 200, JSON.stringify(blank.body));
            assert.equal((await me(cookies.cap)).used, beforeHand);

            const accepted = await postGenerate(cookies.cap, capId, ['blank/0101', 'blank/0102']);
            assert.equal(accepted.status, 202, JSON.stringify(accepted.body));
            assert.equal(accepted.body.data.allowance.used, 5);
            assert.equal(accepted.body.data.allowance.remaining, 0);
            const jobId = accepted.body.data.jobId;
            let job = null;
            const deadline = Date.now() + 120000;
            while (Date.now() < deadline) {
                const read = await jsonFetch(`${base}/api/universes/${capId}/jobs/${jobId}`, { headers: { cookie: cookies.cap } });
                assert.equal(read.status, 200, JSON.stringify(read.body));
                job = read.body.data;
                if (job.state === 'done' || job.state === 'failed' || job.state === 'stopped') break;
                await sleep(400);
            }
            assert.equal(job.state, 'done', JSON.stringify(job));
            assert.equal(job.done, 2, JSON.stringify(job));

            const undo = await jsonFetch(`${base}/api/universes/${capId}/jobs/${jobId}/undo`, {
                method: 'POST',
                headers: headersOf(cookies.cap),
            });
            assert.equal(undo.status, 200, JSON.stringify(undo.body));
            const afterUndo = await me(cookies.cap);
            assert.equal(afterUndo.used, 5);
            assert.equal(afterUndo.remaining, 0);

            const over = await postGenerate(cookies.cap, capId, ['blank/0103']);
            assert.equal(over.status, 429, JSON.stringify(over.body));
            assert.equal(over.body.error.code, 'generation_allowance');
            assert.equal(over.body.error.details.code, 'generation_allowance');
            assert.equal(over.body.error.details.remaining, 0);
            assert.equal(over.body.error.details.limit, 5);
            assert.match(over.body.error.details.resetsAt, /^\d{4}-\d{2}-\d{2}T00:00:00.000Z$/);
            assert.equal(over.body.error.message, 'You can generate 0 more systems today. The allowance resets at 00:00 UTC.');
            await absent(cookies.cap, capId, '0103');

            const wholeId = await universe(cookies.whole, 'Whole');
            const one = await postGenerate(cookies.whole, wholeId, ['blank/1910']);
            assert.equal(one.status, 200, JSON.stringify(one.body));
            assert.equal(one.body.data.allowance.remaining, 2);
            const three = await postGenerate(cookies.whole, wholeId, ['blank/1911', 'blank/1912', 'blank/1913']);
            assert.equal(three.status, 429, JSON.stringify(three.body));
            assert.equal(three.body.error.details.code, 'generation_allowance');
            assert.equal(three.body.error.details.remaining, 2);
            assert.equal(three.body.error.details.limit, 3);
            assert.equal(three.body.error.message, 'You can generate 2 more systems today. The allowance resets at 00:00 UTC.');
            assert.equal((await me(cookies.whole)).used, 1);
            await absent(cookies.whole, wholeId, '1911');
            await absent(cookies.whole, wholeId, '1912');
            await absent(cookies.whole, wholeId, '1913');

            const raceId = await universe(cookies.race, 'Race');
            const raced = await Promise.all([
                postGenerate(cookies.race, raceId, ['blank/2001']),
                postGenerate(cookies.race, raceId, ['blank/2002']),
            ]);
            const passed = raced.filter((item) => item.status === 200);
            const refused = raced.filter((item) => item.status === 429);
            assert.equal(passed.length, 1, JSON.stringify(raced.map((item) => item.status)));
            assert.equal(refused.length, 1, JSON.stringify(raced.map((item) => ({ status: item.status, body: item.body }))));
            assert.equal(refused[0].body.error.details.code, 'generation_allowance');
            assert.equal((await me(cookies.race)).used, 1);
            const left = await jsonFetch(`${base}/api/universes/${raceId}/hexes/blank/2001`, { headers: { cookie: cookies.race } });
            const right = await jsonFetch(`${base}/api/universes/${raceId}/hexes/blank/2002`, { headers: { cookie: cookies.race } });
            assert.equal([left.status, right.status].sort().join(','), '200,404');

            const clockId = await universe(cookies.clock, 'Clock');
            const reset = await postGenerate(cookies.clock, clockId, ['blank/1910']);
            assert.equal(reset.status, 200, JSON.stringify(reset.body));
            assert.equal(reset.body.data.allowance.used, 1);
            assert.equal(reset.body.data.allowance.remaining, 1);
            assert.equal(reset.body.data.allowance.limit, 2);

            const adminId = await universe(cookies.admin, 'Admin');
            const adminMe = await me(cookies.admin);
            assert.equal(adminMe.limit, null);
            assert.equal(adminMe.remaining, null);
            assert.equal(adminMe.used, 0);
            const adminFirst = await postGenerate(cookies.admin, adminId, ['blank/1910']);
            const adminSecond = await postGenerate(cookies.admin, adminId, ['blank/1911']);
            assert.equal(adminFirst.status, 200, JSON.stringify(adminFirst.body));
            assert.equal(adminSecond.status, 200, JSON.stringify(adminSecond.body));
            assert.equal(adminSecond.body.data.allowance.limit, null);
            assert.equal(adminSecond.body.data.allowance.remaining, null);

            const raisedId = await universe(cookies.raised, 'Raised');
            const raisedFirst = await postGenerate(cookies.raised, raisedId, ['blank/1910']);
            assert.equal(raisedFirst.status, 200, JSON.stringify(raisedFirst.body));
            const raisedStop = await postGenerate(cookies.raised, raisedId, ['blank/1911']);
            assert.equal(raisedStop.status, 429, JSON.stringify(raisedStop.body));
            stopDev(child.pid);
            child = null;
            await sleep(1000);
            sqlFile(persistTo, `UPDATE generation_allowance SET daily_limit = 3 WHERE user_id = '${ids.raised}';`);
            child = startDev({ port, persistTo, inspectorPort });
            await up(base);
            const raisedMore = await postGenerate(cookies.raised, raisedId, ['blank/1911']);
            assert.equal(raisedMore.status, 200, JSON.stringify(raisedMore.body));
            assert.equal(raisedMore.body.data.allowance.limit, 3);
            assert.equal(raisedMore.body.data.allowance.used, 2);
            const raisedLast = await postGenerate(cookies.raised, raisedId, ['blank/1912']);
            assert.equal(raisedLast.status, 200, JSON.stringify(raisedLast.body));
            const raisedOver = await postGenerate(cookies.raised, raisedId, ['blank/1913']);
            assert.equal(raisedOver.status, 429, JSON.stringify(raisedOver.body));
            await absent(cookies.raised, raisedId, '1913');

            const { write, empty } = pairUnderSparse();
            const sparseId = await universe(cookies.sparse, 'Sparse');
            const mixed = await postGenerate(cookies.sparse, sparseId, [`blank/${write}`, `blank/${empty}`], { density: 'sparse' });
            assert.equal(mixed.status, 202, JSON.stringify(mixed.body));
            assert.equal(mixed.body.data.allowance.used, 1);
            assert.equal(mixed.body.data.allowance.remaining, 0);
            let sparseJob = null;
            const sparseDeadline = Date.now() + 120000;
            while (Date.now() < sparseDeadline) {
                const read = await jsonFetch(`${base}/api/universes/${sparseId}/jobs/${mixed.body.data.jobId}`, { headers: { cookie: cookies.sparse } });
                assert.equal(read.status, 200, JSON.stringify(read.body));
                sparseJob = read.body.data;
                if (sparseJob.state === 'done' || sparseJob.state === 'failed' || sparseJob.state === 'stopped') break;
                await sleep(400);
            }
            assert.equal(sparseJob.state, 'done', JSON.stringify(sparseJob));
            assert.equal(sparseJob.leftEmpty, 1, JSON.stringify(sparseJob));
            assert.deepEqual(sparseJob.placed, [`blank/${write}`]);
            await absent(cookies.sparse, sparseId, empty);
            const written = await jsonFetch(`${base}/api/universes/${sparseId}/hexes/blank/${write}`, { headers: { cookie: cookies.sparse } });
            assert.equal(written.status, 200, JSON.stringify(written.body));
        } finally {
            if (child) stopDev(child.pid);
            rmSync(persistTo, { recursive: true, force: true });
        }
    });
}
