import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MapRenderer } from '../../apps/web/src/map/MapRenderer.ts';
import { DISC_R, GAS_R, HALO_R, RING_R, RING_SCALE_X, RING_SCALE_Y } from '../../apps/web/src/map/glyphs.ts';
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
    /** 12 px per character at 18 px, scaled with the font the renderer set. */
    let fontPx = 18;
    const ctx = new Proxy({}, {
        get(_target, prop) {
            if (prop === 'measureText') {
                return (text) => {
                    calls.push(['measureText', text]);
                    return { width: 12 * String(text).length * (fontPx / 18) };
                };
            }
            return (...args) => { calls.push([String(prop), ...args]); };
        },
        set(_target, prop, value) {
            if (prop === 'font') {
                const matched = /^([\d.]+)px /.exec(String(value));
                if (matched) fontPx = Number(matched[1]);
            }
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
    chart: {
        world: 'world', water: 'water', zoneAmber: 'amber', zoneRed: 'red',
        grid: 'grid', selected: 'selected', routeXboat: 'xboat', routeOther: 'other',
    },
    routeColours: {},
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

/** Font size of the last display-font assignment in this draw. */
function displayFontSize(calls) {
    const fontSets = calls.filter((call) => call[0] === 'set' && call[1] === 'font' && String(call[2]).endsWith('px ' + theme.fontDisplay));
    return Number(String(fontSets.at(-1)[2]).split('px')[0]);
}

test('a sector name scales to 84% of its rectangle and is omitted below 9px', () => {
    const eight = '12345678';
    const twenty = '12345678901234567890';
    const five = '12345';
    const { canvas, calls } = recordingCanvas();
    const renderer = new MapRenderer(canvas, theme);
    renderer.resize(800, 600, 1);

    function drawAt(name, rectPx) {
        calls.length = 0;
        renderer.setChart({
            sectors: [{ slug: 'Wide', name, x: 0, y: 0, canonical: true }],
        }, { truthVersion: 'v2', sectors: [] }, 'canonical');
        renderer.draw({ ...centreOf(0, 0), ppp: rectPx / 32 });
        return calls.filter((call) => call[0] === 'fillText' && call[1] === name);
    }

    const fitted = drawAt(eight, 110);
    assert.equal(fitted.length, 1);
    const size = displayFontSize(calls);
    assert.equal(size, 17.325);
    assert.ok(12 * eight.length * (size / 18) <= 92.4);

    assert.equal(drawAt(eight, 40).length, 0);
    assert.equal(drawAt(twenty, 110).length, 0);

    const full = drawAt(five, 110);
    assert.equal(full.length, 1);
    assert.equal(displayFontSize(calls), 18);
});

function styleSets(calls, prop, value) {
    return calls.filter((call) => call[0] === 'set' && call[1] === prop && call[2] === value);
}

function arcCount(calls, radius) {
    return calls.filter((call) => call[0] === 'arc' && Math.abs(call[3] - radius) < 1e-6).length;
}

/** lineTo counts of each closePath, so a star (11) is distinct from a hex (5) and a triangle (2). */
function closedLineCounts(calls) {
    let lineTos = 0;
    const closed = [];
    for (const call of calls) {
        if (call[0] === 'beginPath') lineTos = 0;
        else if (call[0] === 'lineTo') lineTos += 1;
        else if (call[0] === 'closePath') closed.push(lineTos);
    }
    return closed;
}

test('tier hex draws discs below names and one pass of each full-detail mark', () => {
    const uwp = 'A788899-C';
    const name = 'Regina';
    const { canvas, calls } = recordingCanvas();
    const renderer = new MapRenderer(canvas, theme);
    const row = { name, uwp, bases: 'NS', zone: 'A', pbg: '703', tradeCodes: ['Sa'] };
    renderer.setChart({
        sectors: [{ slug: 'Spinward_Marches', name: 'Spinward Marches', x: -4, y: -1, canonical: true }],
    }, { truthVersion: 'v2', sectors: [] }, 'canonical');
    renderer.setIndexSource(() => ({
        hexes: { '1910': row },
    }));
    renderer.resize(800, 600, 1);

    renderer.draw({ ...centreOf(-4, -1), ppp: 80 });
    assert.equal(arcCount(calls, HALO_R * 80), 1);
    assert.equal(styleSets(calls, 'fillStyle', theme.chart.zoneAmber).length, 1);
    assert.equal(arcCount(calls, DISC_R * 80), 1);
    assert.equal(styleSets(calls, 'fillStyle', theme.chart.water).length, 1);
    assert.equal(arcCount(calls, GAS_R * 80), 1);
    assert.equal(arcCount(calls, RING_R * 80), 1);
    assert.equal(calls.some((call) => call[0] === 'scale' && call[1] === RING_SCALE_X && call[2] === RING_SCALE_Y), true);
    const texts = calls.filter((call) => call[0] === 'fillText').map((call) => call[1]);
    assert.equal(texts.filter((text) => text === '1910').length, 1);
    assert.equal(texts.filter((text) => text === 'A').length, 1);
    assert.equal(texts.filter((text) => text === uwp).length, 1);
    assert.equal(texts.filter((text) => text === name).length, 1);
    assert.equal(texts.filter((text) => text === 'NS').length, 0);
    assert.equal(closedLineCounts(calls).filter((count) => count === 11).length, 1);
    assert.equal(closedLineCounts(calls).filter((count) => count === 2).length, 1);
    assert.equal(styleSets(calls, 'fillStyle', theme.chart.world).length, 6);
    assert.equal(calls.filter((call) => call[0] === 'set' && call[1] === 'font').length, 4);

    calls.length = 0;
    renderer.setIndexSource(() => ({ hexes: { '1910': { ...row, name: '' } } }));
    renderer.draw({ ...centreOf(-4, -1), ppp: 80 });
    assert.equal(arcCount(calls, GAS_R * 80), 1);
    assert.equal(closedLineCounts(calls).filter((count) => count === 11).length, 1);
    assert.equal(closedLineCounts(calls).filter((count) => count === 2).length, 1);

    calls.length = 0;
    renderer.setChart({
        sectors: [{ slug: 'Spinward_Marches', name: 'N'.repeat(200), x: -4, y: -1, canonical: true }],
    }, { truthVersion: 'v2', sectors: [] }, 'canonical');
    renderer.setIndexSource(() => ({ hexes: { '1910': row } }));
    renderer.draw({ ...centreOf(-4, -1), ppp: 40 });
    assert.equal(arcCount(calls, DISC_R * 40), 1);
    assert.equal(calls.filter((call) => call[0] === 'fillText').length, 0);
    assert.equal(arcCount(calls, GAS_R * 40), 0);
});

test('far labels draw one name per hex, stay inside the layer, and hide below ppp 1.2', () => {
    const { canvas, calls } = recordingCanvas();
    const renderer = new MapRenderer(canvas, theme);
    renderer.setChart({
        sectors: [
            { slug: 'On', name: 'On Sector', x: 0, y: 0, canonical: true },
            { slug: 'Alt', name: 'Alt Sector', x: 0, y: 0, canonical: false },
        ],
    }, { truthVersion: 'v2', sectors: [] }, 'canonical');
    renderer.resize(800, 600, 1);
    renderer.setLabels([
        { sector: 'On', hex: '0101', name: 'Alpha' },
        { sector: 'On', hex: '0101', name: 'Beta' },
        { sector: 'Alt', hex: '0101', name: 'Hidden' },
    ]);
    renderer.draw({ ...centreOf(0, 0), ppp: 3 });
    const texts = calls.filter((call) => call[0] === 'fillText').map((call) => call[1]);
    assert.equal(texts.filter((text) => text === 'Alpha' || text === 'Beta').length, 1);
    assert.equal(texts.includes('Hidden'), false);

    calls.length = 0;
    renderer.setLabels([{ sector: 'Alt', hex: '0101', name: 'Hidden' }]);
    renderer.draw({ ...centreOf(0, 0), ppp: 3 });
    assert.equal(calls.some((call) => call[1] === 'Hidden'), false);

    calls.length = 0;
    renderer.setLabels([{ sector: 'On', hex: '0101', name: 'Alpha' }]);
    renderer.draw({ ...centreOf(0, 0), ppp: 1 });
    assert.equal(calls.filter((call) => call[0] === 'fillText').length, 0);
});
