/**
 * DF9 (approved 20:30): at the galaxy zoom each sector's dots are drawn once into a bitmap and copied
 * while the map pans, never blurrier. A zoom in progress draws them dot by dot as before; once the zoom
 * holds still for a frame the bitmaps are made and kept; a new zoom drops them. Every dot sits on a
 * whole device pixel either way, so a copy is the same pixels as drawing it.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MapRenderer } from '../../apps/web/src/map/MapRenderer.ts';
import { sectorRect } from '../../apps/web/src/map/geometry.ts';

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

const made = [];
globalThis.OffscreenCanvas = class OffscreenCanvas {
    constructor(width, height) {
        this.width = width;
        this.height = height;
        this.rec = recorder();
        made.push(this);
    }
    getContext() { return this.rec.ctx; }
};

const cells = (() => { const out = Array(1280).fill('.'); out[0] = 'A'; out[(20 - 1) * 40 + (30 - 1)] = 'A'; return out.join(''); })();
const theme = {
    bg0: 'bg', line1: 'l1', line2: 'l2', signal: 'sig', signalDim: 'sigdim', text1: 't1', textMuted: 'muted',
    fontDisplay: 'display', fontData: 'data', fontText: 'text',
    chart: { world: 'world', water: 'water', zoneAmber: 'amber', zoneRed: 'red', grid: 'grid', selected: 'selected', routeXboat: 'xboat', routeOther: 'other', titleText: 'title', titlePill: 'pill' },
    routeColours: {},
};

function setup(dpr) {
    const main = recorder();
    const canvas = { width: 0, height: 0, getContext() { return main.ctx; } };
    const renderer = new MapRenderer(canvas, theme);
    renderer.setChart({ sectors: [{ slug: 'On', name: 'On Sector', x: 0, y: 0, canonical: true, systems: 2 }] }, { truthVersion: 'v', sectors: [{ slug: 'On', cells }] }, 'canonical');
    renderer.resize(800, 600, dpr);
    const rect = sectorRect(0, 0);
    return { main, renderer, centre: { x: (rect.x0 + rect.x1) / 2, y: (rect.y0 + rect.y1) / 2 } };
}

const dots = (calls) => calls.filter((call) => call[0] === 'fillRect' && call[3] === call[4] && call[3] < 5);
const copies = (calls) => calls.filter((call) => call[0] === 'drawImage');

test('a zoom held still: the first frame draws the dots, the next copies one bitmap a sector, and keeps it', () => {
    made.length = 0;
    const { main, renderer, centre } = setup(1);
    const cam = { ...centre, ppp: 2 };
    renderer.draw(cam);
    assert.equal(dots(main.calls).length, 2, 'drawn dot by dot: the zoom may still be moving');
    assert.equal(copies(main.calls).length, 0);
    main.calls.length = 0;
    renderer.draw({ ...cam, x: cam.x + 3 });
    assert.equal(dots(main.calls).length, 0);
    assert.equal(copies(main.calls).length, 1, 'one copy for the sector');
    assert.equal(made.length, 1);
    assert.equal(dots(made[0].rec.calls).length, 2, 'the bitmap holds the two dots');
    main.calls.length = 0;
    renderer.draw({ ...cam, x: cam.x + 5 });
    assert.equal(copies(main.calls).length, 1);
    assert.equal(made.length, 1, 'kept: no new bitmap while the zoom holds');
});

test('a new zoom draws dot by dot again; the hex tier and the sector tier never use bitmaps', () => {
    made.length = 0;
    const { main, renderer, centre } = setup(1);
    renderer.draw({ ...centre, ppp: 2 });
    renderer.draw({ ...centre, ppp: 2 });
    main.calls.length = 0;
    renderer.draw({ ...centre, ppp: 2.4 });
    assert.equal(copies(main.calls).length, 0);
    assert.equal(dots(main.calls).length, 2);
    main.calls.length = 0;
    renderer.draw({ ...centre, ppp: 12 });
    renderer.draw({ ...centre, ppp: 12 });
    assert.equal(copies(main.calls).length, 0, 'the dots tier draws its dots: 1 ms a frame already');
});

test('DF10: at the dots tier the dots are drawn after the subsector and sector lines, so a line never splits one', () => {
    const { main, renderer, centre } = setup(1);
    renderer.draw({ ...centre, ppp: 12 });
    const strokes = main.calls.map((call, i) => (call[0] === 'stroke' ? i : -1)).filter((i) => i >= 0);
    const firstDot = main.calls.findIndex((call) => call[0] === 'fillRect' && call[3] === call[4] && call[3] < 5);
    assert.ok(strokes.length > 0 && firstDot > 0);
    assert.ok(firstDot > Math.max(...strokes), 'every line is under the dots');
});

test('every dot on a whole device pixel, and the copy lands on one too', () => {
    made.length = 0;
    const { main, renderer, centre } = setup(1.25);
    const cam = { x: centre.x + 0.137, y: centre.y + 0.291, ppp: 2 };
    renderer.draw(cam);
    for (const call of dots(main.calls)) {
        assert.equal(call[1], Math.round(call[1]));
        assert.equal(call[2], Math.round(call[2]));
    }
    main.calls.length = 0;
    renderer.draw(cam);
    const [copy] = copies(main.calls);
    assert.equal(copy[2], Math.round(copy[2]));
    assert.equal(copy[3], Math.round(copy[3]));
    for (const call of dots(made[0].rec.calls)) assert.equal(call[1], Math.round(call[1]));
});
