import assert from 'node:assert/strict';
import test from 'node:test';
import {
    CHARACTER_LIMITS,
    CHARACTER_SCHEMA,
    CharacterClaimResult,
    CharacterClientMessage,
    CharacterCreate,
    CharacterFieldSet,
    CharacterInviteCreate,
    CharacterServerMessage,
    characterBoxLimit,
} from '@voyage/shared';

const ID = 'ch_00000000-0000-4000-8000-000000000001';
const STAMP = '2026-10-07T00:00:00.000Z';

function hello(over = {}) {
    return {
        t: 'hello',
        you: { id: 'user', name: 'Ada', colour: 3, role: 'owner' },
        doc: { fields: { Title: 'Scout' }, revs: { Title: 1 }, seq: 1 },
        who: [{ id: 'user', name: 'Ada', colour: 3, field: null }],
        ...over,
    };
}

test('character schemas accept the contract shapes and the box limits', () => {
    assert.equal(CHARACTER_SCHEMA, 'mgt2e_character@1');
    assert.equal(characterBoxLimit('Title'), CHARACTER_LIMITS.box);
    assert.equal(characterBoxLimit('History & Background'), CHARACTER_LIMITS.history);
    assert.equal(CharacterCreate.safeParse({ name: 'Ada' }).success, true);
    assert.equal(CharacterCreate.safeParse({}).success, false);
    assert.equal(CharacterCreate.safeParse({ from: ID }).success, true);
    assert.equal(CharacterFieldSet.safeParse({ field: 'Title', value: 'x'.repeat(2000) }).success, true);
    assert.equal(CharacterFieldSet.safeParse({ field: 'Title', value: 'x'.repeat(2001) }).success, false);
    assert.equal(CharacterFieldSet.safeParse({ field: 'History & Background', value: 'x'.repeat(20000) }).success, true);
    assert.equal(CharacterFieldSet.safeParse({ field: 'History & Background', value: 'x'.repeat(20001) }).success, false);
    assert.equal(CharacterFieldSet.safeParse({ field: 'Career Survival 1', value: false }).success, true);
    assert.equal(CharacterServerMessage.safeParse(hello()).success, true);
    assert.equal(CharacterServerMessage.safeParse(hello({ you: { id: 'user', name: 'Ada', colour: 8, role: 'owner' } })).success, false);
    const broadcast = { t: 'set', field: 'Title', value: 'Ada', rev: 2, seq: 2, by: 'user' };
    assert.equal(CharacterServerMessage.safeParse(broadcast).success, true);
    assert.equal(CharacterClientMessage.safeParse(broadcast).success, false);
    assert.equal(CharacterClientMessage.safeParse({ t: 'set', id: 'c1', field: 'Title', value: 'Ada' }).success, true);
    assert.equal(CharacterClientMessage.safeParse({ t: 'focus', field: null }).success, true);
    assert.equal(CharacterClaimResult.safeParse({ characterId: ID }).success, true);
    assert.equal(CharacterInviteCreate.safeParse({
        id: 'ci_00000000-0000-4000-8000-000000000001',
        url: 'http://127.0.0.1:8807/claim/abc',
        expiresAt: STAMP,
    }).success, true);
});
