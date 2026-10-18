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
const STAMP = '2026-10-14T00:00:00.000Z';
const SHIP_A = 'cr_cccccccc-cccc-4ccc-8ccc-ccccccccccc1';
const SHIP_B = 'cr_cccccccc-cccc-4ccc-8ccc-ccccccccccc2';
const SHIP_HIDDEN = 'cr_cccccccc-cccc-4ccc-8ccc-ccccccccccc3';
const SHIP_OUT = 'cr_cccccccc-cccc-4ccc-8ccc-ccccccccccc4';
const PERSON = 'cr_cccccccc-cccc-4ccc-8ccc-ccccccccccc5';
const HIDDEN_PERSON = 'cr_cccccccc-cccc-4ccc-8ccc-ccccccccccc6';

function authSecret() {
    const text = readFileSync(path.join(root, 'apps', 'api', '.dev.vars'), 'utf8');
    const line = text.split(/\r?\n/).find((item) => item.startsWith('BETTER_AUTH_SECRET='));
    if (!line) throw new Error('BETTER_AUTH_SECRET is unset');
    const value = line.slice('BETTER_AUTH_SECRET='.length).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) return value.slice(1, -1);
    return value;
}

function sqlFile(persistTo, sql) {
    const dir = mkdtempSync(path.join(tmpdir(), 'voyage-party-'));
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
    return { status: response.status, body };
}

