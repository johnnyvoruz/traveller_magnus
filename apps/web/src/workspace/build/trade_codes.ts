/**
 * Trade codes from the digits (DH5; findings/hex_editor_plan.md §3.2 item 5; decided 2026-11-02: offered as
 * "From the digits: Ag Ni · Use these", never written without the press; the chart's survey list is kept
 * unless the referee changes it). The conditions are the eighteen rows of `tradeCodes` in rules/mgt2e_data.js
 * (the text's Trade Codes table, assets/2eWorldCreation.txt:1345-1367), read through the generated wrapper
 * and evaluated as the engine's auditor evaluates them (packages/engines/src/mgt2e_uwp_auditor.js
 * `verifyTradeCodes`): a code is earned when every condition on its row holds. Nothing here is a number of
 * its own. Pure: it runs under Node.
 */
import type { FormField } from '@voyage/shared';
// @ts-expect-error -- the generated wrapper is JavaScript with no declaration.
import { MgT2EData } from '../../../../../packages/engines/src/generated/rules/mgt2e_data.js';
import { cellOf, digitOf, type Cell } from './world_card.ts';

/** One row of the table: the bounds a code asks of the digits, as the file names them. */
type Condition = {
    minSize?: number; maxSize?: number;
    minAtm?: number; maxAtm?: number; validAtms?: number[];
    minHydro?: number; maxHydro?: number;
    minPop?: number; maxPop?: number;
    minGov?: number; maxGov?: number;
    minLaw?: number; maxLaw?: number;
    minTl?: number; maxTl?: number;
    /** A water world's atmosphere is one of two ranges (the file's `atmRanges`). */
    complexAtmHydro?: boolean; atmRanges?: [number, number][];
};

const TABLE = (MgT2EData as { tradeCodes: Record<string, Condition> }).tradeCodes;

/** The digits a code is judged on, as numbers; a cell not typed is null and fails every bound on it. */
export type Digits = { size: number | null; atm: number | null; hydro: number | null; pop: number | null; gov: number | null; law: number | null; tl: number | null };

const DIGITS = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ';

/** A profile cell's number: its ehex digit's value, or null when empty. */
export function digitNumber(value: FormField['value']): number | null {
    const digit = digitOf(value);
    const at = digit ? DIGITS.indexOf(digit) : -1;
    return at >= 0 ? at : null;
}

const CELL_KEY: Partial<Record<Cell, keyof Digits>> = { s: 'size', a: 'atm', h: 'hydro', p: 'pop', g: 'gov', l: 'law', tl: 'tl' };

/** The digits from the profile fields of a form (the card's cells, or a hand body's). */
export function digitsOf(fields: readonly FormField[]): Digits {
    const out: Digits = { size: null, atm: null, hydro: null, pop: null, gov: null, law: null, tl: null };
    for (const field of fields) {
        const cell = cellOf(field.id);
        const key = cell ? CELL_KEY[cell] : undefined;
        if (key) out[key] = digitNumber(field.value);
    }
    return out;
}

function within(value: number | null, min: number | undefined, max: number | undefined): boolean {
    if (min === undefined && max === undefined) return true;
    if (value === null) return false;
    return (min === undefined || value >= min) && (max === undefined || value <= max);
}

/** Whether one row's every condition holds for these digits. */
export function meets(condition: Condition, digits: Digits): boolean {
    if (!within(digits.size, condition.minSize, condition.maxSize)) return false;
    if (!within(digits.atm, condition.minAtm, condition.maxAtm)) return false;
    if (condition.validAtms && (digits.atm === null || !condition.validAtms.includes(digits.atm))) return false;
    if (condition.atmRanges && (digits.atm === null || !condition.atmRanges.some(([from, to]) => digits.atm! >= from && digits.atm! <= to))) return false;
    if (!within(digits.hydro, condition.minHydro, condition.maxHydro)) return false;
    if (!within(digits.pop, condition.minPop, condition.maxPop)) return false;
    if (!within(digits.gov, condition.minGov, condition.maxGov)) return false;
    if (!within(digits.law, condition.minLaw, condition.maxLaw)) return false;
    if (!within(digits.tl, condition.minTl, condition.maxTl)) return false;
    return true;
}

/** The codes the digits earn, in the table's order. */
export function tradeCodesOf(digits: Digits): string[] {
    return Object.entries(TABLE).filter(([, condition]) => meets(condition, digits)).map(([code]) => code);
}

/** The codes of the table, in its order (the eighteen). */
export function tableCodes(): string[] {
    return Object.keys(TABLE);
}

/** "From the digits: Ag Ni", or "From the digits: none" when no row holds. */
export function fromDigitsWords(codes: readonly string[]): string {
    return 'From the digits: ' + (codes.length ? codes.join(' ') : 'none');
}

/** Whether the typed list already says what the digits say (the same codes, in any order; other codes kept aside). */
export function sameCodes(typed: string, codes: readonly string[]): boolean {
    const held = typed.split(/[\s,]+/).filter(Boolean);
    return codes.every((code) => held.includes(code)) && held.every((code) => codes.includes(code));
}
