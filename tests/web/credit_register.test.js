/**
 * DT1c, the credit register's screen (backlog T1b; contract b_player_credits.md): the rows with their
 * running balance, who may accept or void, what Add a line sends (the day inside the server's bound),
 * the Cash on Hand readout; the store against a fake transport (read, post, void, accept, mode, the
 * Simple adjustment, the room's ledger frame); the live room hands that frame over and never reads
 * it as "gone"; the register under Finances in the sheet, the pane and the person's page.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { attachLive } from '../../apps/web/src/characters/live.ts';
import { noteLedgerFrame, openRegister, parseCreditLine, resetRegisters } from '../../apps/web/src/characters/register.ts';
import { resetTransport, transport } from '../../apps/web/src/characters/transport.ts';
import {
    CASH_FIELD, DAY_MAX, amountTyped, canAccept, canVoid, cashTyped, dateTyped, dayBeyondBound, dayPlaceholder, dayWithin, lineDraft, readoutsFor, registerRows,
} from '../../apps/web/src/workspace/credit_register.ts';
import { totalDays } from '../../apps/web/src/orbit/clock.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const webRoot = path.join(root, 'apps', 'web');
const read = (rel) => fs.readFileSync(path.join(webRoot, 'src', rel), 'utf8');

const DAY = totalDays(1000, 14);

function line(over) {
    return { id: 'l1', seq: 1, whenDay: DAY, whenReal: '2026-10-27T00:00:00Z', memo: 'Mustering-out pay', amount: 12000, kind: 'pay', byUser: 'player', linkId: null, voidOf: null, pending: 0, ...over };
}

const LINES = [
    line(),
    line({ id: 'l2', seq: 2, memo: 'Berthing', amount: -4800, kind: 'purchase', whenDay: DAY + 1 }),
    line({ id: 'l3', seq: 3, memo: 'Crew pay', amount: 2000, kind: 'transfer', byUser: 'ref1', pending: 1, whenDay: null }),
    line({ id: 'l4', seq: 4, memo: 'Berthing', amount: 4800, kind: 'purchase', voidOf: 'l2', whenDay: null }),
];

describe('the rows', () => {
    test('newest first, the running balance, a pending line out of it, the void pair marked', () => {
        const rows = registerRows(LINES);
        assert.deepEqual(rows.map((r) => r.line.id), ['l4', 'l3', 'l2', 'l1']);
        assert.deepEqual(rows.map((r) => r.balance), [12000, 7200, 7200, 12000]);
        assert.equal(rows[3].date, '014-1000');
        assert.equal(rows[3].deposit, 'Cr12,000');
        assert.equal(rows[2].withdrawal, 'Cr4,800');
        assert.equal(rows[2].deposit, '');
        assert.equal(rows[2].voided, true);
        assert.equal(rows[0].reversing, true);
        assert.equal(rows[1].pending, true);
        assert.equal(rows[1].date, '');
        assert.equal(rows[2].kind, 'Purchase');
    });

    test('a pending line is accepted by anyone but its poster; a counted, unreversed line is voided', () => {
        const pending = LINES[2];
        assert.equal(canAccept(pending, 'player'), true);
        assert.equal(canAccept(pending, 'ref1'), false);
        assert.equal(canAccept(pending, null), true);
        assert.equal(canAccept(LINES[0], 'player'), false);
        assert.equal(canVoid(LINES[0], LINES), true);
        assert.equal(canVoid(LINES[1], LINES), false, 'already reversed');
        assert.equal(canVoid(pending, LINES), false, 'pending');
        assert.equal(canVoid(LINES[3], LINES), true, 'a reversal can itself be reversed');
    });
});

describe('what the form sends', () => {
    test('an amount typed, with or without the unit and grouping; never zero, a minus only where signed', () => {
        assert.equal(amountTyped('12,400'), 12400);
        assert.equal(amountTyped('Cr12,400'), 12400);
        assert.equal(amountTyped(' 12 400 '), 12400);
        assert.equal(amountTyped('0'), null);
        assert.equal(amountTyped('-5'), null);
        assert.equal(amountTyped('-5', true), -5);
        assert.equal(amountTyped('−Cr4,800', true), -4800);
        assert.equal(amountTyped('12.5'), null);
        assert.equal(amountTyped('abc'), null);
    });

    test('the day: inside the bound it is sent; the clock past it sends no day; a date typed is parsed', () => {
        assert.equal(dayWithin(DAY + 0.7), DAY);
        assert.equal(dayWithin(null), null);
        assert.equal(dayWithin(403_602), 403_602);
        assert.equal(dayWithin(4_000_000), 4_000_000);
        assert.equal(dayWithin(4_000_001), null);
        assert.equal(dayWithin(DAY_MAX + 1), null);
        assert.equal(dayBeyondBound(403_602), false);
        assert.equal(dayBeyondBound(4_000_001), true);
        assert.equal(dayBeyondBound(totalDays(1105, 1)), false);
        assert.equal(dayBeyondBound(DAY), false);
        assert.equal(dateTyped('014-1000', 1105), DAY);
        assert.equal(dateTyped('14', 1000), DAY);
        assert.equal(dateTyped('tomorrow', 1000), null);
        assert.equal(dayPlaceholder(null), 'DDD-YYYY');
        assert.equal(dayPlaceholder(DAY), '014-1000');
    });

    test('the draft: a withdrawal is negative, the memo trimmed, the campaign day by default', () => {
        const made = lineDraft({ direction: 'withdrawal', amount: '4,800', kind: 'purchase', memo: ' Berthing ', date: '', campaignDay: DAY + 0.3 });
        assert.equal(made.ok, true);
        assert.deepEqual(made.draft, { kind: 'purchase', amount: -4800, memo: 'Berthing', whenDay: DAY });
        const deposit = lineDraft({ direction: 'deposit', amount: '12000', kind: 'pay', memo: 'Pay', date: '015-1000', campaignDay: null });
        assert.equal(deposit.ok && deposit.draft.amount, 12000);
        assert.equal(deposit.ok && deposit.draft.whenDay, DAY + 1);
        const milieu = lineDraft({ direction: 'deposit', amount: '1', kind: 'pay', memo: 'Pay', date: '', campaignDay: totalDays(1105, 1) });
        assert.equal(milieu.ok && milieu.draft.whenDay, totalDays(1105, 1));
        const past = lineDraft({ direction: 'deposit', amount: '1', kind: 'pay', memo: 'Pay', date: '', campaignDay: 4_000_001 });
        assert.equal(past.ok && past.draft.whenDay, null);
    });

    test('the draft refused: the amount, the kind, the memo, its length, the date', () => {
        const base = { direction: 'deposit', amount: '100', kind: 'pay', memo: 'Pay', date: '', campaignDay: null };
        assert.equal(lineDraft({ ...base, amount: '' }).message, 'Type an amount in whole credits.');
        assert.equal(lineDraft({ ...base, kind: 'tip' }).message, 'Choose a kind.');
        assert.equal(lineDraft({ ...base, memo: '  ' }).message, 'Type what the line is for.');
        assert.equal(lineDraft({ ...base, memo: 'x'.repeat(81) }).message, 'Keep it to 80 characters.');
        assert.equal(lineDraft({ ...base, date: 'soon' }).message, 'Type the date as DDD-YYYY, such as 014-1105.');
        const kept = lineDraft({ ...base, date: '001-1105' });
        assert.equal(kept.ok, true);
        assert.equal(kept.ok && kept.draft.whenDay, 403_325);
    });

    test('the Cash on Hand readout: the balance once read, locked in Detailed; nothing before', () => {
        assert.deepEqual(readoutsFor(null), {});
        assert.deepEqual(readoutsFor({ status: 'loading', balance: 5, credits: 'simple' }), {});
        assert.deepEqual(readoutsFor({ status: 'ready', balance: 12000, credits: 'simple' }), { [CASH_FIELD]: { value: 'Cr12,000', locked: false } });
        assert.deepEqual(readoutsFor({ status: 'ready', balance: -200, credits: 'detailed' }), { [CASH_FIELD]: { value: '−Cr200', locked: true } });
    });

    test('typing Cash on Hand posts through the register only in Simple, and only that box', () => {
        const calls = [];
        const reg = (credits, status = 'ready') => ({ status, credits, async setCash(text, day) { calls.push([text, day]); return true; } });
        assert.equal(cashTyped(reg('simple'), CASH_FIELD, '12,400', DAY), true);
        assert.deepEqual(calls, [['12,400', DAY]]);
        assert.equal(cashTyped(reg('detailed'), CASH_FIELD, '1', DAY), false);
        assert.equal(cashTyped(reg('simple', 'unavailable'), CASH_FIELD, '1', DAY), false);
        assert.equal(cashTyped(reg('simple'), 'Debt', '1', DAY), false);
        assert.equal(cashTyped(null, CASH_FIELD, '1', DAY), false);
        assert.equal(calls.length, 1);
    });
});

/** A fake server: each call answers from the queue, or by route. */
function fakeFetch(answer) {
    const calls = [];
    transport.fetch = async (url, init) => {
        const method = (init && init.method) || 'GET';
        const body = init && init.body ? JSON.parse(init.body) : null;
        calls.push({ url: String(url), method, body });
        const out = answer({ url: String(url), method, body });
        return new Response(JSON.stringify(out.body), { status: out.status, headers: { 'content-type': 'application/json' } });
    };
    return calls;
}

