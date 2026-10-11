// Selecting hexes in Build (findings/builder_system_design.md §18): which gesture a press is,
// what a click does, the cursor, the box, the chart the pane leaves, and the glide that clears it.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    AREA_MIN, boxResult, boxWords, centreIn, chipPlace, clearGlide, clickIntent, cursorFor, fitIn, gestureFor, hoverTone, hoverWords, visibleArea,
} from '../../apps/web/src/workspace/build/pointer.ts';
import { hexesPath, hexWorldBox, keysWorldBox, screenBox, slotGhostPath } from '../../apps/web/src/workspace/build/marks.ts';
import { slotGroups, slotKeysToSectors, subsectorWords } from '../../apps/web/src/workspace/build/sectors.ts';

const press = (over = {}) => ({ build: true, tool: false, button: 0, hexTier: true, shift: false, alt: false, space: false, ...over });

test('a plain drag always moves the map, in Build and out of it', () => {
    assert.equal(gestureFor(press()), 'pan');
    assert.equal(gestureFor(press({ build: false })), 'pan');
    assert.equal(gestureFor(press({ build: false, shift: true })), 'pan', 'out of Build, Shift changes nothing');
    assert.equal(gestureFor(press({ alt: true })), 'pan');
});

test('the box is asked for: Shift+drag adds, Alt+Shift+drag takes away', () => {
    assert.equal(gestureFor(press({ shift: true })), 'box-add');
    assert.equal(gestureFor(press({ shift: true, alt: true })), 'box-take');
    // Too far out to show hexes there is nothing to box: the drag moves the map.
    assert.equal(gestureFor(press({ shift: true, hexTier: false })), 'pan');
});

test('with the Select hexes tool a plain drag is the box; Space, the middle button and far out still move the map', () => {
    assert.equal(gestureFor(press({ tool: true })), 'box-add');
    assert.equal(gestureFor(press({ tool: true, alt: true })), 'box-take');
    assert.equal(gestureFor(press({ tool: true, space: true })), 'pan');
    assert.equal(gestureFor(press({ tool: true, button: 1 })), 'pan');
    assert.equal(gestureFor(press({ shift: true, button: 1 })), 'pan');
    assert.equal(gestureFor(press({ tool: true, hexTier: false })), 'pan');
});

test('a press that does not move: a click selects one hex; Shift adds or takes away that hex; Alt+Shift takes away', () => {
    assert.equal(clickIntent({ shift: false, alt: false }, false), 'select');
    assert.equal(clickIntent({ shift: false, alt: false }, true), 'select');
    assert.equal(clickIntent({ shift: true, alt: false }, false), 'add');
    assert.equal(clickIntent({ shift: true, alt: false }, true), 'take');
    assert.equal(clickIntent({ shift: true, alt: true }, false), 'take');
    assert.equal(hoverTone({ shift: false, alt: false }, true), 'plain');
    assert.equal(hoverTone({ shift: true, alt: false }, false), 'add');
    assert.equal(hoverTone({ shift: true, alt: false }, true), 'take');
});

test('the cursor says what the next press will do', () => {
    const at = (over = {}) => cursorFor({ build: true, tool: false, hexTier: true, held: { shift: false, alt: false, space: false }, dragging: null, overSelected: false, ...over });
    assert.equal(at({ build: false }), 'default', 'out of Build the chart keeps its cursor');
    assert.equal(at({ build: false, dragging: 'pan' }), 'default');
    assert.equal(at(), 'default');
    assert.equal(at({ dragging: 'pan' }), 'grabbing');
    assert.equal(at({ held: { shift: true, alt: false, space: false } }), 'add');
    assert.equal(at({ held: { shift: true, alt: false, space: false }, overSelected: true }), 'take');
    assert.equal(at({ held: { shift: true, alt: true, space: false } }), 'take');
    assert.equal(at({ tool: true }), 'box');
    assert.equal(at({ tool: true, held: { shift: false, alt: true, space: false } }), 'box-take');
    assert.equal(at({ tool: true, held: { shift: false, alt: false, space: true } }), 'grab');
    assert.equal(at({ dragging: 'box-add' }), 'box');
    assert.equal(at({ dragging: 'box-take' }), 'box-take');
    assert.equal(at({ tool: true, hexTier: false }), 'default');
});

