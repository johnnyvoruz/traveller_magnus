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
const STAMP = '2026-10-14T00:00:00.000Z';
const SHIP = 'cr_dddddddd-dddd-4ddd-8ddd-ddddddddddd1';
const PERSON = 'cr_dddddddd-dddd-4ddd-8ddd-ddddddddddd2';
const PUBLIC_NOTE = 'cj_dddddddd-dddd-4ddd-8ddd-ddddddddddd1';
const HIDDEN_NOTE = 'cj_dddddddd-dddd-4ddd-8ddd-ddddddddddd2';
const PLAYERS_NOTE = 'cj_dddddddd-dddd-4ddd-8ddd-ddddddddddd3';

function authSecret() {
    const text = readFileSync(path.join(root, 'apps', 'api', '.dev.vars'), 'utf8');
    const line = text.split(/\r?\n/).find((item) => item.startsWith('BETTER_AUTH_SECRET='));
    if (!line) throw new Error('BETTER_AUTH_SECRET is unset');
    const value = line.slice('BETTER_AUTH_SECRET='.length).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) return value.slice(1, -1);
    return value;
}

function sqlFile(persistTo, sql) {
    const dir = mkdtempSync(path.join(tmpdir(), 'voyage-card-'));
    const file = path.join(dir, 'rows.sql');
    writeFileSync(file, sql);
    try {
        runWrangler(['d1', 'execute', 'voyage', '--local', '--persist-to', persistTo, '--file', file]);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

function userCookie(userId, email, persistTo, handle = `h${userId}`) {
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
VALUES ('${userId}', '${handle}', 'Ref', '${STAMP}');
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

function note(id, over = {}) {
    return {
        id,
        kind: 'note',
        title: 'Note',
        body: '',
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
        ...over,
    };
}

if (process.env.RUN_API_TESTS !== '1') {
    test('public card on the worker', { skip: 'set RUN_API_TESTS=1' }, () => {});
} else if (!existsSync(wranglerBin)) {
    test('public card on the worker', { skip: 'wrangler is absent' }, () => {});
} else {
    test('a public card shows the finished route and public notes', { timeout: 180000 }, async () => {
        const persistTo = path.join(root, '.tmp', 'lane-b-card');
        rmSync(persistTo, { recursive: true, force: true });
        const port = 18868;
        const base = `http://127.0.0.1:${port}`;
        let child;
        try {
            runWrangler(['d1', 'migrations', 'apply', 'voyage', '--local', '--persist-to', persistTo]);
            const stamp = randomBytes(3).toString('hex');
            const version = `pc${stamp}`;
            const email = `pca${stamp}@localhost`;
            sqlFile(persistTo, `
INSERT INTO truth_versions (version, engine_version, state, started_at, released_at, sectors_total, sectors_done)
VALUES ('${version}', '1.2.0', 'released', '${STAMP}', '${STAMP}', 0, 0);
`);
            const owner = userCookie(`pca${stamp}`, email, persistTo, 'zzrefhandle');
            const reader = userCookie(`pcb${stamp}`, `pcb${stamp}@localhost`, persistTo);
            child = startDev({ port, persistTo, inspectorPort: 19868 });
            await up(base);
            const headers = { 'content-type': 'application/json', cookie: owner, origin: base };
            const created = await jsonFetch(`${base}/api/universes`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ name: 'Open game', truthVersion: version, editionDefault: 'MgT2E' }),
            });
            assert.equal(created.status, 201, JSON.stringify(created.body));
            assert.equal(created.body.data.showReferee, false);
            const id = created.body.data.id;
            const seeded = await jsonFetch(`${base}/api/universes/${id}/campaign/changes`, {
                method: 'PATCH',
                headers,
                body: JSON.stringify({
                    records: [
                        record(SHIP, {
                            name: 'Far Margin',
                            status: {
                                track: [
                                    {
                                        from: { kind: 'system', hexKey: 'Spinward_Marches/1910', bodyKey: 'w1' },
                                        to: { kind: 'system', hexKey: 'Spinward_Marches/1911' },
                                        departs: 1,
                                        arrives: 10,
                                        mode: 'jump',
                                        note: 'zzsecretnote',
                                    },
                                    {
                                        from: { kind: 'system', hexKey: 'Spinward_Marches/1911' },
                                        to: { kind: 'system', hexKey: 'zzunfinished/1912' },
                                        departs: 20,
                                        arrives: 500,
                                        mode: 'flight',
                                    },
                                ],
                            },
                        }),
                        record(PERSON, { type: 'person', name: 'Voss' }),
                    ],
                    journal: [
                        note(PUBLIC_NOTE, { title: 'At Regina', body: 'zzpublicbody', visibility: 'public', updatedAt: '2026-10-14T00:00:03.000Z' }),
                        note(HIDDEN_NOTE, { title: 'zzrefereejournal', body: 'zzsecretbody', visibility: 'referee', updatedAt: '2026-10-14T00:00:04.000Z' }),
                        note(PLAYERS_NOTE, { title: 'zzplayersjournal', body: 'zzplayersbody', visibility: 'players', updatedAt: '2026-10-14T00:00:02.000Z' }),
                    ],
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
                    clock: { days: 15, baseRev: 0 },
                }),
            });
            assert.equal(seeded.status, 200, JSON.stringify(seeded.body));
            const on = await jsonFetch(`${base}/api/universes/${id}/public-games`, {
                method: 'PATCH',
                headers,
                body: JSON.stringify({ public: true }),
            });
            assert.equal(on.status, 200, JSON.stringify(on.body));
            assert.equal(on.body.public, true);
            assert.equal(on.body.showReferee, false);
            const ownerFeed = await jsonFetch(`${base}/api/public-games?truthVersion=${version}&sector=Spinward_Marches`, { headers: { cookie: owner } });
            assert.deepEqual(ownerFeed.body, { hexes: [] });
            const seen = await jsonFetch(`${base}/api/public-games?truthVersion=${version}&sector=Spinward_Marches`);
            assert.equal(seen.status, 200, JSON.stringify(seen.body));
            assert.equal(seen.body.hexes.length, 1);
            assert.equal(seen.body.hexes[0].ships[0].example, false);
            const mark = seen.body.hexes[0].ships[0].mark;
            const missing = await jsonFetch(`${base}/api/public-ships/pm_0123456789ABCDEFGHJKMNPQRS`);
            assert.equal(missing.status, 404, JSON.stringify(missing.body));
            assert.equal(missing.body.error.message, 'No such ship.');
            const card = await jsonFetch(`${base}/api/public-ships/${mark}`);
            assert.equal(card.status, 200, JSON.stringify(card.body));
            assert.equal(card.body.game, 'Open game');
            assert.equal(card.body.referee, null);
            assert.equal(card.body.example, false);
            assert.equal(card.body.ship, 'Far Margin');
            assert.deepEqual(card.body.aboard, ['Voss']);
            assert.deepEqual(card.body.legs, [{ from: 'Spinward_Marches/1910', to: 'Spinward_Marches/1911', departs: 1, arrives: 10 }]);
            assert.deepEqual(card.body.course, [{ from: 'Spinward_Marches/1911', to: 'zzunfinished/1912', departs: 20, arrives: 500 }]);
            assert.deepEqual(card.body.journal, [{ title: 'At Regina', body: 'zzpublicbody', when: null, realDate: null }]);
            const leaked = JSON.stringify(card.body);
            for (const marker of [email, 'zzrefereejournal', 'zzsecretbody', 'zzplayersjournal', 'zzsecretnote', 'cr_', 'cj_', id, 'universeId', 'w1', 'bodyKey']) {
                assert.equal(leaked.includes(marker), false, marker);
            }

            const named = await jsonFetch(`${base}/api/universes/${id}/public-games`, {
                method: 'PATCH',
                headers,
                body: JSON.stringify({ public: true, showReferee: true }),
            });
            assert.equal(named.body.showReferee, true);
            const shown = await jsonFetch(`${base}/api/universes/${id}`, { headers: { cookie: owner } });
            assert.equal(shown.body.data.showReferee, true);
            const namedCard = await jsonFetch(`${base}/api/public-ships/${mark}`);
            assert.equal(namedCard.body.referee, 'zzrefhandle');
            assert.equal(JSON.stringify(namedCard.body).includes(email), false);

            const page = await jsonFetch(`${base}/api/universes/${id}/campaign?after=0&limit=1000`, { headers: { cookie: owner } });
            const stored = page.body.data.journal.find((entry) => entry.id === PUBLIC_NOTE);
            assert.equal(stored.visibility, 'players');
            const echoed = await jsonFetch(`${base}/api/universes/${id}/campaign/changes`, {
                method: 'PATCH',
                headers,
                body: JSON.stringify({ journal: [{ ...stored, title: 'At Regina still', baseRev: stored.rev }] }),
            });
            assert.equal(echoed.status, 200, JSON.stringify(echoed.body));
            assert.equal(echoed.body.data.conflicts.length, 0, JSON.stringify(echoed.body));
            const kept = await jsonFetch(`${base}/api/public-ships/${mark}`);
            assert.equal(kept.body.journal[0].title, 'At Regina still');
            assert.equal(kept.body.journal[0].body, 'zzpublicbody');

            const publicHeaders = { ...headers, 'x-voyage-journal': 'public' };
            const stale = await jsonFetch(`${base}/api/universes/${id}/campaign/changes`, {
                method: 'PATCH',
                headers,
                body: JSON.stringify({ journal: [{ ...stored, title: 'At Regina still', baseRev: 0 }] }),
            });
            assert.equal(stale.body.data.conflicts[0].current.visibility, 'players');
            const staleOpen = await jsonFetch(`${base}/api/universes/${id}/campaign/changes`, {
                method: 'PATCH',
                headers: publicHeaders,
                body: JSON.stringify({ journal: [{ ...stored, title: 'At Regina still', baseRev: 0 }] }),
            });
            assert.equal(staleOpen.body.data.conflicts[0].current.visibility, 'public');
            const opened = await jsonFetch(`${base}/api/universes/${id}/campaign?after=0&limit=1000`, { headers: publicHeaders });
            const live = opened.body.data.journal.find((entry) => entry.id === PUBLIC_NOTE);
            assert.equal(live.visibility, 'public');
            const cleared = await jsonFetch(`${base}/api/universes/${id}/campaign/changes`, {
                method: 'PATCH',
                headers: publicHeaders,
                body: JSON.stringify({ journal: [{ ...live, visibility: 'players', baseRev: live.rev }] }),
            });
            assert.equal(cleared.status, 200, JSON.stringify(cleared.body));
            assert.equal(cleared.body.data.conflicts.length, 0, JSON.stringify(cleared.body));
            const afterClear = await jsonFetch(`${base}/api/public-ships/${mark}`);
            assert.deepEqual(afterClear.body.journal, []);
            const clearRev = cleared.body.data.applied.find((row) => row.id === PUBLIC_NOTE).rev;
            const restored = await jsonFetch(`${base}/api/universes/${id}/campaign/changes`, {
                method: 'PATCH',
                headers: publicHeaders,
                body: JSON.stringify({ journal: [{ ...live, visibility: 'public', title: 'At Regina still', baseRev: clearRev }] }),
            });
            assert.equal(restored.status, 200, JSON.stringify(restored.body));
            const afterRestore = await jsonFetch(`${base}/api/public-ships/${mark}`);
            assert.equal(afterRestore.body.journal[0].title, 'At Regina still');
            const restoreRev = restored.body.data.applied.find((row) => row.id === PUBLIC_NOTE).rev;

            sqlFile(persistTo, `UPDATE universes SET example = 1 WHERE id = '${id}';`);
            const flagged = await jsonFetch(`${base}/api/public-games?truthVersion=${version}&sector=Spinward_Marches`, { headers: { cookie: reader } });
            assert.equal(flagged.body.hexes[0].ships[0].example, true);
            const exampleCard = await jsonFetch(`${base}/api/public-ships/${mark}`);
            assert.equal(exampleCard.body.example, true);

            const hidden = await jsonFetch(`${base}/api/universes/${id}/campaign/changes`, {
                method: 'PATCH',
                headers,
                body: JSON.stringify({
                    journal: [{ ...stored, title: 'At Regina still', visibility: 'referee', baseRev: restoreRev }],
                }),
            });
            assert.equal(hidden.status, 200, JSON.stringify(hidden.body));
            const afterHide = await jsonFetch(`${base}/api/public-ships/${mark}`);
            assert.deepEqual(afterHide.body.journal, []);

            const removed = await jsonFetch(`${base}/api/universes/${id}`, { method: 'DELETE', headers });
            assert.equal(removed.status, 200, JSON.stringify(removed.body));
            const gone = await jsonFetch(`${base}/api/public-ships/${mark}`);
            assert.equal(gone.status, 404, JSON.stringify(gone.body));

            let limited = null;
            for (let n = 0; n < 61; n += 1) {
                limited = await jsonFetch(`${base}/api/public-ships/${mark}`, { headers: { 'cf-connecting-ip': '203.0.113.8' } });
            }
            assert.equal(limited.status, 429, JSON.stringify(limited.body));
            const otherIp = await jsonFetch(`${base}/api/public-ships/${mark}`, { headers: { 'cf-connecting-ip': '203.0.113.9' } });
            assert.equal(otherIp.status, 404, JSON.stringify(otherIp.body));
        } finally {
            stopDev(child?.pid);
            rmSync(persistTo, { recursive: true, force: true });
        }
    });

    test('without 0018 the card is refused and the feed stays signed in', { timeout: 180000 }, async () => {
        const persistTo = path.join(root, '.tmp', 'lane-b-card-old');
        rmSync(persistTo, { recursive: true, force: true });
        const port = 18872;
        const base = `http://127.0.0.1:${port}`;
        let child;
        try {
            runWrangler(['d1', 'migrations', 'apply', 'voyage', '--local', '--persist-to', persistTo]);
            sqlFile(persistTo, 'DROP TABLE public_cards;');
            const stamp = randomBytes(3).toString('hex');
            const version = `pd${stamp}`;
            sqlFile(persistTo, `
INSERT INTO truth_versions (version, engine_version, state, started_at, released_at, sectors_total, sectors_done)
VALUES ('${version}', '1.2.0', 'released', '${STAMP}', '${STAMP}', 0, 0);
`);
            const owner = userCookie(`pdc${stamp}`, `pdc${stamp}@localhost`, persistTo);
            child = startDev({ port, persistTo, inspectorPort: 19872 });
            await up(base);
            const headers = { 'content-type': 'application/json', cookie: owner, origin: base };
            const created = await jsonFetch(`${base}/api/universes`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ name: 'Still one ship', truthVersion: version, editionDefault: 'MgT2E' }),
            });
            assert.equal(created.status, 201, JSON.stringify(created.body));
            assert.equal(Object.hasOwn(created.body.data, 'showReferee'), false);
            const id = created.body.data.id;
            const seeded = await jsonFetch(`${base}/api/universes/${id}/campaign/changes`, {
                method: 'PATCH',
                headers,
                body: JSON.stringify({
                    records: [record(SHIP, { name: 'Far Margin' })],
                    settings: {
                        party: { vesselIds: [SHIP], aboard: {}, memberIds: [], anchor: null },
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
                body: JSON.stringify({ public: true, showReferee: true }),
            });
            assert.equal(on.status, 200, JSON.stringify(on.body));
            assert.equal(on.body.public, true);
            assert.equal(Object.hasOwn(on.body, 'showReferee'), false);
            const signedOut = await jsonFetch(`${base}/api/public-games?truthVersion=${version}&sector=Spinward_Marches`);
            assert.equal(signedOut.status, 401, JSON.stringify(signedOut.body));
            const seen = await jsonFetch(`${base}/api/public-games?truthVersion=${version}&sector=Spinward_Marches`, { headers: { cookie: owner } });
            assert.equal(seen.body.hexes.length, 0);
            const reader = userCookie(`pdd${stamp}`, `pdd${stamp}@localhost`, persistTo);
            const feed = await jsonFetch(`${base}/api/public-games?truthVersion=${version}&sector=Spinward_Marches`, { headers: { cookie: reader } });
            assert.equal(feed.body.hexes[0].hex, '1910');
            assert.equal(Object.hasOwn(feed.body.hexes[0].ships[0], 'example'), false);
            const refused = await jsonFetch(`${base}/api/public-ships/${feed.body.hexes[0].ships[0].mark}`);
            assert.equal(refused.status, 401, JSON.stringify(refused.body));
            const refusedIn = await jsonFetch(`${base}/api/public-ships/${feed.body.hexes[0].ships[0].mark}`, { headers: { cookie: reader } });
            assert.equal(refusedIn.status, 503, JSON.stringify(refusedIn.body));
            assert.equal(refusedIn.body.error.message, 'Public ship cards are not available yet.');
        } finally {
            stopDev(child?.pid);
            rmSync(persistTo, { recursive: true, force: true });
        }
    });
}
