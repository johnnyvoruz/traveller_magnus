import assert from 'node:assert/strict';
import { test } from 'node:test';
import { totalDays } from '../../apps/web/src/orbit/clock.ts';
import { fuelTonsOf, tonsToFillFromStatus } from '../../apps/web/src/campaign/refuel.ts';
import {
    payNow,
    paymentWhen,
    paymentWhenFromClock,
    shareParts,
    sharesTotal,
    typedPaymentAmount,
    upkeep,
    UPKEEP_FIELDS,
} from '../../apps/web/src/campaign/ship_finance.ts';

const PERSON = 'cr_11111111-1111-4111-8111-000000000003';

test('shares total and each holder\'s part, with no price', () => {
    const owners = [
        { holder: { kind: 'record', id: PERSON }, shares: 25 },
        { holder: 'party', shares: 50 },
        { holder: { kind: 'record', id: 'cr_11111111-1111-4111-8111-000000000004' }, shares: 25 },
    ];
    assert.equal(sharesTotal(owners), 100);
    const parts = shareParts(owners);
    assert.equal(parts.total, 100);
    assert.deepEqual(parts.holders.map((row) => row.part), [0.25, 0.5, 0.25]);
    assert.equal(shareParts([{ holder: 'party', shares: 0 }]).holders[0].part, 0);
});

test('due and overdue come from the campaign day, and paying posts a line', () => {
    const payment = { amountCr: 4800, everyDays: 30, nextDueDay: { year: 1105, day: 15 }, payee: 'The bank' };
    assert.deepEqual(paymentWhen(payment, { year: 1105, day: 10 }), { state: 'due', days: 5 });
    assert.deepEqual(paymentWhen(payment, { year: 1105, day: 18 }), { state: 'overdue', days: 3 });
    assert.deepEqual(paymentWhen(payment, { year: 1105, day: 15 }), { state: 'today' });
    const clock = totalDays(1105, 10) + 0.5;
    assert.deepEqual(paymentWhenFromClock(payment, clock), { state: 'due', days: 5 });
    const paid = payNow(payment, { year: 1105, day: 15 });
    assert.equal(paid.line.amount, -4800);
    assert.equal(paid.line.kind, 'expense');
    assert.equal(paid.line.memo, 'Ship payment to The bank');
    assert.deepEqual(paid.line.when, { year: 1105, day: 15 });
    assert.deepEqual(paid.payment.nextDueDay, { year: 1105, day: 45 });
    assert.equal(paid.payment.amountCr, 4800);
    const yearEnd = payNow(
        { amountCr: 100, everyDays: 30, nextDueDay: { year: 1105, day: 360 } },
        { year: 1105, day: 360 },
    );
    assert.deepEqual(yearEnd.payment.nextDueDay, { year: 1106, day: 25 });
    assert.equal(yearEnd.line.memo, 'Ship payment');
    assert.equal(payNow({ ...payment, everyDays: 0 }, { year: 1105, day: 15 }), null);
});

test('the mortgage box is the amount only when no payment is typed, and upkeep lists its parts', () => {
    const payment = { amountCr: 4800, everyDays: 30, nextDueDay: { year: 1105, day: 15 } };
    assert.equal(typedPaymentAmount(payment, { 'Mortgage Cost': '1,000' }), 4800);
    assert.equal(typedPaymentAmount(null, { 'Mortgage Cost': '4,800' }), 4800);
    assert.equal(typedPaymentAmount(null, {}), null);
    assert.deepEqual(UPKEEP_FIELDS, [
        'Mortgage Cost',
        'Maintenance Cost',
        'Life Support Cost',
        'Salary Cost',
        'Running Cost',
    ]);
    const values = {
        'Purchase Cost': '999',
        'Mortgage Cost': '100',
        'Maintenance Cost': '50',
        'Fuel Tank Cost': '999',
        'Life Support Cost': '0',
        'Salary Cost': 'none',
        'Running Cost': '25',
    };
    const month = upkeep(values);
    assert.equal(month.total, 175);
    assert.deepEqual(month.parts, [
        { name: 'Mortgage Cost', amount: 100 },
        { name: 'Maintenance Cost', amount: 50 },
        { name: 'Running Cost', amount: 25 },
    ]);
    assert.equal(upkeep(null).total, 0);
});

test('fuel tons aboard are the level when the field is present', () => {
    assert.equal(fuelTonsOf({ fuelTons: 31 }), 31);
    assert.equal(fuelTonsOf({}), null);
    assert.equal(fuelTonsOf(null), null);
    assert.equal(tonsToFillFromStatus(40, { fuelTons: 31 }, 0), 9);
    assert.equal(tonsToFillFromStatus(40, {}, 10), 30);
    assert.equal(tonsToFillFromStatus(40, { fuelTons: 40 }, 0), 0);
});
