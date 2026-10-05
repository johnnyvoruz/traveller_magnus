/**
 * What the record screens ask of the released map: a system's name and its bodies. The map
 * view holds the truth client and answers; the screens never fetch truth themselves.
 */
import type { TreeRow } from '../dossier/model.ts';

export type SystemInfo = { slug: string; hex: string; name: string; sectorName: string };

export type PlaceSource = {
    /** The system the map has selected, or the last one opened this visit. */
    current(): SystemInfo | null;
    /** A system by its hex; null when the hex holds no world or the sector cannot be read. */
    system(slug: string, hex: string): Promise<SystemInfo | null>;
    /** The system's stars, worlds and moons as the dossier lists them; null when it has no generated system. */
    bodies(slug: string, hex: string): Promise<TreeRow[] | null>;
};

let source: PlaceSource | null = null;

export function setPlaceSource(next: PlaceSource | null): void {
    source = next;
}

export function placeSource(): PlaceSource | null {
    return source;
}
