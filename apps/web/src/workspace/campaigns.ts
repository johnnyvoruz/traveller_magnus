/**
 * Several campaigns (slice_2_campaign.md K5f; design §1): the account menu lists them,
 * makes, renames, switches and deletes one. The store (campaign/store.ts) does the work;
 * this is the words and the small rules round it. Pure: it runs under Node.
 */
import { CAMPAIGN_LIMITS } from '@voyage/shared';

/** Ten universes per account (slice §0.10): the server refuses an eleventh; the menu says so first. */
export const CAMPAIGN_CAP = 10;

export type CampaignRow = { id: string; name: string };

/** A campaign's name as it may be stored: trimmed, single-spaced, cut to the limit. Empty when nothing is left. */
export function cleanCampaignName(text: string): string {
    return text.replace(/\s+/g, ' ').trim().slice(0, CAMPAIGN_LIMITS.name);
}

export function canCreate(count: number): boolean {
    return count < CAMPAIGN_CAP;
}

/** The menu's order: by name, the open one where it falls. */
export function sortCampaigns<T extends CampaignRow>(list: readonly T[]): T[] {
    return [...list].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }) || (a.id < b.id ? -1 : 1));
}

/** What a delete takes with it, said before it is done. `records` is known for the open campaign only. */
export function deleteWords(name: string, records: number | null): string {
    const what = records === null ? 'Everything in it goes with it'
        : records === 0 ? 'It has no records'
            : records === 1 ? 'Its one record goes with it'
                : 'Its ' + records + ' records go with it';
    return 'Delete ' + name + '? ' + what + '. This cannot be undone.';
}

/** A name for the next campaign that is not already taken: "My campaign", "My campaign 2", … */
export function freshName(taken: readonly string[], base = 'My campaign'): string {
    const have = new Set(taken.map((name) => name.toLowerCase()));
    if (!have.has(base.toLowerCase())) return base;
    for (let n = 2; n < 1000; n += 1) if (!have.has((base + ' ' + n).toLowerCase())) return base + ' ' + n;
    return base;
}
