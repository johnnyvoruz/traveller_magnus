import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { recordForPublish } from '../../apps/api/src/universe/publish_read.ts';
import { runWrangler } from './session.js';
import { startDev, stopDev, wranglerBin } from './server.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PLAYERS = 'cr_11111111-1111-4111-8111-111111111111';
const HIDDEN = 'cr_22222222-2222-4222-8222-222222222222';
const STAMP_TIME = '2026-10-11T00:00:00.000Z';
const BLOCK = 'The port is open.\r:::referee\rThe spy is Voss.\r:::';
const SETTINGS = JSON.stringify({
    generationPopMax: 20,
    generationPopMod: 0,
    generationTlMax: 20,
    generationTlMod: 0,
    generationUseRealisticStellar: false,
    generationUseTlFloor: false,
    generationRttSettlement: 2,
    generationRttTL: 15,
    generationStarportMax: 'A',
    generationStarportMod: 0,
    generationNoTravelZones: false,
    generationPopCheckFrequency: 100,
});

test('a published copy drops referee text, player notes, the fuel mark and a lone-CR block', () => {
    const players = recordForPublish({
        id: PLAYERS,
        visibility: 'players',
        name: 'Ada',
        summary: BLOCK,
        details: BLOCK,
        playerNotes: 'For the table\r:::referee\rDo not print the handout secret.\r:::',
        sheet: { fields: { Name: BLOCK } },
        status: { fuelTons: 10, fuelMark: 'naval' },
    });
    assert.equal(players.playerNotes, null);
    assert.equal(players.summary, 'The port is open.');
    assert.equal(players.details, 'The port is open.');
    assert.equal(players.sheet.fields.Name, 'The port is open.');
    assert.deepEqual(players.status, { fuelTons: 10 });
    assert.equal(JSON.stringify(players).includes('Voss'), false);
    assert.equal(JSON.stringify(players).includes('handout secret'), false);

    const hidden = recordForPublish({
        id: HIDDEN,
        visibility: 'referee',
        name: 'Hidden Patron',
        summary: 'Do not print this summary',
        details: 'Do not print this writeup\n:::referee\nThe password is lantern.\n:::',
        playerNotes: 'A handout',
        sheet: { line: 'sheet secret' },
        status: { fuelMark: 'scout' },
    });
    assert.equal(hidden.name, 'Hidden Patron');
    assert.equal(hidden.summary, '');
    assert.equal(hidden.details, '');
    assert.equal(hidden.playerNotes, null);
    assert.equal(hidden.sheet, null);
    assert.deepEqual(hidden.status, {});
    const packed = JSON.stringify(hidden);
    assert.equal(packed.includes('lantern'), false);
    assert.equal(packed.includes('Do not print'), false);
    assert.equal(packed.includes('sheet secret'), false);
    assert.equal(packed.includes('fuelMark'), false);
});

function authSecret() {
    const text = readFileSync(path.join(root, 'apps/api/.dev.vars'), 'utf8');
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
    const file = path.join(mkdtempSync(path.join(tmpdir(), 'voyage-user-')), 'user.sql');
    writeFileSync(file, `
INSERT INTO user (id, name, email, email_verified, created_at, updated_at, role, banned)
VALUES ('${userId}', '${userId}', '${email}', 1, ${now}, ${now}, 'user', 0);
INSERT INTO session (id, expires_at, token, created_at, updated_at, user_id)
VALUES ('${sessionId}', ${expires}, '${token}', ${now}, ${now}, '${userId}');
`);
    runWrangler(['d1', 'execute', 'voyage', '--local', '--persist-to', persistTo, '--file', file]);
    const signature = createHmac('sha256', authSecret()).update(token).digest('base64');
    return `__Secure-better-auth.session_token=${encodeURIComponent(`${token}.${signature}`)}`;
}

function sqlFile(persistTo, sql) {
    const file = path.join(mkdtempSync(path.join(tmpdir(), 'voyage-sql-')), 'query.sql');
    writeFileSync(file, sql);
    runWrangler(['d1', 'execute', 'voyage', '--local', '--persist-to', persistTo, '--file', file]);
}

