/**
 * A course of waypoints (apps/web/src/orbit/course.ts), the speed steps (time_row.ts) and
 * the docked tags' places (ship_marks.ts dockTags). The legs leave one after another, each
 * measured to where its destination will be; an untyped leg arrives at the settled arrival
 * exactly; "Add course" writes them in order. No rule number is written here.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FASTEST, HOUR, REAL_TIME } from '../../apps/web/src/orbit/clock.ts';
import { courseLegs, coursePreview, courseReady, courseTotals, planCourse, tagWords, toGoWords, underwayWords } from '../../apps/web/src/orbit/course.ts';
import { fieldHours, flightHours } from '../../apps/web/src/orbit/estimates.ts';
import { shipTags, TAG_CORNER, TAG_LEAD, TAG_RUN, TAG_STEP, TAGS_SHOWN } from '../../apps/web/src/orbit/ship_marks.ts';
import { dockedBeside } from '../../apps/web/src/orbit/ships.ts';
import { stepSpeed } from '../../apps/web/src/orbit/time_row.ts';

const HERE = 'Spinward_Marches/1910';
const ax = { kind: 'system', hexKey: HERE, bodyKey: 'w11', locationLabel: 'Regina A-X' };
const a2 = { kind: 'system', hexKey: HERE, bodyKey: 'w2', locationLabel: 'Regina A-II' };
const hold = { kind: 'system', hexKey: HERE, point: { x: 3, y: 4 }, locationLabel: '5.00 AU' };
const D0 = 403461;
// Still places: a fixed distance between each pair, so every figure can be worked by hand.
const KM = { 'w11>w2': 400000, 'w2>pt': 1600000, 'pt>w2': 1600000 };
const key = (end) => (typeof end === 'string' ? end : 'pt');
const distance = (from, _fromDays, to) => KM[key(from) + '>' + key(to)] ?? null;
const wp = (to, name, anchor, typed = null, own = false) => ({ to, name, anchor, typed, own });

test('legs leave one after another; an untyped leg arrives at the settled arrival, shown to a tenth', () => {
    const legs = planCourse({ anchor: ax, end: 'w11', departs: D0 }, [wp('w2', 'Regina A-II', a2), wp(hold.point, '5.00 AU', hold)], 2, distance);
    const h1 = flightHours(400000, 2);
    const h2 = flightHours(1600000, 2);
    assert.deepEqual(legs.map((leg) => leg.n), [1, 2]);
    assert.equal(legs[0].departs, D0);
    assert.equal(legs[0].hours, h1);
    assert.equal(legs[0].arrives, legs[0].settled.arrives, 'the settled arrival, not the rounded hours');
    assert.equal(legs[0].shown, fieldHours(h1));
    assert.equal(legs[1].departs, legs[0].arrives, 'the next leg leaves when this one arrives');
    assert.deepEqual(legs[1].from, a2);
    assert.equal(legs[1].hours, h2);
    assert.equal(courseReady(legs), true);
    const totals = courseTotals(legs);
    assert.equal(totals.km, 2000000);
    assert.ok(Math.abs(totals.hours - (h1 + h2)) < 1e-6);
    assert.equal(totals.arrives, legs[1].arrives);
    assert.equal(totals.settled, true);
});

test('a typed leg keeps its hours and moves every leg after it; an emptied one stops the course there', () => {
    const typed = planCourse({ anchor: ax, end: 'w11', departs: D0 }, [wp('w2', 'Regina A-II', a2, 10, true), wp(hold.point, '5.00 AU', hold)], 2, distance);
    assert.equal(typed[0].hours, 10);
    assert.equal(typed[0].shown, 10);
    assert.equal(typed[0].arrives, D0 + 10 * HOUR);
    assert.equal(typed[1].departs, D0 + 10 * HOUR);
    assert.ok(typed[0].settled, 'the estimate is still there to return to');
    const emptied = planCourse({ anchor: ax, end: 'w11', departs: D0 }, [wp('w2', 'Regina A-II', a2, null, true), wp(hold.point, '5.00 AU', hold)], 2, distance);
    assert.equal(emptied[0].arrives, null);
    assert.equal(emptied[1].departs, null, 'no departure without the arrival before it');
    assert.equal(emptied[1].settled, null);
    assert.equal(courseReady(emptied), false);
    assert.equal(courseLegs(emptied, 2), null);
    assert.equal(courseTotals(emptied).hours, null);
    // A place that is not known: no estimate, and the hours wait to be typed.
    const unknown = planCourse({ anchor: ax, end: null, departs: D0 }, [wp('w2', 'Regina A-II', a2)], 2, distance);
    assert.equal(unknown[0].settled, null);
    assert.equal(courseReady(unknown), false);
    assert.equal(courseReady([]), false);
});

test('"Add course" writes flight legs in order, each from the waypoint before; the picture gets the dated legs', () => {
    const legs = planCourse({ anchor: ax, end: 'w11', departs: D0 }, [wp('w2', 'Regina A-II', a2), wp(hold.point, '5.00 AU', hold), wp('w2', 'Regina A-II', a2)], 3, distance);
    const written = courseLegs(legs, 3);
    assert.equal(written.length, 3);
    assert.deepEqual(written.map((leg) => [leg.mode, leg.accelG]), [['flight', 3], ['flight', 3], ['flight', 3]]);
    assert.deepEqual([written[0].from, written[0].to], [ax, a2]);
    assert.deepEqual([written[1].from, written[1].to], [a2, hold]);
    assert.deepEqual([written[2].from, written[2].to], [hold, a2]);
    for (let i = 1; i < written.length; i += 1) assert.equal(written[i].departs, written[i - 1].arrives);
    assert.equal(written[0].arrives, legs[0].arrives);
    const preview = coursePreview(legs, (leg) => 'A-II · leg ' + leg.n);
    assert.deepEqual(preview.map((leg) => (leg.toKey ? leg.toKey : 'point')), ['w2', 'point', 'w2']);
    assert.deepEqual(preview[1].point, hold.point);
    assert.equal(preview[0].tag, undefined);
    assert.equal(preview[2].tag, 'A-II · leg 3', 'the last waypoint carries the arrival tag');
    assert.deepEqual([preview[0].departs, preview[0].arrives], [legs[0].departs, legs[0].arrives]);
    // A course cut off by a leg with no hours previews only what is dated.
    const cut = planCourse({ anchor: ax, end: 'w11', departs: D0 }, [wp('w2', 'Regina A-II', a2), wp(hold.point, '5.00 AU', hold, null, true), wp('w2', 'Regina A-II', a2)], 3, distance);
    assert.equal(coursePreview(cut, () => 'x').length, 1);
});

test('the count down names the next waypoint', () => {
    assert.equal(toGoWords(3 + 4 / 24), '3 d 4 h');
    assert.equal(toGoWords(2), '2 d');
    assert.equal(toGoWords((5 + 12 / 60) / 24), '5 h 12 m');
    assert.equal(toGoWords(3 / 24), '3 h');
    assert.equal(toGoWords(12 / (24 * 60)), '12 m');
    assert.equal(toGoWords(0), 'under a minute');
    assert.equal(toGoWords(-1), 'under a minute');
    const name = (anchor) => anchor.locationLabel;
    assert.equal(underwayWords({ to: a2, arrives: D0 + 1, accelG: 2 }, D0 + 0.5, name), 'To Regina A-II · 12 h to go · 2 G');
    assert.equal(underwayWords({ to: hold, arrives: D0 + 1 }, D0, name), 'To 5.00 AU · 1 d to go');
    // The tag's second line: the same state, shorter.
    assert.equal(tagWords('flight', { to: a2, arrives: D0 + 1 }, D0 + 0.5, name), 'To Regina A-II · 12 h');
    assert.equal(tagWords('docked', null, D0, name), 'Docked');
    assert.equal(tagWords('orbit', null, D0, name), 'In orbit');
    assert.equal(tagWords('hold', null, D0, name), 'Holding');
    assert.equal(tagWords('jump', null, D0, name), 'In jump');
    assert.equal(tagWords('none', null, D0, name), '');
});

test('the speed steps faster and slower between real time and the fastest, and stops at each end', () => {
    const up = stepSpeed(REAL_TIME, 1);
    assert.ok(up > REAL_TIME);
    assert.ok(Math.abs(stepSpeed(up, -1) - REAL_TIME) < REAL_TIME * 1e-6, 'a step back undoes a step on');
    assert.equal(stepSpeed(REAL_TIME, -1), REAL_TIME);
    assert.equal(stepSpeed(FASTEST, 1), FASTEST);
    let speed = REAL_TIME;
    let steps = 0;
    while (speed < FASTEST && steps < 100) { speed = stepSpeed(speed, 1); steps += 1; }
    assert.equal(speed, FASTEST);
    assert.equal(steps, 10, 'ten steps from one end to the other');
});

test('every ship has a tag, down and to the right of its mark; ships at one body stack; the rest are counted', () => {
    const hits = [{ kind: 'star', key: 's0', cx: 0, cy: 0, r: 30, visualR: 30 }, { kind: 'world', key: 'w2', cx: 100, cy: 0, r: 14, visualR: 6 }, { kind: 'ring', key: 'w2', cx: 100, cy: 0, r: 20 }];
    const docked = (id, name) => ({ id, name, kind: 'vessel', shape: 'circle', x: 100, y: 0 });
    const marks = [
        docked('b', 'Blue Runner'),
        { id: 'a', name: 'Far Margin', kind: 'party', shape: 'triangle', x: 100.4, y: 0.3 },
        { id: 'f', name: 'In flight', kind: 'vessel', shape: 'circle', x: 200, y: 50, heading: 1 },
        { id: 'h', name: 'Holding', kind: 'vessel', shape: 'circle', x: 300, y: 300 },
        { id: 'j', name: 'Jumping', kind: 'vessel', shape: 'circle', x: 100, y: 0, jump: 'out' },
    ];
    const found = shipTags(marks, hits);
    const byId = Object.fromEntries(found.tags.map((tag) => [tag.id, tag]));
    assert.deepEqual(Object.keys(byId).sort(), ['a', 'b', 'f', 'h'], 'every ship but the jump report');
    // Under way and holding: the leader starts at the mark and the tag hangs down and to the right.
    assert.deepEqual([byId.f.markX, byId.f.markY, byId.f.bodyKey], [200, 50, null]);
    assert.deepEqual([byId.f.kneeX, byId.f.kneeY, byId.f.x], [200 + TAG_CORNER + TAG_LEAD, 50 + TAG_CORNER + TAG_LEAD, 200 + TAG_CORNER + TAG_LEAD + TAG_RUN]);
    assert.ok(byId.h.kneeX > byId.h.markX && byId.h.kneeY > byId.h.markY);
    // At a body: the leaders start where the picture draws each designator; the tags stack from the first.
    const first = dockedBeside({ x: 100, y: 0 }, 6, 0);
    const second = dockedBeside({ x: 100, y: 0 }, 6, 1);
    assert.deepEqual([byId.a.markX, byId.a.markY, byId.a.bodyKey], [first.x, first.y, 'w2'], 'by id, as the picture orders them');
    assert.deepEqual([byId.b.markX, byId.b.markY], [second.x, second.y]);
    assert.equal(byId.b.x, byId.a.x);
    assert.equal(byId.b.kneeY - byId.a.kneeY, TAG_STEP, 'one under the other, never over it');
    assert.deepEqual(found.more, []);
    // More than fit: the first few, and a count of the rest.
    const crowd = Array.from({ length: TAGS_SHOWN + 3 }, (_, i) => docked('s' + i, 'Ship ' + i));
    const many = shipTags(crowd, hits);
    assert.equal(many.tags.length, TAGS_SHOWN);
    assert.deepEqual(many.more.map((item) => [item.bodyKey, item.count]), [['w2', 3]]);
    assert.equal(shipTags(crowd, hits, new Set(['w2'])).tags.length, TAGS_SHOWN + 3, 'opened, every one is there');
});
