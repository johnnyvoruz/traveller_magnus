/**
 * The referee's own sectors on the chart (findings/builder_system_design.md §15 and §16;
 * directives/prompts/builder_step3.md part 1). A sector of theirs is an id that is not its
 * slot (`~` and 26 characters, findings/builder_sector_ready.md); an empty slot is addressed
 * by where it is. Everything here is pure and runs under Node: the list laid into the
 * chart's manifest so the map draws it, the empty index the map reads for it, and the words.
 */
import { SUBSECTOR_LETTERS } from '@voyage/shared/sector_core';
import type { SectorIndex, TruthManifest } from '@voyage/shared';
import type { OwnSector, Slot } from './seam.ts';

/** The longest name the server stores for a sector or a subsector. */
export const NAME_MAX = 80;

const OWN = /^~[0-9A-HJKMNP-TV-Z]{26}$/;
const SLOT = /^~slot_(-?\d{1,4})_(-?\d{1,4})$/;

/** A sector the referee made, by its id. */
export function isOwnSlug(slug: string): boolean {
    return OWN.test(slug);
}

/** An empty slot's place in an address: `/s/~slot_3_-1`. It can never be a chart slug or a sector's id. */
export function slotSlug(slot: Slot): string {
    return '~slot_' + slot.x + '_' + slot.y;
}

export function parseSlot(slug: string): Slot | null {
    const found = SLOT.exec(slug);
    return found ? { x: Number(found[1]), y: Number(found[2]) } : null;
}

export function sameSlot(a: Slot | null, b: Slot | null): boolean {
    return a !== null && b !== null && a.x === b.x && a.y === b.y;
}

type ChartSectors = { sectors: readonly { slug: string; name: string; x: number; y: number }[] };

/** What stands in a slot: a charted sector, one of the referee's, or nothing. */
export function slotHolder(chart: ChartSectors | null, own: readonly OwnSector[], slot: Slot): { kind: 'chart' | 'own'; slug: string; name: string } | null {
    for (const sector of own) if (sector.slot.x === slot.x && sector.slot.y === slot.y) return { kind: 'own', slug: sector.id, name: sector.name };
    if (chart) for (const sector of chart.sectors) if (sector.x === slot.x && sector.y === slot.y && !isOwnSlug(sector.slug)) return { kind: 'chart', slug: sector.slug, name: sector.name };
    return null;
}

/**
 * The chart's manifest with the referee's sectors added as sectors of the drawn layer, so the
 * map draws each one's grid and name and a hex in it has a place. With none, the chart's own
 * object is returned.
 */
export function withOwn(manifest: TruthManifest, own: readonly OwnSector[]): TruthManifest {
    if (own.length === 0) return manifest;
    const added = own.map((sector) => ({
        slug: sector.id,
        name: sector.name,
        x: sector.slot.x,
        y: sector.slot.y,
        tags: [],
        canonical: true,
        systems: 0,
        built: 0,
        partial: 0,
        indexHash: '',
    }));
    return { ...manifest, sectors: [...manifest.sectors, ...added] };
}

/** The index the map reads for a sector of the referee's: no chart hexes, and the names they gave its subsectors. */
export function ownIndex(sector: OwnSector, truthVersion: string): SectorIndex {
    const names: Record<string, string> = {};
    SUBSECTOR_LETTERS.forEach((letter, at) => {
        const name = sector.subsectors[at];
        if (name) names[letter] = name;
    });
    return {
        slug: sector.id,
        name: sector.name,
        x: sector.slot.x,
        y: sector.slot.y,
        tags: [],
        canonical: true,
        truthVersion,
        systems: 0,
        built: 0,
        partial: 0,
        hexes: {},
        metadata: { routes: [], borders: [], names, allegiances: [] },
        territories: [],
        regions: [],
    };
}

