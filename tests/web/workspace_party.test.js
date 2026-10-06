/**
 * The party (apps/web/src/workspace/party.ts and saveParty in actions.ts), the omnibox's
 * campaign group (omni_campaign.ts) and the list's "At" chip and order (records.ts).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CampaignSettings, SettingsChange } from '@voyage/shared';
import { rebuildCampaignIndex } from '../../apps/web/src/campaign/index.ts';
import { resetCampaign } from '../../apps/web/src/campaign/commit.ts';
import { campaign, transport } from '../../apps/web/src/campaign/store.ts';
import { createRecord, forgetDeleted, saveParty, saveRecord } from '../../apps/web/src/workspace/actions.ts';
import { campaignMatches, matchingRecordIds } from '../../apps/web/src/workspace/omni_campaign.ts';
import {
    EMPTY_PARTY, isAboard, partyChange, partyMembers, partyPlace, partyVessel, partyWords, resolveAnchor, sameParty, withAnchor,
    withMember, withoutMember, withVessel,
} from '../../apps/web/src/workspace/party.ts';
import { systemAnchor } from '../../apps/web/src/workspace/places.ts';
import { filterRecords, newRecord } from '../../apps/web/src/workspace/records.ts';

const STAMP = '2026-10-05T12:00:00.000Z';
const rid = (n) => 'cr_' + String(n).padStart(8, '0') + '-0000-4000-8000-000000000000';
const make = (n, type, name, over = {}) => ({ ...newRecord(type, rid(n), STAMP), name, rev: 1, ...over });
const byId = (list) => Object.fromEntries(list.map((row) => [row.id, row]));
const REGINA = 'Spinward_Marches/1910';
const ROUP = 'Spinward_Marches/2007';

const SHIP = make(1, 'vessel', 'Far Margin', { anchor: systemAnchor(ROUP, 'Roup', null) });
const VOSS = make(2, 'person', 'Captain Idris Voss', { anchor: { kind: 'record', id: SHIP.id } });
const SOL = make(3, 'person', 'Broker Hana Sol', { anchor: systemAnchor(REGINA, 'Regina', { key: 'w4m1', name: 'Regina' }), updatedAt: '2026-10-06T00:00:00.000Z' });
const GONE = make(4, 'person', 'Nobody', { deleted: true });
const BAY = make(5, 'place', 'Bay 4 Drydock', { anchor: systemAnchor(REGINA, 'Regina', null), summary: 'Where the Far Margin berths' });
const RECORDS = byId([SHIP, VOSS, SOL, GONE, BAY]);
const SETTINGS = { party: EMPTY_PARTY, kinds: {}, calendar: { dateFormat: 'imperial' }, rev: 3 };

test('the party: its vessel, its live members, and where it is', () => {
    const party = { vesselId: SHIP.id, memberIds: [VOSS.id, SOL.id, GONE.id], anchor: systemAnchor(REGINA, 'Regina', null) };
    assert.equal(partyVessel(party, RECORDS).name, 'Far Margin');
    assert.equal(partyVessel({ ...party, vesselId: VOSS.id }, RECORDS), null, 'a person is not a vessel');
    assert.deepEqual(partyMembers(party, RECORDS).map((r) => r.name), ['Captain Idris Voss', 'Broker Hana Sol']);
    // With a ship, the party is where the ship is, whatever its own anchor says.
    assert.deepEqual(partyPlace(party, RECORDS), { hexKey: ROUP, bodyKey: null, label: 'Roup' });
    assert.deepEqual(partyPlace(withVessel(party, null), RECORDS), { hexKey: REGINA, bodyKey: null, label: 'Regina' });
    assert.equal(partyPlace(EMPTY_PARTY, RECORDS), null);
    assert.deepEqual(resolveAnchor({ kind: 'record', id: VOSS.id }, RECORDS), { hexKey: ROUP, bodyKey: null, label: 'Roup' });
    assert.equal(resolveAnchor({ kind: 'record', id: GONE.id }, RECORDS), null);
    assert.equal(isAboard(VOSS, party), true);
    assert.equal(isAboard(SOL, party), false);
    assert.equal(isAboard(SOL, withVessel(party, null)), true, 'with no ship nobody is ashore');
    assert.equal(partyWords(party, RECORDS), 'Far Margin, 2 aboard');
    assert.equal(partyWords(withoutMember(party, SOL.id), RECORDS), 'Far Margin, Captain Idris Voss');
    assert.equal(partyWords(withVessel(party, null), RECORDS), '2 people, no ship');
    assert.equal(partyWords(EMPTY_PARTY, RECORDS), 'No party yet');
});

test('changing the party gives a new party; the settings change carries the whole document', () => {
    const party = EMPTY_PARTY;
    const withShip = withVessel(party, SHIP.id);
    assert.equal(withShip.vesselId, SHIP.id);
    assert.deepEqual(party, EMPTY_PARTY, 'the old one is untouched');
    const two = withMember(withMember(withShip, VOSS.id), SOL.id);
    assert.deepEqual(two.memberIds, [VOSS.id, SOL.id]);
    assert.deepEqual(withMember(two, VOSS.id).memberIds, [VOSS.id, SOL.id], 'not twice');
    assert.deepEqual(withoutMember(two, VOSS.id).memberIds, [SOL.id]);
    const moved = withAnchor(two, systemAnchor(REGINA, 'Regina', null));
    assert.equal(moved.anchor.hexKey, REGINA);
    assert.equal(sameParty(two, withMember(two, VOSS.id)), true);
    assert.equal(sameParty(two, moved), false);
    const change = partyChange(SETTINGS, moved);
    assert.equal(SettingsChange.safeParse(change).success, true);
    assert.equal(change.baseRev, 3);
    assert.equal(change.calendar.dateFormat, 'imperial');
    assert.equal(CampaignSettings.safeParse({ ...SETTINGS, party: moved }).success, true);
});

test('the omnibox group: whole words from the index, the last word as a start of a name, five at most', () => {
    rebuildCampaignIndex(RECORDS, {});
    assert.deepEqual(matchingRecordIds('voss', RECORDS), [VOSS.id]);
    assert.deepEqual(matchingRecordIds('vos', RECORDS), [VOSS.id], 'the last word may be the start of a name');
    assert.deepEqual(matchingRecordIds('far', RECORDS).sort(), [SHIP.id, BAY.id].sort(), 'the summary counts for a whole word');
    assert.deepEqual(matchingRecordIds('far margin', RECORDS).sort(), [SHIP.id, BAY.id].sort());
    assert.deepEqual(matchingRecordIds('captain idr', RECORDS), [VOSS.id]);
    assert.deepEqual(matchingRecordIds('nobody', RECORDS), [], 'deleted records are not offered');
    assert.deepEqual(matchingRecordIds('', RECORDS), []);
    const group = campaignMatches('far', RECORDS);
    assert.deepEqual(group.items.map((item) => [item.kind, item.name, item.detail]), [
        ['record', 'Bay 4 Drydock', 'Place · Spinward Marches 1910 · Regina system'],
        ['record', 'Far Margin', 'Vessel · Spinward Marches 2007 · Roup system'],
    ]);
    assert.equal(group.total, 2);
    const many = byId(Array.from({ length: 8 }, (_, i) => make(10 + i, 'note', 'Note ' + i)));
    rebuildCampaignIndex(many, {});
    const capped = campaignMatches('note', many);
    assert.equal(capped.items.length, 5);
    assert.equal(capped.total, 8);
});

test('the list at one system, and by what changed last', () => {
    const live = [SHIP, VOSS, SOL, BAY];
    const names = (filter) => filterRecords(live, filter, RECORDS).map((r) => r.name);
    assert.deepEqual(names({ type: 'all', query: '', hexKey: REGINA }), ['Bay 4 Drydock', 'Broker Hana Sol']);
    assert.deepEqual(names({ type: 'all', query: '', hexKey: ROUP }), ['Captain Idris Voss', 'Far Margin'], 'someone aboard a vessel there is there');
    assert.deepEqual(names({ type: 'person', query: '', hexKey: ROUP }), ['Captain Idris Voss']);
    assert.deepEqual(names({ type: 'all', query: '', hexKey: 'Spinward_Marches/0101' }), []);
    assert.deepEqual(names({ type: 'all', query: '', sort: 'changed' }), ['Broker Hana Sol', 'Bay 4 Drydock', 'Captain Idris Voss', 'Far Margin']);
    assert.deepEqual(names({ type: 'all', query: '' }), ['Bay 4 Drydock', 'Broker Hana Sol', 'Captain Idris Voss', 'Far Margin']);
});

test('saveParty against the store: one settings change, nothing when it is the same', () => {
    globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
    resetCampaign();
    forgetDeleted();
    transport.schedule = () => () => {};
    campaign.universeId = 'un_test';
    campaign.status = 'ready';
    campaign.settings = { ...SETTINGS, party: { ...EMPTY_PARTY } };
    const ship = createRecord('vessel', systemAnchor(ROUP, 'Roup', null));
    const voss = createRecord('person');
    saveRecord(ship, { name: 'Far Margin' });
    assert.equal(saveParty(withVessel(campaign.settings.party, ship)), true);
    assert.equal(campaign.settings.party.vesselId, ship);
    assert.equal(saveParty(withVessel(campaign.settings.party, ship)), false, 'the same party sends nothing');
    assert.equal(saveParty(withMember(campaign.settings.party, voss)), true);
    assert.deepEqual(campaign.settings.party.memberIds, [voss]);
    assert.deepEqual(partyPlace(campaign.settings.party, campaign.records), { hexKey: ROUP, bodyKey: null, label: 'Roup' });
    resetCampaign();
});
