/**
 * Ship marks (apps/web/src/orbit/ships.ts). Three dates: before the track,
 * on an anchor, and halfway along a flight. Bodies are asked for at that date.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { placeShips, plotText, standInMarks } from '../../apps/web/src/orbit/ships.ts';

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
    assert.equal(mid[0].y, 12.5);
    assert.ok(Math.abs(mid[0].heading - Math.atan2(-25, 100)) < 1e-12);

    const arrived = placeShips([track], bodiesAt, 40);
    assert.deepEqual(arrived, [{ id: 'ship', name: 'Far Margin', kind: 'party', shape: 'triangle', x: 100, y: 0 }]);
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

    assert.equal(plotText({ x: 100, y: 200, from: { x: 100, y: 230 } }), '100.0, 200.0  30.0');
    assert.equal(plotText({ x: 1.26, y: 2 }), '1.3, 2.0');
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
