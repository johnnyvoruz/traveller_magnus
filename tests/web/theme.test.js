import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import { contrast, inkText, luminance, parseInk, readableOn } from '../../apps/web/src/map/ink.ts';
import { printTheme, readTheme, ROUTE_COLOUR_CODES, whiteTheme } from '../../apps/web/src/map/theme.ts';

/** Every token in tokens.css by name, the last definition winning, as the contrast test reads them. */
function tokensFromCss() {
    const css = fs.readFileSync(new URL('../../apps/web/src/design/tokens.css', import.meta.url), 'utf8');
    const out = new Map();
    for (const m of css.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) out.set(m[1], m[2].replace(/\/\*.*?\*\//g, '').trim());
    return out;
}
function fakeStyle(props) {
    const previous = globalThis.getComputedStyle;
    globalThis.getComputedStyle = () => ({ getPropertyValue(name) { return (props instanceof Map ? props.get(name) : props[name]) ?? ''; } });
    return () => { globalThis.getComputedStyle = previous; };
}
const MARK = 3;

const CHART = {
    '--chart-world': '#ffffff',
    '--chart-water': '#46b4e8',
    '--chart-zone-amber': '#FFBF00',
    '--chart-zone-red': '#FF0000',
    '--chart-grid': '#1f2833',
    '--chart-selected': '#66fcf1',
    '--chart-route-xboat': '#016a01',
    '--chart-route-other': '#9faeb8',
    '--chart-title-text': '#ffffff',
    '--chart-title-pill': '#0b0c10',
};

test('readTheme maps the 22 route allegiance colours by their original codes', () => {
    const props = { ...CHART };
    for (const code of ROUTE_COLOUR_CODES) {
        props['--chart-route-' + code.toLowerCase().replace(/ /g, '-')] = 'c-' + code;
    }
    const previous = globalThis.getComputedStyle;
    globalThis.getComputedStyle = () => ({
        getPropertyValue(name) { return props[name] ?? ''; },
    });
    try {
        const theme = readTheme({});
        assert.equal(Object.keys(theme.routeColours).length, 22);
        assert.equal(theme.routeColours.Im, 'c-Im');
        assert.equal(theme.routeColours.ZhCo, 'c-ZhCo');
        assert.equal(theme.routeColours['Core Route'], 'c-Core Route');
        assert.equal(theme.chart.world, '#ffffff');
        assert.equal(theme.chart.water, '#46b4e8');
        assert.equal(theme.chart.routeXboat, '#016a01');
        assert.equal(theme.chart.titleText, '#ffffff');
        assert.equal(theme.chart.titlePill, '#0b0c10');
    } finally {
        globalThis.getComputedStyle = previous;
    }
});

test('ink: the arithmetic a colour on paper needs (DP1d)', () => {
    assert.deepEqual(parseInk('#fff'), { r: 255, g: 255, b: 255 });
    assert.deepEqual(parseInk(' #46B4E8 '), { r: 70, g: 180, b: 232 });
    assert.deepEqual(parseInk('#46b4e880'), { r: 70, g: 180, b: 232 }, 'an alpha byte is ignored');
    assert.deepEqual(parseInk('rgb(1, 2, 3)'), { r: 1, g: 2, b: 3 });
    assert.deepEqual(parseInk('lightblue'), { r: 173, g: 216, b: 230 }, 'a CSS keyword the tokens use');
    assert.equal(parseInk('var(--x)'), null);
    assert.equal(luminance({ r: 0, g: 0, b: 0 }), 0);
    assert.equal(luminance({ r: 255, g: 255, b: 255 }), 1);
    assert.equal(Math.round(contrast({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 })), 21);
    assert.equal(inkText({ r: 70, g: 180, b: 232 }), '#46b4e8');
    assert.equal(readableOn('#16181c', '#ffffff', MARK), '#16181c', 'a dark ink is kept as written');
    const yellow = readableOn('yellow', '#ffffff', MARK);
    assert.notEqual(yellow, 'yellow');
    assert.ok(contrast(parseInk(yellow), parseInk('#ffffff')) >= MARK, yellow);
    assert.equal(parseInk(yellow).b, 0, 'the same hue: a yellow stays a yellow');
    assert.equal(readableOn('var(--x)', '#ffffff', MARK), 'var(--x)', 'what cannot be read is returned as given');
});

test('the third theme (DP1d): the screen\'s colours on the paper, darkened where they would not read; the print inks for text and lines', () => {
    const props = {
        '--print-paper': '#ffffff', '--print-chart-line-1': '#8a8f98', '--print-chart-line-2': '#5b6168', '--print-chart-grid': '#b4b9c1',
        '--print-chart-text': '#16181c', '--print-chart-text-muted': '#5b6168', '--print-chart-world': '#16181c', '--print-chart-title-text': '#16181c', '--print-chart-fill': '0.55',
        '--signal': '#66fcf1', '--signal-dim': '#45a29e', '--font-display': 'd', '--font-data': 'm', '--font-text': 't',
        '--chart-world': '#ffffff', '--chart-water': '#46b4e8', '--chart-zone-amber': '#FFBF00', '--chart-zone-red': '#FF0000', '--chart-grid': '#1f2833', '--chart-selected': '#66fcf1',
        '--chart-route-xboat': '#016a01', '--chart-route-other': '#9faeb8', '--chart-public': '#c4b5fd', '--chart-news': '#ff7ad9',
    };
    for (const code of ROUTE_COLOUR_CODES) props['--chart-route-' + code.toLowerCase().replace(/ /g, '-')] = code === 'Im' ? '#048104' : code === 'ZhCo' ? 'lightblue' : code === 'Kk' ? 'gray' : 'purple';
    const restore = fakeStyle(props);
    try {
        const theme = whiteTheme({}, { traffic: '#d4ff3a' });
        const paper = parseInk('#ffffff');
        assert.equal(theme.bg0, '#ffffff', 'the paper');
        assert.equal(theme.chart.titlePill, '#ffffff');
        assert.equal(theme.tag, '#ffffff');
        assert.equal(theme.line1, '#8a8f98');
        assert.equal(theme.line2, '#5b6168');
        assert.equal(theme.chart.grid, '#b4b9c1', 'the print grid, lighter on purpose');
        assert.equal(theme.text1, '#16181c');
        assert.equal(theme.textMuted, '#5b6168', 'the caption');
        assert.equal(theme.chart.world, '#16181c', 'the chart text and the discs are one ink: the print one');
        assert.equal(theme.chart.titleText, '#16181c');
        assert.equal(theme.fillScale, 0.55, 'polity and region fills at the print share');
        assert.equal(theme.tFast, 0);
        assert.equal(theme.chart.zoneRed, '#FF0000', 'a screen colour that reads on white is kept as written');
        assert.equal(theme.chart.routeXboat, '#016a01');
        assert.equal(theme.routeColours.Im, '#048104');
        assert.equal(theme.routeColours.Kk, 'gray');
        for (const [name, value] of [['water', theme.chart.water], ['zoneAmber', theme.chart.zoneAmber], ['selected', theme.chart.selected], ['routeOther', theme.chart.routeOther], ['publicGame', theme.chart.publicGame], ['signal', theme.signal], ['traffic', theme.traffic], ['news', theme.news], ['ZhCo', theme.routeColours.ZhCo]]) {
            assert.ok(contrast(parseInk(value), paper) >= MARK, name + ' reads on the paper: ' + value);
        }
        assert.notEqual(theme.chart.zoneAmber, '#FFBF00', 'the amber was darkened');
        assert.match(theme.routeColours.ZhCo, /^#[0-9a-f]{6}$/, 'a keyword colour comes back as hex when darkened');
        for (const name of ['--chart-water', '--chart-zone-amber', '--chart-selected', '--chart-route-other', '--chart-public', 'traffic', '--chart-news', '--signal', '--chart-route-zhco']) assert.ok(theme.darkened.includes(name), name + ' is listed as darkened');
        assert.ok(new Set(theme.darkened).size === theme.darkened.length, 'each token once');
        assert.ok(!theme.darkened.includes('--chart-zone-red') && !theme.darkened.includes('--chart-route-im'));
        const paperTheme = printTheme({});
        assert.equal(paperTheme.bg0, '#ffffff', 'On paper draws on the same white');
    } finally {
        restore();
    }
});

test('the third theme on the real tokens: every colour ink reads on --print-paper at the mark level, and the corner is the paper in both looks', () => {
    const tokens = tokensFromCss();
    const restore = fakeStyle(tokens);
    try {
        const paper = parseInk(tokens.get('--print-paper'));
        const theme = whiteTheme({}, { traffic: tokens.get('--chart-traffic') });
        assert.equal(theme.bg0, tokens.get('--print-paper'));
        assert.equal(printTheme({}).bg0, tokens.get('--print-paper'));
        const inks = { water: theme.chart.water, zoneAmber: theme.chart.zoneAmber, zoneRed: theme.chart.zoneRed, selected: theme.chart.selected, routeXboat: theme.chart.routeXboat, routeOther: theme.chart.routeOther, publicGame: theme.chart.publicGame, signal: theme.signal, signalDim: theme.signalDim, traffic: theme.traffic, news: theme.news, ...theme.routeColours };
        for (const [name, value] of Object.entries(inks)) {
            const ink = parseInk(value);
            assert.ok(ink, name + ' is a colour: ' + value);
            assert.ok(contrast(ink, paper) >= MARK, name + ' on the paper: ' + value);
        }
        console.log('darkened on the real tokens: ' + theme.darkened.join(', '));
    } finally {
        restore();
    }
});
