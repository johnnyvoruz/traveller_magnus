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
import { passengerSeen, paymentSeen } from '@voyage/shared';
import { applyCampaignChanges, installCampaignSchema, readCampaign } from '../../apps/api/src/universe/campaign.ts';
import { officialFare } from '../../apps/api/src/universe/trade_door.ts';
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
    const opened = applyCampaignChanges(sql, { appends: [{ id: CLOSED, append: { ledger: [line('Closed')] } }] }, NOW, false, ada);
    assert.equal(opened.conflicts.length, 0);
    const openShip = shipOf(sql, CLOSED);
    assert.equal(openShip.status.ledger.length, 1);
    assert.equal(openShip.status.ledger[0].memo, 'Closed');
    assert.equal(openShip.status.ledger[0].by, ADA);
    const gap = { ...openShip.status, roles: [{ name: 'Pilot', ledger: false, trade: true, locker: true }] };
    applyCampaignChanges(sql, { records: [{ ...openShip, status: gap, baseRev: openShip.rev }] }, NOW);
    applyCampaignChanges(sql, { appends: [{ id: CLOSED, append: { ledger: [line('Still')] } }] }, NOW, false, ada);
    const gapped = shipOf(sql, CLOSED);
    assert.equal(gapped.status.ledger.length, 2);
    const shut = {
        ...gapped.status,
        roles: [{ name: 'Captain', ledger: false, trade: true, locker: true }],
    };
    applyCampaignChanges(sql, { records: [{ ...gapped, status: shut, baseRev: gapped.rev }] }, NOW);
    const denied = refusal(() => applyCampaignChanges(sql, { appends: [{ id: CLOSED, append: { ledger: [line('Shut')] } }] }, NOW, false, ada));
    assert.equal(denied.code, 'forbidden');
    assert.equal(denied.message, 'You cannot change that.');
    assert.equal(shipOf(sql, CLOSED).status.ledger.length, 2);
    const outsider = 'cr_00000000-0000-4000-8000-0000000000a7';
    const offCrew = refusal(() => applyCampaignChanges(sql, { appends: [{ id: SHIP, append: { ledger: [line('Out')] } }] }, NOW, false, { userId: 'out', personId: outsider }));
    assert.equal(offCrew.code, 'forbidden');
    assert.equal(shipOf(sql).status.cargo.length, 2);
});

test('the piece names which of the member\'s characters acts', () => {
    const sql = open();
    applyCampaignChanges(sql, {
        records: [
            record(ADA, { type: 'person', name: 'Ada' }),
            record(BEN, { type: 'person', name: 'Ben' }),
            record(SHIP, { status: crew() }),
        ],
        settings: settings([SHIP]),
    }, NOW);
    const one = applyCampaignChanges(sql, { appends: [{ id: SHIP, append: { ledger: [line('Ada')] } }] }, NOW, false, { userId: 'ada', personId: ADA });
    assert.equal(one.conflicts.length, 0);
    assert.equal(shipOf(sql).status.ledger[0].by, ADA);
    const both = { userId: 'ada', personId: ADA, personIds: [ADA, BEN] };
    const unnamed = refusal(() => applyCampaignChanges(sql, { appends: [{ id: SHIP, append: { ledger: [line('Which')] } }] }, NOW, false, both));
    assert.equal(unnamed.code, 'validation');
    assert.equal(unnamed.message, 'That request could not be read. Try again.');
    const named = applyCampaignChanges(sql, { appends: [{ id: SHIP, personId: BEN, append: { ledger: [line('Ben')] } }] }, NOW, false, both);
    assert.equal(named.conflicts.length, 0);
    assert.equal(shipOf(sql).status.ledger[1].by, BEN);
    const crossed = refusal(() => applyCampaignChanges(sql, { appends: [{ id: SHIP, personId: ADA, append: { ledger: [{ ...line('Cross'), by: BEN }] } }] }, NOW, false, both));
    assert.equal(crossed.code, 'forbidden');
    assert.equal(crossed.message, 'You cannot change that.');
    const outsider = 'cr_00000000-0000-4000-8000-0000000000b9';
    const other = refusal(() => applyCampaignChanges(sql, { appends: [{ id: SHIP, personId: outsider, append: { ledger: [line('No')] } }] }, NOW, false, both));
    assert.equal(other.code, 'forbidden');
    assert.equal(shipOf(sql).status.ledger.length, 2);
});

