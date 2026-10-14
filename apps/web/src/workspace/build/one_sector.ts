/**
 * One sector per request (contracts/b_builder.md, "One sector per request";
 * prompts/d_menu_and_job_error.md item 3). The server refuses a generate request whose hex keys
 * name two sectors, so Build says what to do instead before anything is sent. A sector is the
 * part of a hex key before the last "/"; an empty slot counts as the sector it would become.
 * Pure: runs under Node.
 */
import { parseSlot } from './sectors.ts';

export const ONE_SECTOR_HEXES = 'You can generate in one sector at a time. Select hexes inside one sector, and then select Generate.';
export const ONE_SECTOR_SLOTS = 'You can create one sector at a time. Select hexes inside one empty sector slot, and then generate. Repeat for each slot.';

/** The sectors these hex keys name, each once, in the order met. */
export function sectorsOf(keys: readonly string[]): string[] {
    const out: string[] = [];
    for (const key of keys) {
        const cut = key.lastIndexOf('/');
        const sector = cut > 0 ? key.slice(0, cut) : '';
        if (sector && !out.includes(sector)) out.push(sector);
    }
    return out;
}

/** The sentence for hexes that would be sent as two sectors; empty when the request is one sector. */
export function oneSectorSay(keys: readonly string[]): string {
    const sectors = sectorsOf(keys);
    if (sectors.length < 2) return '';
    return sectors.filter((sector) => parseSlot(sector) !== null).length > 1 ? ONE_SECTOR_SLOTS : ONE_SECTOR_HEXES;
}
