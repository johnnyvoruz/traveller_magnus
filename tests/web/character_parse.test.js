import assert from 'node:assert/strict';
import { test } from 'node:test';
import { request, resetTransport, transport } from '../../apps/web/src/characters/transport.ts';
import {
    parseAccess,
    parseCharacter,
    parseClaim,
    parseDoc,
    parseHeld,
    parseInvite,
    parseIssued,
    parseListItem,
    parseRole,
    parseServerMessage,
} from '../../apps/web/src/characters/types.ts';

const ID = 'ch_11111111-1111-4111-8111-111111111111';
const INVITE = 'ci_11111111-1111-4111-8111-111111111111';
const STAMP = '2026-10-07T00:00:00.000Z';

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

function jsonResponse(status, body, json) {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: json || (async () => body),
    };
}

test('request unwraps the envelope, and a thrown fetch is the network sentence', async () => {
    transport.fetch = async (url, init = {}) => {
        assert.equal(init.credentials, 'same-origin');
        assert.equal(new Headers(init.headers).get('content-type'), 'application/json');
        assert.equal(String(url), '/api/characters/' + ID);
        return jsonResponse(200, { ok: true, data: { id: ID } });
    };
    const ok = await request('/api/characters/' + ID, { method: 'POST', body: '{}' });
    assert.equal(ok.status, 200);
    assert.equal(ok.ok, true);
    assert.deepEqual(ok.data, { id: ID });

    transport.fetch = async () => jsonResponse(200, { ok: true });
    const bare = await request('/api/characters');
    assert.equal(bare.ok, true);
    assert.equal(bare.data, null);
    assert.equal(bare.message, 'The server could not do that.');

    transport.fetch = async () => jsonResponse(401, { ok: false });
    const quiet = await request('/api/characters');
    assert.equal(quiet.ok, false);
    assert.equal(quiet.message, '');

    transport.fetch = async () => jsonResponse(401, { ok: false, error: { message: 'Sign in.' } });
    const named = await request('/api/characters');
    assert.equal(named.message, 'Sign in.');

    transport.fetch = async () => jsonResponse(500, { ok: false, error: { message: '' } });
    const blank = await request('/api/characters');
    assert.equal(blank.message, 'The server could not do that.');

    transport.fetch = async () => jsonResponse(500, null, async () => { throw new Error('not json'); });
    const broken = await request('/api/characters');
    assert.equal(broken.status, 500);
    assert.equal(broken.data, null);
    assert.equal(broken.message, 'The server could not do that.');

    transport.fetch = async () => { throw new Error('offline'); };
    const down = await request('/api/characters');
    assert.deepEqual(down, { status: 0, ok: false, data: null, message: 'The network is not available.' });
    resetTransport();
});

test('resetTransport puts every door back', () => {
    const stamp = () => 1;
    const never = () => 0;
    transport.fetch = async () => { throw new Error('stub'); };
    transport.schedule = () => () => {};
    transport.openSocket = () => ({ send() {}, close() {} });
    transport.now = stamp;
    transport.random = never;
    transport.pageHidden = () => true;
    const seen = [];
    transport.onVisibility = (fn) => { seen.push(fn); return () => {}; };
    resetTransport();
    assert.equal(transport.fetch, fetch);
    assert.notEqual(transport.now, stamp);
    assert.notEqual(transport.random, never);
    const rolled = transport.random();
    assert.equal(rolled >= 0 && rolled < 1, true);
    assert.equal(transport.pageHidden(), false);
    const cancel = transport.onVisibility(() => {});
    cancel();
    assert.deepEqual(seen, []);
    const cancelTimer = transport.schedule(() => {}, 1);
    cancelTimer();
});

test('parseCharacter, parseRole, parseListItem, and parseHeld keep a valid row and drop a bad one', () => {
    assert.deepEqual(parseCharacter(character()), character());
    assert.equal(parseCharacter(character({ name: '' })), null);
    assert.equal(parseCharacter(character({ later: true })), null);
    assert.equal(parseCharacter(null), null);
    assert.equal(parseRole('owner'), 'owner');
    assert.equal(parseRole('editor'), 'editor');
    assert.equal(parseRole('player'), null);
    assert.equal(parseRole(''), null);
    const item = { character: character(), role: 'editor', ownerName: '' };
    assert.deepEqual(parseListItem(item), item);
    assert.equal(parseListItem({ character: character(), role: 'editor' }), null);
    assert.deepEqual(parseHeld({ character: character(), role: 'owner' }), { character: character(), role: 'owner' });
    assert.equal(parseHeld({ character: character(), role: 'owner', ownerName: 'Ada' }), null);
});

