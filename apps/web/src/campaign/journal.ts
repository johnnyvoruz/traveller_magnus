/**
 * The journal on the open campaign. Entries are read here and written through commit,
 * the same road records take. Nothing in this file draws a screen.
 */
import { mentionsOf, type CampaignAnchor, type CampaignEntry, type CampaignEntryKind, type CampaignRecord } from '@voyage/shared';
import { splitDays } from '../orbit/clock.ts';
import { showToast } from '../shell/toast.ts';
import { commit, newEntryId } from './commit.ts';
import { placeAt } from './place.ts';
import { campaign } from './store.ts';

const byId = new Map<string, CampaignEntry>();
let byUpdated: CampaignEntry[] = [];
let byDate: CampaignEntry[] = [];
const atHex = new Map<string, string[]>();
const mentioning = new Map<string, string[]>();

function fill(map: Map<string, string[]>, key: string, id: string): void {
    const list = map.get(key);
    if (list) list.push(id);
    else map.set(key, [id]);
}

/** Latest edit first. Ties break on id. The journal list uses this. */
function compareUpdated(a: CampaignEntry, b: CampaignEntry): number {
    if (a.updatedAt !== b.updatedAt) return a.updatedAt < b.updatedAt ? 1 : -1;
    if (a.id < b.id) return -1;
    if (a.id > b.id) return 1;
    return 0;
}

/** Latest in-fiction date first. Undated entries follow the dated ones. Ties break on createdAt, then id. */
function compareEntries(a: CampaignEntry, b: CampaignEntry): number {
    if (a.when && b.when) {
        if (a.when.year !== b.when.year) return b.when.year - a.when.year;
        if (a.when.day !== b.when.day) return b.when.day - a.when.day;
    } else if (a.when || b.when) {
        return a.when ? -1 : 1;
    }
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
    if (a.id < b.id) return -1;
    if (a.id > b.id) return 1;
    return 0;
}

function hexOf(entry: CampaignEntry, records: Readonly<Record<string, CampaignRecord>>, days: number | null): string | null {
    const anchor = entry.anchor;
    if (!anchor) return null;
    if (anchor.kind === 'system') return anchor.hexKey;
    const place = placeAt(anchor.id, records, days);
    if (!place || place.kind !== 'here') return null;
    return place.anchor.hexKey;
}

/**
 * Rebuilds the journal bags from the live entries.
 * Called wherever the record index is rebuilt. `days` is the campaign date, or null when there is none.
 */
export function rebuildJournalIndex(
    entries: Readonly<Record<string, CampaignEntry>>,
    records: Readonly<Record<string, CampaignRecord>>,
    days: number | null,
): void {
    byId.clear();
    atHex.clear();
    mentioning.clear();
    const live = Object.values(entries).filter((entry) => !entry.deleted);
    byUpdated = live.slice().sort(compareUpdated);
    byDate = live.slice().sort(compareEntries);
    for (const entry of byDate) {
        byId.set(entry.id, entry);
        for (const target of entry.mentions) fill(mentioning, target, entry.id);
        const hex = hexOf(entry, records, days);
        if (hex) fill(atHex, hex, entry.id);
    }
}

function listed(ids: readonly string[]): CampaignEntry[] {
    const found: CampaignEntry[] = [];
    for (const id of ids) {
        const entry = byId.get(id);
        if (entry) found.push(entry);
    }
    return found;
}

function ofKind(list: readonly CampaignEntry[], kind?: CampaignEntryKind): readonly CampaignEntry[] {
    if (!kind) return list.slice();
    return list.filter((entry) => entry.kind === kind);
}

/** Live entries, latest edit first, ties by id. A kind keeps only that kind, in the same order. */
export function entriesNewestFirst(kind?: CampaignEntryKind): readonly CampaignEntry[] {
    return ofKind(byUpdated, kind);
}

/** Live entries by in-fiction date, latest first, undated last. The timeline's order. */
export function entriesByDate(kind?: CampaignEntryKind): readonly CampaignEntry[] {
    return ofKind(byDate, kind);
}

/** Live entries whose anchor is this hex: a system anchor directly, a record anchor through placeAt. */
export function entriesAtHex(hexKey: string): readonly CampaignEntry[] {
    return listed(atHex.get(hexKey) ?? []);
}

