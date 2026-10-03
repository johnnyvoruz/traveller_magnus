import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MapRenderer } from '../../apps/web/src/map/MapRenderer.ts';
import { DISC_R, GAS_R, HALO_R, POLITY_FILL_ALPHA, REGION_FILL_ALPHA, RING_R, RING_SCALE_X, RING_SCALE_Y, TERRITORY_FILL_ALPHA, TERRITORY_STROKE } from '../../apps/web/src/map/glyphs.ts';
import { ROW_STEP, sectorRect } from '../../apps/web/src/map/geometry.ts';

if (typeof globalThis.Path2D !== 'function') {
    globalThis.Path2D = class Path2D {
        moveTo() {}
        lineTo() {}
        closePath() {}
    };
}

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
        titleText: 'title', titlePill: 'pill',
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
    assert.equal(calls.filter((call) => call[0] === 'set' && call[1] === 'font' && !String(call[2]).startsWith('600 ')).length, 4);

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

test('subsector titles name the sector from PPP_NAMES and are absent below it', () => {
    const { canvas, calls } = recordingCanvas();
    const renderer = new MapRenderer(canvas, theme);
    renderer.setChart({
        sectors: [{ slug: 'On', name: 'On Sector', x: 0, y: 0, canonical: true }],
    }, { truthVersion: 'v2', sectors: [] }, 'canonical');
    renderer.setIndexSource(() => ({ hexes: { '0101': { name: 'Alpha' } } }));
    renderer.resize(240, 120, 1);
    renderer.draw({ x: 4, y: 5 * ROW_STEP, ppp: 80 });
    const titles = calls.filter((call) => call[0] === 'fillText' && String(call[1]).includes('On Sector') && String(call[1]).includes(' - '));
    assert.equal(titles.length, 1);

    calls.length = 0;
    renderer.draw({ x: 4, y: 5 * ROW_STEP, ppp: 40 });
    assert.equal(calls.filter((call) => call[0] === 'fillText' && String(call[1]).includes(' - ')).length, 0);
});

test('a subsector title rides with the map while panning and keeps its size (B1.12a)', () => {
    const { canvas, calls } = recordingCanvas();
    const renderer = new MapRenderer(canvas, theme);
    renderer.setChart({
        sectors: [{ slug: 'On', name: 'On Sector', x: 0, y: 0, canonical: true }],
    }, { truthVersion: 'v2', sectors: [] }, 'canonical');
    const index = { hexes: { '0101': { name: 'Alpha' } } };
    renderer.setIndexSource(() => index);
    renderer.resize(1200, 900, 1);
    const pills = [];
    const fonts = new Set();
    for (let i = 0; i <= 10; i++) {
        calls.length = 0;
        renderer.draw({ x: 2.5 + i * 0.05, y: 3, ppp: 80 });
        const rects = calls.filter((call) => call[0] === 'roundRect');
        assert.equal(rects.length, 1, 'one title in view');
        pills.push(rects[0]);
        const text = calls.findIndex((call) => call[0] === 'fillText' && String(call[1]).includes(' - '));
        for (let at = text; at >= 0; at--) {
            if (calls[at][0] === 'set' && calls[at][1] === 'font') { fonts.add(calls[at][2]); break; }
        }
    }
    for (let i = 1; i < pills.length; i++) {
        assert.ok(Math.abs((pills[i][1] - pills[i - 1][1]) - (-0.05 * 80)) < 1e-6, 'x follows the pan');
        assert.equal(pills[i][2], pills[0][2], 'y unchanged');
        assert.equal(pills[i][3], pills[0][3], 'width unchanged');
        assert.equal(pills[i][4], pills[0][4], 'height unchanged');
    }
    assert.equal(fonts.size, 1, 'one font size for the whole pan');

    // Inside the same zoom step the anchor stays put on the map; the pill size does not change.
    calls.length = 0;
    renderer.draw({ x: 2.5, y: 3, ppp: 90 });
    const zoomed = calls.filter((call) => call[0] === 'roundRect')[0];
    const mapX = (pill, ppp) => (pill[1] - 600) / ppp + 2.5;
    assert.ok(Math.abs(mapX(zoomed, 90) - mapX(pills[0], 80)) < 1e-9);
    assert.equal(zoomed[3], pills[0][3]);
});

