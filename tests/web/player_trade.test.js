/**
 * DS4b, the players' trade screens (findings/ship_crew_plan.md §3 (3b)). The pure layer: a press as one
 * append piece read from the referee's own before and after (adds and removes only; a row changed in
 * place, a ledger line taken away and every other key refused), the switches a piece needs as the server
 * reads them, the posted-by words, the member's characters from B's route. The send: a player's piece goes
 * through the door as the picked character; a refused shape never leaves. The page, rendered: the read
 * view without a switch or a character; with one, the referee's sections as the player, each control
 * behind the switches its piece needs, no referee-only control, no Advance; the referee's posted-by line.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { allowedFor, appendOf, NOT_FROM_PLAYERS, PLAYERS_TRADE, postedBy, switchesOf } from '../../apps/web/src/workspace/trade_write.ts';
import { passengerSeen, paymentSeen } from '../../packages/shared/src/ship_door.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const webRoot = path.join(root, 'apps', 'web');
const read = (rel) => fs.readFileSync(path.join(webRoot, 'src', rel), 'utf8');

const rid = (n) => 'cr_00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const stamp = '2026-11-07T00:00:00.000Z';
const record = (n, type, name, visibility, over = {}) => ({
    id: rid(n), type, kind: '', name, summary: '', details: '', tags: [], anchor: null, when: null, visibility,
    playerNotes: null, sheet: null, status: null, images: null, provenance: null, rev: 3, createdAt: stamp, updatedAt: stamp, deleted: false, ...over,
});
const when = { year: 1105, day: 14 };
const line = (memo, amount, over = {}) => ({ when, amount, memo, kind: amount < 0 ? 'expense' : 'income', ...over });
const ore = { label: 'Ore', tons: 10 };
const parts = { label: 'Machine parts', tons: 5, payCr: 5000, destination: 'Jenghe' };
const fare = { label: 'Passenger', class: 'Middle', fareCr: 8000, boarded: true };
const ship = (status) => record(1, 'vessel', 'Kestrel Dawn', 'players', { status });
const tam = () => record(2, 'person', 'Tam Oduya', 'players');
const ana = () => record(3, 'person', 'Ana Vey', 'players');
const party = { vesselIds: [rid(1)], memberIds: [rid(2), rid(3)] };

// ---- the pure layer ------------------------------------------------------------------------------------

describe('appendOf: the referee\'s before and after as one piece', () => {
    const paid = line('Berthing', -100);

    test('Add a line: the new line alone', () => {
        const before = { ledger: [paid] };
        const posted = line('Fuel', -500);
        assert.deepEqual(appendOf(before, { ledger: [paid, posted] }), { ledger: [posted] });
    });

    test('Deliver: the lot out by its index and the pay in', () => {
        const before = { cargo: [ore, parts], ledger: [paid] };
        const pay = line('Delivered Machine parts', 5000);
        assert.deepEqual(appendOf(before, { cargo: [ore], ledger: [paid, pay] }), { cargo: { remove: [1] }, ledger: [pay] });
    });

    test('Take passengers: the lots in and their fares; Take a lot: the lot in', () => {
        const before = { passengers: [], ledger: [] };
        const fares = [line('Fare', 8000), line('Fare', 8000)];
        assert.deepEqual(appendOf(before, { passengers: [fare, fare], ledger: fares }), { passengers: { add: [fare, fare] }, ledger: fares });
        assert.deepEqual(appendOf({ cargo: [ore] }, { cargo: [ore, parts] }), { cargo: { add: [parts] } });
    });

    test('Refuel: the tons aboard and the cost; Disembark: the boarded rows out', () => {
        const cost = line('Refuel, refined', -2000);
        assert.deepEqual(appendOf({ fuelTons: 20, ledger: [] }, { fuelTons: 40, ledger: [cost] }), { fuelTons: 40, ledger: [cost] });
        const waiting = { label: 'Waiting', class: 'Basic' };
        assert.deepEqual(appendOf({ passengers: [fare, waiting, fare] }, { passengers: [waiting] }), { passengers: { remove: [0, 2] } });
    });

    test('refused: a line taken away, a row changed in place, any other key, nothing at all', () => {
        assert.equal(appendOf({ ledger: [paid] }, { ledger: [] }), null, 'Remove this line is the referee\'s');
        const waiting = { label: 'Waiting', class: 'Basic' };
        assert.equal(appendOf({ passengers: [waiting] }, { passengers: [{ ...waiting, fareCr: 300, boarded: true }] }), null, 'Board rewrites the row: the projection would overwrite it');
        assert.equal(appendOf({ payment: { amountCr: 1, everyDays: 30, nextDueDay: when }, ledger: [] }, { payment: { amountCr: 1, everyDays: 30, nextDueDay: { year: 1105, day: 44 } }, ledger: [paid] }), null, 'Pay now moves the payment');
        assert.equal(appendOf({}, { fuelMark: 'naval' }), null);
        assert.equal(appendOf({}, { owners: [] }), null);
        assert.equal(appendOf({ fuelTons: 3 }, { fuelTons: -1 }), null);
        assert.equal(appendOf({ ledger: [paid] }, { ledger: [paid] }), null);
        assert.equal(appendOf(null, { ledger: [] }), null);
    });
});

describe('DT9: Board and Pay now as the pieces of BT2', () => {
    const waiting = { label: 'Ysa Quen', class: 'Middle', note: 'to Jenghe' };
    const owed = { amountCr: 12000, everyDays: 30, nextDueDay: { year: 1105, day: 20 }, payee: 'The bank' };

    test('Board: the board item with the jump and the digest of the row; the fare line is the object one, not sent', () => {
        const before = { passengers: [fare, waiting], ledger: [line('Berthing', -100)] };
        const boardedRow = { ...waiting, class: 'Middle', fareCr: 8000 };
        const after = { passengers: [fare, boardedRow], ledger: [...before.ledger, line('Fare: Ysa Quen, Middle passage, 2 parsecs', 8000)] };
        assert.deepEqual(appendOf(before, after, { board: { index: 1, parsecs: 2 } }), {
            passengers: { board: [{ index: 1, class: 'Middle', fareCr: 8000, parsecs: 2, seen: passengerSeen(waiting) }] },
        });
        assert.equal(passengerSeen(waiting), ['', 'Ysa Quen', 'Middle', 'to Jenghe', ''].join('\u001f'));
        assert.equal(appendOf(before, after), null, 'without the press: still refused');
        assert.equal(appendOf(before, after, { board: { index: 0, parsecs: 2 } }), null, 'a row already boarded');
        assert.equal(appendOf(before, { ...after, ledger: before.ledger }, { board: { index: 1, parsecs: 2 } }), null, 'no fare line');
        assert.equal(appendOf(before, { ...after, passengers: [fare, { ...boardedRow, note: 'changed' }] }, { board: { index: 1, parsecs: 2 } }), null, 'the row changed beyond its class and fare');
        assert.equal(appendOf(before, { ...after, cargo: [ore] }, { board: { index: 1, parsecs: 2 } }), null, 'nothing else rides with it');
        assert.equal(appendOf(before, after, { board: { index: 1, parsecs: 0 } }), null);
    });

    test('Pay now: payNow and the digest of the stored payment; the line and the due day are the object ones', () => {
        const before = { payment: owed, ledger: [] };
        const after = { payment: { ...owed, nextDueDay: { year: 1105, day: 50 } }, ledger: [line('Ship payment to The bank', -12000)] };
        assert.deepEqual(appendOf(before, after, { payNow: true }), { payNow: true, paymentSeen: paymentSeen(owed) });
        assert.equal(appendOf(before, after), null, 'without the press: still refused');
        assert.equal(appendOf({ ledger: [] }, after, { payNow: true }), null, 'no stored payment');
        assert.equal(appendOf(before, { ...after, ledger: [line('Ship payment', -5)] }, { payNow: true }), null, 'a line not the stored amount');
    });

    test('both need the Trade and Ledger switches, as the server reads them', () => {
        assert.deepEqual(switchesOf({ passengers: { board: [{ index: 0, class: 'Middle', fareCr: 1, parsecs: 1, seen: 'x' }] } }), ['ledger', 'trade']);
        assert.deepEqual(switchesOf({ payNow: true, paymentSeen: 'x' }), ['ledger', 'trade']);
    });
});

test('the switches a piece needs, as the server reads them', () => {
    assert.deepEqual(switchesOf({ ledger: [line('x', 1)] }), ['ledger']);
    assert.deepEqual(switchesOf({ cargo: { remove: [0] }, ledger: [line('x', 1)] }), ['ledger', 'trade']);
    assert.deepEqual(switchesOf({ fuelTons: 4 }), ['trade']);
    assert.deepEqual(switchesOf({ passengers: { add: [fare] } }), ['trade']);
    assert.deepEqual(switchesOf({ locker: { add: [] } }), ['locker']);
    assert.equal(allowedFor(['ledger', 'trade'], (key) => key === 'ledger'), false);
    assert.equal(allowedFor(['ledger'], (key) => key === 'ledger'), true);
    const server = fs.readFileSync(path.join(root, 'apps/api/src/universe/campaign.ts'), 'utf8');
    assert.match(server, /if \(append\.ledger\?\.length \|\| boarding \|\| paying\) names\.push\('ledger'\);/);
    assert.match(server, /if \(cargo \|\| passengers \|\| append\.fuelTons !== undefined \|\| paying\) names\.push\('trade'\);/);
});

test('the words', () => {
    assert.equal(postedBy(rid(2), () => 'Tam Oduya'), 'Posted by Tam Oduya');
    assert.equal(postedBy(rid(2), () => ''), 'Posted by a player');
    assert.equal(postedBy(undefined, () => 'Tam Oduya'), '');
    assert.equal(PLAYERS_TRADE, 'You trade; the referee keeps time. Nothing you do here moves the ship or the clock.');
    assert.equal(NOT_FROM_PLAYERS, 'This change can’t be made from a player’s page. Ask the referee.');
});

test('pins: one write path, the player\'s through the door, the page mounts the referee\'s sections as the player', () => {
    const trade = read('workspace/VesselTrade.vue');
    assert.doesNotMatch(trade, /writeTrade\(/, 'every write goes through push');
    assert.match(trade, /return sendTrade\(who\.value, now, change, undefined, press\)/);
    assert.match(trade, /\{ board: \{ index: i, parsecs \} \}\);/, 'DT9: Board names the row and the jump');
    assert.match(trade, /\{ payNow: true \}\)\.then/, 'DT9: Pay now');
    const traffic = read('workspace/TrafficHere.vue');
    assert.doesNotMatch(traffic, /writeTrade\(/);
    assert.match(traffic, /void sendTrade\(presser\.value, now, change\)/);
    const send = read('workspace/trade_send.ts');
    assert.match(send, /writeTrade\(record, change, journal\);/, 'the referee\'s write is the record save');
    assert.match(send, /const append = appendOf\(record\.status as Status \| null, change\.status, press\);\n\s+if \(!append\) return NOT_FROM_PLAYERS;/);
    assert.match(send, /await appendStatus\(record\.id, append, myPersonIds\(\)\.length > 1 \? person : undefined\);/);
    const page = read('workspace/players/PlayerShip.vue');
    assert.match(page, /<VesselTrade :id="id" :read-only="false" who="player" \/>/);
    assert.match(page, /<TrafficHere v-if="canTrade" :id="id" :read-only="false" who="player" \/>/);
    for (const file of ['workspace/trade_write.ts', 'workspace/trade_send.ts', 'workspace/players/me.ts']) {
        const text = read(file);
        assert.doesNotMatch(text, /\bwindow\.|\bdocument\./, file);
    }
    assert.doesNotMatch(page, /#[0-9a-f]{3,6}\b/i, 'tokens only');
});

// ---- the send and the page -----------------------------------------------------------------------------

describe('the member\'s characters, the send, and the page', { concurrency: 1 }, () => {
    let server = null;
    let cacheDir = '';
    let store = null;
    let me = null;
    let sent = [];

    test.before(async () => {
        cacheDir = fs.mkdtempSync(path.join(tmpdir(), 'd-ptrade-'));
        const { createServer } = await import('vite');
        server = await createServer({ root: webRoot, cacheDir, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'silent' });
        store = await server.ssrLoadModule('/src/campaign/store.ts');
        me = await server.ssrLoadModule('/src/workspace/players/me.ts');
        store.transport.fetch = async (url, init = {}) => {
            sent.push({ url: String(url), method: init.method ?? 'GET', body: init.body ? JSON.parse(init.body) : null });
            const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
            if (String(url).endsWith('/players/me')) return json({ data: { personId: rid(2), personIds: [rid(2), rid(3)] } });
            if ((init.method ?? 'GET') === 'PATCH') return json({ data: { applied: [] } });
            // The pages read after an append: not served here; the store keeps what it holds.
            return json({ error: { code: 'unavailable', message: 'Not served in this test.' } }, 503);
        };
    });

    test.after(async () => {
        if (server) await server.close();
        if (cacheDir) fs.rmSync(cacheDir, { recursive: true, force: true, maxRetries: 5 });
    });

    function hold(records, role = 'player') {
        const { campaign } = store;
        for (const key of Object.keys(campaign.records)) delete campaign.records[key];
        for (const row of records) campaign.records[row.id] = row;
        for (const key of Object.keys(campaign.links)) delete campaign.links[key];
        campaign.settings = { party: { vesselIds: [], aboard: {}, memberIds: [], anchor: null, ...party }, kinds: {}, calendar: { dateFormat: 'imperial' }, rev: 2 };
        campaign.clock = { days: 1105 * 365 + 13, rev: 1 };
        campaign.status = 'ready';
        campaign.role = role;
        campaign.universeId = 'u_test';
    }

    async function render(file, props = {}) {
        const view = (await server.ssrLoadModule(file)).default;
        const { createSSRApp } = await import('vue');
        const { renderToString } = await import('vue/server-renderer');
        const { createRouter, createMemoryHistory } = await import('vue-router');
        const app = createSSRApp(view, props);
        const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:any(.*)*', component: { render: () => null } }] });
        app.use(router);
        await router.push('/');
        await router.isReady();
        return (await renderToString(app)).replace(/<!--[\s\S]*?-->/g, '');
    }

    const crew = [{ personId: rid(2), role: 'Captain' }, { personId: rid(3), role: 'Purser' }];
    const stocked = (over = {}) => ship({ crew, cargo: [ore, parts], passengers: [fare], ledger: [line('Berthing', -100), line('Fare', 8000, { by: rid(2) })], fuelTons: 10, ...over });
    const page = () => render('/src/workspace/players/PlayerShip.vue', { id: rid(1) });

    test('the route\'s answer read into the list; the first character presses until another is picked', async () => {
        assert.deepEqual(me.personIdsFrom({ data: { personId: rid(2), personIds: [rid(2), rid(3)] } }), [rid(2), rid(3)]);
        assert.deepEqual(me.personIdsFrom({ data: { personId: rid(2), personIds: [] } }), [rid(2)], 'before the list, the one tie');
        assert.deepEqual(me.personIdsFrom({ data: { personId: null, personIds: [] } }), []);
        assert.equal(me.personIdsFrom({ data: { personIds: 'x' } }), null);
        hold([stocked(), tam(), ana()]);
        sent = [];
        await me.loadMe('u_test');
        assert.equal(sent[0].url, '/api/universes/u_test/players/me');
        assert.deepEqual(me.myPersonIds(), [rid(2), rid(3)]);
        assert.equal(me.actingPerson(), rid(2));
        me.pickPerson(rid(3));
        assert.equal(me.actingPerson(), rid(3));
        me.pickPerson('cr_not_mine');
        assert.equal(me.actingPerson(), rid(3));
        me.setMyPersonIds([rid(2)]);
        assert.equal(me.actingPerson(), rid(2), 'a pick no longer held falls back to the first');
    });

    test('the send: the player\'s piece through the door, the picked character named only when there are several; a refused shape never leaves', async () => {
        const send = await server.ssrLoadModule('/src/workspace/trade_send.ts');
        hold([stocked(), tam(), ana()]);
        const now = store.campaign.records[rid(1)];
        const posted = line('Fuel', -500);
        me.setMyPersonIds([rid(2)]);
        sent = [];
        assert.equal(await send.sendTrade('player', now, { status: { ...now.status, ledger: [...now.status.ledger, posted] } }), '');
        const patch = sent.find((one) => one.method === 'PATCH');
        assert.deepEqual(patch.body, { appends: [{ id: rid(1), append: { ledger: [posted] } }] });
        me.setMyPersonIds([rid(2), rid(3)]);
        me.pickPerson(rid(3));
        sent = [];
        await send.sendTrade('player', now, { status: { ...now.status, ledger: [...now.status.ledger, posted] } });
        assert.equal(sent.find((one) => one.method === 'PATCH').body.appends[0].personId, rid(3));
        sent = [];
        assert.equal(await send.sendTrade('player', now, { status: { ...now.status, ledger: [] } }), NOT_FROM_PLAYERS);
        assert.equal(await send.sendTrade('player', now, { sheet: {}, status: now.status }), NOT_FROM_PLAYERS);
        me.setMyPersonIds([]);
        assert.equal(await send.sendTrade('player', now, { status: { ...now.status, ledger: [...now.status.ledger, posted] } }), NOT_FROM_PLAYERS, 'no character, nothing sent');
        assert.equal(sent.length, 0);
    });

    test('no character, or no switch: the read page, no control', async () => {
        me.setMyPersonIds([]);
        hold([stocked(), tam(), ana()]);
        const none = await page();
        assert.match(none, /data-player-acts="no"/);
        assert.doesNotMatch(none, /data-trade-who|data-players-trade|<form|data-add-lot|data-add-line/);
        me.setMyPersonIds([rid(2)]);
        hold([stocked({ roles: [{ name: 'Captain', ledger: false, trade: false, locker: false }] }), tam(), ana()]);
        const off = await page();
        assert.match(off, /data-player-acts="no"/);
        assert.doesNotMatch(off, /data-add-lot|data-add-line|data-traffic-here/);
    });

    test('every switch on: the referee\'s sections as the player, under the one sentence; nothing the door can\'t carry; no Advance', async () => {
        me.setMyPersonIds([rid(2)]);
        hold([stocked(), tam(), ana()]);
        const html = await page();
        assert.match(html, /data-player-acts="yes"/);
        assert.match(html, /data-players-trade>You trade; the referee keeps time\. Nothing you do here moves the ship or the clock\.<\/p>/);
        assert.match(html, /class="vt" data-trade-who="player"/);
        assert.match(html, /data-add-lot/);
        assert.match(html, /data-add-line/);
        assert.match(html, /data-traffic-here data-trade-who="player"/);
        assert.match(html, /data-posted-by>Posted by Tam Oduya<\/small>/);
        assert.match(html, /data-passage-words>Middle<\/span>/, 'the passage reads as words');
        for (const gone of [/vt-drop/, /data-roll-passenger/, /data-board/, /data-vessel-owners/, /data-pay-now/, /data-fuel-aboard/, /data-fuel-mark/, /data-crew-add|data-crew-permissions/, /data-trade-advance|data-advance/]) {
            assert.doesNotMatch(html, gone, String(gone));
        }
        assert.doesNotMatch(html, /data-acting-as/, 'one character: no picker');
    });

    test('one switch at a time: Trade alone, Ledger alone', async () => {
        me.setMyPersonIds([rid(2)]);
        hold([stocked({ roles: [{ name: 'Captain', ledger: false, trade: true, locker: true }] }), tam(), ana()]);
        const trade = await page();
        assert.match(trade, /data-add-lot/);
        assert.doesNotMatch(trade, /data-add-line|data-deliver|data-post-month/, 'a ledger line needs the Ledger switch');
        assert.match(trade, /data-traffic-here/);
        hold([stocked({ roles: [{ name: 'Captain', ledger: true, trade: false, locker: true }] }), tam(), ana()]);
        const ledger = await page();
        assert.match(ledger, /data-add-line/);
        assert.doesNotMatch(ledger, /data-add-lot|data-deliver|data-traffic-here|data-disembark/);
    });

    test('DT9: Board and Pay now for a player with Trade and Ledger; neither with one switch off', async () => {
        const waiting = { label: 'Ysa Quen', class: 'Middle' };
        const owed = { amountCr: 12000, everyDays: 30, nextDueDay: { year: 1105, day: 20 } };
        me.setMyPersonIds([rid(2)]);
        hold([stocked({ passengers: [fare, waiting], payment: owed }), tam(), ana()]);
        const both = await page();
        assert.match(both, /data-passenger-row[\s\S]*?data-board[^>]*>Board<\/button>/);
        assert.match(both, /data-player-payment[\s\S]*?data-pay-now[^>]*>Pay now: [^<]*12,000<\/button>/);
        assert.doesNotMatch(both, /data-set-payment|data-vessel-owners/, 'setting the payment stays with the referee');
        for (const roles of [[{ name: 'Captain', ledger: false, trade: true, locker: true }], [{ name: 'Captain', ledger: true, trade: false, locker: true }]]) {
            hold([stocked({ passengers: [fare, waiting], payment: owed, roles }), tam(), ana()]);
            const one = await page();
            assert.doesNotMatch(one, /data-board|data-pay-now|data-player-payment/, JSON.stringify(roles[0]));
        }
    });

    test('DT9: the send carries the board item and payNow through the door', async () => {
        const send = await server.ssrLoadModule('/src/workspace/trade_send.ts');
        const waiting = { label: 'Ysa Quen', class: 'Middle' };
        const owed = { amountCr: 12000, everyDays: 30, nextDueDay: { year: 1105, day: 20 } };
        hold([stocked({ passengers: [waiting], payment: owed, ledger: [] }), tam(), ana()]);
        const now = store.campaign.records[rid(1)];
        me.setMyPersonIds([rid(2)]);
        sent = [];
        const boardedRow = { ...waiting, fareCr: 8000 };
        assert.equal(await send.sendTrade('player', now, { status: { ...now.status, passengers: [boardedRow], ledger: [line('Fare: Ysa Quen, Middle passage, 2 parsecs', 8000)] } }, undefined, { board: { index: 0, parsecs: 2 } }), '');
        assert.deepEqual(sent.find((one) => one.method === 'PATCH').body, { appends: [{ id: rid(1), append: { passengers: { board: [{ index: 0, class: 'Middle', fareCr: 8000, parsecs: 2, seen: passengerSeen(waiting) }] } } }] });
        sent = [];
        assert.equal(await send.sendTrade('player', now, { status: { ...now.status, payment: { ...owed, nextDueDay: { year: 1105, day: 50 } }, ledger: [line('Ship payment', -12000)] } }, undefined, { payNow: true }), '');
        assert.deepEqual(sent.find((one) => one.method === 'PATCH').body, { appends: [{ id: rid(1), append: { payNow: true, paymentSeen: paymentSeen(owed) } }] });
    });

    test('several characters: Acting as, and the picked one\'s switches rule', async () => {
        me.setMyPersonIds([rid(2), rid(3)]);
        me.pickPerson(rid(3));
        hold([stocked({ roles: [{ name: 'Captain', ledger: true, trade: true, locker: true }, { name: 'Purser', ledger: true, trade: false, locker: false }] }), tam(), ana()]);
        const html = await page();
        assert.match(html, /data-acting-as/);
        assert.match(html, /<select class="pship-who-box" value="cr_00000000-0000-4000-8000-000000000003">/);
        assert.match(html, /data-add-line/);
        assert.doesNotMatch(html, /data-add-lot/, 'the Purser has no Trade switch');
        me.setMyPersonIds([]);
    });

    test('the referee\'s page: Posted by on a player\'s line, Remove kept, everything as before', async () => {
        hold([stocked(), tam(), ana()], 'owner');
        const html = await render('/src/workspace/VesselTrade.vue', { id: rid(1), readOnly: false });
        assert.match(html, /class="vt" data-trade-who="referee"/);
        assert.match(html, /data-posted-by>Posted by Tam Oduya<\/small>/);
        assert.equal((html.match(/data-posted-by/g) || []).length, 1, 'the referee\'s own line says nothing');
        assert.match(html, /data-drop-line/);
        assert.match(html, /data-roll-passenger/);
        assert.match(html, /data-vessel-owners/);
        assert.match(html, /data-fuel-mark/);
    });
});
