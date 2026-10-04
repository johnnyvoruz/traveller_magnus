/**
 * The orbit view's body list and its paths. Bodies are named by the dossier's keys
 * (s<i>, w<i>, w<i>m<j>; dossier/model.ts bodyKeys): this file defines no second scheme, it
 * groups the dossier's system-tree rows into chips.
 */
import type { BodyGlyphData, TreeRow } from '../dossier/model.ts';

export type BodyChip = {
    key: string;
    /** The body's name with the system's name taken off the front, as the legacy scan label does. */
    label: string;
    name: string;
    glyph: BodyGlyphData;
    mainworld: boolean;
    /** Moons of this world, in the tree's order. Empty for stars. */
    moons: BodyChip[];
};

/**
 * _scanLabel (js/system_viewer.js:2100-2103): the name with the system name prefix removed.
 * "Regina A-II" in the Regina system is "A-II"; a body named exactly as the system keeps its name.
 */
export function shortLabel(name: string, systemName: string): string {
    return systemName && name.startsWith(systemName + ' ') ? name.slice(systemName.length + 1) : name;
}

function chipOf(row: TreeRow, systemName: string): BodyChip {
    return {
        key: row.key,
        label: shortLabel(row.name, systemName),
        name: row.name,
        glyph: row.glyph,
        mainworld: row.tag !== '',
        moons: [],
    };
}

/**
 * One chip per star and world, in the tree's order (stars, then worlds by orbit), each world
 * carrying its moons. The tree lists a world's moons straight after it, flagged `moon`.
 */
export function bodyChips(rows: readonly TreeRow[], systemName: string): BodyChip[] {
    const chips: BodyChip[] = [];
    for (const row of rows) {
        const chip = chipOf(row, systemName);
        const parent = chips[chips.length - 1];
        if (row.moon && parent) parent.moons.push(chip);
        else chips.push(chip);
    }
    return chips;
}

/** The chip that is, or holds, the selected body. Null when nothing is selected or the key is unknown. */
export function chipHolding(chips: readonly BodyChip[], key: string | null): BodyChip | null {
    if (!key) return null;
    for (const chip of chips) {
        if (chip.key === key) return chip;
        for (const moon of chip.moons) if (moon.key === key) return chip;
    }
    return null;
}

export function findChip(chips: readonly BodyChip[], key: string | null): BodyChip | null {
    if (!key) return null;
    for (const chip of chips) {
        if (chip.key === key) return chip;
        for (const moon of chip.moons) if (moon.key === key) return moon;
    }
    return null;
}

/** /s/<sector>/<hex>: the map with this system's dossier, or one body's dossier. */
export function dossierPath(slug: string, hex: string, body: string | null = null): string {
    const base = '/s/' + encodeURIComponent(slug) + '/' + hex;
    return body ? base + '/b/' + encodeURIComponent(body) : base;
}

/** /s/<sector>/<hex>/orbit: the orbit view, with a body selected when given. */
export function orbitPath(slug: string, hex: string, body: string | null = null): string {
    const base = dossierPath(slug, hex) + '/orbit';
    return body ? base + '/b/' + encodeURIComponent(body) : base;
}

/** Subsector letter A–P of a hex "CCRR": four columns of eight hexes, four rows of ten. */
export function subsectorLetter(hex: string): string {
    const col = Number(hex.slice(0, 2));
    const row = Number(hex.slice(2, 4));
    if (!Number.isInteger(col) || !Number.isInteger(row) || col < 1 || col > 32 || row < 1 || row > 40) return '';
    return String.fromCharCode(65 + Math.floor((row - 1) / 10) * 4 + Math.floor((col - 1) / 8));
}