/** Canvas ops with the style that was current when fill or stroke ran. */
function paintEvents(calls) {
    let alpha = 1;
    let fillStyle = '';
    let strokeStyle = '';
    let lineWidth = 0;
    let lineJoin = '';
    let lineCap = '';
    const events = [];
    for (const call of calls) {
        if (call[0] === 'set' && call[1] === 'globalAlpha') alpha = call[2];
        else if (call[0] === 'set' && call[1] === 'fillStyle') fillStyle = call[2];
        else if (call[0] === 'set' && call[1] === 'strokeStyle') strokeStyle = call[2];
        else if (call[0] === 'set' && call[1] === 'lineWidth') lineWidth = call[2];
        else if (call[0] === 'set' && call[1] === 'lineJoin') lineJoin = call[2];
        else if (call[0] === 'set' && call[1] === 'lineCap') lineCap = call[2];
        else if (call[0] === 'fill') {
            const rule = call.slice(1).find((arg) => arg === 'evenodd' || arg === 'nonzero');
            events.push({ op: 'fill', rule, alpha, fillStyle });
        }
        else if (call[0] === 'stroke') events.push({ op: 'stroke', strokeStyle, lineWidth, lineJoin, lineCap });
    }
    return events;
}

function fillPaths(calls, fillStyle) {
    const paths = [];
    let style = '';
    for (const call of calls) {
        if (call[0] === 'set' && call[1] === 'fillStyle') style = call[2];
        else if (call[0] === 'fill' && call.includes('evenodd') && style === fillStyle) paths.push(call[1]);
    }
    return paths;
}

const NEAR = 'near-colour';
const FAR = 'far-colour';
const REGION = 'region-a';

function politiesDoc() {
    const centre = centreOf(0, 0);
    return {
        truthVersion: 'v4',
        polities: [
            {
                name: 'Near',
                color: NEAR,
                hexes: 2,
                box: [centre.x - 1, centre.y - 1, centre.x + 1, centre.y + 1],
                loops: [[centre.x, centre.y, centre.x + 1, centre.y, centre.x + 1, centre.y + 1]],
            },
            {
                name: 'Far',
                color: FAR,
                hexes: 1,
                box: [5000, 5000, 5001, 5001],
                loops: [[5000, 5000, 5001, 5000, 5001, 5001]],
            },
        ],
    };
}

