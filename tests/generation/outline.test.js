import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HEX_SIZE, hexCentre, hexCorners, outlineLoops } from '@voyage/generation';

const INSET = HEX_SIZE * 0.1;

function pointCount(loop) {
    return loop.points.length / 2;
}

test('outline loops follow the legacy inset border', () => {
    const one = outlineLoops([{ q: 0, r: 0 }]);
    assert.equal(one.length, 1);
    assert.equal(pointCount(one[0]), 6);
    const centre = hexCentre(0, 0);
    const corners = hexCorners(centre.x, centre.y);
    for (let i = 0; i < 6; i++) {
        const cornerX = corners[i * 2];
        const cornerY = corners[i * 2 + 1];
        const pointX = one[0].points[i * 2];
        const pointY = one[0].points[i * 2 + 1];
        const cornerDist = Math.hypot(cornerX - centre.x, cornerY - centre.y);
        const pointDist = Math.hypot(pointX - centre.x, pointY - centre.y);
        const along = Math.hypot(pointX - cornerX, pointY - cornerY);
        assert.ok(pointDist < cornerDist);
        assert.ok(Math.abs(along - INSET * 2 / Math.sqrt(3)) < 1e-9, `${along}`);
        const towardX = centre.x - cornerX;
        const towardY = centre.y - cornerY;
        const moveX = pointX - cornerX;
        const moveY = pointY - cornerY;
        assert.ok(moveX * towardX + moveY * towardY > 0);
    }

    const pair = outlineLoops([{ q: 0, r: 0 }, { q: 1, r: 0 }]);
    assert.equal(pair.length, 1);
    assert.equal(pointCount(pair[0]), 10);

    const ring = outlineLoops([
        { q: 1, r: 0 },
        { q: 0, r: 1 },
        { q: -1, r: 0 },
        { q: -1, r: -1 },
        { q: 0, r: -1 },
        { q: 1, r: -1 },
    ]);
    assert.equal(ring.length, 2);

    const apart = outlineLoops([{ q: 0, r: 0 }, { q: 3, r: 0 }]);
    assert.equal(apart.length, 2);
    assert.equal(pointCount(apart[0]), 6);
    assert.equal(pointCount(apart[1]), 6);

    const ordered = [{ q: 2, r: 1 }, { q: -4, r: 3 }, { q: 2, r: 2 }];
    const forward = outlineLoops(ordered);
    const backward = outlineLoops([...ordered].reverse());
    assert.deepEqual(backward, forward);

    const negative = outlineLoops([{ q: -3, r: -4 }]);
    assert.equal(negative.length, 1);
    assert.equal(pointCount(negative[0]), 6);
    const negativePair = outlineLoops([{ q: -3, r: -4 }, { q: -2, r: -3 }]);
    assert.equal(negativePair.length, 1);
    assert.equal(pointCount(negativePair[0]), 10);
});
