/**
 * Owners, a typed payment, and upkeep (Epic T, step T1c). Pure.
 * Shares, the payment, and each cost box are numbers the referee typed.
 * No rule computes a payment, a maintenance figure, or what a share is worth.
 */
import type { LedgerLine, OwnerShare, ShipPayment } from '@voyage/shared';
import type { SheetValues } from '../workspace/sheet_fields.ts';
import { splitDays, totalDays } from '../orbit/clock.ts';

export type CalendarDay = { year: number; day: number };

/** The five recurring boxes T1c sums as upkeep, in the PDF's own spelling. */
export const UPKEEP_FIELDS = [
    'Mortgage Cost',
    'Maintenance Cost',
    'Life Support Cost',
    'Salary Cost',
    'Running Cost',
] as const;

const MORTGAGE_COST = 'Mortgage Cost';

function sheetNumber(values: SheetValues | null | undefined, name: string): number | null {
    if (!values) return null;
    const value = values[name];
    const raw = typeof value === 'string' ? value.trim() : '';
    if (!raw) return null;
    const match = raw.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
    if (!match) return null;
    const n = Number(match[0]);
    return Number.isFinite(n) ? n : null;
}

/** The share count across holders. A non-number is skipped. */
export function sharesTotal(owners: readonly OwnerShare[]): number {
    let total = 0;
    for (const row of owners) {
        if (Number.isFinite(row.shares)) total += row.shares;
    }
    return total;
}

export type HolderPart = {
    holder: OwnerShare['holder'];
    shares: number;
    /** This holder's count divided by the total. Zero when the total is zero. Not a price. */
    part: number;
};

/** The total, and each holder's part of that total. */
export function shareParts(owners: readonly OwnerShare[]): { total: number; holders: HolderPart[] } {
    const total = sharesTotal(owners);
    return {
        total,
        holders: owners.map((row) => ({
            holder: row.holder,
            shares: row.shares,
            part: total !== 0 && Number.isFinite(row.shares) ? row.shares / total : 0,
        })),
    };
}

export type PaymentWhen =
    | { state: 'due'; days: number }
    | { state: 'overdue'; days: number }
    | { state: 'today' };

function daySerial(day: CalendarDay): number {
    return totalDays(day.year, day.day);
}

/** Due, overdue, or today, measured in campaign days from `today`. */
export function paymentWhen(payment: ShipPayment, today: CalendarDay): PaymentWhen {
    const delta = daySerial(payment.nextDueDay) - daySerial(today);
    if (delta > 0) return { state: 'due', days: delta };
    if (delta < 0) return { state: 'overdue', days: -delta };
    return { state: 'today' };
}

/**
 * The same reading from the campaign clock. A fraction is the time of day and
 * stays on that calendar day. The clock counts days the way the orbit clock does.
 */
export function paymentWhenFromClock(payment: ShipPayment, clockDays: number): PaymentWhen {
    const split = splitDays(Math.floor(clockDays));
    return paymentWhen(payment, { year: split.year, day: Math.floor(split.day) });
}

/**
 * The typed amount, or the Mortgage Cost box when the payment has no amount.
 * No period is assumed. A missing box is null.
 */
export function typedPaymentAmount(
    payment: ShipPayment | null | undefined,
    values: SheetValues | null | undefined,
): number | null {
    if (payment && Number.isFinite(payment.amountCr)) return payment.amountCr;
    return sheetNumber(values, MORTGAGE_COST);
}

/**
 * Posts the payment as an expense and moves the next due day on by everyDays.
 * Null when the amount is not a number or everyDays is not a positive whole number.
 */
export function payNow(
    payment: ShipPayment,
    today: CalendarDay,
): { line: LedgerLine; payment: ShipPayment } | null {
    if (!Number.isFinite(payment.amountCr)) return null;
    if (!Number.isInteger(payment.everyDays) || payment.everyDays <= 0) return null;
    const next = splitDays(daySerial(payment.nextDueDay) + payment.everyDays);
    const day = Math.floor(next.day);
    const line: LedgerLine = {
        when: { year: today.year, day: today.day },
        amount: -payment.amountCr,
        memo: payment.payee ? 'Ship payment to ' + payment.payee : 'Ship payment',
        kind: 'expense',
    };
    return {
        line,
        payment: { ...payment, nextDueDay: { year: next.year, day } },
    };
}

export type UpkeepPart = { name: (typeof UPKEEP_FIELDS)[number]; amount: number };

/** The upkeep sum and each box that holds a positive number. */
export function upkeep(values: SheetValues | null | undefined): { total: number; parts: UpkeepPart[] } {
    const parts: UpkeepPart[] = [];
    if (values) {
        for (const name of UPKEEP_FIELDS) {
            const amount = sheetNumber(values, name);
            if (amount == null || amount <= 0) continue;
            parts.push({ name, amount });
        }
    }
    const total = parts.reduce((sum, part) => sum + part.amount, 0);
    return { total, parts };
}
