/**
 * Which lines a system hears, and in what order (spec_living_systems.md section 1.5).
 * Pure apart from the visit cursor, which lives in memory and clears on navigation away.
 * Cadence and the ship-name generator are later rows.
 */
import { hashString, mulberry32, type ChatterLineData } from '@voyage/shared';
import type { SystemFacts } from './facts.ts';

function inRange(value: number, range: { min?: number; max?: number; in?: number[] } | undefined): boolean {
    if (!range) return true;
    if (range.in && !range.in.includes(value)) return false;
    if (range.min !== undefined && value < range.min) return false;
    if (range.max !== undefined && value > range.max) return false;
    return true;
}

/** The selection's eligibility test. Moved from findings/living_systems/check_sample.mjs. */
export function eligible(line: ChatterLineData, facts: SystemFacts): boolean {
    const w = line.when;
    if (w.starport && !w.starport.includes(facts.starport as 'A')) return false;
    if (w.highport !== undefined && facts.highport !== w.highport) return false;
    const digits = {
        size: facts.size,
        atm: facts.atm,
        hydro: facts.hydro,
        pop: facts.pop,
        gov: facts.gov,
        law: facts.law,
        tl: facts.tl,
        gasGiants: facts.gasGiants,
        belts: facts.belts,
        moons: facts.moons,
        otherBodies: facts.otherBodies,
    };
    for (const key of Object.keys(digits) as (keyof typeof digits)[]) {
        if (!inRange(digits[key], w[key])) return false;
    }
    if (w.tradeCodes && !w.tradeCodes.some((code) => facts.tradeCodes.includes(code))) return false;
    if (w.notTradeCodes && w.notTradeCodes.some((code) => facts.tradeCodes.includes(code))) return false;
    if (w.zone && !w.zone.includes(facts.zone as 'green')) return false;
    if (w.bases && !w.bases.some((code) => facts.bases.includes(code))) return false;
    if (w.notBases && w.notBases.some((code) => facts.bases.includes(code))) return false;
    if (w.xboat !== undefined && facts.xboat !== w.xboat) return false;
    if (w.party && !w.party.includes(facts.party)) return false;
    if (w.day && (facts.day < w.day.min || facts.day > w.day.max)) return false;
    return true;
}

/**
 * Eligible lines, weighted shuffle. The key is one mulberry32 draw divided by weight.
 * Same hex, truth version and day produce the same order.
 */
export function sequenceFor(
    hexKey: string,
    truthVersion: string,
    day: number,
    lines: readonly ChatterLineData[],
    facts: SystemFacts,
): ChatterLineData[] {
    const ranked = lines.filter((line) => eligible(line, facts)).map((line) => {
        const draw = mulberry32(hashString(hexKey + '|' + truthVersion + '|' + day + '|' + line.id))();
        const weight = line.weight === undefined ? 1 : line.weight;
        return { line, key: draw / weight };
    });
    ranked.sort((a, b) => a.key - b.key);
    return ranked.map((item) => item.line);
}

const cursor = new Map<string, number>();

/** How many lines this visit has already shown for the system. A day change does not reset it. */
export function sequenceCursor(hexKey: string): number {
    return cursor.get(hexKey) ?? 0;
}

/** Navigation away from the system. The next visit starts at the first line again. */
export function clearSequence(hexKey: string): void {
    cursor.delete(hexKey);
}

/**
 * The next line for this visit: sequence[k], then k + 1. After the last eligible
 * line, k wraps. An empty sequence returns null and does not move the cursor.
 */
export function nextLine(hexKey: string, sequence: readonly ChatterLineData[]): ChatterLineData | null {
    if (sequence.length === 0) return null;
    const k = cursor.get(hexKey) ?? 0;
    const line = sequence[k % sequence.length];
    cursor.set(hexKey, k + 1);
    return line;
}
