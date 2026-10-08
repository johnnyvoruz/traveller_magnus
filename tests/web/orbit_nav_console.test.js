/**
 * The ship's nav console (follow-up 29; findings/orbit_nav_console_design.md): the one rule
 * for a press on the picture (a ship under it is always that ship), the live plotter's
 * reading, and the thrust offered when a ship is taken in hand.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HOUR } from '../../apps/web/src/orbit/clock.ts';
import { appendedTail, editedTail, lastThrust, movedWaypoint, onwardLegs, routeFixed, routePreview, samePlace, storedRoute } from '../../apps/web/src/orbit/course.ts';
import { layingContinues, pressMeans, sameHover } from '../../apps/web/src/orbit/ship_marks.ts';
import { shipAt } from '../../apps/web/src/orbit/ships.ts';

test('a press on a ship is always that ship: in or out of plotting, over a body or beside one', () => {
    for (const plotting of [false, true]) {
        assert.deepEqual(pressMeans({ ship: 'cr_a', body: null, beside: null, plotting }), { kind: 'ship', id: 'cr_a' });
        // A docked ship's designator stands on its body's disc, and inside the snap of it.
        assert.deepEqual(pressMeans({ ship: 'cr_a', body: 'w11', beside: null, plotting }), { kind: 'ship', id: 'cr_a' });
        assert.deepEqual(pressMeans({ ship: 'cr_a', body: null, beside: 'w11', plotting }), { kind: 'ship', id: 'cr_a' });
    }
});

test('with no ship under it, plotting decides: a waypoint or a point while plotting, a selection or nothing otherwise', () => {
    assert.deepEqual(pressMeans({ ship: null, body: 'w3', beside: null, plotting: true }), { kind: 'waypoint', key: 'w3' });
    assert.deepEqual(pressMeans({ ship: null, body: null, beside: 'w3', plotting: true }), { kind: 'waypoint', key: 'w3' });
    assert.deepEqual(pressMeans({ ship: null, body: null, beside: null, plotting: true }), { kind: 'point' });
    assert.deepEqual(pressMeans({ ship: null, body: 'w3', beside: null, plotting: false }), { kind: 'body', key: 'w3' });
    // Out of plotting the snap means nothing: a press beside a body is open picture.
    assert.deepEqual(pressMeans({ ship: null, body: null, beside: 'w3', plotting: false }), { kind: 'nothing' });
    assert.deepEqual(pressMeans({ ship: null, body: null, beside: null, plotting: false }), { kind: 'nothing' });
});

test('an existing waypoint is picked up before plotting can lay another point on it', () => {
    const waypoint = { from: 'route', index: 2 };
    assert.deepEqual(pressMeans({ ship: 'cr_a', body: 'w3', beside: null, plotting: true, waypoint }), { kind: 'ship', id: 'cr_a' });
    assert.deepEqual(pressMeans({ ship: null, body: 'w3', beside: null, plotting: true, waypoint }), { kind: 'grab', from: 'route', index: 2 });
    assert.deepEqual(pressMeans({ ship: null, body: null, beside: null, plotting: false, waypoint: { from: 'preview', index: 0 } }), { kind: 'grab', from: 'preview', index: 0 });
    assert.deepEqual(pressMeans({ ship: null, body: 'w3', beside: null, plotting: true, waypoint: null }), { kind: 'waypoint', key: 'w3' });
});

test('laying ends on a body and on a right-click, and open space keeps laying', () => {
    assert.equal(layingContinues('space'), true);
    assert.equal(layingContinues('body'), false);
    assert.equal(layingContinues('right'), false);
});

test('the rule on real marks: a press at a designator finds the ship whatever the mode', () => {
    const marks = [
        { id: 'cr_far', name: 'Far Margin', kind: 'party', shape: 'triangle', x: 400, y: 300 },
        { id: 'cr_blue', name: 'Blue Runner', kind: 'ship', shape: 'circle', x: 420, y: 320 },
    ];
    for (const plotting of [false, true]) {
        const at = { x: 421, y: 319 };
        const means = pressMeans({ ship: shipAt(marks, at), body: 'w11', beside: null, plotting });
        assert.deepEqual(means, { kind: 'ship', id: 'cr_blue' });
    }
    const away = pressMeans({ ship: shipAt(marks, { x: 100, y: 100 }), body: null, beside: null, plotting: true });
    assert.deepEqual(away, { kind: 'point' });
});

test('the plotter says a place once: the same body, ship, blank or point is not a new reading', () => {
    assert.ok(sameHover(null, null));
    assert.ok(!sameHover(null, { blank: true }));
    assert.ok(sameHover({ key: 'w3' }, { key: 'w3' }));
    assert.ok(!sameHover({ key: 'w3' }, { key: 'w4' }));
    assert.ok(!sameHover({ key: 'w3' }, { ship: 'w3' }));
    assert.ok(sameHover({ ship: 'cr_a' }, { ship: 'cr_a' }));
    assert.ok(sameHover({ blank: true }, { blank: true }));
    assert.ok(sameHover({ grab: { from: 'route', index: 1 } }, { grab: { from: 'route', index: 1 } }));
    assert.ok(!sameHover({ grab: { from: 'route', index: 1 } }, { grab: { from: 'preview', index: 1 } }));
    assert.ok(!sameHover({ grab: { from: 'route', index: 1 } }, { key: 'w3' }));
    assert.ok(sameHover({ point: { x: 1, y: 2 } }, { point: { x: 1, y: 2 } }));
    assert.ok(!sameHover({ point: { x: 1, y: 2 } }, { point: { x: 1, y: 2.5 } }));
    assert.ok(!sameHover({ point: { x: 1, y: 2 } }, { key: 'w3' }));
});

test('the thrust offered is the last flight leg flown; a ship that never flew one is offered none', () => {
    assert.equal(lastThrust(null), null);
    assert.equal(lastThrust([]), null);
    assert.equal(lastThrust([{ mode: 'jump' }, { mode: 'orbit' }]), null);
    assert.equal(lastThrust([{ mode: 'flight', accelG: 2 }, { mode: 'flight', accelG: 4 }, { mode: 'jump' }]), 4);
    // A flight leg written without a thrust (the hours were the referee's) offers nothing of its own.
    assert.equal(lastThrust([{ mode: 'flight', accelG: 3 }, { mode: 'flight' }]), 3);
});

// ---- The stored route (section 0c) ----

const HEX = 'Spinward_Marches/1910';
const at = (bodyKey) => ({ kind: 'system', hexKey: HEX, bodyKey, locationLabel: bodyKey.toUpperCase() });
const spot = (x, y) => ({ kind: 'system', hexKey: HEX, point: { x, y }, locationLabel: 'a point' });
const end = (anchor) => (!anchor || anchor.kind !== 'system' || anchor.hexKey !== HEX ? null : anchor.bodyKey ?? (anchor.point ? { x: anchor.point.x, y: anchor.point.y } : null));
const name = (anchor) => anchor.locationLabel;
const flight = (from, to, departs, arrives, accelG = 2) => ({ from, to, departs, arrives, mode: 'flight', accelG });
// A flat world for the sums: bodies on a line, 1,000,000 km apart, never moving.
const X = { w1: 0, w2: 1e6, w3: 2e6, w4: 3e6, w9: 1e10 };
const distance = (a, _aDays, b) => (typeof a === 'string' && typeof b === 'string' ? Math.abs(X[a] - X[b]) : 5e5);
const TRACK = [
    flight(at('w1'), at('w2'), 100, 101),
    flight(at('w2'), at('w3'), 101.5, 102.5),
    flight(at('w3'), spot(1, 1), 102.5, 103.5),
    flight(spot(1, 1), at('w4'), 104, 105),
];

test('a route is the flight legs on this picture from the date on; the leg under way is history', () => {
    const before = storedRoute(TRACK, 99, end);
    assert.deepEqual([before.first, before.legs.length, before.underway, before.after.length, routeFixed(before)], [0, 4, false, 0, 0]);
    const during = storedRoute(TRACK, 100.5, end);
    assert.deepEqual([during.first, during.legs.length, during.underway, routeFixed(during)], [0, 4, true, 1]);
    const later = storedRoute(TRACK, 103, end);
    assert.deepEqual([later.first, later.legs.length, later.underway], [2, 2, true]);
    const done = storedRoute(TRACK, 106, end);
    assert.deepEqual([done.first, done.legs.length, done.after.length], [4, 0, 0]);
    assert.deepEqual(storedRoute(null, 1, end).legs, []);
});

test('a leg is under way only once the date has passed its departure: at the instant it can still be picked up', () => {
    const SECOND = 1 / 86400;
    const before = storedRoute(TRACK, 100 - SECOND, end);
    assert.deepEqual([before.underway, routeFixed(before)], [false, 0]);
    const instant = storedRoute(TRACK, 100, end);
    assert.deepEqual([instant.first, instant.legs.length, instant.underway, routeFixed(instant)], [0, 4, false, 0]);
    assert.ok(editedTail(instant, 0, { remove: true }, 2, distance, end, name), 'the first waypoint of a course just added');
    const after = storedRoute(TRACK, 100 + SECOND, end);
    assert.deepEqual([after.underway, routeFixed(after)], [true, 1]);
    assert.equal(editedTail(after, 0, { remove: true }, 2, distance, end, name), null);
    // A later leg, the same: leg 2 departs at 101.5.
    assert.equal(storedRoute(TRACK, 101.5, end).underway, false);
    assert.equal(storedRoute(TRACK, 101.5 + SECOND, end).underway, true);
});

// ---- A route with a jump after it (d_nav_console_2.md section 4) ----
const AWAY = { kind: 'system', hexKey: 'Spinward_Marches/1810', locationLabel: 'Roup' };
const there = { kind: 'system', hexKey: 'Spinward_Marches/1810', bodyKey: 'w2', locationLabel: 'Roup II' };
const JUMP = { from: at('w3'), to: AWAY, departs: 103, arrives: 103 + 171 / 24, mode: 'jump', note: 'rolled 171 h' };
const BEYOND = { from: AWAY, to: there, departs: 111, arrives: 112, mode: 'flight', accelG: 1 };
const JUMPED = [...TRACK.slice(0, 2), JUMP, BEYOND];
const hoursOf = (leg) => Math.round((leg.arrives - leg.departs) * 24 * 3600) / 3600;

test('a jump or a leg to another system ends the route; it and what follows are kept beside it, and the route can still be edited', () => {
    const route = storedRoute(JUMPED, 99, end);
    assert.deepEqual([route.legs.length, route.after.length, routeFixed(route)], [2, 2, 0]);
    assert.ok(editedTail(route, 1, { remove: true }, 2, distance, end, name));
    // In jump now: nothing of it is a route here; the jump is what follows.
    const inJump = storedRoute([JUMP, flight(at('w1'), at('w2'), 111, 112)], 105, end);
    assert.deepEqual([inJump.legs.length, inJump.after.length], [0, 2]);
});

test('the last waypoint before a jump moved later or earlier: the jump and the leg beyond move by the same amount and keep their hours', () => {
    const route = storedRoute(JUMPED, 99, end);
    // Later: w9 is far enough that the leg to it, at 2 G, takes longer than the stored day.
    for (const to of ['w9']) {
        const tail = editedTail(route, 1, { move: { to, name: to, anchor: at(to), typed: null, own: false } }, 2, distance, end, name);
        const delta = tail.legs[0].arrives - 102.5;
        assert.ok(delta > 0, 'a longer leg ends later');
        assert.deepEqual(tail.all.length, 3);
        const [leg, jump, beyond] = tail.all;
        assert.deepEqual(leg.to, at(to));
        assert.deepEqual(jump.from, at(to), 'the jump departs from where the route now ends');
        assert.deepEqual([jump.to, jump.mode, jump.note], [AWAY, 'jump', 'rolled 171 h']);
        assert.ok(Math.abs(jump.departs - (103 + delta)) < 1e-9 && Math.abs(jump.arrives - (JUMP.arrives + delta)) < 1e-9);
        assert.equal(hoursOf(jump), 171, 'its duration is still the roll, to the hour');
        assert.ok(Math.abs(beyond.departs - (111 + delta)) < 1e-9);
        assert.equal(hoursOf(beyond), 24);
        assert.deepEqual([beyond.from, beyond.to, beyond.accelG], [AWAY, there, 1]);
    }
    // Earlier: a slow stored leg (a whole day for 1,000,000 km) re-timed at 6 G ends sooner.
    const sooner = editedTail(route, 1, { move: { to: 'w1', name: 'W1', anchor: at('w1'), typed: null, own: false } }, 6, distance, end, name);
    const delta = sooner.legs[0].arrives - 102.5;
    assert.ok(delta < 0, 'a quicker leg ends earlier');
    assert.ok(Math.abs(sooner.all[1].departs - (103 + delta)) < 1e-9);
    assert.equal(hoursOf(sooner.all[1]), 171);
    assert.ok(sooner.all[1].departs >= sooner.all[0].arrives, 'still in time order: the wait before the jump is kept');
});

test('a waypoint removed before a jump: the jump leaves from the place before, moved in time; with every waypoint gone it leaves from where the route set out', () => {
    const route = storedRoute(JUMPED, 99, end);
    const tail = editedTail(route, 1, { remove: true }, 2, distance, end, name);
    assert.deepEqual([tail.index, tail.legs.length, tail.all.length], [1, 0, 2]);
    assert.deepEqual(tail.all[0].from, at('w2'));
    // The route used to end at 102.5 and now ends at 101 (the leg before): everything after is 1.5 days sooner.
    assert.ok(Math.abs(tail.all[0].departs - 101.5) < 1e-9 && Math.abs(tail.all[1].departs - 109.5) < 1e-9);
    assert.equal(hoursOf(tail.all[0]), 171);
    const all = editedTail(route, 0, { remove: true }, 2, distance, end, name);
    assert.deepEqual(all.legs.map((leg) => leg.to.bodyKey), ['w3']);
    const none = editedTail(storedRoute([TRACK[0], JUMP, BEYOND], 99, end), 0, { remove: true }, 2, distance, end, name);
    assert.deepEqual([none.index, none.legs.length, none.all.length], [0, 0, 2]);
    assert.deepEqual(none.all[0].from, at('w1'));
    assert.ok(Math.abs(none.all[0].departs - (103 - 1)) < 1e-9, 'the route ended at 101 and now ends where it set out, at 100');
});

test('new legs laid before a jump: the jump follows their end; with no route before it, it waits when they fit and moves by the overrun when they do not', () => {
    const route = storedRoute(JUMPED, 99, end);
    const added = appendedTail(route, [flight(at('w3'), at('w4'), 102.5, 104.5)]);
    assert.equal(added.index, 2);
    assert.deepEqual(added.all.map((leg) => leg.mode), ['flight', 'jump', 'flight']);
    assert.deepEqual(added.all[1].from, at('w4'));
    assert.ok(Math.abs(added.all[1].departs - 105) < 1e-9, 'two days later, as the route now ends two days later');
    const bare = storedRoute([JUMP, BEYOND], 99, end);
    assert.deepEqual([bare.legs.length, bare.after.length], [0, 2]);
    const fits = appendedTail(bare, [flight(at('w3'), at('w4'), 99, 100)]);
    assert.deepEqual([fits.index, fits.all[1].departs, fits.all[1].from], [0, 103, at('w4')]);
    const over = appendedTail(bare, [flight(at('w3'), at('w4'), 99, 104)]);
    assert.ok(Math.abs(over.all[1].departs - 104) < 1e-9 && Math.abs(over.all[2].departs - 112) < 1e-9);
    assert.equal(hoursOf(over.all[1]), 171);
});

test('with nothing after the route, nothing is added to what is written', () => {
    const route = storedRoute(TRACK, 99, end);
    const tail = editedTail(route, 3, { remove: true }, 2, distance, end, name);
    assert.deepEqual([tail.after, tail.all], [[], []]);
    assert.deepEqual(onwardLegs(route, { anchor: at('w1'), arrives: 200 }), []);
});

test('the picture is told each leg by its end and its dates; the last carries the tag', () => {
    const told = routePreview(storedRoute(TRACK, 99, end), end, (leg) => 'to ' + name(leg.to));
    assert.deepEqual(told.map((leg) => leg.toKey ?? leg.point), ['w2', 'w3', { x: 1, y: 1 }, 'w4']);
    assert.deepEqual(told.map((leg) => leg.tag), [undefined, undefined, undefined, 'to W4']);
    assert.equal(told[1].departs, 101.5);
});

test('a moved waypoint keeps the departure of its leg; every leg after it leaves when the one before arrives', () => {
    const route = storedRoute(TRACK, 99, end);
    const moved = { to: 'w4', name: 'W4', anchor: at('w4'), typed: 7, own: true };
    const tail = editedTail(route, 1, { move: moved }, 2, distance, end, name);
    assert.equal(tail.index, 1);
    assert.deepEqual(tail.planned.map((leg) => leg.n), [2, 3, 4]);
    assert.equal(tail.legs.length, 3);
    assert.equal(tail.legs[0].departs, 101.5, 'the wait before the moved leg is kept');
    assert.deepEqual(tail.legs[0].from, at('w2'));
    assert.deepEqual(tail.legs[0].to, at('w4'));
    assert.ok(Math.abs((tail.legs[0].arrives - tail.legs[0].departs) / HOUR - tail.planned[0].settled.hours) < 1e-9, 'its hours are the estimate, not what was typed elsewhere');
    assert.equal(tail.legs[1].departs, tail.legs[0].arrives);
    assert.equal(tail.legs[2].departs, tail.legs[1].arrives);
    assert.deepEqual(tail.legs[2].to, at('w4'));
    assert.ok(tail.legs.every((leg) => leg.mode === 'flight' && leg.accelG === 2));
});

test('a removed waypoint joins the legs either side; the last one removed leaves an empty tail', () => {
    const route = storedRoute(TRACK, 99, end);
    const tail = editedTail(route, 1, { remove: true }, 2, distance, end, name);
    assert.deepEqual(tail.legs.map((leg) => [leg.from.bodyKey ?? 'point', leg.to.bodyKey ?? 'point']), [['w2', 'point'], ['point', 'w4']]);
    assert.equal(tail.legs[0].departs, 101.5);
    const last = editedTail(route, 3, { remove: true }, 2, distance, end, name);
    assert.deepEqual([last.index, last.legs], [3, []]);
});

test('a waypoint left standing on the place before it is not a leg', () => {
    const track = [flight(at('w1'), at('w2'), 100, 101), flight(at('w2'), at('w1'), 101, 102), flight(at('w1'), at('w3'), 102, 103)];
    const route = storedRoute(track, 99, end);
    // w2 removed: w1 to w1 is nothing, so the tail is w1 to w3 alone.
    const tail = editedTail(route, 0, { remove: true }, 2, distance, end, name);
    assert.deepEqual(tail.legs.map((leg) => leg.to.bodyKey), ['w3']);
    assert.equal(tail.legs[0].departs, 100);
});

test('the leg under way cannot be moved or removed', () => {
    const route = storedRoute(TRACK, 100.5, end);
    assert.equal(editedTail(route, 0, { remove: true }, 2, distance, end, name), null);
    assert.ok(editedTail(route, 1, { remove: true }, 2, distance, end, name));
    assert.equal(editedTail(route, 9, { remove: true }, 2, distance, end, name), null);
});

test('a plotted waypoint moved follows its estimate again; the others keep what was typed', () => {
    const list = [
        { to: 'w2', name: 'W2', anchor: at('w2'), typed: 9, own: true },
        { to: 'w3', name: 'W3', anchor: at('w3'), typed: 5, own: true },
    ];
    const next = movedWaypoint(list, 0, { to: 'w4', name: 'W4', anchor: at('w4'), typed: 3, own: true });
    assert.deepEqual([next[0].to, next[0].own, next[0].typed], ['w4', false, null]);
    assert.deepEqual([next[1].to, next[1].own, next[1].typed], ['w3', true, 5]);
    assert.ok(samePlace('w1', 'w1') && samePlace({ x: 1, y: 2 }, { x: 1, y: 2 }));
    assert.ok(!samePlace('w1', { x: 1, y: 2 }) && !samePlace(null, null) && !samePlace({ x: 1, y: 2 }, { x: 1, y: 3 }));
});
