/**
 * A vessel ledger (Epic T, decision 3). Pure.
 * `amount` is the credit change as stored: the kind does not flip its sign.
 * The party's cash and a character's Cash on Hand are not this ledger.
 */
import type { LedgerLine } from '@voyage/shared';

export function postLedger(lines: readonly LedgerLine[], line: LedgerLine): LedgerLine[] {
    return lines.concat(line);
}

export function ledgerBalance(lines: readonly LedgerLine[]): number {
    return lines.reduce((sum, line) => sum + line.amount, 0);
}

export type LedgerPeriod = {
    year: number;
    day: number;
    lines: LedgerLine[];
    balance: number;
};

/** Lines gathered by the campaign day they are dated, in the order those days appear. */
export function ledgerByPeriod(lines: readonly LedgerLine[]): LedgerPeriod[] {
    const order: string[] = [];
    const groups = new Map<string, LedgerPeriod>();
    for (const line of lines) {
        const key = line.when.year + '-' + line.when.day;
        let period = groups.get(key);
        if (!period) {
            period = { year: line.when.year, day: line.when.day, lines: [], balance: 0 };
            groups.set(key, period);
            order.push(key);
        }
        period.lines.push(line);
        period.balance += line.amount;
    }
    return order.map((key) => groups.get(key)!);
}
