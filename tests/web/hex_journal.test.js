/**
 * A system's dossier lists the journal entries that mention it or are set at it (stream N1):
 * each once, in the journal's date order, with why it is listed; hidden when there are none.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { entriesAtHex, entriesByDate, entriesMentioning, rebuildJournalIndex } from '../../apps/web/src/campaign/journal.ts';
import { hexJournalRows, hexTarget, whyWords } from '../../apps/web/src/workspace/hex_journal.ts';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (file) => fs.readFileSync(path.join(root, 'apps/web/src/workspace', file), 'utf8');

const REGINA = 'Spinward_Marches/1910';
const regina = { kind: 'system', hexKey: REGINA, locationLabel: 'Regina' };

function entry(n, over = {}) {
    return {
        id: `cj_00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
        kind: 'note', title: 'Note ' + n, body: '', when: null, realDate: null, sequence: null,
        author: 'referee', visibility: 'referee', anchor: null, mentions: [], images: null, rev: 1,
        createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', deleted: false,
        ...over,
    };
}

function rowsFor(hexKey) {
    const mentioning = new Set(entriesMentioning(hexTarget(hexKey)).map((e) => e.id));
    const here = new Set(entriesAtHex(hexKey).map((e) => e.id));
    return hexJournalRows(entriesByDate(), mentioning, here);
}

test('entries that mention the system or are set there, each once, newest first', () => {
    const named = entry(1, { title: 'Rumours of Regina', when: { year: 1105, day: 40 }, mentions: [hexTarget(REGINA)] });
    const setHere = entry(2, { kind: 'session', sequence: 1, title: 'Arrival', when: { year: 1105, day: 14 }, anchor: regina });
    const both = entry(3, { kind: 'session', sequence: 2, title: 'Back at Regina', when: { year: 1105, day: 90 }, anchor: regina, mentions: [hexTarget(REGINA)] });
    const undated = entry(4, { title: 'Loose', mentions: [hexTarget(REGINA)] });
    const elsewhere = entry(5, { when: { year: 1105, day: 99 }, mentions: [hexTarget('Spinward_Marches/1705')] });
    const gone = entry(6, { deleted: true, when: { year: 1106, day: 1 }, mentions: [hexTarget(REGINA)] });
    const entries = Object.fromEntries([named, setHere, both, undated, elsewhere, gone].map((e) => [e.id, e]));
    rebuildJournalIndex(entries, {}, null);

    const rows = rowsFor(REGINA);
    assert.deepEqual(rows.map((row) => row.id), [both.id, named.id, setHere.id, undated.id]);
    assert.deepEqual(rows.map((row) => row.why), ['both', 'mentions', 'here', 'mentions']);
    assert.equal(rows[0].date, '090-1105');
    assert.equal(rows[3].date, null);
    assert.equal(whyWords('mentions'), 'Mentions this system');
    assert.equal(whyWords('here'), 'Set here');
    assert.deepEqual(rowsFor('Spinward_Marches/0101'), [], 'a system nobody wrote about lists nothing');
});

test('the dossier mounts it under the records, hidden when empty, each row a link to its entry', () => {
    const here = read('RecordsHere.vue');
    const view = read('JournalHere.vue');
    assert.match(here, /<JournalHere :hex-key="hexKey" :on-world="bodyKey !== null" \/>/);
    assert.match(view, /<section v-if="rows\.length"/);
    assert.match(view, /if \(!session\.user \|\| campaign\.status !== 'ready'\) return \[\];/);
    assert.match(view, /kind: 'journal', entry: entryId/);
});
