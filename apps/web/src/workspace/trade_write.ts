/**
 * DS4b, the players' trade screens (findings/ship_crew_plan.md §3 (3b)): one write path for the ship's
 * trade sections, whoever presses. The referee's press commits the whole record as before
 * (`vessel_trade.ts` `writeTrade`). A player's press becomes one piece through the append door
 * (`campaign/append.ts`): the referee's own pure functions build the next status, and `appendOf` reads
 * from it only what was added and what was taken away, so no rule is written twice.
 *
 * A player's door adds rows and removes rows; it never rewrites one. A player's lists are the players'
 * projection (a hidden person's link dropped, hidden names redacted), so a row changed in place and sent
 * back would overwrite the stored row with the projected one. `appendOf` refuses that shape, and any
 * change to a key the door does not carry. Pure; the send is handed in.
 */
import { passengerSeen, paymentSeen, type PassengerSeen, type PaymentSeen, type StatusAppend } from '@voyage/shared';

export type Status = { [key: string]: unknown };
export type Append = StatusAppend['append'];
export type Switch = 'ledger' | 'trade' | 'locker';

/** The keys a player's piece can carry, and the switch each needs (the server's `appendSwitches`, apps/api/src/universe/campaign.ts). */
const LISTS = ['ledger', 'cargo', 'passengers', 'locker'] as const;
type ListKey = (typeof LISTS)[number];

/** Said when a press would need what the door cannot carry. The referee's page does it. */
export const NOT_FROM_PLAYERS = 'This change can’t be made from a player’s page. Ask the referee.';

function list(status: Status | null | undefined, key: ListKey): readonly unknown[] {
    const value = status ? status[key] : undefined;
    return Array.isArray(value) ? value : [];
}

/** By identity: the referee's functions keep the rows they leave alone (`concat`, `filter`). */
function listDiff(before: readonly unknown[], after: readonly unknown[]): { add: unknown[]; remove: number[] } {
    const kept = new Set(after);
    const had = new Set(before);
    const remove: number[] = [];
    before.forEach((row, i) => { if (!kept.has(row)) remove.push(i); });
    return { add: after.filter((row) => !had.has(row)), remove };
}

function same(a: unknown, b: unknown): boolean {
    return a === b || JSON.stringify(a) === JSON.stringify(b);
}

/**
 * DT9: the two presses that rewrite in place, which the door now carries as B's pieces (BT2): Board names
 * the passenger's row and the jump the fare is for; Pay now the stored payment. The object posts the line.
 */
export type DoorPress = { board?: { index: number; parsecs: number }; payNow?: true };

