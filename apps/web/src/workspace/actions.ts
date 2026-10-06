/**
 * What the record screens do to the campaign: create, edit, delete and restore. Each is one
 * commit to the store's queue (apps/web/src/campaign/commit.ts), which applies it at once and
 * sends it shortly after. A delete is a tombstone: it is undone from its toast, and for the
 * rest of the session from the list's "Recently deleted". Connections (links) are made,
 * worded and removed here too, with the same undo.
 */
import { reactive, ref } from 'vue';
import type { CampaignAnchor, CampaignRecordType } from '@voyage/shared';
import { commit, newLinkId, newRecordId } from '../campaign/commit.ts';
import { campaign } from '../campaign/store.ts';
import { showToast } from '../shell/toast.ts';
import { cleanRole, createdLink, editedLink, linksTouching, newLink, removedLink, restoredLink, type KindChoice } from './links.ts';
import { partyChange, sameParty, type Party } from './party.ts';
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
 * record's links in the same transaction and reports their new revisions, which the queue
 * writes onto the local copies; the pages leave out a link whose other end is gone.
 */
export function deleteRecord(id: string): boolean {
    const record = campaign.records[id];
    if (!record || record.deleted) return false;
    const links = linksTouching(id, campaign.links).filter((link) => !link.deleted).length;
    commit({ records: [removed(record)] });
    const at = recentlyDeleted.findIndex((item) => item.id === id);
    if (at >= 0) recentlyDeleted.splice(at, 1);
    recentlyDeleted.unshift({ id, name: record.name, type: record.type });
    const tail = links ? ' and ' + (links === 1 ? 'one connection' : links + ' connections') : '';
    showToast('Deleted ' + record.name + tail + '.', { action: { label: 'Undo', run: () => { restoreRecord(id); } } });
    return true;
}

/** Brings a deleted record back as it was, with its connections (the ruling on undo: the links go back on their current revision). */
export function restoreRecord(id: string): boolean {
    const record = campaign.records[id];
    const at = recentlyDeleted.findIndex((item) => item.id === id);
    if (at >= 0) recentlyDeleted.splice(at, 1);
    if (!record || !record.deleted) return false;
    const now = nowStamp();
    const links = linksTouching(id, campaign.links).map((link) => restoredLink(link, now));
    commit({ records: [restored(record, now)], ...(links.length ? { links } : {}) });
    return true;
}

/** A connection from this record to another, of the kind chosen, in the store at once. Returns the link's id. */
export function addLink(thisId: string, otherId: string, choice: KindChoice, role: string): string | null {
    const here = campaign.records[thisId];
    const there = campaign.records[otherId];
    if (!here || here.deleted || !there || there.deleted || thisId === otherId) return null;
    const link = newLink(newLinkId(), thisId, otherId, choice, role, nowStamp());
    commit({ links: [createdLink(link)] });
    return link.id;
}

/** The role on a connection, in the referee's words. Nothing is sent when it is unchanged. */
export function setLinkRole(linkId: string, role: string): boolean {
    const link = campaign.links[linkId];
    if (!link || link.deleted || cleanRole(role) === link.role) return false;
    commit({ links: [editedLink(link, { role }, nowStamp())] });
    return true;
}

/** Removes a connection and says so in a toast that can undo it. */
export function removeLink(linkId: string): boolean {
    const link = campaign.links[linkId];
    if (!link || link.deleted) return false;
    const from = campaign.records[link.from];
    const to = campaign.records[link.to];
    commit({ links: [removedLink(link)] });
    const words = from && to ? ' between ' + from.name + ' and ' + to.name : '';
    showToast('Removed the connection' + words + '.', { action: { label: 'Undo', run: () => { restoreLink(linkId); } } });
    return true;
}

export function restoreLink(linkId: string): boolean {
    const link = campaign.links[linkId];
    if (!link || !link.deleted) return false;
    commit({ links: [restoredLink(link, nowStamp())] });
    return true;
}

/** For sign-out and tests: the session's list is this account's only. */
export function forgetDeleted(): void {
    recentlyDeleted.splice(0, recentlyDeleted.length);
    justCreated.value = null;
}

/** The party as a whole (the settings document's party), in the store at once. Nothing is sent when it is the same. */
export function saveParty(party: Party): boolean {
    const settings = campaign.settings;
    if (!settings || sameParty(settings.party, party)) return false;
    commit({ settings: partyChange(settings, party) });
    return true;
}
