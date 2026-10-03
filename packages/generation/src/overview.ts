import type { SectorIndex, SectorOverview } from '@voyage/shared';

/**
 * One character per hex. The character is the first character of the chart UWP.
 * A dot in that position is written as '?' so an empty hex stays '.'.
 */
export function sectorOverview(index: SectorIndex): SectorOverview {
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
        polities: index.territories.map(territory => ({ name: territory.name, color: territory.color })),
        owners: owners.join(''),
    };
}
