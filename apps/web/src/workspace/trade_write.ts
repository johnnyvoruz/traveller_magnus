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
import type { StatusAppend } from '@voyage/shared';

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
 * The piece that takes `before` to `after`, or null when nothing changed or the change is not one the
 * door carries: a ledger line taken away, a row of any list changed in place (taken away and added in
 * one press), or any other key of the status touched.
 */
export function appendOf(before: Status | null | undefined, after: Status): Append | null {
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
    if (append.ledger?.length) out.push('ledger');
    if (append.cargo || append.passengers || append.fuelTons !== undefined) out.push('trade');
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
