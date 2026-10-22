import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    acceptCredit,
    cashAdjustment,
    creditBalance,
    creditMode,
    postCredit,
    runningCredits,
    voidCredit,
} from '../../apps/web/src/characters/ledger.ts';

const stamp = (id, byUser = 'player') => ({ id, byUser, whenReal: '2026-10-18T21:00:00Z' });

function posted(lines, draft, id, byUser) {
    const result = postCredit(lines, draft, stamp(id, byUser));
    assert.equal(result.ok, true);
    return result;
}

test('the balance skips a pending line, and the running balance stays put on it', () => {
    const pay = posted([], { kind: 'pay', amount: 5000, memo: 'Salary', poster: 'editor' }, 'ln_pay');
    const held = posted(pay.lines, {
        kind: 'pay', amount: 2000, memo: 'From the referee', poster: 'referee',
    }, 'ln_held', 'referee');
    const fare = posted(held.lines, { kind: 'fare', amount: -800, memo: 'High passage', whenDay: 120, poster: 'editor' }, 'ln_fare');
    assert.equal(held.line.pending, 1);
    assert.equal(pay.line.pending, 0);
    assert.equal(creditBalance(fare.lines), 4200);
    assert.deepEqual(runningCredits(fare.lines).map((row) => [row.line.id, row.balance]), [
        ['ln_pay', 5000],
        ['ln_held', 5000],
        ['ln_fare', 4200],
    ]);
    assert.equal(fare.line.seq, 3);
    assert.equal(fare.line.whenDay, 120);
});

test('a bad kind, a blank memo, or an amount that is not a non-zero integer is refused', () => {
    const base = { kind: 'purchase', amount: -10, memo: 'Rations', poster: 'editor' };
    for (const draft of [
        { ...base, kind: 'loot' },
        { ...base, memo: '   ' },
        { ...base, memo: 'x'.repeat(81) },
        { ...base, amount: 0 },
        { ...base, amount: 1.5 },
        { ...base, amount: 1_000_000_001 },
        { ...base, amount: -1_000_000_001 },
        { ...base, whenDay: 1.2 },
        { ...base, whenDay: -1 },
        { ...base, whenDay: 400_001 },
    ]) {
        const refused = postCredit([], draft, stamp('ln_bad'));
        assert.equal(refused.ok, false);
        assert.equal(refused.code, 'validation');
        assert.equal(refused.message, 'Invalid request.');
    }
    const edge = posted([], { ...base, memo: 'm'.repeat(80), amount: 1_000_000_000, whenDay: 0 }, 'ln_edge');
    assert.equal(edge.line.memo.length, 80);
    assert.equal(edge.line.amount, 1_000_000_000);
    assert.equal(edge.line.whenDay, 0);
    const lastDay = posted([], { ...base, amount: -1_000_000_000, whenDay: 400_000 }, 'ln_day');
    assert.equal(lastDay.line.whenDay, 400_000);
    const undone = voidCredit(lastDay.lines, 'ln_day', stamp('ln_void'), 400_001);
    assert.equal(undone.ok, false);
    assert.equal(undone.message, 'Invalid request.');
});

test('a transfer keeps its link, and any other kind drops one', () => {
    const move = posted([], {
        kind: 'transfer', amount: -100, memo: 'Chip in', linkId: 'link_1', poster: 'editor',
    }, 'ln_move');
    const buy = posted([], {
        kind: 'purchase', amount: -40, memo: 'Filter', linkId: 'link_1', poster: 'editor',
    }, 'ln_buy');
    assert.equal(move.line.linkId, 'link_1');
    assert.equal(buy.line.linkId, null);
});

