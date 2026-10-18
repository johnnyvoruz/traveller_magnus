/**
 * Every campaign thing has an address that reads back to itself (stream N8, the parts that
 * exist): a record, an entry, the journal, the party, the characters and a character, on the
 * home map, a hex and its orbit view. The browser pass loads each one cold.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addressPane, atPane } from '../../apps/web/src/shell/pane.ts';

const RECORD = 'cr_00000000-0000-4000-8000-000000000001';
const ENTRY = 'cj_00000000-0000-4000-8000-000000000001';
const CHARACTER = 'ch_00000000-0000-4000-8000-000000000001';
const PANES = [
    { kind: 'campaign', record: null },
    { kind: 'campaign', record: RECORD },
    { kind: 'journal', entry: null },
    { kind: 'journal', entry: ENTRY },
    { kind: 'party' },
    { kind: 'characters', character: null },
    { kind: 'characters', character: CHARACTER },
    { kind: 'timeline', type: null, ship: false, row: null },
    { kind: 'timeline', type: 'vessel', ship: true, row: RECORD },
];
const PATHS = ['/', '/s/Spinward_Marches/1910', '/s/Spinward_Marches/1910/orbit'];

test('each campaign pane, written on each view, reads back as itself', () => {
    for (const path of PATHS) {
        for (const pane of PANES) {
            const at = atPane(path, { x: '1', y: '2', z: '80' }, pane);
            assert.equal(at.path, path);
            assert.deepEqual(addressPane(at.path, at.query).pane, pane, path + ' ' + JSON.stringify(pane));
            assert.equal(at.query.z, '80', 'the camera is kept');
        }
    }
});

test('moving from one campaign pane to another drops the last one\'s id', () => {
    const onRecord = atPane('/', {}, { kind: 'campaign', record: RECORD });
    const toEntry = atPane('/', onRecord.query, { kind: 'journal', entry: ENTRY });
    assert.equal(toEntry.query.record, undefined);
    assert.deepEqual(addressPane('/', toEntry.query).pane, { kind: 'journal', entry: ENTRY });
});
