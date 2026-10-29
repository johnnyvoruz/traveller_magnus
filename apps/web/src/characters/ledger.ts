/**
 * Character credit register (directives/contracts/b_player_credits.md). Pure.
 * `amount` is the credit change: a deposit is positive, a withdrawal is negative.
 * A pending line stays out of the balance until the player accepts it.
 * No payment, fare, or share value is computed.
 */
import { formatCredits } from '../campaign/money.ts';

export const CREDIT_KINDS = ['pay', 'purchase', 'fare', 'share', 'transfer', 'adjustment'] as const;

export type CreditKind = (typeof CREDIT_KINDS)[number];

/** One stored row. `pending` is 0 or 1, matching the contract column. */
export type CreditLine = {
    id: string;
    seq: number;
    whenDay: number | null;
    whenReal: string;
    memo: string;
    amount: number;
    kind: CreditKind;
    byUser: string;
    linkId: string | null;
    voidOf: string | null;
    pending: 0 | 1;
};

export type CreditMode = 'simple' | 'detailed';

/** An editor posts a counted line. A referee who cannot edit the character posts pending. */
export type CreditPoster = 'editor' | 'referee';

export type CreditDraft = {
    kind: string;
    amount: number;
    memo: string;
    whenDay?: number | null;
    linkId?: string | null;
    poster: CreditPoster;
};

export type CreditStamp = {
    id: string;
    byUser: string;
    whenReal: string;
};

export type CreditRefusal = {
    ok: false;
    code: 'validation' | 'not_found';
    message: string;
};

export type CreditPosted = {
    ok: true;
    line: CreditLine;
    lines: CreditLine[];
};

export type RunningCredit = {
    line: CreditLine;
    balance: number;
};

const INVALID: CreditRefusal = { ok: false, code: 'validation', message: 'Invalid request.' };

/** Decided 16:09 (B BT1b), bound raised 2026-10-27 (AF8): memo 1 to 80, amount within ±1,000,000,000, whenDay 0 to 4,000,000. */
const MEMO_MAX = 80;
const AMOUNT_MAX = 1_000_000_000;
const DAY_MAX = 4_000_000;

function memoOk(memo: unknown): memo is string {
    return typeof memo === 'string' && memo.trim() !== '' && memo.length >= 1 && memo.length <= MEMO_MAX;
}

function amountOk(amount: unknown): amount is number {
    return typeof amount === 'number'
        && Number.isSafeInteger(amount)
        && amount !== 0
        && amount >= -AMOUNT_MAX
        && amount <= AMOUNT_MAX;
}

function dayOk(whenDay: number | null | undefined): boolean {
    if (whenDay == null) return true;
    return Number.isSafeInteger(whenDay) && whenDay >= 0 && whenDay <= DAY_MAX;
}

function isKind(kind: string): kind is CreditKind {
    return (CREDIT_KINDS as readonly string[]).includes(kind);
}

function nextSeq(lines: readonly CreditLine[]): number {
    let seq = 0;
    for (const line of lines) if (line.seq > seq) seq = line.seq;
    return seq + 1;
}

/** Sum of the lines that are not pending. */
export function creditBalance(lines: readonly CreditLine[]): number {
    let sum = 0;
    for (const line of lines) if (line.pending === 0) sum += line.amount;
    return sum;
}

/** Seq order. A pending line keeps the balance where it was. */
export function runningCredits(lines: readonly CreditLine[]): RunningCredit[] {
    const ordered = [...lines].sort((a, b) => a.seq - b.seq);
    let balance = 0;
    return ordered.map((line) => {
        if (line.pending === 0) balance += line.amount;
        return { line, balance };
    });
}

/**
 * Absent meta is Simple, unless a stored line is anything other than `adjustment`,
 * which opens Detailed. A stored `simple` or `detailed` wins.
 */
