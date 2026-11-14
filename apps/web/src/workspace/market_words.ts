/**
 * The words of a Markets nearby row (DT10): the facts line, the trade codes as pills with their full names
 * (`dossier/labels.ts`; a code the table does not name keeps its code), and an owner code as a sentence.
 * Nothing guessed: a name comes from the table or the chart's index, else the code stays as it is.
 */
import { tradeCodeName } from '../dossier/labels.ts';

export type CodePill = { code: string; label: string };

/** "Starport C · Trade number 8 · Pop 7": the starport, the WTN when read, the population digit. */
export function factsLine(row: { starport: string; wtn: number | null; population: string }): string {
    const parts = ['Starport ' + (row.starport || '?')];
    if (row.wtn !== null) parts.push('Trade number ' + row.wtn);
    if (row.population) parts.push('Pop ' + row.population);
    return parts.join(' · ');
}

/** An owner code's hex: "O:0431" gives "0431"; anything else null. */
export function ownerHex(code: string): string | null {
    const match = /^O:(\d{4})$/.exec(code.trim());
    return match ? match[1] : null;
}

/** "Owned by Khakkakum (0431)" when the index names the world at that hex, else "Owned by 0431". */
export function ownerLine(code: string, nameAt: (hex: string) => string | null): string {
    const hex = ownerHex(code);
    const rest = hex ?? code.trim().replace(/^O:/, '');
    const name = hex ? nameAt(hex) : null;
    return name ? `Owned by ${name} (${hex})` : 'Owned by ' + rest;
}

/** The trade codes as pills, the owner codes apart as their sentences. */
export function codeWords(codes: readonly string[], nameAt: (hex: string) => string | null): { pills: CodePill[]; owners: string[] } {
    const pills: CodePill[] = [];
    const owners: string[] = [];
    for (const raw of codes) {
        const code = raw.trim();
        if (!code) continue;
        if (code.startsWith('O:')) owners.push(ownerLine(code, nameAt));
        else pills.push({ code, label: tradeCodeName(code) ?? code });
    }
    return { pills, owners };
}
