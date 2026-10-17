import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { runWrangler } from './session.js';
import { startDev, stopDev, wranglerBin } from './server.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const STAMP = '2026-10-15T00:00:00.000Z';
const SHIP = 'cr_eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1';
const WIDE = 'W'.repeat(81);

function authSecret() {
    const text = readFileSync(path.join(root, 'apps', 'api', '.dev.vars'), 'utf8');
    const line = text.split(/\r?\n/).find((item) => item.startsWith('BETTER_AUTH_SECRET='));
    if (!line) throw new Error('BETTER_AUTH_SECRET is unset');
    const value = line.slice('BETTER_AUTH_SECRET='.length).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) return value.slice(1, -1);
    return value;
}

function sqlFile(persistTo, sql) {
    const dir = mkdtempSync(path.join(tmpdir(), 'voyage-course-'));
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
INSERT INTO profile (user_id, handle, display_name, created_at)
VALUES ('${userId}', 'h${userId}', 'Ref', '${STAMP}');
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

function jump(sector, n, departs, arrives) {
    const local = String(n % 10000).padStart(4, '0');
    const next = String((n + 1) % 10000).padStart(4, '0');
    return {
        from: { kind: 'system', hexKey: `${sector}/${local}` },
        to: { kind: 'system', hexKey: `${sector}/${next}` },
        departs,
        arrives,
        mode: 'jump',
    };
}

function record(track) {
    return {
        id: SHIP,
        type: 'vessel',
        kind: '',
        name: 'Far Margin',
        summary: '',
        details: '',
        tags: [],
        anchor: { kind: 'system', hexKey: 'Spinward_Marches/1910' },
        when: null,
        visibility: 'players',
        playerNotes: null,
        sheet: null,
        status: { track },
        images: null,
        provenance: null,
        rev: 0,
        createdAt: STAMP,
        updatedAt: STAMP,
        deleted: false,
        baseRev: 0,
    };
}

async function openGame(base, persistTo) {
    const stamp = randomBytes(3).toString('hex');
    const version = `co${stamp}`;
    sqlFile(persistTo, `
INSERT INTO truth_versions (version, engine_version, state, started_at, released_at, sectors_total, sectors_done)
VALUES ('${version}', '1.2.0', 'released', '${STAMP}', '${STAMP}', 0, 0);
`);
    const owner = userCookie(`cown${stamp}`, `cown${stamp}@localhost`, persistTo);
    const headers = { 'content-type': 'application/json', cookie: owner, origin: base };
    const created = await jsonFetch(`${base}/api/universes`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: 'Course game', truthVersion: version, editionDefault: 'MgT2E' }),
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    return { id: created.body.data.id, headers, created: created.body.data, version };
}

