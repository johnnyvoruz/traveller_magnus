/**
 * Your own ships and everyone else's (prompts/d_party_ships_map.md): one marker per party ship,
 * the lead as the party marker always was and the others quieter; the public card read from
 * `GET /api/public-ships/:mark` and its finished route drawn while it is open; "Example" on a
 * dart's tag; the feed asked signed out, a 401 taken quietly; and the pings that keep the map alive.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { drawCampaignLayer, partyContains, partyShipTags } from '../../apps/web/src/map/campaign_layer.ts';
import { hexCentre, sectorRect, toGlobal } from '../../apps/web/src/map/geometry.ts';
import { MapRenderer } from '../../apps/web/src/map/MapRenderer.ts';
import { PPP_NAMES } from '../../apps/web/src/map/tiers.ts';
import { bindPublicGames, dropPublicShip, publicMarks, resetPublicGames, watchPublicGames } from '../../apps/web/src/map/public_games.ts';
import { fetchShipCard, noteDate, readShipCard, routeWords, SHIP_FAILED, SHIP_GONE } from '../../apps/web/src/workspace/public_card.ts';
import { recordingContext } from './orbit_fixture.js';

const read = (file) => readFileSync(new URL('../../apps/web/src/' + file, import.meta.url), 'utf8');
const MARK = (n) => 'pm_' + String(n).padStart(26, '0');
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

async function settle() {
    for (let i = 0; i < 6; i += 1) await new Promise((resolve) => setImmediate(resolve));
}

// ---- your own ships ----------------------------------------------------------------------------

const SECTORS = [{ slug: 'Spinward_Marches', x: -4, y: -1 }];
const INK = { signal: 'signal', tag: 'tag', bg: 'bg', font: 'Font', pulseMs: 1000 };
const VP = { width: 600, height: 400 };
const regina = hexCentre(toGlobal(-4, -1, 19, 10).q, toGlobal(-4, -1, 19, 10).r);
const cam = (ppp) => ({ x: regina.x, y: regina.y, ppp });

function paint(snapshot, ppp) {
    const { ctx, calls } = recordingContext();
    const frame = drawCampaignLayer(ctx, { cam: cam(ppp), vp: VP, sectors: SECTORS, snapshot, ink: INK, nowMs: 0 });
    return { calls, frame };
}

const SHIPS = partyShipTags([
    { id: 'cr_lead', name: 'Far Margin', hexKey: 'Spinward_Marches/1910', lead: true, inJump: false, aboard: ['Voss', 'Ilse'] },
    { id: 'cr_two', name: 'Jewel', hexKey: 'Spinward_Marches/1910', lead: false, inJump: false, aboard: [] },
    { id: 'cr_three', name: 'Sparrow', hexKey: 'Spinward_Marches/2007', lead: false, inJump: true, aboard: ['Mora'] },
]);

test('the tags: the ship in capitals as the party tag always was, then who is aboard as written', () => {
    assert.deepEqual(SHIPS.map((ship) => ship.label), ['FAR MARGIN · Voss, Ilse', 'JEWEL', 'SPARROW · IN JUMP · Mora']);
    assert.deepEqual(SHIPS.map((ship) => ship.lead), [true, false, false]);
});

test('one marker per party ship, each at its own place; two on one hex both read; the lead is the loud one', () => {
    const { calls, frame } = paint({ party: null, ships: SHIPS, locate: null, reducedMotion: false }, PPP_NAMES + 10);
    const said = calls.filter((call) => call.op === 'fillText').map((call) => call.args[0]);
    assert.deepEqual(said.sort(), ['FAR MARGIN · Voss, Ilse', 'JEWEL', 'SPARROW · IN JUMP · Mora']);
    assert.equal(frame.ships.length, 3);
    const lead = frame.ships.find((mark) => mark.id === 'cr_lead');
    const two = frame.ships.find((mark) => mark.id === 'cr_two');
    assert.equal(frame.mark, lead, 'the lead is the party mark');
    assert.equal(lead.cx, two.cx, 'one hex: one column');
    assert.ok(Math.abs(lead.cy - two.cy) >= lead.hitR + two.hitR, 'and the markers do not overlap');
    assert.ok(two.hitR < lead.hitR, 'the other ships are a size smaller');
    assert.ok(two.tag.y >= lead.tag.y + lead.tag.h || lead.tag.y >= two.tag.y + two.tag.h, 'and so do their tags');
    assert.equal(partyContains(two, two.cx, two.cy), true);
    // Further out, one point a hex: the lead's where it is.
    const far = paint({ party: null, ships: SHIPS, locate: null, reducedMotion: false }, 10);
    assert.deepEqual(far.frame.ships.map((mark) => mark.id).sort(), ['cr_lead', 'cr_three']);
    // A party with no ship keeps the one marker, as before.
    const none = paint({ party: { name: 'Party', hexKey: 'Spinward_Marches/1910', focused: false }, ships: [], locate: null, reducedMotion: false }, PPP_NAMES + 10);
    assert.ok(none.frame.mark);
    assert.deepEqual(none.frame.ships, []);
});

test('the renderer says which of your ships was clicked; the map opens the party for it', () => {
    const { ctx } = recordingContext();
    const map = new MapRenderer({ width: 0, height: 0, getContext: () => ctx }, theme);
    map.setChart({ sectors: [{ slug: 'Spinward_Marches', name: 'Spinward Marches', x: -4, y: -1, canonical: true, systems: 0 }] }, { truthVersion: 'v10', sectors: [{ slug: 'Spinward_Marches', cells: '.'.repeat(1280) }] }, 'canonical');
    map.resize(VP.width, VP.height, 1);
    map.setCampaign({ party: null, ships: SHIPS, locate: null, reducedMotion: false });
    map.draw(cam(PPP_NAMES + 10));
    const shot = paint({ party: null, ships: SHIPS, locate: null, reducedMotion: false }, PPP_NAMES + 10).frame.ships;
    const two = shot.find((mark) => mark.id === 'cr_two');
    assert.equal(map.partyShipAt(two.cx, two.cy), 'cr_two');
    assert.equal(map.partyAt(two.cx, two.cy), true);
    const view = read('views/MapView.vue');
    assert.match(view, /const ships = settings \? partyShipMarks\(campaign\.records, settings\.party, days\) : \[\];/);
    assert.match(view, /ships: partyShipTags\(ships\),/);
    assert.match(view, /party: partyIds\.has\(vessel\.id\)/);
    assert.match(view, /if \(renderer && renderer\.partyAt\(sx, sy\)\) \{\s*openParty\(\);/);
});

// ---- the feed ----------------------------------------------------------------------------------

test('signed out the feed is asked; a 401 is taken quietly and nothing more is asked until a sign-in', async () => {
    resetPublicGames();
    const calls = [];
    let status = 401;
    bindPublicGames(async (url) => {
        calls.push(String(url));
        return status === 401 ? json(401, { ok: false }) : json(200, { hexes: [{ hex: '1910', count: 1, name: 'G', ships: [{ mark: MARK(1), ship: 'Beowulf', aboard: [], example: true }] }] });
    });
    watchPublicGames({ signedIn: false, truthVersion: 'v10', sectors: ['Spinward_Marches'] });
    await settle();
    assert.equal(calls.length, 1, 'a visitor asks');
    watchPublicGames({ signedIn: false, truthVersion: 'v10', sectors: ['Spinward_Marches', 'Deneb', 'Trojan_Reach'] });
    await settle();
    assert.equal(calls.length, 1, 'no more asks after the 401, and no loop');
    assert.deepEqual(publicMarks('Spinward_Marches'), []);
    status = 200;
    watchPublicGames({ signedIn: true, truthVersion: 'v10', sectors: ['Spinward_Marches'] });
    await settle();
    assert.equal(calls.length, 2, 'signing in asks again');
    assert.equal(publicMarks('Spinward_Marches')[0].ships[0].example, true);
    // A visitor on a server after 0018 is answered, and sees the ships.
    resetPublicGames();
    bindPublicGames(async () => json(200, { hexes: [{ hex: '1910', count: 2, name: null, ships: [{ mark: MARK(1), ship: 'A', aboard: [] }, { mark: MARK(2), ship: 'B', aboard: [] }] }] }));
    watchPublicGames({ signedIn: false, truthVersion: 'v10', sectors: ['Spinward_Marches'] });
    await settle();
    assert.equal(publicMarks('Spinward_Marches')[0].ships.length, 2);
    assert.equal(dropPublicShip(MARK(1)), true, 'a 404 card drops its dart');
    assert.deepEqual(publicMarks('Spinward_Marches'), [{ hex: '1910', count: 1, name: null, ships: [{ mark: MARK(2), ship: 'B', aboard: [] }] }]);
    assert.equal(dropPublicShip(MARK(2)), true);
    assert.deepEqual(publicMarks('Spinward_Marches'), []);
    resetPublicGames();
});

// ---- the card ----------------------------------------------------------------------------------

const CARD = {
    game: 'Glass Wake', referee: 'varn', example: true, ship: 'Beowulf', aboard: ['Mara Quell'],
    legs: [
        { from: 'Spinward_Marches/2007', to: 'Spinward_Marches/1910', departs: 10, arrives: 12 },
        { from: 'Spinward_Marches/1910', to: 'Spinward_Marches/1910', departs: 12, arrives: 14 },
        { from: 'cr_bad', to: 'Spinward_Marches/1910', departs: 1, arrives: 2 },
    ],
    journal: [
        { title: 'Out of Regina', body: 'Fuel bought.', when: { year: 1105, day: 120 }, realDate: null },
        { title: '', body: 'A note.', when: null, realDate: '2026-10-14' },
        { title: '', body: '', when: null, realDate: null },
    ],
    future: 'left unread',
};

test('the card is read leniently: unknown keys and unreadable legs or notes are left out', () => {
    const card = readShipCard(CARD);
    assert.equal(card.game, 'Glass Wake');
    assert.equal(card.referee, 'varn');
    assert.equal(card.example, true);
    assert.equal(card.legs.length, 2);
    assert.deepEqual(card.journal.map((note) => note.date), ['120-1105', '14 October 2026']);
    assert.equal('future' in card, false);
    assert.equal(readShipCard({ ...CARD, referee: null }).referee, null);
    assert.equal(readShipCard({ ship: 'x' }), null);
    assert.equal(noteDate({ year: 1105, day: 400 }, null), null);
    assert.equal(routeWords(card.legs), 'One finished leg, drawn on the map.');
    assert.equal(routeWords([]), null);
});

test('a click\'s answers: the card, gone (404), no cards yet (503 or 401), or failed', async () => {
    const at = (status, body) => async (url) => {
        assert.equal(String(url), '/api/public-ships/' + MARK(7));
        return json(status, body);
    };
    assert.equal((await fetchShipCard(at(200, CARD), MARK(7))).kind, 'card');
    assert.deepEqual(await fetchShipCard(at(404, { ok: false }), MARK(7)), { kind: 'gone' });
    assert.deepEqual(await fetchShipCard(at(503, { ok: false }), MARK(7)), { kind: 'off' });
    assert.deepEqual(await fetchShipCard(at(401, { ok: false }), MARK(7)), { kind: 'off' });
    assert.deepEqual(await fetchShipCard(at(429, { ok: false }), MARK(7)), { kind: 'failed' });
    assert.deepEqual(await fetchShipCard(at(200, { nope: 1 }), MARK(7)), { kind: 'failed' });
    assert.deepEqual(await fetchShipCard(async () => { throw new TypeError('offline'); }, MARK(7)), { kind: 'failed' });
    assert.deepEqual(await fetchShipCard(at(200, CARD), 'cr_123'), { kind: 'failed' });
    assert.equal(SHIP_GONE, 'This ship is no longer public.');
    assert.equal(SHIP_FAILED, 'The card could not be loaded. Try again.');
});

test('the card is read-only, closes three ways, and is a sheet on a phone', () => {
    const sheet = read('workspace/PublicShipSheet.vue');
    const template = sheet.slice(sheet.indexOf('<template>'), sheet.indexOf('<style>'));
    assert.equal((template.match(/<button/g) || []).length, 1, 'one control: Close');
    assert.equal(/<input|<textarea|<select|contenteditable/.test(template), false);
    assert.match(template, /aria-label="Close" title="Close \(Esc\)"/);
    assert.match(template, /@keydown\.esc\.stop\.prevent="emit\('close'\)"/);
    assert.match(template, /<span v-if="example" class="psheet-example" data-example>Example<\/span>/);
    assert.match(template, /<div v-if="state\.card\.referee" data-referee>/);
    assert.match(template, /<p v-if="aboard" class="psheet-aboard">/);
    assert.match(sheet, /\.psheet\.is-sheet \{[^}]*bottom: 8px;/);
    assert.equal(/#[0-9a-fA-F]{3,8}\b/.test(sheet.slice(sheet.indexOf('<style>'))), false);
    const view = read('views/MapView.vue');
    assert.match(view, /if \(event\.key === 'Escape' && shipSheet\.value\) \{\s*event\.preventDefault\(\);\s*closeShip\(\);/);
    assert.match(view, /if \(shipSheet\.value\) closeShip\(false\);/);
    assert.match(view, /renderer\.setPublicRoute\(answer\.card\.legs\)/);
    assert.match(view, /dropPublicShip\(first\.mark\)/);
});

// ---- the darts, the route and the pings -------------------------------------------------------

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

function chartRenderer() {
    const { canvas, calls } = recordingCanvas();
    const map = new MapRenderer(canvas, theme);
    map.setChart({ sectors: [{ slug: 'On', name: 'On Sector', x: 0, y: 0, canonical: true, systems: 0 }] }, { truthVersion: 'v10', sectors: [{ slug: 'On', cells: '.'.repeat(1280) }] }, 'canonical');
    map.resize(8000, 8000, 1);
    const rect = sectorRect(0, 0);
    return { map, calls, centre: (ppp) => ({ x: (rect.x0 + rect.x1) / 2, y: (rect.y0 + rect.y1) / 2, ppp }) };
}

test('an example ship says so after its name, quieter; each dart glows; each hex pings', () => {
    const { map, calls, centre } = chartRenderer();
    map.setPublicGames(new Map([['On', [
        { hex: '1620', count: 1, name: 'G', ships: [{ mark: MARK(1), ship: 'Beowulf', aboard: [], example: true }] },
        { hex: '1622', count: 1, name: 'H', ships: [{ mark: MARK(2), ship: 'Kestrel', aboard: [] }] },
    ]]]));
    calls.length = 0;
    map.draw(centre(PPP_NAMES + 1));
    const said = calls.filter((call) => call[0] === 'fillText').map((call) => call[1]);
    assert.equal(said.filter((word) => word === 'Example').length, 1);
    const example = calls.findIndex((call) => call[0] === 'fillText' && call[1] === 'Example');
    const ink = calls.slice(0, example).reverse().find((call) => call[0] === 'set' && call[1] === 'fillStyle');
    assert.equal(ink[2], 'muted', 'quieter than the name');
    assert.equal(calls.filter((call) => call[0] === 'set' && call[1] === 'shadowColor' && call[2] === 'public').length, 2, 'a glow per dart');
    assert.deepEqual(map.publicShipPings().map((ping) => ping.key), ['On/1620', 'On/1622']);
    calls.length = 0;
    map.draw(centre(3));
    assert.deepEqual(map.publicShipPings(), [], 'no pings zoomed out, where no dart is drawn');
});

test('the open card\'s route: violet round dots that march, a ring per stop, at every zoom; gone when it closes', (t) => {
    let reduced = false;
    const had = globalThis.window;
    globalThis.window = { matchMedia: () => ({ matches: reduced }) };
    t.after(() => { globalThis.window = had; });
    const { map, calls, centre } = chartRenderer();
    map.setPublicRoute([{ from: 'On/1620', to: 'On/1622' }, { from: 'On/1622', to: 'On/1622' }, { from: 'Elsewhere/0101', to: 'On/1620' }]);
    for (const ppp of [PPP_NAMES + 1, 30, 3]) {
        calls.length = 0;
        const drawn = map.draw(centre(ppp));
        const dash = calls.find((call) => call[0] === 'setLineDash' && call[1].length === 2);
        assert.ok(dash, 'dotted at ' + ppp);
        assert.equal(calls.some((call) => call[0] === 'set' && call[1] === 'lineCap' && call[2] === 'round'), true);
        assert.equal(calls.some((call) => call[0] === 'set' && call[1] === 'strokeStyle' && call[2] === 'public'), true);
        assert.equal(calls.filter((call) => call[0] === 'arc').length >= 2, true, 'a ring per stop');
        assert.equal(drawn.animating, true, 'it marches');
    }
    reduced = true;
    assert.equal(map.draw(centre(30)).animating, false, 'still under reduced motion');
    map.setPublicRoute(null);
    calls.length = 0;
    map.draw(centre(30));
    assert.equal(calls.some((call) => call[0] === 'setLineDash' && call[1].length === 2), false);
    t.diagnostic('route drawn at three zooms');
});

test('the pings are compositor CSS that take no pointer, from tokens, and still under reduced motion', () => {
    const pings = read('workspace/ShipPings.vue');
    assert.match(pings, /\.ship-pings \{[^}]*pointer-events: none;/);
    assert.match(pings, /animation: ship-ping var\(--ship-ping\) var\(--ease-out\) infinite;/);
    assert.match(pings, /@media \(prefers-reduced-motion: reduce\) \{\s*\.ship-pings \{\s*display: none;/);
    assert.equal(/#[0-9a-fA-F]{3,8}\b|\d+ms\b/.test(pings), false);
    const tokens = read('design/tokens.css');
    assert.match(tokens, /--ship-ping: \d+ms;/);
    assert.match(tokens, /--ship-ping-reach: \d+px;/);
    const view = read('views/MapView.vue');
    assert.match(view, /<ShipPings :pings="shipPings" \/>/);
});