export function creditMode(meta: unknown, lines: readonly CreditLine[]): CreditMode {
    if (meta === 'simple' || meta === 'detailed') return meta;
    for (const line of lines) if (line.kind !== 'adjustment') return 'detailed';
    return 'simple';
}

/** Append one line. There is no line cap. */
export function postCredit(lines: readonly CreditLine[], draft: CreditDraft, stamp: CreditStamp): CreditPosted | CreditRefusal {
    if (!isKind(draft.kind)) return INVALID;
    if (!memoOk(draft.memo)) return INVALID;
    if (!amountOk(draft.amount)) return INVALID;
    if (!dayOk(draft.whenDay)) return INVALID;
    const line: CreditLine = {
        id: stamp.id,
        seq: nextSeq(lines),
        whenDay: draft.whenDay ?? null,
        whenReal: stamp.whenReal,
        memo: draft.memo,
        amount: draft.amount,
        kind: draft.kind,
        byUser: stamp.byUser,
        linkId: draft.kind === 'transfer' ? (draft.linkId ?? null) : null,
        voidOf: null,
        pending: draft.poster === 'referee' ? 1 : 0,
    };
    return { ok: true, line, lines: lines.concat(line) };
}

/**
 * Simple mode: one `adjustment` for a Cash on Hand edit.
 * The memo is the set, as in the backlog example "Set to Cr12,400".
 * The same balance posts nothing, because a line's amount is a non-zero integer.
 */
export function cashAdjustment(
    lines: readonly CreditLine[],
    nextCash: number,
    stamp: CreditStamp,
    whenDay?: number | null,
): CreditPosted | CreditRefusal | { ok: true; line: null; lines: readonly CreditLine[] } {
    if (!Number.isSafeInteger(nextCash)) return INVALID;
    const amount = nextCash - creditBalance(lines);
    if (amount === 0) return { ok: true, line: null, lines };
    return postCredit(lines, {
        kind: 'adjustment',
        amount,
        memo: 'Set to ' + formatCredits(nextCash),
        whenDay,
        poster: 'editor',
    }, stamp);
}

/** A reversing line. The named line stays. A pending line is not voided. */
export function voidCredit(lines: readonly CreditLine[], lineId: string, stamp: CreditStamp, whenDay?: number | null): CreditPosted | CreditRefusal {
    const named = lines.find((line) => line.id === lineId);
    if (!named) return { ok: false, code: 'not_found', message: 'No such line.' };
    if (lines.some((line) => line.voidOf === lineId)) {
        return { ok: false, code: 'validation', message: 'That line is already voided.' };
    }
    if (named.pending === 1) return { ok: false, code: 'validation', message: 'That line is still pending.' };
    if (!dayOk(whenDay)) return INVALID;
    const line: CreditLine = {
        id: stamp.id,
        seq: nextSeq(lines),
        whenDay: whenDay ?? null,
        whenReal: stamp.whenReal,
        memo: named.memo,
        amount: -named.amount,
        kind: named.kind,
        byUser: stamp.byUser,
        linkId: named.linkId,
        voidOf: named.id,
        pending: 0,
    };
    return { ok: true, line, lines: lines.concat(line) };
}

/**
 * The player accepts a pending line. The row stays; `pending` becomes 0.
 * The user who posted it does not accept it.
 */
export function acceptCredit(lines: readonly CreditLine[], lineId: string, byUser: string): CreditPosted | CreditRefusal {
    const named = lines.find((line) => line.id === lineId);
    if (!named) return { ok: false, code: 'not_found', message: 'No such line.' };
    if (named.pending === 0) return { ok: false, code: 'validation', message: 'That line is already in the register.' };
    if (named.byUser === byUser) return { ok: false, code: 'validation', message: 'That line is waiting for the player.' };
    const line: CreditLine = { ...named, pending: 0 };
    return {
        ok: true,
        line,
        lines: lines.map((row) => row.id === lineId ? line : row),
    };
}
