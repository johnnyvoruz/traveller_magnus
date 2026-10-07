/**
 * Ship marks (apps/web/src/orbit/ships.ts). Three dates: before the track,
 * on an anchor, and halfway along a flight. A flight asks for its two dates.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BODY_SNAP_PX } from '../../apps/web/src/orbit/distance.ts';
import { dockedBeside, placeShips, plotText, readoutPlace, shipAt, standInMarks } from '../../apps/web/src/orbit/ships.ts';

const hex = 'Test_Sector/0101';
const at = (bodyKey) => ({ kind: 'system', hexKey: hex, bodyKey });

/** w0 moves with the date. w3 stays put. Anything else is not on the picture. */
function bodiesAt(anchor, days) {
    if (!anchor || anchor.kind !== 'system' || anchor.bodyKey === 'w9') return null;
    if (anchor.bodyKey === 'w0') return { x: 0, y: days };
    if (anchor.bodyKey === 'w3') return { x: 100, y: 0 };
    return null;
}

const track = {
    id: 'ship',
    name: 'Far Margin',
    kind: 'party',
    shape: 'triangle',
    legs: [
        { from: at('w0'), to: at('w0'), departs: 10, arrives: 20, mode: 'docked' },
        { from: at('w0'), to: at('w3'), departs: 20, arrives: 30, mode: 'flight' },
        { from: at('w3'), to: at('w3'), departs: 30, arrives: 50, mode: 'orbit' },
    ],
};

test('placeShips on three dates: before departure, on the body, and halfway', () => {
    assert.deepEqual(placeShips([track], bodiesAt, 5), []);

    const docked = placeShips([track], bodiesAt, 15);
    assert.deepEqual(docked, [{ id: 'ship', name: 'Far Margin', kind: 'party', shape: 'triangle', x: 0, y: 15 }]);

    const mid = placeShips([track], bodiesAt, 25);
    assert.equal(mid.length, 1);
    assert.equal(mid[0].id, 'ship');
    assert.equal(mid[0].x, 50);
    assert.equal(mid[0].y, 10);
    assert.ok(Math.abs(mid[0].heading - Math.atan2(-20, 100)) < 1e-12);

    const arrived = placeShips([track], bodiesAt, 40);
    assert.deepEqual(arrived, [{ id: 'ship', name: 'Far Margin', kind: 'party', shape: 'triangle', x: 100, y: 0 }]);
});

test('a flight runs from where it left to where it will arrive, on one straight line', () => {
    function moving(anchor, days) {
        if (!anchor || anchor.kind !== 'system') return null;
        if (anchor.bodyKey === 'w0') return { x: 0, y: days };
        if (anchor.bodyKey === 'w4') return { x: days * 2, y: 10 };
        return null;
    }
    const flight = {
        id: 'ship', name: 'Far Margin', kind: 'party', shape: 'triangle',
        legs: [{ from: at('w0'), to: at('w4'), departs: 10, arrives: 20, mode: 'flight' }],
    };
    const start = placeShips([flight], moving, 10)[0];
    const mid = placeShips([flight], moving, 15)[0];
    const almost = placeShips([flight], moving, 10 + 0.999 * 10)[0];
    const end = placeShips([flight], moving, 20)[0];
    assert.deepEqual({ x: start.x, y: start.y }, { x: 0, y: 10 });
    assert.deepEqual({ x: mid.x, y: mid.y }, { x: 20, y: 10 });
    assert.ok(Math.abs(almost.x - 39.96) < 1e-9);
    assert.equal(almost.y, 10);
    assert.deepEqual({ x: end.x, y: end.y }, { x: 40, y: 10 });
    const cross = (mid.x - start.x) * (almost.y - start.y) - (mid.y - start.y) * (almost.x - start.x);
    assert.ok(Math.abs(cross) < 1e-9);
});

test('a mark with no body on this picture is left off, and a second track keeps its shape', () => {
    const missing = {
        id: 'gone', name: 'Gone', kind: 'vessel', shape: 'circle',
        legs: [{ from: at('w9'), to: at('w9'), departs: 0, arrives: 10, mode: 'docked' }],
    };
    const other = {
        id: 'liner', name: 'Liner', kind: 'traffic', shape: 'rectangle',
        legs: [{ from: at('w0'), to: at('w0'), departs: 0, arrives: 10, mode: 'orbit' }],
    };
    const marks = placeShips([missing, other], bodiesAt, 5);
    assert.deepEqual(marks, [{ id: 'liner', name: 'Liner', kind: 'traffic', shape: 'rectangle', x: 0, y: 5 }]);

    assert.equal(plotText({ x: 100, y: 200, from: { x: 100, y: 230 } }), '');
    assert.equal(plotText({ x: 1.26, y: 2 }), '');
});