test('borders wait for setPolities, then one fill and one stroke per polity in view', () => {
    const route = 'route-colour';
    const loop = [16, 22, 17, 22, 17, 24, 16, 24];
    const index = {
        slug: 'On',
        x: 0,
        y: 0,
        hexes: { '0101': { name: 'Alpha' } },
        regions: [{ name: 'Rift', color: REGION, loops: [loop] }],
        metadata: { routes: [{ Start: '0101', End: '0110', Color: route }] },
    };
    const bare = {
        slug: 'On',
        hexes: { '0101': { name: 'Alpha' } },
        regions: [{ name: 'Rift', color: REGION, hexes: ['0101'] }],
    };
    const second = {
        slug: 'Two',
        hexes: {},
        regions: [{ name: 'Other', color: 'region-b', loops: [loop] }],
    };
    const { canvas, calls } = recordingCanvas();
    const renderer = new MapRenderer(canvas, theme);
    renderer.setChart({
        sectors: [
            { slug: 'On', name: 'On Sector', x: 0, y: 0, canonical: true },
            { slug: 'Two', name: 'Two Sector', x: 0, y: 0, canonical: true },
        ],
    }, { truthVersion: 'v4', sectors: [] }, 'canonical');
    renderer.resize(800, 600, 1);
    const cam = { ...centreOf(0, 0), ppp: 40 };

    renderer.setIndexSource((slug) => (slug === 'On' ? bare : null));
    renderer.draw(cam);
    assert.equal(paintEvents(calls).filter((event) => event.op === 'fill' && event.rule === 'evenodd').length, 0);
    assert.equal(paintEvents(calls).some((event) => event.op === 'stroke' && (event.strokeStyle === NEAR || event.strokeStyle === FAR || event.strokeStyle === REGION)), false);

    calls.length = 0;
    renderer.setIndexSource((slug) => (slug === 'On' ? index : null));
    renderer.draw(cam);
    assert.equal(fillPaths(calls, NEAR).length, 0);
    assert.equal(fillPaths(calls, FAR).length, 0);

    renderer.setPolities(politiesDoc());
    calls.length = 0;
    renderer.draw(cam);
    const events = paintEvents(calls);
    const nearFills = events.filter((event) => event.op === 'fill' && event.rule === 'evenodd' && event.fillStyle === NEAR);
    const farFills = events.filter((event) => event.fillStyle === FAR || event.strokeStyle === FAR);
    assert.equal(nearFills.length, 1);
    assert.equal(nearFills[0].alpha, TERRITORY_FILL_ALPHA);
    assert.equal(farFills.length, 0);
    const nearStrokes = events.filter((event) => event.op === 'stroke' && event.strokeStyle === NEAR);
    assert.equal(nearStrokes.length, 1);
    assert.equal(nearStrokes[0].lineWidth, TERRITORY_STROKE / 40);
    assert.equal(nearStrokes[0].lineJoin, 'round');
    assert.equal(nearStrokes[0].lineCap, 'round');
    const regionFills = events.filter((event) => event.op === 'fill' && event.fillStyle === REGION);
    assert.equal(regionFills.length, 1);
    assert.equal(regionFills[0].alpha, REGION_FILL_ALPHA);
    assert.equal(regionFills[0].rule, 'evenodd');
    assert.equal(events.filter((event) => event.op === 'stroke' && event.strokeStyle === REGION).length, 0);
    const gridAt = events.findIndex((event) => event.op === 'stroke' && event.strokeStyle === theme.chart.grid);
    const routeAt = events.findIndex((event) => event.op === 'stroke' && event.strokeStyle === route);
    const borderAt = events.findIndex((event) => event.op === 'stroke' && event.strokeStyle === NEAR);
    const worldAt = events.findIndex((event) => event.op === 'fill' && event.fillStyle === theme.chart.world);
    assert.ok(events.indexOf(nearFills[0]) < gridAt);
    assert.ok(events.indexOf(regionFills[0]) < gridAt);
    assert.ok(gridAt < routeAt);
    assert.ok(routeAt < borderAt);
    assert.ok(borderAt < worldAt);

    const polityPath = fillPaths(calls, NEAR)[0];
    const regionPath = fillPaths(calls, REGION)[0];
    index.regions[0].loops = [[0, 0, 1, 0, 1, 1]];
    index.regions[0].color = 'changed';
    calls.length = 0;
    renderer.setIndexSource((slug) => {
        if (slug === 'On') return index;
        if (slug === 'Two') return second;
        return null;
    });
    renderer.draw(cam);
    assert.equal(fillPaths(calls, NEAR)[0], polityPath);
    assert.equal(fillPaths(calls, REGION)[0], regionPath);
    assert.equal(fillPaths(calls, REGION).length, 1);
    assert.equal(fillPaths(calls, 'region-b').length, 1);
    assert.equal(paintEvents(calls).filter((event) => event.fillStyle === 'changed').length, 0);

    calls.length = 0;
    renderer.draw({ ...centreOf(0, 0), ppp: 3 });
    const zoomed = paintEvents(calls);
    const zoomFills = zoomed.filter((event) => event.op === 'fill' && event.rule === 'evenodd' && event.fillStyle === NEAR);
    assert.equal(zoomFills.length, 1);
    assert.equal(zoomFills[0].alpha, POLITY_FILL_ALPHA);
    const zoomStroke = zoomed.filter((event) => event.op === 'stroke' && event.strokeStyle === NEAR);
    assert.equal(zoomStroke.length, 1);
    assert.equal(zoomStroke[0].lineWidth, TERRITORY_STROKE / 3);
    assert.equal(zoomed.filter((event) => event.fillStyle === FAR || event.strokeStyle === FAR).length, 0);
    assert.equal(zoomed.filter((event) => event.fillStyle === REGION).length, 0);
    assert.equal(fillPaths(calls, NEAR)[0], polityPath);
});

test('setPolities builds 447 paths', (t) => {
    const Original = globalThis.Path2D;
    let made = 0;
    globalThis.Path2D = class extends Original {
        constructor() {
            super();
            made += 1;
        }
    };
    try {
        const polities = [];
        for (let i = 0; i < 447; i++) {
            polities.push({
                name: 'P' + i,
                color: 'c',
                hexes: 447 - i,
                box: [i, 0, i + 1, 1],
                loops: [[0, 0, 1, 0, 1, 1, 0, 1]],
            });
        }
        const { canvas } = recordingCanvas();
        const renderer = new MapRenderer(canvas, theme);
        const started = performance.now();
        renderer.setPolities({ truthVersion: 'v4', polities });
        const ms = performance.now() - started;
        t.diagnostic(`setPolities 447 paths: ${ms.toFixed(1)} ms`);
        assert.equal(made, 447);
    } finally {
        globalThis.Path2D = Original;
    }
});
