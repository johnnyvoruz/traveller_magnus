import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readTheme, ROUTE_COLOUR_CODES } from '../../apps/web/src/map/theme.ts';

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
