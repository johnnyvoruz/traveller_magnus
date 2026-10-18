/**
 * How a credit amount is written (Epic T, decision 4). Pure.
 * `Cr1,234` and `MCr1.2`. A debit puts U+2212 before the unit: `−Cr4,800`.
 * No price and no rule.
 */

function grouped(value: number): string {
    const abs = Math.abs(value);
    const whole = Math.trunc(abs);
    const fraction = abs - whole;
    const body = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    if (fraction === 0) return body;
    const digits = String(Math.round(fraction * 100) / 100);
    const dot = digits.indexOf('.');
    return body + (dot >= 0 ? digits.slice(dot) : '');
}

/** The minus sits before the unit, so a caller does not add one of its own. */
function written(unit: string, amount: number): string {
    return (amount < 0 ? '−' : '') + unit + grouped(amount);
}

/** `Cr1,234`. A fractional credit keeps up to two digits. A debit is `−Cr4,800`. */
export function formatCredits(amount: number): string {
    return written('Cr', amount);
}

/** `MCr1.2`. A whole megacredit has no decimal. A debit is `−MCr1.2`. */
export function formatMegaCredits(amount: number): string {
    return written('MCr', amount);
}
