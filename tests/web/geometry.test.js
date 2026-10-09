import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fromGlobal, hexAt, hexCentre, hexDistance, stepGlobal, toGlobal } from '../../apps/web/src/map/geometry.ts';

const SECTORS = [[-4, -1], [0, 0], [-200, 77]];

test('hexAt(hexCentre) round-trips every hex of three sectors', () => {
    for (const [sx, sy] of SECTORS) {
        for (let col = 1; col <= 32; col++) {
            for (let row = 1; row <= 40; row++) {
                const { q, r } = toGlobal(sx, sy, col, row);
                const centre = hexCentre(q, r);
                const back = hexAt(centre.x, centre.y);
                assert.deepEqual(back, { q, r }, `${sx},${sy} ${col},${row}`);
            }
        }
    }
});

test('fromGlobal(toGlobal) round-trips the four corners', () => {
    for (const [sx, sy] of SECTORS) {
        for (const col of [1, 32]) {
            for (const row of [1, 40]) {
                const global = toGlobal(sx, sy, col, row);
                assert.deepEqual(fromGlobal(global.q, global.r), { sx, sy, col, row });
            }
        }
    }
});

test('Regina Spinward_Marches/1910 is q=-110 r=-31', () => {
    assert.deepEqual(toGlobal(-4, -1, 19, 10), { q: -110, r: -31 });
});

test('each neighbour is one parsec, three above and three below', () => {
    for (const q of [0, 1, -110]) {
        const here = { q, r: -31 };
        const centre = hexCentre(q, -31);
        for (const step of ['nw', 'n', 'ne']) {
            const next = stepGlobal(q, -31, step);
            assert.equal(hexDistance(here, next), 1, step);
            assert.ok(hexCentre(next.q, next.r).y < centre.y, step);
        }
        for (const step of ['sw', 's', 'se']) {
            const next = stepGlobal(q, -31, step);
            assert.equal(hexDistance(here, next), 1, step);
            assert.ok(hexCentre(next.q, next.r).y > centre.y, step);
        }
        const north = stepGlobal(q, -31, 'n');
        const west = stepGlobal(q, -31, 'nw');
        const east = stepGlobal(q, -31, 'ne');
        assert.ok(hexCentre(west.q, west.r).x < hexCentre(north.q, north.r).x);
        assert.ok(hexCentre(east.q, east.r).x > hexCentre(north.q, north.r).x);
    }
});
