/**
 * A player's piece on a party ship. The object adds it to the record it holds.
 * No baseRev, so a referee's whole-record save cannot drop it.
 */
import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { applyCampaignChanges, installCampaignSchema, readCampaign } from '../../apps/api/src/universe/campaign.ts';
import { runWrangler } from './session.js';
import { startDev, stopDev } from './server.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const NOW = '2026-11-02T00:00:00.000Z';
const SHIP = 'cr_00000000-0000-4000-8000-0000000000a1';
const ADA = 'cr_00000000-0000-4000-8000-0000000000a2';
const BEN = 'cr_00000000-0000-4000-8000-0000000000a3';
const HIDDEN = 'cr_00000000-0000-4000-8000-0000000000a4';
const LOOSE = 'cr_00000000-0000-4000-8000-0000000000a5';
const CLOSED = 'cr_00000000-0000-4000-8000-0000000000a6';

function open() {
    const db = new DatabaseSync(':memory:');
    const sql = {
        exec(query, ...params) {
            const statement = query.trim();
            if (/^(begin|commit|rollback)\b/i.test(statement)) {
                db.exec(statement);
                return [];
            }
            const prepared = db.prepare(statement);
            if (/^(select|with|pragma)\b/i.test(statement)) return prepared.all(...params);
            prepared.run(...params);
            return [];
        },
        transaction(fn) {
            db.exec('BEGIN');
            try {
                const result = fn();
                db.exec('COMMIT');
                return result;
            } catch (err) {
                db.exec('ROLLBACK');
                throw err;
            }
        },
    };
    installCampaignSchema(sql);
    return sql;
}

function record(id, over = {}) {
    return {
        id,
        type: 'vessel',
        kind: '',
        name: 'Kestrel',
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
        rev: 0,
        createdAt: NOW,
        updatedAt: NOW,
        deleted: false,
        provenance: null,
        baseRev: 0,
        ...over,
    };
}

function crew(trade = true) {
    return {
        ledger: [],
        cargo: [],
        passengers: [],
        crew: [
            { personId: ADA, role: 'Captain' },
            { personId: BEN, role: 'Pilot' },
        ],
        roles: [
            { name: 'Captain', ledger: true, trade, locker: true },
            { name: 'Pilot', ledger: true, trade, locker: false },
        ],
    };
}

function settings(vesselIds, baseRev = 0) {
    return {
        party: { vesselIds, aboard: {}, memberIds: [ADA, BEN], anchor: null },
        kinds: {},
        calendar: { dateFormat: 'imperial' },
        rev: baseRev,
        baseRev,
    };
}

function line(memo) {
    return { when: { year: 1105, day: 12 }, amount: 100, memo, kind: 'income' };
}

function lot(label) {
    return { label, tons: 2 };
}

function shipOf(sql, id = SHIP) {
    return readCampaign(sql, 0, 1000).records.find((row) => row.id === id);
}

function refusal(fn) {
    try {
        fn();
        return null;
    } catch (err) {
        return err;
    }
}