const ok = (data, status = 200) => ({ status, body: { ok: true, data } });
const refused = (code, message, status = 400) => ({ status, body: { ok: false, error: { code, message } } });

describe('the store', () => {
    test.afterEach(() => {
        resetRegisters();
        resetTransport();
    });

    test('a row as the server sends it, and not otherwise', () => {
        assert.deepEqual(parseCreditLine(line()), line());
        assert.equal(parseCreditLine(line({ kind: 'tip' })), null);
        assert.equal(parseCreditLine({ ...line(), id: '' }), null);
        assert.equal(parseCreditLine(line({ pending: true })).pending, 1);
        assert.equal(parseCreditLine(line({ whenDay: undefined })).whenDay, null);
    });

    test('read: the lines, the balance and the mode; 503 is not available; 404 is not this account\'s', async () => {
        fakeFetch(() => ok({ lines: [LINES[1], LINES[0]], balance: 7200, credits: 'detailed' }));
        const reg = openRegister('ch_1');
        assert.equal(reg.status, 'loading');
        await new Promise((r) => setTimeout(r, 0));
        assert.equal(reg.status, 'ready');
        assert.deepEqual(reg.lines.map((l) => l.seq), [1, 2]);
        assert.equal(reg.balance, 7200);
        assert.equal(reg.credits, 'detailed');
        assert.equal(openRegister('ch_1'), reg, 'one handle per character');

        fakeFetch(() => refused('ledger_unavailable', 'The credit register is not available yet.', 503));
        const off = openRegister('ch_2');
        await new Promise((r) => setTimeout(r, 0));
        assert.equal(off.status, 'unavailable');

        fakeFetch(() => refused('not_found', 'No such character.', 404));
        const no = openRegister('ch_3');
        await new Promise((r) => setTimeout(r, 0));
        assert.equal(no.status, 'denied');
    });

    test('post merges the stored line and keeps seq order; a refusal is the notice', async () => {
        const calls = fakeFetch(({ method }) => (method === 'GET'
            ? ok({ lines: [LINES[0]], balance: 12000, credits: 'simple' })
            : ok(line({ id: 'l9', seq: 2, amount: -4800, kind: 'purchase', memo: 'Berthing' }), 201)));
        const reg = openRegister('ch_1');
        await new Promise((r) => setTimeout(r, 0));
        const posted = await reg.post({ kind: 'purchase', amount: -4800, memo: 'Berthing', whenDay: DAY });
        assert.equal(posted.id, 'l9');
        assert.deepEqual(calls[1].body, { kind: 'purchase', amount: -4800, memo: 'Berthing', whenDay: DAY });
        assert.equal(reg.balance, 7200);
        assert.equal(reg.lines.length, 2);

        fakeFetch(() => refused('validation', 'Invalid request.'));
        assert.equal(await reg.post({ kind: 'purchase', amount: 0, memo: 'x', whenDay: null }), null);
        assert.equal(reg.notice, 'Invalid request.');
        assert.equal(reg.lines.length, 2);

        const noDay = fakeFetch(() => ok(line({ id: 'l10', seq: 3 }), 201));
        await reg.post({ kind: 'pay', amount: 1, memo: 'x', whenDay: null });
        assert.equal('whenDay' in noDay[0].body, false, 'no day is no field');
    });

    test('void appends the reversal; accept replaces the line; the mode is stored', async () => {
        fakeFetch(({ url, method }) => {
            if (method === 'GET') return ok({ lines: LINES.slice(0, 3), balance: 7200, credits: 'detailed' });
            if (url.endsWith('/l1/void')) return ok(line({ id: 'l5', seq: 4, amount: -12000, voidOf: 'l1' }), 201);
            if (url.endsWith('/l3/accept')) return ok(line({ id: 'l3', seq: 3, amount: 2000, kind: 'transfer', byUser: 'ref1', pending: 0 }));
            if (url.endsWith('/mode')) return ok({ credits: 'simple' });
            return refused('not_found', 'No such line.', 404);
        });
        const reg = openRegister('ch_1');
        await new Promise((r) => setTimeout(r, 0));
        assert.equal(await reg.voidLine('l1'), true);
        assert.equal(reg.lines.length, 4);
        assert.equal(reg.balance, -4800);
        assert.equal(await reg.acceptLine('l3'), true);
        assert.equal(reg.lines.length, 4, 'accept changes the row, it adds none');
        assert.equal(reg.lines.find((l) => l.id === 'l3').pending, 0);
        assert.equal(reg.balance, -2800);
        assert.equal(await reg.voidLine('nope'), false);
        assert.equal(reg.notice, 'No such line.');
        assert.equal(await reg.setMode('simple'), true);
        assert.equal(reg.credits, 'simple');
    });

    test('Simple: Cash on Hand typed posts one adjustment to that balance, "Set to Cr12,400"; the same balance posts nothing', async () => {
        const calls = fakeFetch(({ method, body }) => (method === 'GET'
            ? ok({ lines: [LINES[0]], balance: 12000, credits: 'simple' })
            : ok(line({ id: 'l6', seq: 2, amount: body.amount, kind: 'adjustment', memo: body.memo }), 201)));
        const reg = openRegister('ch_1');
        await new Promise((r) => setTimeout(r, 0));
        assert.equal(await reg.setCash('Cr12,400', totalDays(1105, 2)), true);
        assert.deepEqual(calls[1].body, { kind: 'adjustment', amount: 400, memo: 'Set to Cr12,400', whenDay: totalDays(1105, 2) });
        assert.equal(reg.balance, 12400);
        assert.equal(await reg.setCash('12,400', null), true);
        assert.equal(calls.length, 2, 'nothing sent for the same balance');
        assert.equal(await reg.setCash('lots', null), false);
    });

    test('the room\'s ledger frame lands in a read register with the server\'s balance; an unread one reads itself', async () => {
        const calls = fakeFetch(() => ok({ lines: [LINES[0]], balance: 12000, credits: 'detailed' }));
        const reg = openRegister('ch_1');
        await new Promise((r) => setTimeout(r, 0));
        noteLedgerFrame('ch_1', { t: 'ledger', line: line({ id: 'l7', seq: 2, amount: -100 }), balance: 11900 });
        assert.equal(reg.lines.length, 2);
        assert.equal(reg.balance, 11900);
        noteLedgerFrame('ch_1', { t: 'ledger', line: line({ id: 'l7', seq: 2, amount: -100, pending: 0 }), balance: 11900 });
        assert.equal(reg.lines.length, 2, 'the same id is one row');
        noteLedgerFrame('ch_1', { t: 'set', field: 'Name', value: 'x' });
        assert.equal(reg.lines.length, 2);
        noteLedgerFrame('ch_9', { t: 'ledger', line: line(), balance: 1 });
        await new Promise((r) => setTimeout(r, 0));
        assert.equal(calls.filter((c) => c.url.includes('ch_9')).length, 1, 'an unread register reads itself');
    });
});

