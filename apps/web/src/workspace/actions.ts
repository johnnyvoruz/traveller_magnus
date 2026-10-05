/**
 * What the record screens do to the campaign: create, edit, delete and restore. Each is one
 * commit to the store's queue (apps/web/src/campaign/commit.ts), which applies it at once and
 * sends it shortly after. A delete is a tombstone: it is undone from its toast, and for the
 * rest of the session from the list's "Recently deleted".
 */
import { reactive, ref } from 'vue';
import type { CampaignAnchor, CampaignRecordType } from '@voyage/shared';
import { commit, newRecordId } from '../campaign/commit.ts';
import { campaign } from '../campaign/store.ts';
import { showToast } from '../shell/toast.ts';
import { created, edited, newRecord, removed, restored, unchanged, type RecordPatch } from './records.ts';

/** The record just created: its page opens with the name ready to be typed over. */
export const justCreated = ref<string | null>(null);

export type Gone = { id: string; name: string; type: CampaignRecordType };

/** This session's deletes, newest first. It is not saved anywhere: the tombstones are. */
export const recentlyDeleted = reactive<Gone[]>([]);

function nowStamp(): string {
    return new Date().toISOString();
}

/** A new record of the type, in the store at once, at a place when one is given. Returns its id. */
export function createRecord(type: CampaignRecordType, anchor: CampaignAnchor = null): string {
    const record = newRecord(type, newRecordId(), nowStamp(), anchor);
    commit({ records: [created(record)] });
    justCreated.value = record.id;
    return record.id;
}

/** Saves a change to a record. Nothing is sent when the patch changes nothing. */
export function saveRecord(id: string, patch: RecordPatch): boolean {
    const record = campaign.records[id];
    if (!record || record.deleted || unchanged(record, patch)) return false;
    commit({ records: [edited(record, patch, nowStamp())] });
    return true;
}

/**
 * Deletes a record and says so in a toast that can undo it. The server tombstones the
 * record's links in the same transaction; the screens that show links (K5d) are where their
 * local copies and their return on undo are handled.
 */
export function deleteRecord(id: string): boolean {
    const record = campaign.records[id];
    if (!record || record.deleted) return false;
    commit({ records: [removed(record)] });
    const at = recentlyDeleted.findIndex((item) => item.id === id);
    if (at >= 0) recentlyDeleted.splice(at, 1);
    recentlyDeleted.unshift({ id, name: record.name, type: record.type });
    showToast('Deleted ' + record.name + '.', { action: { label: 'Undo', run: () => { restoreRecord(id); } } });
    return true;
}

/** Brings a deleted record back as it was. */
export function restoreRecord(id: string): boolean {
    const record = campaign.records[id];
    const at = recentlyDeleted.findIndex((item) => item.id === id);
    if (at >= 0) recentlyDeleted.splice(at, 1);
    if (!record || !record.deleted) return false;
    commit({ records: [restored(record, nowStamp())] });
    return true;
}

/** For sign-out and tests: the session's list is this account's only. */
export function forgetDeleted(): void {
    recentlyDeleted.splice(0, recentlyDeleted.length);
    justCreated.value = null;
}