/** High over 2 parsecs is 14000 Cr (rules/mgt2e_trade.json fares, assets/trade.txt:162). */
function highFare() {
    const fare = officialFare('High', 2);
    if (!fare || fare.credits !== 14000 || fare.name !== 'High') throw new Error('the official high fare for 2 parsecs changed');
    return fare;
}

function tradeShip(passengers, extra = {}) {
    return {
        ledger: [],
        passengers,
        crew: [{ personId: ADA, role: 'Captain' }],
        roles: [{ name: 'Captain', ledger: true, trade: true, locker: true }],
        ...extra,
    };
}

function boardedPiece(lot, index, over = {}) {
    const fare = highFare();
    return {
        index,
        class: 'High',
        fareCr: fare.credits,
        parsecs: 2,
        seen: passengerSeen(lot),
        ...over,
    };
}

test('Board posts the file fare on the stored row, and a stale index is refused', () => {
    const adaLot = { personId: ADA, label: 'a berth', class: 'High' };
    const other = { label: 'Other', class: 'Low' };
    const sql = open();
    applyCampaignChanges(sql, {
        records: [
            record(ADA, { type: 'person', name: 'Ada' }),
            record(SHIP, { status: tradeShip([adaLot, other]) }),
        ],
        settings: settings([SHIP]),
    }, NOW);
    const ada = { userId: 'ada', personId: ADA };
    const posted = applyCampaignChanges(sql, {
        appends: [{ id: SHIP, append: { passengers: { board: [boardedPiece(adaLot, 0)] } } }],
    }, NOW, false, ada);
    assert.equal(posted.conflicts.length, 0);
    const ship = shipOf(sql);
    assert.equal(ship.status.passengers[0].class, 'High');
    assert.equal(ship.status.passengers[0].fareCr, 14000);
    assert.equal(ship.status.passengers[0].label, 'a berth');
    assert.deepEqual(ship.status.passengers[1], other);
    assert.equal(ship.status.ledger.length, 1);
    assert.equal(ship.status.ledger[0].kind, 'income');
    assert.equal(ship.status.ledger[0].amount, 14000);
    assert.equal(ship.status.ledger[0].memo, 'Fare: Ada, High passage, 2 parsecs');
    assert.equal(ship.status.ledger[0].by, ADA);
    assert.deepEqual(ship.status.ledger[0].when, { year: 1105, day: 2 });
    const low = officialFare('Low', 1);
    if (!low || low.credits !== 700 || low.name !== 'Low') throw new Error('the official low fare for 1 parsec changed');
    const one = applyCampaignChanges(sql, {
        appends: [{ id: SHIP, append: { passengers: { board: [{ index: 1, class: 'Low', fareCr: low.credits, parsecs: 1, seen: passengerSeen(other) }] } } }],
    }, NOW, false, ada);
    assert.equal(one.conflicts.length, 0);
    assert.equal(shipOf(sql).status.passengers[1].fareCr, 700);
    assert.equal(shipOf(sql).status.ledger[1].memo, 'Fare: Other, Low passage, 1 parsec');
    const again = refusal(() => applyCampaignChanges(sql, {
        appends: [{ id: SHIP, append: { passengers: { board: [boardedPiece(ship.status.passengers[0], 0)] } } }],
    }, NOW, false, ada));
    assert.equal(again.code, 'validation');
    assert.equal(again.message, 'That request could not be read. Try again.');
    assert.equal(shipOf(sql).status.ledger.length, 2);
    const fresh = open();
    applyCampaignChanges(fresh, {
        records: [
            record(ADA, { type: 'person', name: 'Ada' }),
            record(SHIP, { status: tradeShip([adaLot, other]) }),
        ],
        settings: settings([SHIP]),
    }, NOW);
    const stale = refusal(() => applyCampaignChanges(fresh, {
        appends: [{ id: SHIP, append: { passengers: { board: [boardedPiece(other, 0)] } } }],
    }, NOW, false, ada));
    assert.equal(stale.code, 'validation');
    const past = refusal(() => applyCampaignChanges(fresh, {
        appends: [{ id: SHIP, append: { passengers: { board: [boardedPiece(adaLot, 4)] } } }],
    }, NOW, false, ada));
    assert.equal(past.code, 'validation');
    const wrong = refusal(() => applyCampaignChanges(fresh, {
        appends: [{ id: SHIP, append: { passengers: { board: [boardedPiece(adaLot, 0, { fareCr: 1 })] } } }],
    }, NOW, false, ada));
    assert.equal(wrong.code, 'validation');
    assert.equal(shipOf(fresh).status.ledger.length, 0);
    assert.equal(shipOf(fresh).status.passengers[0].fareCr, undefined);
    const noTrade = { ...tradeShip([adaLot, other]), roles: [{ name: 'Captain', ledger: true, trade: false, locker: true }] };
    const noLedger = { ...tradeShip([adaLot, other]), roles: [{ name: 'Captain', ledger: false, trade: true, locker: true }] };
    for (const status of [noTrade, noLedger]) {
        const held = open();
        applyCampaignChanges(held, {
            records: [
                record(ADA, { type: 'person', name: 'Ada' }),
                record(SHIP, { status }),
            ],
            settings: settings([SHIP]),
        }, NOW);
        const denied = refusal(() => applyCampaignChanges(held, {
            appends: [{ id: SHIP, append: { passengers: { board: [boardedPiece(adaLot, 0)] } } }],
        }, NOW, false, ada));
        assert.equal(denied.code, 'forbidden');
        assert.equal(denied.message, 'You cannot change that.');
        assert.equal(shipOf(held).status.ledger.length, 0);
        assert.equal(shipOf(held).status.passengers[0].fareCr, undefined);
    }
});

