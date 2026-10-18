/**
 * The first-run card leaves only when a vessel has a place and the date is set.
 * An open world ticks step 1 and does not hide the card.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { newRecord } from '../../apps/web/src/workspace/records.ts';
import { systemAnchor } from '../../apps/web/src/workspace/places.ts';
import { dateIsSet, firstRunCard, firstRunCurrent, vesselHasPlace, worldIsOpen } from '../../apps/web/src/workspace/first_run.ts';

const STAMP = '2026-10-17T12:00:00.000Z';
const REGINA = 'Spinward_Marches/1910';
const id = (n) => 'cr_' + String(n).padStart(8, '0') + '-0000-4000-8000-000000000000';
const byId = (list) => Object.fromEntries(list.map((record) => [record.id, record]));

test('an open world is a four-digit hex that is not missing', () => {
    assert.equal(worldIsOpen(null), false);
    assert.equal(worldIsOpen({ hex: '', missing: false }), false);
    assert.equal(worldIsOpen({ hex: '1910', missing: true }), false);
    assert.equal(worldIsOpen({ hex: '191', missing: false }), false);
    assert.equal(worldIsOpen({ hex: '1910', missing: false }), true);
});

test('a vessel has a place only when a live vessel resolves to a system', () => {
    const loose = newRecord('vessel', id(1), STAMP, null);
    const person = newRecord('person', id(2), STAMP, systemAnchor(REGINA, 'Regina', null));
    const placed = newRecord('vessel', id(3), STAMP, systemAnchor(REGINA, 'Regina', null));
    const gone = { ...placed, id: id(4), deleted: true };
    const aboard = newRecord('vessel', id(5), STAMP, { kind: 'record', id: person.id });
    assert.equal(vesselHasPlace({}), false);
    assert.equal(vesselHasPlace(byId([loose])), false);
    assert.equal(vesselHasPlace(byId([person])), false);
    assert.equal(vesselHasPlace(byId([gone])), false);
    assert.equal(vesselHasPlace(byId([placed])), true);
    assert.equal(vesselHasPlace(byId([person, aboard])), true);
});

test('the card shows for none and for one condition, and hides when the ship and the date are both set', () => {
    const none = firstRunCard({ worldOpen: false, shipPlaced: false, dateSet: false });
    assert.deepEqual(none, { show: true, world: false, ship: false, date: false });
    assert.equal(firstRunCurrent(none), 1);

    const world = firstRunCard({ worldOpen: true, shipPlaced: false, dateSet: false });
    assert.equal(world.show, true);
    assert.equal(world.world, true);
    assert.equal(firstRunCurrent(world), 2);

    const ship = firstRunCard({ worldOpen: false, shipPlaced: true, dateSet: false });
    assert.equal(ship.show, true);
    assert.equal(firstRunCurrent(ship), 1);

    const date = firstRunCard({ worldOpen: true, shipPlaced: false, dateSet: true });
    assert.equal(date.show, true);
    assert.equal(firstRunCurrent(date), 2);

    const both = firstRunCard({ worldOpen: true, shipPlaced: true, dateSet: true });
    assert.deepEqual(both, { show: false, world: true, ship: true, date: true });

    const bothClosed = firstRunCard({ worldOpen: false, shipPlaced: true, dateSet: true });
    assert.equal(bothClosed.show, false);
    assert.equal(dateIsSet(null), false);
    assert.equal(dateIsSet({ days: 1, rev: 0 }), true);
});
