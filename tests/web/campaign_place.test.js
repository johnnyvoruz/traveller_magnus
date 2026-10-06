import assert from 'node:assert/strict';
import { test } from 'node:test';
import { rebuildCampaignIndex, recordsAtBody, recordsAtHex } from '../../apps/web/src/campaign/index.ts';
import { placeAt } from '../../apps/web/src/campaign/place.ts';
import { positionAt, whereAreWe } from '../../apps/web/src/campaign/track.ts';

const VESSEL = 'cr_11111111-1111-1111-1111-111111111111';
const PERSON = 'cr_22222222-2222-2222-2222-222222222222';
const OTHER = 'cr_33333333-3333-3333-3333-333333333333';
const STAMP = '2026-10-06T00:00:00.000Z';
const REGINA = { kind: 'system', hexKey: 'Spinward_Marches/1910', bodyKey: 'w0' };
const JEWELL = { kind: 'system', hexKey: 'Spinward_Marches/1106', bodyKey: 'w3' };

function row(over) {
    return {
        id: VESSEL,
        type: 'vessel',
        kind: '',
        name: 'Far Margin',
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

function legs() {
    return [
        { from: REGINA, to: REGINA, departs: 10, arrives: 20, mode: 'docked' },
        { from: REGINA, to: REGINA, departs: 20, arrives: 30, mode: 'flight' },
        { from: REGINA, to: JEWELL, departs: 30, arrives: 37, mode: 'jump' },
        { from: JEWELL, to: JEWELL, departs: 37, arrives: 50, mode: 'orbit' },
    ];
}

function aboard(track) {
    const ship = row({ status: { track } });
    const person = row({
        id: PERSON,
        type: 'person',
        name: 'Voss',
        anchor: { kind: 'record', id: VESSEL },
        status: null,
    });
    return { [VESSEL]: ship, [PERSON]: person };
}

function idsAt(records, days, hex) {
    rebuildCampaignIndex(records, {}, days);
    return recordsAtHex(hex);
}

test('a person aboard follows the ship: anchor, flight, jump, arrival, and a moved date', () => {
    const track = legs();
    const records = aboard(track);
    const party = { vesselId: VESSEL, anchor: null };

    assert.equal(positionAt(track, 5), null);
    assert.deepEqual(whereAreWe(party, records, 5), REGINA);
    assert.deepEqual(placeAt(PERSON, records, 5), { kind: 'here', anchor: REGINA });
    assert.deepEqual(idsAt(records, 5, REGINA.hexKey), [VESSEL, PERSON]);
    assert.deepEqual(recordsAtBody(REGINA.bodyKey), [VESSEL, PERSON]);

    const flight = placeAt(PERSON, records, 25);
    assert.equal(flight.kind, 'here');
    assert.equal(flight.anchor.hexKey, REGINA.hexKey);
    assert.equal(flight.anchor.bodyKey, undefined);
    assert.deepEqual(whereAreWe(party, records, 25), positionAt(track, 25));
    assert.deepEqual(idsAt(records, 25, REGINA.hexKey), [VESSEL, PERSON]);
    assert.deepEqual(recordsAtBody(REGINA.bodyKey), []);
    assert.deepEqual(recordsAtHex(JEWELL.hexKey), []);

    const jump = placeAt(PERSON, records, 33.5);
    assert.deepEqual(jump, { kind: 'jump', from: REGINA, to: JEWELL, arrives: 37 });
    assert.deepEqual(idsAt(records, 33.5, REGINA.hexKey), []);
    assert.deepEqual(recordsAtHex(JEWELL.hexKey), []);
    assert.deepEqual(recordsAtBody(JEWELL.bodyKey), []);

    assert.deepEqual(placeAt(PERSON, records, 40), { kind: 'here', anchor: JEWELL });
    assert.deepEqual(idsAt(records, 40, JEWELL.hexKey), [VESSEL, PERSON]);
    assert.deepEqual(recordsAtBody(JEWELL.bodyKey), [VESSEL, PERSON]);
    assert.deepEqual(recordsAtHex(REGINA.hexKey), []);

    assert.deepEqual(idsAt(records, 5, REGINA.hexKey), [VESSEL, PERSON]);
});

test('with no campaign date, an emptied track, or a cycle, the place is the anchor chain', () => {
    const records = aboard(legs());
    assert.deepEqual(placeAt(PERSON, records, null), { kind: 'here', anchor: REGINA });
    rebuildCampaignIndex(records, {}, null);
    assert.deepEqual(recordsAtHex(REGINA.hexKey), [VESSEL, PERSON]);
    assert.deepEqual(recordsAtBody(REGINA.bodyKey), [VESSEL, PERSON]);

    const emptied = aboard([]);
    assert.deepEqual(placeAt(PERSON, emptied, 33.5), { kind: 'here', anchor: REGINA });
    assert.deepEqual(whereAreWe({ vesselId: VESSEL, anchor: null }, emptied, 33.5), REGINA);
    rebuildCampaignIndex(emptied, {}, 33.5);
    assert.deepEqual(recordsAtHex(REGINA.hexKey), [VESSEL, PERSON]);

    const cycle = {
        [VESSEL]: row({ anchor: { kind: 'record', id: OTHER } }),
        [OTHER]: row({ id: OTHER, type: 'person', name: 'Other', anchor: { kind: 'record', id: VESSEL } }),
    };
    assert.equal(placeAt(VESSEL, cycle, 15), null);
    assert.equal(placeAt(OTHER, cycle, null), null);
    rebuildCampaignIndex(cycle, {}, 15);
    assert.deepEqual(recordsAtHex(REGINA.hexKey), []);
});

const POINT = { kind: 'system', hexKey: 'Spinward_Marches/1910', point: { x: 1.2, y: 0.8 }, locationLabel: '1.44 AU' };

test('a record at a point is in that system and at no body', () => {
    const ship = row({ anchor: POINT, status: null });
    const person = row({
        id: PERSON,
        type: 'person',
        name: 'Voss',
        anchor: { kind: 'record', id: VESSEL },
        status: null,
    });
    const records = { [VESSEL]: ship, [PERSON]: person };
    assert.deepEqual(placeAt(VESSEL, records, 10), { kind: 'here', anchor: POINT });
    assert.deepEqual(placeAt(PERSON, records, null), { kind: 'here', anchor: POINT });
    assert.deepEqual(whereAreWe({ vesselId: VESSEL, anchor: null }, records, 10), POINT);
    assert.deepEqual(whereAreWe({ vesselId: null, anchor: POINT }, {}, 10), POINT);
    rebuildCampaignIndex(records, {}, 10);
    assert.deepEqual(recordsAtHex(POINT.hexKey), [VESSEL, PERSON]);
    assert.deepEqual(recordsAtBody('w0'), []);

    const orbit = [{ from: POINT, to: POINT, departs: 0, arrives: 20, mode: 'orbit' }];
    const moving = { [VESSEL]: row({ anchor: REGINA, status: { track: orbit } }), [PERSON]: person };
    assert.deepEqual(placeAt(PERSON, moving, 10), { kind: 'here', anchor: POINT });
    assert.deepEqual(whereAreWe({ vesselId: VESSEL, anchor: null }, moving, 10), POINT);
    rebuildCampaignIndex(moving, {}, 10);
    assert.deepEqual(recordsAtHex(POINT.hexKey), [VESSEL, PERSON]);
    assert.deepEqual(recordsAtBody(REGINA.bodyKey), []);
});