function r2Put(persistTo, key, text) {
    const file = path.join(mkdtempSync(path.join(tmpdir(), 'voyage-r2-')), 'body');
    writeFileSync(file, text);
    runWrangler(['r2', 'object', 'put', `voyage-public/${key}`, '--file', file, '--local', '--persist-to', persistTo]);
}

function r2Get(persistTo, key) {
    const file = path.join(mkdtempSync(path.join(tmpdir(), 'voyage-r2-')), 'out');
    runWrangler(['r2', 'object', 'get', `voyage-public/${key}`, '--file', file, '--local', '--persist-to', persistTo]);
    return readFileSync(file, 'utf8');
}

async function jsonFetch(url, options) {
    const response = await fetch(url, options);
    const text = await response.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text }; }
    return { status: response.status, body };
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

function record(id, extra) {
    return {
        id,
        type: 'person',
        kind: '',
        name: 'Startown',
        summary: '',
        details: '',
        tags: [],
        anchor: null,
        when: null,
        visibility: 'players',
        playerNotes: null,
        sheet: null,
        status: null,
        images: null,
        provenance: null,
        rev: 0,
        createdAt: STAMP_TIME,
        updatedAt: STAMP_TIME,
        deleted: false,
        baseRev: 0,
        ...extra,
    };
}

async function settle(base, packageId, version, cookie) {
    const deadline = Date.now() + 45000;
    let last = null;
    while (Date.now() < deadline) {
        last = await jsonFetch(`${base}/api/packages/${packageId}/versions/${version}`, { headers: { cookie } });
        const state = last.body?.data?.state;
        if (state === 'done' || state === 'failed') return last;
        await sleep(250);
    }
    return last;
}

const NAME = 'BP1 a published package leaves referee-only text out';

