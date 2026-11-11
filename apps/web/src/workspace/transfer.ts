/**
 * DS5, the transfer line (findings/ship_crew_plan.md §3 (4); Johnny 140, "there is no Remove on a transfer,
 * you just transfer it back"): credits moved between the party ship's Ledger and one character's credit
 * register, as two lines with one `linkId`. To the ship: income on the ship, a minus on the character.
 * From the ship: an expense on the ship, a plus on the character. Both dated the campaign day. Pure.
 */
import type { LedgerLine } from '@voyage/shared';

export type Direction = 'to' | 'from';

/** The register's own bound on a memo (apps/api/src/character/ledger.ts, MEMO_MAX). */
export const REGISTER_MEMO_MAX = 80;

export const NOT_MOVED = 'The credits were not moved. Try again.';
export const NO_REGISTER = 'This character has no credit register. Attach a Character to their sheet first.';
export const TRANSFER_KEPT = 'A transfer is not removed; move the credits back.';
export const AMOUNT_WORDS = 'Give the amount in whole credits, above 0.';

/** A ship line, or a register line, that belongs to a transfer. */
export function isTransfer(line: { linkId?: string | null }): boolean {
    return typeof line.linkId === 'string' && line.linkId !== '';
}

function clip(text: string, max: number): string {
    return text.length <= max ? text : text.slice(0, max - 1).trimEnd() + '…';
}

/** "Tam Oduya to the ship: Shore leave" on the ship; "To Kestrel Dawn: Shore leave" on the character. */
export function transferMemos(direction: Direction, person: string, ship: string, memo: string): { ship: string; register: string } {
    const said = memo.trim();
    const tail = said ? ': ' + said : '';
    const shipMemo = direction === 'to' ? person + ' to the ship' + tail : 'The ship to ' + person + tail;
    const registerMemo = (direction === 'to' ? 'To ' : 'From ') + ship + tail;
    return { ship: shipMemo, register: clip(registerMemo, REGISTER_MEMO_MAX) };
}

export type TransferDraft = {
    direction: Direction;
    amount: number;
    memo: string;
    person: { id: string; name: string };
    ship: string;
    when: LedgerLine['when'];
    /** The campaign's day count for the register, or null when the clock has none. */
    whenDay: number | null;
    linkId: string;
};

export type TransferLines = {
    ship: LedgerLine;
    register: { kind: 'transfer'; amount: number; memo: string; whenDay?: number; linkId: string };
};

/** The two lines: the same credits, opposite signs, one link. */
export function transferLines(draft: TransferDraft): TransferLines {
    const memos = transferMemos(draft.direction, draft.person.name, draft.ship, draft.memo);
    const toShip = draft.direction === 'to';
    const ship: LedgerLine = { when: draft.when, amount: toShip ? draft.amount : -draft.amount, memo: memos.ship, kind: toShip ? 'income' : 'expense', linkId: draft.linkId };
    const register: TransferLines['register'] = { kind: 'transfer', amount: toShip ? -draft.amount : draft.amount, memo: memos.register, linkId: draft.linkId };
    if (draft.whenDay !== null) register.whenDay = draft.whenDay;
    return { ship, register };
}

/** The line that undoes the register's half when the ship's half did not land: the same link, the sign turned. */
export function reversingLine(register: TransferLines['register']): TransferLines['register'] {
    return { ...register, amount: -register.amount, memo: clip('Not moved: ' + register.memo, REGISTER_MEMO_MAX) };
}

/** Whole credits above 0, or null: "1,200", "Cr1,200". */
export function transferAmount(text: string): number | null {
    const cleaned = text.replace(/\s|,/g, '').replace(/^Cr/i, '');
    if (!/^\d+$/.test(cleaned)) return null;
    const value = Number(cleaned);
    return Number.isSafeInteger(value) && value > 0 ? value : null;
}

/** "Moved Cr1,200 from Tam Oduya to the ship." */
export function movedWords(direction: Direction, credits: string, person: string): string {
    return direction === 'to' ? 'Moved ' + credits + ' from ' + person + ' to the ship.' : 'Moved ' + credits + ' from the ship to ' + person + '.';
}
