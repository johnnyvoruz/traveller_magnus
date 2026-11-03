/**
 * A jump offers its fuel, the referee approves (DT8; Johnny 2026-11-01, question 127: "let's have it that
 * the ref can approve the fuel deduction"; 143: the hull tons are the sheet's Size box). The tons are the
 * file's jump fuel rule (rules/mgt2e_space_travel.json `jump.fuelHullFractionPerParsec`, read by
 * campaign/travel.ts `jumpFuelTons`) with the sheet's hull in place of the 100-ton assumption. Nothing
 * here writes: the words beside a jump leg, the line the press posts, and whether it has been posted.
 * Pure: it runs under Node.
 */
import type { LedgerLine, TrackLeg } from '@voyage/shared';
import { jumpFuelTons, jumpParsecsCounted } from '../campaign/travel.ts';
import { tonsWords } from '../orbit/estimates.ts';
import type { SheetValues } from './sheet_fields.ts';
import { dayWords, type Day } from './vessel_trade.ts';

/** The ship sheet's hull box, as rules/mgt2e_ship_sheet_fields.json names it (Johnny 143: the existing field, no new one). */
export const HULL_FIELD = 'Size';

export const NO_HULL = 'Write the hull tonnage in the ship sheet’s Size box for the jump fuel.';
export const NO_FUEL_ABOARD = 'Fuel aboard is not written yet.';

/** The hull's tons from the Size box: the first number in it, above zero; null when the box is empty or says no number. */
export function hullTonsOf(values: SheetValues | null | undefined): number | null {
    const raw = values ? values[HULL_FIELD] : undefined;
    if (typeof raw !== 'string' || !raw.trim()) return null;
    const match = raw.replace(/,/g, '').match(/\d+(?:\.\d+)?/);
    if (!match) return null;
    const tons = Number(match[0]);
    return Number.isFinite(tons) && tons > 0 ? tons : null;
}

export type JumpFuel = {
    /** The tons the file's rule takes for this jump. */
    tons: number;
    /** The parsecs as the file counts them (at least its minimum). */
    parsecs: number;
    hullTons: number;
};

/** The jump's fuel from the hull and the parsecs; null without a hull or a distance. */
export function jumpFuelOf(hullTons: number | null, parsecs: number | null): JumpFuel | null {
    if (hullTons === null || parsecs === null || !Number.isFinite(parsecs) || parsecs < 0) return null;
    return { tons: jumpFuelTons(hullTons, parsecs), parsecs: jumpParsecsCounted(parsecs), hullTons };
}

/**
 * "Jump fuel: 10 t of 41 t aboard"; "Jump fuel: 50 t of 41 t aboard: not enough" when the tanks hold less;
 * "Jump fuel: 10 t. Fuel aboard is not written yet." when the tanks are not typed.
 */
export function jumpFuelWords(fuel: JumpFuel, aboard: number | null): string {
    const tons = 'Jump fuel: ' + tonsWords(fuel.tons) + ' t';
    if (aboard === null) return tons + '. ' + NO_FUEL_ABOARD;
    const of = tons + ' of ' + tonsWords(aboard) + ' t aboard';
    return fuel.tons > aboard ? of + ': not enough' : of;
}

/** The line the press posts: "Fuel: jump to Ruie, 1 parsec, −10 t". The credits were paid at the refuel: the amount is 0. */
export function fuelTakenMemo(destination: string, fuel: JumpFuel): string {
    return 'Fuel: jump to ' + destination + ', ' + fuel.parsecs + (fuel.parsecs === 1 ? ' parsec' : ' parsecs') + ', −' + tonsWords(fuel.tons) + ' t';
}

export function fuelTakenLine(when: Day, destination: string, fuel: JumpFuel): LedgerLine {
    return { when, amount: 0, memo: fuelTakenMemo(destination, fuel), kind: 'expense' };
}

function sameDay(a: Day, b: Day): boolean {
    return a.year === b.year && a.day === b.day;
}

/** The line already on the Ledger for this jump (the same memo on the same day), or null: the press is offered once per jump. */
export function fuelTaken(lines: readonly LedgerLine[], when: Day, memo: string): LedgerLine | null {
    return lines.find((line) => line.memo === memo && sameDay(line.when, when)) ?? null;
}

/** "Taken: −10 t on 021-1105" once the line is posted. */
export function fuelTakenWords(line: LedgerLine): string {
    const dash = line.memo.lastIndexOf('−');
    return 'Taken: ' + (dash >= 0 ? line.memo.slice(dash) : line.memo) + ' on ' + dayWords(line.when);
}

/** The latest jump leg of a track, with its place in the list; null when the track has no jump. */
export function latestJump(legs: readonly TrackLeg[]): { leg: TrackLeg; n: number } | null {
    for (let i = legs.length - 1; i >= 0; i--) {
        if (legs[i].mode === 'jump') return { leg: legs[i], n: i + 1 };
    }
    return null;
}
