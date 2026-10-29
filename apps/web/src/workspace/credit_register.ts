/**
 * The credit register as a screen reads it and writes to it (streams/D.md DT1c; backlog T1b;
 * directives/contracts/b_player_credits.md). Pure: the rows with their running balance, who may
 * accept or void a line, what the Add a line form sends, and the shape of the register handle the
 * Characters store hands over (characters/register.ts is that store). The rules of the register
 * are Lane A's characters/ledger.ts. No payment, fare or share value is computed here.
 */
import { formatCredits } from '../campaign/money.ts';
import { CREDIT_KINDS, runningCredits, type CreditKind, type CreditLine, type CreditMode } from '../characters/ledger.ts';
import { DEFAULT_START, totalDays } from '../orbit/clock.ts';
import { parseStardate, stardate } from './stardate.ts';

export type RegisterStatus = 'idle' | 'loading' | 'ready' | 'unavailable' | 'denied' | 'error';

export type RegisterDraft = { kind: CreditKind; amount: number; memo: string; whenDay: number | null };

/** One character's register, as the store hands it over. Reactive: its members change under the reader. */
export type CharacterRegister = {
    readonly id: string;
    readonly status: RegisterStatus;
    readonly lines: readonly CreditLine[];
    readonly balance: number;
    readonly credits: CreditMode;
    /** A refusal, or why the register could not be read. Empty when there is nothing to say. */
    readonly notice: string;
    readonly busy: boolean;
    load(): Promise<void>;
    post(draft: RegisterDraft): Promise<CreditLine | null>;
    voidLine(lineId: string): Promise<boolean>;
    acceptLine(lineId: string): Promise<boolean>;
    setMode(credits: CreditMode): Promise<boolean>;
    /** Simple: the Cash on Hand box was typed; one adjustment brings the balance to it. */
    setCash(text: string, whenDay: number | null): Promise<boolean>;
};

/** The sheet's box that is the balance (contract: "Cash on Hand is the balance"). */
export const CASH_FIELD = 'Cash on Hand';
/** The server's bound on `whenDay` (contract: 0 to 4,000,000). A day past it is sent as no day. */
export const DAY_MAX = 4_000_000;
export const MEMO_MAX = 80;

export const KIND_WORDS: Record<CreditKind, string> = {
    pay: 'Pay', purchase: 'Purchase', fare: 'Fare', share: 'Share', transfer: 'Transfer', adjustment: 'Adjustment',
};

export function isCreditKind(kind: unknown): kind is CreditKind {
    return typeof kind === 'string' && (CREDIT_KINDS as readonly string[]).includes(kind);
}

export type RegisterRow = {
    line: CreditLine;
    /** The running balance after this line, in seq order. */
    balance: number;
    /** The campaign date, "014-1105", or empty when the line carries no day. */
    date: string;
    deposit: string;
    withdrawal: string;
    kind: string;
    pending: boolean;
    /** A later line reverses this one. */
    voided: boolean;
    /** This line is the reversal of another. */
    reversing: boolean;
};

/** Newest first, with the running balance. A pending line keeps the balance where it was. */
export function registerRows(lines: readonly CreditLine[]): RegisterRow[] {
    const voided = new Set<string>();
    for (const line of lines) if (line.voidOf) voided.add(line.voidOf);
    return runningCredits(lines).reverse().map(({ line, balance }) => ({
        line,
        balance,
        date: line.whenDay === null ? '' : stardate(line.whenDay).date,
        deposit: line.amount > 0 ? formatCredits(line.amount) : '',
        withdrawal: line.amount < 0 ? formatCredits(-line.amount) : '',
        kind: KIND_WORDS[line.kind],
        pending: line.pending === 1,
        voided: voided.has(line.id),
        reversing: line.voidOf !== null,
    }));
}

/** A pending line is accepted by anyone with access but the one who posted it. */
export function canAccept(line: CreditLine, you: string | null): boolean {
    return line.pending === 1 && (you === null || line.byUser !== you);
}

/** A counted line that no later line reverses. */
export function canVoid(line: CreditLine, lines: readonly CreditLine[]): boolean {
    return line.pending === 0 && !lines.some((row) => row.voidOf === line.id);
}

