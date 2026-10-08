/**
 * The Characters screens: list groups, share states, the claim page's four states,
 * and the stand-in's create and claim calls.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    EMPTY_ALL,
    EMPTY_MINE,
    EMPTY_SHARED,
    LINK_NOTE,
    characterGroups,
    claimFace,
    claimRefusal,
    duplicateName,
    pregenCount,
    pregenName,
    presenceTone,
    rowFace,
    shareFace,
} from '../../apps/web/src/characters/screens/model.ts';

const mine = {
    character: { id: 'ch_mine', ownerId: 'u1', name: 'Ada', summary: 'Scout\nSecond line', schema: 'mgt2e_character@1' },
    role: 'owner',
    ownerName: 'Ada Owner',
    who: [{ id: 'u2', name: 'Bo', colour: 1, field: 'Name' }],
};
const shared = {
    character: { id: 'ch_shared', ownerId: 'u9', name: '  ', summary: '', schema: 'mgt2e_character@1' },
    role: 'editor',
    ownerName: 'Referee',
};

test('the list splits mine from shared, and a row reads the first line', () => {
    const groups = characterGroups([shared, mine]);
    assert.deepEqual(groups.mine.map((row) => row.id), ['ch_mine']);
    assert.deepEqual(groups.shared.map((row) => row.id), ['ch_shared']);
    assert.deepEqual(rowFace(mine), {
        id: 'ch_mine',
        name: 'Ada',
        summary: 'Scout',
        owner: null,
        here: 'Bo',
    });
    assert.equal(rowFace(shared).name, 'Untitled character');
    assert.equal(rowFace(shared).owner, 'Referee');
    assert.equal(rowFace(shared).summary, '');
    assert.equal(EMPTY_ALL.includes('share it by a link'), true);
    assert.equal(EMPTY_MINE.length > 0, true);
    assert.equal(EMPTY_SHARED.length > 0, true);
    assert.equal(duplicateName('Ada'), 'Ada copy');
    assert.equal(pregenName('Ada', 2), 'Ada 2');
    assert.equal(pregenCount(2), 2);
    assert.equal(pregenCount(12), 12);
    assert.equal(pregenCount(1), null);
    assert.equal(pregenCount(13), null);
    assert.equal(presenceTone(0), '--signal');
    assert.equal(presenceTone(8), '--signal');
    assert.equal(presenceTone(-1), '--attention');
});

test('the share panel is the owner’s to change, and an editor’s to read', () => {
    const owner = shareFace({
        role: 'owner',
        people: [
            { userId: 'u1', name: 'Ada', role: 'owner' },
            { userId: 'u2', name: 'Bo', role: 'editor' },
        ],
        invites: [{ id: 'in_1', expiresAt: '2026-10-21T00:00:00.000Z' }],
        freshUrl: 'https://traveller.voyage/claim/tok',
    });
    assert.equal(owner.readOnly, false);
    assert.equal(owner.canInvite, true);
    assert.equal(owner.fresh && owner.fresh.note, LINK_NOTE);
    assert.equal(owner.invites.length, 1);
    assert.equal(owner.invites[0].line, 'Expires 2026-10-21');
    assert.equal(owner.people[1].remove, true);
    assert.equal(owner.people[1].own, true);
    assert.equal(owner.people[0].remove, false);
    const editor = shareFace({
        role: 'editor',
        people: [{ userId: 'u2', name: 'Bo', role: 'editor' }],
        invites: [{ id: 'in_1', expiresAt: '2026-10-21T00:00:00.000Z' }],
        freshUrl: 'https://traveller.voyage/claim/tok',
    });
    assert.equal(editor.readOnly, true);
    assert.equal(editor.canInvite, false);
    assert.equal(editor.fresh, null);
    assert.deepEqual(editor.invites, []);
    assert.equal(editor.people[0].remove, false);
    assert.equal(editor.people[0].own, false);
});

test('the claim page has four states, and a bad link says which', () => {
    assert.equal(claimFace(false, 'ready').state, 'signed-out');
    assert.equal(claimFace(true, 'ready').state, 'ready');
    assert.equal(claimFace(true, 'claimed').state, 'claimed');
    assert.equal(claimFace(true, 'used').state, 'refused');
    assert.equal(claimFace(true, 'expired').line, 'This link has expired.');
    assert.equal(claimFace(true, 'revoked').line, 'This link has been revoked.');
    assert.equal(claimFace(true, 'missing').line, 'This link cannot be used.');
    assert.equal(claimFace(false, 'used').state, 'signed-out');
    assert.equal(claimRefusal('gone', 'invite expired'), 'expired');
    assert.equal(claimRefusal('gone', 'revoked by the owner'), 'revoked');
    assert.equal(claimRefusal('conflict', 'already used'), 'used');
    assert.equal(claimRefusal('not_found', 'no such link'), 'missing');
});
