import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { removeTree, runWrangler } from './session.js';
import { startDev, stopDev, wranglerBin } from './server.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const STAMP = '2026-10-18T00:00:00.000Z';
const SHIP = 'cr_bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';
const SECRET = 'cr_bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
const OTHER = 'cr_cccccccc-cccc-4ccc-8ccc-ccccccccccc1';
const HEARD = 'cj_bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';
const HIDDEN = 'cj_bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
const OUTSIDE = 'The port is open.';
const INSIDE = 'The password is nightfall.';
const CLOSED = `${OUTSIDE}\n:::referee\n${INSIDE}\n:::\nStill ${OUTSIDE}`;
const UNCLOSED = `${OUTSIDE}\n:::referee\n${INSIDE}\nStill ${OUTSIDE}`;

function authSecret() {
    const text = readFileSync(path.join(root, 'apps', 'api', '.dev.vars'), 'utf8');
    const line = text.split(/\r?\n/).find((item) => item.startsWith('BETTER_AUTH_SECRET='));
    if (!line) throw new Error('BETTER_AUTH_SECRET is unset');
    const value = line.slice('BETTER_AUTH_SECRET='.length).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) return value.slice(1, -1);
    return value;
}

function sqlFile(persistTo, sql) {
    const dir = mkdtempSync(path.join(tmpdir(), 'voyage-demo-'));
    const file = path.join(dir, 'rows.sql');
    writeFileSync(file, sql);
    try {
        runWrangler(['d1', 'execute', 'voyage', '--local', '--persist-to', persistTo, '--file', file]);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

function userCookie(userId, email, persistTo) {
    const now = Date.now();
    const expires = now + 30 * 24 * 60 * 60 * 1000;
    const token = randomBytes(32).toString('hex');
    const sessionId = `${userId}-${randomBytes(8).toString('hex')}`;
    sqlFile(persistTo, `
INSERT INTO user (id, name, email, email_verified, created_at, updated_at, role, banned)
VALUES ('${userId}', '${userId}', '${email}', 1, ${now}, ${now}, 'user', 0);
INSERT INTO session (id, expires_at, token, created_at, updated_at, user_id)
VALUES ('${sessionId}', ${expires}, '${token}', ${now}, ${now}, '${userId}');
`);
    const signature = createHmac('sha256', authSecret()).update(token).digest('base64');
    return `__Secure-better-auth.session_token=${encodeURIComponent(`${token}.${signature}`)}`;
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function up(url) {
    const deadline = Date.now() + 40000;
    let last = '';
    while (Date.now() < deadline) {
        try {
            const response = await fetch(`${url}/api/health`);
            if (response.ok) return;
            last = `status ${response.status}`;
        } catch (err) {
            last = err instanceof Error ? err.message : String(err);
        }
        await sleep(400);
    }
    throw new Error(last || 'wrangler did not answer /api/health');
}

async function jsonFetch(url, options = {}) {
    const response = await fetch(url, options);
    const text = await response.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text }; }
    return { status: response.status, body, headers: response.headers };
}

function record(id, over = {}) {
    return {
        id,
        type: 'vessel',
        kind: '',
        name: 'Open barge',
        summary: '',
        details: '',
        tags: [],
        anchor: null,
        when: null,
        visibility: 'players',
        playerNotes: null,
        sheet: null,
        status: { fuelTons: 12, fuelMark: 'scout' },
        images: null,
        provenance: { mode: 'copy', universeId: 'uni_secret_origin', recordId: 'rec_secret_origin', rev: 1, at: STAMP },
        rev: 0,
        createdAt: STAMP,
        updatedAt: STAMP,
        deleted: false,
        baseRev: 0,
        ...over,
    };
}

function note(id, over = {}) {
    return {
        id,
        kind: 'note',
        title: 'Heard at the port',
        body: 'The barge is fuelled.',
        when: null,
        realDate: null,
        sequence: null,
        author: 'referee',
        visibility: 'players',
        anchor: null,
        mentions: [],
        rev: 0,
        createdAt: STAMP,
        updatedAt: STAMP,
        deleted: false,
        baseRev: 0,
        ...over,
    };
}

function settings() {
    return {
        party: { vesselId: SHIP, memberIds: [], anchor: null },
        kinds: {},
        calendar: { dateFormat: 'imperial' },
        rev: 0,
        baseRev: 0,
    };
}

if (process.env.RUN_API_TESTS !== '1') {
    test('demo campaign on the worker', { skip: 'set RUN_API_TESTS=1' }, () => {});
} else if (!existsSync(wranglerBin)) {
    test('demo campaign on the worker', { skip: 'wrangler is absent' }, () => {});
} else {
    test('demo campaign on the worker', { timeout: 180000 }, async () => {
        const persistTo = path.join(root, '.tmp', 'lane-b-demo');
        removeTree(persistTo);
        const port = 18901;
        const base = `http://127.0.0.1:${port}`;
        let child;
        try {
            runWrangler(['d1', 'migrations', 'apply', 'voyage', '--local', '--persist-to', persistTo]);
            sqlFile(persistTo, 'ALTER TABLE universes DROP COLUMN demo;');
            const stamp = randomBytes(3).toString('hex');
            const version = `dm${stamp}`;
            sqlFile(persistTo, `
INSERT INTO truth_versions (version, engine_version, state, started_at, released_at, sectors_total, sectors_done)
VALUES ('${version}', '1.2.0', 'released', '${STAMP}', '${STAMP}', 0, 0);
`);
            const ownerId = `dmo${stamp}`;
            const owner = userCookie(ownerId, `${ownerId}@localhost`, persistTo);
            child = startDev({ port, persistTo, inspectorPort: 19901 });
            await up(base);
            const origin = base;
            const headers = { 'content-type': 'application/json', cookie: owner, origin };

            const missing = await jsonFetch(`${base}/api/demo/campaign`);
            assert.equal(missing.status, 503, JSON.stringify(missing.body));
            assert.equal(missing.body.error.code, 'demo_unavailable');
            assert.equal(missing.body.error.message, 'The example campaign is not available yet.');
            assert.equal(missing.headers.get('cache-control'), 'private, no-store');

            sqlFile(persistTo, 'ALTER TABLE universes ADD COLUMN demo integer NOT NULL DEFAULT 0;');
            const none = await jsonFetch(`${base}/api/demo/campaign`);
            assert.equal(none.status, 404, JSON.stringify(none.body));
            assert.equal(none.body.error.code, 'not_found');
            assert.equal(none.body.error.message, 'No example campaign is published.');

            const posted = await jsonFetch(`${base}/api/demo/campaign`, { method: 'POST', headers, body: '{}' });
            assert.equal(posted.status, 404, JSON.stringify(posted.body));
            assert.equal(posted.body.error.message, 'That page does not exist.');

            const older = await jsonFetch(`${base}/api/universes`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ name: 'Example', truthVersion: version, editionDefault: 'MgT2E' }),
            });
            assert.equal(older.status, 201, JSON.stringify(older.body));
            const olderId = older.body.data.id;
            const newer = await jsonFetch(`${base}/api/universes`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ name: 'Later example', truthVersion: version, editionDefault: 'MgT2E' }),
            });
            assert.equal(newer.status, 201, JSON.stringify(newer.body));
            const newerId = newer.body.data.id;
            assert.match(olderId, /^[A-Za-z0-9_-]+$/);
            assert.match(newerId, /^[A-Za-z0-9_-]+$/);

            const seeded = await jsonFetch(`${base}/api/universes/${olderId}/campaign/changes`, {
                method: 'PATCH',
                headers,
                body: JSON.stringify({
                    records: [
                        record(SHIP, { details: CLOSED, summary: UNCLOSED }),
                        record(SECRET, {
                            name: 'Secret patron',
                            details: 'The patron is a plant.',
                            visibility: 'referee',
                            sheet: { dossier: 'do-not-publish' },
                            status: null,
                            provenance: null,
                        }),
                    ],
                    journal: [
                        note(HEARD, { body: `${CLOSED}\n${UNCLOSED}` }),
                        note(HIDDEN, {
                            title: 'Do not tell the players',
                            body: 'The patron is a plant.',
                            visibility: 'referee',
                        }),
                    ],
                    settings: settings(),
                }),
            });
            assert.equal(seeded.status, 200, JSON.stringify(seeded.body));
            const otherSeed = await jsonFetch(`${base}/api/universes/${newerId}/campaign/changes`, {
                method: 'PATCH',
                headers,
                body: JSON.stringify({
                    records: [record(OTHER, { name: 'Other ship', status: null, provenance: null })],
                    settings: { ...settings(), party: { vesselId: OTHER, memberIds: [], anchor: null } },
                }),
            });
            assert.equal(otherSeed.status, 200, JSON.stringify(otherSeed.body));

            sqlFile(persistTo, `
UPDATE universes SET demo = 1, created_at = '2026-10-01T00:00:00.000Z' WHERE id = '${olderId}';
UPDATE universes SET demo = 1, created_at = '2026-10-02T00:00:00.000Z' WHERE id = '${newerId}';
`);
            const published = await jsonFetch(`${base}/api/demo/campaign`);
            assert.equal(published.status, 200, JSON.stringify(published.body));
            assert.equal(published.headers.get('cache-control'), 'public, max-age=60');
            assert.equal(published.body.ok, true);
            const data = published.body.data;
            assert.deepEqual(Object.keys(data).sort(), ['clock', 'journal', 'links', 'records', 'settings']);
            assert.equal('pendingProposals' in data, false);
            assert.equal(data.records.length, 1);
            assert.equal(data.records[0].name, 'Open barge');
            assert.equal(data.records[0].status.fuelTons, 12);
            assert.equal(data.records[0].status.fuelMark, undefined);
            assert.equal('rev' in data.records[0], false);
            assert.equal('provenance' in data.records[0], false);
            assert.equal(data.journal.length, 1);
            assert.equal(data.journal[0].title, 'Heard at the port');
            assert.equal('rev' in data.journal[0], false);
            assert.equal('authorId' in data.journal[0], false);
            assert.equal('authorName' in data.journal[0], false);
            const packed = JSON.stringify(published.body);
            assert.equal(packed.includes(ownerId), false);
            assert.equal(packed.includes('Secret patron'), false);
            assert.equal(packed.includes('The patron is a plant.'), false);
            assert.equal(packed.includes('do-not-publish'), false);
            assert.equal(packed.includes('uni_secret_origin'), false);
            assert.equal(packed.includes('rec_secret_origin'), false);
            assert.equal(packed.includes('Do not tell the players'), false);
            assert.equal(packed.includes('Other ship'), false);
            assert.equal(packed.includes(olderId), false);
            assert.equal(packed.includes(newerId), false);
            assert.equal(packed.includes(INSIDE), false);
            assert.equal(packed.includes(':::referee'), false);
            assert.equal(packed.includes('\n:::'), false);
            assert.equal(packed.includes(OUTSIDE), true);
            assert.match(data.records[0].details, /Still The port is open\./);
            assert.match(data.records[0].summary, /The port is open\./);
            assert.equal(data.records[0].summary.includes('Still'), false);
            assert.match(data.journal[0].body, /Still The port is open\./);
            assert.equal(data.journal[0].body.includes(INSIDE), false);

            sqlFile(persistTo, `UPDATE universes SET deleted_at = '${STAMP}' WHERE id = '${olderId}';`);
            const later = await jsonFetch(`${base}/api/demo/campaign`);
            assert.equal(later.status, 200, JSON.stringify(later.body));
            assert.equal(later.body.data.records.length, 1);
            assert.equal(later.body.data.records[0].name, 'Other ship');

            let limited = null;
            for (let n = 0; n < 61; n += 1) {
                limited = await jsonFetch(`${base}/api/demo/campaign`, { headers: { 'cf-connecting-ip': '203.0.113.50' } });
            }
            assert.equal(limited.status, 429, JSON.stringify(limited.body));
            assert.equal(limited.body.error.code, 'rate_limited');
            assert.equal(limited.body.error.message, 'Too many requests.');
            assert.equal(limited.headers.get('cache-control'), 'private, no-store');
            const otherIp = await jsonFetch(`${base}/api/demo/campaign`, { headers: { 'cf-connecting-ip': '203.0.113.51' } });
            assert.equal(otherIp.status, 200, JSON.stringify(otherIp.body));
            assert.equal(otherIp.body.data.records[0].name, 'Other ship');
        } finally {
            stopDev(child?.pid);
            removeTree(persistTo);
        }
    });
}
