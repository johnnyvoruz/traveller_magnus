import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHmac, randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import test from 'node:test';
import { adminCookie, runWrangler } from './session.js';
import { startDev, stopDev, withDevServer, wranglerBin } from './server.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const STAMP = '2026-10-04T00:00:00.000Z';
const PLACE = 'cr_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const VESSEL = 'cr_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
const PERSON = 'cr_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3';
const CREW = 'cl_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const JOURNAL = 'cj_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const HEX = 'Spinward_Marches/1910';

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
VALUES ('${userId}', '${userId}', '${email}', 1, ${now}, ${now}, 'user', 0)
ON CONFLICT(id) DO UPDATE SET updated_at = ${now};
INSERT INTO session (id, expires_at, token, created_at, updated_at, user_id)
VALUES ('${sessionId}', ${expires}, '${token}', ${now}, ${now}, '${userId}');
`;
    const dir = mkdtempSync(path.join(tmpdir(), 'voyage-user-'));
    const file = path.join(dir, 'user.sql');
    writeFileSync(file, sql);
    const args = ['d1', 'execute', 'voyage', '--local', '--file', file];
    if (persistTo) args.push('--persist-to', persistTo);
    runWrangler(args);
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

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function record(id, over = {}) {
    return {
        id,
        type: 'place',
        kind: '',
        name: 'Place',
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

function journalEntry(id, over = {}) {
    return {
        id,
        kind: 'note',
        title: 'At the starport',
        body: `Met [[${PERSON}|Voss]]`,
        when: null,
        realDate: null,
        sequence: null,
        author: 'referee',
        visibility: 'referee',
        anchor: null,
        mentions: ['cr_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa9'],
        rev: 0,
        createdAt: STAMP,
        updatedAt: STAMP,
        deleted: false,
        baseRev: 0,
        ...over,
    };
}

function crewLink(over = {}) {
    return {
        id: CREW,
        from: PERSON,
        to: VESSEL,
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
        ...over,
    };
}

async function down(url) {
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
        try {
            await fetch(`${url}/api/health`);
        } catch {
            return;
        }
        await sleep(200);
    }
    throw new Error('wrangler kept answering /api/health after it was stopped');
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

if (process.env.RUN_API_TESTS !== '1') {
    test('campaign on the worker', { skip: 'set RUN_API_TESTS=1' }, () => {});
} else if (!existsSync(wranglerBin)) {
    test('campaign on the worker', { skip: 'wrangler is absent' }, () => {});
} else {
    test('campaign on the worker', { timeout: 180000 }, async () => {
        await withDevServer(async (base) => {
                const signedOutGet = await jsonFetch(`${base}/api/universes/missing/campaign?after=0&limit=1000`);
                assert.equal(signedOutGet.status, 401, JSON.stringify(signedOutGet.body));
                assert.equal(signedOutGet.body.error.code, 'unauthenticated');
                const signedOutPatch = await jsonFetch(`${base}/api/universes/missing/campaign/changes`, {
                    method: 'PATCH',
                    headers: { 'content-type': 'application/json' },
                    body: '{}',
                });
                assert.equal(signedOutPatch.status, 401, JSON.stringify(signedOutPatch.body));
                assert.equal(signedOutPatch.body.error.code, 'unauthenticated');

                const stamp = randomBytes(4).toString('hex');
                const owner = userCookie(`k3a${stamp}`, `k3a${stamp}@localhost`);
                const other = userCookie(`k3b${stamp}`, `k3b${stamp}@localhost`);
                const headers = { 'content-type': 'application/json', cookie: owner };

                const created = await jsonFetch(`${base}/api/universes`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ name: 'Campaign proof', truthVersion: null, editionDefault: 'MgT2E' }),
                });
                assert.equal(created.status, 201, JSON.stringify(created.body));
                const id = created.body.data.id;

                const empty = await jsonFetch(`${base}/api/universes/${id}/campaign?after=0&limit=1000`, {
                    headers: { cookie: owner },
                });
                assert.equal(empty.status, 200, JSON.stringify(empty.body));
                assert.deepEqual(empty.body.data.records, []);
                assert.deepEqual(empty.body.data.links, []);
                assert.deepEqual(empty.body.data.journal, []);
                assert.equal(empty.body.data.seq, 0);
                assert.equal(empty.body.data.done, true);
                assert.equal(empty.body.data.clock, null);
                assert.deepEqual(empty.body.data.settings, {
                    party: { vesselId: null, memberIds: [], anchor: null },
                    kinds: {},
                    calendar: { dateFormat: 'imperial' },
                    rev: 0,
                });

                const place = record(PLACE, { type: 'place', name: 'Startown' });
                const vessel = record(VESSEL, {
                    type: 'vessel',
                    name: 'Beowulf',
                    anchor: { kind: 'system', hexKey: HEX, locationLabel: 'Regina' },
                });
                const person = record(PERSON, {
                    type: 'person',
                    name: 'Voss',
                    anchor: { kind: 'record', id: VESSEL },
                });
                const link = crewLink();
                const seeded = await jsonFetch(`${base}/api/universes/${id}/campaign/changes`, {
                    method: 'PATCH',
                    headers,
                    body: JSON.stringify({ records: [place, vessel, person], links: [link] }),
                });
                assert.equal(seeded.status, 200, JSON.stringify(seeded.body));
                assert.deepEqual(seeded.body.data.conflicts, []);
                assert.deepEqual(seeded.body.data.applied.map((row) => row.id), [PLACE, VESSEL, PERSON, CREW]);
                const seedRev = Object.fromEntries(seeded.body.data.applied.map((row) => [row.id, row.rev]));
                const seedSeq = seeded.body.data.applied.map((row) => row.seq);
                assert.deepEqual(seedSeq, [...seedSeq].sort((a, b) => a - b));
                assert.equal(new Set(seedSeq).size, seedSeq.length);

                const loaded = await jsonFetch(`${base}/api/universes/${id}/campaign?after=0&limit=1000`, {
                    headers: { cookie: owner },
                });
                assert.equal(loaded.status, 200, JSON.stringify(loaded.body));
                assert.deepEqual(loaded.body.data.records.map((row) => row.id), [PLACE, VESSEL, PERSON]);
                assert.equal(loaded.body.data.records[1].anchor.hexKey, HEX);
                assert.equal(loaded.body.data.records[2].anchor.id, VESSEL);
                assert.deepEqual(loaded.body.data.links.map((row) => [row.id, row.kind, row.from, row.to]), [
                    [CREW, 'crew', PERSON, VESSEL],
                ]);

                const edited = await jsonFetch(`${base}/api/universes/${id}/campaign/changes`, {
                    method: 'PATCH',
                    headers,
                    body: JSON.stringify({
                        records: [record(VESSEL, {
                            type: 'vessel',
                            name: 'Beowulf renamed',
                            anchor: vessel.anchor,
                            rev: seedRev[VESSEL],
                            baseRev: seedRev[VESSEL],
                        })],
                    }),
                });
                assert.equal(edited.status, 200, JSON.stringify(edited.body));
                assert.equal(edited.body.data.conflicts.length, 0);
                assert.equal(edited.body.data.applied[0].id, VESSEL);
                const renamedRev = edited.body.data.applied[0].rev;

                const stale = await jsonFetch(`${base}/api/universes/${id}/campaign/changes`, {
                    method: 'PATCH',
                    headers,
                    body: JSON.stringify({
                        records: [record(VESSEL, {
                            type: 'vessel',
                            name: 'Stale name',
                            anchor: vessel.anchor,
                            rev: seedRev[VESSEL],
                            baseRev: seedRev[VESSEL],
                        })],
                    }),
                });
                assert.equal(stale.status, 200, JSON.stringify(stale.body));
                assert.equal(stale.body.data.applied.length, 0);
                assert.equal(stale.body.data.conflicts[0].table, 'records');
                assert.equal(stale.body.data.conflicts[0].id, VESSEL);
                assert.equal(stale.body.data.conflicts[0].current.name, 'Beowulf renamed');
                assert.equal(stale.body.data.conflicts[0].current.rev, renamedRev);

                const removed = await jsonFetch(`${base}/api/universes/${id}/campaign/changes`, {
                    method: 'PATCH',
                    headers,
                    body: JSON.stringify({ records: [{ id: VESSEL, baseRev: renamedRev, deleted: true }] }),
                });
                assert.equal(removed.status, 200, JSON.stringify(removed.body));
                const tombstones = Object.fromEntries(removed.body.data.applied.map((row) => [row.id, row]));
                assert.equal(tombstones[VESSEL] != null, true, JSON.stringify(removed.body));
                assert.equal(tombstones[CREW] != null, true, JSON.stringify(removed.body));
                const afterDelete = await jsonFetch(`${base}/api/universes/${id}/campaign?after=0&limit=1000`, {
                    headers: { cookie: owner },
                });
                const deletedVessel = afterDelete.body.data.records.find((row) => row.id === VESSEL);
                const deletedLink = afterDelete.body.data.links.find((row) => row.id === CREW);
                assert.equal(deletedVessel.deleted, true);
                assert.equal(deletedLink.deleted, true);

                const restored = await jsonFetch(`${base}/api/universes/${id}/campaign/changes`, {
                    method: 'PATCH',
                    headers,
                    body: JSON.stringify({
                        records: [record(VESSEL, {
                            type: 'vessel',
                            name: 'Beowulf renamed',
                            anchor: vessel.anchor,
                            rev: tombstones[VESSEL].rev,
                            baseRev: tombstones[VESSEL].rev,
                            deleted: false,
                        })],
                        links: [crewLink({
                            rev: tombstones[CREW].rev,
                            baseRev: tombstones[CREW].rev,
                            deleted: false,
                        })],
                    }),
                });
                assert.equal(restored.status, 200, JSON.stringify(restored.body));
                assert.deepEqual(restored.body.data.conflicts, [], JSON.stringify(restored.body));
                const afterRestore = await jsonFetch(`${base}/api/universes/${id}/campaign?after=0&limit=1000`, {
                    headers: { cookie: owner },
                });
                assert.equal(afterRestore.body.data.records.find((row) => row.id === VESSEL).deleted, false);
                assert.equal(afterRestore.body.data.links.find((row) => row.id === CREW).deleted, false);

                const party = {
                    party: {
                        vesselId: VESSEL,
                        memberIds: [PERSON],
                        anchor: { kind: 'system', hexKey: HEX, locationLabel: 'Regina' },
                    },
                    kinds: {},
                    calendar: { dateFormat: 'imperial' },
                    rev: 0,
                    baseRev: 0,
                };
                const settings = await jsonFetch(`${base}/api/universes/${id}/campaign/changes`, {
                    method: 'PATCH',
                    headers,
                    body: JSON.stringify({ settings: party }),
                });
                assert.equal(settings.status, 200, JSON.stringify(settings.body));
                assert.equal(settings.body.data.applied[0].table, 'settings');
                const settingsRev = settings.body.data.applied[0].rev;
                const staleParty = await jsonFetch(`${base}/api/universes/${id}/campaign/changes`, {
                    method: 'PATCH',
                    headers,
                    body: JSON.stringify({ settings: { ...party, baseRev: 0 } }),
                });
                assert.equal(staleParty.status, 200, JSON.stringify(staleParty.body));
                assert.equal(staleParty.body.data.applied.length, 0);
                assert.equal(staleParty.body.data.conflicts[0].table, 'settings');
                assert.equal(staleParty.body.data.conflicts[0].current.rev, settingsRev);
                assert.equal(staleParty.body.data.conflicts[0].current.party.vesselId, VESSEL);

                const hiddenGet = await jsonFetch(`${base}/api/universes/${id}/campaign?after=0&limit=1000`, {
                    headers: { cookie: other },
                });
                assert.equal(hiddenGet.status, 404, JSON.stringify(hiddenGet.body));
                assert.equal(hiddenGet.body.error.code, 'not_found');
                const hiddenPatch = await jsonFetch(`${base}/api/universes/${id}/campaign/changes`, {
                    method: 'PATCH',
                    headers: { 'content-type': 'application/json', cookie: other },
                    body: '{}',
                });
                assert.equal(hiddenPatch.status, 404, JSON.stringify(hiddenPatch.body));
                assert.equal(hiddenPatch.body.error.code, 'not_found');

                const foreign = await jsonFetch(`${base}/api/universes/${id}/campaign/changes`, {
                    method: 'PATCH',
                    headers: { ...headers, origin: 'https://evil.example' },
                    body: '{}',
                });
                assert.equal(foreign.status, 403, JSON.stringify(foreign.body));
                assert.equal(foreign.body.error.code, 'forbidden');

                const seen = [];
                let after = 0;
                let pages = 0;
                for (;;) {
                    const page = await jsonFetch(`${base}/api/universes/${id}/campaign?after=${after}&limit=2`, {
                        headers: { cookie: owner },
                    });
                    assert.equal(page.status, 200, JSON.stringify(page.body));
                    const data = page.body.data;
                    assert.equal(data.clock, null, JSON.stringify(data));
                    const ids = [...data.records.map((row) => row.id), ...data.links.map((row) => row.id)];
                    assert.ok(ids.length <= 2, JSON.stringify(data));
                    seen.push(...ids);
                    pages += 1;
                    if (data.done) break;
                    assert.ok(data.seq > after, JSON.stringify(data));
                    after = data.seq;
                    assert.ok(pages < 20, JSON.stringify(seen));
                }
                assert.ok(pages >= 2, JSON.stringify(seen));
                assert.deepEqual([...seen].sort(), [CREW, PERSON, PLACE, VESSEL].sort());

                const journalHome = await jsonFetch(`${base}/api/universes`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ name: 'Journal proof', truthVersion: null, editionDefault: 'MgT2E' }),
                });
                assert.equal(journalHome.status, 201, JSON.stringify(journalHome.body));
                const journalId = journalHome.body.data.id;
                const written = await jsonFetch(`${base}/api/universes/${journalId}/campaign/changes`, {
                    method: 'PATCH',
                    headers,
                    body: JSON.stringify({ journal: [journalEntry(JOURNAL)] }),
                });
                assert.equal(written.status, 200, JSON.stringify(written.body));
                assert.equal(written.body.data.conflicts.length, 0, JSON.stringify(written.body));
                assert.equal(written.body.data.applied[0].table, 'journal');
                assert.equal(written.body.data.applied[0].id, JOURNAL);
                const secondSession = userCookie(`k3a${stamp}`, `k3a${stamp}@localhost`);
                const reread = await jsonFetch(`${base}/api/universes/${journalId}/campaign?after=0&limit=1000`, {
                    headers: { cookie: secondSession },
                });
                assert.equal(reread.status, 200, JSON.stringify(reread.body));
                assert.equal(reread.body.data.journal.length, 1);
                assert.equal(reread.body.data.journal[0].id, JOURNAL);
                assert.equal(reread.body.data.journal[0].title, 'At the starport');
                assert.deepEqual(reread.body.data.journal[0].mentions, [PERSON]);
                assert.equal(reread.body.data.journal[0].rev, written.body.data.applied[0].rev);

                const bare = await jsonFetch(`${base}/api/universes`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ name: 'Clock absent', truthVersion: null, editionDefault: 'MgT2E' }),
                });
                assert.equal(bare.status, 201, JSON.stringify(bare.body));
                const bareId = bare.body.data.id;
                const missed = await jsonFetch(`${base}/api/universes/${bareId}/campaign/changes`, {
                    method: 'PATCH',
                    headers,
                    body: JSON.stringify({ clock: { days: 4, baseRev: 7 } }),
                });
                assert.equal(missed.status, 200, JSON.stringify(missed.body));
                assert.equal(missed.body.data.applied.length, 0, JSON.stringify(missed.body));
                assert.equal(missed.body.data.conflicts[0].table, 'clock');
                assert.equal(missed.body.data.conflicts[0].id, 'campaignTime');
                assert.equal(missed.body.data.conflicts[0].current, null);
                const missedGet = await jsonFetch(`${base}/api/universes/${bareId}/campaign?after=0&limit=1000`, {
                    headers: { cookie: owner },
                });
                assert.equal(missedGet.status, 200, JSON.stringify(missedGet.body));
                assert.equal(missedGet.body.data.clock, null);

                const deletes = [];
                for (let n = 1; n <= 200; n += 1) {
                    deletes.push({
                        id: `cr_aaaaaaaa-aaaa-4aaa-8aaa-${n.toString(16).padStart(12, '0')}`,
                        baseRev: 0,
                        deleted: true,
                    });
                }
                const over = await jsonFetch(`${base}/api/universes/${id}/campaign/changes`, {
                    method: 'PATCH',
                    headers,
                    body: JSON.stringify({ records: deletes, clock: { days: 1, baseRev: 0 } }),
                });
                assert.equal(over.status, 400, JSON.stringify(over.body));
                assert.equal(over.body.error.code, 'too_large');

                const negative = await jsonFetch(`${base}/api/universes/${id}/campaign/changes`, {
                    method: 'PATCH',
                    headers,
                    body: JSON.stringify({ clock: { days: -1, baseRev: 0 } }),
                });
                assert.equal(negative.status, 400, JSON.stringify(negative.body));
                assert.equal(negative.body.error.code, 'validation');
                const infinite = await jsonFetch(`${base}/api/universes/${id}/campaign/changes`, {
                    method: 'PATCH',
                    headers,
                    body: '{"clock":{"days":1e999,"baseRev":0}}',
                });
                assert.equal(infinite.status, 400, JSON.stringify(infinite.body));
                assert.equal(infinite.body.error.code, 'validation');

                const firstClock = await jsonFetch(`${base}/api/universes/${id}/campaign/changes`, {
                    method: 'PATCH',
                    headers,
                    body: JSON.stringify({ clock: { days: 100.25, baseRev: 0 } }),
                });
                assert.equal(firstClock.status, 200, JSON.stringify(firstClock.body));
                assert.equal(firstClock.body.data.conflicts.length, 0, JSON.stringify(firstClock.body));
                assert.equal(firstClock.body.data.applied[0].table, 'clock');
                assert.equal(firstClock.body.data.applied[0].id, 'campaignTime');
                assert.equal(firstClock.body.data.applied[0].rev, 1);
                const setClock = await jsonFetch(`${base}/api/universes/${id}/campaign?after=0&limit=1000`, {
                    headers: { cookie: owner },
                });
                assert.deepEqual(setClock.body.data.clock, { days: 100.25, rev: 1 });

                const editedClock = await jsonFetch(`${base}/api/universes/${id}/campaign/changes`, {
                    method: 'PATCH',
                    headers,
                    body: JSON.stringify({ clock: { days: 200.5, baseRev: 1 } }),
                });
                assert.equal(editedClock.status, 200, JSON.stringify(editedClock.body));
                assert.equal(editedClock.body.data.applied[0].rev, 2);

                const clash = await jsonFetch(`${base}/api/universes/${id}/campaign/changes`, {
                    method: 'PATCH',
                    headers,
                    body: JSON.stringify({ clock: { days: 1, baseRev: 1 } }),
                });
                assert.equal(clash.status, 200, JSON.stringify(clash.body));
                assert.equal(clash.body.data.applied.length, 0, JSON.stringify(clash.body));
                assert.equal(clash.body.data.conflicts[0].table, 'clock');
                assert.equal(clash.body.data.conflicts[0].id, 'campaignTime');
                assert.deepEqual(clash.body.data.conflicts[0].current, { days: 200.5, rev: 2 });
                const unchanged = await jsonFetch(`${base}/api/universes/${id}/campaign?after=1&limit=1`, {
                    headers: { cookie: owner },
                });
                assert.equal(unchanged.status, 200, JSON.stringify(unchanged.body));
                assert.deepEqual(unchanged.body.data.clock, { days: 200.5, rev: 2 });

                const cookie = adminCookie();
                const proofName = `Proof ${stamp}`;
                const proofId = 'cr_bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';
                const made = await jsonFetch(`${base}/api/universes`, {
                    method: 'POST',
                    headers: { 'content-type': 'application/json', cookie },
                    body: JSON.stringify({ name: `Store proof ${stamp}`, truthVersion: null, editionDefault: 'MgT2E' }),
                });
                assert.equal(made.status, 201, JSON.stringify(made.body));
                const universeId = made.body.data.id;
                const { openCampaign, campaign, setCampaignDate } = await import('../../apps/web/src/campaign/store.ts');
                const { commit, flushCampaign, lastError, pending, resetCampaign } = await import('../../apps/web/src/campaign/commit.ts');
                resetCampaign();
                const trace = [];
                const fetchImpl = async (url, init = {}) => {
                    const nextHeaders = new Headers(init.headers || {});
                    nextHeaders.set('cookie', cookie);
                    const target = String(url).startsWith('http') ? String(url) : `${base}${url}`;
                    const response = await fetch(target, { ...init, headers: nextHeaders });
                    const copy = response.clone();
                    let body = null;
                    try {
                        body = await copy.json();
                    } catch {
                        body = null;
                    }
                    trace.push({ url: target, status: response.status, body });
                    return response;
                };
                await openCampaign({
                    fetch: fetchImpl,
                    truthVersion: null,
                    universeId,
                    schedule: () => () => {},
                });
                assert.equal(campaign.status, 'ready', JSON.stringify(trace));
                assert.equal(campaign.universeId, universeId);
                commit({
                    records: [record(proofId, { type: 'place', name: proofName })],
                });
                await flushCampaign();
                assert.equal(lastError.value, '', JSON.stringify(trace));
                assert.equal(pending.value, false, JSON.stringify(trace));
                assert.equal(campaign.records[proofId].name, proofName);
                assert.equal(campaign.clock, null);
                setCampaignDate(42.5);
                assert.equal(campaign.clock.days, 42.5);
                assert.equal(campaign.clock.rev, 0);
                await flushCampaign();
                assert.equal(lastError.value, '', JSON.stringify(trace));
                assert.equal(pending.value, false, JSON.stringify(trace));
                assert.deepEqual(campaign.clock, { days: 42.5, rev: 1 });

                const childFile = path.join(mkdtempSync(path.join(tmpdir(), 'voyage-store-')), 'open.mjs');
                const storeUrl = pathToFileURL(path.join(root, 'apps', 'web', 'src', 'campaign', 'store.ts')).href;
                writeFileSync(childFile, `
                    const store = await import(${JSON.stringify(storeUrl)});
                    const base = process.env.VOYAGE_BASE;
                    const cookie = process.env.VOYAGE_COOKIE;
                    const fetchImpl = (url, init = {}) => {
                        const headers = new Headers(init.headers || {});
                        headers.set('cookie', cookie);
                        const target = String(url).startsWith('http') ? String(url) : base + String(url);
                        return fetch(target, { ...init, headers });
                    };
                    await store.openCampaign({
                        fetch: fetchImpl,
                        truthVersion: null,
                        universeId: process.env.VOYAGE_UNIVERSE,
                        schedule: () => () => {},
                    });
                    const row = store.campaign.records[process.env.VOYAGE_RECORD];
                    console.log(JSON.stringify({
                        status: store.campaign.status,
                        name: row ? row.name : null,
                        ids: Object.keys(store.campaign.records),
                        clock: store.campaign.clock,
                    }));
                `);
                const child = spawnSync(process.execPath, [childFile], {
                    encoding: 'utf8',
                    timeout: 60000,
                    env: {
                        ...process.env,
                        VOYAGE_BASE: base,
                        VOYAGE_COOKIE: cookie,
                        VOYAGE_UNIVERSE: universeId,
                        VOYAGE_RECORD: proofId,
                    },
                });
                assert.equal(child.status, 0, `${child.stdout || ''}\n${child.stderr || ''}`);
                const found = JSON.parse(String(child.stdout).trim().split(/\r?\n/).pop());
                assert.equal(found.status, 'ready', JSON.stringify(found));
                assert.equal(found.name, proofName);
                assert.deepEqual(found.clock, { days: 42.5, rev: 1 });
        });
    });

    test('campaign rows survive a private worker restart', { timeout: 180000 }, async () => {
        const persistTo = mkdtempSync(path.join(tmpdir(), 'voyage-dev-'));
        const port = 18799;
        const inspectorPort = 19229;
        const isolated = `http://127.0.0.1:${port}`;
        let child = null;
        try {
            runWrangler(['d1', 'migrations', 'apply', 'voyage', '--local', '--persist-to', persistTo]);
            const stamp = randomBytes(4).toString('hex');
            const owner = userCookie(`k3r${stamp}`, `k3r${stamp}@localhost`, persistTo);
            const headers = { 'content-type': 'application/json', cookie: owner };
            child = startDev({ port, persistTo, inspectorPort });
            await up(isolated);
            const created = await jsonFetch(`${isolated}/api/universes`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ name: 'Restart proof', truthVersion: null, editionDefault: 'MgT2E' }),
            });
            assert.equal(created.status, 201, JSON.stringify(created.body));
            const id = created.body.data.id;
            const seeded = await jsonFetch(`${isolated}/api/universes/${id}/campaign/changes`, {
                method: 'PATCH',
                headers,
                body: JSON.stringify({
                    records: [record(PLACE, { type: 'place', name: 'Startown' })],
                    clock: { days: 12, baseRev: 0 },
                }),
            });
            assert.equal(seeded.status, 200, JSON.stringify(seeded.body));
            const before = await jsonFetch(`${isolated}/api/universes/${id}/campaign?after=0&limit=1000`, {
                headers: { cookie: owner },
            });
            assert.equal(before.status, 200, JSON.stringify(before.body));
            stopDev(child.pid);
            child = null;
            await down(isolated);
            child = startDev({ port, persistTo, inspectorPort });
            await up(isolated);
            const afterRestart = await jsonFetch(`${isolated}/api/universes/${id}/campaign?after=0&limit=1000`, {
                headers: { cookie: owner },
            });
            assert.equal(afterRestart.status, 200, JSON.stringify(afterRestart.body));
            assert.deepEqual(afterRestart.body.data.records, before.body.data.records);
            assert.deepEqual(afterRestart.body.data.links, before.body.data.links);
            assert.deepEqual(afterRestart.body.data.journal, before.body.data.journal);
            assert.deepEqual(afterRestart.body.data.settings, before.body.data.settings);
            assert.deepEqual(afterRestart.body.data.clock, before.body.data.clock);
        } finally {
            if (child) stopDev(child.pid);
            rmSync(persistTo, { recursive: true, force: true });
        }
    });
}
