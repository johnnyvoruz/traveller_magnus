/**
 * The track on a vessel's record page (apps/web/src/workspace/track_rows.ts, track_actions.ts,
 * TrackBlock.vue): the legs as rows of words, the fold of a long track, "Remove last leg" with
 * its undo against the store, and each command named by one control (`data-command`).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { resetCampaign } from '../../apps/web/src/campaign/commit.ts';
import { campaign, transport } from '../../apps/web/src/campaign/store.ts';
import { appendLeg, trackOf } from '../../apps/web/src/campaign/track.ts';
import { clearToasts, toasts } from '../../apps/web/src/shell/toast.ts';
import { createRecord, forgetDeleted, saveRecord } from '../../apps/web/src/workspace/actions.ts';
import { systemAnchor } from '../../apps/web/src/workspace/places.ts';
import { removeLastTrackLeg } from '../../apps/web/src/workspace/track_actions.ts';
import { TRACK_COMMANDS, TRACK_SHOWN, anchorName, legWords, shownRows, trackRows } from '../../apps/web/src/workspace/track_rows.ts';

const REGINA = 'Spinward_Marches/1910';
const FERI = 'Spinward_Marches/2005';
const A1 = systemAnchor(REGINA, 'Regina', { key: 'w1', name: 'Regina A-I' });
const A4 = systemAnchor(REGINA, 'Regina', { key: 'w4', name: 'Regina A-IV' });
const FERI_SYSTEM = systemAnchor(FERI, 'Feri', null);
const D0 = 400000;

const LEGS = [
    { from: A1, to: A1, departs: D0, arrives: D0, mode: 'docked' },
    { from: A1, to: A4, departs: D0, arrives: D0 + 10 / 24, mode: 'flight', accelG: 2 },
    { from: A4, to: FERI_SYSTEM, departs: D0 + 1, arrives: D0 + 8, mode: 'jump', note: 'Cut short to jump.' },
];

test('a leg is a row of words: the places, the dates, the mode, the G', () => {
    const rows = trackRows(LEGS, {});
    assert.deepEqual(rows.map((row) => row.n), [1, 2, 3]);
    assert.deepEqual(rows.map((row) => row.modeWords), ['Docked', 'Flight', 'Jump']);
    assert.deepEqual([rows[1].from, rows[1].to, rows[1].moves], ['Regina A-I', 'Regina A-IV', true]);
    assert.equal(rows[0].moves, false, 'a docked leg goes nowhere');
    assert.equal(rows[2].to, 'Feri system', 'a system as a whole is said as the Where block says it');
    assert.deepEqual(rows.map((row) => row.accel), ['', '2 G', '']);
    assert.match(rows[1].departs, /^\d{3}-\d{4} 00:00$/);
    assert.match(rows[1].arrives, /^\d{3}-\d{4} 10:00$/);
    assert.equal(rows[2].note, 'Cut short to jump.');
    assert.equal(legWords(rows[1]), 'Regina A-I → Regina A-IV');
    assert.equal(legWords(rows[0]), 'Docked at Regina A-I');
    assert.equal(anchorName(null, {}), 'Nowhere');
    assert.equal(anchorName({ kind: 'system', hexKey: REGINA }, {}), 'Spinward Marches 1910');
});

test('a long track shows its last legs and counts the earlier ones', () => {
    const many = Array.from({ length: TRACK_SHOWN + 3 }, (_, at) => ({ from: A1, to: A4, departs: D0 + at, arrives: D0 + at + 0.5, mode: 'flight', accelG: 1 }));
    const rows = trackRows(many, {});
    const folded = shownRows(rows, false);
    assert.equal(folded.earlier, 3);
    assert.equal(folded.rows.length, TRACK_SHOWN);
    assert.equal(folded.rows[0].n, 4, 'the numbering is the track\'s');
    assert.deepEqual(shownRows(rows, true), { rows, earlier: 0 });
    assert.equal(shownRows(rows.slice(0, TRACK_SHOWN), false).earlier, 0);
});

test('remove the last leg, and undo it, against the store', () => {
    globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
    resetCampaign();
    forgetDeleted();
    clearToasts();
    transport.schedule = () => () => {};
    campaign.universeId = 'un_test';
    campaign.status = 'ready';
    const ship = createRecord('vessel');
    saveRecord(ship, { name: 'Far Margin' });
    assert.equal(removeLastTrackLeg(ship), false, 'no track, nothing to remove');
    assert.equal(toasts.length, 0);
    for (const leg of LEGS) assert.deepEqual(appendLeg(ship, leg), { ok: true });

    assert.equal(removeLastTrackLeg(ship), true);
    assert.equal(trackOf(campaign.records[ship]).length, 2);
    assert.equal(toasts[0].message, 'Removed the last leg of Far Margin: Regina A-IV → Feri system.');
    assert.equal(toasts[0].action.label, 'Undo');
    toasts[0].action.run();
    assert.deepEqual(trackOf(campaign.records[ship]), LEGS, 'the same leg is appended again');
    resetCampaign();
    clearToasts();
});

test('each track command is named by one control of the section', () => {
    const text = fs.readFileSync(new URL('../../apps/web/src/workspace/TrackBlock.vue', import.meta.url), 'utf8');
    const named = [...text.matchAll(/data-command="([^"]+)"/g)].map((found) => found[1]).sort();
    assert.deepEqual(named, TRACK_COMMANDS.map((command) => command.id).sort());
    const ids = TRACK_COMMANDS.map((command) => command.id);
    assert.equal(new Set(ids).size, ids.length);
});