test('parseDoc drops a cleared box and keeps its rev', () => {
    const doc = parseDoc({
        fields: { Name: 'Ada', Age: '', Alive: false, Armed: true },
        revs: { Name: 1, Age: 2, Alive: 3, Armed: 4 },
        seq: 0,
    });
    assert.deepEqual(doc, {
        fields: { Name: 'Ada', Armed: true },
        revs: { Name: 1, Age: 2, Alive: 3, Armed: 4 },
        seq: 0,
    });
    assert.equal(parseDoc({ fields: { Name: 1 }, revs: {}, seq: 1 }), null);
    assert.equal(parseDoc({ fields: {}, revs: { Name: 0 }, seq: 1 }), null);
    assert.equal(parseDoc(null), null);
});

test('parseInvite, parseIssued, parseAccess, and parseClaim keep the fields the screen holds', () => {
    const rawInvite = {
        id: INVITE,
        characterId: ID,
        role: 'editor',
        createdBy: 'user-1',
        expiresAt: STAMP,
        claimedBy: null,
        claimedAt: null,
        revokedAt: null,
    };
    assert.deepEqual(parseInvite(rawInvite), {
        id: INVITE,
        role: 'editor',
        expiresAt: STAMP,
        createdBy: 'user-1',
        claimedBy: null,
        claimedAt: null,
        revokedAt: null,
    });
    assert.equal(parseInvite({ ...rawInvite, token: 'secret' }), null);
    assert.equal(parseInvite({ ...rawInvite, role: 'owner' }), null);
    assert.deepEqual(parseIssued({ id: INVITE, url: 'https://voyage.example/claim/tok_1', expiresAt: STAMP }), {
        id: INVITE,
        url: 'https://voyage.example/claim/tok_1',
        expiresAt: STAMP,
    });
    assert.equal(parseIssued({ id: INVITE, url: 'not a url', expiresAt: STAMP }), null);
    assert.deepEqual(parseAccess({
        characterId: ID,
        userId: 'user-2',
        role: 'editor',
        grantedBy: 'user-1',
        name: 'Mara',
        createdAt: STAMP,
    }), { userId: 'user-2', role: 'editor', name: 'Mara', grantedBy: 'user-1' });
    assert.equal(parseAccess({
        characterId: ID,
        userId: 'user-1',
        role: 'owner',
        name: 'Ada',
        createdAt: STAMP,
    }), null);
    assert.deepEqual(parseClaim({ characterId: ID }), { characterId: ID });
    assert.equal(parseClaim({ characterId: 'nope' }), null);
    assert.equal(parseClaim({}), null);
});

test('parseServerMessage reads a server frame and ignores one that is not the contract', () => {
    const you = { id: 'user-1', name: 'Ada', colour: 0, role: 'owner' };
    const hello = parseServerMessage({
        t: 'hello',
        you,
        doc: { fields: { Name: 'Ada', Age: '' }, revs: { Name: 1, Age: 2 }, seq: 0 },
        who: [{ id: 'user-2', name: 'Mara', colour: 1, field: null }],
    });
    assert.equal(hello.t, 'hello');
    assert.deepEqual(hello.doc.fields, { Name: 'Ada' });
    assert.deepEqual(hello.who, [{ id: 'user-2', name: 'Mara', colour: 1, field: null }]);
    assert.equal(parseServerMessage({ t: 'hello', you, doc: { fields: {}, revs: {}, seq: -1 }, who: [] }), null);
    assert.equal(parseServerMessage({
        t: 'hello',
        you: { id: 'user-1', name: 'Ada', colour: 0 },
        doc: { fields: {}, revs: {}, seq: 0 },
        who: [],
    }), null);
    const set = { t: 'set', field: 'Name', value: 'Bea', rev: 2, seq: 3, by: 'user-2' };
    assert.deepEqual(parseServerMessage(set), set);
    assert.equal(parseServerMessage({ t: 'set', id: 'c1', field: 'Name', value: 'Bea' }), null);
    assert.deepEqual(parseServerMessage({ t: 'ack', id: 'c1', rev: 2 }), { t: 'ack', id: 'c1', rev: 2 });
    assert.deepEqual(parseServerMessage({ t: 'no', id: 'c1', why: 'too long' }), { t: 'no', id: 'c1', why: 'too long' });
    assert.deepEqual(parseServerMessage({ t: 'who', who: [] }), { t: 'who', who: [] });
    assert.deepEqual(parseServerMessage({ t: 'meta', name: 'Aria', summary: '' }), { t: 'meta', name: 'Aria', summary: '' });
    assert.equal(parseServerMessage({ t: 'meta', name: '', summary: '' }), null);
    assert.deepEqual(parseServerMessage({ t: 'gone', why: 'deleted' }), { t: 'gone', why: 'deleted' });
    assert.deepEqual(parseServerMessage({ t: 'gone', why: 'removed' }), { t: 'gone', why: 'removed' });
    assert.equal(parseServerMessage({ t: 'gone', why: 'closed' }), null);
    assert.equal(parseServerMessage({ t: 'focus', field: 'Name' }), null);
    assert.equal(parseServerMessage(null), null);
});
