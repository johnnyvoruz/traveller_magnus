/**
 * Vessels on the chart (apps/web/src/map/vessel_marks.ts).
 * Four dates of one track, and a vessel with no track.
 * placeAt puts a flight in the system left behind; these marks follow the party marker.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { placeAt } from '../../apps/web/src/campaign/place.ts';
import { vesselsOnMap } from '../../apps/web/src/map/vessel_marks.ts';
import { partyMarker } from '../../apps/web/src/workspace/party_where.ts';

const STAMP = '2026-10-06T00:00:00.000Z';
const rid = (n) => 'cr_' + String(n).padStart(8, '0') + '-0000-4000-8000-000000000000';
const REGINA = { kind: 'system', hexKey: 'Spinward_Marches/1910' };
const JEWELL = { kind: 'system', hexKey: 'Spinward_Marches/1106' };
const RHYLANOR = { kind: 'system', hexKey: 'Spinward_Marches/2716' };
const SHIP = rid(1);
const COURIER = rid(2);
const GONE = rid(3);
const LOST = rid(4);
const PERSON = rid(5);

function row(id, type, name, over = {}) {
    return {
        id,
        type,
        kind: '',
        name,
        summary: '',
        details: '',
        tags: [],
        anchor: REGINA,
        when: null,
        visibility: 'referee',
        playerNotes: null,
        sheet: null,
        status: null,
        images: null,
        provenance: null,
        rev: 1,
        createdAt: STAMP,
        updatedAt: STAMP,
        deleted: false,
        ...over,
    };
}

const track = [
    { from: REGINA, to: REGINA, departs: 10, arrives: 10, mode: 'docked' },
    { from: REGINA, to: JEWELL, departs: 10, arrives: 20, mode: 'flight' },
    { from: JEWELL, to: RHYLANOR, departs: 20, arrives: 30, mode: 'jump' },
    { from: RHYLANOR, to: RHYLANOR, departs: 30, arrives: 40, mode: 'docked' },
];

function records() {
    return {
        [SHIP]: row(SHIP, 'vessel', 'Far Margin', { status: { track } }),
        [COURIER]: row(COURIER, 'vessel', 'Courier', { anchor: JEWELL }),
        [GONE]: row(GONE, 'vessel', 'Gone', { deleted: true, anchor: RHYLANOR }),
        [LOST]: row(LOST, 'vessel', 'Lost', { anchor: null }),
        [PERSON]: row(PERSON, 'person', 'Voss', { anchor: { kind: 'record', id: SHIP } }),
    };
}

const party = { vesselId: SHIP, memberIds: [], anchor: null };

function shipAt(days) {
    return vesselsOnMap(records(), party, days).find((mark) => mark.id === SHIP);
}

test('a tracked vessel at four dates, and one with no track', () => {
    const before = shipAt(5);
    assert.equal(before.hexKey, REGINA.hexKey);
    assert.equal(before.inJump, false);
    assert.equal(before.party, true);
    assert.equal(partyMarker(party, records(), 5).hexKey, before.hexKey);

    const flight = shipAt(15);
    assert.equal(flight.hexKey, JEWELL.hexKey);
    assert.equal(flight.inJump, false);
    const dated = placeAt(SHIP, records(), 15);
    assert.equal(dated.kind, 'here');
    assert.equal(dated.anchor.hexKey, REGINA.hexKey);
    assert.notEqual(flight.hexKey, dated.anchor.hexKey);

    const jump = shipAt(25);
    assert.equal(jump.hexKey, JEWELL.hexKey);
    assert.equal(jump.inJump, true);
    assert.equal(placeAt(SHIP, records(), 25).kind, 'jump');
    const marker = partyMarker(party, records(), 25);
    assert.equal(marker.hexKey, jump.hexKey);
    assert.equal(marker.name, 'Far Margin · in jump');

    const arrived = shipAt(35);
    assert.equal(arrived.hexKey, RHYLANOR.hexKey);
    assert.equal(arrived.inJump, false);
    assert.equal(partyMarker(party, records(), 35).hexKey, arrived.hexKey);

    const marks = vesselsOnMap(records(), party, 15);
    assert.deepEqual(marks.map((mark) => mark.id), [SHIP, COURIER]);
    const courier = marks.find((mark) => mark.id === COURIER);
    assert.equal(courier.hexKey, JEWELL.hexKey);
    assert.equal(courier.party, false);
    assert.equal(courier.inJump, false);
    assert.equal(vesselsOnMap(records(), { vesselId: null, memberIds: [], anchor: null }, 15).some((mark) => mark.party), false);
});