test('the hover chip: the number, and the name when filled; a plus or a minus when a press would add or take away', () => {
    assert.equal(hoverWords('0312', 'filled', 'Aster', 'plain'), '0312 · Aster');
    assert.equal(hoverWords('0312', 'empty', '', 'plain'), '0312 · empty');
    assert.equal(hoverWords('0312', 'empty', '', 'add'), '+ 0312 · empty');
    assert.equal(hoverWords('0312', 'filled', 'Aster', 'take'), '− 0312 · Aster');
    assert.equal(hoverWords('0403', 'slot', '', 'plain'), '0403 · empty sector slot');
    assert.equal(hoverWords('0110', 'removed', '', 'plain'), '0110 · removed');
});

test('a box adds what it covers up to the cap and says when the cap cut it; a taking box takes only what is held', () => {
    const add = boxResult(['a', 'b'], ['b', 'c', 'd'], 'box-add', 10);
    assert.deepEqual(add, { keys: ['a', 'b', 'c', 'd'], changed: ['c', 'd'], over: false });
    const capped = boxResult(['a'], ['b', 'c', 'd'], 'box-add', 3);
    assert.deepEqual(capped, { keys: ['a', 'b', 'c'], changed: ['b', 'c'], over: true });
    const take = boxResult(['a', 'b', 'c'], ['b', 'c', 'x'], 'box-take', 10);
    assert.deepEqual(take, { keys: ['a'], changed: ['b', 'c'], over: false });
    assert.equal(boxWords(12, 7, 'box-add'), '12 hexes, 7 empty');
    assert.equal(boxWords(1, 1, 'box-add'), '1 hex, 1 empty');
    assert.equal(boxWords(5, 0, 'box-take'), '5 hexes deselected');
    assert.equal(boxWords(1279, 900, 'box-add', true), '1279 hexes, 900 empty · selection limit reached');
});

test('the chart the pane leaves: a camera aimed there puts its target in the middle of what is uncovered', () => {
    const vp = { width: 1200, height: 800 };
    const area = visibleArea(vp, { left: 400, top: 0 });
    assert.deepEqual(area, { left: 400, top: 0, right: 1200, bottom: 800 });
    assert.deepEqual(visibleArea(vp, { left: 1500, top: -3 }), { left: 1200, top: 0, right: 1200, bottom: 800 });
    const target = { x: 10, y: 20, ppp: 50 };
    const aimed = centreIn(target, vp, area);
    // The target is drawn at the middle of the area: x = 800 px on the canvas.
    assert.equal((target.x - aimed.x) * aimed.ppp + vp.width / 2, 800);
    assert.equal((target.y - aimed.y) * aimed.ppp + vp.height / 2, 400);
    // With no pane the aim is the camera itself, as it has always been.
    assert.deepEqual(centreIn(target, vp, visibleArea(vp, { left: 0, top: 0 })), target);
    // A sector fitted into the area is fitted into its width, and centred there.
    const rect = { x0: 0, y0: 0, x1: 32, y1: 40 };
    const fitted = fitIn(rect, vp, area, 0);
    assert.ok(Math.abs((16 - fitted.x) * fitted.ppp + 600 - 800) < 1e-9);
    assert.ok(fitted.ppp <= 800 / 32);
});

