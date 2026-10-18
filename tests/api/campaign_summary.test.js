/**
 * BC1b. The list reads D1. The write response carries the summary to the Worker
 * and not to the client. A second write inside a minute leaves D1 where it was.
 */
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
const STAMP = '2026-10-04T00:00:00.000Z';
const SHIP = 'cr_00000000-0000-4000-8000-0000000000b1';
const PERSON = 'cr_00000000-0000-4000-8000-0000000000b2';

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
    return { status: response.status, body };
}

function record(id, over = {}) {
    return {
        id,
        type: 'vessel',
        kind: '',
        name: 'Far Trader',
        summary: '',
        details: '',
        tags: [],
        anchor: null,
        when: null,
        visibility: 'referee',
        playerNotes: null,
        sheet: null,
        status: null,
        images: null,
        provenance: null,
        rev: 0,
        createdAt: STAMP,
        updatedAt: STAMP,
        deleted: false,
        baseRev: 0,
        ...over,
    };
}

if (process.env.RUN_API_TESTS !== '1') {
    test('campaign summary on the worker', { skip: 'set RUN_API_TESTS=1' }, () => {});
} else if (!existsSync(wranglerBin)) {
    test('campaign summary on the worker', { skip: 'wrangler is absent' }, () => {});
} else {
    test('campaign summary on the worker', { timeout: 180000 }, async () => {
        await withDevServer(async (base) => {
            const stamp = randomBytes(4).toString('hex');
            const owner = userCookie(`sum${stamp}`, `sum${stamp}@localhost`);
            const headers = { 'content-type': 'application/json', cookie: owner };
            const created = await jsonFetch(`${base}/api/universes`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ name: 'Summary proof', truthVersion: null, editionDefault: 'MgT2E' }),
            });
            assert.equal(created.status, 201, JSON.stringify(created.body));
            const id = created.body.data.id;
            assert.equal(created.body.data.summary, null);

            const listed = await jsonFetch(`${base}/api/universes`, { headers: { cookie: owner } });
            assert.equal(listed.status, 200, JSON.stringify(listed.body));
            const card = listed.body.data.find((item) => item.id === id);
            assert.equal(card.summary, null);
            const one = await jsonFetch(`${base}/api/universes/${id}`, { headers: { cookie: owner } });
            assert.equal(one.status, 200, JSON.stringify(one.body));
            assert.equal(one.body.data.summary, null);

            const playing = await jsonFetch(`${base}/api/me/playing`, { headers: { cookie: owner } });
            assert.equal(playing.status, 200, JSON.stringify(playing.body));
            assert.equal(JSON.stringify(playing.body).includes('summary'), false);

            const seeded = await jsonFetch(`${base}/api/universes/${id}/campaign/changes`, {
                method: 'PATCH',
                headers,
                body: JSON.stringify({
                    records: [record(SHIP), record(PERSON, { type: 'person', name: 'Ada' })],
                }),
            });
            assert.equal(seeded.status, 200, JSON.stringify(seeded.body));
            assert.equal(seeded.body.data.applied.length, 2);
            assert.equal('summary' in seeded.body.data, false);

            const after = await jsonFetch(`${base}/api/universes`, { headers: { cookie: owner } });
            const held = after.body.data.find((item) => item.id === id).summary;
            assert.deepEqual(held.vessels, []);
            assert.equal(held.aboard, 0);
            assert.equal(held.clockDays, null);
            assert.equal(held.records, 2);
            assert.equal(typeof held.changedAt, 'string');

            const moved = await jsonFetch(`${base}/api/universes/${id}/campaign/changes`, {
                method: 'PATCH',
                headers,
                body: JSON.stringify({
                    settings: {
                        party: {
                            vesselIds: [SHIP],
                            aboard: { [PERSON]: SHIP },
                            memberIds: [PERSON],
                            anchor: null,
                        },
                        kinds: {},
                        calendar: { dateFormat: 'imperial' },
                        rev: 0,
                        baseRev: 0,
                    },
                    clock: { days: 40, baseRev: 0 },
                }),
            });
            assert.equal(moved.status, 200, JSON.stringify(moved.body));
            assert.equal(moved.body.data.applied.length, 2);
            assert.equal('summary' in moved.body.data, false);

            const campaign = await jsonFetch(`${base}/api/universes/${id}/campaign?after=0&limit=1000`, {
                headers: { cookie: owner },
            });
            assert.equal(campaign.status, 200, JSON.stringify(campaign.body));
            assert.deepEqual(campaign.body.data.settings.party.vesselIds, [SHIP]);
            assert.equal(campaign.body.data.clock.days, 40);

            const stale = await jsonFetch(`${base}/api/universes/${id}`, { headers: { cookie: owner } });
            assert.deepEqual(stale.body.data.summary, held);
            const staleList = await jsonFetch(`${base}/api/universes`, { headers: { cookie: owner } });
            assert.deepEqual(staleList.body.data.find((item) => item.id === id).summary, held);
        });
    });
}
