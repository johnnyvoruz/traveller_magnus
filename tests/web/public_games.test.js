/**
 * The public-games feed (one call per visit, paced under the server cap)
 * and the diamond on the chart.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { MapRenderer } from '../../apps/web/src/map/MapRenderer.ts';
import { sectorRect } from '../../apps/web/src/map/geometry.ts';
import {
    PUBLIC_GAMES_BUDGET, PUBLIC_GAMES_WINDOW_MS, _clockForTests, bindPublicGames,
    publicGamesOverlay, publicMarks, resetPublicGames, watchPublicGames,
} from '../../apps/web/src/map/public_games.ts';

const source = readFileSync(new URL('../../apps/web/src/map/public_games.ts', import.meta.url), 'utf8');

function manualClock() {
    let t = 0;
    const pending = [];
    return {
        now: () => t,
        later(fn, ms) { pending.push({ at: t + ms, fn }); },
        advance(ms) {
            t += ms;
            pending.sort((a, b) => a.at - b.at);
            const due = [];
            while (pending.length > 0 && pending[0].at <= t) due.push(pending.shift());
            for (const item of due) item.fn();
        },
    };
}

async function settle() {
    for (let i = 0; i < 6; i += 1) await new Promise((resolve) => setImmediate(resolve));
}

function json(status, body) {
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

test('the feed is one call per visit, draws every hex the server sent, and stays under the cap', async () => {
    assert.equal(source.includes("from 'zod'"), false);
    assert.match(source, /import type \{ PublicGamesHex \} from '@voyage\/shared'/);
    const clock = manualClock();
    _clockForTests(clock);
    const calls = [];
    const script = new Map();
    bindPublicGames(async (url) => {
        const sector = new URL(String(url), 'http://local').searchParams.get('sector');
        calls.push({ url: String(url), sector, at: clock.now() });
        const row = script.get(sector) ?? { status: 200, body: { hexes: [] } };
        if (row.throw) throw new TypeError('offline');
        return json(row.status, row.body);
    });

    script.set('Spinward', {
        status: 200,
        body: {
            hexes: [
                { hex: '1910', count: 1, name: 'Far Margin' },
                { hex: '0101', count: 1, name: 'Regina Watch' },
                { hex: '0202', count: 3, name: null },
            ],
        },
    });
    const seen = { n: 0 };
    watchPublicGames({
        signedIn: true, truthVersion: 'v5', sectors: ['Spinward', '~ownsector'], ownName: 'Far Margin',
    }, () => { seen.n += 1; });
    await settle();
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url.includes('truthVersion=v5'), true);
    assert.equal(calls[0].url.includes('sector=Spinward'), true);
    assert.equal(calls.some((call) => call.sector === '~ownsector'), false);
    assert.equal(seen.n, 1);
    assert.deepEqual(publicMarks('Spinward'), [
        { hex: '1910', count: 1, name: 'Far Margin' },
        { hex: '0101', count: 1, name: 'Regina Watch' },
        { hex: '0202', count: 3, name: null },
    ]);
    assert.equal(publicGamesOverlay(['Spinward', 'Other']).size, 1);

    watchPublicGames({ signedIn: true, truthVersion: 'v5', sectors: ['Spinward'], ownName: 'Far Margin' });
    await settle();
    assert.equal(calls.length, 1);

    clock.advance(1000);
    watchPublicGames({ signedIn: true, truthVersion: 'v5', sectors: [], ownName: 'Far Margin' });
    clock.advance(30_000);
    watchPublicGames({ signedIn: true, truthVersion: 'v5', sectors: ['Spinward'], ownName: 'Far Margin' });
    await settle();
    assert.equal(calls.length, 1);

    watchPublicGames({ signedIn: true, truthVersion: 'v5', sectors: [], ownName: 'Far Margin' });
    clock.advance(PUBLIC_GAMES_WINDOW_MS);
    watchPublicGames({ signedIn: true, truthVersion: 'v5', sectors: ['Spinward'], ownName: 'Far Margin' });
    await settle();
    assert.equal(calls.length, 2);

    resetPublicGames();
    _clockForTests(clock);
    bindPublicGames(async (url) => {
        const sector = new URL(String(url), 'http://local').searchParams.get('sector');
        calls.push({ url: String(url), sector, at: clock.now() });
        const row = script.get(sector) ?? { status: 200, body: { hexes: [] } };
        if (row.throw) throw new TypeError('offline');
        return json(row.status, row.body);
    });

    for (const status of [401, 429, 500]) {
        const before = calls.length;
        script.set('Spinward', { status, body: { code: 'no' } });
        watchPublicGames({ signedIn: true, truthVersion: 'v5', sectors: ['Spinward'], ownName: null });
        await settle();
        watchPublicGames({ signedIn: true, truthVersion: 'v5', sectors: ['Spinward'], ownName: null });
        await settle();
        assert.equal(calls.length, before + 1);
        assert.deepEqual(publicMarks('Spinward'), []);
        resetPublicGames();
        _clockForTests(clock);
        bindPublicGames(async (url) => {
            const sector = new URL(String(url), 'http://local').searchParams.get('sector');
            calls.push({ url: String(url), sector, at: clock.now() });
            const row = script.get(sector) ?? { status: 200, body: { hexes: [] } };
            if (row.throw) throw new TypeError('offline');
            return json(row.status, row.body);
        });
    }

    script.set('Spinward', { throw: true });
    watchPublicGames({ signedIn: true, truthVersion: 'v5', sectors: ['Spinward'], ownName: null });
    await settle();
    const offline = calls.length;
    watchPublicGames({ signedIn: true, truthVersion: 'v5', sectors: ['Spinward'], ownName: null });
    await settle();
    assert.equal(calls.length, offline);
    assert.deepEqual(publicMarks('Spinward'), []);

    resetPublicGames();
    _clockForTests(clock);
    bindPublicGames(async (url) => {
        calls.push({ url: String(url), at: clock.now() });
        return json(200, { hexes: [] });
    });
    watchPublicGames({ signedIn: false, truthVersion: 'v5', sectors: ['Spinward'], ownName: null });
    watchPublicGames({ signedIn: true, truthVersion: null, sectors: ['Spinward'], ownName: null });
    watchPublicGames({ signedIn: true, truthVersion: 'v5', sectors: ['~slot_3_-1'], ownName: null });
    await settle();
    const quiet = calls.length;
    watchPublicGames({ signedIn: true, truthVersion: 'v5', sectors: ['Empty'], ownName: null });
    await settle();
    assert.equal(calls.length, quiet + 1);
    assert.deepEqual(publicMarks('Empty'), []);

    resetPublicGames();
    _clockForTests(clock);
    const paced = [];
    bindPublicGames(async (url) => {
        paced.push(clock.now());
        calls.push({ url: String(url), at: clock.now() });
        return json(200, { hexes: [] });
    });
    const many = [];
    for (let i = 0; i < 40; i += 1) many.push('s' + i);
    watchPublicGames({ signedIn: true, truthVersion: 'v5', sectors: many, ownName: null });
    await settle();
    assert.equal(paced.length, PUBLIC_GAMES_BUDGET);
    clock.advance(PUBLIC_GAMES_WINDOW_MS);
    await settle();
    assert.equal(paced.length, PUBLIC_GAMES_BUDGET * 2);
    for (let i = 0; i < paced.length; i += 1) {
        const at = paced[i];
        const inWindow = paced.filter((stamp) => stamp > at - PUBLIC_GAMES_WINDOW_MS && stamp <= at).length;
        assert.ok(inWindow <= PUBLIC_GAMES_BUDGET);
    }
    resetPublicGames();
});

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
    let fontPx = 18;
    const ctx = new Proxy({}, {
        get(_target, prop) {
            if (prop === 'measureText') return () => ({ width: 12 });
            if (prop === 'save' || prop === 'restore' || prop === 'beginPath' || prop === 'closePath' || prop === 'stroke' || prop === 'fill') {
                return () => { calls.push([String(prop)]); };
            }
            return (...args) => { calls.push([String(prop), ...args]); };
        },
        set(_target, prop, value) {
            if (prop === 'font') {
                const matched = /^([\d.]+)px /.exec(String(value));
                if (matched) fontPx = Number(matched[1]);
            }
            calls.push(['set', String(prop), value]);
            void fontPx;
            return true;
        },
    });
    return { canvas: { width: 0, height: 0, getContext() { return ctx; } }, calls };
}

const theme = {
    bg0: 'bg', line1: 'l1', line2: 'l2', signal: 'sig', signalDim: 'sigdim',
    text1: 't1', textMuted: 'muted', fontDisplay: 'display', fontData: 'data', fontText: 'text',
    tFast: 0, tag: 'tag', tPulse: 0,
    chart: {
        world: 'world', water: 'water', zoneAmber: 'amber', zoneRed: 'red',
        grid: 'grid', selected: 'selected', routeXboat: 'xboat', routeOther: 'other',
        titleText: 'title', titlePill: 'pill', publicGame: 'public',
    },
    routeColours: {},
};

function centre() {
    const rect = sectorRect(0, 0);
    return { x: (rect.x0 + rect.x1) / 2, y: (rect.y0 + rect.y1) / 2 };
}

function marksOf(count) {
    const rows = [];
    for (let i = 0; i < count; i += 1) {
        const col = (i % 32) + 1;
        const row = Math.floor(i / 32) + 1;
        const hex = String(col).padStart(2, '0') + String(row).padStart(2, '0');
        rows.push(i === 0
            ? { hex, count: 4, name: null }
            : { hex, count: 1, name: 'Game ' + i });
    }
    return rows;
}

function publicOps(calls) {
    const at = calls.findIndex((call) => call[0] === 'set' && call[1] === 'strokeStyle' && call[2] === 'public');
    if (at < 0) return [];
    return calls.slice(at);
}

test('public games are tracks at the hex tier, drawn on their own layer, never on the chart, and take no party or vessel click', (t) => {
    const { canvas, calls } = recordingCanvas();
    const renderer = new MapRenderer(canvas, theme);
    renderer.setChart({
        sectors: [{ slug: 'On', name: 'On Sector', x: 0, y: 0, canonical: true, systems: 1 }],
    }, {
        truthVersion: 'v5',
        sectors: [{ slug: 'On', cells: cellsOf(['0101']) }],
    }, 'canonical');
    renderer.resize(8000, 8000, 1);
    const cam = { ...centre(), ppp: 80 };
    renderer.draw(cam);
    renderer.draw(cam);
    calls.length = 0;
    renderer.draw(cam);
    const baseline = calls.length;
    calls.length = 0;
    renderer.setPublicGames(new Map());
    renderer.draw(cam);
    assert.equal(calls.length, baseline);
    assert.deepEqual(renderer.trafficTracks(), []);

    const ten = marksOf(10);
    renderer.setPublicGames(new Map([['On', ten]]));
    calls.length = 0;
    renderer.draw({ ...centre(), ppp: 30 });
    assert.equal(renderer.trafficTracks().length, 10);
    assert.deepEqual(publicOps(calls), [], 'nothing of theirs on the chart');
    renderer.draw({ ...centre(), ppp: 8 });
    assert.deepEqual(renderer.trafficTracks(), [], 'zoomed out the feed adds nothing: the overview does');

    calls.length = 0;
    const t10 = renderer.draw(cam).ms;
    assert.equal(calls.length, baseline, 'the chart draws the same with ten games as with none');
    const tracks = renderer.trafficTracks();
    assert.equal(tracks.length, 10);
    assert.deepEqual(tracks.map((track) => track.many), [true, ...new Array(9).fill(false)], 'four ships on one hex: an inner diamond');
    assert.equal(tracks.some((track) => track.label !== null), false, 'a game sent without ships has no words');
    const top = tracks[0];
    assert.equal(renderer.partyAt(top.x, top.y), false);
    assert.equal(renderer.vesselAt(top.x, top.y), null);
    assert.equal(renderer.publicShipAt(top.x, top.y), null, 'and no card without ships');

    const twoHundred = marksOf(200);
    renderer.setPublicGames(new Map([['On', twoHundred]]));
    calls.length = 0;
    const t200 = renderer.draw(cam).ms;
    assert.equal(renderer.trafficTracks().length, 200);
    renderer.setPublicGames(null);
    calls.length = 0;
    const t0 = renderer.draw(cam).ms;
    assert.deepEqual(renderer.trafficTracks(), []);
    t.diagnostic(`chart draw ms with tracks: 0=${t0.toFixed(2)} 10=${t10.toFixed(2)} 200=${t200.toFixed(2)}`);
});
