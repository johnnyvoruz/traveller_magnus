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
        legs: [{ from: at('w0'), to: at('w3'), departs: 0, arrives: 10, mode: 'jump' }],
    };
    const marks = placeShips([missing, other], bodiesAt, 5);
    assert.equal(marks.length, 1);
    assert.equal(marks[0].id, 'liner');
    assert.equal(marks[0].shape, 'rectangle');
    assert.equal(marks[0].kind, 'traffic');
    assert.equal(marks[0].x, 50);
    assert.equal(marks[0].y, 2.5);

    assert.equal(plotText({ x: 100, y: 200, from: { x: 100, y: 230 } }), '100.0, 200.0  30.0');
    assert.equal(plotText({ x: 1.26, y: 2 }), '1.3, 2.0');
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
    assert.deepEqual(marks.map((mark) => mark.shape), ['triangle', 'circle', 'square', 'rectangle']);
});
