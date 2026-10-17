/**
 * Ships as tracks on a traffic scope (prompts/d_traffic_display.md): one cased diamond the same size
 * on screen at every zoom, open for someone else's and filled for yours; an invisible sweep that
 * paints each track in turn on its own layer and clock and never redraws the chart; no text at rest,
 * a data block on hover; a bracket round the open card's ship; and one traffic colour used for
 * nothing else.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { test } from 'node:test';
import { partyShipTags } from '../../apps/web/src/map/campaign_layer.ts';
import { sectorRect } from '../../apps/web/src/map/geometry.ts';
import { MapRenderer } from '../../apps/web/src/map/MapRenderer.ts';
import { PPP_NAMES } from '../../apps/web/src/map/tiers.ts';
import {
    blockPlace, drawTrack, FRAME_MS, mergeTracks, PAINT_MS, REST_ALPHA, SPRITE_STEPS, spriteSide, spriteStep, SWEEP_MS, SWELL,
    sweepBearing, TRACK_PX, TRACK_STEP, trackPaint, TrafficLayer,
} from '../../apps/web/src/map/traffic.ts';

const SRC = new URL('../../apps/web/src/', import.meta.url);
const read = (file) => readFileSync(new URL(file, SRC), 'utf8');
const MARK = (n) => 'pm_' + String(n).padStart(26, '0');

if (typeof globalThis.Path2D !== 'function') {
    globalThis.Path2D = class Path2D {
        moveTo() {}
        lineTo() {}
        closePath() {}
    };
}

function recordingCtx() {
    const calls = [];
    const ctx = new Proxy({}, {
        get(_target, prop) {
            if (prop === 'measureText') return (text) => { calls.push(['measureText', text]); return { width: String(text).length * 6 }; };
            return (...args) => { calls.push([String(prop), ...args]); };
        },
        set(_target, prop, value) {
            calls.push(['set', String(prop), value]);
            return true;
        },
    });
    return { ctx, calls };
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
const INK = { traffic: 'traffic', own: 'own', bg: 'bg', font: 'data' };

function chart() {
    const { ctx, calls } = recordingCtx();
    const map = new MapRenderer({ width: 0, height: 0, getContext: () => ctx }, theme);
    map.setChart({ sectors: [{ slug: 'On', name: 'On Sector', x: 0, y: 0, canonical: true, systems: 0 }] }, { truthVersion: 'v10', sectors: [{ slug: 'On', cells: '.'.repeat(1280) }] }, 'canonical');
    map.resize(1600, 1000, 1);
    const rect = sectorRect(0, 0);
    let draws = 0;
    const draw = map.draw.bind(map);
    map.draw = (cam) => { draws += 1; return draw(cam); };
    return { map, calls, draws: () => draws, centre: (ppp) => ({ x: (rect.x0 + rect.x1) / 2, y: (rect.y0 + rect.y1) / 2, ppp }) };
}

/** A layer on a recording canvas and a clock the test turns by hand. */
function layer({ still = false, surface } = {}) {
    const { ctx, calls } = recordingCtx();
    const canvas = { width: 0, height: 0, dataset: {}, getContext: () => ctx };
    let t = 0;
    let next = 1;
    const frames = new Map();
    let hidden = null;
    const clock = {
        now: () => t,
        frame: (fn) => { const id = next++; frames.set(id, fn); return id; },
        cancel: (id) => { frames.delete(id); },
        still: () => still,
        onHidden: (fn) => { hidden = fn; return () => { hidden = null; }; },
        surface,
    };
    const traffic = new TrafficLayer(canvas, INK, clock);
    traffic.resize(800, 600, 1);
    /** One display refresh: every frame asked for runs once, at a 60 Hz step. */
    const refresh = () => {
        t += 1000 / 60;
        const due = [...frames.entries()];
        frames.clear();
        for (const [, fn] of due) fn();
    };
    return { traffic, calls, canvas, refresh, frames, setStill: (on) => { still = on; }, hide: (on) => hidden(on) };
}

const TRACKS = [
    { key: 'a', mine: false, many: false, label: 'BEOWULF', x: 100, y: 100 },
    { key: 'b', mine: false, many: true, label: 'KESTREL’S DUE +1', x: 600, y: 300 },
    { key: 'c', mine: true, many: false, label: 'FAR MARGIN', x: 400, y: 500 },
];

// ---- size, shape and colour ------------------------------------------------------------------------

