/**
 * What a record page lists from elsewhere in the campaign (manifesto: Connected): the journal
 * entries that mention the record, and the record's own rows on the timeline. Pure: it runs
 * under Node. The entries arrive in the journal's date order (entriesMentioning) and the rows
 * come from buildTimeline, so nothing here sorts again or decides what a row says.
 */
import type { CampaignEntry, CampaignEntryKind } from '@voyage/shared';
import { entryIcon, entryName, kindWord, whenText, type NameOf } from './journal/list.ts';
import type { TimelineModel, TimelineRow } from './timeline.ts';

/** How many mentioning entries the page lists before "Show all". */
export const MENTIONS_SHOWN = 20;

export type MentionRow = {
    id: string;
    kind: CampaignEntryKind;
    icon: ReturnType<typeof entryIcon>;
    title: string;
    /** The entry's own word: Session, Note, Handout, Rumour. */
    kindWord: string;
    /** DDD-YYYY, or null for an entry with no date. */
    date: string | null;
    images: NonNullable<CampaignEntry['images']> | null;
};

/** One row per live entry, in the order given. A title-less entry reads as the journal list reads it. */
export function mentionRows(entries: readonly CampaignEntry[], nameOf?: NameOf): MentionRow[] {
    const rows: MentionRow[] = [];
    for (const entry of entries) {
        if (entry.deleted) continue;
        rows.push({
            id: entry.id,
            kind: entry.kind,
            icon: entryIcon(entry.kind),
            title: entryName(entry, nameOf),
            kindWord: kindWord(entry.kind),
            date: entry.when ? whenText(entry.when) : null,
            images: entry.images ?? null,
        });
    }
    return rows;
}

/** The first MENTIONS_SHOWN rows, or all of them; `hidden` is how many "Show all" brings back. */
export function shownMentions<Row extends MentionRow>(rows: readonly Row[], all: boolean): { rows: readonly Row[]; hidden: number } {
    if (all || rows.length <= MENTIONS_SHOWN) return { rows, hidden: 0 };
    return { rows: rows.slice(0, MENTIONS_SHOWN), hidden: rows.length - MENTIONS_SHOWN };
}

export type RecordTimelineRow = {
    row: TimelineRow;
    weekday: string;
    /** The row sits on the campaign date. */
    today: boolean;
};

/**
 * This record's own rows, as the timeline lists them and in its order. A record row's id is
 * the record's id. Whatever the timeline comes to list for a record, this page lists too.
 */
export function recordTimelineRows(recordId: string, model: TimelineModel): RecordTimelineRow[] {
    const found: RecordTimelineRow[] = [];
    for (const year of model.years) {
        for (const day of year.days) {
            for (const row of day.rows) {
                if (row.source === 'record' && row.id === recordId) found.push({ row, weekday: day.weekday, today: day.today });
            }
        }
    }
    return found;
}
