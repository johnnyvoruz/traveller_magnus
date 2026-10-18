/**
 * Which table set a campaign rolls (findings/trade_tables_design.md §9.3).
 * A kind left out of settings is the official set. A named set that cannot be
 * read is the official set, and the caller can say so.
 * This file does not import a rules file. The caller hands the official sets in.
 */
import { TABLE_KINDS, validateTableSet, type TableKind, type TableSetData } from '@voyage/shared';

export type TableChoice = {
    tableSets?: Readonly<Record<string, string>> | null;
};

export type ResolvedTable = {
    set: TableSetData | null;
    fellBack: boolean;
    words: string | null;
};

function fallback(kind: string): string {
    return `This campaign's ${kind} table could not be read; using the official table.`;
}

/**
 * The set of this kind the campaign uses.
 * `officials` is the published file of each kind, already in an envelope.
 * `ownSets` is the account's sets. Settings are read only for `tableSets`.
 */
export function setFor(
    kind: string,
    settings: TableChoice | null,
    ownSets: readonly TableSetData[],
    officials: Readonly<Partial<Record<TableKind, TableSetData>>>,
): ResolvedTable {
    if (!(kind in TABLE_KINDS)) {
        return { set: null, fellBack: true, words: 'This app has no roller for that table.' };
    }
    const official = officials[kind as TableKind] ?? null;
    const id = settings?.tableSets?.[kind];
    if (!id || id === `official:${kind}` || (official != null && id === official.id)) {
        return { set: official, fellBack: false, words: null };
    }
    const chosen = ownSets.find((row) => row.id === id);
    const checked = chosen ? validateTableSet(chosen) : null;
    if (chosen && checked?.ok && checked.set?.kind === kind) {
        return { set: chosen, fellBack: false, words: null };
    }
    return { set: official, fellBack: true, words: fallback(kind) };
}
