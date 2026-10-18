/**
 * DS5: subsector titles kept apart. Two subsectors side by side, both held at the top edge, put their
 * titles on one line ("Spinward Marches - Jewell" against "Spinward Marches - Regina"); on a phone the
 * title stuck under the date chip. The pure part is `separateTitles`; the renderer ranks the titles and
 * the map view measures the floating controls.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { separateTitles, TITLE_GAP } from '../../apps/web/src/map/titles.ts';

const bounds = { x: 0, y: 68, w: 1600, h: 832 };
// Jewell and Regina, side by side, each 510 px wide, both reaching above the view.
const jewell = { x: 434, y: -200, w: 510, h: 600 };
const regina = { x: 944, y: -200, w: 510, h: 600 };

test('a title clear of the others keeps its spot', () => {
    const out = separateTitles([{ x: 950, y: 72, w: 190, h: 20, home: regina }, { x: 500, y: 72, w: 190, h: 20, home: jewell }], bounds);
    assert.deepEqual(out, [{ x: 950, y: 72 }, { x: 500, y: 72 }]);
});

test('two titles on one line slide apart, the first kept where it is', () => {
    // Jewell's title ends 20 px before Regina's starts: one run of words.
    const out = separateTitles([{ x: 945, y: 72, w: 190, h: 20, home: regina }, { x: 735, y: 72, w: 190, h: 20, home: jewell }], bounds);
    assert.deepEqual(out[0], { x: 945, y: 72 });
    assert.equal(out[1].y, 72, 'the sticky top edge holds');
    assert.equal(out[1].x, 945 - TITLE_GAP - 190, 'beside the first, the gap apart');
    assert.ok(out[1].x >= jewell.x, 'still inside its own subsector');
});

test('a title with no room beside the others in its own subsector is not shown', () => {
    const narrow = { x: 780, y: -200, w: 170, h: 600 };
    const out = separateTitles([{ x: 945, y: 72, w: 190, h: 20, home: regina }, { x: 790, y: 72, w: 140, h: 20, home: narrow }], bounds);
    assert.deepEqual(out[0], { x: 945, y: 72 });
    assert.equal(out[1], null);
});

test('titles on different lines do not move', () => {
    const out = separateTitles([{ x: 945, y: 72, w: 190, h: 20, home: regina }, { x: 900, y: 420, w: 190, h: 20, home: { x: 434, y: 400, w: 510, h: 600 } }], bounds);
    assert.deepEqual(out[1], { x: 900, y: 420 });
});

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => fs.readFileSync(path.join(root, 'apps/web/src', rel), 'utf8');

test('the renderer ranks and separates its titles; the map view measures where they may stick', () => {
    const renderer = read('map/MapRenderer.ts');
    assert.match(renderer, /const apart = separateTitles\(/);
    assert.match(renderer, /y: this\.titleTop,/);
    assert.match(renderer, /setTitleTop\(px: number\): void \{/);
    const view = read('views/MapView.vue');
    assert.match(view, /app\.querySelectorAll\('\.omni-field, \.stardate'\)/);
    assert.match(view, /renderer\.setTitleTop\(titleTop\(\)\);/);
});
