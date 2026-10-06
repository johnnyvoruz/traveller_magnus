import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { runWrangler } from './session.js';
import { withDevServer, wranglerBin } from './server.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const STAMP = '2026-10-05T00:00:00.000Z';
const KEEP = 'cr_bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';
const GONE = 'cr_bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
const CREW = 'cl_bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';
const IMAGE = 'ab'.repeat(32);

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

function userCookie(userId, email) {
    const now = Date.now();
    const expires = now + 30 * 24 * 60 * 60 * 1000;
    const token = randomBytes(32).toString('hex');
    const sessionId = `${userId}-${randomBytes(8).toString('hex')}`;
    const sql = `
INSERT INTO user (id, name, email, email_verified, created_at, updated_at, role, banned)
VALUES ('${userId}', '${userId}', '${email}', 1, ${now}, ${now}, 'user', 0)
ON CONFLICT(id) DO UPDATE SET updated_at = ${now};
INSERT INTO session (id, expires_at, token, created_at, updated_at, user_id)
VALUES ('${sessionId}', ${expires}, '${token}', ${now}, ${now}, '${userId}');
`;
    const dir = mkdtempSync(path.join(tmpdir(), 'voyage-user-'));
    const file = path.join(dir, 'user.sql');
    writeFileSync(file, sql);
    runWrangler(['d1', 'execute', 'voyage', '--local', '--file', file]);
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
    return { status: response.status, body, headers: response.headers };
}

function record(id, name) {
    return {
        id,
        type: 'place',
        kind: '',
        name,
        summary: '',
        details: '',
        tags: [],
        anchor: null,
        when: null,
        visibility: 'referee',
        playerNotes: null,
        sheet: null,
        status: null,
        images: id === KEEP ? [{
            hash: IMAGE,
            thumbHash: IMAGE,
            width: 1,
            height: 1,
            bytes: 16,
        }] : null,
        provenance: null,
        rev: 0,
        createdAt: STAMP,
        updatedAt: STAMP,
        deleted: false,
        baseRev: 0,
    };
}

function dayOfYear(now) {
    const year = now.getUTCFullYear();
    const start = Date.UTC(year, 0, 1);
    const day = Math.floor((now.getTime() - start) / 86400000) + 1;
    return `${String(day).padStart(3, '0')}-${year}`;
}

if (process.env.RUN_API_TESTS !== '1') {
    test('campaign export', { skip: 'set RUN_API_TESTS=1' }, () => {});
} else if (!existsSync(wranglerBin)) {
    test('campaign export', { skip: 'wrangler is absent' }, () => {});
} else {
    test('campaign export', { timeout: 180000 }, async () => {
        await withDevServer(async (base) => {
            const stamp = randomBytes(4).toString('hex');
            const owner = userCookie(`kexpa${stamp}`, `kexpa${stamp}@localhost`);
            const other = userCookie(`kexpb${stamp}`, `kexpb${stamp}@localhost`);
            const headers = { cookie: owner, 'content-type': 'application/json' };
            const created = await jsonFetch(`${base}/api/universes`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ name: 'Export Proof', truthVersion: null, editionDefault: 'MgT2E' }),
            });
            assert.equal(created.status, 201, JSON.stringify(created.body));
            const id = created.body.data.id;

            const first = await jsonFetch(`${base}/api/universes/${id}/campaign/changes`, {
                method: 'PATCH',
                headers,
                body: JSON.stringify({ records: [record(KEEP, 'Regina Startown')] }),
            });
            assert.equal(first.status, 200, JSON.stringify(first.body));
            const second = await jsonFetch(`${base}/api/universes/${id}/campaign/changes`, {
                method: 'PATCH',
                headers,
                body: JSON.stringify({
                    records: [record(GONE, 'Gone')],
                    links: [{
                        id: CREW,
                        from: KEEP,
                        to: GONE,
                        kind: 'crew',
                        role: '',
                        order: 0,
                        since: null,
                        until: null,
                        notes: '',
                        visibility: 'referee',
                        provenance: null,
                        rev: 0,
                        createdAt: STAMP,
                        updatedAt: STAMP,
                        deleted: false,
                        baseRev: 0,
                    }],
                }),
            });
            assert.equal(second.status, 200, JSON.stringify(second.body));
            const third = await jsonFetch(`${base}/api/universes/${id}/campaign/changes`, {
                method: 'PATCH',
                headers,
                body: JSON.stringify({ records: [{ id: GONE, baseRev: 1, deleted: true }] }),
            });
            assert.equal(third.status, 200, JSON.stringify(third.body));

            const stolen = await jsonFetch(`${base}/api/universes/${id}/campaign/export`, {
                headers: { cookie: other },
            });
            assert.equal(stolen.status, 404, JSON.stringify(stolen.body));

            const exported = await jsonFetch(`${base}/api/universes/${id}/campaign/export`, {
                headers: { cookie: owner },
            });
            assert.equal(exported.status, 200, JSON.stringify(exported.body));
            const when = new Date(exported.body.exportedAt);
            assert.equal(Number.isNaN(when.getTime()), false);
            const filename = `Export Proof-${dayOfYear(when)}.json`;
            assert.equal(exported.headers.get('content-type'), 'application/json; charset=utf-8');
            assert.equal(exported.headers.get('content-disposition'), `attachment; filename="${filename}"`);
            assert.deepEqual(exported.body.universe, { id, name: 'Export Proof', truthVersion: null });
            assert.equal(exported.body.records.length, 1);
            assert.equal(exported.body.records[0].id, KEEP);
            assert.equal(exported.body.records[0].deleted, false);
            assert.deepEqual(exported.body.records[0].images.map((image) => image.hash), [IMAGE]);
            assert.equal(JSON.stringify(exported.body).includes('RIFF'), false);
            assert.equal(exported.body.records.some((row) => row.id === GONE), false);
            assert.equal(exported.body.links.some((row) => row.id === CREW), false);
            assert.equal(exported.body.records.some((row) => row.deleted === true), false);
            assert.equal(exported.body.links.some((row) => row.deleted === true), false);
            assert.equal(exported.body.clock, null);
            assert.equal(exported.body.settings.rev, 0);
        });
    });
}
