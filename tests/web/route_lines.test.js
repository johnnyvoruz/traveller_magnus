import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hexCentre, toGlobal } from '../../apps/web/src/map/geometry.ts';
import { routeSegments } from '../../apps/web/src/map/route_lines.ts';

const GAP = 20 / 75;

function index(routes) {
    return { x: -4, y: -1, metadata: { routes, borders: [], names: {} }, hexes: {} };
}

function centre(col, row, sx = -4) {
    const global = toGlobal(sx, -1, col, row);
    return hexCentre(global.q, global.r);
}

test('routes shorten by 20/75, spread when they share both ends, and take allegiance colour', () => {
    const start = centre(19, 10);
    const end = centre(20, 10);
    const [segment] = routeSegments(index([{ Start: '1910', End: '2010' }]));
    assert.ok(Math.abs(Math.hypot(segment.x0 - start.x, segment.y0 - start.y) - GAP) < 1e-9);
    assert.ok(Math.abs(Math.hypot(segment.x1 - end.x, segment.y1 - end.y) - GAP) < 1e-9);
    assert.equal(segment.colourKey, 'xboat');
    assert.equal(segment.dash, 'solid');

    const shifted = routeSegments(index([{ Start: '1910', End: '2010', EndOffsetX: '1' }]))[0];
    const far = centre(20, 10, -3);
    assert.equal(far.x - end.x, 32);
    assert.ok(Math.abs(Math.hypot(shifted.x1 - far.x, shifted.y1 - far.y) - GAP) < 1e-9);

    const pair = routeSegments(index([
        { Start: '1910', End: '2010' },
        { Start: '1910', End: '2010' },
    ]));
    const apart = Math.hypot(
        (pair[0].x0 + pair[0].x1) / 2 - (pair[1].x0 + pair[1].x1) / 2,
        (pair[0].y0 + pair[0].y1) / 2 - (pair[1].y0 + pair[1].y1) / 2,
    );
    assert.ok(Math.abs(apart - 5 / 75) < 1e-9);

    const dashed = routeSegments(index([{ Start: '1910', End: '2010', Style: 'dashed', Allegiance: 'Im' }]))[0];
    assert.equal(dashed.dash, 'dashed');
    assert.equal(dashed.colourKey, 'Im');
});
