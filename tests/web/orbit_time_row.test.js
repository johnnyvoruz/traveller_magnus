/**
 * The time row's rules (apps/web/src/orbit/time_row.ts): a scrub that crosses the campaign
 * date must not change the row's controls under the pointer (the jump-back-and-forth glitch,
 * slice_2_campaign.md "Deck plan and orbit follow-ups" 5).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { goButtonState, rowSignature, setButtonState } from '../../apps/web/src/orbit/time_row.ts';

test('the glitch: crossing the campaign day during a scrub used to add and remove a button beside the slider', () => {
    // A scrub from two days before the campaign date to two days after, a day at a time.
    const path = [false, false, true, false, false];
    const was = path.map((onCampaignDate) => rowSignature({ canSetDate: true, hasCampaignDate: true, onCampaignDate, scrubbing: false }));
    assert.deepEqual(was, ['go+set', 'go+set', '', 'go+set', 'go+set'], 'at rest the buttons come and go with the day: that is what reflowed the row mid-drag');
    const now = path.map((onCampaignDate) => rowSignature({ canSetDate: true, hasCampaignDate: true, onCampaignDate, scrubbing: true }));
    assert.deepEqual(new Set(now).size, 1, 'while scrubbing, the row keeps one shape across the crossing');
    assert.equal(now[2], 'go+set');
});

test('the way back to the campaign date: shown off the day, held while a scrub crosses it, absent with no campaign date', () => {
    assert.equal(goButtonState({ hasCampaignDate: true, onCampaignDate: false, scrubbing: false }), 'shown');
    assert.equal(goButtonState({ hasCampaignDate: true, onCampaignDate: true, scrubbing: true }), 'held');
    assert.equal(goButtonState({ hasCampaignDate: true, onCampaignDate: true, scrubbing: false }), 'absent');
    assert.equal(goButtonState({ hasCampaignDate: false, onCampaignDate: false, scrubbing: true }), 'absent');
});

test('the button is shown off the day, held unseen on the day while scrubbing, absent otherwise', () => {
    assert.equal(setButtonState({ canSetDate: true, onCampaignDate: false, scrubbing: false }), 'shown');
    assert.equal(setButtonState({ canSetDate: true, onCampaignDate: false, scrubbing: true }), 'shown');
    assert.equal(setButtonState({ canSetDate: true, onCampaignDate: true, scrubbing: true }), 'held');
    assert.equal(setButtonState({ canSetDate: true, onCampaignDate: true, scrubbing: false }), 'absent');
    assert.equal(setButtonState({ canSetDate: false, onCampaignDate: false, scrubbing: true }), 'absent', 'signed out there is no button to hold');
});
