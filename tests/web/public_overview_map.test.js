/**
 * The zoomed-out map keeps other people's ships (prompts/d_public_overview_map.md, drawn as tracks
 * since prompts/d_traffic_display.md): the overview read and asked once a minute while out, one track
 * per system off the hex zoom, merged where they would overlap, that flies the camera in; a finger's
 * target of TOUCH_PX on every track and on your own ships; and a card opened on a hex of several
 * ships that steps through them all.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { drawCampaignLayer, partyShipTags } from '../../apps/web/src/map/campaign_layer.ts';
import { hexCentre, sectorRect, toGlobal } from '../../apps/web/src/map/geometry.ts';
import { MapRenderer, TOUCH_PX } from '../../apps/web/src/map/MapRenderer.ts';
import { TRACK_MERGE_PX } from '../../apps/web/src/map/traffic.ts';
import { PPP_GRID, PPP_NAMES } from '../../apps/web/src/map/tiers.ts';
import {
    _clockForTests, bindPublicGames, PUBLIC_OVERVIEW_EVERY_MS, publicOverview, readOverview, resetPublicGames, watchPublicOverview,
} from '../../apps/web/src/map/public_games.ts';
import { recordingContext } from './orbit_fixture.js';

const read = (file) => readFileSync(new URL('../../apps/web/src/' + file, import.meta.url), 'utf8');
const MARK = (n) => 'pm_' + String(n).padStart(26, '0');
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

async function settle() {
    for (let i = 0; i < 6; i += 1) await new Promise((resolve) => setImmediate(resolve));
}

// ---- the overview ------------------------------------------------------------------------------

test('the overview is read leniently: hex keys and counts, nothing else; an own sector never', () => {
    assert.deepEqual(readOverview({
        hexes: [
            { key: 'Spinward_Marches/1910', count: 2, name: 'never read', ships: [] },
            { key: '~slot_3_-1/0101', count: 1 },
            { key: 'Spinward_Marches/191', count: 1 },
            { key: 'Spinward_Marches/2007', count: 0 },
            { key: 'Spinward_Marches/2008', count: 1.5 },
            { key: 'Deneb/0101', count: 7 },
            null,
        ],
        future: true,
    }), [{ key: 'Spinward_Marches/1910', count: 2 }, { key: 'Deneb/0101', count: 7 }]);
    assert.equal(readOverview({ nope: 1 }), null);
});

test('asked when the map leaves the hex zoom, then at most once a minute; a null pin asks nothing; a 401 signed out is quiet', async () => {
    let t = 0;
    _clockForTests({ now: () => t, later() {} });
    const calls = [];
    let status = 200;
    bindPublicGames(async (url) => {
        calls.push(String(url));
        return status === 200 ? json(200, { hexes: [{ key: 'Spinward_Marches/1910', count: 2 }] }) : json(status, { ok: false });
    });
    watchPublicOverview({ signedIn: true, truthVersion: 'v10', out: false });
    await settle();
    assert.equal(calls.length, 0, 'not at the hex zoom');
    watchPublicOverview({ signedIn: true, truthVersion: null, out: true });
    await settle();
    assert.equal(calls.length, 0, 'not without a pin');
    watchPublicOverview({ signedIn: true, truthVersion: 'v10', out: true });
    await settle();
    assert.deepEqual(calls, ['/api/public-games/overview?truthVersion=v10']);
    assert.deepEqual(publicOverview(), [{ key: 'Spinward_Marches/1910', count: 2 }]);
    t += PUBLIC_OVERVIEW_EVERY_MS - 1;
    watchPublicOverview({ signedIn: true, truthVersion: 'v10', out: true });
    await settle();
    assert.equal(calls.length, 1, 'not again inside the minute');
    t += 1;
    watchPublicOverview({ signedIn: true, truthVersion: 'v10', out: true });
    await settle();
    assert.equal(calls.length, 2, 'again after a minute out');
    // Signed out on a server before 0018: one 401, then nothing until a sign-in.
    resetPublicGames();
    _clockForTests({ now: () => t, later() {} });
    calls.length = 0;
    status = 401;
    bindPublicGames(async (url) => {
        calls.push(String(url));
        return status === 200 ? json(200, { hexes: [] }) : json(status, { ok: false });
    });
    watchPublicOverview({ signedIn: false, truthVersion: 'v10', out: true });
    await settle();
    t += PUBLIC_OVERVIEW_EVERY_MS * 5;
    watchPublicOverview({ signedIn: false, truthVersion: 'v10', out: true });
    await settle();
    assert.equal(calls.length, 1);
    assert.deepEqual(publicOverview(), []);
    status = 200;
    watchPublicOverview({ signedIn: true, truthVersion: 'v10', out: true });
    await settle();
    assert.equal(calls.length, 2, 'a sign-in asks again');
    resetPublicGames();
});

// ---- drawing it --------------------------------------------------------------------------------

function recordingCanvas() {
    const calls = [];
    const ctx = new Proxy({}, {
        get(_target, prop) {
            if (prop === 'measureText') return (text) => ({ width: String(text).length * 6 });
            if (prop === 'save' || prop === 'restore' || prop === 'beginPath' || prop === 'closePath' || prop === 'stroke' || prop === 'fill') {
                return () => { calls.push([String(prop)]); };
            }
            return (...args) => { calls.push([String(prop), ...args]); };
        },
        set(_target, prop, value) {
            calls.push(['set', String(prop), value]);
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

function chart() {
    const { canvas, calls } = recordingCanvas();
    const map = new MapRenderer(canvas, theme);
    map.setChart({ sectors: [{ slug: 'On', name: 'On Sector', x: 0, y: 0, canonical: true, systems: 0 }] }, { truthVersion: 'v10', sectors: [{ slug: 'On', cells: '.'.repeat(1280) }] }, 'canonical');
    map.resize(1600, 1000, 1);
    const rect = sectorRect(0, 0);
    return { map, calls, centre: (ppp) => ({ x: (rect.x0 + rect.x1) / 2, y: (rect.y0 + rect.y1) / 2, ppp }) };
}

const OVERVIEW = [
    { key: 'On/1620', count: 1 },
    { key: 'On/1622', count: 2 },
    { key: 'On/0101', count: 5 },
    { key: 'Elsewhere/0101', count: 3 },
    { key: '~own/0101', count: 1 },
];

const theirs = (map) => map.trafficTracks().filter((track) => !track.mine);

test('off the hex zoom each system with ships is one open track centred on it, an inner diamond for more than one; it flies in; an unknown or own sector never', () => {
    const { map, calls, centre } = chart();
    map.setPublicOverview(OVERVIEW);
    for (const ppp of [PPP_GRID - 1, 6]) {
        calls.length = 0;
        map.draw(centre(ppp));
        const tracks = theirs(map);
        assert.deepEqual(tracks.map((track) => track.key), ['far|On/0101', 'far|On/1622', 'far|On/1620'], 'busiest first at ' + ppp);
        assert.deepEqual(tracks.map((track) => track.many), [true, true, false]);
        for (const track of tracks) {
            assert.equal(track.x, track.wx, 'centred on the system');
            assert.equal(track.label, null, 'the overview has no names: no block');
            assert.equal(track.hit, null, 'no card');
            assert.ok(track.fly, 'a press flies to its hex');
        }
        assert.equal(map.trackAt(tracks[2].x, tracks[2].y), tracks[2]);
        assert.equal(map.publicShipAt(tracks[2].x, tracks[2].y, true), null, 'no card zoomed out');
        assert.equal(calls.some((call) => call[0] === 'set' && call[1] === 'globalCompositeOperation' && call[2] === 'lighter'), false, 'no glow');
    }
});

test('far out, tracks that would overlap merge into one with an inner diamond; the busiest stands for them', () => {
    const { map, centre } = chart();
    map.setPublicOverview(OVERVIEW);
    map.draw(centre(2));
    const tracks = theirs(map);
    assert.ok(tracks.length < 3, 'merged at ' + tracks.length);
    assert.equal(tracks[0].key, 'far|On/0101');
    for (let i = 0; i < tracks.length; i += 1) {
        for (let j = i + 1; j < tracks.length; j += 1) assert.ok(Math.hypot(tracks[i].x - tracks[j].x, tracks[i].y - tracks[j].y) >= TRACK_MERGE_PX);
    }
    assert.equal(tracks.find((track) => track.key === 'far|On/1620' || track.key === 'far|On/1622').many, true);
});

test('at the hex zoom the overview adds nothing: the sector feed\'s tracks are the ships, with no double', () => {
    const { map, centre } = chart();
    map.setPublicOverview(OVERVIEW);
    map.setPublicGames(new Map([['On', [{ hex: '1620', count: 1, name: 'G', ships: [{ mark: MARK(1), ship: 'Beowulf', aboard: [] }] }]]]));
    map.draw(centre(PPP_NAMES + 1));
    assert.deepEqual(theirs(map).map((track) => track.key), ['On/1620|' + MARK(1)]);
    assert.equal(theirs(map)[0].fly, null, 'at the hex zoom a track opens its card');
    map.setPublicOverview(null);
    map.draw(centre(3));
    assert.deepEqual(theirs(map), []);
});

test('the view hands the overview over before each draw; zoomed out a press on a track flies to its hex at the hex zoom', () => {
    const view = read('views/MapView.vue');
    assert.match(view, /renderer\.setPublicOverview\(publicOverview\(\)\);\s*const drawn = renderer\.draw\(cam\);/);
    assert.match(view, /watchPublicOverview\(\{ signedIn: session\.user !== null, truthVersion: version \? version : null, out: drawn\.tier !== 'hex' \}, markDirty\);/);
    assert.match(view, /if \(track && track\.fly\) \{\s*flyTo\(\{ x: track\.fly\.x, y: track\.fly\.y, ppp: Math\.max\(cam\.ppp, PPP_NAMES\) \}\);\s*return;/);
});

// ---- a finger's target --------------------------------------------------------------------------

test('a finger gets TOUCH_PX on a track and wins over the hex, unless nearer the world; a mouse keeps the drawn track', () => {
    const { map, centre } = chart();
    map.setPublicGames(new Map([['On', [{ hex: '1620', count: 2, name: null, ships: [{ mark: MARK(1), ship: 'Copper List', aboard: [] }, { mark: MARK(2), ship: 'Kestrel', aboard: [] }] }]]]));
    map.draw(centre(30));
    const first = theirs(map)[0];
    const hit = map.publicShipAt(first.x, first.y);
    assert.ok(hit, 'the first track');
    const near = [hit.box.x0 - 8, hit.cy - 8];
    assert.equal(map.publicShipAt(near[0], near[1]), null, 'a mouse beside the dart is not on it');
    assert.equal(map.publicShipAt(near[0], near[1], true), hit, 'a finger there is');
    assert.ok(TOUCH_PX >= 44);
    assert.equal(map.publicShipAt(hit.wx + 2, hit.wy + 2, true), null, 'a finger on the world is the world\'s');
    assert.equal(map.publicShipAt(hit.cx - TOUCH_PX, hit.cy - TOUCH_PX, true), null, 'and far off is nothing');
});

test('a finger gets TOUCH_PX on your own ships too, and a tap on the world stays the world\'s', () => {
    const regina = hexCentre(toGlobal(-4, -1, 19, 10).q, toGlobal(-4, -1, 19, 10).r);
    const { ctx } = recordingContext();
    const map = new MapRenderer({ width: 0, height: 0, getContext: () => ctx }, theme);
    map.setChart({ sectors: [{ slug: 'Spinward_Marches', name: 'Spinward Marches', x: -4, y: -1, canonical: true, systems: 0 }] }, { truthVersion: 'v10', sectors: [{ slug: 'Spinward_Marches', cells: '.'.repeat(1280) }] }, 'canonical');
    map.resize(600, 400, 1);
    const ships = partyShipTags([{ id: 'cr_lead', name: 'Far Margin', hexKey: 'Spinward_Marches/1910', lead: true, inJump: false, aboard: [] }]);
    map.setCampaign({ party: null, ships, locate: null, reducedMotion: false });
    const cam = { x: regina.x, y: regina.y, ppp: 30 };
    map.draw(cam);
    const { frame } = (() => {
        const rec = recordingContext();
        return { frame: drawCampaignLayer(rec.ctx, { cam, vp: { width: 600, height: 400 }, sectors: [{ slug: 'Spinward_Marches', x: -4, y: -1 }], snapshot: { party: null, ships, locate: null, reducedMotion: false }, ink: { signal: 's', tag: 't', bg: 'b', font: 'f', pulseMs: 1000 }, nowMs: 0 }) };
    })();
    const mark = frame.ships[0];
    const beside = [mark.cx + mark.hitR + 8, mark.cy + 6];
    assert.equal(map.partyShipAt(beside[0], beside[1]), null);
    assert.equal(map.partyShipAt(beside[0], beside[1], true), 'cr_lead');
    assert.equal(map.partyAt(beside[0], beside[1], true), true);
    assert.equal(map.partyShipAt(mark.worldX + 3, mark.worldY, true), null, 'the world keeps its tap');
});

// ---- a stack's every ship -----------------------------------------------------------------------

test('a card opened on a hex of several ships says "1 of N" and steps through every one of them', () => {
    const { map, centre } = chart();
    const fleet = [{ mark: MARK(1), ship: 'Copper List', aboard: [] }, { mark: MARK(2), ship: 'Kestrel’s Due', aboard: [] }];
    map.setPublicGames(new Map([['On', [{ hex: '1620', count: 2, name: null, ships: fleet }]]]));
    for (const ppp of [30, PPP_NAMES + 1]) {
        map.draw(centre(ppp));
        const second = theirs(map)[1];
        const row = map.publicShipAt(second.x, second.y);
        assert.deepEqual(row.ships.map((ship) => ship.ship), ['Kestrel’s Due']);
        assert.deepEqual(row.fleet.map((ship) => ship.ship), ['Copper List', 'Kestrel’s Due'], 'a single track knows the rest of its hex');
    }
    const sheet = read('workspace/PublicShipSheet.vue');
    assert.match(sheet, /String\(props\.state\.index \+ 1\) \+ ' of ' \+ String\(props\.state\.count\)/);
    assert.match(sheet, /aria-label="Previous ship"[^>]*:disabled="state\.index === 0"[^>]*@click="emit\('step', -1\)"/);
    assert.match(sheet, /aria-label="Next ship"[^>]*:disabled="state\.index >= state\.count - 1"[^>]*@click="emit\('step', 1\)"/);
    const view = read('views/MapView.vue');
    assert.match(view, /shipSheetFleet = hit\.fleet\.length > 0 \? hit\.fleet : hit\.ships;/);
    assert.match(view, /const index = Math\.max\(0, shipSheetFleet\.findIndex\(\(ship\) => ship\.mark === first\.mark\)\);/);
    assert.match(view, /@step="stepShip"/);
});
