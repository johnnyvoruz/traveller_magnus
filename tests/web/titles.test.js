import assert from 'node:assert/strict';
import { test } from 'node:test';
import { toScreen } from '../../apps/web/src/map/camera.ts';
import { ROW_STEP } from '../../apps/web/src/map/geometry.ts';
import {
    boxesOverlap, clampTitle, fadeToward, placeTitle, stepScale, titleAnchor, titleCandidates, titleFits, zoomStep,
} from '../../apps/web/src/map/titles.ts';

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

// B1.12a: decided once in map space, sticky at the edges, faded instead of moved.

const subsector = { x: 0, y: 0, w: 8, h: 10 * ROW_STEP };
const PILL_W = 100;
const PILL_H = 20;
const wide = { x: -100000, y: -100000, w: 200000, h: 200000 };

test('the zoom step is two per doubling and placement is decided at its middle', () => {
    assert.equal(zoomStep(64), 12);
    assert.equal(zoomStep(80), 13);
    assert.equal(zoomStep(100), 13);
    assert.equal(zoomStep(110), 14);
    assert.equal(stepScale(12), 64);
    assert.ok(Math.abs(stepScale(13) - 64 * Math.SQRT2) < 1e-9);
});

test('panning in ten steps leaves the anchor where it is on the map: the pill moves exactly as the pan does', () => {
    const worlds = [{ x: 1.6, y: 0.9 }, { x: 5, y: 7 }];
    const vp = { width: 1200, height: 900 };
    const ppp = 80;
    const anchor = titleAnchor(subsector, zoomStep(ppp), PILL_W, PILL_H, worlds);
    assert.ok(anchor);
    let previous = null;
    for (let i = 0; i <= 10; i++) {
        const cam = { x: 2 + i * 0.25, y: 3 + i * 0.1, ppp };
        // The anchor is a function of the subsector and the zoom step only, never of the camera.
        assert.deepEqual(titleAnchor(subsector, zoomStep(cam.ppp), PILL_W, PILL_H, worlds), anchor);
        const at = toScreen(cam, vp, anchor.x, anchor.y);
        const home = toScreen(cam, vp, subsector.x, subsector.y);
        const spot = clampTitle({ x: at.sx, y: at.sy }, PILL_W, PILL_H, { x: home.sx, y: home.sy, w: subsector.w * ppp, h: subsector.h * ppp }, wide);
        if (previous) {
            assert.ok(Math.abs((spot.x - previous.x) - (-0.25 * ppp)) < 1e-9);
            assert.ok(Math.abs((spot.y - previous.y) - (-0.1 * ppp)) < 1e-9);
        }
        previous = spot;
    }
});

test('the anchor changes only when the zoom step changes', () => {
    const worlds = [{ x: 1.6, y: 0.9 }];
    const at80 = titleAnchor(subsector, zoomStep(80), PILL_W, PILL_H, worlds);
    assert.deepEqual(titleAnchor(subsector, zoomStep(90), PILL_W, PILL_H, worlds), at80);
    assert.deepEqual(titleAnchor(subsector, zoomStep(100), PILL_W, PILL_H, worlds), at80);
    const at64 = titleAnchor(subsector, zoomStep(64), PILL_W, PILL_H, worlds);
    assert.notDeepEqual(at64, at80);
    // At the lower step the same world is close enough to push the pill along the top edge.
    assert.ok(at64.x > at80.x);
    assert.ok(Math.abs(at64.y * stepScale(12) - at80.y * stepScale(13)) < 1e-9);
});

