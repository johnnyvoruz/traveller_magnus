import type { SectorOverview, TruthPolities } from '@voyage/shared';
import { SECTOR_ROWS, toGlobal } from './geometry.ts';
import { outlineLoops } from './outline.ts';

function round3(n: number): number {
    return Number(n.toFixed(3));
}

/** outlineLoops in world parsecs, each coordinate rounded to 3 decimals. */
export function roundedLoops(hexes: { q: number; r: number }[]): number[][] {
    return outlineLoops(hexes).map(loop => loop.points.map(round3));
}

/**
 * One outline per distinct name and colour over the canonical sectors.
 * Hexes are joined in world space. Largest hex count first, then name.
 */
export function polityOutlines(sectors: SectorOverview[]): TruthPolities['polities'] {
    const groups = new Map<string, { name: string; color: string; hexes: { q: number; r: number }[] }>();
    for (const sector of sectors) {
        if (!sector.canonical) continue;
        for (let i = 0; i < sector.owners.length; i++) {
            const owner = sector.owners[i];
            if (owner === '.') continue;
            const polity = sector.polities[parseInt(owner, 36)];
            if (!polity) throw new Error(`polityOutlines ${sector.slug}: owner ${owner} has no polity`);
            const col = Math.floor(i / SECTOR_ROWS) + 1;
            const row = (i % SECTOR_ROWS) + 1;
            const key = `${polity.name}\0${polity.color}`;
            let group = groups.get(key);
            if (!group) {
                group = { name: polity.name, color: polity.color, hexes: [] };
                groups.set(key, group);
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
            color: group.color,
            hexes: unique.length,
            box: [minX, minY, maxX, maxY],
            loops,
        });
    }
    polities.sort((a, b) => b.hexes - a.hexes || a.name.localeCompare(b.name));
    return polities;
}