/** Live entries whose stored mentions include this record id or `hex:<hexKey>`. */
export function entriesMentioning(target: string): readonly CampaignEntry[] {
    return listed(mentioning.get(target) ?? []);
}

/** One more than the highest sequence on any session, deleted ones included. The first is 1. */
export function nextSessionNumber(): number {
    let highest = 0;
    for (const entry of Object.values(campaign.journal)) {
        if (entry.kind !== 'session' || entry.sequence == null) continue;
        if (entry.sequence > highest) highest = entry.sequence;
    }
    return highest + 1;
}

function nowStamp(): string {
    return new Date().toISOString();
}

/** The clock's year and day. The fraction is the time of day and is not part of a record's `when`. */
function whenOfClock(): { year: number; day: number } | null {
    const clock = campaign.clock;
    if (!clock) return null;
    const split = splitDays(clock.days);
    return { year: split.year, day: Math.floor(split.day) };
}

function localDate(now: Date): string {
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return now.getFullYear() + '-' + month + '-' + day;
}

/** The party's place: the vessel through placeAt, else the party's own anchor. */
function partyAnchor(): CampaignAnchor {
    const settings = campaign.settings;
    if (!settings) return null;
    const party = settings.party;
    const days = campaign.clock ? campaign.clock.days : null;
    if (party.vesselId) {
        const vessel = campaign.records[party.vesselId];
        if (vessel && !vessel.deleted && vessel.type === 'vessel') {
            const place = placeAt(vessel.id, campaign.records, days);
            if (place && place.kind === 'here') return place.anchor;
        }
    }
    return party.anchor;
}

function blank(kind: CampaignEntryKind, stamp: string): CampaignEntry {
    return {
        id: newEntryId(),
        kind,
        title: '',
        body: '',
        when: null,
        realDate: null,
        sequence: null,
        author: 'referee',
        visibility: 'referee',
        anchor: null,
        mentions: [],
        rev: 0,
        createdAt: stamp,
        updatedAt: stamp,
        deleted: false,
    };
}

/** A session ready to commit: the next number, today's date, and the party's place. This does not commit. */
export function draftSession(): CampaignEntry {
    const now = new Date();
    const stamp = now.toISOString();
    const sequence = nextSessionNumber();
    return {
        ...blank('session', stamp),
        title: 'Session ' + sequence,
        when: whenOfClock(),
        realDate: localDate(now),
        sequence,
        anchor: partyAnchor(),
    };
}

/** A note ready to commit: no title, no dates, no anchor. This does not commit. */
export function draftNote(): CampaignEntry {
    return blank('note', nowStamp());
}

function open(): boolean {
    return campaign.status === 'ready';
}

/** Writes the entry. Mentions come from the body. The baseRev is the revision held, or 0 for a new row. */
export function saveEntry(entry: CampaignEntry): boolean {
    if (!open()) return false;
    const stored = campaign.journal[entry.id];
    const now = nowStamp();
    const next: CampaignEntry = {
        ...entry,
        mentions: mentionsOf(entry.body),
        createdAt: stored ? stored.createdAt : entry.createdAt,
        updatedAt: now,
        rev: stored ? stored.rev : 0,
        deleted: false,
    };
    commit({ journal: [{ ...next, baseRev: stored ? stored.rev : 0 }] });
    return true;
}

/** Tombstones an entry. Undo is the toast, as a record's delete is. */
export function deleteEntry(id: string): boolean {
    if (!open()) return false;
    const entry = campaign.journal[id];
    if (!entry || entry.deleted) return false;
    commit({ journal: [{ id, baseRev: entry.rev, deleted: true }] });
    const label = entry.title ? entry.title : 'the entry';
    showToast('Deleted ' + label + '.', { action: { label: 'Undo', run: () => { restoreEntry(id); } } });
    return true;
}

/** Brings a deleted entry back as it was, on the revision held now. */
export function restoreEntry(id: string): boolean {
    if (!open()) return false;
    const entry = campaign.journal[id];
    if (!entry || !entry.deleted) return false;
    commit({
        journal: [{
            ...entry,
            mentions: [...entry.mentions],
            updatedAt: nowStamp(),
            deleted: false,
            baseRev: entry.rev,
        }],
    });
    return true;
}
