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
const STAMP = '2026-10-15T00:00:00.000Z';
const VESSEL = 'cr_bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';

function authSecret() {
    const text = readFileSync(path.join(root, 'apps', 'api', '.dev.vars'), 'utf8');
    const line = text.split(/\r?\n/).find((item) => item.startsWith('BETTER_AUTH_SECRET='));
    if (!line) throw new Error('BETTER_AUTH_SECRET is unset');
    const value = line.slice('BETTER_AUTH_SECRET='.length).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) return value.slice(1, -1);
    return value;
}

function sqlFile(persistTo, sql) {
    const dir = mkdtempSync(path.join(tmpdir(), 'voyage-overview-'));
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

function record(name) {
    return {
        id: VESSEL,
        type: 'vessel',
        kind: '',
        name,
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
    };
}

function settings() {
    return {
        party: { vesselId: VESSEL, memberIds: [], anchor: null },
        kinds: {},
        calendar: { dateFormat: 'imperial' },
        rev: 0,
        baseRev: 0,
    };
}

async function publish(base, headers, version, name) {
    const created = await jsonFetch(`${base}/api/universes`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ name, truthVersion: version, editionDefault: 'MgT2E' }),
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const id = created.body.data.id;
    const seeded = await jsonFetch(`${base}/api/universes/${id}/campaign/changes`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ records: [record(name)], settings: settings() }),
    });
    assert.equal(seeded.status, 200, JSON.stringify(seeded.body));
    const on = await jsonFetch(`${base}/api/universes/${id}/public-games`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ public: true }),
    });
    assert.equal(on.status, 200, JSON.stringify(on.body));
    return id;
}

