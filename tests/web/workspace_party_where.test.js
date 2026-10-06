/**
 * "Where are we" from the track (apps/web/src/workspace/party_where.ts) and "Move the party"
 * on a ship with a track (track_actions.ts dockShipAt): the place at a date mid-flight,
 * mid-jump and after arrival, the map's marker in each, and the docked leg accepted and
 * refused against the store.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resetCampaign } from '../../apps/web/src/campaign/commit.ts';
import { campaign, transport } from '../../apps/web/src/campaign/store.ts';
import { appendLeg, trackOf } from '../../apps/web/src/campaign/track.ts';
import { DEFAULT_START, totalDays } from '../../apps/web/src/orbit/clock.ts';
import { clearToasts, toasts } from '../../apps/web/src/shell/toast.ts';
import { createRecord, forgetDeleted, saveRecord } from '../../apps/web/src/workspace/actions.ts';
import { campaignDays, dockedLeg, moveRefusal, partyMarker, partyWhere } from '../../apps/web/src/workspace/party_where.ts';
import { systemAnchor } from '../../apps/web/src/workspace/places.ts';
import { newRecord } from '../../apps/web/src/workspace/records.ts';
import { dockShipAt } from '../../apps/web/src/workspace/track_actions.ts';

const STAMP = '2026-10-06T12:00:00.000Z';
const REGINA = 'Spinward_Marches/1910';
const FERI = 'Spinward_Marches/2005';
const A1 = systemAnchor(REGINA, 'Regina', { key: 'w0', name: 'Regina A-I' });
const A4 = systemAnchor(REGINA, 'Regina', { key: 'w4', name: 'Regina A-IV' });
const FERI_SYSTEM = systemAnchor(FERI, 'Feri', null);
const D0 = 403458;
const LEGS = [
    { from: A1, to: A4, departs: D0, arrives: D0 + 1, mode: 'flight', accelG: 2 },
    { from: A4, to: FERI_SYSTEM, departs: D0 + 2, arrives: D0 + 9, mode: 'jump' },
];
const SHIP_ID = 'cr_00000001-0000-4000-8000-000000000000';
const ship = (over = {}) => ({ ...newRecord('vessel', SHIP_ID, STAMP), name: 'Far Margin', rev: 1, anchor: A1, status: { track: LEGS }, ...over });
const PARTY = { vesselId: SHIP_ID, memberIds: [], anchor: null };

test('the campaign date: the clock, or the default start when the campaign has none', () => {
    assert.equal(campaignDays({ days: 12.5 }), 12.5);
    assert.equal(campaignDays(null), totalDays(DEFAULT_START.year, DEFAULT_START.day));
});

test('where are we: at a place, mid-flight, between legs, mid-jump and after arrival', () => {
    const records = { [SHIP_ID]: ship() };
    const flying = partyWhere(PARTY, records, D0 + 0.5);
    assert.deepEqual(flying.anchor, A4, 'a flight is in the system it is crossing');
    assert.equal(flying.underway.state, 'flight');
    assert.match(flying.underway.text, /^In flight Regina A-I → Regina A-IV, arrives \d{3}-\d{4} 00:00 · 2 G$/);

    assert.deepEqual(partyWhere(PARTY, records, D0 + 1.5), { anchor: A4, underway: null }, 'arrived, the next leg not begun');

    const jumping = partyWhere(PARTY, records, D0 + 5);
    assert.deepEqual(jumping.anchor, A4, 'in jump the ship is held at the system it left');
    assert.equal(jumping.underway.state, 'jump');
    assert.match(jumping.underway.text, /^In jump to Feri system, arrives /);

    assert.deepEqual(partyWhere(PARTY, records, D0 + 9), { anchor: FERI_SYSTEM, underway: null }, 'after arrival');

    // No track: the ship's anchor, as before. No ship: the party's own anchor.
    assert.deepEqual(partyWhere(PARTY, { [SHIP_ID]: ship({ status: null }) }, D0 + 5), { anchor: A1, underway: null });
    assert.deepEqual(partyWhere({ ...PARTY, vesselId: null, anchor: FERI_SYSTEM }, records, D0), { anchor: FERI_SYSTEM, underway: null });
});

test('the marker: the hex the party stands on, tagged in jump, absent when nowhere', () => {
    const records = { [SHIP_ID]: ship() };
    assert.deepEqual(partyMarker(PARTY, records, D0 + 0.5), { hexKey: REGINA, name: 'Far Margin' });
    assert.deepEqual(partyMarker(PARTY, records, D0 + 5), { hexKey: REGINA, name: 'Far Margin · in jump' });
    assert.deepEqual(partyMarker(PARTY, records, D0 + 9), { hexKey: FERI, name: 'Far Margin' });
    assert.equal(partyMarker({ vesselId: null, memberIds: [], anchor: null }, records, D0), null);
    assert.deepEqual(partyMarker({ vesselId: null, memberIds: [], anchor: FERI_SYSTEM }, records, D0), { hexKey: FERI, name: 'Party' });
});

test('a docked leg is refused in plain words when the track cannot take it', () => {
    assert.equal(moveRefusal('Far Margin', LEGS, D0 + 9), null, 'at the last arrival');
    assert.equal(moveRefusal('Far Margin', LEGS, D0 + 20), null);
    assert.equal(moveRefusal('Far Margin', [], D0), null);
    assert.match(moveRefusal('Far Margin', LEGS, D0 + 5), /^Far Margin is under way until \d{3}-\d{4} 00:00\. Move the campaign date to its arrival, or remove the leg on the ship’s page\.$/);
    assert.match(moveRefusal('Far Margin', LEGS, D0 + 1.5), /^Far Margin has a later leg planned, departing \d{3}-\d{4} 00:00\. Remove it on the ship’s page, or move the campaign date past its arrival\.$/);
    assert.deepEqual(dockedLeg(A4, D0), { from: A4, to: A4, departs: D0, arrives: D0, mode: 'docked' });
});

test('"Move the party" on a ship with a track, against the store: accepted, undone, refused', () => {
    globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
    resetCampaign();
    forgetDeleted();
    clearToasts();
    transport.schedule = () => () => {};
    campaign.universeId = 'un_test';
    campaign.status = 'ready';
    const id = createRecord('vessel', A1);
    saveRecord(id, { name: 'Far Margin' });
    assert.equal(dockShipAt(id, A4, D0), false, 'a ship with no track is not this function\'s');
    assert.equal(toasts.length, 0);
    for (const leg of LEGS) assert.deepEqual(appendLeg(id, leg), { ok: true });

    assert.equal(dockShipAt(id, A1, D0 + 5), false, 'under way');
    assert.match(toasts[toasts.length - 1].message, /is under way until/);
    assert.equal(dockShipAt(id, null, D0 + 10), false, 'nowhere');
    assert.match(toasts[toasts.length - 1].message, /cannot be nowhere/);
    assert.equal(trackOf(campaign.records[id]).length, 2, 'nothing was written');

    clearToasts();
    assert.equal(dockShipAt(id, A1, D0 + 10), true);
    assert.deepEqual(trackOf(campaign.records[id])[2], dockedLeg(A1, D0 + 10));
    assert.match(toasts[0].message, /^Far Margin docked at Regina A-I, \d{3}-\d{4} 00:00\.$/);
    const party = { vesselId: id, memberIds: [], anchor: null };
    assert.deepEqual(partyWhere(party, campaign.records, D0 + 10), { anchor: A1, underway: null });
    toasts[0].action.run();
    assert.equal(trackOf(campaign.records[id]).length, 2, 'undo removes the leg');
    resetCampaign();
    clearToasts();
});
