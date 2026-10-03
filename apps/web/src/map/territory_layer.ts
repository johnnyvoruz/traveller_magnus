import type { SectorIndex } from '@voyage/shared';
import { parseHex, toGlobal } from './geometry.ts';
import { outlineLoops, type Loop } from './outline.ts';

export type Shape = { key: string; color: string; loops: Loop[] };

type GroupItem = { name: string; color: string; hexes?: string[] };

/**
 * Territories that share a name and a colour are one shape, including across
 * sector edges. An index with no territories array draws nothing.
 */
export function territoryShapes(indexes: SectorIndex[]): Shape[] {
    return shapesOf(indexes, 'territories');
}

/** Regions join the same way. They are filled and not stroked. */
export function regionShapes(indexes: SectorIndex[]): Shape[] {
    return shapesOf(indexes, 'regions');
}

function shapesOf(indexes: SectorIndex[], kind: 'territories' | 'regions'): Shape[] {
    const groups = new Map<string, { color: string; hexes: { q: number; r: number }[] }>();
    const order: string[] = [];
    for (const index of indexes) {
        const items = index[kind] as GroupItem[] | undefined;
        if (!items) continue;
        for (const item of items) {
            const key = item.name + '\0' + item.color;
            let group = groups.get(key);
            if (!group) {
                group = { color: item.color, hexes: [] };
                groups.set(key, group);
                order.push(key);
            }
            const hexes = item.hexes ?? [];
            for (const hhhh of hexes) {
                const local = parseHex(hhhh);
                if (!local) continue;
                group.hexes.push(toGlobal(index.x, index.y, local.col, local.row));
            }
        }
    }
    const shapes: Shape[] = [];
    for (const key of order) {
        const group = groups.get(key);
        if (!group) continue;
        const loops = outlineLoops(group.hexes);
        if (loops.length === 0) continue;
        shapes.push({ key, color: group.color, loops });
    }
    return shapes;
}