test('a jump reports the leave and the arrival, and is not a mark while it is under way', () => {
    const leaving = {
        id: 'out', name: 'Outbound', kind: 'traffic', shape: 'triangle',
        legs: [
            { from: at('w0'), to: at('w0'), departs: 0, arrives: 10, mode: 'orbit' },
            { from: at('w0'), to: at('w9'), departs: 10, arrives: 20, mode: 'jump' },
        ],
    };
    const reaching = {
        id: 'in', name: 'Inbound', kind: 'vessel', shape: 'circle',
        legs: [{ from: at('w9'), to: at('w3'), departs: 10, arrives: 20, mode: 'jump' }],
    };
    const ship = { id: 'out', name: 'Outbound', kind: 'traffic', shape: 'triangle' };

    assert.deepEqual(placeShips([leaving], bodiesAt, 9), [{ ...ship, x: 0, y: 9 }]);
    assert.deepEqual(placeShips([leaving], bodiesAt, 10), [{ ...ship, x: 0, y: 10, jump: 'out' }]);
    assert.deepEqual(placeShips([leaving], bodiesAt, 15), [{ ...ship, x: 0, y: 15, jump: 'out' }]);
    assert.deepEqual(placeShips([leaving], bodiesAt, 20), []);
    assert.deepEqual(placeShips([leaving], bodiesAt, 21), []);

    const inbound = { id: 'in', name: 'Inbound', kind: 'vessel', shape: 'circle' };
    assert.deepEqual(placeShips([reaching], bodiesAt, 9), []);
    assert.deepEqual(placeShips([reaching], bodiesAt, 10), [{ ...inbound, x: 100, y: 0, jump: 'in' }]);
    assert.deepEqual(placeShips([reaching], bodiesAt, 15), [{ ...inbound, x: 100, y: 0, jump: 'in' }]);
    assert.deepEqual(placeShips([reaching], bodiesAt, 20), [{ ...inbound, x: 100, y: 0 }]);
    assert.deepEqual(placeShips([reaching], bodiesAt, 25), [{ ...inbound, x: 100, y: 0 }]);

    // Both ends on this picture: still no mark along the line, then a normal mark at the arrival.
    const local = {
        id: 'liner', name: 'Liner', kind: 'traffic', shape: 'rectangle',
        legs: [{ from: at('w0'), to: at('w3'), departs: 0, arrives: 10, mode: 'jump' }],
    };
    assert.deepEqual(placeShips([local], bodiesAt, 5), [
        { id: 'liner', name: 'Liner', kind: 'traffic', shape: 'rectangle', x: 0, y: 5, jump: 'out' },
    ]);
    assert.deepEqual(placeShips([local], bodiesAt, 10), [
        { id: 'liner', name: 'Liner', kind: 'traffic', shape: 'rectangle', x: 100, y: 0 },
    ]);
});

test('a point is drawn at its picture, and a flight or a jump uses that place', () => {
    const open = { kind: 'system', hexKey: hex, point: { x: 1.2, y: 0.8 } };
    const body = { kind: 'system', hexKey: hex, bodyKey: 'w0' };
    const away = { kind: 'system', hexKey: 'Other/0000', bodyKey: 'w0' };
    const pictureOf = (au) => ({ x: au.x * 10, y: au.y * 10 });
    let asked = 0;
    const bodiesAt = (anchor) => {
        asked += 1;
        if (anchor && anchor.bodyKey === 'w0' && anchor.hexKey === hex) return { x: 0, y: 0 };
        return null;
    };
    const held = {
        id: 'survey', name: 'Surveyor', kind: 'vessel', shape: 'circle',
        legs: [{ from: open, to: open, departs: 0, arrives: 10, mode: 'orbit' }],
    };
    assert.deepEqual(placeShips([held], bodiesAt, 1, pictureOf), [
        { id: 'survey', name: 'Surveyor', kind: 'vessel', shape: 'circle', x: 12, y: 8 },
    ]);
    assert.deepEqual(placeShips([held], bodiesAt, 9, pictureOf), [
        { id: 'survey', name: 'Surveyor', kind: 'vessel', shape: 'circle', x: 12, y: 8 },
    ]);
    assert.equal(asked, 0);
    assert.deepEqual(placeShips([held], bodiesAt, 5), []);

    const flight = {
        ...held,
        legs: [{ from: body, to: open, departs: 0, arrives: 10, mode: 'flight' }],
    };
    const mid = placeShips([flight], bodiesAt, 5, pictureOf)[0];
    assert.equal(mid.x, 6);
    assert.equal(mid.y, 4);
    assert.ok(typeof mid.heading === 'number');

    const jump = {
        ...held,
        legs: [{ from: open, to: away, departs: 0, arrives: 10, mode: 'jump' }],
    };
    const bubble = placeShips([jump], bodiesAt, 5, pictureOf)[0];
    assert.equal(bubble.jump, 'out');
    assert.equal(bubble.x, 12);
    assert.equal(bubble.y, 8);
});

