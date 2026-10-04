import { hashString } from '@voyage/engines';
import type { SectorOverview, TruthPolities } from '@voyage/shared';
import { SECTOR_ROWS, toGlobal } from './geometry.ts';
import { outlineLoops } from './outline.ts';
import { BORDER_COLOR_CYCLE } from './territories.ts';

function round3(n: number): number {
    return Number(n.toFixed(3));
}

/** outlineLoops in world parsecs, each coordinate rounded to 3 decimals. */
export function roundedLoops(hexes: { q: number; r: number }[]): number[][] {
    return outlineLoops(hexes).map(loop => loop.points.map(round3));
}

/** Table colour, otherwise a stable index into the legacy border cycle. */
export function polityColour(name: string, colours: Record<string, string>): string {
    const listed = colours[name];
    if (listed) return listed;
    return BORDER_COLOR_CYCLE[hashString(name) % BORDER_COLOR_CYCLE.length];
}

/**
 * One outline per polity name over the canonical sectors.
 * Hexes are joined in world space. Largest hex count first, then name.
 * Colour comes from the table, otherwise the legacy cycle.
 */
export function polityOutlines(sectors: SectorOverview[], colours: Record<string, string>): TruthPolities['polities'] {
    const groups = new Map<string, { name: string; hexes: { q: number; r: number }[] }>();
    for (const sector of sectors) {
        if (!sector.canonical) continue;
        for (let i = 0; i < sector.owners.length; i++) {
            const owner = sector.owners[i];
            if (owner === '.') continue;
            const polity = sector.polities[parseInt(owner, 36)];
            if (!polity) throw new Error(`polityOutlines ${sector.slug}: owner ${owner} has no polity`);
            const col = Math.floor(i / SECTOR_ROWS) + 1;
            const row = (i % SECTOR_ROWS) + 1;
            let group = groups.get(polity.name);
            if (!group) {
                group = { name: polity.name, hexes: [] };
                groups.set(polity.name, group);
            }
            group.hexes.push(toGlobal(sector.x, sector.y, col, row));
        }
    }
    const polities: TruthPolities['polities'] = [];
    for (const group of groups.values()) {
        const seen = new Set<string>();
        const unique: { q: number; r: number }[] = [];
        for (const hex of group.hexes) {
            const key = `${hex.q},${hex.r}`;
            if (seen.has(key)) continue;
            seen.add(key);
            unique.push(hex);
        }
        const loops = roundedLoops(unique);
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (const loop of loops) {
            for (let i = 0; i < loop.length; i += 2) {
                const x = loop[i];
                const y = loop[i + 1];
                if (x < minX) minX = x;
                if (y < minY) minY = y;
                if (x > maxX) maxX = x;
                if (y > maxY) maxY = y;
            }
        }
        polities.push({
            name: group.name,
            color: polityColour(group.name, colours),
            hexes: unique.length,
            box: [minX, minY, maxX, maxY],
            loops,
        });
    }
    polities.sort((a, b) => b.hexes - a.hexes || a.name.localeCompare(b.name));
    return polities;
}