test('a track is the same size in pixels at every zoom', () => {
    const { map, centre } = chart();
    map.setPublicGames(new Map([['On', [{ hex: '1620', count: 1, name: null, ships: [{ mark: MARK(1), ship: 'Beowulf', aboard: [] }] }]]]));
    map.setPublicOverview([{ key: 'On/1620', count: 1 }]);
    const sizes = new Set();
    for (const ppp of [1, 3, 10, 22.5, 40, PPP_NAMES + 1, 150]) {
        map.draw(centre(ppp));
        const [track] = map.trafficTracks();
        assert.ok(track, 'a track at ' + ppp);
        sizes.add((track.box.x1 - track.box.x0).toFixed(3) + 'x' + (track.box.y1 - track.box.y0).toFixed(3));
    }
    assert.equal(sizes.size, 1, [...sizes].join(' '));
    // And drawn so: the diamond's half is TRACK_PX / 2 at rest whatever the zoom.
    const { ctx, calls } = recordingCtx();
    drawTrack(ctx, { key: 'k', mine: false, many: false, label: null, x: 50, y: 50 }, { alpha: REST_ALPHA, scale: 1 }, INK);
    const tops = calls.filter((call) => call[0] === 'moveTo').map((call) => 50 - call[2]);
    assert.deepEqual(new Set(tops), new Set([TRACK_PX / 2]));
});

test('someone else\'s track is open in the traffic colour, yours is filled in the party colour; both cased in the chart\'s dark', () => {
    const open = recordingCtx();
    drawTrack(open.ctx, TRACKS[0], { alpha: 1, scale: 1 }, INK);
    assert.equal(open.calls.some((call) => call[0] === 'fill'), false);
    assert.deepEqual(open.calls.filter((call) => call[0] === 'set' && call[1] === 'strokeStyle').map((call) => call[2]), ['bg', 'traffic']);
    const widths = open.calls.filter((call) => call[0] === 'set' && call[1] === 'lineWidth').map((call) => call[2]);
    assert.ok(widths[0] - widths[1] >= 2.9, 'a casing of about 1.5 px each side of the stroke');
    const mine = recordingCtx();
    drawTrack(mine.ctx, TRACKS[2], { alpha: 1, scale: 1 }, INK);
    assert.equal(mine.calls.some((call) => call[0] === 'set' && call[1] === 'fillStyle' && call[2] === 'own'), true);
    assert.equal(mine.calls.some((call) => call[0] === 'fill'), true);
    // More than one here: a second, inner diamond.
    const many = recordingCtx();
    drawTrack(many.ctx, TRACKS[1], { alpha: 1, scale: 1 }, INK);
    assert.equal(many.calls.filter((call) => call[0] === 'moveTo').length, 4, 'two diamonds, cased and stroked');
});

