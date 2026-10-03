import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MapRenderer } from '../../apps/web/src/map/MapRenderer.ts';
import { sectorRect } from '../../apps/web/src/map/geometry.ts';

function cellsOf(hexes) {
    const cells = new Array(1280).fill('.');
    for (const hhhh of hexes) {
        const col = Number(hhhh.slice(0, 2));
        const row = Number(hhhh.slice(2, 4));
        cells[(col - 1) * 40 + (row - 1)] = 'A';
    }
    return cells.join('');
}

function recordingCanvas() {
    const calls = [];
    const ctx = new Proxy({}, {
        get(_target, prop) {
            return (...args) => { calls.push([String(prop), ...args]); };
        },
        set(_target, prop, value) {
            calls.push(['set', String(prop), value]);
            return true;
        },
    });
    const canvas = { width: 0, height: 0, getContext() { return ctx; } };
    return { canvas, calls };
}

const theme = {
    bg0: 'bg', line1: 'l1', line2: 'l2', signal: 'sig', signalDim: 'sigdim',
    text1: 't1', textMuted: 'muted', fontDisplay: 'display', fontData: 'data', fontText: 'text',
};

function chart() {
    return {
        manifest: {
            sectors: [
                { slug: 'On', name: 'On Sector', x: 0, y: 0, canonical: true, systems: 2 },
                { slug: 'Alt', name: 'Alt Sector', x: 0, y: 0, canonical: false, systems: 5 },
                { slug: 'Off', name: 'Off Sector', x: 40, y: 40, canonical: true, systems: 1 },
            ],
        },
        overview: {
            truthVersion: 'v2',
            sectors: [
                { slug: 'On', cells: cellsOf(['0101', '2030']) },
                { slug: 'Alt', cells: cellsOf(['0102', '0103', '0104', '0105', '0106']) },
                { slug: 'Off', cells: cellsOf(['0101']) },
            ],
        },
    };
}

function centreOf(sx, sy) {
    const rect = sectorRect(sx, sy);
    return { x: (rect.x0 + rect.x1) / 2, y: (rect.y0 + rect.y1) / 2 };
}

test('tier galaxy issues no arc and no hex-number text', () => {
    const { canvas, calls } = recordingCanvas();
    const renderer = new MapRenderer(canvas, theme);
    const { manifest, overview } = chart();
    renderer.setChart(manifest, overview, 'canonical');
    renderer.resize(800, 600, 1);
    const drawn = renderer.draw({ ...centreOf(0, 0), ppp: 1 });
    assert.equal(drawn.tier, 'galaxy');
    assert.deepEqual(drawn.sectorsOnScreen, ['On']);
    assert.equal(calls.filter((call) => call[0] === 'arc').length, 0);
    assert.equal(calls.filter((call) => call[0] === 'fillText').length, 0);
    assert.equal(calls.filter((call) => call[0] === 'fillRect').length, 3);
    assert.equal(calls.some((call) => call.includes('Off Sector') || call.includes('Alt Sector')), false);
});

test('tier hex draws one circle per system and skips sectors off screen', () => {
    const { canvas, calls } = recordingCanvas();
    const renderer = new MapRenderer(canvas, theme);
    const { manifest, overview } = chart();
    const index = {
        systems: 2,
        hexes: {
            '0101': { name: 'Alpha' },
            '2030': { name: 'Beta' },
        },
    };
    const seen = [];
    renderer.setChart(manifest, overview, 'canonical');
    renderer.setIndexSource((slug) => {
        seen.push(slug);
        return slug === 'On' ? index : null;
    });
    renderer.resize(800, 600, 1);
    const drawn = renderer.draw({ ...centreOf(0, 0), ppp: 30 });
    assert.equal(drawn.tier, 'hex');
    assert.deepEqual(drawn.sectorsOnScreen, ['On']);
    assert.equal(calls.filter((call) => call[0] === 'arc').length, index.systems);
    assert.equal(calls.filter((call) => call[0] === 'fillRect').length, 1);
    assert.deepEqual(seen, ['On']);
    assert.equal(calls.some((call) => call.includes('Off Sector')), false);
});
