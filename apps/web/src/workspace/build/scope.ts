/**
 * A sector or a subsector as what Build has selected (findings/builder_system_design.md §5):
 * the hexes it holds, and the sixteen subsectors of a sector as a grid to climb down by.
 * A subsector is eighty hexes with an address; a sector is all sixteen. Pure: runs under Node.
 */
import { subsectorHexes } from '../../builder/address.ts';

/** `letter` null is the whole sector. */
export type Scope = { slug: string; letter: string | null };

export const SUBSECTOR_LETTERS: readonly string[] = 'ABCDEFGHIJKLMNOP'.split('');

/** Every hex of the scope as a key, subsector by subsector, each row by row. Empty for a letter that is not A to P. */
export function scopeKeys(scope: Scope): string[] {
    const letters = scope.letter === null ? SUBSECTOR_LETTERS : [scope.letter];
    const out: string[] = [];
    for (const letter of letters) for (const hex of subsectorHexes(letter)) out.push(scope.slug + '/' + hex);
    return out;
}

export type SubsectorCell = { letter: string; name: string };

/** The sixteen subsectors in chart order (four across), each with the name the chart gives it. */
export function subsectorCells(slug: string, nameAt: (hexKey: string) => string): SubsectorCell[] {
    return SUBSECTOR_LETTERS.map((letter) => {
        const first = subsectorHexes(letter)[0];
        return { letter, name: nameAt(slug + '/' + first) || 'Subsector ' + letter };
    });
}

/** The pane's title for a scope: the subsector's name, or the sector's. */
export function scopeTitle(scope: Scope, sectorName: string, nameAt: (hexKey: string) => string): string {
    if (scope.letter === null) return sectorName;
    const first = subsectorHexes(scope.letter)[0];
    return first ? nameAt(scope.slug + '/' + first) || 'Subsector ' + scope.letter : sectorName;
}
