/**
 * Fuel and the sheet's monthly costs (Epic T, step T2). Pure.
 * Prices are read from rules/mgt2e_space_travel.json through the generated wrapper.
 * The current fuel level is typed. There is no gauge and no dice.
 * When a vessel's status carries `fuelTons`, that number is the level aboard.
 * The grade a starport class sells, and fuel at a base, are read from the same file.
 */
// @ts-expect-error -- the generated wrapper is JavaScript with no declaration.
import generated from '../../../../packages/engines/src/generated/rules/mgt2e_space_travel.js';
import type { LedgerLine } from '@voyage/shared';
import type { SheetValues } from '../workspace/sheet_fields.ts';
import { UPKEEP_FIELDS } from './ship_finance.ts';

type PortGrade = 'refined' | 'unrefined';

type BaseFuel = {
    fuel: PortGrade | 'none' | null;
    crPerTon: number | null;
};

type FuelRules = {
    fuel: {
        refinedCrPerTon: number;
        unrefinedCrPerTon: number;
        byStarportClass: Record<string, PortGrade | 'none'>;
        bases: Record<string, BaseFuel>;
    };
};

const rules = generated as FuelRules;

export const FUEL_CAPACITY = 'Fuel Capacity';

/**
 * The boxes "Post this month" writes. The same list as upkeep: Mortgage,
 * Maintenance, Life Support, Salary, Running. Purchase Cost is paid once.
 * Fuel Tank Cost is the price of a refuel, which Refuel posts.
 */
export const MONTHLY_COST_FIELDS = UPKEEP_FIELDS;

export type FuelGrade = 'refined' | 'unrefined';

function text(values: SheetValues, name: string): string {
    const value = values[name];
    return typeof value === 'string' ? value.trim() : '';
}

function firstNumber(raw: string): number | null {
    if (!raw) return null;
    const match = raw.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
    if (!match) return null;
    const n = Number(match[0]);
    return Number.isFinite(n) ? n : null;
}

/** Cr per ton from the rules file. */
export function fuelCrPerTon(grade: FuelGrade): number {
    return grade === 'refined' ? rules.fuel.refinedCrPerTon : rules.fuel.unrefinedCrPerTon;
}

export type VesselFuelMark = 'naval' | 'scout';

export type FuelOffer = {
    /** The starport, or a base whose letter is a key in the rules file. */
    from: 'starport' | 'base';
    code: string;
    grade: PortGrade;
    /** Cr per ton. Null when the file leaves the price for the referee to type. */
    crPerTon: number | null;
};

/** The base letter a referee's mark reads. Those letters are the keys in `fuel.bases`. */
const MARK_BASE: Record<VesselFuelMark, string> = { naval: 'N', scout: 'S' };

function soldGrade(value: unknown): PortGrade | null {
    if (value === 'refined' || value === 'unrefined') return value;
    return null;
}

/**
 * What this world sells.
 * The starport class is `fuel.byStarportClass` (none is not an offer).
 * Base fuel is the row for the referee's mark, and only on a party vessel.
 * A base whose fuel is null, including corsair and Way Station, adds nothing.
 */
export function fuelOffers(
    starportClass: string,
    bases: string,
    partyVessel: boolean,
    mark: VesselFuelMark | null,
): FuelOffer[] {
    const offers: FuelOffer[] = [];
    const letter = starportClass.trim();
    const port = soldGrade(rules.fuel.byStarportClass[letter]);
    if (port) offers.push({ from: 'starport', code: letter, grade: port, crPerTon: fuelCrPerTon(port) });
    const wanted = partyVessel && mark ? MARK_BASE[mark] : null;
    const seen = new Set<string>();
    for (const code of bases) {
        if (seen.has(code)) continue;
        seen.add(code);
        if (code !== wanted) continue;
        const row = rules.fuel.bases[code];
        const grade = row ? soldGrade(row.fuel) : null;
        if (!grade) continue;
        const price = row.crPerTon;
        offers.push({
            from: 'base',
            code,
            grade,
            crPerTon: typeof price === 'number' && Number.isFinite(price) ? price : null,
        });
    }
    return offers;
}

/** The number written in Fuel Capacity, or null when that box has no number. */
export function fuelCapacityTons(values: SheetValues | null | undefined): number | null {
    if (!values) return null;
    return firstNumber(text(values, FUEL_CAPACITY));
}

/** Tons aboard when status.fuelTons is a finite number. Absent otherwise. */
export function fuelTonsOf(status: { fuelTons?: unknown } | null | undefined): number | null {
    if (!status || typeof status.fuelTons !== 'number' || !Number.isFinite(status.fuelTons)) return null;
    return status.fuelTons;
}

/**
 * Tons still to take on. When status carries fuelTons, that is the level.
 * Otherwise `typedTons` is the level.
 */
export function tonsToFillFromStatus(
    capacityTons: number | null,
    status: { fuelTons?: unknown } | null | undefined,
    typedTons: number | null,
): number {
    const aboard = fuelTonsOf(status);
    return tonsToFill(capacityTons, aboard != null ? aboard : typedTons);
}

/**
 * Tons still to take on. A missing or negative reading counts as empty of that figure,
 * and a current level above capacity fills nothing.
 */
export function tonsToFill(capacityTons: number | null, currentTons: number | null): number {
    const capacity = capacityTons != null && Number.isFinite(capacityTons) && capacityTons > 0 ? capacityTons : 0;
    const current = currentTons != null && Number.isFinite(currentTons) && currentTons > 0 ? currentTons : 0;
    return Math.max(0, capacity - current);
}

/** Credits for the tons still to fill, at the file's price. Zero when nothing is taken on. */
export function refuelCost(capacityTons: number | null, currentTons: number | null, grade: FuelGrade): number {
    return tonsToFill(capacityTons, currentTons) * fuelCrPerTon(grade);
}

/**
 * An expense line for a refuel, or null when no tons are taken on.
 * `amount` is the credit change as stored, so the cost is negative.
 */
export function refuelLine(
    when: LedgerLine['when'],
    capacityTons: number | null,
    currentTons: number | null,
    grade: FuelGrade,
): LedgerLine | null {
    const tons = tonsToFill(capacityTons, currentTons);
    if (tons <= 0) return null;
    const cost = tons * fuelCrPerTon(grade);
    return {
        when,
        amount: -cost,
        memo: 'Refuel, ' + grade + ', ' + tons + ' t',
        kind: 'expense',
    };
}

/** One recurring expense per cost box that holds a positive number. The amount is negative. */
export function monthlyLines(values: SheetValues | null | undefined, when: LedgerLine['when']): LedgerLine[] {
    if (!values) return [];
    const lines: LedgerLine[] = [];
    for (const name of MONTHLY_COST_FIELDS) {
        const amount = firstNumber(text(values, name));
        if (amount == null || amount <= 0) continue;
        lines.push({ when, amount: -amount, memo: name, kind: 'recurring' });
    }
    return lines;
}
