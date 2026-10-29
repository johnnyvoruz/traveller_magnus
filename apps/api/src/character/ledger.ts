/**
 * Append-only credit register on the character object.
 * directives/contracts/b_player_credits.md, guards accepted (decisions: memo 1 to 80,
 * amount a non-zero integer within ±1,000,000,000, whenDay 0 to 4,000,000, no line cap).
 * No payment, fare, or share value is computed.
 */
import type { Sql } from './sheet.ts';

const KINDS = ['pay', 'purchase', 'fare', 'share', 'transfer', 'adjustment'] as const;
const MEMO_MAX = 80;
const AMOUNT_MAX = 1_000_000_000;
const DAY_MAX = 4_000_000;
const INVALID = { ok: false as const, status: 400 as const, code: 'validation', message: 'Invalid request.' };
const MISSING = { ok: false as const, status: 503 as const, code: 'ledger_unavailable', message: 'The credit register is not available yet.' };

export type CreditKind = (typeof KINDS)[number];
export type CreditMode = 'simple' | 'detailed';

export type LedgerLine = {
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

export type LedgerFail = { ok: false; status: 400 | 404 | 503; code: string; message: string };

export type LedgerPage = { ok: true; lines: LedgerLine[]; balance: number; credits: CreditMode };

export type LedgerStored = { ok: true; line: LedgerLine; balance: number; credits: CreditMode };

export function installLedger(sql: Sql): void {
    sql.exec(`CREATE TABLE IF NOT EXISTS ledger (
        id TEXT PRIMARY KEY,
        seq INTEGER NOT NULL,
        when_day INTEGER,
        when_real TEXT NOT NULL,
        memo TEXT NOT NULL,
        amount INTEGER NOT NULL,
        kind TEXT NOT NULL,
        by_user TEXT NOT NULL,
        link_id TEXT,
        void_of TEXT,
        pending INTEGER NOT NULL
    )`);
    sql.exec(`CREATE INDEX IF NOT EXISTS ledger_seq ON ledger(seq)`);
}

export function ledgerReady(sql: Sql): boolean {
    const rows = sql.exec(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'ledger'`);
    return rows.length > 0;
}

function isKind(kind: string): kind is CreditKind {
    return (KINDS as readonly string[]).includes(kind);
}

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

function dayOf(whenDay: unknown): number | null | false {
    if (whenDay == null) return null;
    if (!Number.isSafeInteger(whenDay) || (whenDay as number) < 0 || (whenDay as number) > DAY_MAX) return false;
    return whenDay as number;
}

function lineFrom(row: Record<string, unknown>): LedgerLine {
    return {
        id: String(row.id),
        seq: Number(row.seq),
        whenDay: row.when_day == null ? null : Number(row.when_day),
        whenReal: String(row.when_real),
        memo: String(row.memo),
        amount: Number(row.amount),
        kind: String(row.kind) as CreditKind,
        byUser: String(row.by_user),
        linkId: row.link_id == null ? null : String(row.link_id),
        voidOf: row.void_of == null ? null : String(row.void_of),
        pending: Number(row.pending) === 1 ? 1 : 0,
    };
}

function allLines(sql: Sql): LedgerLine[] {
    return sql.exec(`SELECT * FROM ledger ORDER BY seq`).map(lineFrom);
}

export function creditBalance(lines: readonly LedgerLine[]): number {
    let sum = 0;
    for (const line of lines) if (line.pending === 0) sum += line.amount;
    return sum;
}

/** A stored simple or detailed wins. Any other stored line than adjustment opens Detailed. */
export function creditsMode(stored: unknown, lines: readonly LedgerLine[]): CreditMode {
    if (stored === 'simple' || stored === 'detailed') return stored;
    for (const line of lines) if (line.kind !== 'adjustment') return 'detailed';
    return 'simple';
}

function storedCredits(sql: Sql): unknown {
    const rows = sql.exec(`SELECT value FROM meta WHERE key = 'credits'`);
    return rows.length ? rows[0].value : null;
}

/** Stores the switch on the existing meta row. Does not read or create the ledger table, and deletes no line. */
export function setCreditsMode(sql: Sql, credits: unknown): { ok: true; credits: CreditMode } | LedgerFail {
    if (credits !== 'simple' && credits !== 'detailed') return INVALID;
    sql.exec(
        `INSERT INTO meta (key, value) VALUES ('credits', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        credits,
    );
    return { ok: true, credits };
}

export function readLedger(sql: Sql, after: number): LedgerPage | LedgerFail {
    if (!ledgerReady(sql)) return MISSING;
    if (!Number.isSafeInteger(after) || after < 0) return INVALID;
    const lines = allLines(sql);
    return {
        ok: true,
        lines: lines.filter((line) => line.seq > after),
        balance: creditBalance(lines),
        credits: creditsMode(storedCredits(sql), lines),
    };
}

function nextSeq(sql: Sql): number {
    const rows = sql.exec(`SELECT seq FROM ledger ORDER BY seq DESC LIMIT 1`);
    return (rows.length ? Number(rows[0].seq) : 0) + 1;
}

export function postLedger(
    sql: Sql,
    input: { kind: unknown; amount: unknown; memo: unknown; whenDay?: unknown; linkId?: unknown },
    byUser: string,
    at: string,
    pending: 0 | 1,
    mint: () => string,
): LedgerStored | LedgerFail {
    if (!ledgerReady(sql)) return MISSING;
    if (typeof input.kind !== 'string' || !isKind(input.kind)) return INVALID;
    if (!memoOk(input.memo) || !amountOk(input.amount)) return INVALID;
    const whenDay = dayOf(input.whenDay);
    if (whenDay === false) return INVALID;
    const kind = input.kind;
    let linkId: string | null = null;
    if (kind === 'transfer') {
        if (input.linkId != null && typeof input.linkId !== 'string') return INVALID;
        linkId = typeof input.linkId === 'string' && input.linkId !== '' ? input.linkId : null;
    }
    const id = mint();
    const seq = nextSeq(sql);
    sql.exec(
        `INSERT INTO ledger (id, seq, when_day, when_real, memo, amount, kind, by_user, link_id, void_of, pending)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
        id,
        seq,
        whenDay,
        at,
        input.memo,
        input.amount,
        kind,
        byUser,
        linkId,
        pending,
    );
    const lines = allLines(sql);
    const line = lines.find((row) => row.id === id);
    if (!line) return INVALID;
    return { ok: true, line, balance: creditBalance(lines), credits: creditsMode(storedCredits(sql), lines) };
}

export function voidLedger(
    sql: Sql,
    lineId: string,
    byUser: string,
    at: string,
    mint: () => string,
): LedgerStored | LedgerFail {
    if (!ledgerReady(sql)) return MISSING;
    const lines = allLines(sql);
    const named = lines.find((line) => line.id === lineId);
    if (!named) return { ok: false, status: 404, code: 'not_found', message: 'No such line.' };
    if (lines.some((line) => line.voidOf === lineId)) {
        return { ok: false, status: 400, code: 'validation', message: 'That line is already voided.' };
    }
    if (named.pending === 1) return { ok: false, status: 400, code: 'validation', message: 'That line is still pending.' };
    const id = mint();
    const seq = nextSeq(sql);
    sql.exec(
        `INSERT INTO ledger (id, seq, when_day, when_real, memo, amount, kind, by_user, link_id, void_of, pending)
         VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, 0)`,
        id,
        seq,
        at,
        named.memo,
        -named.amount,
        named.kind,
        byUser,
        named.linkId,
        named.id,
    );
    const next = allLines(sql);
    const line = next.find((row) => row.id === id);
    if (!line) return INVALID;
    return { ok: true, line, balance: creditBalance(next), credits: creditsMode(storedCredits(sql), next) };
}

export function acceptLedger(sql: Sql, lineId: string, byUser: string): LedgerStored | LedgerFail {
    if (!ledgerReady(sql)) return MISSING;
    const lines = allLines(sql);
    const named = lines.find((line) => line.id === lineId);
    if (!named) return { ok: false, status: 404, code: 'not_found', message: 'No such line.' };
    if (named.pending === 0) return { ok: false, status: 400, code: 'validation', message: 'That line is already in the register.' };
    if (named.byUser === byUser) return { ok: false, status: 400, code: 'validation', message: 'That line is waiting for the player.' };
    sql.exec(`UPDATE ledger SET pending = 0 WHERE id = ?`, lineId);
    const next = allLines(sql);
    const line = next.find((row) => row.id === lineId);
    if (!line) return INVALID;
    return { ok: true, line, balance: creditBalance(next), credits: creditsMode(storedCredits(sql), next) };
}