test('the stand-in party sits halfway from the star to the furthest body', () => {
    const picture = {
        stars: [{ star: { key: 's0' }, x: 0, y: 0 }],
        layers: [{
            worlds: [{
                world: { key: 'w1', mainworld: false, mainworldBelt: false },
                x: 10, y: 0,
                moons: [{ moon: { key: 'w1m0', mainworld: true }, x: 100, y: 0 }],
            }],
        }],
    };
    const marks = standInMarks(hex, 10, picture);
    const party = marks.find((mark) => mark.kind === 'party');
    assert.equal(party.x, 50);
    assert.equal(party.y, 0);
    assert.equal(party.shape, 'triangle');
    assert.deepEqual(marks.map((mark) => mark.shape), ['triangle', 'circle', 'square', 'rectangle', 'triangle', 'square']);

    // Day 10 is the start of a 16-second loop. Outbound is still here; inbound is on the way.
    const outbound = marks.find((mark) => mark.id === 'stand-jump-out');
    const inbound = marks.find((mark) => mark.id === 'stand-jump-in');
    assert.equal(outbound.jump, undefined);
    assert.equal(inbound.jump, 'in');
    const sec = 1 / 86400;
    const left = standInMarks(hex, 10 + 4 * sec, picture).find((mark) => mark.id === 'stand-jump-out');
    const beforeIn = standInMarks(hex, 10 + 5 * sec, picture).find((mark) => mark.id === 'stand-jump-in');
    const arrived = standInMarks(hex, 10 + 7 * sec, picture).find((mark) => mark.id === 'stand-jump-in');
    assert.equal(left.jump, 'out');
    assert.equal(beforeIn.jump, 'in');
    assert.equal(arrived.jump, undefined);
});

test('shipAt hits a mark, a point inside the body slop, and a point outside it', () => {
    const marks = [
        { id: 'a', name: 'Courier', kind: 'vessel', shape: 'circle', x: 0, y: 0 },
        { id: 'jump', name: 'Outbound', kind: 'traffic', shape: 'triangle', x: 0, y: 0, jump: 'out' },
    ];
    assert.equal(shipAt(marks, { x: 0, y: 0 }), 'a');
    assert.equal(shipAt(marks, { x: BODY_SNAP_PX - 1, y: 0 }), 'a');
    assert.equal(shipAt(marks, { x: BODY_SNAP_PX, y: 0 }), 'a');
    assert.equal(shipAt(marks, { x: BODY_SNAP_PX + 0.1, y: 0 }), null);
    const jumping = [{ id: 'jump', name: 'Outbound', kind: 'traffic', shape: 'triangle', x: 0, y: 0, jump: 'out' }];
    assert.equal(shipAt(jumping, { x: 0, y: 0 }), null);
});

test('dockedBeside places one, two and four ships along the diagonal', () => {
    const body = { x: 100, y: 200 };
    const radius = 12;
    const angle = Math.PI / 4;
    const at = (index) => ({
        x: body.x + (radius + 16 + index * 20) * Math.cos(angle),
        y: body.y + (radius + 16 + index * 20) * Math.sin(angle),
    });
    assert.deepEqual(dockedBeside(body, radius, 0), at(0));
    assert.deepEqual(dockedBeside(body, radius, 1), at(1));
    assert.deepEqual(dockedBeside(body, radius, 3), at(3));
    const step = Math.hypot(at(1).x - at(0).x, at(1).y - at(0).y);
    assert.ok(Math.abs(step - 20) < 1e-9);
});

test('the hairline readout moves to the pointer\'s other side when it would cross a name', () => {
    const canvas = { w: 1000, h: 800 };
    const text = { w: 60, h: 10 };
    const clear = readoutPlace({ x: 100, y: 100 }, text, canvas, [{ x: 400, y: 400, w: 48, h: 10 }]);
    assert.deepEqual(clear, { x: 108, y: 112, align: 'left', baseline: 'top' });
    const blocked = readoutPlace({ x: 100, y: 100 }, text, canvas, [{ x: 108, y: 112, w: 48, h: 10 }]);
    assert.equal(blocked.align, 'right');
    assert.equal(blocked.x, 92);
    assert.equal(blocked.y, 112);
    assert.ok(blocked.x - text.w < 108, 'the flipped box sits on the other side of the pointer');
    const edge = readoutPlace({ x: 980, y: 100 }, text, canvas, []);
    assert.equal(edge.align, 'right');
    assert.equal(edge.x, 972);
});
