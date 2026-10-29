/**
 * AQ1. aiPartOf sorts a live record into ships, characters, or records.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { aiPartOf } from '../../apps/web/src/campaign/ai_snapshot.ts';

const settings = { party: { memberIds: ['cr_member'] } };

function record(type, extra) {
    return { type, id: 'cr_row', ...extra };
}

test('a vessel is a ship, a party member or a character sheet is a character, and the rest are records', () => {
    assert.equal(aiPartOf(record('vessel'), settings), 'ships');
    assert.equal(aiPartOf({ type: 'person', id: 'cr_member' }, settings), 'characters');
    assert.equal(aiPartOf(record('person', { sheet: { characterId: 'ch_1' } }), settings), 'characters');
    assert.equal(aiPartOf(record('person', { sheet: { schema: 'mgt2e_character@1' } }), settings), 'characters');
    assert.equal(aiPartOf(record('person', { sheet: null }), settings), 'records');
    assert.equal(aiPartOf(record('person', { sheet: [] }), settings), 'records');
    assert.equal(aiPartOf(record('note'), settings), 'records');
    assert.equal(aiPartOf(record('person'), { party: { memberIds: [] } }), 'records');
});