/** The name the referee gave a subsector, or empty when it has none of its own. */
export function subsectorOwnName(sector: OwnSector, letter: string): string {
    const at = (SUBSECTOR_LETTERS as readonly string[]).indexOf(letter);
    return at >= 0 ? sector.subsectors[at] ?? '' : '';
}

/** Where an empty slot is, said by what stands beside it; by its numbers when nothing does. */
export function slotWords(chart: ChartSectors | null, own: readonly OwnSector[], slot: Slot): string {
    const beside: [number, number, string][] = [
        [-1, 0, 'Right of '],
        [1, 0, 'Left of '],
        [0, -1, 'Below '],
        [0, 1, 'Above '],
    ];
    for (const [dx, dy, words] of beside) {
        const holder = slotHolder(chart, own, { x: slot.x + dx, y: slot.y + dy });
        if (holder) return words + holder.name;
    }
    return 'Slot ' + slot.x + ', ' + slot.y;
}

/** The empty slots inside a block of slots, row by row, at most `cap`: where a sector may be made or moved to. */
export function freeSlots(chart: ChartSectors | null, own: readonly OwnSector[], from: Slot, to: Slot, cap = 80): Slot[] {
    const taken = new Set<string>();
    if (chart) for (const sector of chart.sectors) taken.add(sector.x + ',' + sector.y);
    for (const sector of own) taken.add(sector.slot.x + ',' + sector.slot.y);
    const out: Slot[] = [];
    for (let y = Math.min(from.y, to.y); y <= Math.max(from.y, to.y); y += 1) {
        for (let x = Math.min(from.x, to.x); x <= Math.max(from.x, to.x); x += 1) {
            if (taken.has(x + ',' + y)) continue;
            out.push({ x, y });
            if (out.length >= cap) return out;
        }
    }
    return out;
}

/** A typed name as it is sent: trimmed, and null when there is nothing to send or it is too long. */
export function cleanName(text: string): string | null {
    const name = text.replace(/\s+/g, ' ').trim();
    return name.length > 0 && name.length <= NAME_MAX ? name : null;
}

// ---- §18: growing past the chart by selecting hexes in an empty slot -----------------------------

/** The empty slots a selection reaches into, in the order first picked, with how many of its hexes each holds and the subsectors they fall in. */
export function slotGroups(keys: readonly string[]): { slug: string; slot: Slot; count: number; letters: string[] }[] {
    const out = new Map<string, { slug: string; slot: Slot; count: number; letters: string[] }>();
    for (const key of keys) {
        const cut = key.lastIndexOf('/');
        const slug = cut > 0 ? key.slice(0, cut) : '';
        const slot = parseSlot(slug);
        if (!slot) continue;
        const hex = key.slice(cut + 1);
        const col = Number(hex.slice(0, 2));
        const row = Number(hex.slice(2));
        const letter = SUBSECTOR_LETTERS[Math.floor((row - 1) / 10) * 4 + Math.floor((col - 1) / 8)] ?? '';
        const held = out.get(slug) ?? { slug, slot, count: 0, letters: [] };
        held.count += 1;
        if (letter && !held.letters.includes(letter)) held.letters.push(letter);
        out.set(slug, held);
    }
    return [...out.values()];
}

/** The same hexes once each slot has its sector: a slot's hex key takes the new sector's id. */
export function slotKeysToSectors(keys: readonly string[], made: Readonly<Record<string, string>>): string[] {
    return keys.map((key) => {
        const cut = key.lastIndexOf('/');
        const id = cut > 0 ? made[key.slice(0, cut)] : undefined;
        return id ? id + key.slice(cut) : key;
    });
}

/** "Subsector F, unnamed", or "Subsectors A and B, unnamed". A sector made here always has its sixteen; none is made on its own. */
export function subsectorWords(letters: readonly string[]): string {
    if (letters.length === 0) return '';
    if (letters.length === 1) return 'Subsector ' + letters[0] + ', unnamed';
    return 'Subsectors ' + letters.slice(0, -1).join(', ') + ' and ' + letters[letters.length - 1] + ', unnamed';
}
