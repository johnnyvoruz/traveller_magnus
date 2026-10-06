/**
 * The time row's rules (apps/web/src/orbit/time_row.ts): a scrub that crosses the campaign
 * date must not change the row's controls under the pointer (the jump-back-and-forth glitch,
 * slice_2_campaign.md "Deck plan and orbit follow-ups" 5).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { headerSignature, resetState, rowSignature, setButtonState } from '../../apps/web/src/orbit/time_row.ts';

test('the glitch: crossing the campaign day during a scrub used to add and remove a button beside the slider', () => {
    // A scrub from two days before the campaign date to two days after, a day at a time.
    const path = [false, false, true, false, false];
    const was = path.map((onCampaignDate) => rowSignature({ canSetDate: true, hasCampaignDate: true, onCampaignDate, scrubbing: false }));
    assert.deepEqual(was, ['set', 'set', '', 'set', 'set'], 'at rest the button comes and goes with the day: that is what reflowed the row mid-drag');
    const now = path.map((onCampaignDate) => rowSignature({ canSetDate: true, hasCampaignDate: true, onCampaignDate, scrubbing: true }));
    assert.deepEqual(new Set(now).size, 1, 'while scrubbing, the row keeps one shape across the crossing');
    assert.equal(now[2], 'set');
});

test('the reset before Play: live off the campaign date, quiet on it, absent with none; the header keeps one shape', () => {
    assert.equal(resetState({ hasCampaignDate: true, onCampaignDate: false }), 'live');
    assert.equal(resetState({ hasCampaignDate: true, onCampaignDate: true }), 'quiet');
    assert.equal(resetState({ hasCampaignDate: false, onCampaignDate: false }), 'absent');
    // A scrub across the campaign date, at rest and held: the header's controls never change.
    const shapes = [];
    for (const scrubbing of [false, true]) for (const onCampaignDate of [false, false, true, false]) shapes.push(headerSignature({ hasCampaignDate: true, onCampaignDate, scrubbing }));
    assert.deepEqual(new Set(shapes).size, 1);
    assert.equal(shapes[0], 'reset+play+readout');
    assert.equal(headerSignature({ hasCampaignDate: false, onCampaignDate: false, scrubbing: false }), 'play+readout', 'no campaign: no reset, and its place is not held');
});

test('the button is shown off the day, held unseen on the day while scrubbing, absent otherwise', () => {
    assert.equal(setButtonState({ canSetDate: true, onCampaignDate: false, scrubbing: false }), 'shown');
    assert.equal(setButtonState({ canSetDate: true, onCampaignDate: false, scrubbing: true }), 'shown');
    assert.equal(setButtonState({ canSetDate: true, onCampaignDate: true, scrubbing: true }), 'held');
    assert.equal(setButtonState({ canSetDate: true, onCampaignDate: true, scrubbing: false }), 'absent');
    assert.equal(setButtonState({ canSetDate: false, onCampaignDate: false, scrubbing: true }), 'absent', 'signed out there is no button to hold');
});
