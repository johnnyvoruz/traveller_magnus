import type { SectorIndex, SectorOverview } from '@voyage/shared';
import { polityColour } from './polities.ts';

/**
 * One character per hex. The character is the first character of the chart UWP.
 * A dot in that position is written as '?' so an empty hex stays '.'.
 */
/** Column is `floor(i / 40) + 1`, row is `(i % 40) + 1`. The same index `sectorOverview` writes. */
export function dotIndex(local: string): number | null {
    if (!/^\d{4}$/.test(local)) return null;
    const col = Number(local.slice(0, 2));
    const row = Number(local.slice(2, 4));
    if (col < 1 || col > 32 || row < 1 || row > 40) return null;
    return (col - 1) * 40 + (row - 1);
}

/** A held system. A dot or an empty profile becomes `?`, which still draws. */
export function dotMark(uwp: string | null | undefined): string {
    if (typeof uwp === 'string' && uwp.length > 0 && uwp[0] !== '.') return uwp[0];
    return '?';
}

/**
 * Chart cells, then the referee's rows.
 * A held row sets the cell. A removed row clears it. No row keeps the chart character.
 * No chart (a sector of their own, or a slug the overview does not list) starts as 1,280 dots.
 */
export function applyDotRows(
    chart: string | null,
    rows: { local: string; holds: boolean; uwp?: string | null }[],
): string {
    const cells = (chart && chart.length === 1280 ? chart : '.'.repeat(1280)).split('');
    for (const row of rows) {
        const index = dotIndex(row.local);
        if (index == null) continue;
        cells[index] = row.holds ? dotMark(row.uwp) : '.';
    }
    return cells.join('');
}

export function sectorOverview(index: SectorIndex, colours: Record<string, string>): SectorOverview {
    if (index.territories.length > 36) {
        throw new Error(`sectorOverview ${index.slug}: more than 36 territories`);
    }
    const cells = new Array<string>(1280).fill('.');
    const owners = new Array<string>(1280).fill('.');
    for (let i = 0; i < index.territories.length; i++) {
        const digit = i.toString(36);
        for (const hex of index.territories[i].hexes) {
            const col = Number(hex.slice(0, 2));
            const row = Number(hex.slice(2, 4));
            owners[(col - 1) * 40 + (row - 1)] = digit;
        }
    }
    for (const [hex, entry] of Object.entries(index.hexes)) {
        const uwp = entry.uwp;
        if (typeof uwp !== 'string' || uwp.length === 0) {
            throw new Error(`sectorOverview ${index.slug}: hex ${hex} has no UWP`);
        }
        const col = Number(hex.slice(0, 2));
        const row = Number(hex.slice(2, 4));
        const ch = uwp[0] === '.' ? '?' : uwp[0];
        cells[(col - 1) * 40 + (row - 1)] = ch;
    }
    return {
        slug: index.slug,
        name: index.name,
        x: index.x,
        y: index.y,
        tags: index.tags,
        canonical: index.canonical,
        systems: index.systems,
        cells: cells.join(''),
        polities: index.territories.map(territory => ({ name: territory.name, color: polityColour(territory.name, colours) })),
        owners: owners.join(''),
    };
}
