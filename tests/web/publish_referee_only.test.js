/**
 * DF18 (players question 6, answered yes 18:40): in both publish forms, a chosen record that is
 * referee-only has one line under it. Reworded 2026-10-22 (Johnny 20:08, ZB1 question 1): the line says
 * the whole record goes out (referee-only text, player notes, sheet), not only its "For players" text.
 * Not chosen, or seen by players, no line. No change to the data.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { REFEREE_ONLY_NOTE, refereeOnly } from '../../apps/web/src/workspace/market/market.ts';

test('the sentence, and which records it is for', () => {
    assert.equal(REFEREE_ONLY_NOTE, 'This record is referee-only. Publishing sends the whole record: its referee-only text, its player notes and its sheet.');
    for (const part of ['whole record', 'referee-only text', 'player notes', 'sheet']) assert.ok(REFEREE_ONLY_NOTE.includes(part), part);
    assert.ok(!REFEREE_ONLY_NOTE.includes('as it stands'), 'the old promise is gone');
    const records = { a: { visibility: 'referee' }, b: { visibility: 'players' } };
    const read = (id) => records[id];
    assert.equal(refereeOnly('a', read), true);
    assert.equal(refereeOnly('b', read), false);
    assert.equal(refereeOnly('gone', read), false);
});

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => fs.readFileSync(path.join(root, 'apps/web/src/workspace/market', rel), 'utf8');

test('the line is under a chosen record only, in both forms, and comes and goes with the tick', () => {
    assert.match(read('PublishForm.vue'), /<em v-if="!marketUi\.left\.includes\(item\.id\) && refereeOnly\(item\.id\)" class="mk-rec-note" data-referee-only>\{\{ REFEREE_ONLY_NOTE \}\}<\/em>/);
    assert.match(read('RecordsPublish.vue'), /<em v-if="picked\.has\(record\.id\) && record\.visibility === 'referee'" class="mk-rec-note" data-referee-only>\{\{ REFEREE_ONLY_NOTE \}\}<\/em>/);
    // What is sent is unchanged: the forms still send the chosen ids.
    assert.doesNotMatch(read('RecordsPublish.vue'), /visibility:/);
});