if (process.env.RUN_API_TESTS !== '1') {
    test('public course on the worker', { skip: 'set RUN_API_TESTS=1' }, () => {});
} else if (!existsSync(wranglerBin)) {
    test('public course on the worker', { skip: 'wrangler is absent' }, () => {});
} else {
    test('a planned leg and a leg under way are the course, and the budget keeps them', { timeout: 180000 }, async () => {
        const persistTo = path.join(root, '.tmp', 'lane-b-course');
        rmSync(persistTo, { recursive: true, force: true });
        const port = 18880;
        const base = `http://127.0.0.1:${port}`;
        let child;
        try {
            runWrangler(['d1', 'migrations', 'apply', 'voyage', '--local', '--persist-to', persistTo]);
            child = startDev({ port, persistTo, inspectorPort: 19880 });
            await up(base);
            const game = await openGame(base, persistTo);
            assert.equal(game.created.showCourse, true);
            const finished = [];
            for (let i = 0; i < 400; i += 1) finished.push(jump(WIDE, i, i, i + 1));
            const underway = jump(WIDE, 400, 500, 700);
            const planned = jump(WIDE, 401, 700, 800);
            const hidden = {
                from: { kind: 'system', hexKey: `${WIDE}/0402` },
                to: { kind: 'system', hexKey: '~mine/1912' },
                departs: 800,
                arrives: 900,
                mode: 'jump',
            };
            const journal = [];
            for (let i = 0; i < 10; i += 1) {
                const hex = i.toString(16).padStart(12, '0');
                journal.push({
                    id: `cj_00000000-0000-4000-8000-${hex}`,
                    kind: 'note',
                    title: 'Note',
                    body: 'n'.repeat(2000),
                    when: null,
                    realDate: null,
                    sequence: null,
                    author: 'referee',
                    visibility: 'public',
                    anchor: null,
                    mentions: [],
                    rev: 0,
                    createdAt: STAMP,
                    updatedAt: STAMP,
                    deleted: false,
                    baseRev: 0,
                });
            }
            const seeded = await jsonFetch(`${base}/api/universes/${game.id}/campaign/changes`, {
                method: 'PATCH',
                headers: game.headers,
                body: JSON.stringify({
                    records: [record([...finished, underway, planned, hidden])],
                    journal,
                    settings: {
                        party: { vesselIds: [SHIP], aboard: {}, memberIds: [], anchor: null },
                        kinds: {},
                        calendar: { dateFormat: 'imperial' },
                        rev: 0,
                        baseRev: 0,
                    },
                    clock: { days: 600, baseRev: 0 },
                }),
            });
            assert.equal(seeded.status, 200, JSON.stringify(seeded.body));
            const on = await jsonFetch(`${base}/api/universes/${game.id}/public-games`, {
                method: 'PATCH',
                headers: game.headers,
                body: JSON.stringify({ public: true }),
            });
            assert.equal(on.status, 200, JSON.stringify(on.body));
            assert.equal(on.body.showCourse, true);
            const seen = await jsonFetch(`${base}/api/public-games?truthVersion=${game.version}&sector=${WIDE}`);
            assert.equal(seen.status, 200, JSON.stringify(seen.body));
            assert.equal(seen.body.hexes.length, 1, JSON.stringify(seen.body));
            const mark = seen.body.hexes[0].ships[0].mark;
            const card = await jsonFetch(`${base}/api/public-ships/${mark}`);
            assert.equal(card.status, 200, JSON.stringify(card.body));
            const ahead = [
                { from: `${WIDE}/0400`, to: `${WIDE}/0401`, departs: 500, arrives: 700 },
                { from: `${WIDE}/0401`, to: `${WIDE}/0402`, departs: 700, arrives: 800 },
            ];
            assert.deepEqual(card.body.course, ahead);
            assert.equal(card.body.legs.some((leg) => leg.arrives > 600), false);
            assert.equal(card.body.legs.length < 400, true);
            assert.equal(JSON.stringify(card.body).includes('~mine'), false);

            const off = await jsonFetch(`${base}/api/universes/${game.id}/public-games`, {
                method: 'PATCH',
                headers: game.headers,
                body: JSON.stringify({ public: true, showCourse: false }),
            });
            assert.equal(off.status, 200, JSON.stringify(off.body));
            assert.equal(off.body.showCourse, false);
            const hiddenCourse = await jsonFetch(`${base}/api/public-ships/${mark}`);
            assert.deepEqual(hiddenCourse.body.course, []);
            assert.equal(hiddenCourse.body.legs.length > 0, true);

            const restored = await jsonFetch(`${base}/api/universes/${game.id}/public-games`, {
                method: 'PATCH',
                headers: game.headers,
                body: JSON.stringify({ public: true, showCourse: true }),
            });
            assert.equal(restored.body.showCourse, true);
            const back = await jsonFetch(`${base}/api/public-ships/${mark}`);
            assert.deepEqual(back.body.course, ahead);
        } finally {
            stopDev(child?.pid);
            rmSync(persistTo, { recursive: true, force: true });
        }
    });

    test('before 0020 the course is empty and the switch answers one sentence', { timeout: 180000 }, async () => {
        const persistTo = path.join(root, '.tmp', 'lane-b-course-old');
        rmSync(persistTo, { recursive: true, force: true });
        const port = 18881;
        const base = `http://127.0.0.1:${port}`;
        let child;
        try {
            runWrangler(['d1', 'migrations', 'apply', 'voyage', '--local', '--persist-to', persistTo]);
            sqlFile(persistTo, 'ALTER TABLE public_cards DROP COLUMN course; ALTER TABLE universes DROP COLUMN show_course;');
            child = startDev({ port, persistTo, inspectorPort: 19881 });
            await up(base);
            const game = await openGame(base, persistTo);
            assert.equal(Object.hasOwn(game.created, 'showCourse'), false);
            const seeded = await jsonFetch(`${base}/api/universes/${game.id}/campaign/changes`, {
                method: 'PATCH',
                headers: game.headers,
                body: JSON.stringify({
                    records: [record([
                        jump('Spinward_Marches', 1910, 1, 10),
                        jump('Spinward_Marches', 1911, 20, 40),
                    ])],
                    settings: {
                        party: { vesselIds: [SHIP], aboard: {}, memberIds: [], anchor: null },
                        kinds: {},
                        calendar: { dateFormat: 'imperial' },
                        rev: 0,
                        baseRev: 0,
                    },
                    clock: { days: 15, baseRev: 0 },
                }),
            });
            assert.equal(seeded.status, 200, JSON.stringify(seeded.body));
            const on = await jsonFetch(`${base}/api/universes/${game.id}/public-games`, {
                method: 'PATCH',
                headers: game.headers,
                body: JSON.stringify({ public: true }),
            });
            assert.equal(on.status, 200, JSON.stringify(on.body));
            assert.equal(Object.hasOwn(on.body, 'showCourse'), false);
            const seen = await jsonFetch(`${base}/api/public-games?truthVersion=${game.version}&sector=Spinward_Marches`);
            const mark = seen.body.hexes[0].ships[0].mark;
            const card = await jsonFetch(`${base}/api/public-ships/${mark}`);
            assert.equal(card.status, 200, JSON.stringify(card.body));
            assert.deepEqual(card.body.course, []);
            assert.equal(card.body.legs.length, 1);
            const refused = await jsonFetch(`${base}/api/universes/${game.id}/public-games`, {
                method: 'PATCH',
                headers: game.headers,
                body: JSON.stringify({ public: false, showCourse: false }),
            });
            assert.equal(refused.status, 503, JSON.stringify(refused.body));
            assert.equal(refused.body.error.message, 'The course switch is not available yet.');
            const still = await jsonFetch(`${base}/api/universes/${game.id}`, { headers: game.headers });
            assert.equal(still.body.data.publicGames, true);
            assert.equal(Object.hasOwn(still.body.data, 'showCourse'), false);
            const stillCard = await jsonFetch(`${base}/api/public-ships/${mark}`);
            assert.equal(stillCard.status, 200, JSON.stringify(stillCard.body));

            sqlFile(persistTo, "ALTER TABLE universes ADD COLUMN show_course integer NOT NULL DEFAULT 1; ALTER TABLE public_cards ADD COLUMN course text NOT NULL DEFAULT '[]';");
            const saved = await jsonFetch(`${base}/api/universes/${game.id}/public-games`, {
                method: 'PATCH',
                headers: game.headers,
                body: JSON.stringify({ public: true, showCourse: true }),
            });
            assert.equal(saved.status, 200, JSON.stringify(saved.body));
            assert.equal(saved.body.showCourse, true);
            const after = await jsonFetch(`${base}/api/public-ships/${mark}`);
            assert.deepEqual(after.body.course, [{ from: 'Spinward_Marches/1911', to: 'Spinward_Marches/1912', departs: 20, arrives: 40 }]);
        } finally {
            stopDev(child?.pid);
            rmSync(persistTo, { recursive: true, force: true });
        }
    });
}
