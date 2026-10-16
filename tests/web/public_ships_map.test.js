/**
 * Everyone's ships on the map (prompts/d_public_ships_map.md, drawn as tracks since
 * prompts/d_traffic_display.md): the feed's `ships` read when the server sends them, one track per
 * ship at the hex zoom, three and a fourth that stands for the rest, no text on the chart, and the
 * card's words never an id.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { MapRenderer } from '../../apps/web/src/map/MapRenderer.ts';
import { fitLabel, TRACK_SHOWN } from '../../apps/web/src/map/traffic.ts';
import { sectorRect } from '../../apps/web/src/map/geometry.ts';
import { PPP_NAMES } from '../../apps/web/src/map/tiers.ts';
import { bindPublicGames, publicMarks, resetPublicGames, watchPublicGames } from '../../apps/web/src/map/public_games.ts';
import { SHIP_CARD_GAP, SHIP_CARD_W, shipCardHeight, shipCardLines, shipCardPlace } from '../../apps/web/src/workspace/public_ship_card.ts';

const read = (file) => readFileSync(new URL('../../apps/web/src/' + file, import.meta.url), 'utf8');

const MARK = (n) => 'pm_' + String(n).padStart(26, '0');

async function settle() {
    for (let i = 0; i < 6; i += 1) await new Promise((resolve) => setImmediate(resolve));
}

async function feed(body) {
    resetPublicGames();
    bindPublicGames(async () => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } }));
    watchPublicGames({ signedIn: true, truthVersion: 'v10', sectors: ['Spin'] });
    await settle();
    const marks = publicMarks('Spin');
    resetPublicGames();
    return marks;
}

test('the feed: ships are read when sent, unknown keys are left unread, and without them the dot is today’s', async () => {
    assert.deepEqual(await feed({ hexes: [{ hex: '1910', count: 1, name: 'Deneb run' }, { hex: '0101', count: 3, name: null }] }), [
        { hex: '1910', count: 1, name: 'Deneb run' },
        { hex: '0101', count: 3, name: null },
    ]);
    const marks = await feed({
        example: true,
        hexes: [
            {
                hex: '1910', count: 2, name: null, example: true,
                ships: [
                    { mark: MARK(1), ship: 'Beowulf', aboard: ['Tamsin Vore', 'Aric Hale'], example: true, owner: 'x' },
                    { mark: MARK(2), ship: 'Kestrel', aboard: [] },
                    { mark: 'cr_123', ship: 'Not a mark', aboard: [] },
                    { mark: MARK(3), ship: '', aboard: [] },
                    { mark: MARK(4), ship: 'Odd crew', aboard: ['Ok', 7, '', null] },
                ],
            },
            { hex: '0202', count: 1, name: 'Solo', ships: 'not a list' },
            { hex: '0303', count: 1, name: 'Empty', ships: [] },
        ],
    });
    assert.deepEqual(marks, [
        {
            hex: '1910', count: 2, name: null,
            ships: [
                { mark: MARK(1), ship: 'Beowulf', aboard: ['Tamsin Vore', 'Aric Hale'], example: true },
                { mark: MARK(2), ship: 'Kestrel', aboard: [] },
                { mark: MARK(4), ship: 'Odd crew', aboard: ['Ok'] },
            ],
        },
        { hex: '0202', count: 1, name: 'Solo' },
        { hex: '0303', count: 1, name: 'Empty' },
    ]);
    const many = [];
    for (let i = 0; i < 30; i += 1) many.push({ mark: MARK(100 + i), ship: 'Ship ' + i, aboard: new Array(30).fill('Crew') });
    const [big] = await feed({ hexes: [{ hex: '0505', count: 30, name: null, ships: many }] });
    assert.equal(big.ships.length, 20);
    assert.equal(big.ships[0].aboard.length, 20);
});

if (typeof globalThis.Path2D !== 'function') {
    globalThis.Path2D = class Path2D {
        moveTo() {}
        lineTo() {}
        closePath() {}
    };
}

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

function centre(ppp) {
    const rect = sectorRect(0, 0);
    return { x: (rect.x0 + rect.x1) / 2, y: (rect.y0 + rect.y1) / 2, ppp };
}

const texts = (calls) => calls.filter((call) => call[0] === 'fillText').map((call) => call[1]);

function renderer() {
    const { canvas, calls } = recordingCanvas();
    const map = new MapRenderer(canvas, theme);
    map.setChart({ sectors: [{ slug: 'On', name: 'On Sector', x: 0, y: 0, canonical: true, systems: 0 }] }, { truthVersion: 'v10', sectors: [{ slug: 'On', cells: '.'.repeat(1280) }] }, 'canonical');
    map.resize(8000, 8000, 1);
    return { map, calls };
}

const SHIPS = [
    { hex: '1620', count: 2, name: null, ships: [
        { mark: MARK(1), ship: 'Beowulf', aboard: ['Tamsin Vore', 'Aric Hale'] },
        { mark: MARK(2), ship: 'Kestrel', aboard: [] },
    ] },
    { hex: '1622', count: 1, name: 'Deneb run', ships: [{ mark: MARK(3), ship: 'Far Trader Ilse', aboard: ['Mora'] }] },
    { hex: '1720', count: 7, name: null, ships: [1, 2, 3, 4, 5].map((n) => ({ mark: MARK(10 + n), ship: 'Hull ' + n, aboard: [] })) },
    { hex: '1820', count: 1, name: 'Old server' },
];

const theirs = (map) => map.trafficTracks().filter((track) => !track.mine);

test('one track per ship at the hex zoom at every hex zoom, three and a fourth for the rest; no text on the chart; a hex without a list is one track with no card', () => {
    const { map, calls } = renderer();
    map.setPublicGames(new Map([['On', SHIPS]]));
    for (const ppp of [PPP_NAMES + 1, 30]) {
        calls.length = 0;
        map.draw(centre(ppp));
        const tracks = theirs(map);
        assert.equal(tracks.length, 2 + 1 + (TRACK_SHOWN + 1) + 1, 'at ' + ppp);
        const said = texts(calls);
        assert.equal(said.some((label) => /Beowulf|Kestrel|Ilse|Hull|Old server|\+\d/i.test(String(label))), false, 'no names or counts on the chart');
        const hull = tracks.filter((track) => track.key.startsWith('On/1720|'));
        assert.deepEqual(hull.map((track) => track.many), [false, false, false, true], 'the fourth means more');
        assert.equal(hull[3].label, 'HULL 4 +3', 'its block names the next and counts the rest');
        assert.deepEqual(hull.map((track) => track.y), [hull[0].y, hull[0].y, hull[0].y, hull[0].y], 'side by side');
        const old = tracks.find((track) => track.key === 'On/1820|all');
        assert.equal(old.hit.ships.length, 0, 'an old server\'s hex has no card');
        assert.equal(map.publicShipAt(old.x, old.y), null);
    }
});

test('a track is a target for the card, holds no id in its words, and the card opens beside all of its hex\'s tracks', () => {
    const { map, calls } = renderer();
    map.setPublicGames(new Map([['On', SHIPS]]));
    calls.length = 0;
    map.draw(centre(PPP_NAMES + 1));
    const [first, second] = theirs(map);
    const on = map.publicShipAt(first.x, first.y);
    assert.ok(on);
    assert.deepEqual(on.ships.map((ship) => ship.ship), ['Beowulf']);
    assert.equal(first.label, 'BEOWULF');
    assert.equal(map.publicShipAt(second.x, second.y).ships[0].ship, 'Kestrel');
    assert.equal(map.partyAt(first.x, first.y), false);
    assert.equal(map.vesselAt(first.x, first.y), null);
    assert.equal(map.publicShipByKey(on.key), on);
    const other = map.publicShipAt(second.x, second.y);
    assert.equal(on.place.x0, Math.min(on.box.x0, other.box.x0));
    assert.equal(on.place.x1, Math.max(on.box.x1, other.box.x1));
    assert.equal(on.place.y0, Math.min(on.box.y0, other.box.y0));

    const last = theirs(map).find((track) => track.key === 'On/1720|more');
    const more = map.publicShipAt(last.x, last.y);
    assert.ok(more, 'the fourth');
    assert.deepEqual(more.ships.map((ship) => ship.ship), ['Hull 4', 'Hull 5']);
    assert.equal(more.more, 2, 'the hex holds two the feed did not list');
    assert.equal(theirs(map).some((track) => /pm_|cr_|uni_/.test(String(track.label))), false, 'never an id');

    const card = shipCardLines(on.ships, on.more);
    assert.deepEqual(card, { ships: [{ ship: 'Beowulf', aboard: 'Tamsin Vore, Aric Hale' }], rest: null });
    assert.equal(JSON.stringify(card).includes('pm_'), false);
    assert.deepEqual(shipCardLines([{ ship: 'Kestrel', aboard: [] }], 0), { ships: [{ ship: 'Kestrel', aboard: null }], rest: null });
    assert.equal(shipCardLines(more.ships, more.more).rest, 'And 2 more ships.');
    assert.equal(shipCardLines(new Array(6).fill({ ship: 'A', aboard: [] }), 0).rest, 'And 1 more ship.');

    map.setPublicGames(null);
    map.draw(centre(PPP_NAMES + 1));
    assert.equal(map.publicShipAt(first.x, first.y), null);
    map.setPublicGames(new Map([['On', SHIPS]]));
    map.draw(centre(PPP_NAMES + 1));
    map.draw(centre(3));
    assert.equal(map.publicShipAt(first.x, first.y), null, 'zoomed out, no card: a track there flies in');
});

test('the card sits beside its marks, or above them on a phone, always inside the map', () => {
    const h = shipCardHeight(shipCardLines([{ ship: 'Beowulf', aboard: ['Mara Quell'] }], 0));
    assert.ok(h > 40 && h < 90, String(h));
    const box = { x0: 100, y0: 200, x1: 180, y1: 216 };
    assert.deepEqual(shipCardPlace(box, 1600, 900, h), { left: 180 + SHIP_CARD_GAP, top: 200, width: SHIP_CARD_W });
    const right = { x0: 1450, y0: 200, x1: 1530, y1: 216 };
    assert.deepEqual(shipCardPlace(right, 1600, 900, h), { left: 1450 - SHIP_CARD_GAP - SHIP_CARD_W, top: 200, width: SHIP_CARD_W });
    // A phone: above the marks, so the world under them stays in view; under them at the top edge.
    const phone = shipCardPlace({ x0: 150, y0: 300, x1: 260, y1: 316 }, 390, 780, h);
    assert.equal(phone.top, 300 - SHIP_CARD_GAP - h);
    assert.ok(phone.left >= SHIP_CARD_GAP && phone.left + phone.width <= 390 - SHIP_CARD_GAP);
    const top = shipCardPlace({ x0: 150, y0: 30, x1: 260, y1: 46 }, 390, 780, h);
    assert.equal(top.top, 46 + SHIP_CARD_GAP);
    const low = shipCardPlace({ x0: 300, y0: 740, x1: 380, y1: 756 }, 390, 780, h);
    assert.ok(low.top + h <= 780 - SHIP_CARD_GAP);
    assert.equal(fitLabel('Short', (t) => t.length * 6, 150), 'Short');
    const cut = fitLabel('A very long ship name that runs on and on', (t) => t.length * 6, 60);
    assert.ok(cut.endsWith('…') && cut.length * 6 <= 60);
});

test('the hover is the track\'s data block: no hover card; a click opens the read-only card; a tap on an old server pins the block', () => {
    const view = read('views/MapView.vue');
    assert.match(view, /if \(ship && shipCardsReady !== false\) \{\s*void openShip\(ship, sx, sy\);\s*return;/);
    assert.match(view, /if \(ship && pressKind === 'touch'\) \{\s*shipPinned = ship\.key;\s*paintTrackHover\(\);\s*return;/);
    // The block shows for a mouse only: a finger has no hover, so pointerAt stays null for it.
    assert.match(view, /const point = event\.pointerType === 'touch' \? null : canvasPoint\(event\);/);
    assert.match(view, /const track = renderer\.trackAt\(pointerAt\.x, pointerAt\.y, false, true\);/);
    const renderer = read('map/MapRenderer.ts');
    assert.equal(/#[0-9a-fA-F]{3,8}\b/.test(renderer.slice(renderer.indexOf('const SHIP_X'), renderer.indexOf('export const TOUCH_PX'))), false);
});
