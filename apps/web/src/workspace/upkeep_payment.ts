/**
 * Payment is the mortgage, said clearly (Lane D's DU47; Johnny's 128: "it can be payment, just ensure it's called out
 * clearly"). With a Payment set on the ship, Post this month's upkeep leaves the Mortgage Cost line out and says so in
 * the row's place; the Payment says it is the mortgage; with none set, the upkeep posts the mortgage as before and the
 * empty box says where to set it. The upkeep's lines are campaign/refuel.ts's; nothing here reads a rule. Pure.
 */
import type { LedgerLine } from '@voyage/shared';
import { formatCredits } from '../campaign/money.ts';

/** The sheet's box the Payment stands for (ship_finance's first upkeep field). */
export const MORTGAGE_FIELD = 'Mortgage Cost';
export const PAYMENT_IS_MORTGAGE = 'This is the ship\'s mortgage. The month\'s upkeep leaves it out.';
export const SET_MORTGAGE_HERE = 'Set the mortgage here and the upkeep leaves it out.';

/** The month's lines to post: with a Payment set, the Mortgage Cost line is the Payment's and comes out, kept aside to be said. */
export function monthWithPayment(lines: readonly LedgerLine[], hasPayment: boolean): { lines: LedgerLine[]; leftOut: LedgerLine | null } {
    if (!hasPayment) return { lines: [...lines], leftOut: null };
    const leftOut = lines.find((line) => line.memo === MORTGAGE_FIELD) ?? null;
    return { lines: lines.filter((line) => line !== leftOut), leftOut };
}

/** "Mortgage Cost Cr160,000: paid by the Payment, not here." */
export function leftOutWords(line: Pick<LedgerLine, 'memo' | 'amount'>): string {
    return line.memo + ' ' + formatCredits(Math.abs(line.amount)) + ': paid by the Payment, not here.';
}
