/**
 * Everyone's ships on the map (prompts/d_public_ships_map.md): the feed's `ships` read when the
 * server sends them and today's dot when it does not, one dart per ship with its name where world
 * names show, "+N" past three, and a hover card with the name and who is aboard, never an id and
 * never a click target.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fitLabel, MapRenderer } from '../../apps/web/src/map/MapRenderer.ts';
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

/** The darts drawn: each starts by setting the backing stroke, then its nose is the next moveTo. */
function darts(calls) {
    const out = [];
    for (let i = 0; i < calls.length; i += 1) {
        const call = calls[i];
        if (call[0] !== 'moveTo') continue;
        const stroke = calls.slice(i + 1, i + 8).find((next) => next[0] === 'set' && next[1] === 'strokeStyle');
        if (stroke && stroke[2] === 'bg') out.push({ x: call[1], y: call[2] });
    }
    return out;
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

test('one dart per ship where names show, two and a "+N" past three; further out one stack per hex; today’s diamond without a list', () => {
    const { map, calls } = renderer();
    map.setPublicGames(new Map([['On', SHIPS]]));

    calls.length = 0;
    map.draw(centre(PPP_NAMES + 1));
    assert.equal(darts(calls).length, 2 + 1 + 2);
    const named = texts(calls);
    for (const label of ['Beowulf', 'Kestrel', 'Far Trader Ilse', 'Hull 1', 'Hull 2', '+5', 'Old server']) assert.ok(named.includes(label), label);
    assert.equal(named.includes('Hull 3'), false);
    assert.equal(named.some((label) => /pm_|cr_|uni_/.test(String(label))), false, 'never an id');
    // The old server's hex keeps the diamond: its stroke is the public colour, the darts' is the backing.
    assert.equal(calls.filter((call) => call[0] === 'set' && call[1] === 'strokeStyle' && call[2] === 'public').length, 1);

    calls.length = 0;
    map.draw(centre(30));
    assert.equal(darts(calls).length, 2 + 1 + 3, 'a stack of at most three a hex');
    const quiet = texts(calls);
    assert.deepEqual(quiet.filter((label) => label !== '+4' && label !== 'On Sector'), [], 'no names below the names tier');
    assert.ok(quiet.includes('+4'));
    // Further out, the stack is one hover target for the hex: its card lists every ship.
    const stack = darts(calls)[0];
    const all = map.publicShipAt(stack.x - 2, stack.y);
    assert.deepEqual(all.ships.map((ship) => ship.ship).sort(), ['Beowulf', 'Kestrel']);
});

test('the dart is a hover target for the card, never a click target, and the card holds no id', () => {
    const { map, calls } = renderer();
    map.setPublicGames(new Map([['On', SHIPS]]));
    calls.length = 0;
    map.draw(centre(PPP_NAMES + 1));
    const [first, second] = darts(calls);
    const on = map.publicShipAt(first.x - 2, first.y);
    assert.ok(on);
    assert.deepEqual(on.ships.map((ship) => ship.ship), ['Beowulf']);
    assert.equal(map.publicShipAt(second.x - 2, second.y).ships[0].ship, 'Kestrel');
    assert.equal(map.partyAt(first.x - 2, first.y), false);
    assert.equal(map.vesselAt(first.x - 2, first.y), null);
    assert.equal(map.publicShipByKey(on.key), on);
    // The card opens beside all of the hex's marks, never over one of them.
    const other = map.publicShipAt(second.x - 2, second.y);
    assert.ok(on.place.x1 >= other.box.x1 && on.place.x1 >= on.box.x1);
    assert.equal(on.place.y0, Math.min(on.box.y0, other.box.y0));
    assert.equal(on.place.y1, Math.max(on.box.y1, other.box.y1));

    const last = darts(calls)[4];
    const more = map.publicShipAt(last.x - 2, last.y - 18);
    assert.ok(more, 'the "+N" row');
    assert.deepEqual(more.ships.map((ship) => ship.ship), ['Hull 3', 'Hull 4', 'Hull 5']);
    assert.equal(more.more, 2, 'the hex holds two the feed did not list');

    const card = shipCardLines(on.ships, on.more);
    assert.deepEqual(card, { ships: [{ ship: 'Beowulf', aboard: 'Tamsin Vore, Aric Hale' }], rest: null });
    assert.equal(JSON.stringify(card).includes('pm_'), false);
    assert.deepEqual(shipCardLines([{ ship: 'Kestrel', aboard: [] }], 0), { ships: [{ ship: 'Kestrel', aboard: null }], rest: null });
    assert.equal(shipCardLines(more.ships, more.more).rest, 'And 2 more ships.');
    assert.equal(shipCardLines(new Array(6).fill({ ship: 'A', aboard: [] }), 0).rest, 'And 1 more ship.');

    map.setPublicGames(null);
    map.draw(centre(PPP_NAMES + 1));
    assert.equal(map.publicShipAt(first.x - 2, first.y), null);
    map.setPublicGames(new Map([['On', SHIPS]]));
    map.draw(centre(PPP_NAMES + 1));
    map.draw(centre(3));
    assert.equal(map.publicShipAt(first.x - 2, first.y), null, 'zoomed out, no marks and no card');
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

test('the hover card is not a control: no pointer cursor, it takes no pointer, tokens only; a click opens the read-only card', () => {
    const card = read('workspace/PublicShipCard.vue');
    assert.match(card, /\.pship-layer \{[^}]*pointer-events: none;/);
    assert.equal(/cursor:|:hover|<button|tabindex/.test(card), false);
    assert.equal(/#[0-9a-fA-F]{3,8}\b/.test(card.slice(card.indexOf('<style>'))), false);
    const view = read('views/MapView.vue');
    assert.match(view, /if \(ship && shipCardsReady !== false\) \{\s*void openShip\(ship, sx, sy\);\s*return;/);
    // Before 0018 the dart stays hover-only: a tap still shows what hovering shows.
    assert.match(view, /if \(ship && pressKind === 'touch'\) \{\s*shipPinned = ship\.key;\s*paintShipCard\(\);\s*return;/);
    assert.equal(view.split('<PublicShipCardView').length - 1, 1);
    const renderer = read('map/MapRenderer.ts');
    assert.equal(/#[0-9a-fA-F]{3,8}\b/.test(renderer.slice(renderer.indexOf('const SHIP_X'), renderer.indexOf('type ShipHit'))), false);
});
