import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { CharacterPatch } from '@voyage/shared';
import { acceptLedger, installLedger, postLedger, readLedger, setCreditsMode, voidLedger } from '../../apps/api/src/character/ledger.ts';
import { installSheet, SheetRoom } from '../../apps/api/src/character/sheet.ts';
import { characterService } from '../../apps/api/src/character/service.ts';
import { characterAttached } from '../../apps/api/src/universe/campaign.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const NOW = '2026-10-18T22:01:00.000Z';
const AMOUNT_MAX = 1_000_000_000;
const DAY_MAX = 400_000;

function memorySql() {
    const db = new DatabaseSync(':memory:');
    return {
        db,
        sql: {
            exec(query, ...params) {
                const statement = query.trim();
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
        },
    };
}

function sheetSql(withLedger) {
    const { sql } = memorySql();
    installSheet(sql);
    if (withLedger) installLedger(sql);
    return sql;
}

function mint(prefix) {
    let n = 0;
    return () => `${prefix}_${++n}`;
}

test('a register with no ledger table answers 503, then the same calls work after install', () => {
    const sql = sheetSql(false);
    const absent = readLedger(sql, 0);
    assert.equal(absent.ok, false);
    assert.equal(absent.status, 503);
    assert.equal(absent.code, 'ledger_unavailable');
    assert.equal(absent.message, 'The credit register is not available yet.');
    const refused = postLedger(sql, { kind: 'pay', amount: 1, memo: 'passage' }, 'owner', NOW, 0, mint('ln'));
    assert.equal(refused.status, 503);
    assert.equal(voidLedger(sql, 'ln_1', 'owner', NOW, mint('ln')).status, 503);
    assert.equal(acceptLedger(sql, 'ln_1', 'editor').status, 503);
    installLedger(sql);
    const ready = readLedger(sql, 0);
    assert.equal(ready.ok, true);
    assert.deepEqual(ready.lines, []);
    assert.equal(ready.balance, 0);
    assert.equal(ready.credits, 'simple');
});

test('lines keep seq order, the balance ignores a pending line, and a stored credits mode wins', () => {
    const sql = sheetSql(true);
    const ids = mint('ln');
    const pay = postLedger(sql, { kind: 'pay', amount: 100, memo: 'berth', whenDay: 3 }, 'owner', NOW, 0, ids);
    const pending = postLedger(sql, { kind: 'fare', amount: 40, memo: 'high passage', linkId: 'ship-1' }, 'referee', NOW, 1, ids);
    assert.equal(pay.ok, true);
    assert.equal(pending.ok, true);
    assert.equal(pay.line.seq, 1);
    assert.equal(pending.line.seq, 2);
    assert.equal(pending.line.pending, 1);
    assert.equal(pending.line.linkId, null);
    assert.equal(pay.balance, 100);
    assert.equal(pending.balance, 100);
    assert.equal(pending.credits, 'detailed');
    const page = readLedger(sql, 1);
    assert.equal(page.lines.length, 1);
    assert.equal(page.lines[0].id, pending.line.id);
    assert.equal(page.balance, 100);
    sql.exec(`INSERT INTO meta (key, value) VALUES ('credits', 'simple')`);
    const stored = readLedger(sql, 0);
    assert.equal(stored.credits, 'simple');
    assert.equal(stored.lines.length, 2);
});

test('each kind posts, a transfer keeps its link, and the guards refuse the rest', () => {
    const sql = sheetSql(true);
    const ids = mint('ln');
    const kinds = ['pay', 'purchase', 'fare', 'share', 'transfer', 'adjustment'];
    for (const kind of kinds) {
        const posted = postLedger(sql, {
            kind,
            amount: kind === 'purchase' ? -15 : 15,
            memo: kind,
            linkId: 'ship-9',
        }, 'owner', NOW, 0, ids);
        assert.equal(posted.ok, true, kind);
        assert.equal(posted.line.linkId, kind === 'transfer' ? 'ship-9' : null);
    }
    const edges = [
        { kind: 'tip', amount: 1, memo: 'no' },
        { kind: 'pay', amount: 0, memo: 'no' },
        { kind: 'pay', amount: 1.5, memo: 'no' },
        { kind: 'pay', amount: AMOUNT_MAX + 1, memo: 'no' },
        { kind: 'pay', amount: -AMOUNT_MAX - 1, memo: 'no' },
        { kind: 'pay', amount: '10', memo: 'no' },
        { kind: 'pay', amount: 10, memo: '' },
        { kind: 'pay', amount: 10, memo: '   ' },
        { kind: 'pay', amount: 10, memo: 'x'.repeat(81) },
        { kind: 'pay', amount: 10, memo: 'ok', whenDay: -1 },
        { kind: 'pay', amount: 10, memo: 'ok', whenDay: DAY_MAX + 1 },
        { kind: 'pay', amount: 10, memo: 'ok', whenDay: 1.2 },
        { kind: 'transfer', amount: 10, memo: 'ok', linkId: 4 },
    ];
    for (const body of edges) {
        const refused = postLedger(sql, body, 'owner', NOW, 0, ids);
        assert.equal(refused.ok, false);
        assert.equal(refused.status, 400);
        assert.equal(refused.code, 'validation');
        assert.equal(refused.message, 'Invalid request.');
    }
    const memo = 'm'.repeat(80);
    const high = postLedger(sql, { kind: 'adjustment', amount: AMOUNT_MAX, memo, whenDay: 0 }, 'owner', NOW, 0, ids);
    const low = postLedger(sql, { kind: 'adjustment', amount: -AMOUNT_MAX, memo: 'low', whenDay: DAY_MAX }, 'owner', NOW, 0, ids);
    const blankLink = postLedger(sql, { kind: 'transfer', amount: 1, memo: 'move', linkId: '' }, 'owner', NOW, 0, ids);
    assert.equal(high.ok, true);
    assert.equal(high.line.memo, memo);
    assert.equal(high.line.whenDay, 0);
    assert.equal(low.line.whenDay, DAY_MAX);
    assert.equal(blankLink.line.linkId, null);
    const open = readLedger(sql, 0);
    assert.equal(open.credits, 'detailed');
});

test('void writes the reversing line once, and accept clears pending', () => {
    const sql = sheetSql(true);
    const ids = mint('ln');
    const posted = postLedger(sql, { kind: 'share', amount: 80, memo: 'cut', whenDay: 12, linkId: 'nope' }, 'owner', NOW, 0, ids);
    const pending = postLedger(sql, { kind: 'transfer', amount: 25, memo: 'to the ship', linkId: 'ship-2' }, 'referee', NOW, 1, ids);
    const still = voidLedger(sql, pending.line.id, 'owner', NOW, ids);
    assert.equal(still.status, 400);
    assert.equal(still.message, 'That line is still pending.');
    const waiting = acceptLedger(sql, pending.line.id, 'referee');
    assert.equal(waiting.status, 400);
    assert.equal(waiting.message, 'That line is waiting for the player.');
    assert.equal(readLedger(sql, 0).balance, 80);
    const accepted = acceptLedger(sql, pending.line.id, 'owner');
    assert.equal(accepted.status === undefined ? accepted.ok : accepted.ok, true);
    assert.equal(accepted.line.pending, 0);
    assert.equal(accepted.balance, 105);
    const again = acceptLedger(sql, pending.line.id, 'editor');
    assert.equal(again.message, 'That line is already in the register.');
    const missing = voidLedger(sql, 'ln_missing', 'owner', NOW, ids);
    assert.equal(missing.status, 404);
    assert.equal(missing.message, 'No such line.');
    assert.equal(acceptLedger(sql, 'ln_missing', 'owner').message, 'No such line.');
    const reversed = voidLedger(sql, posted.line.id, 'editor', NOW, ids);
    assert.equal(reversed.ok, true);
    assert.equal(reversed.line.amount, -80);
    assert.equal(reversed.line.kind, 'share');
    assert.equal(reversed.line.memo, 'cut');
    assert.equal(reversed.line.voidOf, posted.line.id);
    assert.equal(reversed.line.linkId, null);
    assert.equal(reversed.line.whenDay, null);
    assert.equal(reversed.line.pending, 0);
    assert.equal(reversed.line.byUser, 'editor');
    assert.equal(reversed.balance, 25);
    const second = voidLedger(sql, posted.line.id, 'owner', NOW, ids);
    assert.equal(second.status, 400);
    assert.equal(second.message, 'That line is already voided.');
    assert.equal(readLedger(sql, 0).balance, 25);
    const named = readLedger(sql, 0).lines.find((line) => line.id === posted.line.id);
    assert.equal(named.amount, 80);
});

test('a stored line is announced on the character room', () => {
    const sql = sheetSql(true);
    const sockets = [];
    const heard = { messages: [], send(text) { this.messages.push(JSON.parse(text)); } };
    sockets.push(heard);
    const posted = postLedger(sql, { kind: 'pay', amount: 5, memo: 'cash' }, 'owner', NOW, 0, mint('ln'));
    new SheetRoom(sql, sockets).broadcastLedger(posted.line, posted.balance);
    assert.deepEqual(heard.messages[0], { t: 'ledger', line: posted.line, balance: posted.balance });
});

function boot() {
    const db = new DatabaseSync(':memory:');
    db.exec(fs.readFileSync(path.join(root, 'apps/api/src/db/migrations/0009_characters.sql'), 'utf8'));
    db.exec(`CREATE TABLE user (id TEXT PRIMARY KEY, name TEXT, email TEXT);
             CREATE TABLE profile (user_id TEXT PRIMARY KEY, display_name TEXT);`);
    db.exec('PRAGMA foreign_keys = ON');
    const catalogue = {
        async all(query, ...params) { return db.prepare(query).all(...params); },
        async get(query, ...params) { return db.prepare(query).get(...params) ?? null; },
        async run(query, ...params) { return db.prepare(query).run(...params).changes; },
        async batch(statements) {
            db.exec('BEGIN');
            try {
                for (const statement of statements) db.prepare(statement.query).run(...statement.params);
                db.exec('COMMIT');
            } catch (err) {
                db.exec('ROLLBACK');
                throw err;
            }
        },
    };
    const sessions = new Map();
    let lineCount = 0;
    function session(id) {
        if (!sessions.has(id)) {
            sessions.set(id, { sql: sheetSql(false), sockets: [] });
        }
        return sessions.get(id);
    }
    function fail(result) {
        return { ok: false, status: result.status, code: result.code, message: result.message };
    }
    const rooms = {
        session,
        async ensure(id) { session(id); },
        async read() { return { fields: {}, revs: {} }; },
        async apply() { throw new Error('unused'); },
        async replace() {},
        async meta() {},
        async closeUser() {},
        async closeAll() {},
        async retell() {},
        async ledgerRead(id, after) {
            const result = readLedger(session(id).sql, after);
            if (!result.ok) return fail(result);
            return { ok: true, status: 200, data: { lines: result.lines, balance: result.balance, credits: result.credits } };
        },
        async ledgerPost(id, body, by, pending) {
            const held = session(id);
            const result = postLedger(held.sql, body, by, NOW, pending, () => `ln_${++lineCount}`);
            if (!result.ok) return fail(result);
            new SheetRoom(held.sql, held.sockets).broadcastLedger(result.line, result.balance);
            return { ok: true, status: 201, data: result.line };
        },
        async ledgerVoid(id, lineId, by) {
            const held = session(id);
            const result = voidLedger(held.sql, lineId, by, NOW, () => `ln_${++lineCount}`);
            if (!result.ok) return fail(result);
            new SheetRoom(held.sql, held.sockets).broadcastLedger(result.line, result.balance);
            return { ok: true, status: 201, data: result.line };
        },
        async ledgerAccept(id, lineId, by) {
            const held = session(id);
            const result = acceptLedger(held.sql, lineId, by);
            if (!result.ok) return fail(result);
            new SheetRoom(held.sql, held.sockets).broadcastLedger(result.line, result.balance);
            return { ok: true, status: 200, data: result.line };
        },
        async ledgerMode(id, credits) {
            const result = setCreditsMode(session(id).sql, credits);
            if (!result.ok) return fail(result);
            return { ok: true, status: 200, data: { credits: result.credits } };
        },
    };
    return {
        db,
        rooms,
        api: characterService(catalogue, rooms, () => new Date(NOW)),
        addUser(id, name) {
            db.prepare(`INSERT INTO user (id, name, email) VALUES (?, ?, ?)`).run(id, name, `${id}@localhost`);
        },
        arm(id) { installLedger(session(id).sql); },
        hear(id) {
            const heard = { messages: [], send(text) { this.messages.push(JSON.parse(text)); } };
            session(id).sockets.push(heard);
            return heard;
        },
    };
}

test('the four routes: access, the campaign owner, a void, a second void, accept, the room, a stranger, and 503', async () => {
    const { db, api, addUser, arm, hear } = boot();
    addUser('owner', 'Ada');
    addUser('editor', 'Bea');
    addUser('referee', 'Cam');
    addUser('stranger', 'Dee');
    const owner = { id: 'owner' };
    const editor = { id: 'editor' };
    const referee = { id: 'referee' };
    const stranger = { id: 'stranger' };

    const created = await api.create(owner, { name: 'Voss' });
    assert.equal(created.status, 201);
    const id = created.data.character.id;
    db.prepare(
        `INSERT INTO character_access (character_id, user_id, role, granted_by, created_at) VALUES (?, 'editor', 'editor', 'owner', ?)`,
    ).run(id, NOW);

    for (const call of [
        api.ledgerRead(stranger, id, 0),
        api.ledgerPost(stranger, id, { kind: 'pay', amount: 1, memo: 'no' }, false),
        api.ledgerVoid(stranger, id, 'ln_missing'),
        api.ledgerAccept(stranger, id, 'ln_missing', false),
        api.ledgerRead(referee, id, 0),
        api.ledgerVoid(referee, id, 'ln_missing'),
    ]) {
        const result = await call;
        assert.equal(result.status, 404, result.message);
        assert.equal(result.code, 'not_found');
        assert.equal(result.message, 'No such character.');
    }

    const closed = await api.ledgerPost(owner, id, { kind: 'pay', amount: 10, memo: 'before the table' }, false);
    assert.equal(closed.status, 503);
    assert.equal(closed.code, 'ledger_unavailable');
    assert.equal((await api.ledgerRead(editor, id, 0)).status, 503);
    assert.equal((await api.ledgerVoid(owner, id, 'ln_1')).status, 503);
    assert.equal((await api.ledgerAccept(editor, id, 'ln_1', false)).status, 503);
    arm(id);

    const heard = hear(id);
    const paid = await api.ledgerPost(owner, id, { kind: 'pay', amount: 100, memo: 'berth', whenDay: 4 }, true);
    assert.equal(paid.status, 201);
    assert.equal(paid.data.pending, 0);
    assert.equal(paid.data.byUser, 'owner');
    assert.equal(paid.data.seq, 1);
    assert.deepEqual(heard.messages.at(-1), { t: 'ledger', line: paid.data, balance: 100 });

    const bought = await api.ledgerPost(editor, id, { kind: 'purchase', amount: -30, memo: 'rations' }, false);
    assert.equal(bought.status, 201);
    assert.equal(bought.data.pending, 0);
    const page = await api.ledgerRead(editor, id, 1);
    assert.equal(page.status, 200);
    assert.equal(page.data.lines.length, 1);
    assert.equal(page.data.lines[0].id, bought.data.id);
    assert.equal(page.data.balance, 70);
    assert.equal(page.data.credits, 'detailed');

    const fare = await api.ledgerPost(referee, id, { kind: 'fare', amount: 50, memo: 'middle' }, true);
    assert.equal(fare.status, 201);
    assert.equal(fare.data.pending, 1);
    assert.equal(fare.data.byUser, 'referee');
    const held = await api.ledgerRead(owner, id, 0);
    assert.equal(held.data.balance, 70);
    assert.equal(held.data.lines.length, 3);

    const ownAccept = await api.ledgerAccept(referee, id, fare.data.id, true);
    assert.equal(ownAccept.status, 400);
    assert.equal(ownAccept.message, 'That line is waiting for the player.');
    const other = await api.ledgerAccept(referee, id, paid.data.id, true);
    assert.equal(other.status, 404);
    assert.equal(other.message, 'No such character.');
    assert.equal((await api.ledgerRead(owner, id, 0)).data.balance, 70);

    const pendingVoid = await api.ledgerVoid(editor, id, fare.data.id);
    assert.equal(pendingVoid.status, 400);
    assert.equal(pendingVoid.message, 'That line is still pending.');

    const beforeAccept = heard.messages.length;
    const accepted = await api.ledgerAccept(editor, id, fare.data.id, false);
    assert.equal(accepted.status, 200);
    assert.equal(accepted.data.pending, 0);
    assert.equal(accepted.data.id, fare.data.id);
    assert.equal(heard.messages.length, beforeAccept + 1);
    assert.equal(heard.messages.at(-1).t, 'ledger');
    assert.equal(heard.messages.at(-1).balance, 120);

    const reversed = await api.ledgerVoid(owner, id, paid.data.id);
    assert.equal(reversed.status, 201);
    assert.equal(reversed.data.amount, -100);
    assert.equal(reversed.data.voidOf, paid.data.id);
    assert.equal(reversed.data.whenDay, null);
    assert.equal(heard.messages.at(-1).t, 'ledger');
    assert.equal(heard.messages.at(-1).balance, 20);
    const second = await api.ledgerVoid(editor, id, paid.data.id);
    assert.equal(second.status, 400);
    assert.equal(second.message, 'That line is already voided.');
    assert.equal((await api.ledgerRead(owner, id, 0)).data.balance, 20);
    const stillThere = (await api.ledgerRead(owner, id, 0)).data.lines.find((line) => line.id === paid.data.id);
    assert.equal(stillThere.amount, 100);

    const bad = await api.ledgerPost(owner, id, { kind: 'pay', amount: 0, memo: 'zero' }, false);
    assert.equal(bad.status, 400);
    assert.equal(bad.message, 'Invalid request.');
    const absent = await api.ledgerVoid(owner, id, 'ln_missing');
    assert.equal(absent.status, 404);
    assert.equal(absent.message, 'No such line.');
    assert.equal((await api.ledgerAccept(editor, id, 'ln_missing', false)).message, 'No such line.');
    assert.equal((await api.ledgerAccept(editor, id, bought.data.id, false)).message, 'That line is already in the register.');
});

test('a campaign sheet names a character by the stored id, and a missing table does not', () => {
    const { sql } = memorySql();
    assert.equal(characterAttached(sql, 'ch_1'), false);
    sql.exec(`CREATE TABLE campaign_records (id TEXT, deleted INTEGER, sheet TEXT)`);
    sql.exec(
        `INSERT INTO campaign_records (id, deleted, sheet) VALUES ('r1', 0, ?), ('r2', 1, ?), ('r3', 0, ?)`,
        JSON.stringify({ schema: 'mgt2e_character@1', characterId: 'ch_1' }),
        JSON.stringify({ schema: 'mgt2e_character@1', characterId: 'ch_2' }),
        JSON.stringify({ name: 'ch_1' }),
    );
    assert.equal(characterAttached(sql, 'ch_1'), true);
    assert.equal(characterAttached(sql, 'ch_2'), false);
    assert.equal(characterAttached(sql, 'ch_3'), false);
});

test('the mode write stores the switch and does not create the register or drop a line', () => {
    const sql = sheetSql(false);
    const stored = setCreditsMode(sql, 'detailed');
    assert.equal(stored.ok, true);
    assert.equal(stored.credits, 'detailed');
    assert.equal(readLedger(sql, 0).status, 503);
    assert.equal(sql.exec(`SELECT value FROM meta WHERE key = 'credits'`)[0].value, 'detailed');
    assert.equal(sql.exec(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'ledger'`).length, 0);
    assert.equal(setCreditsMode(sql, 'cash').status, 400);
    assert.equal(setCreditsMode(sql, 'cash').message, 'Invalid request.');
    assert.equal(sql.exec(`SELECT value FROM meta WHERE key = 'credits'`)[0].value, 'detailed');
    installLedger(sql);
    const ids = mint('ln');
    const posted = postLedger(sql, { kind: 'pay', amount: 40, memo: 'berth' }, 'owner', NOW, 0, ids);
    assert.equal(posted.ok, true);
    const flipped = setCreditsMode(sql, 'simple');
    assert.equal(flipped.credits, 'simple');
    const page = readLedger(sql, 0);
    assert.equal(page.credits, 'simple');
    assert.equal(page.lines.length, 1);
    assert.equal(page.lines[0].id, posted.line.id);
    assert.equal(page.lines[0].amount, 40);
    assert.equal(page.balance, 40);
    assert.equal(CharacterPatch.safeParse({ name: 'Ada', credits: 'detailed' }).success, false);
});

test('an editor stores the switch; a campaign owner who is not an editor is 404 and is not asked', async () => {
    const { db, api, addUser, rooms } = boot();
    addUser('owner', 'Ada');
    addUser('editor', 'Bea');
    addUser('referee', 'Cam');
    const owner = { id: 'owner' };
    const editor = { id: 'editor' };
    const referee = { id: 'referee' };
    const created = await api.create(owner, { name: 'Voss' });
    const id = created.data.character.id;
    db.prepare(
        `INSERT INTO character_access (character_id, user_id, role, granted_by, created_at) VALUES (?, 'editor', 'editor', 'owner', ?)`,
    ).run(id, NOW);
    const heard = { messages: [], send(text) { this.messages.push(JSON.parse(text)); } };
    rooms.session(id).sockets.push(heard);
    let asked = 0;
    const gate = async () => {
        asked += 1;
        return true;
    };
    const closed = await api.ledgerRead(owner, id, 0);
    assert.equal(closed.status, 503);
    const before = await api.ledgerMode(owner, id, 'detailed');
    assert.equal(before.status, 200);
    assert.deepEqual(before.data, { credits: 'detailed' });
    assert.equal((await api.ledgerRead(editor, id, 0)).status, 503);
    const refused = await api.ledgerMode(referee, id, 'simple', gate);
    assert.equal(refused.status, 404);
    assert.equal(refused.message, 'No such character.');
    assert.equal(asked, 0);
    assert.equal(rooms.session(id).sql.exec(`SELECT value FROM meta WHERE key = 'credits'`)[0].value, 'detailed');
    const bad = await api.ledgerMode(editor, id, 'both');
    assert.equal(bad.status, 400);
    assert.equal(bad.message, 'Invalid request.');
    const editorSet = await api.ledgerMode(editor, id, 'simple');
    assert.equal(editorSet.status, 200);
    assert.deepEqual(editorSet.data, { credits: 'simple' });
    assert.equal(heard.messages.length, 0);
});

test('an editor post does not ask who owns a campaign; an account with no access does', async () => {
    const { api, addUser, arm } = boot();
    addUser('owner', 'Ada');
    addUser('stranger', 'Dee');
    const owner = { id: 'owner' };
    const stranger = { id: 'stranger' };
    const created = await api.create(owner, { name: 'Voss' });
    const id = created.data.character.id;
    arm(id);
    let calls = 0;
    const asked = async () => {
        calls += 1;
        return false;
    };
    const posted = await api.ledgerPost(owner, id, { kind: 'pay', amount: 8, memo: 'own' }, asked);
    assert.equal(posted.status, 201);
    assert.equal(posted.data.pending, 0);
    assert.equal(calls, 0);
    const refused = await api.ledgerPost(stranger, id, { kind: 'pay', amount: 8, memo: 'own' }, asked);
    assert.equal(refused.status, 404);
    assert.equal(calls, 1);
    const accepted = await api.ledgerAccept(owner, id, posted.data.id, asked);
    assert.equal(accepted.message, 'That line is already in the register.');
    assert.equal(calls, 1);
    const strangerAccept = await api.ledgerAccept(stranger, id, posted.data.id, asked);
    assert.equal(strangerAccept.status, 404);
    assert.equal(calls, 2);
});
