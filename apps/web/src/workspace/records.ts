/**
 * Campaign records as the screens read and change them (findings/campaign_workspace_design.md
 * §2 and §3): the nine types and their words, the list's filter and counts, and the changes a
 * screen sends (create, edit, delete, restore). Pure: it runs under Node. The store, the queue
 * and the server are apps/web/src/campaign; nothing here touches them.
 */
import { CAMPAIGN_LIMITS, CAMPAIGN_RECORD_TYPES, type CampaignRecord, type CampaignRecordType, type RecordChange } from '@voyage/shared';
import type { FaIconName } from '../design/icons.ts';

export type TypeInfo = {
    type: CampaignRecordType;
    /** "Person", and "a person" for a sentence. */
    one: string;
    a: string;
    /** "People", for the chip and the empty line. */
    many: string;
    icon: FaIconName;
};

const WORDS: Record<CampaignRecordType, [string, string, string, FaIconName]> = {
    person: ['Person', 'a person', 'People', 'user'],
    place: ['Place', 'a place', 'Places', 'location-dot'],
    business: ['Business', 'a business', 'Businesses', 'store'],
    organization: ['Organization', 'an organization', 'Organizations', 'sitemap'],
    job: ['Job', 'a job', 'Jobs', 'briefcase'],
    event: ['Event', 'an event', 'Events', 'calendar-star'],
    item: ['Item', 'an item', 'Items', 'gem'],
    note: ['Note', 'a note', 'Notes', 'note-sticky'],
    vessel: ['Vessel', 'a vessel', 'Vessels', 'shuttle-space'],
};

/** The nine types in the order the chips show them (the shared schema's order). */
export const RECORD_TYPES: readonly TypeInfo[] = CAMPAIGN_RECORD_TYPES.map((type) => ({
    type, one: WORDS[type][0], a: WORDS[type][1], many: WORDS[type][2], icon: WORDS[type][3],
}));

export function typeInfo(type: string): TypeInfo {
    return RECORD_TYPES.find((item) => item.type === type) ?? RECORD_TYPES[0];
}

export type TypeFilter = 'all' | CampaignRecordType;

/** The records that are not deleted, in no particular order. */
export function liveRecords(records: Readonly<Record<string, CampaignRecord>>): CampaignRecord[] {
    const out: CampaignRecord[] = [];
    for (const record of Object.values(records)) if (!record.deleted) out.push(record);
    return out;
}

/** How many live records each type has, and how many there are in all. */
export function typeCounts(list: readonly CampaignRecord[]): Record<TypeFilter, number> {
    const counts = { all: list.length } as Record<TypeFilter, number>;
    for (const info of RECORD_TYPES) counts[info.type] = 0;
    for (const record of list) counts[record.type] += 1;
    return counts;
}

/** True when every word typed is somewhere in the record's name, summary, details or tags. Case is ignored. */
export function matches(record: CampaignRecord, query: string): boolean {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return true;
    const hay = [record.name, record.summary, record.details, ...record.tags].join('\n').toLowerCase();
    return words.every((word) => hay.includes(word));
}

/** The list as shown: one type or all, narrowed by what is typed, by name and then by id so the order holds. */
export function filterRecords(list: readonly CampaignRecord[], filter: { type: TypeFilter; query: string }): CampaignRecord[] {
    return list
        .filter((record) => (filter.type === 'all' || record.type === filter.type) && matches(record, filter.query))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** The line under a row's summary: the type, and where the record is. Places arrive with the anchor editor (K5c). */
export function placeLine(record: CampaignRecord): string {
    const anchor = record.anchor;
    if (!anchor) return 'Nowhere in particular';
    if (anchor.kind === 'record') return 'With another record';
    const hex = anchor.hexKey.replace(/_/g, ' ').replace('/', ' ');
    return anchor.locationLabel ? hex + ' · ' + anchor.locationLabel : hex;
}

/** A name as it may be stored: trimmed, single-spaced, cut to the limit. Empty when nothing is left. */
export function cleanName(text: string): string {
    return text.replace(/\s+/g, ' ').trim().slice(0, CAMPAIGN_LIMITS.name);
}

/** A summary: one paragraph, cut to the limit. */
export function cleanSummary(text: string): string {
    return text.replace(/\s+/g, ' ').trim().slice(0, CAMPAIGN_LIMITS.summary);
}

/** Details: the text as typed with its line breaks, without trailing space, cut to the limit. */
export function cleanDetails(text: string): string {
    return text.replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').trim().slice(0, CAMPAIGN_LIMITS.details);
}

/** One tag: trimmed, single-spaced, no commas, cut to the limit. */
export function cleanTag(text: string): string {
    return text.replace(/[,\s]+/g, ' ').trim().slice(0, CAMPAIGN_LIMITS.tag);
}

/** The tags after adding one: no repeat (case ignored), never past the limit. Returns the same list when nothing changes. */
export function addTag(tags: readonly string[], text: string): string[] {
    const tag = cleanTag(text);
    if (!tag || tags.length >= CAMPAIGN_LIMITS.tags) return [...tags];
    if (tags.some((have) => have.toLowerCase() === tag.toLowerCase())) return [...tags];
    return [...tags, tag];
}

/** A new record of a type, named so it can be seen in the list until the referee names it. */
export function newRecord(type: CampaignRecordType, id: string, now: string): CampaignRecord {
    return {
        id, type, kind: '', name: 'New ' + typeInfo(type).one.toLowerCase(), summary: '', details: '', tags: [],
        anchor: null, when: null, visibility: 'referee', playerNotes: null, sheet: null, status: null, images: null,
        provenance: null, rev: 0, createdAt: now, updatedAt: now, deleted: false,
    };
}

export type RecordPatch = Partial<Pick<CampaignRecord, 'type' | 'name' | 'summary' | 'details' | 'tags'>>;

/** True when the patch would change nothing: no change is sent for it. */
export function unchanged(record: CampaignRecord, patch: RecordPatch): boolean {
    for (const key of Object.keys(patch) as (keyof RecordPatch)[]) {
        const next = patch[key];
        const have = record[key];
        if (Array.isArray(next) && Array.isArray(have)) {
            if (next.length !== have.length || next.some((item, i) => item !== have[i])) return false;
        } else if (next !== have) return false;
    }
    return true;
}

/** The change that creates a record: the whole row, based on nothing. */
export function created(record: CampaignRecord): RecordChange {
    return { ...record, baseRev: 0 };
}

/** The change that edits a record: the whole row with the patch, based on the revision held. */
export function edited(record: CampaignRecord, patch: RecordPatch, now: string): RecordChange {
    return { ...record, ...patch, tags: patch.tags ? [...patch.tags] : [...record.tags], updatedAt: now, deleted: false, baseRev: record.rev };
}

/** The change that deletes a record: a tombstone, never purged in this slice. */
export function removed(record: CampaignRecord): RecordChange {
    return { id: record.id, baseRev: record.rev, deleted: true };
}

/** The change that brings a deleted record back as it was, based on the revision held now. */
export function restored(record: CampaignRecord, now: string): RecordChange {
    return { ...record, tags: [...record.tags], updatedAt: now, deleted: false, baseRev: record.rev };
}
