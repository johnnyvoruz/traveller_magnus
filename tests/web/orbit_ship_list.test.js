/**
 * The ships in this system (K12 points 1, 2, 5; K6d): which vessels are here at a date,
 * the party's first; the track the picture places each by; the strip's words from the
 * track; the legs the strip writes; and the 100D standing (orbit/ship_marks.ts).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HOUR } from '../../apps/web/src/orbit/clock.ts';
import { bodiesAtOf, shipStanding, shipMarkOf } from '../../apps/web/src/orbit/ship_marks.ts';
import {
    ACCEL_CHOICES, bodyAnchor, earliestDeparture, flightLeg, inSystem, jumpLeg, legAt, legStart, shipsHere, shipTrack, statusWords, vesselPosition, whenWords,
} from '../../apps/web/src/orbit/ship_list.ts';
import { newRecord } from '../../apps/web/src/workspace/records.ts';
import { totalDays } from '../../apps/web/src/orbit/clock.ts';

const NOW = '2026-10-06T00:00:00.000Z';
const HERE = 'Spinward_Marches/1910';
const THERE = 'Spinward_Marches/1911';
const regina = { kind: 'system', hexKey: HERE, bodyKey: 'w2m0', locationLabel: 'Regina' };
const aiv = { kind: 'system', hexKey: HERE, bodyKey: 'w2', locationLabel: 'A-IV' };
const feri = { kind: 'system', hexKey: THERE, locationLabel: 'Feri' };
const D0 = totalDays(1105, 134);
const vessel = (id, name, over = {}) => ({ ...newRecord('vessel', 'cr_00000000-0000-4000-8000-0000000000' + id, NOW), name, ...over });
const FLIGHT = { from: regina, to: aiv, departs: D0, arrives: D0 + 10 * HOUR, mode: 'flight', accelG: 2 };
const JUMP = { from: aiv, to: feri, departs: D0 + 12 * HOUR, arrives: D0 + 12 * HOUR + 7, mode: 'jump' };
const MARGIN = vessel('01', 'Far Margin', { anchor: regina });
const RUNNER = vessel('02', 'Blue Runner', { status: { track: [FLIGHT, JUMP] } });
const ELSEWHERE = vessel('03', 'Away', { anchor: feri });
const GONE = vessel('04', 'Gone', { anchor: regina, deleted: true });
const person = { ...newRecord('person', 'cr_00000000-0000-4000-8000-000000000099', NOW), name: 'Ana', anchor: regina };
const records = Object.fromEntries([MARGIN, RUNNER, ELSEWHERE, GONE, person].map((r) => [r.id, r]));
const name = (anchor) => anchor.locationLabel || anchor.bodyKey || anchor.hexKey;

test('a vessel is where its track says, or at its anchor without one', () => {
    assert.deepEqual(vesselPosition(MARGIN, D0), regina);
    const half = vesselPosition(RUNNER, D0 + 5 * HOUR);
    assert.deepEqual(half.leg, FLIGHT);
    assert.ok(Math.abs(half.fraction - 0.5) < 1e-9);
    assert.deepEqual(vesselPosition(RUNNER, D0 + 11 * HOUR), aiv);
    assert.equal(vesselPosition(RUNNER, D0 - 1), null);
    assert.equal(inSystem(regina, HERE), true);
    assert.equal(inSystem(feri, HERE), false);
    assert.equal(inSystem({ leg: JUMP, fraction: 0.3 }, HERE), true, 'a jump leaving here is still listed');
    assert.equal(inSystem({ leg: JUMP, fraction: 0.3 }, THERE), true, 'and arriving there');
    assert.equal(inSystem(null, HERE), false);
});

test('the ships here: live vessels in this system at the date, the party first, then by name', () => {
    assert.deepEqual(shipsHere(records, RUNNER.id, HERE, D0 + 1 * HOUR).map((r) => r.name), ['Blue Runner', 'Far Margin']);
    assert.deepEqual(shipsHere(records, null, HERE, D0 + 1 * HOUR).map((r) => r.name), ['Blue Runner', 'Far Margin']);
    assert.deepEqual(shipsHere(records, MARGIN.id, HERE, D0 + 1 * HOUR).map((r) => r.name), ['Far Margin', 'Blue Runner']);
    assert.deepEqual(shipsHere(records, null, HERE, D0 - 1).map((r) => r.name), ['Far Margin'], 'before its first departure the runner is nowhere');
    assert.deepEqual(shipsHere(records, null, HERE, D0 + 30).map((r) => r.name), ['Far Margin'], 'after its jump the runner is at Feri');
    assert.deepEqual(shipsHere(records, null, THERE, D0 + 30).map((r) => r.name), ['Away', 'Blue Runner']);
});

test('the track the picture places by: the record\'s, or one docked leg at its anchor from the dawn of the clock', () => {
    const party = shipTrack(MARGIN, MARGIN.id);
    assert.equal(party.kind, 'party');
    assert.equal(party.shape, 'triangle');
    assert.deepEqual(party.legs, [{ from: regina, to: regina, departs: 0, arrives: 0, mode: 'docked' }]);
    const other = shipTrack(RUNNER, MARGIN.id);
    assert.equal(other.kind, 'vessel');
    assert.equal(other.shape, 'circle');
    assert.deepEqual(other.legs, RUNNER.status.track);
    assert.equal(shipTrack(vessel('05', 'Nowhere'), null), null);
});

test('the strip\'s words follow the leg the ship is on, or has last finished', () => {
    assert.deepEqual(statusWords(MARGIN, D0, name), { state: 'docked', text: 'Docked at Regina' });
    assert.deepEqual(statusWords(RUNNER, D0 + 5 * HOUR, name), { state: 'flight', text: 'In flight Regina → A-IV, arrives 134-1105 10:00 · 2 G' });
    assert.deepEqual(statusWords(RUNNER, D0 + 11 * HOUR, name), { state: 'docked', text: 'Docked at A-IV' });
    assert.deepEqual(statusWords(RUNNER, D0 + 13 * HOUR, name), { state: 'jump', text: 'In jump to Feri, arrives 141-1105 12:00' });
    assert.deepEqual(statusWords(RUNNER, D0 + 30, name), { state: 'docked', text: 'Docked at Feri' });
    assert.deepEqual(statusWords(vessel('06', 'Lost'), D0, name), { state: 'none', text: 'No position' });
    const orbiting = vessel('07', 'Ring', { status: { track: [{ from: regina, to: aiv, departs: D0, arrives: D0, mode: 'orbit' }] } });
    assert.deepEqual(statusWords(orbiting, D0 + 1, name), { state: 'orbit', text: 'In orbit at A-IV' });
    assert.equal(legAt([FLIGHT, JUMP], D0 - 1), null);
    assert.deepEqual(legAt([FLIGHT, JUMP], D0 + 20), JUMP);
    assert.equal(whenWords(D0 + 0.5 + 7 / (24 * 60)), '134-1105 12:07');
});

test('a flight leg from a typed duration and a chosen G; a jump leg of the hours its preview holds', () => {
    assert.deepEqual(ACCEL_CHOICES, [1, 2, 3, 4, 5, 6]);
    const leg = flightLeg(regina, aiv, D0, 10, 2);
    assert.deepEqual(leg, { from: regina, to: aiv, departs: D0, arrives: D0 + 10 * HOUR, mode: 'flight', accelG: 2 });
    assert.equal(flightLeg(regina, aiv, D0, 0, 2), null);
    assert.equal(flightLeg(regina, aiv, D0, Number.NaN, 2), null);
    assert.equal(flightLeg(regina, aiv, D0, 10, 7), null);
    assert.equal(flightLeg(null, aiv, D0, 10, 2), null);
    assert.deepEqual(jumpLeg(aiv, feri, D0, 171), { from: aiv, to: feri, departs: D0, arrives: D0 + 171 * HOUR, mode: 'jump' });
    assert.deepEqual(jumpLeg(aiv, feri, D0, 24).arrives, D0 + 1);
    assert.equal(jumpLeg(aiv, null, D0, 171), null);
    assert.equal(jumpLeg(aiv, feri, D0, 0), null);
    assert.equal(jumpLeg(aiv, feri, D0, Number.NaN), null);
    assert.deepEqual(bodyAnchor(HERE, 'w2', 'A-IV'), aiv);
    assert.deepEqual(bodyAnchor(HERE, 'w2'), { kind: 'system', hexKey: HERE, bodyKey: 'w2' });
});

test('a new leg starts where the ship is, or at the end of the leg under way, no earlier than that arrival', () => {
    assert.deepEqual(legStart(regina), regina);
    assert.deepEqual(legStart({ leg: FLIGHT, fraction: 0.5 }), aiv);
    assert.equal(legStart(null), null);
    assert.equal(earliestDeparture(regina, D0), D0);
    assert.equal(earliestDeparture({ leg: FLIGHT, fraction: 0.5 }, D0 + 5 * HOUR), FLIGHT.arrives);
    assert.equal(earliestDeparture({ leg: FLIGHT, fraction: 1 }, D0 + 20 * HOUR), D0 + 20 * HOUR);
});

test('an anchor on this picture is its body, or the mainworld; another system is not here', () => {
    const bodies = [{ key: 's0', x: 0, y: 0, main: false }, { key: 'w2', x: 100, y: 0, main: false }, { key: 'w2m0', x: 110, y: 5, main: true }];
    const at = bodiesAtOf(HERE, bodies);
    assert.deepEqual(at(regina, 0), { x: 110, y: 5 });
    assert.deepEqual(at(aiv, 0), { x: 100, y: 0 });
    assert.deepEqual(at({ kind: 'system', hexKey: HERE }, 0), { x: 110, y: 5 }, 'the system alone is its mainworld');
    assert.equal(at(feri, 0), null);
    assert.equal(at({ kind: 'system', hexKey: HERE, bodyKey: 'nope' }, 0), null);
    assert.equal(at(null, 0), null);
    assert.equal(at({ kind: 'record', id: 'cr_x' }, 0), null);
});

test('a mark is outside when it lies beyond every 100D circle and on no body', () => {
    const rings = [{ cx: 0, cy: 0, r: 50, label: '100D' }, { cx: 100, cy: 0, r: 10, label: '100D' }];
    const bodies = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 300, y: 300 }];
    assert.equal(shipStanding({ x: 0, y: 0 }, rings, bodies).outside, false);
    assert.equal(shipStanding({ x: 30, y: 30 }, rings, bodies).outside, false);
    assert.equal(shipStanding({ x: 105, y: 0 }, rings, bodies).outside, false);
    assert.equal(shipStanding({ x: 70, y: 0 }, rings, bodies).outside, true);
    assert.equal(shipStanding({ x: 300, y: 300 }, rings, bodies).outside, false, 'on a body whose ring was too small to lay out');
    assert.equal(shipStanding({ x: 300, y: 310 }, rings, bodies).outside, true);
    assert.deepEqual(shipStanding({ x: 70, y: 0 }, rings, bodies), { x: 70, y: 0, outside: true, within: null });
    assert.deepEqual(shipStanding({ x: 30, y: 30 }, rings, bodies).within, rings[0]);
    assert.equal(shipStanding({ x: 300, y: 300 }, rings, bodies).within, 'body');
});

test('a mark that is a jump bubble is not a ship on the picture', () => {
    const marks = [
        { id: 'far', x: 10, y: 10, jump: 'out' },
        { id: 'blue', x: 20, y: 20 },
        { id: 'in', x: 30, y: 30, jump: 'in' },
    ];
    assert.equal(shipMarkOf(marks, 'far'), undefined, 'leaving: nothing to measure or plot from');
    assert.equal(shipMarkOf(marks, 'in'), undefined, 'arriving: the same');
    assert.deepEqual(shipMarkOf(marks, 'blue'), { id: 'blue', x: 20, y: 20 });
    assert.equal(shipMarkOf(marks, 'nobody'), undefined);
    // A ship drawn both ways (the bubble first) is found as the ship.
    assert.deepEqual(shipMarkOf([{ id: 'far', x: 1, y: 1, jump: 'in' }, { id: 'far', x: 2, y: 2 }], 'far'), { id: 'far', x: 2, y: 2 });
});
