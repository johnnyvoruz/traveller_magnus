import { ref } from 'vue';
import {
    CampaignChangesResult,
    type CampaignChanges,
    type CampaignEntry,
    type CampaignLink,
    type CampaignRecord,
    type CampaignSettings,
    type ClockChange,
    type EntryChange,
    type LinkChange,
    type RecordChange,
    type SettingsChange,
} from '@voyage/shared';
import { newId, onPageHide } from '../platform/browser.ts';
import { apiFetch } from '../platform/http.ts';
import { clearToasts, showToast } from '../shell/toast.ts';
import { rebuildCampaignIndex } from './index.ts';
import { rebuildJournalIndex } from './journal.ts';
import { campaign, resetCampaignState, transport } from './store.ts';

/** True while a change is queued or being sent. With `lastError`, this is saving / saved / offline. */
export const pending = ref(false);
export const lastError = ref('');

const FLUSH_MS = 800;
const RETRY_CAP_MS = 30_000;

const queuedRecords = new Map<string, RecordChange>();
const queuedLinks = new Map<string, LinkChange>();
const queuedJournal = new Map<string, EntryChange>();
let queuedSettings: SettingsChange | undefined;
let queuedClock: ClockChange | undefined;
let cancelTimer: (() => void) | null = null;
let cancelRetry: (() => void) | null = null;
let sending = false;
let attempt = 0;

export function newRecordId(): string {
    return newId('cr');
}

export function newLinkId(): string {
    return newId('cl');
}

export function newEntryId(): string {
    return newId('cj' as 'cr');
}

function rememberBase<T extends { id: string; baseRev: number }>(map: Map<string, T>, row: T): void {
    const previous = map.get(row.id);
    map.set(row.id, previous ? { ...row, baseRev: previous.baseRev } : row);
}

function applyRecord(row: RecordChange): void {
    if (!('type' in row)) {
        const existing = campaign.records[row.id];
        if (existing) existing.deleted = true;
        return;
    }
    const { baseRev, ...record } = row;
    void baseRev;
    campaign.records[record.id] = record;
}

function applyLink(row: LinkChange): void {
    if (!('kind' in row)) {
        const existing = campaign.links[row.id];
        if (existing) existing.deleted = true;
        return;
    }
    const { baseRev, ...link } = row;
    void baseRev;
    campaign.links[link.id] = link;
}

function applyEntry(row: EntryChange): void {
    if (!('kind' in row)) {
        const existing = campaign.journal[row.id];
        if (existing) existing.deleted = true;
        return;
    }
    const { baseRev, ...entry } = row;
    void baseRev;
    campaign.journal[entry.id] = entry;
}

function applySettings(row: SettingsChange): void {
    const { baseRev, ...settings } = row;
    void baseRev;
    campaign.settings = settings;
}

function applyClock(row: ClockChange): void {
    if (campaign.clock) campaign.clock.days = row.days;
    else campaign.clock = { days: row.days, rev: 0 };
}

function reindex(): void {
    const days = campaign.clock ? campaign.clock.days : null;
    rebuildCampaignIndex(campaign.records, campaign.links, days);
    rebuildJournalIndex(campaign.journal, campaign.records, days);
}

function queueHasRows(): boolean {
    return queuedRecords.size > 0 || queuedLinks.size > 0 || queuedJournal.size > 0 || queuedSettings != null || queuedClock != null;
}

function scheduleFlush(): void {
    if (cancelTimer || sending) return;
    cancelTimer = transport.schedule(() => {
        cancelTimer = null;
        void flushCampaign();
    }, FLUSH_MS);
}

function scheduleRetry(): void {
    if (cancelRetry) return;
    const ms = Math.min(FLUSH_MS * 2 ** attempt, RETRY_CAP_MS);
    attempt += 1;
    cancelRetry = transport.schedule(() => {
        cancelRetry = null;
        void flushCampaign();
    }, ms);
}

function clearTimers(): void {
    if (cancelTimer) cancelTimer();
    if (cancelRetry) cancelRetry();
    cancelTimer = null;
    cancelRetry = null;
}

function bodyOf(
    records: RecordChange[],
    links: LinkChange[],
    journal: EntryChange[],
    settings: SettingsChange | undefined,
    clock: ClockChange | undefined,
): CampaignChanges {
    const body: CampaignChanges = {};
    if (records.length) body.records = records;
    if (links.length) body.links = links;
    if (journal.length) body.journal = journal;
    if (settings) body.settings = settings;
    if (clock) body.clock = clock;
    return body;
}

/** Applies the change locally, queues it, and sends one PATCH at most every 800 ms. */
export function commit(changes: CampaignChanges): void {
    for (const row of changes.records ?? []) {
        applyRecord(row);
        rememberBase(queuedRecords, row);
    }
    for (const row of changes.links ?? []) {
        applyLink(row);
        rememberBase(queuedLinks, row);
    }
    for (const row of changes.journal ?? []) {
        applyEntry(row);
        rememberBase(queuedJournal, row);
    }
    if (changes.settings) {
        applySettings(changes.settings);
        queuedSettings = queuedSettings
            ? { ...changes.settings, baseRev: queuedSettings.baseRev }
            : changes.settings;
    }
    if (changes.clock) {
        applyClock(changes.clock);
        queuedClock = queuedClock
            ? { ...changes.clock, baseRev: queuedClock.baseRev }
            : changes.clock;
    }
    reindex();
    pending.value = true;
    scheduleFlush();
}

