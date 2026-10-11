import assert from 'node:assert/strict';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { stable } from '@voyage/shared';
import { generateHex } from '@voyage/generation';
import { TRUTH_SEED, TRUTH_SETTINGS } from '../../tools/truth/settings.js';
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
INSERT INTO truth_versions (version, engine_version, milieu, seed, settings, sectors, state, started_at, released_at, sectors_total, sectors_done, sectors_failed)
VALUES ('bclose', '1.1.0', '', '${TRUTH_SEED}', '${JSON.stringify(TRUTH_SETTINGS).replaceAll("'", "''")}', '[]', 'released', '2026-10-10T00:00:00.000Z', '2026-10-10T00:00:00.000Z', 1, 1, '[]');
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

function publishChart(persistTo) {
    const envelope = generateHex({
        hexKey: 'Spinward_Marches/1910',
        edition: 'MgT2E',
        mode: 'top-down',
        summary: { type: 'SYSTEM_PRESENT', name: 'Regina' },
        pinned: { seed: TRUTH_SEED, settings: { ...TRUTH_SETTINGS }, engineVersion: '1.1.0' },
    });
    const bytes = stable(envelope);
    const hash = createHash('sha256').update(bytes).digest('hex');
    const dir = mkdtempSync(path.join(tmpdir(), 'voyage-chart-'));
    const treeFile = path.join(dir, 'tree.json');
    const indexFile = path.join(dir, 'index.json');
    writeFileSync(treeFile, bytes);
    writeFileSync(indexFile, JSON.stringify({
        hexes: {
            '1910': {
                tree: hash, type: 'SYSTEM_PRESENT', name: 'Regina', uwp: 'A788899-C',
                allegiance: 'ImDd', zone: '', bases: 'NS', tradeCodes: ['Ri'], pbg: '000', ix: 0, partial: null,
            },
        },
    }));
    try {
        runWrangler(['r2', 'object', 'put', `voyage-public/objects/${hash}`, '--local', '--persist-to', persistTo, '--file', treeFile, '--content-type', 'application/json']);
        runWrangler(['r2', 'object', 'put', 'voyage-public/truth/bclose/sectors/Spinward_Marches/index.json', '--local', '--persist-to', persistTo, '--file', indexFile, '--content-type', 'application/json']);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
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

if (process.env.RUN_API_TESTS !== '1') {
    test('builder close on the worker', { skip: 'set RUN_API_TESTS=1' }, () => {});
} else {
    test('design a published chart hex at rev 0, and keep several new bodies in one draft', { timeout: 300000 }, async () => {
        const persistTo = mkdtempSync(path.join(tmpdir(), 'voyage-close-'));
        const port = 18834;
        const inspectorPort = 19834;
        const base = `http://127.0.0.1:${port}`;
        let child = null;
        try {
            runWrangler(['d1', 'migrations', 'apply', 'voyage', '--local', '--persist-to', persistTo]);
            const stamp = randomBytes(4).toString('hex');
            const cookie = userCookie(`cls${stamp}`, `cls${stamp}@localhost`, persistTo);
            const headers = { 'content-type': 'application/json', cookie };
            child = startDev({ port, persistTo, inspectorPort });
            await up(base);
            publishChart(persistTo);

            const created = await jsonFetch(`${base}/api/universes`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ name: 'Charted', truthVersion: 'bclose', editionDefault: 'MgT2E' }),
            });
            assert.equal(created.status, 201, JSON.stringify(created.body));
            const id = created.body.data.id;
            const hex = (local) => `${base}/api/universes/${id}/hexes/Spinward_Marches/${local}`;

            const designed = await jsonFetch(`${hex('1910')}/design`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ baseRev: 0 }),
            });
            assert.equal(designed.status, 200, JSON.stringify(designed.body));
            assert.equal(designed.body.data.state, 'override');
            assert.equal(designed.body.data.rev, 1);
            const designedObject = await jsonFetch(`${base}/api/universes/${id}/objects/${designed.body.data.treeHash}`, { headers: { cookie } });
            assert.equal(designedObject.body.kind, 'hand');
            assert.equal(designedObject.text.includes('mgtSystem'), false);

            const undone = await jsonFetch(`${hex('1910')}/revert`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ toRev: 0, baseRev: designed.body.data.rev }),
            });
            assert.equal(undone.status, 200, JSON.stringify(undone.body));
            assert.equal(undone.body.data.state, 'truth');
            assert.equal(undone.body.data.rev, 0);

            const again = await jsonFetch(`${hex('1910')}/design`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ baseRev: 0 }),
            });
            assert.equal(again.status, 200, JSON.stringify(again.body));
            const removed = await jsonFetch(`${hex('1910')}/remove`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ baseRev: again.body.data.rev }),
            });
            assert.equal(removed.status, 200, JSON.stringify(removed.body));
            assert.equal(removed.body.data.state, 'removed');
            const restored = await jsonFetch(`${hex('1910')}/restore`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ baseRev: removed.body.data.rev }),
            });
            assert.equal(restored.status, 200, JSON.stringify(restored.body));
            assert.equal(restored.body.data.state, 'truth');
            assert.equal(restored.body.data.rev, 0);

            const blank = await jsonFetch(`${hex('0101')}/blank`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ baseRev: 0 }),
            });
            assert.equal(blank.status, 200, JSON.stringify(blank.body));
            const blankObject = await jsonFetch(`${base}/api/universes/${id}/objects/${blank.body.data.treeHash}`, { headers: { cookie } });
            assert.equal(blankObject.body.kind, 'hand');
            assert.equal(Object.hasOwn(blankObject.body, 'edition'), false);
            assert.equal(blankObject.body.system.stars.length, 0);
            assert.equal(blankObject.text.includes('Lesotho'), false);

            const changes = [
                { id: 'star.add', value: true },
                { id: 's1.name', value: 'Primary' },
                { id: 'star.add', value: 'companion' },
                { id: 'companion.parent', value: 's1' },
                { id: 'body.add', value: 'w' },
                { id: 'w.name', value: 'Both' },
                { id: 'w.parent', value: 's1+companion' },
            ];
            const drafted = await jsonFetch(`${hex('0101')}/draft`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ hash: blank.body.data.treeHash, changes }),
            });
            assert.equal(drafted.status, 200, JSON.stringify(drafted.body));
            assert.equal(drafted.body.data.form.mode, 'hand');
            const kept = await jsonFetch(`${hex('0101')}/keep`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ hash: blank.body.data.treeHash, baseRev: blank.body.data.rev, changes }),
            });
            assert.equal(kept.status, 200, JSON.stringify(kept.body));
            const keptObject = await jsonFetch(`${base}/api/universes/${id}/objects/${kept.body.data.treeHash}`, { headers: { cookie } });
            assert.equal(keptObject.body.system.bodies[0].name, 'Both');
            assert.equal(keptObject.body.system.bodies[0].parentId, 's1');
            assert.equal(keptObject.body.system.bodies[0].alsoParentId, 'companion');
            assert.equal(Object.hasOwn(keptObject.body, 'edition'), false);

            const starNote = await jsonFetch(`${hex('0101')}/draft`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    hash: kept.body.data.treeHash,
                    changes: [{ id: 's1.remove', value: true }],
                }),
            });
            assert.equal(starNote.status, 200, JSON.stringify(starNote.body));
            const note = starNote.body.data.messages.find((item) => item.id === 's1.remove');
            assert.equal(note.text, '2 bodies go with this star.');
            assert.equal(note.holds, false);
            const still = await jsonFetch(`${hex('0101')}`, { headers: { cookie } });
            assert.equal(still.body.data.treeHash, kept.body.data.treeHash);

            const generated = await jsonFetch(`${base}/api/universes/${id}/generate`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    hexKeys: ['Spinward_Marches/0202'],
                    edition: 'MgT2E',
                    generator: 'top-down',
                    roll: 1,
                    baseRev: 0,
                    filledToo: false,
                }),
            });
            assert.equal(generated.status, 200, JSON.stringify(generated.body));
            assert.equal(generated.body.data.rows[0].rev, 1);
            const designedAgain = await jsonFetch(`${hex('0202')}/design`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ baseRev: generated.body.data.rows[0].rev }),
            });
            assert.equal(designedAgain.status, 200, JSON.stringify(designedAgain.body));
            const secondDesign = await jsonFetch(`${hex('0202')}/design`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ baseRev: designedAgain.body.data.rev }),
            });
            assert.equal(secondDesign.status, 400, JSON.stringify(secondDesign.body));
            const named = await jsonFetch(`${hex('0202')}/keep`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    hash: designedAgain.body.data.treeHash,
                    baseRev: designedAgain.body.data.rev,
                    changes: [{ id: 'system.name', value: 'Hand Kept' }],
                }),
            });
            assert.equal(named.status, 200, JSON.stringify(named.body));
            const preview = await jsonFetch(`${base}/api/generate/preview`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    edition: 'MgT2E',
                    mode: 'top-down',
                    seed: TRUTH_SEED,
                    settings: TRUTH_SETTINGS,
                    hexKey: 'Spinward_Marches/0202',
                    inputs: { type: 'SYSTEM_PRESENT' },
                }),
            });
            assert.equal(preview.status, 200, JSON.stringify(preview.body).slice(0, 300));
            assert.equal(preview.body.data.envelope.kind, 'tree');
            const left = await jsonFetch(`${base}/api/universes/${id}/generate`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    hexKeys: ['Spinward_Marches/0202'],
                    edition: 'MgT2E',
                    generator: 'top-down',
                    roll: 2,
                    baseRev: named.body.data.rev,
                    filledToo: false,
                }),
            });
            assert.equal(left.status, 200, JSON.stringify(left.body));
            assert.deepEqual(left.body.data.skipped, ['Spinward_Marches/0202']);
            const replaced = await jsonFetch(`${base}/api/universes/${id}/generate`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    hexKeys: ['Spinward_Marches/0202'],
                    edition: 'MgT2E',
                    generator: 'top-down',
                    roll: 2,
                    baseRev: named.body.data.rev,
                    filledToo: true,
                }),
            });
            assert.equal(replaced.status, 200, JSON.stringify(replaced.body));
            const tree = await jsonFetch(`${base}/api/universes/${id}/objects/${replaced.body.data.rows[0].treeHash}`, { headers: { cookie } });
            assert.equal(tree.body.kind, 'tree');
            const back = await jsonFetch(`${hex('0202')}/revert`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ toRev: named.body.data.rev, baseRev: replaced.body.data.rows[0].rev }),
            });
            assert.equal(back.status, 200, JSON.stringify(back.body));
            assert.equal(back.body.data.treeHash, named.body.data.treeHash);
            const handAgain = await jsonFetch(`${base}/api/universes/${id}/objects/${back.body.data.treeHash}`, { headers: { cookie } });
            assert.equal(handAgain.body.kind, 'hand');
            assert.equal(handAgain.body.system.name, 'Hand Kept');
        } finally {
            if (child) stopDev(child.pid);
            rmSync(persistTo, { recursive: true, force: true });
        }
    });
}