test('a void is a reversing line, and a second void or a pending line is refused', () => {
    const pay = posted([], { kind: 'pay', amount: 900, memo: 'Bonus', poster: 'editor' }, 'ln_pay');
    const move = postCredit(pay.lines, {
        kind: 'transfer', amount: -200, memo: 'To the ship', linkId: 'link_9', poster: 'editor',
    }, stamp('ln_move'));
    const undone = voidCredit(move.lines, 'ln_move', stamp('ln_void'), 44);
    assert.equal(undone.ok, true);
    assert.equal(undone.line.amount, 200);
    assert.equal(undone.line.kind, 'transfer');
    assert.equal(undone.line.linkId, 'link_9');
    assert.equal(undone.line.memo, 'To the ship');
    assert.equal(undone.line.voidOf, 'ln_move');
    assert.equal(undone.line.pending, 0);
    assert.equal(undone.line.whenDay, 44);
    assert.equal(creditBalance(undone.lines), 900);
    const again = voidCredit(undone.lines, 'ln_move', stamp('ln_again'));
    assert.deepEqual(again, { ok: false, code: 'validation', message: 'That line is already voided.' });
    assert.deepEqual(voidCredit(undone.lines, 'ln_missing', stamp('ln_miss')), {
        ok: false, code: 'not_found', message: 'No such line.',
    });
    const held = posted([], { kind: 'share', amount: 50, memo: 'Share', poster: 'referee' }, 'ln_held', 'referee');
    assert.deepEqual(voidCredit(held.lines, 'ln_held', stamp('ln_void2')), {
        ok: false, code: 'validation', message: 'That line is still pending.',
    });
});

test('the player accepts a pending line, and the referee who posted it does not', () => {
    const held = posted([], { kind: 'pay', amount: 300, memo: 'Pay the crew', poster: 'referee' }, 'ln_held', 'referee');
    assert.equal(creditBalance(held.lines), 0);
    const self = acceptCredit(held.lines, 'ln_held', 'referee');
    assert.deepEqual(self, { ok: false, code: 'validation', message: 'That line is waiting for the player.' });
    const accepted = acceptCredit(held.lines, 'ln_held', 'player');
    assert.equal(accepted.ok, true);
    assert.equal(accepted.line.pending, 0);
    assert.equal(accepted.line.seq, 1);
    assert.equal(creditBalance(accepted.lines), 300);
    assert.deepEqual(acceptCredit(accepted.lines, 'ln_held', 'player'), {
        ok: false, code: 'validation', message: 'That line is already in the register.',
    });
    assert.deepEqual(acceptCredit(accepted.lines, 'ln_missing', 'player'), {
        ok: false, code: 'not_found', message: 'No such line.',
    });
});

test('Simple mode posts one adjustment for a Cash on Hand edit', () => {
    const first = cashAdjustment([], 12400, stamp('ln_set'), 10);
    assert.equal(first.ok, true);
    assert.equal(first.line.kind, 'adjustment');
    assert.equal(first.line.amount, 12400);
    assert.equal(first.line.memo, 'Set to Cr12,400');
    assert.equal(first.line.pending, 0);
    assert.equal(creditBalance(first.lines), 12400);
    const same = cashAdjustment(first.lines, 12400, stamp('ln_same'));
    assert.deepEqual(same, { ok: true, line: null, lines: first.lines });
    const down = cashAdjustment(first.lines, 10000, stamp('ln_down'));
    assert.equal(down.line.amount, -2400);
    assert.equal(down.line.memo, 'Set to Cr10,000');
    assert.equal(creditBalance(down.lines), 10000);
    assert.equal(cashAdjustment(first.lines, 1.5, stamp('ln_bad')).message, 'Invalid request.');
});

test('a new character is Simple, and a non-adjustment line opens Detailed unless the mode is stored', () => {
    assert.equal(creditMode(undefined, []), 'simple');
    assert.equal(creditMode(null, []), 'simple');
    const set = cashAdjustment([], 40, stamp('ln_set'));
    assert.equal(creditMode(undefined, set.lines), 'simple');
    const fare = posted(set.lines, { kind: 'fare', amount: -5, memo: 'Berth', poster: 'editor' }, 'ln_fare');
    assert.equal(creditMode(undefined, fare.lines), 'detailed');
    assert.equal(creditMode('simple', fare.lines), 'simple');
    assert.equal(creditMode('detailed', []), 'detailed');
});
