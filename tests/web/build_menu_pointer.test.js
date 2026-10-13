/**
 * A right press on the chart (apps/web/src/map/input.ts; prompts/d_menu_selection.md part 1).
 * In Chromium on Windows a right press is pointerdown, pointerup, then contextmenu. Before this
 * pass the quick press and release was taken as a click, and the map's click selected that one
 * hex, so the selection was gone by the time the menu read it. A right press is the menu's alone:
 * no click, no box, no pan. A left press and a long touch are as before.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

// The browser globals input.ts reads: the motion tokens, frames and the clock.
globalThis.window ??= {};
globalThis.window.matchMedia = () => ({ matches: true });
globalThis.window.requestAnimationFrame = () => 1;
globalThis.window.cancelAnimationFrame = () => {};
globalThis.getComputedStyle = () => ({ getPropertyValue: (name) => (name === '--t-base' ? '200ms' : '400ms') });
if (typeof globalThis.addEventListener !== 'function') {
    globalThis.addEventListener = () => {};
    globalThis.removeEventListener = () => {};
}

const { attachInput } = await import('../../apps/web/src/map/input.ts');
const { menuKeysFor } = await import('../../apps/web/src/workspace/build/commands.ts');

test('the menu acts on the selection when the hex is inside it, and on that hex alone when it is outside', () => {
    const nine = ['A/1002', 'A/1003', 'A/1004', 'A/1102', 'A/1103', 'A/1104', 'A/1202', 'A/1203', 'A/1204'];
    assert.deepEqual(menuKeysFor('A/1103', nine), nine);
    assert.deepEqual(menuKeysFor('A/2020', nine), ['A/2020']);
    // The menu key with nothing focused: the selection (a subsector's address).
    assert.deepEqual(menuKeysFor(null, nine), nine);
    assert.deepEqual(menuKeysFor(null, []), []);
    assert.deepEqual(menuKeysFor('A/0101', []), ['A/0101']);
});

function chart() {
    const handlers = {};
    const el = {
        style: {},
        addEventListener: (type, fn) => { handlers[type] = fn; },
        removeEventListener: () => {},
        setPointerCapture: () => {},
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
    };
    const seen = { clicks: [], boxes: 0, moves: 0 };
    attachInput(el, {
        getCamera: () => ({ x: 0, y: 0, ppp: 40 }),
        getViewport: () => ({ width: 800, height: 600 }),
        setCamera: () => { seen.moves += 1; },
        click: (x, y) => seen.clicks.push([x, y]),
        box: { wants: () => true, start: () => { seen.boxes += 1; }, move: () => {}, end: () => {}, cancel: () => {} },
    });
    const press = (type, button, extra = {}) => handlers[type]({ pointerId: 1, button, clientX: 100, clientY: 100, pointerType: 'mouse', type, ...extra });
    return { handlers, seen, press };
}

test('a right press and release is not a click, and draws no box: the selection is left for the menu', () => {
    const { seen, press } = chart();
    press('pointerdown', 2);
    press('pointerup', 2);
    assert.deepEqual(seen.clicks, []);
    assert.equal(seen.boxes, 0);
});

test('a right press that moves does not move the chart', () => {
    const { seen, press } = chart();
    press('pointerdown', 2);
    press('pointermove', 2, { clientX: 160, clientY: 140 });
    press('pointerup', 2, { clientX: 160, clientY: 140 });
    assert.equal(seen.moves, 0);
    assert.deepEqual(seen.clicks, []);
});

test('a left press and release is still a click (the box handler is asked first, as before)', () => {
    const { seen, press } = chart();
    press('pointerdown', 0);
    press('pointerup', 0);
    // The box handler wants every press here, so a still left press ends the box rather than clicking: today's rule.
    assert.equal(seen.boxes, 1);
});