test('--chart-traffic is one token, read by the traffic layer and the public card only, and used for nothing else', () => {
    assert.match(read('design/tokens.css'), /--chart-traffic: #[0-9a-fA-F]{6};/);
    const users = [];
    const walk = (dir) => {
        for (const name of readdirSync(dir)) {
            const path = new URL(name, dir);
            if (statSync(path).isDirectory()) walk(new URL(name + '/', dir));
            else if (/\.(ts|vue|css)$/.test(name) && readFileSync(path, 'utf8').includes('--chart-traffic')) users.push(path.pathname.split('/src/')[1]);
        }
    };
    walk(SRC);
    assert.deepEqual(users.sort(), ['design/tokens.css', 'map/traffic.ts', 'workspace/PublicShipSheet.vue']);
    assert.equal(/#[0-9a-fA-F]{3,8}\b/.test(read('map/traffic.ts')), false);
});

// ---- the sweep ------------------------------------------------------------------------------------

test('the sweep paints a track as it passes its bearing: full and swollen, back to rest over PAINT_MS; still under reduced motion', () => {
    // Twelve o'clock is crossed at the start of a turn.
    assert.equal(sweepBearing(0), -Math.PI / 2);
    assert.ok(Math.abs(sweepBearing(SWEEP_MS / 4)) < 1e-9, 'three o\'clock a quarter turn later');
    const up = { x: 400, y: 100 };
    const now = trackPaint(0, up.x, up.y, 400, 300, false);
    assert.equal(now.alpha, 1);
    assert.equal(now.scale, SWELL);
    const mid = trackPaint(PAINT_MS / 2, up.x, up.y, 400, 300, false);
    assert.ok(mid.alpha < 1 && mid.alpha > REST_ALPHA && mid.scale < SWELL && mid.scale > 1);
    assert.deepEqual(trackPaint(PAINT_MS + 1, up.x, up.y, 400, 300, false), { alpha: REST_ALPHA, scale: 1 });
    assert.deepEqual(trackPaint(SWEEP_MS / 2, up.x, up.y, 400, 300, false), { alpha: REST_ALPHA, scale: 1 }, 'at rest across the turn');
    // The track at three o'clock paints a quarter turn after the one at twelve.
    assert.equal(trackPaint(SWEEP_MS / 4, 700, 300, 400, 300, false).scale, SWELL);
    assert.deepEqual(trackPaint(0, up.x, up.y, 400, 300, true), { alpha: 1, scale: 1 });
});

test('the chart is still: the sweep runs on its own clock, at most 30 frames a second, and never draws the chart', () => {
    const { map, centre, draws } = chart();
    map.setPublicGames(new Map([['On', [{ hex: '1620', count: 1, name: null, ships: [{ mark: MARK(1), ship: 'Beowulf', aboard: [] }] }]]]));
    map.draw(centre(40));
    const before = draws();
    const { traffic, refresh } = layer();
    traffic.show(map.trafficTracks(), null);
    const painted = traffic.painted;
    for (let i = 0; i < 60 * 6; i += 1) refresh();
    assert.equal(draws(), before, 'the chart was not drawn while the sweep turned');
    const frames = traffic.painted - painted;
    assert.ok(frames > 100 && frames <= Math.ceil((6000 / FRAME_MS) + 1), String(frames) + ' frames in six seconds');
    assert.equal(/MapRenderer|markDirty|\.draw\(/.test(read('map/traffic.ts')), false, 'the layer knows nothing of the chart');
});

test('reduced motion: no clock at all and every track at full brightness; a hidden tab stops the clock and a shown one starts it', () => {
    const still = layer({ still: true });
    still.traffic.show(TRACKS, null);
    assert.equal(still.frames.size, 0, 'no frame asked for');
    assert.deepEqual(still.calls.filter((call) => call[0] === 'set' && call[1] === 'globalAlpha').map((call) => call[2]).filter((a) => a !== 1 && a !== 0.9), []);
    const live = layer();
    live.traffic.show(TRACKS, null);
    assert.equal(live.frames.size, 1);
    live.hide(true);
    assert.equal(live.frames.size, 0, 'hidden: stopped');
    live.refresh();
    assert.equal(live.frames.size, 0);
    live.hide(false);
    assert.equal(live.frames.size, 1, 'shown: running again');
    live.traffic.destroy();
    assert.equal(live.frames.size, 0);
});

// ---- text --------------------------------------------------------------------------------------

test('no text at rest: the layer writes nothing until a track is hovered, then one data block with its words', () => {
    const { traffic, calls, refresh } = layer();
    traffic.show(TRACKS, null);
    for (let i = 0; i < 30; i += 1) refresh();
    assert.equal(calls.some((call) => call[0] === 'fillText' || call[0] === 'strokeText' || call[0] === 'measureText'), false);
    calls.length = 0;
    traffic.setHover('b');
    const said = calls.filter((call) => call[0] === 'fillText').map((call) => call[1]);
    assert.deepEqual(said, ['KESTREL’S DUE +1']);
    assert.equal(calls.some((call) => call[0] === 'set' && call[1] === 'font' && /data$/.test(call[2])), true, 'in the data type');
    calls.length = 0;
    traffic.setHover(null);
    assert.equal(calls.some((call) => call[0] === 'fillText'), false);
    // A track with no words (zoomed out, the overview has no names) shows no block.
    traffic.show([{ key: 'far', mine: false, many: false, label: null, x: 10, y: 10 }], null);
    calls.length = 0;
    traffic.setHover('far');
    assert.equal(calls.some((call) => call[0] === 'fillText'), false);
});

test('the data block goes up and right of its track on a leader, clear of the hex below; left at the right edge, under at the top', () => {
    const at = blockPlace(200, 200, 90, 800, 600);
    assert.ok(at.x > 200 && at.y + 18 <= 200 - TRACK_PX / 2, 'up and right, above the track');
    assert.ok(at.bx > at.ax && at.by < at.ay, 'the leader rises to the right');
    const edge = blockPlace(780, 200, 90, 800, 600);
    assert.ok(edge.x + 90 <= 780, 'left of the track at the right edge');
    const top = blockPlace(200, 8, 90, 800, 600);
    assert.ok(top.y >= 8, 'under the track at the top edge');
});

// ---- where tracks stand ------------------------------------------------------------------------

test('tracks closer than the merge distance become one, kept at the first\'s place', () => {
    const groups = mergeTracks([{ x: 100, y: 100, k: 'busy' }, { x: 105, y: 104, k: 'near' }, { x: 300, y: 100, k: 'far' }, { x: 111, y: 100, k: 'edge' }]);
    assert.deepEqual(groups.map((group) => group.map((item) => item.k)), [['busy', 'near', 'edge'], ['far']]);
});

test('yours beside theirs: at the hex zoom yours first in the row, the lead a ghost over its chevron; zoomed out yours centred and theirs a step right', () => {
    const { map, centre } = chart();
    const ships = partyShipTags([
        { id: 'cr_lead', name: 'Far Margin', hexKey: 'On/1620', lead: true, inJump: false, aboard: [] },
        { id: 'cr_two', name: 'Jewel', hexKey: 'On/1620', lead: false, inJump: false, aboard: [] },
    ]);
    map.setCampaign({ party: null, ships, locate: null, reducedMotion: false });
    map.setPublicGames(new Map([['On', [{ hex: '1620', count: 1, name: null, ships: [{ mark: MARK(1), ship: 'Beowulf', aboard: [] }] }]]]));
    map.setPublicOverview([{ key: 'On/1620', count: 1 }]);
    map.draw(centre(PPP_NAMES + 1));
    const near = map.trafficTracks();
    const two = near.find((track) => track.key === 'own|cr_two');
    const theirs = near.find((track) => !track.mine);
    assert.equal(theirs.x - two.x, TRACK_STEP, 'one row: yours, then theirs');
    assert.equal(theirs.y, two.y);
    const lead = near.find((track) => track.key === 'own|cr_lead');
    assert.equal(lead.ghost, true, 'the lead keeps its chevron; its track is only for the block');
    assert.equal(lead.label, 'FAR MARGIN');
    assert.equal(map.trackAt(lead.x, lead.y), null, 'a ghost is not pressed through the tracks');
    assert.equal(map.trackAt(lead.x, lead.y, false, true), lead);
    map.draw(centre(8));
    const far = map.trafficTracks();
    const mine = far.find((track) => track.mine);
    assert.equal(mine.many, true, 'two of yours on one system: one track with an inner diamond');
    assert.equal(mine.x, mine.wx);
    const other = far.find((track) => !track.mine);
    assert.equal(other.x - mine.x, TRACK_STEP, 'theirs a step to the right');
    assert.ok(mine.fly && other.fly);
});

test('the open card\'s ship gets the bracket: its track, or the fourth that holds it', () => {
    const { map, centre } = chart();
    const fleet = [1, 2, 3, 4, 5].map((n) => ({ mark: MARK(n), ship: 'Hull ' + n, aboard: [] }));
    map.setPublicGames(new Map([['On', [{ hex: '1620', count: 5, name: null, ships: fleet }]]]));
    map.setSelectedShip(MARK(2));
    map.draw(centre(40));
    assert.equal(map.selectedTrackKey(), 'On/1620|' + MARK(2));
    map.setSelectedShip(MARK(5));
    map.draw(centre(40));
    assert.equal(map.selectedTrackKey(), 'On/1620|more');
    map.setSelectedShip(null);
    map.draw(centre(40));
    assert.equal(map.selectedTrackKey(), null);
    const { traffic, calls } = layer({ still: true });
    traffic.show(TRACKS, 'a');
    const strokes = calls.filter((call) => call[0] === 'stroke').length;
    calls.length = 0;
    traffic.show(TRACKS, null);
    assert.equal(calls.filter((call) => call[0] === 'stroke').length, strokes - 2, 'a bracket: cased and stroked');
});

test('a browser stamps every track from sprites drawn once per kind and swell step: no path is stroked each frame', () => {
    let made = 0;
    const surface = (w, h) => {
        made += 1;
        assert.ok(w === h && (w === spriteSide(1) || w === spriteSide(2)));
        return { width: w, height: h, getContext: () => recordingCtx().ctx };
    };
    const { traffic, calls, refresh } = layer({ surface });
    traffic.show(TRACKS, null);
    const kinds = 4;
    assert.equal(made, kinds * (SPRITE_STEPS + 1) * 2, 'casing and ink, for yours and theirs, one and many, at every step');
    for (let i = 0; i < 20; i += 1) refresh();
    assert.equal(made, kinds * (SPRITE_STEPS + 1) * 2, 'made once, not per frame');
    calls.length = 0;
    traffic.paint();
    assert.equal(calls.filter((call) => call[0] === 'drawImage').length, TRACKS.length * 2);
    assert.equal(calls.some((call) => call[0] === 'stroke' || call[0] === 'fill'), false);
    // Every stamp is the same size at rest and swollen: the sprite holds the swell inside it.
    assert.equal(new Set(calls.filter((call) => call[0] === 'drawImage').map((call) => call[4] + 'x' + call[5])).size, 1);
    assert.equal(spriteStep(1), 0);
    assert.equal(spriteStep(SWELL), SPRITE_STEPS);
    traffic.resize(800, 600, 2);
    assert.equal(made, kinds * (SPRITE_STEPS + 1) * 2 * 2, 'a new pixel ratio draws them again');
});