test('the glide that clears the pane: the least move that brings the selection into the area, none when it is clear', () => {
    const cam = { x: 0, y: 0, ppp: 10 };
    const area = { left: 400, top: 60, right: 1200, bottom: 800 };
    // A hex at 100..140 px, under the pane: the map slides right until it stands 28 px from the pane's edge.
    const moved = clearGlide(cam, area, { left: 100, top: 300, right: 140, bottom: 340 }, 28);
    assert.ok(moved);
    const shift = (cam.x - moved.x) * cam.ppp;
    assert.equal(shift, 328);
    assert.equal(moved.y, 0);
    // Already clear: nothing moves.
    assert.equal(clearGlide(cam, area, { left: 600, top: 300, right: 640, bottom: 340 }, 28), null);
    // Under the chrome row: the map slides down just enough.
    const down = clearGlide(cam, area, { left: 600, top: 20, right: 640, bottom: 60 }, 28);
    assert.equal((cam.y - down.y) * cam.ppp, 68);
    // A selection wider than the area is centred in it.
    const wide = clearGlide(cam, area, { left: 0, top: 300, right: 1000, bottom: 340 }, 28);
    assert.equal((cam.x - wide.x) * cam.ppp, 300);
    // The pane at full width leaves no chart: the map does not move.
    assert.equal(clearGlide(cam, { left: 1200 - AREA_MIN + 1, top: 0, right: 1200, bottom: 800 }, { left: 0, top: 0, right: 10, bottom: 10 }, 28), null);
});

test('the chip stands above the hex, or below it when there is no room above; never on it', () => {
    const area = { left: 0, top: 60, right: 1200, bottom: 800 };
    const up = chipPlace({ left: 500, top: 300, right: 540, bottom: 340 }, area, 8, 26);
    assert.deepEqual(up, { x: 520, y: 292, below: false });
    const down = chipPlace({ left: 500, top: 70, right: 540, bottom: 110 }, area, 8, 26);
    assert.deepEqual(down, { x: 520, y: 118, below: true });
    // Near an edge the chip slides in, so its words are never cut.
    assert.equal(chipPlace({ left: 0, top: 300, right: 20, bottom: 340 }, area, 8, 26).x, 80);
});

test('marks: a hex and a selection as boxes of the chart and of the screen; a box preview as one path; a slot as its ghost grid', () => {
    const sectorOf = (slug) => (slug === 'S' ? { slug, x: 0, y: 0 } : slug === '~slot_-1_0' ? { slug, x: -1, y: 0 } : null);
    const one = hexWorldBox('S/0101', sectorOf);
    assert.ok(one && one.x1 > one.x0 && one.y1 > one.y0);
    assert.equal(hexWorldBox('X/0101', sectorOf), null);
    const many = keysWorldBox(['S/0101', 'S/0303', 'X/0101'], sectorOf);
    assert.ok(many.x1 > one.x1 && many.y1 > one.y1);
    const screen = screenBox({ x: 0, y: 0, ppp: 10 }, { width: 100, height: 100 }, { x0: -1, y0: -2, x1: 1, y1: 2 });
    assert.deepEqual(screen, { left: 40, top: 30, right: 60, bottom: 70 });
    const path = hexesPath(['S/0101', 'S/0102'], sectorOf);
    assert.equal(path.split('M').length - 1, 2);
    assert.equal(path.split('Z').length - 1, 2);
    assert.ok(hexWorldBox('~slot_-1_0/0101', sectorOf));
    const ghost = slotGhostPath({ x: 0, y: 0 });
    assert.equal(ghost.split('M').length - 1, 7, 'the edge and three lines each way');
});

test('a selection that reaches into empty slots: grouped by slot with its subsectors, and keyed to the new sectors once made', () => {
    const keys = ['~slot_-7_-4/0101', 'Spinward_Marches/0101', '~slot_-7_-4/0912', '~slot_-6_-4/3240'];
    const groups = slotGroups(keys);
    assert.deepEqual(groups.map((group) => [group.slug, group.count, group.letters.join('')]), [['~slot_-7_-4', 2, 'AF'], ['~slot_-6_-4', 1, 'P']]);
    assert.deepEqual(groups[0].slot, { x: -7, y: -4 });
    assert.deepEqual(slotKeysToSectors(keys, { '~slot_-7_-4': '~01NEW' }), ['~01NEW/0101', 'Spinward_Marches/0101', '~01NEW/0912', '~slot_-6_-4/3240']);
    assert.equal(subsectorWords(['F']), 'Subsector F, unnamed');
    assert.equal(subsectorWords(['A', 'B', 'E']), 'Subsectors A, B and E, unnamed');
    assert.equal(subsectorWords([]), '');
});