test('two appends land, and a stale whole-record save drops neither', () => {
    const sql = open();
    applyCampaignChanges(sql, {
        records: [
            record(ADA, { type: 'person', name: 'Ada' }),
            record(BEN, { type: 'person', name: 'Ben' }),
            record(SHIP, { status: crew() }),
            record(HIDDEN, { visibility: 'referee', status: crew() }),
            record(LOOSE, { name: 'Loose', status: crew() }),
            record(CLOSED, { name: 'Closed', status: { ...crew(), roles: undefined } }),
        ],
        settings: settings([SHIP, CLOSED]),
    }, NOW);
    const before = shipOf(sql);
    const ada = { userId: 'ada', personId: ADA };
    const ben = { userId: 'ben', personId: BEN };
    const first = applyCampaignChanges(sql, { appends: [{ id: SHIP, append: { ledger: [line('Ada')] } }] }, NOW, false, ada);
    const second = applyCampaignChanges(sql, { appends: [{ id: SHIP, append: { cargo: { add: [lot('Ore')] } } }] }, NOW, false, ben);
    assert.equal(first.conflicts.length, 0);
    assert.equal(second.conflicts.length, 0);
    const stale = applyCampaignChanges(sql, { records: [{ ...before, baseRev: before.rev }] }, NOW);
    assert.equal(stale.conflicts.some((row) => row.id === SHIP), true);
    const kept = shipOf(sql);
    assert.equal(kept.status.ledger.length, 1);
    assert.equal(kept.status.ledger[0].memo, 'Ada');
    assert.equal(kept.status.ledger[0].by, ADA);
    assert.equal(kept.status.cargo.length, 1);
    assert.equal(kept.status.cargo[0].label, 'Ore');
    const named = applyCampaignChanges(sql, { records: [{ ...kept, name: 'Kestrel Dawn', baseRev: kept.rev }] }, NOW);
    assert.equal(named.conflicts.length, 0);
    applyCampaignChanges(sql, { appends: [{ id: SHIP, append: { passengers: { add: [{ label: 'Tam', class: 'Middle' }] } } }] }, NOW, false, ada);
    const after = shipOf(sql);
    assert.equal(after.name, 'Kestrel Dawn');
    assert.equal(after.status.ledger.length, 1);
    assert.equal(after.status.cargo.length, 1);
    assert.equal(after.status.passengers.length, 1);
    const closed = refusal(() => applyCampaignChanges(sql, { appends: [{ id: SHIP, append: { cargo: { add: [lot('Late')] } } }] }, NOW, false, { userId: 'ben', personId: BEN }));
    assert.equal(closed, null);
    const pilot = shipOf(sql);
    const traded = { ...pilot.status, roles: pilot.status.roles.map((role) => role.name === 'Pilot' ? { ...role, trade: false } : role) };
    applyCampaignChanges(sql, { records: [{ ...pilot, status: traded, baseRev: pilot.rev }] }, NOW);
    const off = refusal(() => applyCampaignChanges(sql, { appends: [{ id: SHIP, append: { cargo: { add: [lot('No')] } } }] }, NOW, false, ben));
    assert.equal(off.code, 'forbidden');
    assert.equal(off.message, 'You cannot change that.');
    const whole = refusal(() => applyCampaignChanges(sql, { records: [{ ...pilot, baseRev: pilot.rev }] }, NOW, false, ben));
    assert.equal(whole.code, 'forbidden');
    assert.equal(whole.message, 'You cannot change that.');
    const hidden = refusal(() => applyCampaignChanges(sql, { appends: [{ id: HIDDEN, append: { ledger: [line('Hidden')] } }] }, NOW, false, ada));
    assert.equal(hidden.code, 'forbidden');
    const loose = refusal(() => applyCampaignChanges(sql, { appends: [{ id: LOOSE, append: { ledger: [line('Loose')] } }] }, NOW, false, ada));
    assert.equal(loose.code, 'forbidden');
    const missing = refusal(() => applyCampaignChanges(sql, { appends: [{ id: CLOSED, append: { ledger: [line('Closed')] } }] }, NOW, false, ada));
    assert.equal(missing.code, 'forbidden');
    assert.equal(shipOf(sql).status.cargo.length, 2);
});

