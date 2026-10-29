import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readTrafficInk } from '../../apps/web/src/map/traffic.ts';

test('readTrafficInk reads the four tokens and trims them', () => {
    const previous = globalThis.getComputedStyle;
    globalThis.getComputedStyle = () => ({
        getPropertyValue(name) {
            if (name === '--chart-traffic') return '  #9faeb8  ';
            if (name === '--signal') return '#66fcf1';
            if (name === '--bg-0') return '#0b0c10';
            if (name === '--font-data') return ' IBM Plex Mono ';
            return '';
        },
    });
    try {
        assert.deepEqual(readTrafficInk({}), {
            traffic: '#9faeb8',
            own: '#66fcf1',
            bg: '#0b0c10',
            font: 'IBM Plex Mono',
        });
    } finally {
        globalThis.getComputedStyle = previous;
    }
});

test('readTrafficInk leaves a missing token empty', () => {
    const previous = globalThis.getComputedStyle;
    globalThis.getComputedStyle = () => ({ getPropertyValue() { return ''; } });
    try {
        assert.deepEqual(readTrafficInk({}), { traffic: '', own: '', bg: '', font: '' });
    } finally {
        globalThis.getComputedStyle = previous;
    }
});
