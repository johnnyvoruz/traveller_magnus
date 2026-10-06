/**
 * Where the person field's floating menu goes (slice 2 follow-up 16): under its anchor on
 * the body, never over the window's edge, above the anchor when there is no room below.
 * Because it floats (fixed, on the body), opening it changes no row's height; the browser
 * check measures that, this test fixes the placement rule.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { placePop, POP_GAP, POP_MARGIN } from '../../apps/web/src/workspace/pop_place.ts';

const VIEW = { width: 520, height: 800 };
const MENU = { width: 170, height: 72 };
const anchorAt = (left, top, width = 150, height = 26) => ({ left, top, right: left + width, bottom: top + height });

test('under the anchor, aligned to its left edge, a small gap between', () => {
    assert.deepEqual(placePop(anchorAt(100, 300), MENU, VIEW), { left: 100, top: 300 + 26 + POP_GAP, above: false });
});

test('kept inside the window: a menu near the right edge slides left, one at the left edge keeps the margin', () => {
    assert.deepEqual(placePop(anchorAt(480, 300), MENU, VIEW), { left: 520 - POP_MARGIN - 170, top: 330, above: false });
    assert.deepEqual(placePop(anchorAt(2, 300), MENU, VIEW), { left: POP_MARGIN, top: 330, above: false });
    assert.equal(placePop(anchorAt(100, 300), { width: 600, height: 72 }, VIEW).left, POP_MARGIN);
});

test('above the anchor when there is no room below, and pinned to the bottom when there is none above either', () => {
    assert.deepEqual(placePop(anchorAt(100, 760), MENU, VIEW), { left: 100, top: 760 - POP_GAP - 72, above: true });
    const tall = { width: 300, height: 900 };
    assert.deepEqual(placePop(anchorAt(100, 400), tall, VIEW), { left: 100, top: POP_MARGIN, above: false });
    assert.deepEqual(placePop(anchorAt(100, 20), MENU, { width: 520, height: 100 }), { left: 100, top: 100 - POP_MARGIN - 72, above: false });
});
