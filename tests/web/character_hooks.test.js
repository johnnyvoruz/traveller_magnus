import assert from 'node:assert/strict';
import { test } from 'node:test';
import { presenceMap } from '../../apps/web/src/characters/sheet.ts';
import {
    DELETE_WHAT,
    answerConfirm,
    characters,
    confirm,
    deleteCharacter,
    noteCharacterText,
    noteRole,
    registerDeleted,
    registerReset,
    registerRole,
    registerText,
    resetCharacters,
    transport,
} from '../../apps/web/src/characters/store.ts';
import { characterBoxLimit, toneFor } from '../../apps/web/src/characters/types.ts';

const ID = 'ch_11111111-1111-4111-8111-111111111111';
const STAMP = '2026-10-07T00:00:00.000Z';

function row(over = {}) {
    return {
        character: {
            id: ID,
            ownerId: 'user-1',
            name: 'Ada',
            summary: '',
            schema: 'mgt2e_character@1',
            createdAt: STAMP,
            updatedAt: STAMP,
            deletedAt: null,
            ...over,
        },
        role: 'owner',
        ownerName: 'Ada',
    };
}

test('noteCharacterText and noteRole update the list row and tell the registered sheet', () => {
    resetCharacters();
    characters.items = [row()];
    const texts = [];
    const roles = [];
    registerText((id, text) => { texts.push({ id, text }); });
    registerRole((id, role) => { roles.push({ id, role }); });
    noteCharacterText(ID, { name: 'Aria' });
    assert.equal(characters.items[0].character.name, 'Aria');
    assert.equal(characters.items[0].character.summary, '');
    noteCharacterText(ID, { summary: 'Scout' });
    assert.equal(characters.items[0].character.name, 'Aria');
    assert.equal(characters.items[0].character.summary, 'Scout');
    noteCharacterText('ch_missing', { name: 'No' });
    assert.equal(characters.items.length, 1);
    assert.equal(characters.items[0].character.name, 'Aria');
    noteRole(ID, 'editor');
    assert.equal(characters.items[0].role, 'editor');
    noteRole('ch_missing', 'owner');
    assert.equal(characters.items[0].role, 'editor');
    assert.deepEqual(texts, [
        { id: ID, text: { name: 'Aria' } },
        { id: ID, text: { summary: 'Scout' } },
        { id: 'ch_missing', text: { name: 'No' } },
    ]);
    assert.deepEqual(roles, [
        { id: ID, role: 'editor' },
        { id: 'ch_missing', role: 'owner' },
    ]);
});

test('registerReset runs when the store resets, and registerDeleted runs only after a delete lands', async () => {
    resetCharacters();
    let resets = 0;
    const deleted = [];
    registerReset(() => { resets += 1; });
    registerDeleted((id) => { deleted.push(id); });
    characters.items = [row()];
    characters.status = 'ready';
    const cancelled = deleteCharacter(ID);
    assert.equal(confirm.open, true);
    assert.equal(confirm.message, DELETE_WHAT);
    answerConfirm(false);
    assert.equal(await cancelled, false);
    assert.deepEqual(deleted, []);
    assert.equal(characters.items.length, 1);

    transport.fetch = async (url, init = {}) => {
        assert.equal(init.credentials, 'same-origin');
        assert.equal(init.method, 'DELETE');
        assert.equal(String(url), '/api/characters/' + ID);
        return { ok: false, status: 401, json: async () => ({ ok: false, error: { code: 'unauthenticated', message: 'Sign in.' } }) };
    };
    const refused = deleteCharacter(ID);
    answerConfirm(true);
    assert.equal(await refused, false);
    assert.deepEqual(deleted, []);
    assert.equal(characters.status, 'signed-out');
    assert.deepEqual(characters.items, []);

    characters.items = [row()];
    transport.fetch = async () => ({ ok: true, status: 200, json: async () => ({ ok: true, data: null }) });
    const removed = deleteCharacter(ID);
    answerConfirm(true);
    assert.equal(await removed, true);
    assert.deepEqual(deleted, [ID]);
    assert.deepEqual(characters.items, []);
    resetCharacters();
    assert.equal(resets, 1);
    assert.equal(characters.status, 'signed-out');
});

test('presenceMap keeps one person per box, and toneFor wraps the eight colours', () => {
    assert.deepEqual(presenceMap([]), {});
    assert.deepEqual(presenceMap([
        { id: 'a', name: 'Ada', colour: 0, field: null },
        { id: 'b', name: 'Bea', colour: 1, field: 'Name' },
        { id: 'c', name: 'Cara', colour: 8, field: 'Name' },
        { id: 'd', name: 'Dee', colour: Number.NaN, field: 'Age' },
    ]), {
        Name: { name: 'Cara', tone: '--signal' },
        Age: { name: 'Dee', tone: '--signal' },
    });
    assert.equal(toneFor(0), '--signal');
    assert.equal(toneFor(1), '--attention');
    assert.equal(toneFor(7), '--text-0');
    assert.equal(toneFor(8), '--signal');
    assert.equal(toneFor(-1), '--attention');
    assert.equal(toneFor(Number.NaN), '--signal');
});

test('characterBoxLimit is the history box for that field and the ordinary box otherwise', () => {
    // packages/shared/src/schemas/character.ts CHARACTER_LIMITS and HISTORY_FIELD.
    assert.equal(characterBoxLimit('History & Background'), 20_000);
    assert.equal(characterBoxLimit('Name'), 2_000);
    assert.equal(characterBoxLimit(''), 2_000);
});