export async function flushCampaign(): Promise<void> {
    if (sending) return;
    if (cancelTimer) {
        cancelTimer();
        cancelTimer = null;
    }
    if (!queueHasRows()) {
        pending.value = false;
        return;
    }
    if (!campaign.universeId) {
        lastError.value = 'offline';
        return;
    }
    const records = [...queuedRecords.values()];
    const links = [...queuedLinks.values()];
    const journal = [...queuedJournal.values()];
    const settings = queuedSettings;
    const clock = queuedClock;
    queuedRecords.clear();
    queuedLinks.clear();
    queuedJournal.clear();
    queuedSettings = undefined;
    queuedClock = undefined;
    sending = true;
    pending.value = true;
    try {
        const res = await apiFetch(transport.fetch, `/api/universes/${encodeURIComponent(campaign.universeId)}/campaign/changes`, {
            method: 'PATCH',
            body: JSON.stringify(bodyOf(records, links, journal, settings, clock)),
        });
        if (!res.ok) throw new Error('offline');
        const result = CampaignChangesResult.parse((await res.json()).data);
        const handled = new Set<string>();
        let settingsHandled = false;
        let clockHandled = false;
        for (const item of result.applied) {
            handled.add(item.table + ':' + item.id);
            if (item.seq > campaign.seq) campaign.seq = item.seq;
            if (item.table === 'records' && campaign.records[item.id]) campaign.records[item.id].rev = item.rev;
            if (item.table === 'links' && campaign.links[item.id]) campaign.links[item.id].rev = item.rev;
            if (item.table === 'journal' && campaign.journal[item.id]) campaign.journal[item.id].rev = item.rev;
            if (item.table === 'settings' && campaign.settings) campaign.settings.rev = item.rev;
            if (item.table === 'settings') settingsHandled = true;
            if (item.table === 'clock' && campaign.clock) campaign.clock.rev = item.rev;
            if (item.table === 'clock') clockHandled = true;
        }
        if (result.conflicts.length) {
            for (const item of result.conflicts) {
                handled.add(item.table + ':' + item.id);
                if (item.table === 'settings') settingsHandled = true;
                if (item.table === 'clock') clockHandled = true;
                if (item.table === 'records') campaign.records[item.id] = item.current as CampaignRecord;
                if (item.table === 'links') campaign.links[item.id] = item.current as CampaignLink;
                if (item.table === 'journal') campaign.journal[item.id] = item.current as CampaignEntry;
                if (item.table === 'settings') campaign.settings = item.current as CampaignSettings;
                if (item.table === 'clock') campaign.clock = item.current;
            }
            showToast('Saved changes conflicted with a newer copy. The server copy is now shown.');
        }
        restoreUnhandled(records, links, journal, settings, clock, handled, settingsHandled, clockHandled);
        attempt = 0;
        lastError.value = '';
        reindex();
    } catch {
        restoreAll(records, links, journal, settings, clock);
        lastError.value = 'offline';
        scheduleRetry();
    } finally {
        sending = false;
        pending.value = queueHasRows();
    }
}

function restoreAll(
    records: RecordChange[],
    links: LinkChange[],
    journal: EntryChange[],
    settings: SettingsChange | undefined,
    clock: ClockChange | undefined,
): void {
    for (const row of records) if (!queuedRecords.has(row.id)) queuedRecords.set(row.id, row);
    for (const row of links) if (!queuedLinks.has(row.id)) queuedLinks.set(row.id, row);
    for (const row of journal) if (!queuedJournal.has(row.id)) queuedJournal.set(row.id, row);
    if (settings && !queuedSettings) queuedSettings = settings;
    if (clock && !queuedClock) queuedClock = clock;
}

function restoreUnhandled(
    records: RecordChange[],
    links: LinkChange[],
    journal: EntryChange[],
    settings: SettingsChange | undefined,
    clock: ClockChange | undefined,
    handled: Set<string>,
    settingsHandled: boolean,
    clockHandled: boolean,
): void {
    for (const row of records) {
        if (!handled.has('records:' + row.id) && !queuedRecords.has(row.id)) queuedRecords.set(row.id, row);
    }
    for (const row of links) {
        if (!handled.has('links:' + row.id) && !queuedLinks.has(row.id)) queuedLinks.set(row.id, row);
    }
    for (const row of journal) {
        if (!handled.has('journal:' + row.id) && !queuedJournal.has(row.id)) queuedJournal.set(row.id, row);
    }
    if (settings && !settingsHandled && !queuedSettings) queuedSettings = settings;
    if (clock && !clockHandled && !queuedClock) queuedClock = clock;
}

export function resetCampaign(): void {
    clearTimers();
    queuedRecords.clear();
    queuedLinks.clear();
    queuedJournal.clear();
    queuedSettings = undefined;
    queuedClock = undefined;
    sending = false;
    attempt = 0;
    pending.value = false;
    lastError.value = '';
    clearToasts();
    resetCampaignState();
}

onPageHide(() => { void flushCampaign(); });
