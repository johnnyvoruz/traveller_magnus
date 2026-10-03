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

test('tier hex fills territories and regions under the grid and strokes territories after the routes', () => {
    const territory = '#112233';
    const region = '#445566';
    const route = 'route-colour';
    const index = {
        slug: 'On',
        x: 0,
        y: 0,
        hexes: { '0101': { name: 'Alpha' } },
        territories: [{ name: 'Imperium', color: territory, hexes: ['0101'] }],
        regions: [{ name: 'Rift', color: region, hexes: ['0101'] }],
        metadata: { routes: [{ Start: '0101', End: '0110', Color: route }] },
    };
    const { canvas, calls } = recordingCanvas();
    const renderer = new MapRenderer(canvas, theme);
    renderer.setChart({
        sectors: [{ slug: 'On', name: 'On Sector', x: 0, y: 0, canonical: true }],
    }, { truthVersion: 'v3', sectors: [] }, 'canonical');
    renderer.setIndexSource(() => index);
    renderer.resize(800, 600, 1);
    renderer.draw({ ...centreOf(0, 0), ppp: 40 });

    const events = paintEvents(calls);
    const fills = events.filter((event) => event.op === 'fill' && event.rule === 'evenodd');
    assert.equal(fills.length, 2);
    assert.equal(fills[0].alpha, TERRITORY_FILL_ALPHA);
    assert.equal(fills[0].fillStyle, territory);
    assert.equal(fills[1].alpha, REGION_FILL_ALPHA);
    assert.equal(fills[1].fillStyle, region);
    const gridAt = events.findIndex((event) => event.op === 'stroke' && event.strokeStyle === theme.chart.grid);
    const routeAt = events.findIndex((event) => event.op === 'stroke' && event.strokeStyle === route);
    const borderAt = events.findIndex((event) => event.op === 'stroke' && event.strokeStyle === territory);
    assert.ok(events.indexOf(fills[0]) < gridAt);
    assert.ok(events.indexOf(fills[1]) < gridAt);
    assert.ok(gridAt < routeAt);
    assert.ok(routeAt < borderAt);
    assert.equal(events[borderAt].lineWidth, TERRITORY_STROKE);
    assert.equal(events[borderAt].lineJoin, 'round');
    assert.equal(events[borderAt].lineCap, 'round');
    assert.equal(events.filter((event) => event.op === 'stroke' && event.strokeStyle === region).length, 0);

    calls.length = 0;
    index.territories[0].color = '#abcdef';
    index.regions[0].color = '#fedcba';
    renderer.draw({ ...centreOf(0, 0), ppp: 40 });
    const again = paintEvents(calls).filter((event) => event.op === 'fill' && event.rule === 'evenodd');
    assert.equal(again.length, 2);
    assert.equal(again[0].fillStyle, territory);
    assert.equal(again[1].fillStyle, region);
    assert.equal(again[0].alpha, TERRITORY_FILL_ALPHA);
    assert.equal(again[1].alpha, REGION_FILL_ALPHA);
});

function ownersOf(spec) {
    const chars = new Array(1280).fill('.');
    for (const [hhhh, digit] of spec) {
        const col = Number(hhhh.slice(0, 2));
        const row = Number(hhhh.slice(2, 4));
        chars[(col - 1) * 40 + (row - 1)] = digit;
    }
    return chars.join('');
}

test('zoomed-out polities build one per frame and draw nothing at tier hex', () => {
    const { canvas, calls } = recordingCanvas();
    const renderer = new MapRenderer(canvas, theme);
    renderer.setChart({
        sectors: [{ slug: 'On', name: 'On Sector', x: 0, y: 0, canonical: true }],
    }, {
        truthVersion: 'v3',
        sectors: [{
            slug: 'On',
            x: 0,
            y: 0,
            polities: [
                { name: 'Big', color: 'big-colour' },
                { name: 'Small', color: 'small-colour' },
            ],
            owners: ownersOf([['0101', '0'], ['0102', '0'], ['0103', '0'], ['0201', '1']]),
        }],
    }, 'canonical');
    renderer.resize(800, 600, 1);

    function polityFills() {
        return paintEvents(calls).filter((event) => event.op === 'fill' && event.rule === 'evenodd' && event.alpha === POLITY_FILL_ALPHA);
    }

    const atHex = renderer.draw({ ...centreOf(0, 0), ppp: 40 });
    assert.equal(polityFills().length, 0);
    assert.equal(atHex.pending, false);

    calls.length = 0;
    const firstDraw = renderer.draw({ ...centreOf(0, 0), ppp: 3 });
    assert.equal(firstDraw.pending, true);
    const first = polityFills();
    assert.equal(first.length, 1);
    assert.equal(first[0].fillStyle, 'big-colour');
    const firstStroke = paintEvents(calls).filter((event) => event.op === 'stroke' && event.strokeStyle === 'big-colour');
    assert.equal(firstStroke.length, 1);
    assert.equal(firstStroke[0].lineWidth, TERRITORY_STROKE / 3);
    assert.equal(firstStroke[0].lineJoin, 'round');
    assert.equal(firstStroke[0].lineCap, 'round');

    calls.length = 0;
    const secondDraw = renderer.draw({ ...centreOf(0, 0), ppp: 3 });
    assert.equal(secondDraw.pending, false);
    const second = polityFills();
    assert.equal(second.length, 2);
    assert.equal(second[0].fillStyle, 'big-colour');
    assert.equal(second[1].fillStyle, 'small-colour');

    calls.length = 0;
    const backToHex = renderer.draw({ ...centreOf(0, 0), ppp: 40 });
    assert.equal(polityFills().length, 0);
    assert.equal(backToHex.pending, false);
});