if (process.env.RUN_API_TESTS !== '1') {
    test('public overview on the worker', { skip: 'set RUN_API_TESTS=1' }, () => {});
} else if (!existsSync(wranglerBin)) {
    test('public overview on the worker', { skip: 'wrangler is absent' }, () => {});
} else {
    test('the overview counts every public ship, including the caller\'s', { timeout: 180000 }, async () => {
        const persistTo = path.join(root, '.tmp', 'lane-b-overview');
        removeTree(persistTo);
        const port = 18884;
        const base = `http://127.0.0.1:${port}`;
        let child;
        try {
            runWrangler(['d1', 'migrations', 'apply', 'voyage', '--local', '--persist-to', persistTo]);
            const stamp = randomBytes(3).toString('hex');
            const version = `ov${stamp}`;
            sqlFile(persistTo, `
INSERT INTO truth_versions (version, engine_version, state, started_at, released_at, sectors_total, sectors_done)
VALUES ('${version}', '1.2.0', 'released', '${STAMP}', '${STAMP}', 0, 0);
`);
            const owner = userCookie(`ova${stamp}`, `ova${stamp}@localhost`, persistTo);
            const reader = userCookie(`ovb${stamp}`, `ovb${stamp}@localhost`, persistTo);
            child = startDev({ port, persistTo, inspectorPort: 19884 });
            await up(base);
            const ownerHeaders = { 'content-type': 'application/json', cookie: owner, origin: base };
            const readerHeaders = { 'content-type': 'application/json', cookie: reader, origin: base };

            const missing = await jsonFetch(`${base}/api/public-games/overview`);
            assert.equal(missing.status, 400, JSON.stringify(missing.body));
            assert.equal(missing.body.error.message, 'That request could not be read. Try again.');
            const bad = await jsonFetch(`${base}/api/public-games/overview?truthVersion=${'x'.repeat(65)}`);
            assert.equal(bad.status, 400, JSON.stringify(bad.body));
            assert.equal(bad.body.error.message, 'That request could not be read. Try again.');

            const empty = await jsonFetch(`${base}/api/public-games/overview?truthVersion=${version}`);
            assert.equal(empty.status, 200, JSON.stringify(empty.body));
            assert.deepEqual(empty.body, { hexes: [] });
            assert.equal(empty.headers.get('cache-control'), 'public, max-age=60');

            const ownerId = await publish(base, ownerHeaders, version, 'Open game');
            const readerId = await publish(base, readerHeaders, version, 'Second game');
            sqlFile(persistTo, `
INSERT INTO public_ships (mark_id, universe_id, truth_version, sector_slug, local_hex, ship_name, aboard_names, updated_at)
VALUES ('pm_00000000000000000000000001', '${ownerId}', '${version}', '~secret', '1910', 'Hidden', '[]', '${STAMP}');
`);

            const seen = await jsonFetch(`${base}/api/public-games/overview?truthVersion=${version}`, { headers: { cookie: owner } });
            assert.equal(seen.status, 200, JSON.stringify(seen.body));
            assert.equal(seen.headers.get('cache-control'), 'public, max-age=60');
            assert.deepEqual(seen.body, { hexes: [{ key: 'Spinward_Marches/1910', count: 2 }] });
            const leaked = JSON.stringify(seen.body);
            for (const marker of ['Open game', 'Second game', 'Hidden', '~', 'cr_', 'pm_', ownerId, readerId, 'email', 'ship', 'aboard', 'example']) {
                assert.equal(leaked.includes(marker), false, marker);
            }
            const signedOut = await jsonFetch(`${base}/api/public-games/overview?truthVersion=${version}`);
            assert.deepEqual(signedOut.body, seen.body);
            const asReader = await jsonFetch(`${base}/api/public-games/overview?truthVersion=${version}`, { headers: { cookie: reader } });
            assert.deepEqual(asReader.body, seen.body);

            const sector = await jsonFetch(`${base}/api/public-games?truthVersion=${version}&sector=Spinward_Marches`, { headers: { cookie: owner } });
            assert.equal(sector.body.hexes[0].count, 1, JSON.stringify(sector.body));
            assert.equal(sector.body.hexes[0].ships.length, 1);

            const ownerOff = await jsonFetch(`${base}/api/universes/${ownerId}/public-games`, {
                method: 'PATCH',
                headers: ownerHeaders,
                body: JSON.stringify({ public: false }),
            });
            assert.equal(ownerOff.status, 200, JSON.stringify(ownerOff.body));
            const one = await jsonFetch(`${base}/api/public-games/overview?truthVersion=${version}`);
            assert.deepEqual(one.body, { hexes: [{ key: 'Spinward_Marches/1910', count: 1 }] });
            const readerOff = await jsonFetch(`${base}/api/universes/${readerId}/public-games`, {
                method: 'PATCH',
                headers: readerHeaders,
                body: JSON.stringify({ public: false }),
            });
            assert.equal(readerOff.status, 200, JSON.stringify(readerOff.body));
            const none = await jsonFetch(`${base}/api/public-games/overview?truthVersion=${version}`);
            assert.deepEqual(none.body, { hexes: [] });
        } finally {
            stopDev(child?.pid);
            removeTree(persistTo);
        }
    });

    test('without 0018 a signed-out overview is refused', { timeout: 180000 }, async () => {
        const persistTo = path.join(root, '.tmp', 'lane-b-overview-old');
        removeTree(persistTo);
        const port = 18885;
        const base = `http://127.0.0.1:${port}`;
        let child;
        try {
            runWrangler(['d1', 'migrations', 'apply', 'voyage', '--local', '--persist-to', persistTo]);
            sqlFile(persistTo, 'DROP TABLE public_cards;');
            const stamp = randomBytes(3).toString('hex');
            const version = `ow${stamp}`;
            sqlFile(persistTo, `
INSERT INTO truth_versions (version, engine_version, state, started_at, released_at, sectors_total, sectors_done)
VALUES ('${version}', '1.2.0', 'released', '${STAMP}', '${STAMP}', 0, 0);
`);
            const owner = userCookie(`owc${stamp}`, `owc${stamp}@localhost`, persistTo);
            child = startDev({ port, persistTo, inspectorPort: 19885 });
            await up(base);
            const headers = { 'content-type': 'application/json', cookie: owner, origin: base };
            const signedOut = await jsonFetch(`${base}/api/public-games/overview?truthVersion=${version}`);
            assert.equal(signedOut.status, 401, JSON.stringify(signedOut.body));
            await publish(base, headers, version, 'Open game');
            const seen = await jsonFetch(`${base}/api/public-games/overview?truthVersion=${version}`, { headers: { cookie: owner } });
            assert.equal(seen.status, 200, JSON.stringify(seen.body));
            assert.equal(seen.headers.get('cache-control'), 'public, max-age=60');
            assert.deepEqual(seen.body, { hexes: [{ key: 'Spinward_Marches/1910', count: 1 }] });
            const stillOut = await jsonFetch(`${base}/api/public-games/overview?truthVersion=${version}`);
            assert.equal(stillOut.status, 401, JSON.stringify(stillOut.body));
        } finally {
            stopDev(child?.pid);
            removeTree(persistTo);
        }
    });
}