test('Pay now posts the stored payment and moves its due day', () => {
    const payment = { amountCr: 5000, everyDays: 30, nextDueDay: { year: 1105, day: 10 }, payee: 'Bank' };
    const sql = open();
    applyCampaignChanges(sql, {
        records: [
            record(ADA, { type: 'person', name: 'Ada' }),
            record(SHIP, { status: tradeShip([], { payment }) }),
        ],
        settings: settings([SHIP]),
    }, NOW);
    const ada = { userId: 'ada', personId: ADA };
    const paid = applyCampaignChanges(sql, {
        appends: [{ id: SHIP, append: { payNow: true, paymentSeen: paymentSeen(payment) } }],
    }, NOW, false, ada);
    assert.equal(paid.conflicts.length, 0);
    const ship = shipOf(sql);
    assert.equal(ship.status.ledger.length, 1);
    assert.equal(ship.status.ledger[0].kind, 'expense');
    assert.equal(ship.status.ledger[0].amount, -5000);
    assert.equal(ship.status.ledger[0].memo, 'Ship payment to Bank');
    assert.equal(ship.status.ledger[0].by, ADA);
    assert.deepEqual(ship.status.ledger[0].when, { year: 1105, day: 2 });
    assert.deepEqual(ship.status.payment.nextDueDay, { year: 1105, day: 40 });
    assert.equal(ship.status.payment.amountCr, 5000);
    assert.equal(ship.status.payment.payee, 'Bank');
    const stalePay = { ...payment, amountCr: 1 };
    const fresh = open();
    applyCampaignChanges(fresh, {
        records: [
            record(ADA, { type: 'person', name: 'Ada' }),
            record(SHIP, { status: tradeShip([], { payment }) }),
        ],
        settings: settings([SHIP]),
    }, NOW);
    const stale = refusal(() => applyCampaignChanges(fresh, {
        appends: [{ id: SHIP, append: { payNow: true, paymentSeen: paymentSeen(stalePay) } }],
    }, NOW, false, ada));
    assert.equal(stale.code, 'validation');
    assert.equal(stale.message, 'That request could not be read. Try again.');
    assert.deepEqual(shipOf(fresh).status.payment, payment);
    assert.equal(shipOf(fresh).status.ledger.length, 0);
    const unpaid = open();
    applyCampaignChanges(unpaid, {
        records: [
            record(ADA, { type: 'person', name: 'Ada' }),
            record(SHIP, { status: tradeShip([]) }),
        ],
        settings: settings([SHIP]),
    }, NOW);
    const missing = refusal(() => applyCampaignChanges(unpaid, {
        appends: [{ id: SHIP, append: { payNow: true, paymentSeen: paymentSeen(payment) } }],
    }, NOW, false, ada));
    assert.equal(missing.code, 'validation');
    const bare = refusal(() => applyCampaignChanges(fresh, {
        appends: [{ id: SHIP, append: { payNow: true } }],
    }, NOW, false, ada));
    assert.equal(bare.code, 'validation');
    for (const roles of [
        [{ name: 'Captain', ledger: true, trade: false, locker: true }],
        [{ name: 'Captain', ledger: false, trade: true, locker: true }],
    ]) {
        const held = open();
        applyCampaignChanges(held, {
            records: [
                record(ADA, { type: 'person', name: 'Ada' }),
                record(SHIP, { status: tradeShip([], { payment, roles }) }),
            ],
            settings: settings([SHIP]),
        }, NOW);
        const denied = refusal(() => applyCampaignChanges(held, {
            appends: [{ id: SHIP, append: { payNow: true, paymentSeen: paymentSeen(payment) } }],
        }, NOW, false, ada));
        assert.equal(denied.code, 'forbidden');
        assert.equal(denied.message, 'You cannot change that.');
        assert.deepEqual(shipOf(held).status.payment.nextDueDay, payment.nextDueDay);
        assert.equal(shipOf(held).status.ledger.length, 0);
    }
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
            const both = await jsonFetch(`${base}/api/universes/${id}/players/apada${stamp}`, {
                method: 'PATCH',
                headers: ownerHeaders,
                body: JSON.stringify({ personIds: [ADA, BEN] }),
            });
            assert.equal(both.status, 200, JSON.stringify(both.body));
            assert.deepEqual(both.body.data.personIds, [ADA, BEN]);
            const unnamed = await jsonFetch(changes, {
                method: 'PATCH',
                headers: adaHeaders,
                body: JSON.stringify({ appends: [{ id: SHIP, append: { ledger: [line('Which')] } }] }),
            });
            assert.equal(unnamed.status, 400, JSON.stringify(unnamed.body));
            assert.equal(unnamed.body.error.message, 'That request could not be read. Try again.');
            const named = await jsonFetch(changes, {
                method: 'PATCH',
                headers: adaHeaders,
                body: JSON.stringify({ appends: [{ id: SHIP, personId: BEN, append: { ledger: [line('Ben')] } }] }),
            });
            assert.equal(named.status, 200, JSON.stringify(named.body));
            const crossed = await jsonFetch(changes, {
                method: 'PATCH',
                headers: adaHeaders,
                body: JSON.stringify({ appends: [{ id: SHIP, personId: ADA, append: { ledger: [{ ...line('Cross'), by: BEN }] } }] }),
            });
            assert.equal(crossed.status, 403, JSON.stringify(crossed.body));
            assert.equal(crossed.body.error.message, 'You cannot change that.');
            const outsiderId = 'cr_00000000-0000-4000-8000-0000000000b9';
            const other = await jsonFetch(changes, {
                method: 'PATCH',
                headers: adaHeaders,
                body: JSON.stringify({ appends: [{ id: SHIP, personId: outsiderId, append: { ledger: [line('No')] } }] }),
            });
            assert.equal(other.status, 403, JSON.stringify(other.body));
            const after = await jsonFetch(`${base}/api/universes/${id}/campaign`, { headers: { cookie: owner } });
            const landed = after.body.data.records.find((row) => row.id === SHIP);
            assert.equal(landed.status.ledger.length, 2);
            assert.equal(landed.status.ledger[1].by, BEN);
        } finally {
            if (child) stopDev(child.pid);
            if (ownedPersist) rmSync(persistTo, { recursive: true, force: true });
        }
    });
}
