import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fit, flight, panBy, toScreen, toWorld, zoomAt } from '../../apps/web/src/map/camera.ts';
import { PPP_MAX, PPP_MIN } from '../../apps/web/src/map/tiers.ts';

const vp = { width: 1000, height: 700 };
const cam = { x: -20, y: 15, ppp: 12 };

test('toWorld(toScreen(p)) returns p', () => {
    for (const p of [{ x: 0, y: 0 }, { x: -110, y: -31 }, { x: 400.25, y: -80.5 }]) {
        const screen = toScreen(cam, vp, p.x, p.y);
        const back = toWorld(cam, vp, screen.sx, screen.sy);
        assert.ok(Math.abs(back.x - p.x) < 1e-9);
        assert.ok(Math.abs(back.y - p.y) < 1e-9);
    }
});

test('zoomAt keeps the world point under the cursor', () => {
    const sx = 123.5;
    const sy = 456.25;
    const before = toWorld(cam, vp, sx, sy);
    const next = zoomAt(cam, vp, sx, sy, 1.37);
    const after = toWorld(next, vp, sx, sy);
    assert.ok(Math.abs(after.x - before.x) < 1e-9);
    assert.ok(Math.abs(after.y - before.y) < 1e-9);
});

test('ppp never leaves the range', () => {
    const huge = zoomAt(cam, vp, 10, 10, 1e6);
    const tiny = zoomAt(cam, vp, 10, 10, 1e-9);
    assert.equal(huge.ppp, PPP_MAX);
    assert.equal(tiny.ppp, PPP_MIN);
    assert.equal(panBy({ x: 0, y: 0, ppp: 1000 }, 10, 10).ppp, PPP_MAX);
    assert.equal(panBy({ x: 0, y: 0, ppp: 0.001 }, 10, 10).ppp, PPP_MIN);
    assert.equal(fit({ x0: 0, y0: 0, x1: 1e9, y1: 1e9 }, vp, 0).ppp, PPP_MIN);
    assert.equal(fit({ x0: 0, y0: 0, x1: 0.001, y1: 0.001 }, vp, 0).ppp, PPP_MAX);
    const far = flight({ x: 0, y: 0, ppp: 1000 }, { x: 1000, y: 0, ppp: 0.001 }, 0.5);
    assert.ok(far.ppp >= PPP_MIN && far.ppp <= PPP_MAX);
});

test('flight endpoints are the cameras', () => {
    const a = { x: 1, y: 2, ppp: 4 };
    const b = { x: 50, y: -8, ppp: 80 };
    assert.deepEqual(flight(a, b, 0), a);
    assert.deepEqual(flight(a, b, 1), b);
    const near = { x: 1.5, y: 2.25, ppp: 6 };
    assert.deepEqual(flight(a, near, 0), a);
    assert.deepEqual(flight(a, near, 1), near);
});
