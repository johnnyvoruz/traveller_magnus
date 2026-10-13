/**
 * Overview dots for one sector: 1,280 characters, column then row,
 * the same index as the published overview.
 * `.` is empty. Any other character is a system, drawn like a charted one.
 */

export const DOT_CELLS = 1280;
export const DOT_PAGE = 32;

/** Index of a local hex `CCRR`, or null when it is not in a sector. */
export function cellIndex(local: string): number | null {
    if (!/^\d{4}$/.test(local)) return null;
    const col = Number(local.slice(0, 2));
    const row = Number(local.slice(2, 4));
    if (col < 1 || col > 32 || row < 1 || row > 40) return null;
    return (col - 1) * 40 + (row - 1);
}

/** One cell changed. The same character comes back as the same string. */
export function patchCells(cells: string, local: string, ch: string): string {
    const at = cellIndex(local);
    if (at === null || cells.length !== DOT_CELLS || ch.length !== 1) return cells;
    if (cells.charAt(at) === ch) return cells;
    return cells.slice(0, at) + ch + cells.slice(at + 1);
}

/** The character a held row draws. A removed row is empty. A blank profile is `?`. */
export function dotCharOf(uwp: string | null | undefined, removed: boolean): string {
    if (removed) return '.';
    const ch = uwp ? uwp.charAt(0) : '';
    if (!ch || ch === '.') return '?';
    return ch;
}

/** Sectors on screen, in pages of 32, in the order given. */
export function dotPages(slugs: readonly string[]): string[][] {
    const out: string[][] = [];
    for (let i = 0; i < slugs.length; i += DOT_PAGE) out.push(slugs.slice(i, i + DOT_PAGE));
    return out;
}
