import assert from 'node:assert/strict';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
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

function walk(dir, hit) {
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir)) {
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) walk(full, hit);
        else hit(full);
    }
}

function bucketFiles(root, bucket) {
    const marker = `${path.sep}${bucket}${path.sep}`;
    const files = [];
    walk(root, (full) => {
        const at = full.indexOf(marker);
        if (at < 0) return;
        files.push({ key: full.slice(at + marker.length).replaceAll('\\', '/'), full });
    });
    files.sort((a, b) => a.key.localeCompare(b.key));
    const hash = createHash('sha256');
    for (const file of files) {
        hash.update(file.key);
        hash.update(readFileSync(file.full));
    }
    return { digest: hash.digest('hex'), keys: files.map((file) => file.key) };
}

if (process.env.RUN_API_TESTS !== '1') {
    test('referee sectors on the worker', { skip: 'set RUN_API_TESTS=1' }, () => {});
} else {
    test('a referee sector stays off the chart, and a blank system stays blank', { timeout: 300000 }, async () => {
        const persistTo = mkdtempSync(path.join(tmpdir(), 'voyage-sector-'));
        const port = 18833;
        const inspectorPort = 19833;
        const base = `http://127.0.0.1:${port}`;
        let child = null;
        try {
            runWrangler(['d1', 'migrations', 'apply', 'voyage', '--local', '--persist-to', persistTo]);
            const stamp = randomBytes(4).toString('hex');
            const cookie = userCookie(`sec${stamp}`, `sec${stamp}@localhost`, persistTo);
            const other = userCookie(`oth${stamp}`, `oth${stamp}@localhost`, persistTo);
            const headers = { 'content-type': 'application/json', cookie };
            child = startDev({ port, persistTo, inspectorPort });
            await up(base);
            const before = bucketFiles(persistTo, 'voyage-public');
            const beforePrivate = bucketFiles(persistTo, 'voyage-private');

            const created = await jsonFetch(`${base}/api/universes`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ name: 'Own map', truthVersion: null, editionDefault: 'MgT2E' }),
            });
            assert.equal(created.status, 201, JSON.stringify(created.body));
            const id = created.body.data.id;

            const made = await jsonFetch(`${base}/api/universes/${id}/sectors`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ name: 'Far Reach', slot: { x: 3, y: 120 } }),
            });
            assert.equal(made.status, 201, JSON.stringify(made.body));
            const sectorId = made.body.data.id;
            assert.match(sectorId, /^~[0-9A-HJKMNP-TV-Z]{26}$/);
            const renamed = await jsonFetch(`${base}/api/universes/${id}/sectors/${encodeURIComponent(sectorId)}/rename`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ name: 'Farther Reach', baseRev: made.body.data.rev }),
            });
            assert.equal(renamed.status, 200, JSON.stringify(renamed.body));
            const named = await jsonFetch(`${base}/api/universes/${id}/sectors/${encodeURIComponent(sectorId)}/subsectors/A`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ name: 'Cronor', baseRev: renamed.body.data.rev }),
            });
            assert.equal(named.status, 200, JSON.stringify(named.body));
            assert.equal(named.body.data.subsectors[0], 'Cronor');

            const hexKey = `${sectorId}/0101`;
            const generated = await jsonFetch(`${base}/api/universes/${id}/generate`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ hexKeys: [hexKey], edition: 'MgT2E', generator: 'top-down', roll: 0, baseRev: 0 }),
            });
            assert.equal(generated.status, 200, JSON.stringify(generated.body));
            assert.equal(generated.body.data.rows[0].state, 'own');
            const generatedRow = generated.body.data.rows[0];

            const blank = await jsonFetch(`${base}/api/universes/${id}/hexes/${encodeURIComponent(sectorId)}/0102/blank`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ edition: 'MgT2E', baseRev: 0, starType: 'G', starSubtype: 2, starClass: 'V' }),
            });
            assert.equal(blank.status, 200, JSON.stringify(blank.body));
            assert.equal(blank.body.data.entry.name, '');
            assert.equal(blank.body.data.entry.uwp, '');
            const blankObject = await jsonFetch(`${base}/api/universes/${id}/objects/${blank.body.data.treeHash}`, { headers: { cookie } });
            assert.equal(blankObject.body.kind, 'hand');
            assert.equal(blankObject.body.system.name, '');
            assert.equal(blankObject.body.system.bodies.length, 0);
            assert.equal(blankObject.text.includes('Lesotho'), false);
            assert.equal(blankObject.text.includes('AA70953-E'), false);

            const drafted = await jsonFetch(`${base}/api/universes/${id}/hexes/${encodeURIComponent(sectorId)}/0102/keep`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    hash: blank.body.data.treeHash,
                    baseRev: blank.body.data.rev,
                    changes: [{ id: 'star.add', value: true }, { id: 'body.add', value: true }],
                }),
            });
            assert.equal(drafted.status, 200, JSON.stringify(drafted.body));
            assert.equal(drafted.body.data.entry.name, '');
            assert.equal(drafted.body.data.entry.uwp, '');
            const keptObject = await jsonFetch(`${base}/api/universes/${id}/objects/${drafted.body.data.treeHash}`, { headers: { cookie } });
            assert.equal(keptObject.body.system.name, '');
            assert.equal(keptObject.body.system.bodies[0].profile.st, '');
            assert.equal(keptObject.text.includes('Lesotho'), false);

            const refused = await jsonFetch(`${base}/api/universes/${id}/hexes/${encodeURIComponent(sectorId)}/0102/draft`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    hash: drafted.body.data.treeHash,
                    changes: [{ id: 'b1.profile.st', value: '77' }],
                }),
            });
            assert.equal(refused.status, 400, JSON.stringify(refused.body));

            const designed = await jsonFetch(`${base}/api/universes/${id}/hexes/${encodeURIComponent(sectorId)}/0101/design`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ baseRev: generatedRow.rev }),
            });
            assert.equal(designed.status, 200, JSON.stringify(designed.body));
            const designedObject = await jsonFetch(`${base}/api/universes/${id}/objects/${designed.body.data.treeHash}`, { headers: { cookie } });
            assert.equal(designedObject.body.kind, 'hand');
            assert.equal(designedObject.text.includes('mgtSystem'), false);
            const again = await jsonFetch(`${base}/api/universes/${id}/hexes/${encodeURIComponent(sectorId)}/0101/design`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ baseRev: designed.body.data.rev }),
            });
            assert.equal(again.status, 400, JSON.stringify(again.body));
            const reverted = await jsonFetch(`${base}/api/universes/${id}/hexes/${encodeURIComponent(sectorId)}/0101/revert`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ toRev: generatedRow.rev, baseRev: designed.body.data.rev }),
            });
            assert.equal(reverted.status, 200, JSON.stringify(reverted.body));
            assert.equal(reverted.body.data.treeHash, generatedRow.treeHash);

            const removed = await jsonFetch(`${base}/api/universes/${id}/hexes/${encodeURIComponent(sectorId)}/0102/remove`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ baseRev: drafted.body.data.rev }),
            });
            assert.equal(removed.status, 200, JSON.stringify(removed.body));
            assert.equal(removed.body.data.rev, 0);

            const stranger = await jsonFetch(`${base}/api/universes/${id}/sectors`, { headers: { cookie: other } });
            assert.equal(stranger.status, 404, JSON.stringify(stranger.body));
            const hidden = await jsonFetch(`${base}/api/universes/${id}/objects/${generatedRow.treeHash}`, { headers: { cookie: other } });
            assert.equal(hidden.status, 404, JSON.stringify(hidden.body));

            const after = bucketFiles(persistTo, 'voyage-public');
            assert.equal(after.digest, before.digest);
            assert.deepEqual(after.keys, before.keys);
            const privateKeys = bucketFiles(persistTo, 'voyage-private').keys;
            assert.equal(privateKeys.length > beforePrivate.keys.length, true);
            assert.equal(privateKeys.some((key) => key.startsWith('truth/') || key.startsWith('objects/')), false);
        } finally {
            if (child) stopDev(child.pid);
            rmSync(persistTo, { recursive: true, force: true });
        }
    });
}
