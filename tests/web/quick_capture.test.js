/**
 * DU7 (UX backlog U7): quick capture on the map. Q opens "Add a note"; Enter keeps a journal note whose
 * body mentions the selected hex and the record open in the campaign panel, read back as any note's
 * mentions are; the panel stays as it was.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { mentionsOf } from '@voyage/shared';
import { captureWhere, quickNoteBody } from '../../apps/web/src/workspace/journal/quick_note.ts';

const RECORD = 'cr_e1000000-0000-4000-8000-000000000001';
const both = { hex: { key: 'Spinward_Marches/1910', name: 'Regina' }, record: { id: RECORD, name: 'Bright Ledger' } };

test('the words, then the mentions; read back as the note\'s mentions', () => {
    const body = quickNoteBody('  Ilsa owes the  broker 2,000 ', both);
    assert.equal(body, 'Ilsa owes the broker 2,000\n\n[[hex:Spinward_Marches/1910|Regina]] [[' + RECORD + '|Bright Ledger]]');
    assert.deepEqual(mentionsOf(body), ['hex:Spinward_Marches/1910', RECORD]);
    assert.equal(captureWhere(both), 'Mentions Regina and Bright Ledger.');
});

test('nothing selected: the words alone; nothing typed: no note', () => {
    const none = { hex: null, record: null };
    assert.equal(quickNoteBody('Fuel runs low', none), 'Fuel runs low');
    assert.equal(captureWhere(none), '');
    assert.equal(quickNoteBody('   ', both), null);
});

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => fs.readFileSync(path.join(root, 'apps/web/src', rel), 'utf8');

test('Q on the map, with a campaign open; the box keeps the note and does not open the panel', () => {
    const view = read('views/MapView.vue');
    assert.match(view, /id: 'quick-note',\s+name: 'Quick note',\s+keys: \['q'\],\s+runnable: \(\) => session\.user !== null && campaign\.status === 'ready',/);
    assert.match(view, /<QuickCapture v-if="capture" :context="capture" @close="closeCapture" @open="openCaptured" \/>/);
    const box = read('workspace/QuickCapture.vue');
    assert.match(box, /placeholder="Add a note"/);
    assert.match(box, /const entry = \{ \.\.\.draftNote\(\), body \};\s+if \(!saveEntry\(entry\)\)/);
    assert.match(box, /showToast\('Note added to the journal\.', \{ action: \{ label: 'Open'/);
    assert.doesNotMatch(box, /router|atPane/, 'keeping a note opens nothing; Open in the toast asks the map view');
});