describe('the live room', () => {
    test.afterEach(() => resetTransport());

    test('a ledger frame is handed over and never read as gone', async () => {
        fakeFetch(() => ok({}));
        let handlers = null;
        transport.openSocket = (url, given) => {
            handlers = given;
            return { send() {}, close() {} };
        };
        transport.schedule = () => () => {};
        const state = { id: 'ch_1', character: null, role: 'owner', ownerName: '', fields: {}, who: [], you: null, status: 'connecting', notice: '' };
        const frames = [];
        const live = attachLive(state, () => {}, (frame) => frames.push(frame));
        live.start();
        await new Promise((r) => setTimeout(r, 0));
        assert.ok(handlers, 'a socket was opened');
        handlers.onMessage(JSON.stringify({ t: 'ledger', line: line(), balance: 12000 }));
        assert.equal(frames.length, 1);
        assert.equal(frames[0].balance, 12000);
        assert.notEqual(state.status, 'gone');
        live.stop();
    });
});

describe('the register on screen', { concurrency: 1 }, () => {
    let server = null;
    let cacheDir = '';

    test.before(async () => {
        cacheDir = fs.mkdtempSync(path.join(tmpdir(), 'd-creg-'));
        const { createServer } = await import('vite');
        server = await createServer({ root: webRoot, cacheDir, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'silent' });
    });

    test.after(async () => {
        if (server) await server.close();
        if (cacheDir) fs.rmSync(cacheDir, { recursive: true, force: true, maxRetries: 5 });
    });

    function fakeRegister(over) {
        return {
            id: 'ch_1', status: 'ready', lines: LINES, balance: 7200, credits: 'detailed', notice: '', busy: false,
            async load() {}, async post() { return null; }, async voidLine() { return true; }, async acceptLine() { return true; }, async setMode() { return true; }, async setCash() { return true; },
            ...over,
        };
    }

    async function render(props) {
        const view = (await server.ssrLoadModule('/src/workspace/CreditRegister.vue')).default;
        const { createSSRApp, h } = await import('vue');
        const { renderToString } = await import('vue/server-renderer');
        return renderToString(createSSRApp({ render: () => h(view, props) }));
    }

    test('Detailed: the balance readout, the rows newest first, Pending in its place, the voided line struck, Accept for the player, Void on a counted line', async () => {
        const html = await render({ register: fakeRegister(), you: 'player', access: true, canPost: true, day: DAY });
        assert.match(html, /data-credit-balance[^>]*>[\s\S]*?Cr7,200/);
        assert.match(html, /data-credit-mode/);
        assert.match(html, /aria-pressed="true"[^>]*>Detailed/);
        const ids = [...html.matchAll(/data-credit-line="(l\d)"/g)].map((m) => m[1]);
        assert.deepEqual(ids, ['l4', 'l3', 'l2', 'l1']);
        assert.match(html, /is-pending[\s\S]*?Crew pay[\s\S]*?Pending/);
        assert.match(html, /is-voided[\s\S]*?Berthing/);
        assert.match(html, /014-1000/);
        assert.equal((html.match(/data-credit-accept/g) || []).length, 1, 'one pending line to accept');
        assert.ok((html.match(/data-credit-void/g) || []).length >= 1);
        assert.match(html, /data-credit-add/);
    });

    test('the one who posted the pending line sees no Accept; without canPost no buttons at all', async () => {
        const poster = await render({ register: fakeRegister(), you: 'ref1', access: true, canPost: true, day: DAY });
        assert.doesNotMatch(poster, /data-credit-accept/);
        const reader = await render({ register: fakeRegister(), you: 'player', access: true, canPost: false, day: DAY });
        assert.doesNotMatch(reader, /data-credit-accept|data-credit-void|data-credit-add/);
    });

    test('Simple: the switch and its sentence, no register', async () => {
        const html = await render({ register: fakeRegister({ credits: 'simple' }), you: 'player', access: true, canPost: true, day: DAY });
        assert.match(html, /aria-pressed="true"[^>]*>Simple/);
        assert.match(html, /Type Cash on Hand\. Each change is kept as a line\./);
        assert.doesNotMatch(html, /data-credit-lines|data-credit-balance/);
    });

    test('not available, not read yet, or not this account\'s: nothing on the sheet', async () => {
        for (const status of ['unavailable', 'loading', 'idle', 'denied']) {
            const html = await render({ register: fakeRegister({ status }), you: 'player', access: true, canPost: true, day: DAY });
            assert.doesNotMatch(html, /data-credit-register/, status);
        }
    });

    test('the referee who cannot see the register: the note and Add a line, nothing else', async () => {
        const html = await render({ register: fakeRegister({ status: 'denied', lines: [] }), you: null, access: false, canPost: true, day: DAY });
        assert.match(html, /You can&#39;t see this character&#39;s register\. A line you add waits for the player to accept it\./);
        assert.match(html, /data-credit-add/);
        assert.doesNotMatch(html, /data-credit-lines|data-credit-mode/);
    });
});

describe('where it sits', () => {
    test('the sheet shows a readout in a box and offers a place under Finances; the pane and the person page fill it', () => {
        const sheet = read('workspace/CharacterSheet.vue');
        assert.match(sheet, /readouts\?: Readonly<Record<string, \{ value: string; locked: boolean \}>>/);
        assert.match(sheet, /:value="shown\(cell\.field\)"/);
        assert.match(sheet, /:disabled="!editable \|\| locked\(cell\.field\)"/);
        assert.match(sheet, /<slot v-if="section\.name === 'Finances'" name="finances" \/>/);
        for (const file of ['characters/screens/CharactersPanel.vue', 'workspace/PersonSheet.vue']) {
            const text = read(file);
            assert.match(text, /<template #finances>/, file);
            assert.match(text, /<CreditRegister/, file);
            assert.match(text, /:readouts="readouts"/, file);
            assert.match(text, /cashTyped\(register\.value, name, value, campaignDay\.value\)/, file);
        }
        assert.match(read('workspace/PersonSheet.vue'), /handle\.status === 'gone' && !readOnly"/, 'the referee without access posts from the person page');
        assert.match(read('workspace/character_wiring.ts'), /register: \(id\) => openRegister\(id\)/);
        assert.match(read('characters/live.ts'), /\.t === 'ledger'\) \{\s*onLedger\(body\);\s*return;/);
    });

    test('no browser global outside platform; the words are the contract\'s', () => {
        for (const file of ['workspace/credit_register.ts', 'characters/register.ts', 'workspace/CreditRegister.vue']) {
            const text = read(file);
            assert.doesNotMatch(text, /\bwindow\.|\bdocument\./, file);
        }
        assert.match(read('characters/register.ts'), /'\/api\/characters\/' \+ encodeURIComponent\(id\) \+ '\/ledger'/);
        assert.match(read('characters/register.ts'), /'\/mode'/);
    });
});
