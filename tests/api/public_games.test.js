import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHmac, randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { removeTree, runWrangler } from './session.js';
import { startDev, stopDev, wranglerBin } from './server.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const STAMP = '2026-10-12T00:00:00.000Z';
const VESSEL = 'cr_bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';
const JOURNAL = 'cj_bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';

function authSecret() {
    const text = readFileSync(path.join(root, 'apps', 'api', '.dev.vars'), 'utf8');
    const line = text.split(/\r?\n/).find((item) => item.startsWith('BETTER_AUTH_SECRET='));
    if (!line) throw new Error('BETTER_AUTH_SECRET is unset');
    const value = line.slice('BETTER_AUTH_SECRET='.length).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) return value.slice(1, -1);
    return value;
}

function sqlFile(persistTo, sql) {
    const dir = mkdtempSync(path.join(tmpdir(), 'voyage-public-'));
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

function assertPublic(body, rows) {
    assert.equal(body.hexes.length, rows.length, JSON.stringify(body));
    for (let i = 0; i < rows.length; i += 1) {
        assert.equal(body.hexes[i].hex, rows[i].hex, JSON.stringify(body));
        assert.equal(body.hexes[i].count, rows[i].count, JSON.stringify(body));
        assert.equal(body.hexes[i].name, rows[i].name, JSON.stringify(body));
        assert.equal(body.hexes[i].ships.length, rows[i].count, JSON.stringify(body));
    }
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

function record(over = {}) {
    return {
        id: VESSEL,
        type: 'vessel',
        kind: '',
        name: 'zzmarkervessel',
        summary: '',
        details: 'zzmarkerdetails',
        tags: [],
        anchor: { kind: 'system', hexKey: 'Spinward_Marches/1910' },
        when: null,
        visibility: 'players',
        playerNotes: 'zzmarkeremail@example.test',
        sheet: { secret: 'zzmarkersheet' },
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

function settings(baseRev) {
    return {
        party: { vesselId: VESSEL, memberIds: [], anchor: null },
        kinds: {},
        calendar: { dateFormat: 'imperial' },
        rev: baseRev,
        baseRev,
    };
}

if (process.env.RUN_API_TESTS !== '1') {
    test('public games on the worker', { skip: 'set RUN_API_TESTS=1' }, () => {});
} else if (!existsSync(wranglerBin)) {
    test('public games on the worker', { skip: 'wrangler is absent' }, () => {});
} else {
    test('public games on the worker', { timeout: 180000 }, async () => {
        const persistTo = path.join(root, '.tmp', 'lane-b-public');
        const bare = path.join(root, '.tmp', 'lane-b-no0013');
        removeTree(persistTo);
        removeTree(bare);
        const before = process.env.VOYAGE_BEFORE_0013 === '1';
        const port = 18850;
        const base = `http://127.0.0.1:${port}`;
        let child;
        if (!before) try {
            runWrangler(['d1', 'migrations', 'apply', 'voyage', '--local', '--persist-to', persistTo]);
            const stamp = randomBytes(3).toString('hex');
            const version = `pg${stamp}`;
            const otherVersion = `ph${stamp}`;
            sqlFile(persistTo, `
INSERT INTO truth_versions (version, engine_version, state, started_at, released_at, sectors_total, sectors_done)
VALUES ('${version}', '1.0.0', 'released', '${STAMP}', '${STAMP}', 0, 0);
INSERT INTO truth_versions (version, engine_version, state, started_at, released_at, sectors_total, sectors_done)
VALUES ('${otherVersion}', '1.0.0', 'released', '${STAMP}', '${STAMP}', 0, 0);
`);
            const owner = userCookie(`pga${stamp}`, `pga${stamp}@localhost`, persistTo);
            const reader = userCookie(`pgb${stamp}`, `pgb${stamp}@localhost`, persistTo);
            const second = userCookie(`pgc${stamp}`, `pgc${stamp}@localhost`, persistTo);
            const poller = userCookie(`pgd${stamp}`, `pgd${stamp}@localhost`, persistTo);
            child = startDev({ port, persistTo, inspectorPort: 19850 });
            await up(base);
            const origin = base;
            const headers = { 'content-type': 'application/json', cookie: owner, origin };

            const signedOut = await jsonFetch(`${base}/api/public-games?truthVersion=${version}&sector=Spinward_Marches`);
            assert.equal(signedOut.status, 200, JSON.stringify(signedOut.body));
            assert.deepEqual(signedOut.body, { hexes: [] });
            const missingVersion = await jsonFetch(`${base}/api/public-games?sector=Spinward_Marches`, { headers: { cookie: reader } });
            assert.equal(missingVersion.status, 400, JSON.stringify(missingVersion.body));
            assert.equal(missingVersion.body.error.message, 'That request could not be read. Try again.');
            const missingSector = await jsonFetch(`${base}/api/public-games?truthVersion=${version}`, { headers: { cookie: reader } });
            assert.equal(missingSector.body.error.message, 'That request could not be read. Try again.');
            const badSector = await jsonFetch(`${base}/api/public-games?truthVersion=${version}&sector=bad%20slug`, { headers: { cookie: reader } });
            assert.equal(badSector.status, 400, JSON.stringify(badSector.body));
            assert.equal(badSector.body.error.message, 'That request could not be read. Try again.');

            const created = await jsonFetch(`${base}/api/universes`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ name: 'Open game', truthVersion: version, editionDefault: 'MgT2E' }),
            });
            assert.equal(created.status, 201, JSON.stringify(created.body));
            assert.equal(created.body.data.publicGames, false);
            const id = created.body.data.id;
            const listedOff = await jsonFetch(`${base}/api/universes`, { headers: { cookie: owner } });
            const offRow = listedOff.body.data.find((item) => item.id === id);
            assert.equal(offRow.publicGames, false);
            const singleOff = await jsonFetch(`${base}/api/universes/${id}`, { headers: { cookie: owner } });
            assert.equal(singleOff.body.data.publicGames, false);
            const seeded = await jsonFetch(`${base}/api/universes/${id}/campaign/changes`, {
                method: 'PATCH',
                headers,
                body: JSON.stringify({ records: [record()], settings: settings(0) }),
            });
            assert.equal(seeded.status, 200, JSON.stringify(seeded.body));
            const on = await jsonFetch(`${base}/api/universes/${id}/public-games`, {
                method: 'PATCH',
                headers,
                body: JSON.stringify({ public: true }),
            });
            assert.equal(on.status, 200, JSON.stringify(on.body));
            assert.equal(on.body.public, true);
            const listedOn = await jsonFetch(`${base}/api/universes`, { headers: { cookie: owner } });
            assert.equal(listedOn.body.data.find((item) => item.id === id).publicGames, true);
            const singleOn = await jsonFetch(`${base}/api/universes/${id}`, { headers: { cookie: owner } });
            assert.equal(singleOn.body.data.publicGames, true);

            const seen = await jsonFetch(`${base}/api/public-games?truthVersion=${version}&sector=Spinward_Marches`, { headers: { cookie: reader } });
            assert.equal(seen.status, 200, JSON.stringify(seen.body));
            assert.equal(seen.headers.get('cache-control'), 'private, no-store');
            assertPublic(seen.body, [{ hex: '1910', count: 1, name: 'Open game' }]);
            assert.equal(seen.body.hexes[0].ships[0].ship, 'zzmarkervessel');
            assert.deepEqual(seen.body.hexes[0].ships[0].aboard, []);
            assert.match(seen.body.hexes[0].ships[0].mark, /^pm_[0-9A-HJKMNP-TV-Z]{26}$/);
            const ownOnly = await jsonFetch(`${base}/api/public-games?truthVersion=${version}&sector=Spinward_Marches`, { headers: { cookie: owner } });
            assert.deepEqual(ownOnly.body, { hexes: [] });
            const leaked = JSON.stringify(seen.body);
            for (const marker of ['zzmarkerdetails', 'zzmarkeremail', 'zzmarkersheet', 'cr_', 'universeId', 'vesselId', 'referee', 'journal']) {
                assert.equal(leaked.includes(marker), false, marker);
            }

            const rev = seeded.body.data.applied.find((row) => row.id === VESSEL).rev;
            const moved = await jsonFetch(`${base}/api/universes/${id}/campaign/changes`, {
                method: 'PATCH',
                headers,
                body: JSON.stringify({ records: [record({ anchor: { kind: 'system', hexKey: 'Spinward_Marches/1911' }, baseRev: rev, rev })] }),
            });
            assert.equal(moved.status, 200, JSON.stringify(moved.body));
            const afterMove = await jsonFetch(`${base}/api/public-games?truthVersion=${version}&sector=Spinward_Marches`, { headers: { cookie: reader } });
            assertPublic(afterMove.body, [{ hex: '1911', count: 1, name: 'Open game' }]);

            const noted = await jsonFetch(`${base}/api/universes/${id}/campaign/changes`, {
                method: 'PATCH',
                headers,
                body: JSON.stringify({
                    journal: [{
                        id: JOURNAL,
                        kind: 'note',
                        title: 'zzmarkerjournal',
                        body: 'zzmarkerjournal body',
                        when: null,
                        realDate: null,
                        sequence: null,
                        author: 'referee',
                        visibility: 'referee',
                        anchor: null,
                        mentions: [],
                        rev: 0,
                        createdAt: STAMP,
                        updatedAt: STAMP,
                        deleted: false,
                        baseRev: 0,
                    }],
                }),
            });
            assert.equal(noted.status, 200, JSON.stringify(noted.body));
            const afterNote = await jsonFetch(`${base}/api/public-games?truthVersion=${version}&sector=Spinward_Marches`, { headers: { cookie: reader } });
            assertPublic(afterNote.body, [{ hex: '1911', count: 1, name: 'Open game' }]);
            assert.equal(JSON.stringify(afterNote.body).includes('zzmarkerjournal'), false);

            const other = await jsonFetch(`${base}/api/universes`, {
                method: 'POST',
                headers: { 'content-type': 'application/json', cookie: second, origin },
                body: JSON.stringify({ name: 'Second game', truthVersion: version, editionDefault: 'MgT2E' }),
            });
            assert.equal(other.status, 201, JSON.stringify(other.body));
            const otherId = other.body.data.id;
            const otherHeaders = { 'content-type': 'application/json', cookie: second, origin };
            const placed = await jsonFetch(`${base}/api/universes/${otherId}/campaign/changes`, {
                method: 'PATCH',
                headers: otherHeaders,
                body: JSON.stringify({
                    records: [record({ anchor: { kind: 'system', hexKey: 'Spinward_Marches/1911' } })],
                    settings: settings(0),
                }),
            });
            assert.equal(placed.status, 200, JSON.stringify(placed.body));
            const otherOn = await jsonFetch(`${base}/api/universes/${otherId}/public-games`, {
                method: 'PATCH',
                headers: otherHeaders,
                body: JSON.stringify({ public: true }),
            });
            assert.equal(otherOn.status, 200, JSON.stringify(otherOn.body));
            const ownCrowded = await jsonFetch(`${base}/api/public-games?truthVersion=${version}&sector=Spinward_Marches`, { headers: { cookie: owner } });
            assertPublic(ownCrowded.body, [{ hex: '1911', count: 1, name: 'Second game' }]);
            const secondFeed = await jsonFetch(`${base}/api/public-games?truthVersion=${version}&sector=Spinward_Marches`, { headers: { cookie: second } });
            assertPublic(secondFeed.body, [{ hex: '1911', count: 1, name: 'Open game' }]);
            const crowded = await jsonFetch(`${base}/api/public-games?truthVersion=${version}&sector=Spinward_Marches`, { headers: { cookie: reader } });
            assertPublic(crowded.body, [{ hex: '1911', count: 2, name: null }]);
            assert.equal(JSON.stringify(crowded.body).includes('Open game'), false);
            assert.equal(JSON.stringify(crowded.body).includes('Second game'), false);

            const elsewhere = await jsonFetch(`${base}/api/universes`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ name: 'Other chart', truthVersion: otherVersion, editionDefault: 'MgT2E' }),
            });
            const elseId = elsewhere.body.data.id;
            await jsonFetch(`${base}/api/universes/${elseId}/campaign/changes`, {
                method: 'PATCH',
                headers,
                body: JSON.stringify({
                    records: [record({ anchor: { kind: 'system', hexKey: 'Spinward_Marches/1911' } })],
                    settings: settings(0),
                }),
            });
            await jsonFetch(`${base}/api/universes/${elseId}/public-games`, {
                method: 'PATCH',
                headers,
                body: JSON.stringify({ public: true }),
            });
            const sameChart = await jsonFetch(`${base}/api/public-games?truthVersion=${version}&sector=Spinward_Marches`, { headers: { cookie: reader } });
            assert.equal(sameChart.body.hexes[0].count, 2);
            const otherChart = await jsonFetch(`${base}/api/public-games?truthVersion=${otherVersion}&sector=Spinward_Marches`, { headers: { cookie: reader } });
            assertPublic(otherChart.body, [{ hex: '1911', count: 1, name: 'Other chart' }]);

            const scratch = await jsonFetch(`${base}/api/universes`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ name: 'From scratch', truthVersion: null, editionDefault: 'MgT2E' }),
            });
            const scratchId = scratch.body.data.id;
            await jsonFetch(`${base}/api/universes/${scratchId}/campaign/changes`, {
                method: 'PATCH',
                headers,
                body: JSON.stringify({
                    records: [record()],
                    settings: settings(0),
                }),
            });
            const scratchOn = await jsonFetch(`${base}/api/universes/${scratchId}/public-games`, {
                method: 'PATCH',
                headers,
                body: JSON.stringify({ public: true }),
            });
            assert.equal(scratchOn.status, 200, JSON.stringify(scratchOn.body));
            const blank = await jsonFetch(`${base}/api/public-games?truthVersion=${version}&sector=Regina`, { headers: { cookie: reader } });
            assert.deepEqual(blank.body, { hexes: [] });

            const off = await jsonFetch(`${base}/api/universes/${id}/public-games`, {
                method: 'PATCH',
                headers,
                body: JSON.stringify({ public: false }),
            });
            assert.equal(off.body.public, false);
            const afterOff = await jsonFetch(`${base}/api/public-games?truthVersion=${version}&sector=Spinward_Marches`, { headers: { cookie: reader } });
            assert.equal(afterOff.body.hexes[0].count, 1);
            assert.equal(afterOff.body.hexes[0].name, 'Second game');
            const ownerAfterOff = await jsonFetch(`${base}/api/public-games?truthVersion=${version}&sector=Spinward_Marches`, { headers: { cookie: owner } });
            assertPublic(ownerAfterOff.body, [{ hex: '1911', count: 1, name: 'Second game' }]);
            const secondAfterOff = await jsonFetch(`${base}/api/public-games?truthVersion=${version}&sector=Spinward_Marches`, { headers: { cookie: second } });
            assert.deepEqual(secondAfterOff.body, { hexes: [] });

            const removed = await jsonFetch(`${base}/api/universes/${otherId}`, { method: 'DELETE', headers: otherHeaders });
            assert.equal(removed.status, 200, JSON.stringify(removed.body));
            const afterDelete = await jsonFetch(`${base}/api/public-games?truthVersion=${version}&sector=Spinward_Marches`, { headers: { cookie: reader } });
            assert.deepEqual(afterDelete.body, { hexes: [] });

            let limited = null;
            for (let n = 0; n < 61; n += 1) {
                limited = await jsonFetch(`${base}/api/public-games?truthVersion=${version}&sector=Spinward_Marches`, { headers: { cookie: poller } });
            }
            assert.equal(limited.status, 429, JSON.stringify(limited.body));
        } finally {
            stopDev(child?.pid);
        }

        const barePort = 18851;
        const bareBase = `http://127.0.0.1:${barePort}`;
        let bareChild;
        try {
            runWrangler(['d1', 'migrations', 'apply', 'voyage', '--local', '--persist-to', bare]);
            sqlFile(bare, `ALTER TABLE universes DROP COLUMN public_games; DROP TABLE public_marks;${before ? ' DROP TABLE IF EXISTS object_byte_charges;' : ''}`);
            const stamp = randomBytes(3).toString('hex');
            const owner = userCookie(`pge${stamp}`, `pge${stamp}@localhost`, bare);
            bareChild = startDev({ port: barePort, persistTo: bare, inspectorPort: 19851 });
            await up(bareBase);
            const headers = { 'content-type': 'application/json', cookie: owner, origin: bareBase };
            const created = await jsonFetch(`${bareBase}/api/universes`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ name: 'Still here', truthVersion: null, editionDefault: 'MgT2E' }),
            });
            assert.equal(created.status, 201, JSON.stringify(created.body));
            assert.equal(Object.hasOwn(created.body.data, 'publicGames'), false);
            const listed = await jsonFetch(`${bareBase}/api/universes`, { headers: { cookie: owner } });
            assert.equal(listed.status, 200, JSON.stringify(listed.body));
            for (const row of listed.body.data) assert.equal(Object.hasOwn(row, 'publicGames'), false);
            const single = await jsonFetch(`${bareBase}/api/universes/${created.body.data.id}`, { headers: { cookie: owner } });
            assert.equal(single.status, 200, JSON.stringify(single.body));
            assert.equal(Object.hasOwn(single.body.data, 'publicGames'), false);
            const refused = await jsonFetch(`${bareBase}/api/universes/${created.body.data.id}/public-games`, {
                method: 'PATCH',
                headers,
                body: JSON.stringify({ public: true }),
            });
            assert.equal(refused.status, 503, JSON.stringify(refused.body));
            assert.equal(refused.body.error.code, 'public_games_unavailable');
            assert.equal(refused.body.error.message, 'Public games are not available yet.');
            const empty = await jsonFetch(`${bareBase}/api/public-games?truthVersion=v5&sector=Spinward_Marches`, { headers: { cookie: owner } });
            assert.equal(empty.status, 200, JSON.stringify(empty.body));
            assert.deepEqual(empty.body, { hexes: [] });
        } finally {
            stopDev(bareChild?.pid);
            removeTree(persistTo);
            removeTree(bare);
        }
    });
}
