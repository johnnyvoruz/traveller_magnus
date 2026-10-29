/**
 * AQ1. clampPpp holds the tier limits. visibleRect is the world rectangle
 * under the viewport at the camera's pixels per parsec.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clampPpp, visibleRect } from '../../apps/web/src/map/camera.ts';
import { PPP_MAX, PPP_MIN } from '../../apps/web/src/map/tiers.ts';

test('pixels per parsec stay inside the tier limits', () => {
    assert.equal(PPP_MIN, 0.05);
    assert.equal(PPP_MAX, 160);
    assert.equal(clampPpp(1), 1);
    assert.equal(clampPpp(0), PPP_MIN);
    assert.equal(clampPpp(PPP_MIN), PPP_MIN);
    assert.equal(clampPpp(PPP_MAX), PPP_MAX);
    assert.equal(clampPpp(1000), PPP_MAX);
    assert.equal(clampPpp(-1), PPP_MIN);
});

test('the visible rectangle is half the viewport each way, in world units', () => {
    const rect = visibleRect({ x: 10, y: 20, ppp: 2 }, { width: 100, height: 50 });
    assert.deepEqual(rect, { x0: -15, y0: 7.5, x1: 35, y1: 32.5 });
    const point = visibleRect({ x: 4, y: 5, ppp: 1 }, { width: 0, height: 0 });
    assert.deepEqual(point, { x0: 4, y0: 5, x1: 4, y1: 5 });
});
