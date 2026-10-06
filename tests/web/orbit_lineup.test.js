/**
 * The Row and Column line-ups (apps/web/src/orbit/lineup.ts), the travelling transition
 * between layouts (tween.ts, campaign_manager_plan.md §7.8), the stage's layout and layer
 * switches (stage.ts, picture.ts) and day and night (daynight.ts). Expected values are
 * computed here from the legacy formulas (js/system_viewer.js:2359-2669) and the plan's
 * numbers, not copied from the modules' output.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lineupFit, startCamera } from '../../apps/web/src/orbit/camera.ts';
import { cardFor } from '../../apps/web/src/orbit/card.ts';
import { bodyByKey } from '../../apps/web/src/orbit/bodies.ts';
import {
    dayFraction, DAYLIGHT_LATITUDE, daylightFraction, dayNightFigure, dayNightFor, dayNightLines, hoursText, rulerFor,
    scoutReadout,
    markerAt,
    starportTick,
    spanText, standardText, yearFigure,
    spinAngle, subsolarLatitude, subsolarLongitude, sunElevation, turningOf,
} from '../../apps/web/src/orbit/daynight.ts';
import { hitOf, layoutScene, moonOrbitRadius, planSystem } from '../../apps/web/src/orbit/layout.ts';
import {
    beltRocks, inHabitableZone, layoutLineup, lineupCaption, lineupMetrics, lineupNodes, lineupReach,
    lineupScreen, lineupSlot, lineupZoomScale,
} from '../../apps/web/src/orbit/lineup.ts';
import { bodyAngle, starBasePx, worldBasePx } from '../../apps/web/src/orbit/maths.ts';
import { formatDisplayNumber } from '../../apps/web/src/dossier/labels.ts';
import { DEFAULT_LAYERS, orbitPicture } from '../../apps/web/src/orbit/picture.ts';
import { OrbitStage } from '../../apps/web/src/orbit/stage.ts';
import {
    blendPictures, bodyProgress, easeQuint, fadeIn, fadeOut, moveDuration, STAGGER_CAP_MS, STAGGER_MS,
    staggerDelay, travelOrder, unspool, UNSPOOL_PX,
} from '../../apps/web/src/orbit/tween.ts';
import { HEX_KEY, testSystem } from './orbit_fixture.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, a + ' is not ' + b);
const VIEW = { w: 1000, h: 800, zoom: 1, offX: 0, offY: 0, z: 1, linear: false };
const sys = testSystem();
const plan = planSystem(sys, HEX_KEY);
const worldsOf = (picture) => picture.layers.flatMap((layer) => layer.worlds);
const pathsOf = (picture) => picture.layers.flatMap((layer) => layer.paths);

test('a line-up is the primary, then every body by distance, a companion’s worlds straight after it', () => {
    const nodes = lineupNodes(plan);
    assert.deepEqual(nodes.map((node) => node.kind + ':' + node.key), ['star:s0', 'world:w0', 'belt:w3', 'world:w2', 'star:s1', 'world:w4']);
    // The habitable zone a node is judged on: its own AU round its own star.
    assert.equal(nodes[5].hzStar, 1);
    assert.equal(nodes[5].hzAu, 0.2);
    assert.equal(nodes[0].hzAu, null);
    assert.equal(inHabitableZone(plan, 0.2, 1), true, 'the companion’s zone is centred on the root of its luminosity');
    assert.equal(inHabitableZone(plan, 0.5, 0), false);
    assert.equal(inHabitableZone(plan, null, 0), false);
    assert.deepEqual(nodes.map(lineupCaption), ['G2 V', 'Test I', 'Test Belt', 'Test II', 'M0 V (Far)', 'Test B-I']);
});

test('line-up metrics: even slots, a caption gutter, and a disc scale that fits the fullest slot', () => {
    const nodes = lineupNodes(plan);
    const row = lineupMetrics(nodes, true, 1000, 800, true);
    const slot = (1000 - 88) / 6;
    assert.equal(row.pad, 44);
    close(row.slot, slot);
    assert.equal(row.labelGutter, 52);
    assert.equal(row.crossPos, (800 - 52) / 2);
    // The gas giant has three moons (one a ring) and one ring: the gap is 10 + 2 × 6.
    const gap = 22;
    const starBase = Math.max(28, starBasePx(sys.stars[0]), starBasePx(sys.stars[1]));
    close(row.disc, Math.max(0.45, Math.min((row.crossPos - 12) / (14 + gap), (slot * 0.42) / (14 + gap), (slot * 0.32) / starBase, 2.4)));
    // With the moons hidden the gap goes.
    close(lineupMetrics(nodes, true, 1000, 800, false).disc, Math.max(0.45, Math.min((row.crossPos - 12) / 14, (slot * 0.42) / 14, (slot * 0.32) / starBase, 2.4)));
    const column = lineupMetrics(nodes, false, 1000, 800, true);
    close(column.slot, (800 - 88) / 6);
    assert.equal(column.labelGutter, 210);
    assert.equal(column.crossPos, (1000 - 210) / 2);
    // Slots: along the row, or down the column.
    assert.deepEqual(lineupSlot(row, 0), { lx: 44 + slot * 0.5, ly: row.crossPos });
    assert.deepEqual(lineupSlot(column, 2), { lx: column.crossPos, ly: 44 + column.slot * 2.5 });
    // The camera scales about the canvas centre; bodies grow only past the fitted zoom of 1.
    assert.deepEqual(lineupScreen(100, 100, VIEW), { x: 100, y: 100 });
    assert.deepEqual(lineupScreen(100, 100, { ...VIEW, zoom: 2, offX: 10, offY: -5 }), { x: 500 + 10 + (100 - 500) * 2, y: 400 - 5 + (100 - 400) * 2 });
    assert.equal(lineupZoomScale(0.8, 1), 0.8);
    assert.equal(lineupZoomScale(0.8, 0.5), 0.8);
    close(lineupZoomScale(0.8, 3), 2.4);
});

test('a line-up picture places every body in its slot with its moons round it', () => {
    const nodes = lineupNodes(plan);
    const metrics = lineupMetrics(nodes, true, 1000, 800, true);
    const picture = layoutLineup(plan, VIEW, 'row', 1000, DEFAULT_LAYERS);
    assert.equal(picture.mode, 'row');
    assert.equal(picture.orbital, false);
    close(picture.z, metrics.disc);
    // The primary in the first slot, the companion in the fifth; no names under them here.
    const [primary, companion] = picture.stars;
    close(primary.x, 44 + metrics.slot * 0.5);
    close(primary.y, metrics.crossPos);
    close(primary.r, starBasePx(sys.stars[0]) * metrics.disc);
    close(companion.x, 44 + metrics.slot * 4.5);
    assert.deepEqual([primary.glow, primary.label], [1.45, 0]);
    // The gas giant in the fourth slot, lit from the primary, its first moon 10 px out past the rings.
    const giant = worldsOf(picture).find((world) => world.world.key === 'w2');
    close(giant.x, 44 + metrics.slot * 3.5);
    close(giant.r, worldBasePx(sys.worlds[2]) * metrics.disc);
    assert.deepEqual([giant.starX, giant.starY], [primary.x, primary.y]);
    close(giant.moons[0].orbitR, moonOrbitRadius(giant.r, 0, true, metrics.disc));
    assert.equal(giant.label, 0);
    // An arc behind the row for every node but the primary, at its distance from the star.
    const paths = pathsOf(picture);
    assert.deepEqual(paths.map((path) => path.key), ['w0', 'w3', 'w2', 's1', 'w4']);
    close(paths[2].r, metrics.slot * 3);
    close(paths[2].alpha, 0.65 * 0.55);
    assert.ok(paths.every((path) => path.style === 'solid' && path.cx === primary.x && path.cy === primary.y));
    // The belt: 72 rocks inside its band, the same every time, and five hit targets across it.
    const rocks = picture.layers[0].rocks[0];
    assert.equal(rocks.key, 'w3');
    assert.equal(rocks.dots.length, 72);
    const beltX = 44 + metrics.slot * 2.5;
    const halfThick = Math.max(8, 11 * metrics.disc);
    for (const dot of rocks.dots) assert.ok(Math.abs(dot.x - beltX) <= halfThick + 1e-9 && dot.alpha >= 0.35 && dot.alpha <= 0.9);
    assert.equal(beltRocks(HEX_KEY, plan.worlds[2]), beltRocks(HEX_KEY, plan.worlds[2]));
    assert.equal(picture.hits.filter((hit) => hit.key === 'w3').length, 5);
    assert.equal(picture.hits.find((hit) => hit.key === 'w3').kind, 'belt');
    // The panel behind the companion's world, the only body in a habitable zone here.
    assert.deepEqual(picture.layers[0].panels.map((panel) => panel.key), ['hzp:w4']);
    close(picture.layers[0].panels[0].w, metrics.slot * 0.9);
    // Captions under the row, one per node, each with its short name to fall back on.
    assert.deepEqual(picture.captions.map((caption) => caption.text), nodes.map(lineupCaption));
    assert.equal(picture.captions[1].short, 'I');
    let maxReach = 0;
    for (const node of nodes) maxReach = Math.max(maxReach, lineupReach(node, metrics.disc, 1, true));
    close(picture.captions[0].y, metrics.crossPos + maxReach + 16);
    assert.equal(picture.captions[0].align, 'center');
    close(picture.captions[0].maxW, Math.max(24, metrics.slot * 0.92));
    // Every body can be hit, hovered and selected, as in the orbits layout.
    for (const key of ['s0', 's1', 'w0', 'w2', 'w2m0', 'w2m2', 'w2m3', 'w3', 'w4']) assert.ok(hitOf(picture, key), key);
    assert.equal(picture.centre, null);
});

test('a column runs down the canvas with captions beside it, and the switches apply', () => {
    const nodes = lineupNodes(plan);
    const metrics = lineupMetrics(nodes, false, 1000, 800, true);
    const picture = layoutLineup(plan, VIEW, 'column', 1000, DEFAULT_LAYERS);
    close(picture.stars[0].x, metrics.crossPos);
    close(picture.stars[0].y, 44 + metrics.slot * 0.5);
    assert.equal(picture.captions[0].align, 'left');
    assert.ok(picture.captions[0].x > metrics.crossPos);
    // The panel lies along its own slot, wider than tall.
    const panel = picture.layers[0].panels[0];
    assert.ok(panel.w > panel.h);
    close(panel.h, metrics.slot * 0.9);
    const bare = layoutLineup(plan, { ...VIEW, moons: false }, 'column', 1000, { ...DEFAULT_LAYERS, paths: false, habitable: false, moons: false, markMainworld: false });
    assert.equal(pathsOf(bare).length, 0);
    assert.equal(bare.layers[0].panels.length, 0);
    assert.ok(worldsOf(bare).every((world) => world.moons.length === 0 && world.rings.length === 0));
    assert.ok(!bare.hits.some((hit) => hit.kind === 'moon' || hit.kind === 'ring'));
});

test('the orbits picture keeps the legacy paint order and obeys the switches', () => {
    const scene = layoutScene(plan, VIEW, 1000);
    const picture = orbitPicture(plan, scene, DEFAULT_LAYERS, 1);
    assert.equal(picture.orbital, true);
    // The primary's band and the jump circles; the companion's orbit; its band and world; the primary's worlds.
    assert.deepEqual(picture.layers.map((layer) => [layer.bands.length, layer.jumps.length > 0, layer.paths.map((p) => p.style + ':' + p.key).join(' '), layer.worlds.map((w) => w.world.key).join(' ')]), [
        [1, true, '', ''],
        [0, false, 'dashed:s1', ''],
        [1, false, 'solid:w4', 'w4'],
        [0, false, 'belt:w3 solid:w0 solid:w2', 'w0 w2'],
    ]);
    close(pathsOf(picture).find((path) => path.key === 'w0').alpha, 0.65 * 0.40);
    close(pathsOf(picture).find((path) => path.key === 's1').alpha, 0.65 * 0.55);
    assert.deepEqual(picture.centre, { x: 500, y: 400 });
    assert.ok(picture.stars.every((star) => star.glow === 1.38 && star.label === 1));
    const off = orbitPicture(plan, scene, { ...DEFAULT_LAYERS, paths: false, habitable: false, jump: false }, 1);
    assert.deepEqual(pathsOf(off).map((path) => path.style), ['belt']);
    assert.ok(off.layers.every((layer) => layer.bands.length === 0 && layer.jumps.length === 0));
});

test('the tween’s curve, stagger, unspool and fades are the plan’s numbers', () => {
    assert.equal(easeQuint(0), 0);
    assert.equal(easeQuint(1), 1);
    assert.equal(easeQuint(0.5), 0.5);
    close(easeQuint(0.25), 16 * Math.pow(0.25, 5));
    close(easeQuint(0.25) + easeQuint(0.75), 1);
    assert.equal(easeQuint(-1), 0);
    assert.equal(easeQuint(2), 1);
    // 28 ms a body, innermost first; with many bodies the last still sets off by 220 ms.
    assert.deepEqual([STAGGER_MS, STAGGER_CAP_MS, UNSPOOL_PX], [28, 220, 12]);
    assert.equal(staggerDelay(0, 6), 0);
    assert.equal(staggerDelay(3, 6), 84);
    close(staggerDelay(19, 20), 220);
    close(staggerDelay(10, 20), 220 * 10 / 19);
    assert.equal(moveDuration(650, 6), 650 + 140);
    assert.equal(moveDuration(0, 6), 0);
    assert.equal(bodyProgress(84, 84, 650), 0);
    assert.equal(bodyProgress(84 + 325, 84, 650), 0.5);
    assert.equal(bodyProgress(10, 84, 650), 0);
    assert.equal(bodyProgress(5, 0, 0), 1);
    // A body leaves its orbit on a curve: 12 px sideways at a tenth of the way, none past a fifth.
    assert.equal(unspool(0), 0);
    close(unspool(0.1), 12);
    close(unspool(0.05), 12 * Math.sin(Math.PI / 4));
    assert.equal(unspool(0.2), 0);
    assert.equal(unspool(0.6), 0);
    assert.deepEqual([fadeOut(0), fadeOut(0.3), fadeOut(0.9)], [1, 0, 0]);
    close(fadeOut(0.15), 0.5);
    assert.deepEqual([fadeIn(0), fadeIn(0.6), fadeIn(1)], [0, 0, 1]);
    close(fadeIn(0.8), 0.5);
    // Bodies set off from the primary outward; a companion's worlds straight after it.
    const order = travelOrder(plan);
    assert.deepEqual([...order.entries()].sort((a, b) => a[1] - b[1]).map((entry) => entry[0]), ['s0', 'w0', 'w3', 'w2', 's1', 'w4']);
});

test('bodies travel from one layout to the other: they start where they were and land where they belong', () => {
    const from = orbitPicture(plan, layoutScene(plan, VIEW, 1000), DEFAULT_LAYERS, 1);
    const to = layoutLineup(plan, VIEW, 'row', 1000, DEFAULT_LAYERS);
    const order = travelOrder(plan);
    const at = (elapsed) => blendPictures({ from, to, elapsed, ms: 650, order, days: 1000, moonsShown: true });
    const world = (picture, key) => worldsOf(picture).find((item) => item.world.key === key);
    const start = at(0);
    const end = at(moveDuration(650, order.size));
    for (const key of ['w0', 'w2', 'w4']) {
        close(world(start, key).x, world(from, key).x);
        close(world(start, key).y, world(from, key).y);
        close(world(end, key).x, world(to, key).x);
        close(world(end, key).y, world(to, key).y);
        close(world(end, key).r, world(to, key).r);
    }
    close(start.stars[0].x, from.stars[0].x);
    close(end.stars[0].x, to.stars[0].x);
    assert.equal(start.mode, 'blend');

    // Half way through its own tween a body is half way there (the unspool is over by then),
    // and the innermost bodies are ahead of the outer ones.
    const mid = at(staggerDelay(order.get('w2'), order.size) + 325);
    close(world(mid, 'w2').x, (world(from, 'w2').x + world(to, 'w2').x) / 2);
    close(world(mid, 'w2').r, (world(from, 'w2').r + world(to, 'w2').r) / 2);
    const lead = at(300);
    const share = (key) => (world(lead, key).r - world(from, key).r) / (world(to, key).r - world(from, key).r);
    assert.ok(share('w0') > share('w2') && share('w2') > share('w4'));
    // Early on, a body runs on along its orbit: off the straight line, by no more than 12 px.
    const early = at(staggerDelay(order.get('w0'), order.size) + 650 * 0.3);
    const e = easeQuint(0.3);
    const straightX = world(from, 'w0').x + (world(to, 'w0').x - world(from, 'w0').x) * e;
    const straightY = world(from, 'w0').y + (world(to, 'w0').y - world(from, 'w0').y) * e;
    const off = Math.hypot(world(early, 'w0').x - straightX, world(early, 'w0').y - straightY);
    close(off, unspool(e));
    assert.ok(off > 0 && off <= 12);

    // Moons ride their world: placed round its travelling disc at its travelling size.
    const giant = world(mid, 'w2');
    close(Math.hypot(giant.moons[0].x - giant.x, giant.moons[0].y - giant.y), moonOrbitRadius(giant.r, 0, true, giant.z));
    // The hit targets travel too, so a card or a lock follows the body.
    close(hitOf(mid, 'w2').cx, giant.x);
    close(hitOf(mid, 's0').cx, mid.stars[0].x);

    // Orbit rings deform into the line-up's arcs; a belt's dashes thin as the plain arc comes in.
    const ring = (picture, key, style) => pathsOf(picture).find((path) => path.key === key && path.style === style);
    close(ring(mid, 'w2', 'solid').r, (ring(from, 'w2', 'solid').r + ring(to, 'w2', 'solid').r) / 2);
    const beltMid = at(staggerDelay(order.get('w3'), order.size) + 325);
    assert.ok(ring(beltMid, 'w3', 'belt').width < 5 && ring(beltMid, 'w3', 'belt').alpha < 1);
    assert.ok(ring(beltMid, 'w3', 'solid').alpha > 0);
    close(ring(beltMid, 'w3', 'belt').r, ring(beltMid, 'w3', 'solid').r);
    assert.equal(pathsOf(end).filter((path) => path.key === 'w3' && path.alpha > 0).map((path) => path.style).join(), 'solid');

    // What only one layout has: the bands, jump circles and orbit labels go early; rocks, panels and captions arrive late.
    const third = at(moveDuration(650, order.size) * 0.5);
    assert.ok(third.layers[0].bands.every((band) => band.alpha === 0));
    assert.ok(third.layers[0].jumps.every((jump) => jump.alpha === 0));
    assert.ok(third.captions.every((caption) => caption.alpha === 0));
    assert.ok(start.layers[0].bands.every((band) => band.alpha === 1) && start.layers[0].rocks.every((rocks) => rocks.alpha === 0));
    assert.ok(end.captions.every((caption) => caption.alpha === 1) && end.layers[0].rocks.every((rocks) => rocks.alpha === 1));
    assert.equal(end.stars[0].label, 0);
    assert.equal(start.stars[0].label, 1);

    // The way back is the same journey reversed: bodies curve into their orbits at the end.
    const back = blendPictures({ from: to, to: from, elapsed: moveDuration(650, order.size), ms: 650, order, days: 1000, moonsShown: true });
    close(world(back, 'w2').x, world(from, 'w2').x);
    // Row to Column: positions only, no curve.
    const column = layoutLineup(plan, VIEW, 'column', 1000, DEFAULT_LAYERS);
    const turn = blendPictures({ from: to, to: column, elapsed: 325, ms: 650, order, days: 1000, moonsShown: true });
    close(world(turn, 'w0').x, world(to, 'w0').x + (world(column, 'w0').x - world(to, 'w0').x) * bodyProgress(325, staggerDelay(1, 6), 650));
    // A move can begin from a picture that is itself part way: nothing jumps.
    const again = blendPictures({ from: mid, to: column, elapsed: 0, ms: 650, order, days: 1000, moonsShown: true });
    close(world(again, 'w2').x, world(mid, 'w2').x);
    close(world(again, 'w2').y, world(mid, 'w2').y);
    close(again.stars[1].x, mid.stars[1].x);
});

test('the stage: a change of layout cuts under reduced motion, and a line-up is fitted at zoom 1', () => {
    assert.deepEqual(lineupFit({ ...startCamera(), zoom: 3, offX: 40, atFit: true }, true), { ...startCamera(), zoom: 1, offX: 0 });
    const kept = lineupFit({ ...startCamera(), zoom: 3, offX: 40, minZoom: 0.9, fitZoom: 0.9, atFit: false }, true);
    assert.deepEqual([kept.zoom, kept.offX, kept.minZoom, kept.fitZoom], [3, 40, 1, 1]);
    assert.equal(lineupFit({ ...startCamera(), zoom: 0.4, atFit: false }, true).zoom, 1);

    const stage = new OrbitStage();
    stage.setPlan(plan);
    stage.resize(1000, 800, 1000);
    assert.equal(stage.tick(1000, 0).picture.mode, 'orbits');
    stage.follow('w0', 0);
    stage.setMode('row', 16);
    const frame = stage.tick(1000, 32);
    assert.equal(frame.picture.mode, 'row');
    assert.equal(frame.moving, false);
    assert.equal(stage.mode, 'row');
    assert.equal(stage.tracked, null, 'a change of layout lets go of a followed body');
    assert.deepEqual([stage.cam.zoom, stage.cam.offX, stage.cam.offY, stage.cam.atFit], [1, 0, 0, true]);
    // Zoom in, then out to the floor: the line-up fits again at zoom 1.
    stage.wheel(700, 300, 1, 1000, 48);
    stage.tick(1000, 64);
    close(stage.cam.zoom, 1.15);
    stage.wheel(700, 300, -1, 1000, 80);
    stage.tick(1000, 96);
    assert.deepEqual([stage.cam.zoom, stage.cam.offX, stage.cam.atFit], [1, 0, true]);
    // A body is framed in a line-up as on its orbit.
    assert.equal(stage.frame('w2', 1000, 100), true);
    const framed = stage.tick(1000, 116);
    close(hitOf(framed.picture, 'w2').cx, 500);
    assert.ok(stage.cam.zoom > 1);
    // The same layout again does nothing.
    stage.setMode('row', 120);
    assert.equal(stage.tracked, 'w2');
});

test('the stage: with motion, bodies travel, the clock keeps running, and a second change retargets without a jump', () => {
    const stage = new OrbitStage();
    stage.motion = { hop: 400, flight: 800, lineup: 650 };
    stage.setPlan(plan);
    stage.resize(1000, 800, 1000);
    const before = stage.tick(1000, 0).picture;
    const worldAt = (picture, key) => worldsOf(picture).find((item) => item.world.key === key);
    stage.setMode('row', 100);
    assert.equal(stage.target, 'row');
    assert.equal(stage.mode, 'orbits');
    const first = stage.tick(1000, 100);
    assert.equal(first.picture.mode, 'blend');
    assert.equal(first.moving, true);
    close(worldAt(first.picture, 'w2').x, worldAt(before, 'w2').x);
    // The clock moves under it: the blend is built from both layouts at the new date.
    const mid = stage.tick(1002, 400);
    assert.equal(mid.moving, true);
    // Input waits for the move to finish.
    const zoomDuring = stage.cam.zoom;
    stage.wheel(700, 300, 1, 1002, 410);
    stage.drag(30, 0, true);
    assert.equal(stage.cam.zoom, zoomDuring);
    // A second change part way: it starts from where the bodies are.
    const here = worldAt(stage.tick(1002, 420).picture, 'w2');
    stage.setMode('column', 420);
    const retargeted = worldAt(stage.tick(1002, 420).picture, 'w2');
    close(retargeted.x, here.x);
    close(retargeted.y, here.y);
    assert.equal(stage.target, 'column');
    const done = stage.tick(1002, 420 + moveDuration(650, 6) + 1);
    assert.equal(done.picture.mode, 'column');
    assert.equal(done.moving, false);
    assert.equal(stage.mode, 'column');
    assert.equal(stage.cam.zoom, 1);
    // Back to the orbits: the camera lands on the fitted view.
    stage.setMode('orbits', 2000);
    stage.tick(1002, 2300);
    const landed = stage.tick(1002, 2000 + moveDuration(650, 6) + 1);
    assert.equal(landed.picture.mode, 'orbits');
    assert.equal(stage.cam.atFit, true);
    assert.equal(stage.fitted, true);
});

test('the stage: the layer switches change the picture, and the linear scale refits', () => {
    const stage = new OrbitStage();
    stage.setPlan(plan);
    stage.resize(1000, 800, 1000);
    const full = stage.tick(1000, 0);
    assert.ok(full.picture.hits.some((hit) => hit.kind === 'moon'));
    stage.setLayers({ ...DEFAULT_LAYERS, moons: false, jump: false, habitable: false }, 16);
    const bare = stage.tick(1000, 32);
    assert.equal(bare.changed, true);
    assert.ok(!bare.picture.hits.some((hit) => hit.kind === 'moon'));
    assert.ok(bare.picture.layers.every((layer) => layer.bands.length === 0 && layer.jumps.length === 0));
    // Linear scale: the outer worlds spread; the view is fitted again.
    const logGiant = worldsOf(full.picture).find((item) => item.world.key === 'w0');
    stage.wheel(700, 300, 1, 1000, 48);
    stage.tick(1000, 64);
    assert.equal(stage.fitted, false);
    stage.setLayers({ ...DEFAULT_LAYERS, linear: true }, 80);
    const linear = stage.tick(1000, 96);
    assert.equal(stage.fitted, true);
    const linearGiant = worldsOf(linear.picture).find((item) => item.world.key === 'w0');
    const dist = (item, picture) => Math.hypot(item.x - picture.stars[0].x, item.y - picture.stars[0].y);
    assert.ok(dist(linearGiant, linear.picture) < dist(logGiant, full.picture), 'an inner world sits closer in on the linear scale');
});

test('day and night: a world turns once a sidereal day, and the star’s overhead point follows', () => {
    const earthlike = turningOf({ siderealHours: 24, solarDayHours: 24.07, axialTilt: 23 }, false);
    assert.deepEqual(earthlike, { siderealHours: 24, solarDayHours: 24.07, retrograde: false, lockedToStar: false });
    // js/system_viewer.js:3505-3512: one turn per sidereal day, backwards past 90° of tilt.
    close(spinAngle(earthlike, 0.5, 0), Math.PI);
    close(spinAngle(earthlike, 1, 1.2), 2 * Math.PI);
    const backwards = turningOf({ siderealHours: 24, axialTilt: 130 }, false);
    close(spinAngle(backwards, 0.25, 0), -Math.PI / 2);
    // A planet locked to its star keeps one face to it; a locked moon turns with its orbit instead.
    const locked = turningOf({ siderealHours: 300, tidallyLocked: true }, false);
    assert.equal(locked.lockedToStar, true);
    assert.equal(spinAngle(locked, 123, 0.7), 0.7);
    assert.equal(subsolarLongitude(locked, 123, 0.7), 0);
    assert.equal(dayFraction(locked, 123, 0.7, 40), null);
    assert.equal(turningOf({ isTwilightZone: true }, false).lockedToStar, true);
    const lockedMoon = turningOf({ siderealHours: 24, tidallyLocked: true }, true);
    assert.equal(lockedMoon.lockedToStar, false);
    close(spinAngle(lockedMoon, 0.5, 0), Math.PI);
    assert.equal(spinAngle(turningOf({}, false), 5, 1), 0);
    assert.equal(turningOf(null, false).siderealHours, null);

    // The star overhead: at the prime meridian when the world faces it, moving west as the world turns east.
    assert.equal(subsolarLongitude(earthlike, 0, 0), 0);
    close(subsolarLongitude(earthlike, 0.25, 0), -90);
    close(subsolarLongitude(earthlike, 0.5, 0), 180);
    close(subsolarLongitude(earthlike, 0.25, Math.PI / 2), 0);
    // The season's declination: the equator at the equinoxes, the tilt at the solstices.
    close(subsolarLatitude(23.4, 0), 0);
    close(subsolarLatitude(23.4, 90), 23.4);
    close(subsolarLatitude(23.4, 180), 0, 1e-9);
    close(subsolarLatitude(23.4, 270), -23.4);
    // Day and night on the surface: overhead, the far side, and the terminator between.
    close(sunElevation(10, 40, 10, 40), 90, 1e-5);
    close(sunElevation(-10, -140, 10, 40), -90, 1e-5);
    close(sunElevation(0, 90, 0, 0), 0);
    assert.ok(sunElevation(80, 0, 23.4, 180) > 0, 'the summer pole has the midnight sun');
    assert.ok(sunElevation(-80, 0, 23.4, 0) < 0, 'the winter pole is dark at noon');
    // Local time: noon under the star, later to the east on a world that turns forwards.
    close(dayFraction(earthlike, 0, 0, 0), 0.5);
    close(dayFraction(earthlike, 0, 0, 90), 0.75);
    close(dayFraction(earthlike, 0, 0, -90), 0.25);
    close(dayFraction(earthlike, 0.25, 0, 0), 0.75);
    close(dayFraction(backwards, 0, 0, 90), 0.25);
});

test('the starport tick is local time at longitude 0, at two times of day', () => {
    const day = turningOf({ siderealHours: 24, solarDayHours: 24, axialTilt: 23 }, false);
    const noon = starportTick(day, 0, 0);
    const evening = starportTick(day, 0.25, 0);
    assert.ok(noon && evening);
    // Noon is a quarter of the way from sunrise to the next sunrise. Six hours later is sunset.
    close(noon.at, 0.25);
    assert.equal(noon.time, '12:00');
    close(evening.at, 0.5);
    assert.equal(evening.time, '18:00');
    assert.equal(starportTick(turningOf({ siderealHours: 24, solarDayHours: 24, tidallyLocked: true }, false), 1, 0), null);
    // The strip uses the same direction to the star as the orbit picture: half a turn from the orbit angle.
    const scene = layoutScene(plan, VIEW, 1000);
    const at = scene.primary && scene.primary.bodies[0];
    assert.ok(at);
    const want = Math.atan2(at.starY - at.y, at.starX - at.x);
    const got = bodyAngle(at.world.epoch, at.world.period, 1000) + Math.PI;
    close(Math.atan2(Math.sin(got - want), Math.cos(got - want)), 0, 1e-9);
});

test('the play marker sits on the starport tick at two clock values', () => {
    const day = turningOf({ siderealHours: 24, solarDayHours: 24, axialTilt: 23 }, false);
    for (const days of [0, 0.25]) {
        const tick = starportTick(day, days, 0);
        assert.ok(tick);
        close(markerAt(day, days, 0), tick.at);
    }
    assert.equal(markerAt(turningOf({ siderealHours: 24, solarDayHours: 24, tidallyLocked: true }, false), 1, 0), null);
});

test('daylight: half the day at an equinox, and a range over the year that the tilt sets', () => {
    assert.equal(DAYLIGHT_LATITUDE, 45);
    close(daylightFraction(45, 0), 0.5);
    close(daylightFraction(0, 23.4), 0.5);
    // cos H = −tan φ tan δ.
    close(daylightFraction(45, 23.4), Math.acos(-Math.tan(23.4 * Math.PI / 180)) / Math.PI);
    close(daylightFraction(45, 23.4) + daylightFraction(45, -23.4), 1);
    assert.equal(daylightFraction(80, 23.4), 1, 'polar day');
    assert.equal(daylightFraction(80, -23.4), 0, 'polar night');

    const turning = turningOf({ siderealHours: 23.93, solarDayHours: 24, axialTilt: 23.4 }, false);
    const longest = daylightFraction(45, 23.4) * 24;
    assert.deepEqual(dayNightLines({ turning, tiltDeg: 23.4, derived: false }), [
        { label: 'Solar day', value: '24 h' },
        { label: 'At the equator', value: '12 h light, 12 h dark, all year' },
        { label: 'At 45°', value: (24 - longest).toFixed(1) + ' h to ' + longest.toFixed(1) + ' h of light over the year' },
        { label: 'Polar day and night', value: 'beyond 66.6° latitude' },
    ]);
    // No tilt to speak of: the same all year. A steep tilt: from none to the whole day.
    assert.equal(dayNightLines({ turning, tiltDeg: 0, derived: false })[2].value, '12 h of light all year');
    assert.equal(dayNightLines({ turning, tiltDeg: 0, derived: false }).length, 3);
    // A swing under a fiftieth of the day is not quoted as a range.
    assert.equal(dayNightLines({ turning, tiltDeg: 0.4, derived: false })[2].value, '12 h of light all year');
    assert.equal(dayNightLines({ turning, tiltDeg: 70, derived: false })[2].value, 'from no light in winter to 24 h in summer');
    // Unknown tilt: the day and the equator only. A parent's tilt is said to be the parent's.
    assert.equal(dayNightLines({ turning, tiltDeg: null, derived: false }).length, 2);
    assert.equal(dayNightLines({ turning, tiltDeg: 10, derived: true })[2].label, 'At 45° (parent’s tilt)');
    // A planet locked to its star has no cycle; no solar day in the document, nothing to say.
    assert.deepEqual(dayNightLines({ turning: turningOf({ tidallyLocked: true, solarDayHours: 40 }, false), tiltDeg: 5, derived: false }), [
        { label: 'Day and night', value: 'None: one face always points at the star' },
    ]);
    assert.deepEqual(dayNightLines({ turning: turningOf({ siderealHours: 20 }, false), tiltDeg: 5, derived: false }), []);
    assert.deepEqual(dayNightLines({ turning: turningOf({ solarDayHours: 9e9 }, false), tiltDeg: 5, derived: false }), []);
    // A backwards spin: the tilt folds, and the star rises in the west.
    const backwards = dayNightFor({ solarDayHours: 600, axialTilt: 130 }, null);
    assert.equal(backwards[0].value, '600 h, the star rises in the west');
    assert.equal(backwards[3].value, 'beyond 40° latitude');
    // A locked moon has a day; with no tilt of its own it takes its parent's.
    const moon = dayNightFor({ solarDayHours: 88, tidallyLocked: true }, { axialTilt: 20 });
    assert.equal(moon[0].value, '88 h');
    assert.equal(moon[2].label, 'At 45° (parent’s tilt)');
    assert.deepEqual(dayNightFor(null, null), []);
});

test('the day as a picture: a long day in units a person can hold, a ruler that stays readable', () => {
    // A world's own day is in hours. A long one is also said in standard days (24 hours) or years (365 of them).
    assert.equal(hoursText(19.6), '19.6 hours');
    assert.equal(hoursText(1), '1 hour');
    assert.equal(hoursText(4910.7), '4,911 hours');
    assert.equal(standardText(19.6), null);
    assert.equal(standardText(47.9), null);
    assert.equal(standardText(48), '2 standard days');
    assert.equal(standardText(1963.2), '81.8 standard days');
    assert.equal(standardText(4910.7), '205 standard days');
    assert.equal(standardText(2 * 365 * 24), '2 standard years');
    assert.equal(standardText(40000 * 24), '110 standard years');
    assert.equal(spanText(19.6), '19.6 hours');
    assert.equal(spanText(2455.35), '102 standard days');
    // The ruler: the finest mark that gives no more than 48 across the day.
    assert.deepEqual(rulerFor(19.6), { everyHours: 1, label: '1 hour', count: 19.6 });
    assert.deepEqual(rulerFor(48), { everyHours: 1, label: '1 hour', count: 48 });
    assert.equal(rulerFor(49).label, '6 hours');
    assert.equal(rulerFor(300).label, '1 standard day');
    assert.equal(rulerFor(1963.2).label, '10 standard days');
    assert.equal(rulerFor(4910.7).label, '10 standard days');
    assert.equal(rulerFor(20000).label, '100 standard days');
    assert.equal(rulerFor(200000).label, '1 standard year');

    const figure = dayNightFigure({ siderealHours: 1669.6, solarDayHours: 4910.7, axialTilt: 0.6 }, null);
    assert.equal(figure.span, '4,911 hours');
    assert.equal(figure.standard, '205 standard days');
    assert.equal(dayNightFigure({ solarDayHours: 19.6, axialTilt: 3 }, null).standard, null);
    assert.deepEqual(figure.equator, { light: 4910.7 / 2, dark: 4910.7 / 2 });
    assert.equal(figure.mid.latitude, 45);
    close(figure.mid.longest + figure.mid.shortest, 4910.7);
    assert.equal(figure.polarBeyond, 89.4);
    assert.equal(figure.ruler.label, '10 standard days');
    // A steep tilt: at 45° the light is all or nothing; the polar circle is at 20°.
    const steep = dayNightFigure({ solarDayHours: 42.3, axialTilt: 70 }, null);
    assert.deepEqual([steep.mid.shortest, steep.mid.longest, steep.polarBeyond], [0, 42.3, 20]);
    // A backwards spin folds the tilt; a moon without a tilt takes its parent's, and says so.
    const backwards = dayNightFigure({ solarDayHours: 600, axialTilt: 130 }, null);
    assert.equal(backwards.retrograde, true);
    assert.equal(backwards.polarBeyond, 40);
    const moon = dayNightFigure({ solarDayHours: 88, tidallyLocked: true, isTwilightZone: true, periodDays: 5 }, { axialTilt: 20 });
    assert.equal(moon.locked, false);
    assert.equal(moon.lockedFacts, null);
    assert.equal(scoutReadout(moon), null);
    assert.equal(moon.mid.derived, true);
    assert.equal(dayNightFigure({ solarDayHours: 88 }, null).mid, null);
    const turning = dayNightFigure({ solarDayHours: 24, axialTilt: 20 }, null);
    assert.equal(turning.locked, false);
    assert.equal(turning.lockedFacts, null);
    assert.equal(turning.dayHours, 24);
    assert.equal(scoutReadout(turning), null);
    // A planet locked to its star: one side lit for ever. No solar day in the document: no picture.
    const lockedPlain = dayNightFigure({ tidallyLocked: true, solarDayHours: 40 }, null);
    assert.equal(lockedPlain.locked, true);
    assert.deepEqual(lockedPlain.lockedFacts, { twilightZone: false, yearDays: null });
    assert.deepEqual(scoutReadout(lockedPlain).map((line) => line.label + '\t' + line.value), [
        'Rotation\tLocked', 'Dayside\tPermanent', 'Nightside\tPermanent', 'Solar day\tNone',
    ]);
    const lockedZone = dayNightFigure({ isTwilightZone: true, periodDays: 19.3 }, null);
    assert.equal(lockedZone.lockedFacts.twilightZone, true);
    assert.equal(lockedZone.lockedFacts.yearDays, 19.3);
    const zoneLines = scoutReadout(lockedZone);
    assert.equal(zoneLines.find((line) => line.label === 'Twilight zone').value, 'Yes');
    assert.equal(zoneLines.find((line) => line.label === 'Year').value, formatDisplayNumber(19.3, 1) + ' standard days');
    assert.equal(zoneLines.filter((line) => line.label === 'Twilight zone').length, 1);
    const lockedYear = dayNightFigure({ tidallyLocked: true, periodDays: 10, isTwilightZone: false }, null);
    assert.equal(scoutReadout(lockedYear).some((line) => line.label === 'Twilight zone'), false);
    assert.equal(scoutReadout(lockedYear).find((line) => line.label === 'Year').value, formatDisplayNumber(10, 1) + ' standard days');
    const lockedNoYear = dayNightFigure({ tidallyLocked: true, periodDays: Number.NaN }, null);
    assert.equal(lockedNoYear.lockedFacts.yearDays, null);
    assert.equal(scoutReadout(lockedNoYear).some((line) => line.label === 'Year'), false);
    assert.equal(dayNightFigure({ siderealHours: 20 }, null), null);
    assert.equal(dayNightFigure({ solarDayHours: 9e9 }, null), null);
    assert.equal(dayNightFigure(null, null), null);
});

test('the year: standard days first, then standard years and the world’s own days', () => {
    // Regina A-V: 166,639 hours round the star, 8,500.8 of its own days in that.
    assert.deepEqual(yearFigure({ yearHours: 166639.38, solarDaysInYear: 8500.77 }), {
        days: '6,943 standard days', years: '19 standard years', localDays: '8,501 local days',
    });
    // A short year stays in days; a year shorter than the world's own day says so.
    assert.deepEqual(yearFigure({ yearHours: 2529.74, solarDaysInYear: 0.515 }), { days: '105 standard days', years: null, localDays: '0.5 local days' });
    assert.deepEqual(yearFigure({ yearHours: 480 }), { days: '20 standard days', years: null, localDays: null });
    // A backwards spin gives a negative count in the document; it is still that many days.
    assert.equal(yearFigure({ yearHours: 4110.89, solarDaysInYear: -6.71 }).localDays, '6.7 local days');
    assert.equal(yearFigure({ yearHours: 4110.89, solarDaysInYear: 0 }).localDays, null);
    assert.equal(yearFigure({}), null);
    assert.equal(yearFigure(null), null);
});

test('a body and its parent are found by the dossier’s key', () => {
    assert.equal(bodyByKey(sys, 'w0').body, sys.worlds[0]);
    assert.equal(bodyByKey(sys, 'w0').parent, null);
    const moon = bodyByKey(sys, 'w2m2');
    assert.equal(moon.body, sys.worlds[2].moons[2]);
    assert.equal(moon.parent, sys.worlds[2]);
    assert.equal(bodyByKey(sys, 's1').star, true);
    assert.equal(bodyByKey(sys, 'w1'), null, 'an Empty slot has no key');
    assert.equal(bodyByKey(sys, 'w9'), null);
});

test('the card gives the solar day and the daylight range where the document has a solar day', () => {
    const world = cardFor(plan, 'world', 'w0', 1000);
    const lines = world.lines.map((line) => line.label + ': ' + line.value);
    assert.ok(lines.includes('Sidereal day: 30 h'));
    assert.ok(lines.includes('Solar day: 30.3 h'));
    const longest = daylightFraction(45, 20) * 30.3;
    assert.ok(lines.includes('Daylight at 45°: ' + (30.3 - longest).toFixed(1) + ' h to ' + longest.toFixed(1) + ' h'));
    const giant = cardFor(plan, 'world', 'w2', 1000);
    assert.ok(!giant.lines.some((line) => line.label === 'Solar day'), 'no line without the field');
});
