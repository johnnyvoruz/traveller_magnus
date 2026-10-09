import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import {
    answerConfirm,
    bindSheet,
    characters,
    claim,
    confirm,
    createCharacter,
    deleteCharacter,
    giveOwnership,
    listAccess,
    listInvites,
    loadCharacters,
    makeInvite,
    openCharacter,
    removeAccess,
    renameCharacter,
    resetCharacters,
    revokeInvite,
    transport,
} from '../../apps/web/src/characters/index.ts';
import { toasts } from '../../apps/web/src/shell/toast.ts';

const STAMP = '2026-10-07T00:00:00.000Z';
const ID = 'ch_11111111-1111-4111-8111-111111111111';
const OTHER = 'ch_22222222-2222-4222-8222-222222222222';

function jsonResponse(status, body) {
    return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function character(over = {}) {
    return {
        id: ID,
        ownerId: 'user-1',
        name: 'Ada',
        summary: '',
        schema: 'mgt2e_character@1',
        createdAt: STAMP,
        updatedAt: STAMP,
        deletedAt: null,
        ...over,
    };
}

function hello(over = {}) {
    return {
        t: 'hello',
        you: { id: 'user-1', name: 'Ada', colour: 0, role: 'owner' },
        doc: { fields: { Name: 'Ada' }, revs: { Name: 1 }, seq: 1 },
        who: [
            { id: 'user-1', name: 'Ada', colour: 0, field: null },
            { id: 'user-2', name: 'Mara', colour: 1, field: null },
        ],
        ...over,
    };
}

class FakeSocket {
    constructor(url) {
        this.url = url;
        this.sent = [];
        this.handlers = null;
        this.clientCloses = 0;
    }

    send(data) {
        this.sent.push(JSON.parse(data));
    }

    close() {
        this.clientCloses += 1;
        this.handlers.onClose();
    }

    /** The server dropped the socket. */
    serverClose() {
        this.handlers.onClose();
    }

    open() {
        this.handlers.onOpen();
    }

    receive(message) {
        this.handlers.onMessage(JSON.stringify(message));
    }

    fail() {
        this.handlers.onError();
    }
}

function harness() {
    const server = {
        listStatus: 200,
        getStatus: 200,
        items: [
            { character: character(), role: 'owner', ownerName: 'Ada' },
            {
                character: character({ id: OTHER, name: 'Beowulf', summary: 'A scout' }),
                role: 'editor',
                ownerName: 'Mara',
            },
        ],
        doc: { fields: { Name: 'Ada' }, revs: { Name: 1 }, seq: 1 },
        role: 'owner',
        posts: [],
        patches: [],
        deletes: [],
        fieldPosts: [],
        invites: [],
        claims: [],
        owners: [],
        accessDeletes: [],
        inviteDeletes: [],
    };
    const sockets = [];
    const timers = [];
    let now = 1_000_000;
    let hidden = false;
    let blockSocket = false;
    const shown = [];

    const fetchImpl = async (url, init = {}) => {
        assert.equal(init.credentials, 'same-origin');
        const method = init.method || 'GET';
        const target = String(url);
        if (server.listStatus === 401) {
            return jsonResponse(401, { ok: false, error: { code: 'unauthenticated', message: 'Sign in.' } });
        }
        if (target === '/api/characters' && method === 'GET') {
            if (server.listStatus === 401) {
                return jsonResponse(401, { ok: false, error: { code: 'unauthenticated', message: 'Sign in.' } });
            }
            return jsonResponse(200, { ok: true, data: server.items });
        }
        if (target === '/api/characters' && method === 'POST') {
            const body = JSON.parse(init.body);
            server.posts.push(body);
            const row = character({ id: 'ch_33333333-3333-4333-8333-333333333333', name: body.name });
            return jsonResponse(201, { ok: true, data: row });
        }
        if (target === '/api/characters/claim' && method === 'POST') {
            const body = JSON.parse(init.body);
            server.claims.push(body);
            if (body.token === 'used') {
                return jsonResponse(409, { ok: false, error: { code: 'conflict', message: 'This link has been used.' } });
            }
            return jsonResponse(200, { ok: true, data: { characterId: ID } });
        }
        const fields = target.match(/^\/api\/characters\/([^/]+)\/fields$/);
        if (fields && method === 'POST') {
            const body = JSON.parse(init.body);
            server.fieldPosts.push(body.sets);
            for (const set of body.sets) {
                if (set.value === '' || set.value === false) delete server.doc.fields[set.field];
                else server.doc.fields[set.field] = set.value;
            }
            server.doc.seq += 1;
            return jsonResponse(200, { ok: true, data: { ok: true } });
        }
        const one = target.match(/^\/api\/characters\/([^/]+)$/);
        if (one && method === 'GET') {
            if (server.getStatus === 401) {
                return jsonResponse(401, { ok: false, error: { code: 'unauthenticated', message: 'Sign in.' } });
            }
            if (server.getStatus === 404) {
                return jsonResponse(404, { ok: false, error: { code: 'not_found', message: 'No such character.' } });
            }
            return jsonResponse(200, {
                ok: true,
                data: { character: character(), role: server.role, doc: server.doc },
            });
        }
        if (one && method === 'PATCH') {
            server.patches.push(JSON.parse(init.body));
            return jsonResponse(200, { ok: true, data: character({ name: JSON.parse(init.body).name, summary: 'scout' }) });
        }
        if (one && method === 'DELETE') {
            server.deletes.push(decodeURIComponent(one[1]));
            return jsonResponse(200, { ok: true, data: null });
        }
        const invites = target.match(/^\/api\/characters\/([^/]+)\/invites$/);
        if (invites && method === 'POST') {
            const issued = {
                id: 'ci_11111111-1111-4111-8111-111111111111',
                url: 'https://voyage.example/claim/tok_1',
                expiresAt: STAMP,
            };
            server.invites.push(issued);
            return jsonResponse(201, { ok: true, data: issued });
        }
        if (invites && method === 'GET') {
            return jsonResponse(200, {
                ok: true,
                data: [{
                    id: 'ci_11111111-1111-4111-8111-111111111111',
                    characterId: ID,
                    role: 'editor',
                    createdBy: 'user-1',
                    expiresAt: STAMP,
                    claimedBy: null,
                    claimedAt: null,
                    revokedAt: null,
                }],
            });
        }
        const inviteOne = target.match(/^\/api\/characters\/([^/]+)\/invites\/([^/]+)$/);
        if (inviteOne && method === 'DELETE') {
            server.inviteDeletes.push(decodeURIComponent(inviteOne[2]));
            return jsonResponse(200, { ok: true, data: null });
        }
        const access = target.match(/^\/api\/characters\/([^/]+)\/access$/);
        if (access && method === 'GET') {
            return jsonResponse(200, {
                ok: true,
                data: [
                    { characterId: ID, userId: 'user-1', role: 'owner', name: 'Ada', grantedBy: 'user-1', createdAt: STAMP },
                    { characterId: ID, userId: 'user-2', role: 'editor', name: 'Mara', grantedBy: 'user-1', createdAt: STAMP },
                ],
            });
        }
        const accessOne = target.match(/^\/api\/characters\/([^/]+)\/access\/([^/]+)$/);
        if (accessOne && method === 'DELETE') {
            server.accessDeletes.push(decodeURIComponent(accessOne[2]));
            return jsonResponse(200, { ok: true, data: null });
        }
        const owner = target.match(/^\/api\/characters\/([^/]+)\/owner$/);
        if (owner && method === 'POST') {
            server.owners.push(JSON.parse(init.body));
            return jsonResponse(200, { ok: true, data: { role: 'editor' } });
        }
        return jsonResponse(404, { ok: false, error: { code: 'not_found', message: 'Missing ' + target } });
    };

    function install() {
        resetCharacters();
        server.listStatus = 200;
        server.getStatus = 200;
        server.role = 'owner';
        server.doc = { fields: { Name: 'Ada' }, revs: { Name: 1 }, seq: 1 };
        server.items = [
            { character: character(), role: 'owner', ownerName: 'Ada' },
            {
                character: character({ id: OTHER, name: 'Beowulf', summary: 'A scout' }),
                role: 'editor',
                ownerName: 'Mara',
            },
        ];
        server.posts = [];
        server.patches = [];
        server.deletes = [];
        server.fieldPosts = [];
        server.invites = [];
        server.claims = [];
        server.owners = [];
        server.accessDeletes = [];
        server.inviteDeletes = [];
        sockets.length = 0;
        timers.length = 0;
        shown.length = 0;
        transport.fetch = fetchImpl;
        transport.schedule = (fn, ms) => {
            const item = { fn, ms, dead: false };
            timers.push(item);
            return () => { item.dead = true; };
        };
        transport.openSocket = (url, handlers) => {
            if (blockSocket) throw new Error('blocked');
            const socket = new FakeSocket(url);
            socket.handlers = handlers;
            sockets.push(socket);
            return socket;
        };
        transport.now = () => now;
        transport.random = () => 0;
        transport.pageHidden = () => hidden;
        transport.onVisibility = (fn) => {
            shown.push(fn);
            return () => {};
        };
    }

    function fireNext() {
        const item = timers.find((timer) => !timer.dead);
        if (!item) throw new Error('no timer');
        item.dead = true;
        item.fn();
    }

    return {
        server,
        sockets,
        timers,
        shown,
        install,
        fireNext,
        set now(value) { now = value; },
        get now() { return now; },
        set hidden(value) { hidden = value; },
        set blockSocket(value) { blockSocket = value; },
    };
}

const env = harness();

async function ticks() {
    for (let i = 0; i < 8; i += 1) await new Promise((resolve) => setImmediate(resolve));
}

beforeEach(() => {
    env.install();
    env.hidden = false;
    env.blockSocket = false;
    env.now = 1_000_000;
});

afterEach(() => {
    resetCharacters();
});

async function opened(message = hello()) {
    const handle = openCharacter(ID);
    const socket = env.sockets[0];
    socket.open();
    socket.receive(message);
    await ticks();
    return { handle, socket };
}

test('the list, a duplicate, a rename, and a delete that asks first', async () => {
    const items = await loadCharacters();
    assert.equal(characters.status, 'ready');
    assert.equal(items.length, 2);
    assert.equal(items[0].role, 'owner');
    assert.equal(items[0].ownerName, 'Ada');
    assert.equal(items[1].role, 'editor');
    assert.equal(items[1].character.name, 'Beowulf');

    const created = await createCharacter('Ada', OTHER);
    assert.equal(created.name, 'Ada');
    assert.deepEqual(env.server.posts[0], { name: 'Ada', from: OTHER });
    assert.equal(characters.items.length, 3);

    assert.equal(await renameCharacter(ID, 'Aria'), true);
    assert.deepEqual(env.server.patches[0], { name: 'Aria' });
    assert.equal(characters.items[0].character.name, 'Aria');

    const cancelled = deleteCharacter(ID);
    assert.equal(confirm.open, true);
    assert.match(confirm.message, /Aria/);
    answerConfirm(false);
    assert.equal(await cancelled, false);
    assert.equal(env.server.deletes.length, 0);

    const removed = deleteCharacter(ID);
    answerConfirm(true);
    assert.equal(await removed, true);
    assert.deepEqual(env.server.deletes, [ID]);
    assert.equal(characters.items.some((item) => item.character.id === ID), false);
    assert.equal(toasts.length, 1);
    assert.equal(toasts[0].action, null);
    assert.match(toasts[0].message, /Deleted Aria/);
});

test('signed out: empty and silent', async () => {
    env.server.listStatus = 401;
    const items = await loadCharacters();
    assert.equal(items, null);
    assert.equal(characters.status, 'signed-out');
    assert.deepEqual(characters.items, []);
    assert.equal(characters.error, '');
    assert.equal(toasts.length, 0);
    assert.equal(await createCharacter('Ada'), null);
    assert.equal(toasts.length, 0);
    assert.equal(characters.error, '');
});

test('two handles on one id share the sheet, and the last close drops the socket', async () => {
    const first = openCharacter(ID);
    const second = openCharacter(ID);
    assert.equal(first, second);
    const socket = env.sockets[0];
    assert.match(socket.url, new RegExp('/api/characters/' + ID + '/live$'));
    socket.open();
    socket.receive(hello());
    await ticks();
    first.setField('Name', 'Aria');
    assert.equal(second.fields.Name, 'Aria');
    assert.equal(socket.clientCloses, 0);
    first.close();
    assert.equal(socket.clientCloses, 0);
    second.setField('Age', '34');
    assert.equal(socket.sent.filter((message) => message.t === 'set').length, 2);
    second.close();
    assert.equal(socket.clientCloses, 1);
    second.setField('Species', 'Solomani');
    assert.equal(socket.sent.filter((message) => message.field === 'Species').length, 0);
});

test('a set, its ack, and a refusal put back', async () => {
    const { handle, socket } = await opened();
    assert.equal(handle.status, 'live');
    assert.equal(handle.fields.Name, 'Ada');
    handle.setField('Name', 'Bea');
    assert.equal(handle.fields.Name, 'Bea');
    const sent = socket.sent.find((message) => message.t === 'set');
    assert.equal(sent.field, 'Name');
    assert.equal(sent.value, 'Bea');
    socket.receive({ t: 'ack', id: sent.id, rev: 2 });
    assert.equal(handle.fields.Name, 'Bea');
    assert.equal(handle.notice, '');

    handle.setField('Name', 'Cara');
    const sets = socket.sent.filter((message) => message.t === 'set');
    const refused = sets[sets.length - 1];
    socket.receive({ t: 'no', id: refused.id, why: 'That box is too long.' });
    assert.equal(handle.fields.Name, 'Bea');
    assert.equal(handle.notice, 'That box is too long.');
});

test('another person\'s set waits out an unsent set of mine, then stands', async () => {
    const { handle, socket } = await opened();
    handle.setField('Name', 'Bea');
    socket.receive({ t: 'set', field: 'Age', value: '40', rev: 4, seq: 4, by: 'user-2' });
    assert.equal(handle.fields.Age, '40');
    socket.receive({ t: 'set', field: 'Name', value: 'Cara', rev: 5, seq: 5, by: 'user-2' });
    assert.equal(handle.fields.Name, 'Bea');
    const mine = socket.sent.find((message) => message.t === 'set');
    socket.receive({ t: 'ack', id: mine.id, rev: 3 });
    assert.equal(handle.fields.Name, 'Cara');
});

test('presence in and out, and the sheet adapter', async () => {
    const { handle, socket } = await opened(hello({
        who: [
            { id: 'user-1', name: 'Ada', colour: 0, field: 'Age' },
            { id: 'user-2', name: 'Mara', colour: 1, field: 'Name' },
        ],
    }));
    assert.equal(handle.you.id, 'user-1');
    assert.equal(handle.who.length, 1);
    assert.equal(handle.who[0].name, 'Mara');
    const view = bindSheet(handle);
    assert.equal(view.editable, true);
    assert.equal(view.doc.schema, 'mgt2e_character@1');
    assert.equal(view.doc.fields.Name, 'Ada');
    assert.deepEqual(view.presence.Name, { name: 'Mara', tone: '--attention' });

    socket.receive({ t: 'who', who: [{ id: 'user-2', name: 'Mara', colour: 1, field: null }] });
    assert.equal(handle.who[0].field, null);
    assert.deepEqual(view.presence, {});

    socket.receive({ t: 'who', who: [] });
    assert.equal(handle.who.length, 0);

    view.change('Species', 'Solomani');
    view.enter('Species');
    view.leave('Species');
    const kinds = socket.sent.map((message) => message.t);
    assert.ok(kinds.includes('set'));
    assert.deepEqual(socket.sent.filter((message) => message.t === 'focus').map((message) => message.field), ['Species', null]);
});

test('meta renames the open character and the list', async () => {
    await loadCharacters();
    const { handle, socket } = await opened();
    socket.receive({ t: 'meta', name: 'Aria', summary: 'Scout' });
    assert.equal(handle.character.name, 'Aria');
    assert.equal(handle.character.summary, 'Scout');
    assert.equal(characters.items[0].character.name, 'Aria');
    assert.equal(characters.items[0].character.summary, 'Scout');
});

test('gone closes the sheet and does not reconnect', async () => {
    const { handle, socket } = await opened();
    socket.receive({ t: 'gone', why: 'deleted' });
    assert.equal(handle.status, 'gone');
    assert.equal(handle.notice, 'deleted');
    assert.equal(handle.who.length, 0);
    assert.equal(bindSheet(handle).editable, false);
    const before = env.sockets.length;
    const pending = env.timers.filter((timer) => !timer.dead);
    assert.equal(pending.length, 0);
    socket.serverClose();
    assert.equal(env.sockets.length, before);
    handle.setField('Name', 'Bea');
    assert.equal(handle.fields.Name, 'Ada');
});

test('a dropped socket replays three unsent sets in order', async () => {
    const { handle, socket } = await opened();
    handle.setField('Name', 'One');
    handle.setField('Age', '2');
    handle.setField('Species', 'Solomani');
    socket.serverClose();
    assert.equal(handle.status, 'connecting');
    env.fireNext();
    assert.equal(env.sockets.length, 2);
    const next = env.sockets[1];
    next.open();
    next.receive(hello());
    const sets = next.sent.filter((message) => message.t === 'set');
    assert.deepEqual(sets.map((message) => message.field), ['Name', 'Age', 'Species']);
    assert.deepEqual(sets.map((message) => message.value), ['One', '2', 'Solomani']);
    assert.deepEqual(sets.map((message) => message.id), ['c1', 'c2', 'c3']);
});

test('two failed upgrades fall back to saving and reloading', async () => {
    const handle = openCharacter(ID);
    await ticks();
    env.sockets[0].fail();
    env.fireNext();
    env.sockets[1].fail();
    assert.equal(handle.status, 'offline');
    handle.setField('Name', 'Bea');
    await ticks();
    assert.deepEqual(env.server.fieldPosts[0], [{ field: 'Name', value: 'Bea' }]);
    assert.equal(handle.fields.Name, 'Bea');
    assert.equal(handle.status, 'connecting');
    assert.equal(env.sockets.length, 3);
    env.sockets[2].open();
    env.sockets[2].receive(hello({ doc: { fields: { Name: 'Bea' }, revs: { Name: 2 }, seq: 2 } }));
    await ticks();
    assert.equal(handle.status, 'live');
});

test('a poll stays quiet while the page is hidden, then tries the socket once it succeeds', async () => {
    const handle = openCharacter(ID);
    await ticks();
    env.sockets[0].fail();
    env.fireNext();
    env.sockets[1].fail();
    assert.equal(handle.status, 'offline');
    env.blockSocket = true;
    env.server.doc = { fields: { Name: 'Cara' }, revs: { Name: 3 }, seq: 9 };
    env.hidden = true;
    env.fireNext();
    await ticks();
    assert.equal(handle.fields.Name, 'Ada');
    env.hidden = false;
    env.shown[0](false);
    await ticks();
    assert.equal(handle.fields.Name, 'Cara');
    assert.equal(handle.status, 'offline');
});

test('a blocked socket uses the fallback at once', async () => {
    env.blockSocket = true;
    const handle = openCharacter(ID);
    assert.equal(handle.status, 'offline');
    assert.equal(env.sockets.length, 0);
    handle.setField('Name', 'Bea');
    await ticks();
    assert.equal(env.server.fieldPosts.length, 1);
});

test('a page hidden for a while reconnects when it is shown again', async () => {
    const { handle, socket } = await opened();
    env.hidden = true;
    env.shown[0](true);
    env.now += 29999;
    env.hidden = false;
    env.shown[0](false);
    assert.equal(env.sockets.length, 1);
    assert.equal(handle.status, 'live');

    env.hidden = true;
    env.shown[0](true);
    env.now += 30000;
    env.hidden = false;
    env.shown[0](false);
    assert.equal(env.sockets.length, 2);
    assert.equal(handle.status, 'connecting');
    assert.equal(socket.clientCloses >= 1, true);
    env.sockets[1].open();
    env.sockets[1].receive(hello({ doc: { fields: { Name: 'Ada', Age: '34' }, revs: {}, seq: 6 } }));
    assert.equal(handle.status, 'live');
    assert.equal(handle.fields.Age, '34');
});

test('share: a link, the people, a claim', async () => {
    const issued = await makeInvite(ID);
    assert.equal(issued.url, 'https://voyage.example/claim/tok_1');
    const invites = await listInvites(ID);
    assert.equal(invites.length, 1);
    assert.equal('token' in invites[0], false);
    assert.equal(await revokeInvite(ID, 'ci_11111111-1111-4111-8111-111111111111'), true);
    assert.deepEqual(env.server.inviteDeletes, ['ci_11111111-1111-4111-8111-111111111111']);
    const access = await listAccess(ID);
    assert.equal(access[1].name, 'Mara');
    assert.equal(await removeAccess(ID, 'user-2'), true);
    assert.deepEqual(env.server.accessDeletes, ['user-2']);
    await loadCharacters();
    assert.equal(await giveOwnership(ID, 'user-2'), true);
    assert.equal(characters.items[0].role, 'editor');
    assert.deepEqual(await claim('tok_1'), { characterId: ID });
    assert.equal(await claim('used'), null);
    assert.equal(characters.error, 'This link has been used.');
});