if (process.env.RUN_API_TESTS !== '1') {
    test(NAME, { skip: 'set RUN_API_TESTS=1' }, () => {});
} else if (!existsSync(wranglerBin)) {
    test(NAME, { skip: 'wrangler is absent' }, () => {});
} else {
    test(NAME, { timeout: 180000 }, async () => {
        const persistTo = mkdtempSync(path.join(tmpdir(), 'voyage-publish-referee-'));
        const port = 18913;
        const base = `http://127.0.0.1:${port}`;
        let child = null;
        try {
            runWrangler(['d1', 'migrations', 'apply', 'voyage', '--local', '--persist-to', persistTo]);
            const stamp = randomBytes(4).toString('hex');
            const version = `bpr${stamp}`;
            sqlFile(persistTo, `
INSERT INTO truth_versions (version, engine_version, milieu, seed, settings, sectors, state, started_at, released_at, sectors_total, sectors_done, sectors_failed)
VALUES ('${version}', '1.1.0', 'M1105', 'TravellerMagnus', '${SETTINGS}', '[]', 'released', '${STAMP_TIME}', '${STAMP_TIME}', 0, 0, '[]');
`);
            r2Put(persistTo, `truth/${version}/manifest.json`, JSON.stringify({ sectors: [{ slug: 'Chart', x: 0, y: 0 }] }));
            r2Put(persistTo, `truth/${version}/sectors/Chart/index.json`, JSON.stringify({ hexes: {} }));
            const owner = userCookie(`bpr${stamp}`, `bpr${stamp}@localhost`, persistTo);
            const headers = { 'content-type': 'application/json', cookie: owner };
            child = startDev({ port, persistTo, inspectorPort: 19913 });
            await up(base);
            const made = await jsonFetch(`${base}/api/universes`, {
                method: 'POST', headers,
                body: JSON.stringify({ name: 'Publish gate', truthVersion: version, editionDefault: 'MgT2E' }),
            });
            assert.equal(made.status, 201, JSON.stringify(made.body));
            const universeId = made.body.data.id;
            const seeded = await jsonFetch(`${base}/api/universes/${universeId}/campaign/changes`, {
                method: 'PATCH', headers,
                body: JSON.stringify({ records: [
                    record(PLAYERS, {
                        name: 'Ada',
                        summary: BLOCK,
                        details: BLOCK,
                        playerNotes: 'For the table',
                        sheet: { fields: { Name: BLOCK } },
                        status: { fuelTons: 10, fuelMark: 'naval' },
                        visibility: 'players',
                    }),
                    record(HIDDEN, {
                        name: 'Hidden Patron',
                        summary: 'Do not print this summary',
                        details: 'Do not print this writeup\n:::referee\nThe password is lantern.\n:::',
                        playerNotes: 'A handout',
                        sheet: { line: 'sheet secret' },
                        status: { fuelMark: 'scout' },
                        visibility: 'referee',
                    }),
                ] }),
            });
            assert.equal(seeded.status, 200, JSON.stringify(seeded.body));
            const created = await jsonFetch(`${base}/api/packages`, {
                method: 'POST', headers,
                body: JSON.stringify({ title: 'Gate', kind: 'people', description: '', tags: [], universeId }),
            });
            assert.equal(created.status, 201, JSON.stringify(created.body));
            const packageId = created.body.data.id;

            const unticked = await jsonFetch(`${base}/api/packages/${packageId}/versions`, {
                method: 'POST', headers,
                body: JSON.stringify({ universeId, hexKeys: [], recordIds: [PLAYERS] }),
            });
            assert.equal(unticked.status, 202, JSON.stringify(unticked.body));
            const first = await settle(base, packageId, 1, owner);
            assert.equal(first.body.data.state, 'done', JSON.stringify(first.body));
            const manifest = JSON.parse(r2Get(persistTo, `packages/${packageId}/1/manifest.json`));
            const shipped = JSON.parse(r2Get(persistTo, `objects/${manifest.records.contentHash}`));
            assert.equal(shipped.length, 1);
            assert.equal(shipped[0].id, PLAYERS);
            assert.equal(shipped[0].details, 'The port is open.');
            assert.equal(shipped[0].playerNotes, null);
            assert.equal(shipped[0].status.fuelMark, undefined);
            assert.equal(shipped[0].status.fuelTons, 10);
            const firstText = JSON.stringify(shipped);
            assert.equal(firstText.includes('Hidden Patron'), false);
            assert.equal(firstText.includes('lantern'), false);
            assert.equal(firstText.includes('Voss'), false);
            assert.equal(firstText.includes(':::'), false);

            const ticked = await jsonFetch(`${base}/api/packages/${packageId}/versions`, {
                method: 'POST', headers,
                body: JSON.stringify({ universeId, hexKeys: [], recordIds: [HIDDEN] }),
            });
            assert.equal(ticked.status, 202, JSON.stringify(ticked.body));
            const second = await settle(base, packageId, 2, owner);
            assert.equal(second.body.data.state, 'done', JSON.stringify(second.body));
            const again = JSON.parse(r2Get(persistTo, `packages/${packageId}/2/manifest.json`));
            const hidden = JSON.parse(r2Get(persistTo, `objects/${again.records.contentHash}`));
            assert.equal(hidden.length, 1);
            assert.equal(hidden[0].id, HIDDEN);
            assert.equal(hidden[0].name, 'Hidden Patron');
            assert.equal(hidden[0].summary, '');
            assert.equal(hidden[0].details, '');
            assert.equal(hidden[0].playerNotes, null);
            assert.equal(hidden[0].sheet, null);
            const secondText = JSON.stringify(hidden);
            assert.equal(secondText.includes('lantern'), false);
            assert.equal(secondText.includes('Do not print'), false);
            assert.equal(secondText.includes('sheet secret'), false);
            assert.equal(secondText.includes('fuelMark'), false);
            assert.equal(secondText.includes(':::'), false);
        } finally {
            if (child) stopDev(child.pid);
            rmSync(persistTo, { recursive: true, force: true });
        }
    });
}
