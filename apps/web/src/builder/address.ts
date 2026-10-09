/**
 * Subsector address. The letter formula is the one MapView, orbit/bodies.ts and
 * packages/engines/src/core/hex.js already use: four columns of eight, four rows of ten.
 * Copied, not imported from engines: the web bundle does not import @voyage/engines.
 *
 * The route /s/:sector/sub/:letter is registered beside /s/:sector/:hex.
 * Vue Router ranks the static "sub" segment above the :hex param, so "sub" is not read as a hex.
 */
import { formatHex, parseHex } from '../map/geometry.ts';

const LETTERS = /^[A-P]$/;

/** Letter A–P for a local hex "CCRR", or null when it is not a sector hex. */
export function subsectorLetter(hhhh: string): string | null {
    const parsed = parseHex(hhhh);
    if (!parsed) return null;
    const { col, row } = parsed;
    if (col < 1 || col > 32 || row < 1 || row > 40) return null;
    return String.fromCharCode(65 + Math.floor((row - 1) / 10) * 4 + Math.floor((col - 1) / 8));
}

/** The 80 local hexes of one letter, row by row, left to right. Empty when the letter is not A–P. */
export function subsectorHexes(letter: string): string[] {
    if (!LETTERS.test(letter)) return [];
    const index = letter.charCodeAt(0) - 65;
    const col0 = (index % 4) * 8 + 1;
    const row0 = Math.floor(index / 4) * 10 + 1;
    const out: string[] = [];
    for (let row = row0; row < row0 + 10; row += 1) {
        for (let col = col0; col < col0 + 8; col += 1) out.push(formatHex(col, row));
    }
    return out;
}

/** /s/<slug>/sub/<letter>. A hand-picked set of hexes has no address. */
export function subsectorPath(slug: string, letter: string): string {
    return '/s/' + encodeURIComponent(slug) + '/sub/' + letter;
}