function record(id, over = {}) {
    return {
        id,
        type: 'vessel',
        kind: '',
        name: 'Ship',
        summary: '',
        details: '',
        tags: [],
        anchor: { kind: 'system', hexKey: 'Spinward_Marches/1910' },
        when: null,
        visibility: 'players',
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
    test('party ships on the worker', { skip: 'set RUN_API_TESTS=1' }, () => {});
} else if (!existsSync(wranglerBin)) {
    test('party ships on the worker', { skip: 'wrangler is absent' }, () => {});
} else {
    test('an old-shape save keeps every ship, and each public ship is its own mark', { timeout: 180000 }, async () => {
        const persistTo = path.join(root, '.tmp', 'lane-b-party');
        removeTree(persistTo);
        const port = 18866;
        const base = `http://127.0.0.1:${port}`;
        let child;
        try {
            runWrangler(['d1', 'migrations', 'apply', 'voyage', '--local', '--persist-to', persistTo]);
            const stamp = randomBytes(3).toString('hex');
            const version = `ps${stamp}`;
            sqlFile(persistTo, `
INSERT INTO truth_versions (version, engine_version, state, started_at, released_at, sectors_total, sectors_done)
VALUES ('${version}', '1.2.0', 'released', '${STAMP}', '${STAMP}', 0, 0);
`);
            const owner = userCookie(`psa${stamp}`, `psa${stamp}@localhost`, persistTo);
            const reader = userCookie(`psb${stamp}`, `psb${stamp}@localhost`, persistTo);
            child = startDev({ port, persistTo, inspectorPort: 19866 });
            await up(base);
            const headers = { 'content-type': 'application/json', cookie: owner, origin: base };
            const created = await jsonFetch(`${base}/api/universes`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ name: 'Two hulls', truthVersion: version, editionDefault: 'MgT2E' }),
            });
            assert.equal(created.status, 201, JSON.stringify(created.body));
            const id = created.body.data.id;
            const seeded = await jsonFetch(`${base}/api/universes/${id}/campaign/changes`, {
                method: 'PATCH',
                headers,
                body: JSON.stringify({
                    records: [
                        record(SHIP_A, { name: 'Far Margin', anchor: { kind: 'system', hexKey: 'Spinward_Marches/1910' } }),
                        record(SHIP_B, { name: 'Jewel', anchor: { kind: 'system', hexKey: 'Spinward_Marches/1911' } }),
                        record(SHIP_HIDDEN, { name: 'zzrefereeship', visibility: 'referee', anchor: { kind: 'system', hexKey: 'Spinward_Marches/1912' } }),
                        record(SHIP_OUT, { name: 'zzoutsideship', anchor: { kind: 'system', hexKey: 'Spinward_Marches/1913' } }),
                        record(PERSON, { type: 'person', name: 'Voss' }),
                        record(HIDDEN_PERSON, { type: 'person', name: 'zzrefereename', visibility: 'referee' }),
                    ],
                    settings: {
                        party: {
                            vesselIds: [SHIP_A, SHIP_B, SHIP_HIDDEN],
                            aboard: { [PERSON]: SHIP_A, [HIDDEN_PERSON]: SHIP_A },
                            memberIds: [PERSON, HIDDEN_PERSON],
                            anchor: null,
                        },
                        kinds: {},
                        calendar: { dateFormat: 'imperial' },
                        rev: 0,
                        baseRev: 0,
                    },
                }),
            });
            assert.equal(seeded.status, 200, JSON.stringify(seeded.body));
            const settingsRev = seeded.body.data.applied.find((row) => row.table === 'settings').rev;
            const on = await jsonFetch(`${base}/api/universes/${id}/public-games`, {
                method: 'PATCH',
                headers,
                body: JSON.stringify({ public: true }),
            });
            assert.equal(on.status, 200, JSON.stringify(on.body));
            const seen = await jsonFetch(`${base}/api/public-games?truthVersion=${version}&sector=Spinward_Marches`, { headers: { cookie: reader } });
            assert.equal(seen.status, 200, JSON.stringify(seen.body));
            assert.deepEqual(seen.body.hexes.map((row) => row.hex), ['1910', '1911']);
            const margin = seen.body.hexes.find((row) => row.hex === '1910');
            assert.equal(margin.count, 1);
            assert.equal(margin.name, 'Two hulls');
            assert.equal(margin.ships[0].ship, 'Far Margin');
            assert.deepEqual(margin.ships[0].aboard, ['Voss']);
            assert.match(margin.ships[0].mark, /^pm_[0-9A-HJKMNP-TV-Z]{26}$/);
            const firstMark = margin.ships[0].mark;
            const leaked = JSON.stringify(seen.body);
            for (const marker of ['zzrefereeship', 'zzrefereename', 'zzoutsideship', 'cr_', id, 'universeId', 'vesselId']) {
                assert.equal(leaked.includes(marker), false, marker);
            }

            const oldSave = await jsonFetch(`${base}/api/universes/${id}/campaign/changes`, {
                method: 'PATCH',
                headers,
                body: JSON.stringify({
                    settings: {
                        party: { vesselId: SHIP_A, memberIds: [PERSON, HIDDEN_PERSON], anchor: null },
                        kinds: {},
                        calendar: { dateFormat: 'imperial' },
                        rev: settingsRev,
                        baseRev: settingsRev,
                    },
                }),
            });
            assert.equal(oldSave.status, 200, JSON.stringify(oldSave.body));
            assert.equal(oldSave.body.data.conflicts.length, 0, JSON.stringify(oldSave.body));
            const read = await jsonFetch(`${base}/api/universes/${id}/campaign?after=0&limit=1000`, { headers: { cookie: owner } });
            assert.deepEqual(read.body.data.settings.party.vesselIds, [SHIP_A, SHIP_B, SHIP_HIDDEN]);
            assert.deepEqual(read.body.data.settings.party.aboard, { [PERSON]: SHIP_A, [HIDDEN_PERSON]: SHIP_A });
            const again = await jsonFetch(`${base}/api/public-games?truthVersion=${version}&sector=Spinward_Marches`, { headers: { cookie: reader } });
            assert.equal(again.body.hexes.find((row) => row.hex === '1910').ships[0].mark, firstMark);
            assert.deepEqual(again.body.hexes.map((row) => row.hex), ['1910', '1911']);
        } finally {
            stopDev(child?.pid);
            removeTree(persistTo);
        }
    });

    test('without 0017 the feed is still one mark for the first ship', { timeout: 180000 }, async () => {
        const persistTo = path.join(root, '.tmp', 'lane-b-party-old');
        removeTree(persistTo);
        const port = 18867;
        const base = `http://127.0.0.1:${port}`;
        let child;
        try {
            runWrangler(['d1', 'migrations', 'apply', 'voyage', '--local', '--persist-to', persistTo]);
            sqlFile(persistTo, 'DROP TABLE public_ships;');
            const stamp = randomBytes(3).toString('hex');
            const version = `po${stamp}`;
            sqlFile(persistTo, `
INSERT INTO truth_versions (version, engine_version, state, started_at, released_at, sectors_total, sectors_done)
VALUES ('${version}', '1.2.0', 'released', '${STAMP}', '${STAMP}', 0, 0);
`);
            const owner = userCookie(`poc${stamp}`, `poc${stamp}@localhost`, persistTo);
            const reader = userCookie(`pod${stamp}`, `pod${stamp}@localhost`, persistTo);
            child = startDev({ port, persistTo, inspectorPort: 19867 });
            await up(base);
            const headers = { 'content-type': 'application/json', cookie: owner, origin: base };
            const created = await jsonFetch(`${base}/api/universes`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ name: 'First hull', truthVersion: version, editionDefault: 'MgT2E' }),
            });
            assert.equal(created.status, 201, JSON.stringify(created.body));
            const id = created.body.data.id;
            const seeded = await jsonFetch(`${base}/api/universes/${id}/campaign/changes`, {
                method: 'PATCH',
                headers,
                body: JSON.stringify({
                    records: [
                        record(SHIP_A, { name: 'Far Margin', anchor: { kind: 'system', hexKey: 'Spinward_Marches/1910' } }),
                        record(SHIP_B, { name: 'Jewel', anchor: { kind: 'system', hexKey: 'Spinward_Marches/1911' } }),
                    ],
                    settings: {
                        party: {
                            vesselIds: [SHIP_A, SHIP_B],
                            aboard: {},
                            memberIds: [],
                            anchor: null,
                        },
                        kinds: {},
                        calendar: { dateFormat: 'imperial' },
                        rev: 0,
                        baseRev: 0,
                    },
                }),
            });
            assert.equal(seeded.status, 200, JSON.stringify(seeded.body));
            const on = await jsonFetch(`${base}/api/universes/${id}/public-games`, {
                method: 'PATCH',
                headers,
                body: JSON.stringify({ public: true }),
            });
            assert.equal(on.status, 200, JSON.stringify(on.body));
            const seen = await jsonFetch(`${base}/api/public-games?truthVersion=${version}&sector=Spinward_Marches`, { headers: { cookie: reader } });
            assert.deepEqual(seen.body, { hexes: [{ hex: '1910', count: 1, name: 'First hull' }] });
            assert.equal(Object.hasOwn(seen.body.hexes[0], 'ships'), false);
        } finally {
            stopDev(child?.pid);
            removeTree(persistTo);
        }
    });
}
