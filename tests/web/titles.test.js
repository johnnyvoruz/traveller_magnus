import assert from 'node:assert/strict';
import { test } from 'node:test';
import { placeTitle, titleCandidates } from '../../apps/web/src/map/titles.ts';

const visible = { x: 0, y: 0, w: 200, h: 80 };
const pillW = 20;
const pillH = 10;

test('subsector title candidates run along the edges and the cheapest clear spot wins', () => {
    const spots = titleCandidates(visible, pillW, pillH);
    const top = spots.filter((spot) => spot.y === 4);
    const bottom = spots.filter((spot) => spot.y === 66);
    const sides = spots.filter((spot) => spot.y !== 4 && spot.y !== 66);
    assert.ok(top.length > 1);
    assert.ok(bottom.length > 0);
    assert.ok(sides.length > 0);
    assert.deepEqual(spots.slice(0, top.length), top);
    assert.deepEqual(spots.slice(top.length, top.length + bottom.length), bottom);
    assert.deepEqual(spots.slice(top.length + bottom.length), sides);
    assert.equal(sides[0].x, 4);
    assert.equal(sides[1].x, 176);
    assert.ok(sides[0].y < sides[2].y);

    assert.deepEqual(placeTitle(visible, pillW, pillH, [], 10, []), spots[0]);

    const first = spots[0];
    const under = { x: first.x + pillW / 2, y: first.y + pillH / 2 };
    const moved = placeTitle(visible, pillW, pillH, [under], 5, []);
    assert.ok(moved);
    assert.equal(moved.y, first.y);
    assert.ok(moved.x > first.x);

    assert.deepEqual(titleCandidates({ x: 0, y: 0, w: 50, h: 200 }, pillW, pillH), []);
    assert.equal(placeTitle(visible, pillW, pillH, [], 10, [{ x: -10, y: -10, w: 1000, h: 1000 }]), null);
});
