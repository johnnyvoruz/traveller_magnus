/**
 * The package page's drawing of the piece and the map agree hex for hex (streams/D.md D1): the
 * drawing uses the map's own `toGlobal` and `hexCentre` (reports/done/c_own_sector_offset.md found
 * it one column and one row off before). Hollow Verge: six hexes in an own sector at slot (-8, -5).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hexCentre, toGlobal } from '../../apps/web/src/map/geometry.ts';
import { outlineCentres, outlineHexes } from '../../apps/web/src/workspace/market/place.ts';

const SECTOR = '~ER40DFKRS7YZ09421J1WHRH3SX';
const HEXES = ['0101', '0102', '0103', '0201', '0202', '0302'];
const KEYS = HEXES.map((hex) => SECTOR + '/' + hex);
const SLOT = { x: -8, y: -5 };
const slotOf = (slug) => (slug === SECTOR ? SLOT : null);
const close = (a, b) => Math.abs(a - b) < 1e-9;

test('the drawing puts each of Hollow Verge\'s hexes where the map does', () => {
    const cells = outlineCentres(KEYS, slotOf);
    assert.equal(cells.length, 6);
    HEXES.forEach((hex, i) => {
        const { q, r } = toGlobal(SLOT.x, SLOT.y, Number(hex.slice(0, 2)), Number(hex.slice(2)));
        const map = hexCentre(q, r);
        assert.ok(close(cells[i].x, map.x * 1.5) && close(cells[i].y, map.y * 1.5), hex + ': drawing ' + JSON.stringify(cells[i]) + ', map ' + JSON.stringify(map));
    });
});

test('the map positions are C\'s table (x = q, y in parsecs)', () => {
    const table = { '0101': [-256, -230.940], '0102': [-256, -229.785], '0103': [-256, -228.631], '0201': [-255, -230.363], '0202': [-255, -229.208], '0302': [-254, -229.785] };
    const cells = outlineCentres(KEYS, slotOf);
    HEXES.forEach((hex, i) => {
        const [x, y] = table[hex];
        assert.ok(Math.abs(cells[i].x / 1.5 - x) < 1e-3 && Math.abs(cells[i].y / 1.5 - y) < 1e-3, hex);
    });
});

test('each drawn hex is centred on its cell, and the view box holds them all', () => {
    const cells = outlineCentres(KEYS, slotOf);
    const { points, viewBox } = outlineHexes(KEYS, slotOf);
    assert.equal(points.length, 6);
    points.forEach((poly, i) => {
        const corners = poly.split(' ').map((pair) => pair.split(',').map(Number));
        const cx = corners.reduce((sum, [x]) => sum + x, 0) / 6;
        const cy = corners.reduce((sum, [, y]) => sum + y, 0) / 6;
        assert.ok(Math.abs(cx - cells[i].x) < 0.01 && Math.abs(cy - cells[i].y) < 0.01, HEXES[i]);
    });
    const [x0, y0, w, h] = viewBox.split(' ').map(Number);
    for (const c of cells) assert.ok(c.x > x0 && c.x < x0 + w && c.y > y0 && c.y < y0 + h);
});

test('a sector the page does not know is laid in key order, and a bad key is left out', () => {
    const cells = outlineCentres(['a/0101', 'b/0101', 'a/xx01']);
    assert.equal(cells.length, 2);
    assert.ok(close(cells[1].x - cells[0].x, 32 * 1.5), 'the second sector sits one sector to the right');
});
