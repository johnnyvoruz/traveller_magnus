import type { TruthManifest, TruthOverview } from '@voyage/shared';
import { SECTOR_ROWS, toGlobal } from './geometry.ts';

export type PolityHexes = {
    key: string;
    name: string;
    color: string;
    hexes: { q: number; r: number }[];
};

type LooseSector = {
    slug?: string;
    x?: number;
    y?: number;
    polities?: { name: string; color: string }[];
    owners?: string;
};

/**
 * One entry per name and colour on the drawn layer. owners is one character
 * per hex, '.' or a base-36 digit into polities, indexed like cells.
 * An overview without owners draws nothing.
 */
export function polityHexes(
    overview: TruthOverview,
    layer: 'canonical' | 'all',
    manifest: TruthManifest,
): PolityHexes[] {
    const allowed = new Set<string>();
    for (const sector of manifest.sectors) {
        if (layer === 'canonical' && !sector.canonical) continue;
        allowed.add(sector.slug);
    }
    const groups = new Map<string, PolityHexes>();
    const sectors = overview.sectors as LooseSector[];
    for (const sector of sectors) {
        if (!sector.slug || !allowed.has(sector.slug)) continue;
        const owners = sector.owners;
        const polities = sector.polities;
        if (typeof owners !== 'string' || !polities) continue;
        const sx = sector.x ?? 0;
        const sy = sector.y ?? 0;
        for (let i = 0; i < owners.length; i++) {
            const index = digitOf(owners.charAt(i));
            if (index === null) continue;
            const polity = polities[index];
            if (!polity) continue;
            const key = polity.name + '\0' + polity.color;
            let group = groups.get(key);
            if (!group) {
                group = { key, name: polity.name, color: polity.color, hexes: [] };
                groups.set(key, group);
            }
            const col = Math.floor(i / SECTOR_ROWS) + 1;
            const row = (i % SECTOR_ROWS) + 1;
            group.hexes.push(toGlobal(sx, sy, col, row));
        }
    }
    return [...groups.values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/** '0'-'9' then 'a'-'z', the encoding sectorOverview writes. */
function digitOf(ch: string): number | null {
    const code = ch.charCodeAt(0);
    if (code >= 48 && code <= 57) return code - 48;
    if (code >= 97 && code <= 122) return code - 97 + 10;
    return null;
}
