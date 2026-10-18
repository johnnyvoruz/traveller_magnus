/**
 * The journal entries a system's dossier lists (manifesto: Connected): those whose stored
 * mentions hold `hex:<hexKey>`, and those set at the hex (a system anchor, or a record anchor
 * that places there). Pure: it runs under Node. The order is the journal's date order.
 */
import type { CampaignEntry } from '@voyage/shared';
import type { NameOf } from './journal/list.ts';
import { mentionRows, type MentionRow } from './record_links.ts';

/** The mention target a journal body stores for a system. */
export function hexTarget(hexKey: string): string {
    return 'hex:' + hexKey;
}

export type HexJournalRow = MentionRow & {
    /** Why the entry is listed: it names the system, it is set there, or both. */
    why: 'mentions' | 'here' | 'both';
};

const WHY_WORDS: Record<HexJournalRow['why'], string> = {
    mentions: 'Mentions this system',
    here: 'Set here',
    both: 'Set here',
};

export function whyWords(why: HexJournalRow['why']): string {
    return WHY_WORDS[why];
}

/**
 * `byDate` is the journal in its date order; `mentioning` and `here` are the ids of the
 * entries that mention the system and that are set at it. Each entry is listed once.
 */
export function hexJournalRows(
    byDate: readonly CampaignEntry[],
    mentioning: ReadonlySet<string>,
    here: ReadonlySet<string>,
    nameOf?: NameOf,
): HexJournalRow[] {
    const listed = byDate.filter((entry) => !entry.deleted && (mentioning.has(entry.id) || here.has(entry.id)));
    return mentionRows(listed, nameOf).map((row) => {
        const names = mentioning.has(row.id);
        const set = here.has(row.id);
        return { ...row, why: names && set ? 'both' : set ? 'here' : 'mentions' };
    });
}
