import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
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
    return { status: response.status, body, text };
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

function post(base, id, headers, suffix, body) {
    return jsonFetch(`${base}/api/universes/${id}${suffix}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
    });
}

if (process.env.RUN_API_TESTS !== '1') {
    test('make sectors and generate as one act', { skip: 'set RUN_API_TESTS=1' }, () => {});
} else {
    test('one act makes sectors and hexes, and one undo takes them back', { timeout: 300000 }, async () => {
        const persistTo = mkdtempSync(path.join(tmpdir(), 'voyage-sector-gen-'));
        const port = 18836;
        const inspectorPort = 19836;
        const base = `http://127.0.0.1:${port}`;
        let child = null;
        try {
            runWrangler(['d1', 'migrations', 'apply', 'voyage', '--local', '--persist-to', persistTo]);
            if (process.env.VOYAGE_BEFORE_0013 === '1') {
                const drop = path.join(persistTo, 'drop-later.sql');
                writeFileSync(drop, 'DROP TABLE IF EXISTS object_byte_charges;\nDROP TABLE IF EXISTS public_marks;\nALTER TABLE universes DROP COLUMN public_games;\n');
                runWrangler(['d1', 'execute', 'voyage', '--local', '--persist-to', persistTo, '--file', drop]);
                rmSync(drop);
            }
            const stamp = randomBytes(4).toString('hex');
            const cookie = userCookie(`gen${stamp}`, `gen${stamp}@localhost`, persistTo);
            const other = userCookie(`oth${stamp}`, `oth${stamp}@localhost`, persistTo);
            const headers = { 'content-type': 'application/json', cookie };
            child = startDev({ port, persistTo, inspectorPort });
            await up(base);

            const created = await jsonFetch(`${base}/api/universes`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ name: 'Own map', truthVersion: null, editionDefault: 'MgT2E' }),
            });
            assert.equal(created.status, 201, JSON.stringify(created.body));
            const id = created.body.data.id;

            const signedOut = await post(base, id, { 'content-type': 'application/json' }, '/generate', {
                hexKeys: ['~slot_1_1/1910'], edition: 'MgT2E', generator: 'top-down', roll: 0, baseRev: 0,
                makeSectors: [{ name: 'Far', slot: { x: 1, y: 1 } }],
            });
            assert.equal(signedOut.status, 401, JSON.stringify(signedOut.body));
            assert.equal(signedOut.body.error.message, 'Sign in required.');
            const stranger = await post(base, id, { 'content-type': 'application/json', cookie: other }, '/generate', {
                hexKeys: ['~slot_1_1/1910'], edition: 'MgT2E', generator: 'top-down', roll: 0, baseRev: 0,
                makeSectors: [{ name: 'Far', slot: { x: 1, y: 1 } }],
            });
            assert.equal(stranger.status, 404, JSON.stringify(stranger.body));
            assert.equal(stranger.body.error.message, 'No such universe.');

            const home = await post(base, id, headers, '/sectors', { name: 'Home', slot: { x: 8, y: 8 } });
            assert.equal(home.status, 201, JSON.stringify(home.body));
            const homeId = home.body.data.id;
            const homeHex = `${homeId}/1910`;
            const plain = await post(base, id, headers, '/generate', {
                hexKeys: [homeHex], edition: 'MgT2E', generator: 'top-down', roll: 0, baseRev: 0,
            });
            assert.equal(plain.status, 200, JSON.stringify(plain.body));
            assert.equal(plain.body.data.sectors, undefined);
            assert.equal(plain.body.data.rows.length, 1);
            const originalHash = plain.body.data.rows[0].treeHash;
            const emptyList = await post(base, id, headers, '/generate', {
                hexKeys: [`${homeId}/1911`], edition: 'MgT2E', generator: 'top-down', roll: 0, baseRev: 0, makeSectors: [],
            });
            assert.equal(emptyList.status, 200, JSON.stringify(emptyList.body));
            assert.equal(emptyList.body.data.jobId, undefined);
            assert.equal(emptyList.body.data.rows.length, 1);

            const refused = await post(base, id, headers, '/generate', {
                hexKeys: ['~slot_2_2/0101'], edition: 'MgT2E', generator: 'bottom-up', roll: 0, baseRev: 0,
                makeSectors: [{ name: 'No', slot: { x: 2, y: 2 } }],
            });
            assert.equal(refused.status, 400, JSON.stringify(refused.body));
            assert.equal(refused.body.error.message, 'That engine and generator are not available yet.');
            assert.equal(refused.body.error.details.reason, 'generator_unavailable');
            const afterRefuse = await jsonFetch(`${base}/api/universes/${id}/sectors`, { headers: { cookie } });
            assert.equal(afterRefuse.body.data.items.length, 1);

            const taken = await post(base, id, headers, '/generate', {
                hexKeys: ['~slot_8_8/0101'], edition: 'MgT2E', generator: 'top-down', roll: 0, baseRev: 0,
                makeSectors: [{ name: 'Again', slot: { x: 8, y: 8 } }],
            });
            assert.equal(taken.status, 409, JSON.stringify(taken.body));
            assert.equal(taken.body.error.message, 'That slot is in use. Choose another slot.');
            const afterTaken = await jsonFetch(`${base}/api/universes/${id}/sectors`, { headers: { cookie } });
            assert.equal(afterTaken.body.data.items.length, 1);

            const inline = await post(base, id, headers, '/generate', {
                hexKeys: ['~slot_3_120/1910'], edition: 'MgT2E', generator: 'top-down', roll: 0, baseRev: 0,
                makeSectors: [{ name: 'Far Reach', slot: { x: 3, y: 120 } }],
            });
            assert.equal(inline.status, 201, JSON.stringify(inline.body));
            assert.equal(inline.body.data.jobId, null);
            assert.equal(inline.body.data.rows.length, 1);
            assert.equal(inline.body.data.skipped.length, 0);
            const sectorId = inline.body.data.sectors[0].id;
            assert.equal(inline.body.data.sectors[0].rev, 1);
            assert.equal(inline.body.data.rows[0].hexKey, `${sectorId}/1910`);
            const stored = await jsonFetch(`${base}/api/universes/${id}/hexes/${encodeURIComponent(sectorId)}/1910`, { headers: { cookie } });
            assert.equal(stored.status, 200, JSON.stringify(stored.body));
            const undone = await post(base, id, headers, '/sectors/undo-generate', { sectorId, baseRev: 1 });
            assert.equal(undone.status, 200, JSON.stringify(undone.body));
            assert.equal(undone.body.data.restored, 1);
            const gone = await jsonFetch(`${base}/api/universes/${id}/hexes/${encodeURIComponent(sectorId)}/1910`, { headers: { cookie } });
            assert.equal(gone.status, 404, JSON.stringify(gone.body));
            const restored = await post(base, id, headers, `/sectors/${encodeURIComponent(sectorId)}/undo`, {
                toRev: undone.body.data.sectors[0].toRev,
                baseRev: undone.body.data.sectors[0].baseRev,
            });
            assert.equal(restored.status, 200, JSON.stringify(restored.body));
            assert.equal(restored.body.data.deleted, false);
            const back = await jsonFetch(`${base}/api/universes/${id}/hexes/${encodeURIComponent(sectorId)}/1910`, { headers: { cookie } });
            assert.equal(back.status, 200, JSON.stringify(back.body));

            const moved = await post(base, id, headers, '/generate', {
                hexKeys: ['~slot_4_121/0101'], edition: 'MgT2E', generator: 'top-down', roll: 0, baseRev: 0,
                makeSectors: [{ name: 'Shift', slot: { x: 4, y: 121 } }],
            });
            assert.equal(moved.status, 201, JSON.stringify(moved.body));
            const movedId = moved.body.data.sectors[0].id;
            const renamed = await post(base, id, headers, `/sectors/${encodeURIComponent(movedId)}/rename`, { name: 'Shifted', baseRev: 1 });
            assert.equal(renamed.status, 200, JSON.stringify(renamed.body));
            const staleSector = await post(base, id, headers, '/sectors/undo-generate', { sectorId: movedId, baseRev: 1 });
            assert.equal(staleSector.status, 409, JSON.stringify(staleSector.body));
            assert.equal(staleSector.body.error.message, 'This sector changed. Reload it, then try again.');
            const still = await jsonFetch(`${base}/api/universes/${id}/hexes/${encodeURIComponent(movedId)}/0101`, { headers: { cookie } });
            assert.equal(still.status, 200, JSON.stringify(still.body));

            const bumped = await post(base, id, headers, '/generate', {
                hexKeys: ['~slot_5_122/0101'], edition: 'MgT2E', generator: 'top-down', roll: 0, baseRev: 0,
                makeSectors: [{ name: 'Bump', slot: { x: 5, y: 122 } }],
            });
            assert.equal(bumped.status, 201, JSON.stringify(bumped.body));
            const bumpId = bumped.body.data.sectors[0].id;
            const hexRev = bumped.body.data.rows[0].rev;
            const again = await post(base, id, headers, '/generate', {
                hexKeys: [`${bumpId}/0101`], edition: 'MgT2E', generator: 'top-down', roll: 1, baseRev: hexRev, filledToo: true,
            });
            assert.equal(again.status, 200, JSON.stringify(again.body));
            const staleHex = await post(base, id, headers, '/sectors/undo-generate', { sectorId: bumpId, baseRev: 1 });
            assert.equal(staleHex.status, 409, JSON.stringify(staleHex.body));
            assert.equal(staleHex.body.error.message, 'This hex changed. Reload it, then try again.');
            const bumpStill = await jsonFetch(`${base}/api/universes/${id}/sectors`, { headers: { cookie } });
            assert.equal(bumpStill.body.data.items.some((item) => item.id === bumpId && item.deleted !== true), true);

            const queued = await post(base, id, headers, '/generate', {
                hexKeys: ['~slot_6_1/0101', '~slot_6_1/0102'], edition: 'MgT2E', generator: 'top-down', roll: 0,
                makeSectors: [{ name: 'Pair', slot: { x: 6, y: 1 } }],
            });
            assert.equal(queued.status, 202, JSON.stringify(queued.body));
            assert.equal(typeof queued.body.data.jobId, 'string');
            assert.equal(queued.body.data.rows.length, 0);
            const pairId = queued.body.data.sectors[0].id;
            const stopped = await post(base, id, headers, '/sectors/undo-generate', { jobId: queued.body.data.jobId });
            assert.equal(stopped.status, 200, JSON.stringify(stopped.body));
            await sleep(1500);
            const afterStop = await jsonFetch(`${base}/api/universes/${id}/sectors`, { headers: { cookie } });
            assert.equal(afterStop.body.data.items.some((item) => item.id === pairId), false);
            const pairHex = await jsonFetch(`${base}/api/universes/${id}/hexes/${encodeURIComponent(pairId)}/0101`, { headers: { cookie } });
            assert.equal(pairHex.status, 404, JSON.stringify(pairHex.body));
            const pairBack = await post(base, id, headers, `/sectors/${encodeURIComponent(pairId)}/undo`, {
                toRev: stopped.body.data.sectors[0].toRev,
                baseRev: stopped.body.data.sectors[0].baseRev,
            });
            assert.equal(pairBack.status, 200, JSON.stringify(pairBack.body));

            const beforeCap = await jsonFetch(`${base}/api/me`, { headers: { cookie } });
            assert.equal(beforeCap.status, 200, JSON.stringify(beforeCap.body));
            const usedBefore = beforeCap.body.data.allowance.used;
            const box = await post(base, id, headers, '/generate', {
                hexKeys: [homeHex, '~slot_11_8/0101', '~slot_12_8/0102'],
                edition: 'MgT2E', generator: 'top-down', roll: 0, filledToo: true,
                makeSectors: [{ name: 'Left', slot: { x: 11, y: 8 } }, { name: 'Right', slot: { x: 12, y: 8 } }],
            });
            assert.equal(box.status, 400, JSON.stringify(box.body));
            assert.equal(box.body.error.code, 'validation');
            assert.equal(box.body.error.message, 'The limit is one sector per request.');
            assert.equal(box.body.error.details.reason, 'one_sector');
            assert.equal(box.body.data, undefined);
            const afterCap = await jsonFetch(`${base}/api/me`, { headers: { cookie } });
            assert.equal(afterCap.body.data.allowance.used, usedBefore);
            const homeNow = await jsonFetch(`${base}/api/universes/${id}/hexes/${encodeURIComponent(homeId)}/1910`, { headers: { cookie } });
            assert.equal(homeNow.status, 200, JSON.stringify(homeNow.body));
            assert.equal(homeNow.body.data.treeHash, originalHash);
            const listed = await jsonFetch(`${base}/api/universes/${id}/sectors`, { headers: { cookie } });
            assert.equal(listed.body.data.items.some((item) => item.name === 'Left' || item.name === 'Right'), false);
            const left = await post(base, id, headers, '/generate', {
                hexKeys: ['~slot_11_8/0101', '~slot_11_8/0102'],
                edition: 'MgT2E', generator: 'top-down', roll: 0,
                makeSectors: [{ name: 'Left', slot: { x: 11, y: 8 } }],
            });
            assert.equal(left.status, 202, JSON.stringify(left.body));
            assert.equal(typeof left.body.data.jobId, 'string');
            const right = await post(base, id, headers, '/generate', {
                hexKeys: ['~slot_12_8/0101', '~slot_12_8/0102'],
                edition: 'MgT2E', generator: 'top-down', roll: 0,
                makeSectors: [{ name: 'Right', slot: { x: 12, y: 8 } }],
            });
            assert.equal(right.status, 202, JSON.stringify(right.body));
            assert.equal(typeof right.body.data.jobId, 'string');
        } finally {
            if (child) stopDev(child.pid);
            rmSync(persistTo, { recursive: true, force: true });
        }
    });
}