function authSecret() {
    const text = readFileSync(path.join(root, 'apps', 'api', '.dev.vars'), 'utf8');
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
    const sql = `
INSERT INTO user (id, name, email, email_verified, created_at, updated_at, role, banned)
VALUES ('${userId}', '${userId}', '${email}', 1, ${now}, ${now}, 'user', 0);
INSERT INTO session (id, expires_at, token, created_at, updated_at, user_id)
VALUES ('${sessionId}', ${expires}, '${token}', ${now}, ${now}, '${userId}');
`;
    const dir = mkdtempSync(path.join(tmpdir(), 'voyage-user-'));
    const file = path.join(dir, 'user.sql');
    writeFileSync(file, sql);
    runWrangler(['d1', 'execute', 'voyage', '--local', '--persist-to', persistTo, '--file', file]);
    const signature = createHmac('sha256', authSecret()).update(token).digest('base64');
    return `__Secure-better-auth.session_token=${encodeURIComponent(`${token}.${signature}`)}`;
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

if (process.env.RUN_API_TESTS !== '1') {
    test('the append door on the worker', { skip: 'set RUN_API_TESTS=1' }, () => {});
} else {
    test('the append door on the worker', { timeout: 180000 }, async () => {
        const ownedPersist = !process.env.VOYAGE_PERSIST_TO;
        const persistTo = process.env.VOYAGE_PERSIST_TO || mkdtempSync(path.join(tmpdir(), 'voyage-append-'));
        const port = Number(process.env.VOYAGE_API_PORT || 18948);
        const inspectorPort = Number(process.env.VOYAGE_INSPECTOR_PORT || 19948);
        const base = `http://127.0.0.1:${port}`;
        let child = null;
        try {
            runWrangler(['d1', 'migrations', 'apply', 'voyage', '--local', '--persist-to', persistTo]);
            const stamp = randomBytes(4).toString('hex');
            const owner = userCookie(`apown${stamp}`, `apown${stamp}@localhost`, persistTo);
            const ada = userCookie(`apada${stamp}`, `apada${stamp}@localhost`, persistTo);
            const ben = userCookie(`apben${stamp}`, `apben${stamp}@localhost`, persistTo);
            const stranger = userCookie(`apstr${stamp}`, `apstr${stamp}@localhost`, persistTo);
            const ownerHeaders = { 'content-type': 'application/json', cookie: owner, origin: base };
            const adaHeaders = { 'content-type': 'application/json', cookie: ada, origin: base };
            const benHeaders = { 'content-type': 'application/json', cookie: ben, origin: base };
            child = startDev({ port, persistTo, inspectorPort });
            await up(base);
            const created = await jsonFetch(`${base}/api/universes`, {
                method: 'POST',
                headers: ownerHeaders,
                body: JSON.stringify({ name: 'Append door', truthVersion: null, editionDefault: 'MgT2E' }),
            });
            assert.equal(created.status, 201, JSON.stringify(created.body));
            const id = created.body.data.id;
            const changes = `${base}/api/universes/${id}/campaign/changes`;
            const seeded = await jsonFetch(changes, {
                method: 'PATCH',
                headers: ownerHeaders,
                body: JSON.stringify({
                    records: [
                        record(ADA, { type: 'person', name: 'Ada' }),
                        record(BEN, { type: 'person', name: 'Ben' }),
                        record(SHIP, { status: crew() }),
                    ],
                    settings: settings([SHIP]),
                }),
            });
            assert.equal(seeded.status, 200, JSON.stringify(seeded.body));
            const invite = await jsonFetch(`${base}/api/universes/${id}/players/invite`, { method: 'POST', headers: ownerHeaders });
            assert.equal(invite.status, 200, JSON.stringify(invite.body));
            const token = invite.body.data.url.split('/join/')[1];
            for (const headers of [adaHeaders, benHeaders]) {
                const joined = await jsonFetch(`${base}/api/join`, { method: 'POST', headers, body: JSON.stringify({ token }) });
                assert.equal(joined.status, 200, JSON.stringify(joined.body));
            }
            const setAda = await jsonFetch(`${base}/api/universes/${id}/players/apada${stamp}`, {
                method: 'PATCH', headers: ownerHeaders, body: JSON.stringify({ personId: ADA }),
            });
            const setBen = await jsonFetch(`${base}/api/universes/${id}/players/apben${stamp}`, {
                method: 'PATCH', headers: ownerHeaders, body: JSON.stringify({ personId: BEN }),
            });
            assert.equal(setAda.status, 200, JSON.stringify(setAda.body));
            assert.equal(setBen.status, 200, JSON.stringify(setBen.body));
            const [first, second] = await Promise.all([
                jsonFetch(changes, { method: 'PATCH', headers: adaHeaders, body: JSON.stringify({ appends: [{ id: SHIP, append: { ledger: [line('Ada')] } }] }) }),
                jsonFetch(changes, { method: 'PATCH', headers: benHeaders, body: JSON.stringify({ appends: [{ id: SHIP, append: { cargo: { add: [lot('Ore')] } } }] }) }),
            ]);
            assert.equal(first.status, 200, JSON.stringify(first.body));
            assert.equal(second.status, 200, JSON.stringify(second.body));
            const outsider = await jsonFetch(changes, {
                method: 'PATCH',
                headers: { 'content-type': 'application/json', cookie: stranger, origin: base },
                body: JSON.stringify({ appends: [{ id: SHIP, append: { ledger: [line('Out')] } }] }),
            });
            assert.equal(outsider.status, 404);
            const read = await jsonFetch(`${base}/api/universes/${id}/campaign`, { headers: { cookie: owner } });
            const ship = read.body.data.records.find((row) => row.id === SHIP);
            assert.equal(ship.status.ledger.length, 1);
            assert.equal(ship.status.ledger[0].by, ADA);
            assert.equal(ship.status.cargo[0].label, 'Ore');
        } finally {
            if (child) stopDev(child.pid);
            if (ownedPersist) rmSync(persistTo, { recursive: true, force: true });
        }
    });
}
