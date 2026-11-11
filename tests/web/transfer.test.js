/**
 * DS5, the transfer line (findings/ship_crew_plan.md §3 (4); Johnny 140). Two lines that mirror: the same
 * credits, opposite signs, one `linkId`, both dated the campaign day; the memos; the register's half first,
 * the ship's half after, and a reversing line on the register when the ship's half does not land; no Remove
 * on a transfer's line. The pending difference is the server's (a referee's line pending, the character's own
 * player's not): the client sends no flag, pinned.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
    AMOUNT_WORDS, isTransfer, movedWords, NO_REGISTER, NOT_MOVED, REGISTER_MEMO_MAX, reversingLine, TRANSFER_KEPT, transferAmount, transferLines, transferMemos,
} from '../../apps/web/src/workspace/transfer.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const webRoot = path.join(root, 'apps', 'web');
const read = (rel) => fs.readFileSync(path.join(webRoot, 'src', rel), 'utf8');

const when = { year: 1105, day: 14 };
const draft = (over = {}) => ({ direction: 'to', amount: 1200, memo: 'Shore leave', person: { id: 'cr_tam', name: 'Tam Oduya' }, ship: 'Kestrel Dawn', when, whenDay: 403339, linkId: 'cl_one', ...over });

test('the two lines mirror: To the ship and From the ship', () => {
    const to = transferLines(draft());
    assert.deepEqual(to.ship, { when, amount: 1200, memo: 'Tam Oduya to the ship: Shore leave', kind: 'income', linkId: 'cl_one' });
    assert.deepEqual(to.register, { kind: 'transfer', amount: -1200, memo: 'To Kestrel Dawn: Shore leave', whenDay: 403339, linkId: 'cl_one' });
    const from = transferLines(draft({ direction: 'from', memo: '' }));
    assert.deepEqual(from.ship, { when, amount: -1200, memo: 'The ship to Tam Oduya', kind: 'expense', linkId: 'cl_one' });
    assert.deepEqual(from.register, { kind: 'transfer', amount: 1200, memo: 'From Kestrel Dawn', whenDay: 403339, linkId: 'cl_one' });
    assert.equal(to.ship.amount + to.register.amount, 0);
    assert.equal(from.ship.amount + from.register.amount, 0);
    assert.equal('whenDay' in transferLines(draft({ whenDay: null })).register, false, 'no clock, no day on the register');
});

test('the memos fit the register; the reversing line turns the sign under the same link', () => {
    const long = transferMemos('to', 'Tam', 'A ship with a very long name indeed, longer than most', 'and a memo that runs on and on past the bound');
    assert.ok(long.register.length <= REGISTER_MEMO_MAX);
    assert.match(long.register, /…$/);
    const back = reversingLine(transferLines(draft()).register);
    assert.deepEqual(back, { kind: 'transfer', amount: 1200, memo: 'Not moved: To Kestrel Dawn: Shore leave', whenDay: 403339, linkId: 'cl_one' });
});

test('the amount, the words, and which lines are transfers', () => {
    assert.equal(transferAmount('1,200'), 1200);
    assert.equal(transferAmount('Cr1200'), 1200);
    for (const bad of ['', '0', '-5', '12.5', 'ten']) assert.equal(transferAmount(bad), null, bad);
    assert.equal(movedWords('to', 'Cr1,200', 'Tam Oduya'), 'Moved Cr1,200 from Tam Oduya to the ship.');
    assert.equal(movedWords('from', 'Cr1,200', 'Tam Oduya'), 'Moved Cr1,200 from the ship to Tam Oduya.');
    assert.equal(isTransfer({ linkId: 'cl_one' }), true);
    assert.equal(isTransfer({}), false);
    assert.equal(isTransfer({ linkId: null }), false);
    assert.equal(NOT_MOVED, 'The credits were not moved. Try again.');
    assert.equal(TRANSFER_KEPT, 'A transfer is not removed; move the credits back.');
    assert.equal(AMOUNT_WORDS, 'Give the amount in whole credits, above 0.');
    assert.match(NO_REGISTER, /no credit register/);
});

test('pins: no Remove on a transfer; the register first, the reverse on failure; the server decides pending', () => {
    const page = read('workspace/VesselTrade.vue');
    assert.match(page, /<span v-if="!player && isTransfer\(item\)" class="vt-fine vt-kept" data-transfer-kept>\{\{ TRANSFER_KEPT \}\}<\/span>\n\s+<button v-else-if="!player" type="button" class="ui-btn vt-drop"/);
    assert.match(page, /<button v-if="!moveOpen && canMove" type="button" class="ui-btn" :disabled="readOnly" data-move-credits/);
    assert.match(page, /const canMove = computed\(\(\) => can\('ledger'\) && movers\.value\.length > 0\);/, 'a player moves with the Ledger switch');
    const send = read('workspace/transfer_send.ts');
    assert.match(send, /if \(!\(await postRegister\(characterId, lines\.register\)\)\) return NOT_MOVED;\n\s+const said = await sendTrade\(who, record,/);
    assert.match(send, /if \(said\) \{\n\s+await postRegister\(characterId, reversingLine\(lines\.register\)\);/);
    assert.doesNotMatch(send, /pending:/, 'the client never sends pending');
    const service = fs.readFileSync(path.join(root, 'apps/api/src/character/service.ts'), 'utf8');
    assert.match(service, /if \(access\) return fromRoom\(await rooms\.ledgerPost\(id, body, actor\.id, 0\)\);/, 'the character\'s own player: not pending');
    assert.match(service, /return fromRoom\(await rooms\.ledgerPost\(id, body, actor\.id, 1\)\);/, 'the referee: pending');
});

describe('the press, both books', { concurrency: 1 }, () => {
    let server = null;
    let cacheDir = '';
    let store = null;
    let me = null;
    let trade = null;
    let send = null;
    let sent = [];
    let refuse = { register: false, door: false };

    const rid = (n) => 'cr_00000000-0000-4000-8000-' + String(n).padStart(12, '0');
    const stamp = '2026-11-07T00:00:00.000Z';
    const record = (n, type, name, over = {}) => ({
        id: rid(n), type, kind: '', name, summary: '', details: '', tags: [], anchor: null, when: null, visibility: 'players',
        playerNotes: null, sheet: null, status: null, images: null, provenance: null, rev: 3, createdAt: stamp, updatedAt: stamp, deleted: false, ...over,
    });
    const ship = (status) => record(1, 'vessel', 'Kestrel Dawn', { status });
    const tam = () => record(2, 'person', 'Tam Oduya', { sheet: { schema: 'mgt2e_character@1', characterId: 'ch_tam' } });
    const ree = () => record(3, 'person', 'Ree Chandra');

    test.before(async () => {
        cacheDir = fs.mkdtempSync(path.join(tmpdir(), 'd-transfer-'));
        const { createServer } = await import('vite');
        server = await createServer({ root: webRoot, cacheDir, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'silent' });
        store = await server.ssrLoadModule('/src/campaign/store.ts');
        me = await server.ssrLoadModule('/src/workspace/players/me.ts');
        trade = await server.ssrLoadModule('/src/workspace/vessel_trade.ts');
        send = await server.ssrLoadModule('/src/workspace/transfer_send.ts');
        // The record save would schedule its send and retries: no timers here, the test reads the store.
        store.transport.schedule = () => () => {};
        store.transport.fetch = async (url, init = {}) => {
            const method = init.method ?? 'GET';
            sent.push({ url: String(url), method, body: init.body ? JSON.parse(init.body) : null });
            const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
            if (String(url).includes('/api/characters/') && method === 'POST') return refuse.register ? json({ error: { message: 'No.' } }, 500) : json({ data: { id: 'l1' } });
            if (String(url).endsWith('/campaign/changes') && method === 'PATCH') return refuse.door ? json({ error: { message: 'You cannot change that.' } }, 403) : json({ data: { applied: [] } });
            return json({ error: { code: 'unavailable', message: 'Not served in this test.' } }, 503);
        };
    });

    test.after(async () => {
        if (server) await server.close();
        if (cacheDir) fs.rmSync(cacheDir, { recursive: true, force: true, maxRetries: 5 });
    });

    function hold(records, role) {
        const { campaign } = store;
        for (const key of Object.keys(campaign.records)) delete campaign.records[key];
        for (const row of records) campaign.records[row.id] = row;
        campaign.settings = { party: { vesselIds: [rid(1)], aboard: {}, memberIds: [rid(2), rid(3)], anchor: null }, kinds: {}, calendar: { dateFormat: 'imperial' }, rev: 2 };
        campaign.clock = { days: 1105 * 365 + 13, rev: 1 };
        campaign.status = 'ready';
        campaign.role = role;
        campaign.universeId = 'u_test';
    }

    const posts = () => sent.filter((one) => one.method !== 'GET');

    test('a player: the register line, then the ship line through the door, one link', async () => {
        hold([ship({ crew: [{ personId: rid(2), role: 'Captain' }], ledger: [] }), tam(), ree()], 'player');
        me.setMyPersonIds([rid(2)]);
        refuse = { register: false, door: false };
        sent = [];
        const said = await send.moveCredits('player', store.campaign.records[rid(1)], 'ch_tam', draft({ person: { id: rid(2), name: 'Tam Oduya' } }));
        assert.equal(said, '');
        const [register, door] = posts();
        assert.equal(register.url, '/api/characters/ch_tam/ledger');
        assert.deepEqual(register.body, { kind: 'transfer', amount: -1200, memo: 'To Kestrel Dawn: Shore leave', linkId: 'cl_one', whenDay: 403339 });
        assert.equal(door.method, 'PATCH');
        assert.deepEqual(door.body.appends[0].append.ledger, [{ when, amount: 1200, memo: 'Tam Oduya to the ship: Shore leave', kind: 'income', linkId: 'cl_one' }]);
        assert.equal(posts().length, 2);
    });

    test('the ship\'s half refused: the register\'s half turned back, the one sentence', async () => {
        hold([ship({ crew: [{ personId: rid(2), role: 'Captain' }], ledger: [] }), tam(), ree()], 'player');
        me.setMyPersonIds([rid(2)]);
        refuse = { register: false, door: true };
        sent = [];
        assert.equal(await send.moveCredits('player', store.campaign.records[rid(1)], 'ch_tam', draft()), NOT_MOVED);
        const [first, door, back] = posts();
        assert.equal(first.body.amount, -1200);
        assert.equal(door.method, 'PATCH');
        assert.deepEqual(back.body, { kind: 'transfer', amount: 1200, memo: 'Not moved: To Kestrel Dawn: Shore leave', whenDay: 403339, linkId: 'cl_one' });
    });

    test('the register\'s half refused: nothing else is written', async () => {
        hold([ship({ ledger: [] }), tam(), ree()], 'owner');
        refuse = { register: true, door: false };
        sent = [];
        assert.equal(await send.moveCredits('referee', store.campaign.records[rid(1)], 'ch_tam', draft()), NOT_MOVED);
        assert.equal(posts().length, 1);
        assert.deepEqual(trade.ledgerOf(store.campaign.records[rid(1)]), [], 'the ship\'s Ledger untouched');
    });

    test('the referee: the register line, then the ship line in the record save', async () => {
        hold([ship({ ledger: [] }), tam(), ree()], 'owner');
        refuse = { register: false, door: false };
        sent = [];
        assert.equal(await send.moveCredits('referee', store.campaign.records[rid(1)], 'ch_tam', draft({ direction: 'from' })), '');
        assert.equal(posts()[0].body.amount, 1200);
        const lines = trade.ledgerOf(store.campaign.records[rid(1)]);
        assert.deepEqual(lines, [{ when, amount: -1200, memo: 'The ship to Tam Oduya: Shore leave', kind: 'expense', linkId: 'cl_one' }]);
    });

    test('Remove is refused on a transfer\'s line, kept for any other', () => {
        const plain = { when, amount: -5, memo: 'x', kind: 'expense' };
        const linked = { when, amount: 5, memo: 'y', kind: 'income', linkId: 'cl_one' };
        assert.equal(trade.removeLedgerLine([plain, linked], linked), null);
        assert.deepEqual(trade.removeLedgerLine([plain, linked], plain), [linked]);
    });

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

    test('the page: Move credits for the referee and for a player with the Ledger switch; a transfer\'s row says how it is taken back', async () => {
        const linked = { when, amount: 1200, memo: 'Tam Oduya to the ship', kind: 'income', linkId: 'cl_one', by: rid(2) };
        const plain = { when, amount: -100, memo: 'Berthing', kind: 'expense' };
        hold([ship({ crew: [{ personId: rid(2), role: 'Captain' }], ledger: [plain, linked] }), tam(), ree()], 'owner');
        const referee = await render('/src/workspace/VesselTrade.vue', { id: rid(1), readOnly: false });
        assert.match(referee, /data-move-credits>Move credits<\/button>/);
        assert.match(referee, /data-transfer-kept>A transfer is not removed; move the credits back\.<\/span>/);
        assert.equal((referee.match(/data-drop-line/g) || []).length, 1, 'Remove on the plain line only');
        hold([ship({ crew: [{ personId: rid(2), role: 'Captain' }], ledger: [plain, linked] }), tam(), ree()], 'player');
        me.setMyPersonIds([rid(2)]);
        const player = await render('/src/workspace/VesselTrade.vue', { id: rid(1), readOnly: false, who: 'player' });
        assert.match(player, /data-move-credits>Move credits<\/button>/);
        assert.doesNotMatch(player, /data-transfer-kept|data-drop-line/);
        hold([ship({ crew: [{ personId: rid(2), role: 'Captain' }], roles: [{ name: 'Captain', ledger: false, trade: true, locker: true }], ledger: [] }), tam(), ree()], 'player');
        assert.doesNotMatch(await render('/src/workspace/VesselTrade.vue', { id: rid(1), readOnly: false, who: 'player' }), /data-move-credits/, 'no Ledger switch, no Move credits');
        me.setMyPersonIds([]);
    });
});
