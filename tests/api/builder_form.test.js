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

function field(form, id) {
    for (const section of form.sections) {
        const found = section.fields.find((item) => item.id === id);
        if (found) return found;
    }
    return null;
}

if (process.env.RUN_API_TESTS !== '1') {
    test('builder form on the worker', { skip: 'set RUN_API_TESTS=1' }, () => {});
} else {
    test('draft stores nothing, keep writes one rev, revert restores it', { timeout: 300000 }, async () => {
        const persistTo = mkdtempSync(path.join(tmpdir(), 'voyage-form-'));
        const port = 18832;
        const inspectorPort = 19832;
        const base = `http://127.0.0.1:${port}`;
        let child = null;
        try {
            runWrangler(['d1', 'migrations', 'apply', 'voyage', '--local', '--persist-to', persistTo]);
            const stamp = randomBytes(4).toString('hex');
            const cookie = userCookie(`frm${stamp}`, `frm${stamp}@localhost`, persistTo);
            const headers = { 'content-type': 'application/json', cookie };
            child = startDev({ port, persistTo, inspectorPort });
            await up(base);

            const created = await jsonFetch(`${base}/api/universes`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ name: 'Form map', truthVersion: null, editionDefault: 'MgT2E' }),
            });
            assert.equal(created.status, 201, JSON.stringify(created.body));
            const id = created.body.data.id;
            const hex = (local) => `${base}/api/universes/${id}/hexes/blank/${local}`;

            const missing = await jsonFetch(`${hex('1910')}/form`, { headers: { cookie } });
            assert.equal(missing.status, 404, JSON.stringify(missing.body));

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
            const before = await jsonFetch(`${base}/api/universes/${id}/objects/${row.treeHash}`, { headers: { cookie } });
            assert.equal(before.status, 200, before.text.slice(0, 200));

            const form = await jsonFetch(`${hex('1910')}/form`, { headers: { cookie } });
            assert.equal(form.status, 200, JSON.stringify(form.body));
            assert.equal(form.body.data.hash, row.treeHash);
            assert.equal(form.body.data.form.edition, 'MgT2E');
            assert.equal(form.body.data.form.sections.at(-1).id, 'rules');
            assert.equal(field(form.body.data.form, 'rule.R1').permission, 'read');
            assert.equal(field(form.body.data.form, 'chart.allegiance') != null, true);

            const unknown = await jsonFetch(`${hex('1910')}/draft`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ hash: row.treeHash, changes: [{ id: 'no.such', value: 'x' }] }),
            });
            assert.equal(unknown.status, 400, JSON.stringify(unknown.body));

            const locked = await jsonFetch(`${hex('1910')}/draft`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ hash: row.treeHash, changes: [{ id: 'rule.R1', value: 'checked' }] }),
            });
            assert.equal(locked.status, 400, JSON.stringify(locked.body));

            const draft = await jsonFetch(`${hex('1910')}/draft`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ hash: row.treeHash, changes: [{ id: 'chart.allegiance', value: 'Im' }] }),
            });
            assert.equal(draft.status, 200, JSON.stringify(draft.body));
            assert.equal(field(draft.body.data.form, 'chart.allegiance').value, 'Im');
            assert.equal(draft.body.data.changed.some((item) => item.id === 'chart.allegiance'), true);
            const during = await jsonFetch(`${base}/api/universes/${id}/objects/${row.treeHash}`, { headers: { cookie } });
            assert.equal(during.text, before.text);
            const still = await jsonFetch(`${hex('1910')}`, { headers: { cookie } });
            assert.equal(still.body.data.treeHash, row.treeHash);
            assert.equal(still.body.data.rev, row.rev);

            const stale = await jsonFetch(`${hex('1910')}/keep`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    hash: row.treeHash,
                    baseRev: 0,
                    changes: [{ id: 'chart.allegiance', value: 'Im' }],
                }),
            });
            assert.equal(stale.status, 409, JSON.stringify(stale.body));
            const afterStale = await jsonFetch(`${hex('1910')}`, { headers: { cookie } });
            assert.equal(afterStale.body.data.treeHash, row.treeHash);

            const kept = await jsonFetch(`${hex('1910')}/keep`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    hash: row.treeHash,
                    baseRev: row.rev,
                    changes: [{ id: 'chart.allegiance', value: 'Im' }],
                }),
            });
            assert.equal(kept.status, 200, JSON.stringify(kept.body));
            assert.equal(kept.body.data.rev, row.rev + 1);
            assert.notEqual(kept.body.data.treeHash, row.treeHash);
            assert.equal(kept.body.data.roll, 0);
            assert.equal(kept.body.data.baseHash, row.baseHash);
            const object = await jsonFetch(`${base}/api/universes/${id}/objects/${kept.body.data.treeHash}`, { headers: { cookie } });
            assert.equal(object.status, 200, object.text.slice(0, 200));
            const indexed = SectorHex.parse(chartEntry(object.body.body, kept.body.data.treeHash));
            assert.deepEqual(kept.body.data.entry, indexed);
            assert.equal(kept.body.data.entry.allegiance, 'Im');

            const keptForm = await jsonFetch(`${hex('1910')}/form`, { headers: { cookie } });
            assert.equal(keptForm.body.data.hash, kept.body.data.treeHash);
            assert.equal(field(keptForm.body.data.form, 'chart.allegiance').value, 'Im');

            const undone = await jsonFetch(`${hex('1910')}/revert`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ toRev: row.rev, baseRev: kept.body.data.rev }),
            });
            assert.equal(undone.status, 200, JSON.stringify(undone.body));
            assert.equal(undone.body.data.treeHash, row.treeHash);
            assert.equal(undone.body.data.rev, kept.body.data.rev + 1);

            const filled = await jsonFetch(`${hex('1910')}/blank`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ edition: 'MgT2E', baseRev: undone.body.data.rev }),
            });
            assert.equal(filled.status, 400, JSON.stringify(filled.body));

            const odd = await jsonFetch(`${hex('1912')}/blank`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ edition: 'MgT2E', baseRev: 0, starType: 'Q' }),
            });
            assert.equal(odd.status, 400, JSON.stringify(odd.body));
            const absent = await jsonFetch(`${hex('1912')}`, { headers: { cookie } });
            assert.equal(absent.status, 404, JSON.stringify(absent.body));

            const blank = await jsonFetch(`${hex('1911')}/blank`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ edition: 'MgT2E', baseRev: 0 }),
            });
            assert.equal(blank.status, 200, JSON.stringify(blank.body));
            assert.equal(blank.body.data.rev, 1);
            assert.equal(blank.body.data.roll, 0);
            assert.match(blank.body.data.treeHash, /^[0-9a-f]{64}$/);
            const blankForm = await jsonFetch(`${hex('1911')}/form`, { headers: { cookie } });
            assert.equal(blankForm.status, 200, JSON.stringify(blankForm.body));
            assert.equal(field(blankForm.body.data.form, 'star.0.type').value, 'G');
            assert.equal(field(blankForm.body.data.form, 'star.0.subtype') != null, true);
            assert.equal(field(blankForm.body.data.form, 'star.0.class') != null, true);
        } finally {
            if (child) stopDev(child.pid);
            rmSync(persistTo, { recursive: true, force: true });
        }
    });
}