function isRow(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * The Board press read back from the referee's before and after: the row at `index` gained its class and
 * fare and nothing else, and one income line of that fare was posted. The board item (`passengerSeen` of the
 * row as shown) and the before and after with both taken out, or null for any other shape.
 */
function boardOf(from: Status, after: Status, press: NonNullable<DoorPress['board']>): { item: NonNullable<NonNullable<Append['passengers']>['board']>[number]; before: Status; after: Status } | null {
    const was = list(from, 'passengers');
    const now = list(after, 'passengers');
    const lot = was[press.index];
    const next = now[press.index];
    if (was.length !== now.length || !isRow(lot) || !isRow(next) || typeof lot.fareCr === 'number') return null;
    if (typeof next.fareCr !== 'number' || typeof next.class !== 'string' || !Number.isInteger(press.parsecs) || press.parsecs <= 0) return null;
    if (!same({ ...lot, class: next.class, fareCr: next.fareCr }, next)) return null;
    const lines = listDiff(list(from, 'ledger'), list(after, 'ledger'));
    const fare = lines.add.length === 1 && isRow(lines.add[0]) ? lines.add[0] : null;
    if (lines.remove.length || !fare || fare.kind !== 'income' || fare.amount !== next.fareCr) return null;
    const item = { index: press.index, class: next.class, fareCr: next.fareCr, parsecs: press.parsecs, seen: passengerSeen(lot as PassengerSeen) };
    return { item, before: from, after: { ...after, passengers: was, ledger: list(from, 'ledger') } };
}

/** The Pay now press read back: the payment moved on and one expense line of its amount; null otherwise. */
function payOf(from: Status, after: Status): { seen: string; after: Status } | null {
    const owed = from.payment;
    if (!isRow(owed) || !isRow(owed.nextDueDay) || typeof owed.amountCr !== 'number' || typeof owed.everyDays !== 'number') return null;
    if (same(owed, after.payment)) return null;
    const lines = listDiff(list(from, 'ledger'), list(after, 'ledger'));
    const paid = lines.add.length === 1 && isRow(lines.add[0]) ? lines.add[0] : null;
    if (lines.remove.length || !paid || paid.kind !== 'expense' || paid.amount !== -owed.amountCr) return null;
    return { seen: paymentSeen(owed as unknown as PaymentSeen), after: { ...after, payment: owed, ledger: list(from, 'ledger') } };
}

/**
 * The piece that takes `before` to `after`, or null when nothing changed or the change is not one the
 * door carries: a ledger line taken away, a row of any list changed in place (taken away and added in
 * one press), or any other key of the status touched. With `press`, Board and Pay now become B's pieces.
 */
export function appendOf(before: Status | null | undefined, after: Status, press?: DoorPress): Append | null {
    if (press && (press.board || press.payNow)) {
        const from: Status = before ?? {};
        let to = after;
        const extra: Append = {};
        if (press.board) {
            const board = boardOf(from, to, press.board);
            if (!board) return null;
            to = board.after;
            extra.passengers = { board: [board.item] };
        }
        if (press.payNow) {
            const pay = payOf(from, to);
            if (!pay) return null;
            to = pay.after;
            extra.payNow = true;
            extra.paymentSeen = pay.seen;
        }
        // Nothing else may ride with the press.
        for (const key of new Set([...Object.keys(from), ...Object.keys(to)])) if (!same(from[key], to[key])) return null;
        return extra;
    }
    const from = before ?? {};
    for (const key of new Set([...Object.keys(from), ...Object.keys(after)])) {
        if ((LISTS as readonly string[]).includes(key) || key === 'fuelTons') continue;
        if (!same(from[key], after[key])) return null;
    }
    const out: Append = {};
    for (const key of LISTS) {
        const { add, remove } = listDiff(list(from, key), list(after, key));
        if (!add.length && !remove.length) continue;
        if (add.length && remove.length) return null;
        if (key === 'ledger') {
            if (remove.length) return null;
            out.ledger = add as Append['ledger'];
        } else if (key === 'cargo') {
            out.cargo = add.length ? { add: add as NonNullable<Append['cargo']>['add'] } : { remove };
        } else if (key === 'passengers') {
            out.passengers = add.length ? { add: add as NonNullable<Append['passengers']>['add'] } : { remove };
        } else {
            out.locker = add.length ? { add: add as NonNullable<Append['locker']>['add'] } : { remove };
        }
    }
    const fuel = after.fuelTons;
    if (!same(from.fuelTons, fuel)) {
        if (typeof fuel !== 'number' || !Number.isFinite(fuel) || fuel < 0) return null;
        out.fuelTons = fuel;
    }
    return Object.keys(out).length ? out : null;
}

/** The switches a piece needs, as the server reads them. */
export function switchesOf(append: Append): Switch[] {
    const out: Switch[] = [];
    // Board and Pay now post a line, so they need the Ledger switch too (the server's `appendSwitches`).
    const boarding = (append.passengers?.board?.length ?? 0) > 0;
    if (append.ledger?.length || boarding || append.payNow) out.push('ledger');
    if (append.cargo || append.passengers || append.fuelTons !== undefined || append.payNow) out.push('trade');
    if (append.locker) out.push('locker');
    return out;
}

/** What a player may press: every switch the press needs is on. */
export function allowedFor(needs: readonly Switch[], has: (key: Switch) => boolean): boolean {
    return needs.every(has);
}

/** "Posted by Tam Oduya" on a line a player posted; nothing on the referee's own. */
export function postedBy(by: string | undefined, nameOf: (id: string) => string): string {
    if (!by) return '';
    const name = nameOf(by).trim();
    return 'Posted by ' + (name || 'a player');
}

/** The one sentence at the head of a player's trade sections (the plan's rule 3). */
export const PLAYERS_TRADE = 'You trade; the referee keeps time. Nothing you do here moves the ship or the clock.';
