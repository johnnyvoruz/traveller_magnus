/**
 * The omnibox's campaign group (design §6): the records that match what is typed, answered
 * from the store's word index (name, summary and tags, whole words). The last word typed is
 * usually unfinished, so it also matches the start of a word in a record's name. Pure.
 */
import type { CampaignRecord } from '@voyage/shared';
import { recordIdsForWord } from '../campaign/index.ts';
import { thumbUrl } from './images.ts';
import { placeLine, typeInfo } from './records.ts';

export type CampaignMatch = { kind: 'record'; name: string; detail: string; id: string; thumb: string | null };

export const CAMPAIGN_GROUP_CAP = 5;

function words(text: string): string[] {
    return text.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/[^0-9a-z]+/).filter(Boolean);
}

function nameStartsWith(record: CampaignRecord, prefix: string): boolean {
    return words(record.name).some((word) => word.startsWith(prefix));
}

/** The ids of the live records every typed word is in; the last word may be the start of a name's word. */
export function matchingRecordIds(query: string, records: Readonly<Record<string, CampaignRecord>>): string[] {
    const typed = words(query);
    if (!typed.length) return [];
    let found: Set<string> | null = null;
    typed.forEach((word, at) => {
        const ids = new Set(recordIdsForWord(word));
        if (at === typed.length - 1) {
            for (const record of Object.values(records)) if (!record.deleted && nameStartsWith(record, word)) ids.add(record.id);
        }
        found = found === null ? ids : new Set([...found].filter((id) => ids.has(id)));
    });
    const live = found as Set<string> | null;
    return live ? [...live].filter((id) => records[id] && !records[id].deleted) : [];
}

/** The group as the omnibox lists it: at most `cap` by name, and how many there are in all. */
export function campaignMatches(
    query: string,
    records: Readonly<Record<string, CampaignRecord>>,
    cap = CAMPAIGN_GROUP_CAP,
    universeId: string | null = null,
): { items: CampaignMatch[]; total: number } {
    const ids = matchingRecordIds(query, records);
    const rows = ids.map((id) => records[id]).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }));
    return {
        items: rows.slice(0, cap).map((record) => ({
            kind: 'record',
            name: record.name,
            detail: typeInfo(record.type).one + ' · ' + placeLine(record, records),
            id: record.id,
            thumb: thumbUrl(universeId, record),
        })),
        total: rows.length,
    };
}