test('the anchor keeps clear of the worlds of its own subsector and ignores distant ones', () => {
    const clear = titleAnchor(subsector, 13, PILL_W, PILL_H, []);
    const scale = stepScale(13);
    assert.deepEqual(clear, { x: 4 / scale, y: 4 / scale });
    const under = { x: (4 + PILL_W / 2) / scale, y: (4 + PILL_H / 2) / scale };
    const moved = titleAnchor(subsector, 13, PILL_W, PILL_H, [under]);
    assert.ok(moved.x > clear.x);
    assert.deepEqual(titleAnchor(subsector, 13, PILL_W, PILL_H, [{ x: 40, y: 40 }]), clear);
    assert.equal(titleAnchor({ x: 0, y: 0, w: 0.5, h: 0.1 }, 13, PILL_W, PILL_H, []), null);
});

test('a clamped pill is sticky at the edge and never moves further than the pan does', () => {
    const ppp = 80;
    const bounds = { x: 300, y: 56, w: 900, h: 700 };
    const homeW = subsector.w * ppp;
    const homeH = subsector.h * ppp;
    const offset = { x: 4, y: 4 };
    let previous = null;
    let stuck = 0;
    let riding = 0;
    // The subsector crosses the bounds from the right edge to beyond the left edge, one pixel a frame.
    for (let homeX = bounds.x + bounds.w + 50; homeX > bounds.x - homeW - 50; homeX -= 1) {
        const home = { x: homeX, y: 100, w: homeW, h: homeH };
        const spot = clampTitle({ x: homeX + offset.x, y: home.y + offset.y }, PILL_W, PILL_H, home, bounds);
        // Never outside its own subsector.
        assert.ok(spot.x >= home.x + 4 && spot.x + PILL_W <= home.x + home.w - 4 + 1e-9);
        if (previous) {
            assert.ok(Math.abs(spot.x - previous.x) <= 1 + 1e-9, 'x moved further than the pan');
            assert.ok(Math.abs(spot.y - previous.y) <= 1e-9, 'y moved without a vertical pan');
        }
        if (spot.x === bounds.x + 4) stuck += 1;
        if (spot.x === homeX + offset.x) riding += 1;
        previous = spot;
    }
    assert.ok(riding > 100, 'the pill rides with the map while its anchor is in view');
    assert.ok(stuck > 100, 'the pill holds at the edge while its subsector still covers it');

    // The same holds for a vertical pan.
    previous = null;
    for (let homeY = bounds.y + bounds.h + 50; homeY > bounds.y - homeH - 50; homeY -= 1) {
        const home = { x: 400, y: homeY, w: homeW, h: homeH };
        const spot = clampTitle({ x: home.x + offset.x, y: homeY + offset.y }, PILL_W, PILL_H, home, bounds);
        if (previous) assert.ok(Math.abs(spot.y - previous.y) <= 1 + 1e-9, 'y moved further than the pan');
        previous = spot;
    }
});

test('a title is shown only where the visible part of its subsector can hold it, and fades in steps', () => {
    const bounds = { x: 0, y: 56, w: 1000, h: 700 };
    assert.equal(titleFits(PILL_W, PILL_H, { x: 100, y: 100, w: 640, h: 900 }, bounds), true);
    // A sliver narrower than the pill, entering from the right.
    assert.equal(titleFits(PILL_W, PILL_H, { x: 940, y: 100, w: 640, h: 900 }, bounds), false);
    assert.equal(titleFits(PILL_W, PILL_H, { x: 880, y: 100, w: 640, h: 900 }, bounds), true);
    // A strip shorter than the pill, leaving at the top.
    assert.equal(titleFits(PILL_W, PILL_H, { x: 100, y: -830, w: 640, h: 900 }, bounds), false);

    assert.equal(boxesOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 9, y: 9, w: 10, h: 10 }), true);
    assert.equal(boxesOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 10, h: 10 }), false);

    assert.equal(fadeToward(0, 1, 0.25), 0.25);
    assert.equal(fadeToward(0.9, 1, 0.25), 1);
    assert.equal(fadeToward(1, 0, 0.25), 0.75);
    assert.equal(fadeToward(0.1, 0, 0.25), 0);
    assert.equal(fadeToward(0.5, 1, 0), 0.5);
});
