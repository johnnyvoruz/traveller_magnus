/**
 * D5 (Johnny, 18:40: crop at upload): a map package's screenshot cover is trimmed to its systems so it
 * reads at card size; a painting, a photo, or a map whose systems already fill it is kept whole.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { chartTrim, lumaOf, TRIM_KEEP_MAX } from '../../apps/web/src/workspace/market/cover_trim.ts';
import { prepareCover } from '../../apps/web/src/workspace/market/cover_image.ts';

/** A dark chart (grid lines at 50) with bright marks in the given boxes. */
function chart(width, height, marks, base = 20) {
    const luma = new Uint8Array(width * height).fill(base);
    for (let x = 0; x < width; x += 40) for (let y = 0; y < height; y++) luma[y * width + x] = 50;
    for (const m of marks) for (let y = m.y; y < m.y + m.h; y++) for (let x = m.x; x < m.x + m.w; x++) luma[y * width + x] = 230;
    return luma;
}

test('a screenshot with its systems in the middle is trimmed round them, 16:9, inside the picture', () => {
    // Hollow Verge's shape: 1600 x 900 scaled to 400 x 225, systems in a box about 30 % by 58 %.
    const luma = chart(400, 225, [{ x: 140, y: 48, w: 6, h: 6 }, { x: 255, y: 170, w: 6, h: 6 }, { x: 200, y: 110, w: 30, h: 4 }]);
    const box = chartTrim(luma, 400, 225);
    assert.ok(box);
    assert.ok(Math.abs(box.w / box.h - 16 / 9) < 0.02, 'the card\'s shape');
    assert.ok(box.x <= 140 && box.x + box.w >= 261 && box.y <= 48 && box.y + box.h >= 176, 'every system kept');
    assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.w <= 400 && box.y + box.h <= 225, 'inside the picture');
    assert.ok((box.w * box.h) / (400 * 225) <= TRIM_KEEP_MAX);
});

test('systems at an edge: the box moves inside rather than being cut', () => {
    const box = chartTrim(chart(400, 225, [{ x: 2, y: 2, w: 20, h: 10 }, { x: 60, y: 30, w: 10, h: 10 }]), 400, 225);
    assert.ok(box);
    assert.equal(box.x, 0);
    assert.equal(box.y, 0);
});

test('kept whole: a painting, a map that fills its picture, a picture with nothing bright', () => {
    // A painting: mostly mid tones (the default art is at most 62 % dark).
    const painting = new Uint8Array(400 * 225).map((_, i) => (i % 7) * 30);
    assert.equal(chartTrim(painting, 400, 225), null);
    // The systems already spread across the picture: nothing worth taking away.
    assert.equal(chartTrim(chart(400, 225, [{ x: 10, y: 10, w: 4, h: 4 }, { x: 380, y: 200, w: 4, h: 4 }]), 400, 225), null);
    assert.equal(chartTrim(chart(400, 225, []), 400, 225), null);
    assert.equal(chartTrim(new Uint8Array(0), 0, 0), null);
});

test('luma from RGBA', () => {
    assert.deepEqual([...lumaOf([255, 255, 255, 255, 0, 0, 0, 255, 255, 0, 0, 255], 3)], [255, 0, 76]);
});

test('without a canvas to look with (Node), a cover is prepared whole and says it was not trimmed', async () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'map.png', { type: 'image/png' });
    const encode = async (_source, longest) => ({ bytes: new Uint8Array(10), width: longest, height: Math.round(longest * 9 / 16) });
    const made = await prepareCover(file, encode, true);
    assert.equal(made.ok, true);
    assert.equal(made.trimmed, false);
});

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => fs.readFileSync(path.join(root, 'apps/web/src', rel), 'utf8');

test('the cover editor trims for a map or system package, and says so', () => {
    const editor = read('workspace/market/CoverEditor.vue');
    assert.match(editor, /prepareCover\(file, undefined, props\.map === true\)/);
    assert.match(editor, /data-cover-trimmed>Trimmed to the systems, so they read on a card\.<\/p>/);
    assert.match(read('workspace/market/ProductPage.vue'), /:map="family === 'map' \|\| family === 'system'"/);
    assert.match(read('workspace/market/PublishFields.vue'), /:map="coverFamily === 'map' \|\| coverFamily === 'system'"/);
});
