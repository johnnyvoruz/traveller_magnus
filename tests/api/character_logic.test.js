import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { claimRateLimited } from '../../apps/api/src/character/rate.ts';
import { WIDGET_COUNT } from '../../apps/api/src/character/widgets.ts';
import { applySets, installSheet, readDoc, replaceBoxes, SheetRoom } from '../../apps/api/src/character/sheet.ts';
import { characterService } from '../../apps/api/src/character/service.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const NOW = '2026-10-07T00:00:00.000Z';
const ORIGIN = 'http://127.0.0.1:8807';

function sheetSql() {
    const db = new DatabaseSync(':memory:');
    const sql = {
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
    };
    installSheet(sql);
    return { sql };
}

function fakeSocket(attachment) {
    const messages = [];
    let current = { ...attachment };
    let closed = false;
    return {
        messages,
        get closed() { return closed; },
        attachment() { return current; },
        setAttachment(next) { current = next; },
        send(text) { messages.push(JSON.parse(text)); },
        close() { closed = true; },
    };
}

function boot() {
    const db = new DatabaseSync(':memory:');
    db.exec(fs.readFileSync(path.join(root, 'apps/api/src/db/migrations/0009_characters.sql'), 'utf8'));
    db.exec(`CREATE TABLE user (id TEXT PRIMARY KEY, name TEXT, email TEXT);
             CREATE TABLE profile (user_id TEXT PRIMARY KEY, display_name TEXT);`);
    db.exec('PRAGMA foreign_keys = ON');
    const catalogue = {
        async all(query, ...params) {
            return db.prepare(query).all(...params);
        },
        async get(query, ...params) {
            return db.prepare(query).get(...params) ?? null;
        },
        async run(query, ...params) {
            return db.prepare(query).run(...params).changes;
        },
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
    function session(id) {
        if (!sessions.has(id)) {
            const { sql } = sheetSql();
            sessions.set(id, { sql, sockets: [] });
        }
        return sessions.get(id);
    }
    const rooms = {
        retold: [],
        session,
        async ensure(id) { session(id); },
        async read(id) { return readDoc(session(id).sql); },
        async apply(id, sets, by) {
            const result = applySets(session(id).sql, sets, by, NOW);
            if (!result.ok) return result;
            const room = new SheetRoom(session(id).sql, session(id).sockets);
            for (const applied of result.applied) room.broadcastSet(applied, by);
            return {
                ok: true,
                doc: result.doc,
                applied: result.applied.map(({ field, rev, value }) => ({ field, rev, value })),
            };
        },
        async replace(id, boxes, by) { replaceBoxes(session(id).sql, boxes, by, NOW); },
        async meta(id, name, summary) {
            new SheetRoom(session(id).sql, session(id).sockets).broadcastMeta(name, summary);
        },
        async closeUser(id, userId) {
            new SheetRoom(session(id).sql, session(id).sockets).closeUser(userId);
        },
        async closeAll(id) {
            new SheetRoom(session(id).sql, session(id).sockets).closeAll();
        },
        async retell(id, roles) {
            rooms.retold.push({ id, roles });
            new SheetRoom(session(id).sql, session(id).sockets).retell(roles);
        },
    };
    let now = new Date(NOW);
    const api = characterService(catalogue, rooms, () => now);
    return {
        db,
        rooms,
        api,
        setNow(date) { now = date; },
        addUser(id, name) {
            db.prepare(`INSERT INTO user (id, name, email) VALUES (?, ?, ?)`).run(id, name, `${id}@localhost`);
        },
    };
}

function tokenOf(url) {
    return url.slice(url.lastIndexOf('/') + 1);
}

test('the worker widget list is the 420 boxes', () => {
    assert.equal(WIDGET_COUNT, 420);
});

test('two editors, later set wins, bad name and type stay with the sender', () => {
    const { sql } = sheetSql();
    const sockets = [];
    const room = new SheetRoom(sql, sockets);
    const owner = fakeSocket({ userId: 'owner', name: 'Ada', role: 'owner', colour: 1, field: null });
    const editor = fakeSocket({ userId: 'editor', name: 'Bea', role: 'editor', colour: 2, field: null });
    sockets.push(owner);
    room.connect(owner);
    sockets.push(editor);
    room.connect(editor);
    assert.equal(owner.messages[0].t, 'hello');
    assert.equal(editor.messages[0].t, 'hello');
    assert.equal(editor.messages[0].who.length, 2);

    room.receive(owner, JSON.stringify({ t: 'set', id: 's1', field: 'Title', value: 'Ada' }), NOW);
    room.receive(editor, JSON.stringify({ t: 'set', id: 's2', field: 'Title', value: 'Bea' }), NOW);
    assert.equal(readDoc(sql).fields.Title, 'Bea');
    assert.equal(readDoc(sql).revs.Title, 2);
    assert.equal(owner.messages.at(-1).t, 'set');
    assert.equal(owner.messages.at(-1).value, 'Bea');
    assert.equal(editor.messages.at(-1).value, 'Bea');
    assert.ok(owner.messages.some((message) => message.t === 'ack' && message.id === 's1' && message.rev === 1));
    assert.ok(editor.messages.some((message) => message.t === 'ack' && message.id === 's2' && message.rev === 2));

    const ownerCount = owner.messages.length;
    const editorCount = editor.messages.length;
    room.receive(owner, JSON.stringify({ t: 'set', id: 'bad-name', field: 'Not A Field', value: 'x' }), NOW);
    room.receive(owner, JSON.stringify({ t: 'set', id: 'bad-type', field: 'Career Survival 1', value: 'yes' }), NOW);
    assert.equal(editor.messages.length, editorCount);
    const refused = owner.messages.slice(ownerCount);
    assert.deepEqual(refused.map((message) => message.why), ['unknown_field', 'wrong_type']);
    assert.equal(readDoc(sql).fields.Title, 'Bea');
});

test('presence on focus, blur, and close; removal and delete close the page', () => {
    const { sql } = sheetSql();
    const sockets = [];
    const room = new SheetRoom(sql, sockets);
    const owner = fakeSocket({ userId: 'owner', name: 'Ada', role: 'owner', colour: 1, field: null });
    const editor = fakeSocket({ userId: 'editor', name: 'Bea', role: 'editor', colour: 2, field: null });
    sockets.push(owner, editor);
    room.connect(owner);
    room.connect(editor);
    room.receive(editor, JSON.stringify({ t: 'focus', field: 'Title' }), NOW);
    assert.equal(owner.messages.at(-1).t, 'who');
    assert.equal(owner.messages.at(-1).who.find((person) => person.id === 'editor').field, 'Title');
    room.receive(editor, JSON.stringify({ t: 'focus', field: null }), NOW);
    assert.equal(owner.messages.at(-1).who.find((person) => person.id === 'editor').field, null);
    room.leave(editor);
    assert.equal(owner.messages.at(-1).who.some((person) => person.id === 'editor'), false);

    sockets.push(editor);
    room.closeUser('editor');
    assert.equal(editor.messages.at(-1).t, 'gone');
    assert.equal(editor.messages.at(-1).why, 'removed');
    assert.equal(editor.closed, true);
    assert.equal(owner.messages.at(-1).who.some((person) => person.id === 'editor'), false);

    room.closeAll();
    assert.equal(owner.closed, true);
    assert.equal(owner.messages.at(-1).t, 'gone');
    assert.equal(owner.messages.at(-1).why, 'deleted');
});

test('duplicate, invite claim, handover, and a stranger on every route', async () => {
    const { db, rooms, api, addUser, setNow } = boot();
    addUser('owner', 'Ada');
    addUser('editor', 'Bea');
    addUser('third', 'Cam');
    addUser('stranger', 'Dee');
    const owner = { id: 'owner' };
    const editor = { id: 'editor' };
    const third = { id: 'third' };
    const stranger = { id: 'stranger' };

    const created = await api.create(owner, { name: 'Voss' });
    assert.equal(created.status, 201);
    const id = created.data.character.id;
    assert.equal(created.data.role, 'owner');
    assert.equal(created.data.character.schema, 'mgt2e_character@1');

    const written = await api.writeFields(owner, id, { sets: [{ field: 'Title', value: 'Scout' }, { field: 'Career Survival 1', value: true }] });
    assert.equal(written.status, 200);
    assert.equal(written.data.doc.fields.Title, 'Scout');
    assert.equal(written.data.doc.fields['Career Survival 1'], true);

    const strangerList = await api.list(stranger);
    assert.deepEqual(strangerList.data, []);
    const routes = [
        api.open(stranger, id),
        api.patch(stranger, id, { name: 'Nope' }),
        api.remove(stranger, id),
        api.writeFields(stranger, id, { sets: [{ field: 'Title', value: 'Z' }] }),
        api.access(stranger, id),
        api.removeAccess(stranger, id, 'editor'),
        api.giveOwner(stranger, id, { userId: 'editor' }),
        api.makeInvite(stranger, id, ORIGIN),
        api.listInvites(stranger, id),
        api.revokeInvite(stranger, id, 'ci_00000000-0000-4000-8000-000000000099'),
        api.claim(stranger, { token: 'missing-token' }),
        api.live(stranger, id),
    ];
    for (const pending of routes) {
        const result = await pending;
        assert.equal(result.status, 404, result.message);
        assert.equal(result.code, 'not_found');
    }

    const invite = await api.makeInvite(owner, id, ORIGIN);
    assert.equal(invite.status, 201);
    assert.match(invite.data.url, /^http:\/\/127\.0\.0\.1:8807\/claim\//);
    const token = tokenOf(invite.data.url);
    const listed = await api.listInvites(owner, id);
    assert.equal(listed.data[0].id, invite.data.id);
    assert.equal(JSON.stringify(listed.data).includes(token), false);

    const claimed = await api.claim(editor, { token });
    assert.equal(claimed.status, 200);
    assert.equal(claimed.data.characterId, id);
    const twice = await api.claim(third, { token });
    assert.equal(twice.status, 400);
    assert.equal(twice.details.reason, 'claimed');
    const editorOpen = await api.open(editor, id);
    assert.equal(editorOpen.data.role, 'editor');
    const editorPatch = await api.patch(editor, id, { summary: 'no' });
    assert.equal(editorPatch.status, 403);

    const copy = await api.create(editor, { from: id, name: 'Kite 1' });
    assert.equal(copy.status, 201);
    assert.equal(copy.data.character.name, 'Kite 1');
    assert.equal(copy.data.character.ownerId, 'editor');
    assert.equal(copy.data.character.summary, '');
    const copied = await api.open(editor, copy.data.character.id);
    assert.equal(copied.data.doc.fields.Title, 'Scout');
    const suffix = await api.create(editor, { from: id });
    assert.equal(suffix.data.character.name, 'Voss (copy)');
    const again = await api.create(editor, { from: suffix.data.character.id });
    assert.equal(again.data.character.name, 'Voss (copy 2)');

    const ownLink = await api.makeInvite(owner, id, ORIGIN);
    const ownerClaim = await api.claim(owner, { token: tokenOf(ownLink.data.url) });
    assert.equal(ownerClaim.status, 200);
    assert.equal((await api.open(owner, id)).data.role, 'owner');

    const revokedLink = await api.makeInvite(owner, id, ORIGIN);
    await api.revokeInvite(owner, id, revokedLink.data.id);
    const revoked = await api.claim(third, { token: tokenOf(revokedLink.data.url) });
    assert.equal(revoked.details.reason, 'revoked');

    const handed = await api.giveOwner(owner, id, { userId: 'editor' });
    assert.equal(handed.status, 200);
    assert.equal(handed.data.role, 'editor');
    assert.equal(handed.data.character.ownerId, 'editor');
    assert.equal((await api.open(editor, id)).data.role, 'owner');
    assert.deepEqual(rooms.retold.at(-1).roles, { owner: 'editor', editor: 'owner' });

    const removed = await api.removeAccess(editor, id, 'owner');
    assert.equal(removed.status, 200);
    assert.equal((await api.open(owner, id)).status, 404);

    const doomed = await api.create(editor, { name: 'Doomed' });
    const doomedId = doomed.data.character.id;
    const page = fakeSocket({ userId: 'editor', name: 'Bea', role: 'owner', colour: 2, field: null });
    rooms.session(doomedId).sockets.push(page);
    const deleted = await api.remove(editor, doomedId);
    assert.equal(deleted.status, 200);
    assert.equal(deleted.data.character.deletedAt == null, false);
    assert.equal(page.closed, true);
    assert.equal(page.messages.at(-1).why, 'deleted');
    assert.equal((await api.open(editor, doomedId)).status, 404);

    const expiring = await api.create(owner, { name: 'Old' });
    const expiringId = expiring.data.character.id;
    const oldLink = await api.makeInvite(owner, expiringId, ORIGIN);
    setNow(new Date('2026-10-22T00:00:00.000Z'));
    const expired = await api.claim(third, { token: tokenOf(oldLink.data.url) });
    assert.equal(expired.details.reason, 'expired');

    const access = db.prepare(`SELECT role, granted_by FROM character_access WHERE character_id = ? AND user_id = ?`).get(id, 'editor');
    assert.equal(access.role, 'owner');
});

test('claim rate limit matches the sign-in window', () => {
    const userId = `claim-${Date.now()}`;
    assert.equal(claimRateLimited(userId, 0), false);
    assert.equal(claimRateLimited(userId, 1_000), false);
    assert.equal(claimRateLimited(userId, 2_000), false);
    assert.equal(claimRateLimited(userId, 3_000), true);
    assert.equal(claimRateLimited(userId, 12_000), false);
});
