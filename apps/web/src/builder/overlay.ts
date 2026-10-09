/**
 * One hex, from memory only. The chart entry is the sector index the map already holds.
 * The row is a universe row loadSector kept. Neither call fetches.
 * No row and a chart system: truth, rev 0. No row and no system: empty.
 * A row carries the chart entry the server made for it, including a removed row.
 * The map still drops a removed hex from the drawn index, and the faint outline
 * takes its name from this entry.
 */
import type { BuilderHex, SectorHex } from '@voyage/shared';
import type { HexView } from './types.ts';

/** The chart entry on a builder row, when the server sent one. A removed row keeps it. */
export function rowEntry(row: object): SectorHex | null {
    const record = row as { entry?: unknown };
    const value = record.entry;
    if (!value || typeof value !== 'object') return null;
    return value as SectorHex;
}

export function mergeHex(hexKey: string, truth: SectorHex | null, row: BuilderHex | null): HexView {
    if (row) {
        const hidden = row.state === 'removed';
        return {
            hexKey,
            state: row.state,
            entry: rowEntry(row),
            treeHash: hidden ? null : row.treeHash,
            baseHash: row.baseHash,
            roll: row.roll,
            rev: row.rev,
        };
    }
    if (truth) {
        return {
            hexKey,
            state: 'truth',
            entry: truth,
            treeHash: truth.tree,
            baseHash: null,
            roll: 0,
            rev: 0,
        };
    }
    return { hexKey, state: 'empty', entry: null, treeHash: null, baseHash: null, roll: 0, rev: 0 };
}
