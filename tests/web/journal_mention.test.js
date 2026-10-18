import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { test } from 'node:test';
import { mentionsOf } from '@voyage/shared';
import { filterMentions, mentionBackspace, mentionQuery, mentionToken } from '../../apps/web/src/workspace/journal/mention.ts';

const ID = 'cr_22222222-2222-4222-8222-222222222222';

function record(patch) {
    return {
        id: ID,
        name: 'Captain Voss',
        summary: '',
        tags: [],
        type: 'person',
        deleted: false,
        ...patch,
    };
}

test('@ opens at the start of a word and not inside an email', () => {
    assert.deepEqual(mentionQuery('@', 1), { start: 0, query: '' });
    assert.deepEqual(mentionQuery('See @Vo', 7), { start: 4, query: 'Vo' });
    assert.deepEqual(mentionQuery('See\n@Vo', 7), { start: 4, query: 'Vo' });
    assert.equal(mentionQuery('pilot@regina.test', 15), null);
    assert.equal(mentionQuery('See @Vo today', 12), null);
    assert.equal(mentionQuery('No at sign', 10), null);
});

test('the inserted token is the one mentionsOf parses, and Backspace takes the whole token', () => {
    const token = mentionToken(ID, 'Captain Voss');
    assert.equal(token, '[[' + ID + '|Captain Voss]]');
    const body = 'See ' + token + ' today';
    assert.deepEqual(mentionsOf(body), [ID]);
    const caret = ('See ' + token + ' ').length;
    assert.deepEqual(mentionBackspace('See ' + token + ' ', caret), { from: 4, to: caret });
    assert.equal(mentionBackspace('See ' + token + ' today', caret + 3), null);
    assert.equal(mentionToken(ID, 'A] B|C'), '[[' + ID + '|A BC]]');
});

test('two thousand records filter inside one frame', () => {
    const records = {};
    for (let i = 0; i < 2000; i++) {
        const n = String(i).padStart(4, '0');
        records['cr_' + n] = record({
            id: 'cr_' + n,
            name: 'Person ' + n,
            summary: i === 1999 ? 'the courier' : '',
            tags: i === 50 ? ['courier'] : [],
        });
    }
    // One run warms the engine; the best of five is the filter's own time, not the machine's load
    // (the whole suite runs files side by side).
    let hits = filterMentions(records, 'courier');
    let elapsed = Infinity;
    for (let run = 0; run < 5; run++) {
        const started = performance.now();
        hits = filterMentions(records, 'courier');
        elapsed = Math.min(elapsed, performance.now() - started);
    }
    assert.ok(elapsed < 50, 'filter took ' + elapsed.toFixed(1) + ' ms');
    assert.deepEqual(hits.map((hit) => hit.name), ['Person 0050', 'Person 1999']);
    assert.equal(filterMentions(records, '').length, 8);
    assert.equal(filterMentions({}, '').length, 0);
    records[ID] = record({ deleted: true, name: 'Gone' });
    assert.equal(filterMentions({ [ID]: records[ID] }, '').length, 0);
});
