/**
 * The orbit view's camera and stage (apps/web/src/orbit/camera.ts, stage.ts). The numbers
 * are the legacy ones (findings/legacy_orbit_inventory.md §5, Camera): wheel 1.15 toward the
 * pointer, zoom 5000 at most, fit inside the canvas less 32, frame with 36 of padding.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    centreOn, DRAG_SLOP, easeInOut, FIT_INSET, fitCamera, FRAME_PAD, frameCamera, MAX_ZOOM, panBy,
    startCamera, toward, tweenShare, viewOf, WHEEL_FACTOR, wheelNotches, zoomAt, zoomToward,
} from '../../apps/web/src/orbit/camera.ts';
import { hitOf, layoutScene, localBounds, planSystem, sceneBounds } from '../../apps/web/src/orbit/layout.ts';
import { OrbitStage } from '../../apps/web/src/orbit/stage.ts';
import { HEX_KEY, testSystem } from './orbit_fixture.js';

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, a + ' is not ' + b);
const SIZE = { w: 1000, h: 800 };
const plan = planSystem(testSystem(), HEX_KEY);

test('the legacy camera constants', () => {
    assert.equal(MAX_ZOOM, 5000);
    assert.equal(WHEEL_FACTOR, 1.15);
    assert.equal(FIT_INSET, 32);
    assert.equal(FRAME_PAD, 36);
    assert.equal(DRAG_SLOP, 4);
    assert.deepEqual(startCamera(), { zoom: 1, offX: 0, offY: 0, minZoom: 1, fitZoom: 1, fitOffX: 0, fitOffY: 0, atFit: true });
});

test('fit fills the canvas less the inset and centres the picture', () => {
    const cam = fitCamera(plan, SIZE, 1000, startCamera(), false, false);
    const bounds = sceneBounds(plan, { ...SIZE, zoom: cam.zoom, offX: cam.offX, offY: cam.offY, z: 1, linear: false }, 1000);
    const bw = bounds.right - bounds.left;
    const bh = bounds.bottom - bounds.top;
    // One axis fills the room; neither overflows it.
    assert.ok(bw <= SIZE.w - FIT_INSET + 0.5 && bh <= SIZE.h - FIT_INSET + 0.5);
    assert.ok(Math.abs(bw - (SIZE.w - FIT_INSET)) < 1 || Math.abs(bh - (SIZE.h - FIT_INSET)) < 1);
    close((bounds.left + bounds.right) / 2, SIZE.w / 2, 1e-6);
    close((bounds.top + bounds.bottom) / 2, SIZE.h / 2, 1e-6);
    // The fit is the floor of zooming out and the reference of the zoom scale.
    assert.equal(cam.minZoom, cam.zoom);
    assert.equal(cam.fitZoom, cam.zoom);
    assert.deepEqual([cam.offX, cam.offY], [cam.fitOffX, cam.fitOffY]);
    assert.equal(viewOf(cam, SIZE, false).z, 1);
    // No size yet: the camera is left alone.
    const start = startCamera();
    assert.equal(fitCamera(plan, { w: 0, h: 0 }, 0, start, false, false), start);
});

test('a refit with preserve keeps a zoomed view relative to the new fit', () => {
    const fitted = fitCamera(plan, SIZE, 1000, startCamera(), false, false);
    const zoomed = { ...fitted, zoom: fitted.zoom * 4, offX: fitted.offX + 50, offY: fitted.offY - 30, atFit: false };
    const bigger = { w: 1400, h: 1100 };
    const next = fitCamera(plan, bigger, 1000, zoomed, true, false);
    const ratio = next.minZoom / fitted.minZoom;
    close(next.zoom, zoomed.zoom * ratio);
    close(next.offX - next.fitOffX, 50 * ratio);
    close(next.offY - next.fitOffY, -30 * ratio);
    assert.equal(next.atFit, false);
    // At fit, preserve is the plain fit.
    const again = fitCamera(plan, bigger, 1000, fitted, true, false);
    assert.equal(again.zoom, again.minZoom);
});

test('wheel movement becomes notches: a mouse notch is one, a trackpad flick a fraction', () => {
    assert.equal(wheelNotches(-100, 0), 1);
    assert.equal(wheelNotches(100, 0), -1);
    // Two notches merged into one event count as two; a wild delta is capped.
    assert.equal(wheelNotches(-200, 0), 2);
    assert.equal(wheelNotches(-5000, 0), 4);
    assert.equal(wheelNotches(5000, 0), -4);
    assert.equal(wheelNotches(-4, 0), 0.04);
    assert.equal(wheelNotches(3, 1), -1);
    assert.equal(wheelNotches(0, 0), 0);
    assert.equal(wheelNotches(Number.NaN, 0), 0);
});

test('zooming keeps the point under the pointer still, and stops at the limits', () => {
    const cam = { ...startCamera(), zoom: 2, minZoom: 1, fitZoom: 1, offX: 40, offY: -10, atFit: false };
    const mx = 700;
    const my = 300;
    const { cam: zoomed, fit } = zoomAt(cam, SIZE, mx, my, 1, false);
    assert.equal(fit, false);
    close(zoomed.zoom, 2 * 1.15);
    // The legacy formula (4683-4684), and what it means: the origin moves away from the pointer by the ratio.
    close(zoomed.offX, mx - 500 - (mx - 500 - 40) * 1.15);
    close(zoomed.offY, my - 400 - (my - 400 + 10) * 1.15);
    const originBefore = { x: 500 + cam.offX, y: 400 + cam.offY };
    const originAfter = { x: 500 + zoomed.offX, y: 400 + zoomed.offY };
    close((mx - originAfter.x) / (mx - originBefore.x), 1.15);
    close((my - originAfter.y) / (my - originBefore.y), 1.15);
    // Within 3 px of the centre, or while a body is tracked, the zoom is about the centre.
    close(zoomAt(cam, SIZE, 502, 398, 1, false).cam.offX, 40 * 1.15);
    close(zoomAt(cam, SIZE, mx, my, 1, true).cam.offX, 40 * 1.15);
    // A fraction of a notch is that power of the factor.
    close(zoomAt(cam, SIZE, mx, my, 0.5, false).cam.zoom, 2 * Math.sqrt(1.15));
    // Zooming in clears the fitted flag and stops at the ceiling.
    assert.equal(zoomAt({ ...cam, atFit: true }, SIZE, mx, my, 1, false).cam.atFit, false);
    assert.equal(zoomAt({ ...cam, zoom: 4990 }, SIZE, mx, my, 1, false).cam.zoom, MAX_ZOOM);
    // Zooming out divides, and at the floor asks for a fit instead.
    close(zoomAt(cam, SIZE, mx, my, -1, false).cam.zoom, 2 / 1.15);
    assert.equal(zoomAt({ ...cam, zoom: 1.1 }, SIZE, mx, my, -1, false).fit, true);
    assert.equal(zoomAt(cam, SIZE, mx, my, 0, false).cam, cam);
});

test('pan, centre and the moves toward a zoom or a camera', () => {
    const cam = { ...startCamera(), zoom: 2, offX: 10, offY: 20, atFit: false };
    assert.deepEqual([panBy(cam, 5, -7).offX, panBy(cam, 5, -7).offY], [15, 13]);
    const centred = centreOn(cam, { cx: 600, cy: 300 }, SIZE);
    assert.deepEqual([centred.offX, centred.offY], [10 - 100, 20 + 100]);
    const half = centreOn(cam, { cx: 600, cy: 300 }, SIZE, 0.5);
    assert.deepEqual([half.offX, half.offY], [10 - 50, 20 + 50]);
    // Zoom about the system's centre: the offsets scale with it. Half the way is the geometric mean.
    const z = zoomToward(cam, 8, 1);
    assert.deepEqual([z.zoom, z.offX, z.offY], [8, 40, 80]);
    close(zoomToward(cam, 8, 0.5).zoom, 4);
    const target = { ...startCamera(), zoom: 8, offX: -30, offY: 5, minZoom: 3, fitZoom: 3 };
    assert.deepEqual(toward(cam, target, 1), target);
    const part = toward(cam, target, 0.5);
    close(part.zoom, 4);
    close(part.offX, 20 + (-30 - 20) * 0.5);
    assert.equal(part.minZoom, 3);
});

test('framing a body puts it at the centre with what orbits it inside the padding', () => {
    const fitted = fitCamera(plan, SIZE, 1000, startCamera(), false, false);
    const hitsFor = (camera) => layoutScene(plan, viewOf(camera, SIZE, false), 1000).hits;
    const cam = frameCamera(plan, SIZE, fitted, 'w2', hitsFor);
    assert.ok(cam);
    assert.equal(cam.atFit, false);
    const scene = layoutScene(plan, viewOf(cam, SIZE, false), 1000);
    const hit = hitOf(scene, 'w2');
    close(hit.cx, SIZE.w / 2, 1e-6);
    close(hit.cy, SIZE.h / 2, 1e-6);
    const box = localBounds(plan, scene, 'w2');
    assert.ok(box.right - box.left <= SIZE.w - FRAME_PAD * 2 + 4);
    assert.ok(box.bottom - box.top <= SIZE.h - FRAME_PAD * 2 + 4);
    // It zoomed in to do so, and never below the fit.
    assert.ok(cam.zoom > fitted.zoom);
    assert.equal(frameCamera(plan, SIZE, fitted, 'w9', hitsFor), null);
});

test('an eased move lands exactly, even toward a target that moves', () => {
    assert.equal(easeInOut(0), 0);
    assert.equal(easeInOut(1), 1);
    assert.equal(easeInOut(0.5), 0.5);
    assert.ok(easeInOut(0.25) < 0.25 && easeInOut(0.75) > 0.75);
    assert.equal(tweenShare(1, 0.5), 0.5);
    assert.equal(tweenShare(0.5, 0.25), 0.5);
    assert.equal(tweenShare(0.2, 0), 1);
    assert.equal(tweenShare(0, 0), 1);
    // Chase a target that drifts each frame: the gap follows the curve and closes at the end.
    let at = 0;
    let remain = 1;
    for (let frame = 1; frame <= 10; frame++) {
        const target = 100 + frame * 3;
        const now = 1 - easeInOut(frame / 10);
        at += (target - at) * tweenShare(remain, now);
        remain = now;
        if (frame === 10) assert.equal(at, target);
    }
});

test('the stage: the fitted view refits as bodies move, and an unchanged frame is not repainted', () => {
    const stage = new OrbitStage();
    assert.equal(stage.tick(0, 0), null);
    stage.setPlan(plan);
    stage.resize(1000, 800, 1000);
    const first = stage.tick(1000, 0);
    assert.equal(first.changed, true);
    assert.equal(stage.fitted, true);
    const again = stage.tick(1000, 16);
    assert.equal(again.changed, false);
    assert.equal(again.picture, first.picture);
    // The clock moves: the companion moves, and the fit follows it.
    const later = stage.tick(1000 + 4000, 32);
    assert.equal(later.changed, true);
    const expected = fitCamera(plan, SIZE, 5000, stage.cam, false, false);
    close(stage.cam.zoom, expected.zoom);
    assert.equal(stage.cam.atFit, true);
});

test('the stage: a click follows a body, a drag past the slop lets it go', () => {
    const stage = new OrbitStage();
    stage.setPlan(plan);
    stage.resize(1000, 800, 1000);
    const frame = stage.tick(1000, 0);
    const world = hitOf(frame.picture, 'w0');
    assert.equal(stage.pick(world.cx, world.cy).key, 'w0');
    assert.equal(stage.pick(2, 2), null);
    // No motion tokens: the follow is the legacy cut.
    stage.follow('w0', 0);
    const followed = stage.tick(1000, 16);
    close(hitOf(followed.picture, 'w0').cx, 500);
    close(hitOf(followed.picture, 'w0').cy, 400);
    assert.equal(stage.fitted, false);
    // It stays centred as the clock runs.
    const later = stage.tick(1030, 32);
    close(hitOf(later.picture, 'w0').cx, 500);
    // A press that has not passed the slop pans without letting go; past it, the follow ends.
    stage.drag(2, 0, false);
    assert.equal(stage.tracked, 'w0');
    stage.drag(20, 0, true);
    assert.equal(stage.tracked, null);
    const before = stage.cam.offX;
    stage.tick(1060, 48);
    assert.equal(stage.cam.offX, before);
});

test('the stage: an eased follow glides to the body and lands on it', () => {
    const stage = new OrbitStage();
    stage.motion = { hop: 400, flight: 800 };
    stage.setPlan(plan);
    stage.resize(1000, 800, 1000);
    const start = hitOf(stage.tick(1000, 0).picture, 'w0');
    const gap = Math.hypot(start.cx - 500, start.cy - 400);
    stage.follow('w0', 0);
    const mid = stage.tick(1000, 200);
    assert.equal(mid.moving, true);
    const midGap = Math.hypot(hitOf(mid.picture, 'w0').cx - 500, hitOf(mid.picture, 'w0').cy - 400);
    close(midGap, gap * 0.5, 1e-6);
    const end = stage.tick(1000, 400);
    assert.equal(end.moving, false);
    close(hitOf(end.picture, 'w0').cx, 500);
    close(hitOf(end.picture, 'w0').cy, 400);
});

test('the stage: a double click frames, Fit returns, and zooming out to the floor fits', () => {
    const stage = new OrbitStage();
    stage.setPlan(plan);
    stage.resize(1000, 800, 1000);
    stage.tick(1000, 0);
    const fitZoom = stage.cam.zoom;
    assert.equal(stage.frame('w2', 1000, 0), true);
    const framed = stage.tick(1000, 16);
    assert.ok(stage.cam.zoom > fitZoom);
    close(hitOf(framed.picture, 'w2').cx, 500);
    assert.equal(stage.tracked, 'w2');
    assert.equal(stage.frame('w9', 1000, 16), false);
    assert.equal(stage.tracked, null);
    // Zoom in at the pointer, then out past the floor: the view fits again.
    stage.wheel(700, 300, 1, 1000, 32);
    stage.tick(1000, 48);
    assert.equal(stage.fitted, false);
    for (let i = 0; i < 80 && !stage.fitted; i++) {
        stage.wheel(700, 300, -1, 1000, 64 + i);
        stage.tick(1000, 64 + i);
    }
    assert.equal(stage.fitted, true);
    close(stage.cam.zoom, stage.cam.minZoom);
    // Fit lets go of a followed body.
    stage.follow('w0', 200);
    stage.tick(1000, 216);
    stage.fit(232);
    stage.tick(1000, 248);
    assert.equal(stage.tracked, null);
    assert.equal(stage.cam.atFit, true);
});

test('the stage: an eased fit flies there, and a wheel takes over without a jump', () => {
    const stage = new OrbitStage();
    stage.motion = { hop: 400, flight: 800 };
    stage.setPlan(plan);
    stage.resize(1000, 800, 1000);
    stage.tick(1000, 0);
    const fitZoom = stage.cam.zoom;
    stage.wheel(700, 300, 1, 1000, 0);
    stage.wheel(700, 300, 1, 1000, 0);
    stage.wheel(700, 300, 1, 1000, 0);
    stage.tick(1000, 16);
    const zoomedIn = stage.cam.zoom;
    stage.fit(100);
    const mid = stage.tick(1000, 500);
    assert.equal(mid.moving, true);
    assert.ok(stage.cam.zoom < zoomedIn && stage.cam.zoom > fitZoom);
    assert.equal(stage.cam.atFit, false);
    const during = stage.cam.zoom;
    stage.wheel(700, 300, 1, 1000, 510);
    close(stage.cam.zoom, during * 1.15);
    const after = stage.tick(1000, 520);
    assert.equal(after.moving, false);
    close(stage.cam.zoom, during * 1.15);
    // Left alone, a fit completes and becomes the fitted view.
    stage.fit(600);
    stage.tick(1000, 1000);
    stage.tick(1000, 1400);
    assert.equal(stage.cam.atFit, true);
    close(stage.cam.zoom, fitZoom);
});