/**
 * The Cash on Hand box, when the register is read: the balance, typed in Simple and locked in
 * Detailed. Before the register is read, or when it is not available, the box is the sheet's own.
 */
export function readoutsFor(register: Pick<CharacterRegister, 'status' | 'balance' | 'credits'> | null): Readonly<Record<string, { value: string; locked: boolean }>> {
    if (!register || register.status !== 'ready') return {};
    return { [CASH_FIELD]: { value: formatCredits(register.balance), locked: register.credits === 'detailed' } };
}

/** A sheet box was committed. In Simple, Cash on Hand posts its adjustment; every other box is the sheet's. */
export function cashTyped(register: CharacterRegister | null, name: string, value: string | boolean, whenDay: number | null): boolean {
    if (!register || name !== CASH_FIELD || typeof value !== 'string') return false;
    if (register.status !== 'ready' || register.credits !== 'simple') return false;
    void register.setCash(value, whenDay);
    return true;
}

/**
 * An amount typed: "12,400", "Cr12,400", "12 400". Whole credits only; the sign comes from the
 * Deposit or Withdrawal choice, so a typed minus is refused unless `signed`. Null when it is not one.
 */
export function amountTyped(text: string, signed = false): number | null {
    const cleaned = text.replace(/−/g, '-').replace(/\s|,/g, '').replace(/^(-?)M?Cr/i, '$1');
    if (!/^-?\d+$/.test(cleaned)) return null;
    const value = Number(cleaned);
    if (!Number.isSafeInteger(value)) return null;
    if (!signed && value <= 0) return null;
    return value;
}

/** The day count inside the server's bound, else no day. */
export function dayWithin(whenDay: number | null): number | null {
    if (whenDay === null || !Number.isFinite(whenDay)) return null;
    const whole = Math.floor(whenDay);
    return whole >= 0 && whole <= DAY_MAX ? whole : null;
}

/** True when the campaign's day cannot be stored on a line (the clock counts past the bound). */
export function dayBeyondBound(whenDay: number | null): boolean {
    return whenDay !== null && Number.isFinite(whenDay) && dayWithin(whenDay) === null;
}

/** A date typed as the campaign writes it ("014-1105"; a day alone keeps the year given). Null when it is not a date. */
export function dateTyped(text: string, year: number): number | null {
    const parsed = parseStardate(text, year);
    return parsed ? totalDays(parsed.year, parsed.day) : null;
}

/** The campaign's date as the form shows it before a date is typed. */
export function dayPlaceholder(campaignDay: number | null): string {
    return campaignDay === null ? 'DDD-YYYY' : stardate(campaignDay).date;
}

export type LineInput = {
    direction: 'deposit' | 'withdrawal';
    amount: string;
    kind: string;
    memo: string;
    /** Blank takes the campaign's day. */
    date: string;
    campaignDay: number | null;
};

/** What the Add a line form sends, or the one sentence to show instead. */
export function lineDraft(input: LineInput): { ok: true; draft: RegisterDraft } | { ok: false; message: string } {
    const size = amountTyped(input.amount);
    if (size === null) return { ok: false, message: 'Type an amount in whole credits.' };
    if (!isCreditKind(input.kind)) return { ok: false, message: 'Choose a kind.' };
    const memo = input.memo.trim();
    if (!memo) return { ok: false, message: 'Type what the line is for.' };
    if (memo.length > MEMO_MAX) return { ok: false, message: 'Keep it to ' + MEMO_MAX + ' characters.' };
    let whenDay: number | null;
    if (input.date.trim()) {
        const year = input.campaignDay === null ? DEFAULT_START.year : stardate(input.campaignDay).year;
        const typed = dateTyped(input.date, year);
        if (typed === null) return { ok: false, message: 'Type the date as DDD-YYYY, such as 014-1105.' };
        if (dayWithin(typed) === null) return { ok: false, message: 'The register cannot keep a date in that year yet.' };
        whenDay = typed;
    } else {
        whenDay = dayWithin(input.campaignDay);
    }
    return { ok: true, draft: { kind: input.kind, amount: input.direction === 'withdrawal' ? -size : size, memo, whenDay } };
}
