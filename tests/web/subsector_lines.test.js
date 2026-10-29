/**
 * DF19: the subsector and sector lines sit on the boundary between hex columns and rows, not through
 * the centres of column 9, 17 and 25 and row 11, 21 and 31. Column 1's centre is the sector rect's
 * x0 (geometry.ts hexCentre: x = q), so the boundary between columns 8 and 9 is x0 + 7.5; the legacy
 * chart drew it there ((i * 8 - 0.5) * widthStep, js/renderer.js). Rows the same, by ROW_STEP.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MapRenderer } from '../../apps/web/src/map/MapRenderer.ts';
import { ROW_STEP, SECTOR_COLS, SECTOR_ROWS, hexCentre, sectorRect } from '../../apps/web/src/map/geometry.ts';

if (typeof globalThis.Path2D !== 'function') {
    globalThis.Path2D = class Path2D { moveTo() {} lineTo() {} closePath() {} rect() {} };
}

function recorder() {
    const calls = [];
    const ctx = new Proxy({}, {
        get(_t, prop) {
            if (prop === 'measureText') return (text) => ({ width: 7 * String(text).length });
            return (...args) => { calls.push([String(prop), ...args]); };
        },
        set(_t, prop, value) { calls.push(['set', String(prop), value]); return true; },
    });
    return { calls, ctx };
}

const theme = {
    bg0: 'bg', line1: 'l1', line2: 'l2', signal: 'sig', signalDim: 'sigdim', text1: 't1', textMuted: 'muted',
    fontDisplay: 'display', fontData: 'data', fontText: 'text',
    chart: { world: 'world', water: 'water', zoneAmber: 'amber', zoneRed: 'red', grid: 'grid', selected: 'selected', routeXboat: 'xboat', routeOther: 'other', titleText: 'title', titlePill: 'pill' },
    routeColours: {},
};

/** A camera whose world x maps to screen x one to one: ppp 1, the viewport's middle at world 0. */
const vp = { width: 200, height: 200 };
const cam = { x: 100, y: 100, ppp: 1 };
const sector = { slug: 'S', name: 'S', x: 0, y: 0, canonical: true, rect: sectorRect(0, 0), cells: null };

function lines(calls) {
    const out = [];
    for (let i = 0; i < calls.length - 1; i += 1) {
        if (calls[i][0] === 'moveTo' && calls[i + 1][0] === 'lineTo') out.push({ a: calls[i].slice(1), b: calls[i + 1].slice(1) });
    }
    return out;
}

test('the three column lines sit between columns 8|9, 16|17 and 24|25; the three row lines between rows 10|11, 20|21 and 30|31', () => {
    const rec = recorder();
    const renderer = new MapRenderer({ width: 0, height: 0, getContext: () => rec.ctx }, theme);
    renderer.resize(vp.width, vp.height, 1);
    renderer.subsectorLines([sector], cam, vp);
    const drawn = lines(rec.calls);
    const vertical = drawn.filter((l) => l.a[0] === l.b[0]).map((l) => l.a[0]);
    const horizontal = drawn.filter((l) => l.a[1] === l.b[1]).map((l) => l.a[1]);
    assert.equal(vertical.length, 3);
    assert.equal(horizontal.length, 3);
    for (const [i, col] of [[0, 8], [1, 16], [2, 24]]) {
        const left = hexCentre(col - 1, 0).x;
        const right = hexCentre(col, 0).x;
        assert.equal(vertical[i], (left + right) / 2, 'between columns ' + col + ' and ' + (col + 1));
    }
    for (const [i, row] of [[0, 10], [1, 20], [2, 30]]) {
        const above = hexCentre(0, row - 1).y;
        const below = hexCentre(0, row).y;
        assert.ok(Math.abs(horizontal[i] - (above + below) / 2) < 1e-9, 'between rows ' + row + ' and ' + (row + 1) + ': ' + horizontal[i]);
    }
    // The lines run the sector's whole edge to edge, on the same boundary as the sector's own border.
    const columnLine = drawn.find((l) => l.a[0] === l.b[0]);
    assert.ok(Math.abs(columnLine.a[1] + 0.5 * ROW_STEP) < 1e-9);
    assert.ok(Math.abs(columnLine.b[1] - (SECTOR_ROWS - 0.5) * ROW_STEP) < 1e-9);
});

test('the sector border is the same boundary: half a column left of column 1 and half a row above row 1, 32 columns by 40 rows', () => {
    const rec = recorder();
    const renderer = new MapRenderer({ width: 0, height: 0, getContext: () => rec.ctx }, theme);
    renderer.resize(vp.width, vp.height, 1);
    renderer.strokeRects([sector], cam, vp, 'l2');
    const rect = rec.calls.find((call) => call[0] === 'rect');
    assert.ok(rect, 'one rect for the sector');
    assert.equal(rect[1], -0.5, 'left: between the last column of the sector to the left and column 1');
    assert.ok(Math.abs(rect[2] + 0.5 * ROW_STEP) < 1e-9, 'top: between the row above and row 1: ' + rect[2]);
    assert.equal(rect[3], SECTOR_COLS);
    assert.ok(Math.abs(rect[4] - SECTOR_ROWS * ROW_STEP) < 1e-9);
    // The rect the rest of the chart uses (fit cameras, titles, tiles) is unchanged: column 1's centre is x0.
    assert.deepEqual(sectorRect(0, 0), { x0: 0, x1: 32, y0: 0, y1: 40 * ROW_STEP });
});
