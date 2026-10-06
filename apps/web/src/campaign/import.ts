/**
 * Restores a campaign export into the open campaign when that campaign is empty.
 * Ids and image hashes stay as they are. The image files are not uploaded.
 * Records go first, then links, then settings, then the clock.
 * Each PATCH stays within the campaign row and byte limits, and each one is
 * flushed before the next is queued.
 */
import {
    CAMPAIGN_LIMITS,
    CampaignClock,
    CampaignLink,
    CampaignRecord,
    CampaignSettings,
    Universe,
    type CampaignChanges,
    type ClockChange,
    type LinkChange,
    type RecordChange,
    type SettingsChange,
} from '@voyage/shared';
import { commit, flushCampaign, lastError, pending } from './commit.ts';
import { campaign } from './store.ts';

/** The export's universe is the id, name, and truth version. The rest of Universe is not in the file. */
const UniverseExport = Universe.pick({
    id: true,
    name: true,
    truthVersion: true,
}).strict();
const RecordsExport = CampaignRecord.array();
const LinksExport = CampaignLink.array();
const ClockExport = CampaignClock.nullable();

export type CampaignExport = {
    universe: { id: string; name: string; truthVersion: string | null };
    exportedAt: string;
    records: CampaignRecord[];
    links: CampaignLink[];
    settings: CampaignSettings;
    clock: CampaignClock | null;
};

export type ParseResult =
    | { ok: true; document: CampaignExport }
    | { ok: false; message: string };

export type ImportResult =
    | { ok: true; landed: number }
    | { ok: false; message: string; landed: number };

const NOT_JSON = 'The file is not JSON.';
const NOT_OPEN = 'That campaign is not open.';
const NOT_EMPTY = 'That campaign is not empty.';
const NOT_SAVED = 'The next batch did not save.';
const TOO_LARGE = 'A row is over the update limit.';

const DOCUMENT_KEYS = ['universe', 'exportedAt', 'records', 'links', 'settings', 'clock'];
const EXPORTED_AT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

function received(value: unknown): string {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    return typeof value;
}

function faultOf(prefix: string, issues: { path: (string | number)[]; message: string }[]): string {
    const issue = issues[0];
    const path = [prefix, ...issue.path.map(String)].filter((part) => part !== '').join('.');
    return path ? `${path}: ${issue.message}` : issue.message;
}

function plainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Reads an export file. A bad file returns one message, naming the first fault. */
export function parseExport(text: string): ParseResult {
    let json: unknown;
    try {
        json = JSON.parse(text);
    } catch {
        return { ok: false, message: NOT_JSON };
    }
    if (!plainObject(json)) return { ok: false, message: `Expected object, received ${received(json)}` };
    for (const key of Object.keys(json)) {
        if (!DOCUMENT_KEYS.includes(key)) {
            return { ok: false, message: `Unrecognized key(s) in object: '${key}'` };
        }
    }
    if (!Object.prototype.hasOwnProperty.call(json, 'universe')) return { ok: false, message: 'universe: Required' };
    const universe = UniverseExport.safeParse(json.universe);
    if (!universe.success) return { ok: false, message: faultOf('universe', universe.error.issues) };
    if (!Object.prototype.hasOwnProperty.call(json, 'exportedAt')) return { ok: false, message: 'exportedAt: Required' };
    if (typeof json.exportedAt !== 'string' || !EXPORTED_AT.test(json.exportedAt)) {
        return {
            ok: false,
            message: typeof json.exportedAt === 'string'
                ? 'exportedAt: Invalid datetime'
                : `exportedAt: Expected string, received ${received(json.exportedAt)}`,
        };
    }
    if (!Object.prototype.hasOwnProperty.call(json, 'records')) return { ok: false, message: 'records: Required' };
    const records = RecordsExport.safeParse(json.records);
    if (!records.success) return { ok: false, message: faultOf('records', records.error.issues) };
    if (!Object.prototype.hasOwnProperty.call(json, 'links')) return { ok: false, message: 'links: Required' };
    const links = LinksExport.safeParse(json.links);
    if (!links.success) return { ok: false, message: faultOf('links', links.error.issues) };
    if (!Object.prototype.hasOwnProperty.call(json, 'settings')) return { ok: false, message: 'settings: Required' };
    const settings = CampaignSettings.safeParse(json.settings);
    if (!settings.success) return { ok: false, message: faultOf('settings', settings.error.issues) };
    if (!Object.prototype.hasOwnProperty.call(json, 'clock')) return { ok: false, message: 'clock: Required' };
    const clock = ClockExport.safeParse(json.clock);
    if (!clock.success) return { ok: false, message: faultOf('clock', clock.error.issues) };
    return {
        ok: true,
        document: {
            universe: universe.data,
            exportedAt: json.exportedAt,
            records: records.data,
            links: links.data,
            settings: settings.data,
            clock: clock.data,
        },
    };
}

type Batch = {
    records: RecordChange[];
    links: LinkChange[];
    settings?: SettingsChange;
    clock?: ClockChange;
};

function emptyBatch(): Batch {
    return { records: [], links: [] };
}

function toChanges(batch: Batch): CampaignChanges {
    const patch: CampaignChanges = {};
    if (batch.records.length > 0) patch.records = batch.records;
    if (batch.links.length > 0) patch.links = batch.links;
    if (batch.settings) patch.settings = batch.settings;
    if (batch.clock) patch.clock = batch.clock;
    return patch;
}

function rowCount(batch: Batch): number {
    return batch.records.length + batch.links.length + (batch.settings ? 1 : 0) + (batch.clock ? 1 : 0);
}

function byteSize(patch: CampaignChanges): number {
    return new TextEncoder().encode(JSON.stringify(patch)).length;
}

function withItem(batch: Batch, item: RecordChange | LinkChange | SettingsChange | ClockChange, kind: 'record' | 'link' | 'settings' | 'clock'): Batch {
    if (kind === 'record') return { ...batch, records: batch.records.concat([item as RecordChange]) };
    if (kind === 'link') return { ...batch, links: batch.links.concat([item as LinkChange]) };
    if (kind === 'settings') return { ...batch, settings: item as SettingsChange };
    return { ...batch, clock: item as ClockChange };
}

function overLimit(batch: Batch): boolean {
    if (rowCount(batch) > CAMPAIGN_LIMITS.patchRows) return true;
    return byteSize(toChanges(batch)) > CAMPAIGN_LIMITS.patchBytes;
}

type Packed =
    | { ok: true; batches: Batch[] }
    | { ok: false; batches: Batch[]; message: string };

function pack(items: { kind: 'record' | 'link' | 'settings' | 'clock'; row: RecordChange | LinkChange | SettingsChange | ClockChange }[]): Packed {
    const batches: Batch[] = [];
    let current = emptyBatch();
    for (const item of items) {
        const next = withItem(current, item.row, item.kind);
        if (rowCount(current) > 0 && overLimit(next)) {
            batches.push(current);
            current = withItem(emptyBatch(), item.row, item.kind);
        } else {
            current = next;
        }
        if (overLimit(current)) return { ok: false, batches, message: TOO_LARGE };
    }
    if (rowCount(current) > 0) batches.push(current);
    return { ok: true, batches };
}

function changesOf(doc: CampaignExport): Packed {
    const settingsRev = campaign.settings ? campaign.settings.rev : 0;
    const clockRev = campaign.clock ? campaign.clock.rev : 0;
    const items: { kind: 'record' | 'link' | 'settings' | 'clock'; row: RecordChange | LinkChange | SettingsChange | ClockChange }[] = [];
    for (const record of doc.records) {
        items.push({ kind: 'record', row: { ...record, baseRev: 0 } });
    }
    for (const link of doc.links) {
        items.push({ kind: 'link', row: { ...link, baseRev: 0 } });
    }
    items.push({
        kind: 'settings',
        row: { ...doc.settings, baseRev: settingsRev },
    });
    if (doc.clock) {
        items.push({ kind: 'clock', row: { days: doc.clock.days, baseRev: clockRev } });
    }
    return pack(items);
}

function saved(landed: number): ImportResult {
    return { ok: false, landed, message: `${landed} rows imported. ${NOT_SAVED}` };
}

/**
 * Imports `doc` into `target`.
 * `target` must be the open campaign, and that campaign must have no records and no links.
 * Stops at the first batch that does not save and reports how many rows landed before it.
 */
export async function importCampaign(doc: CampaignExport, target: string): Promise<ImportResult> {
    if (campaign.status !== 'ready' || campaign.universeId !== target) {
        return { ok: false, message: NOT_OPEN, landed: 0 };
    }
    if (Object.keys(campaign.records).length > 0 || Object.keys(campaign.links).length > 0) {
        return { ok: false, message: NOT_EMPTY, landed: 0 };
    }
    const packed = changesOf(doc);
    let landed = 0;
    for (const batch of packed.batches) {
        commit(toChanges(batch));
        await flushCampaign();
        if (lastError.value !== '' || pending.value) return saved(landed);
        landed += rowCount(batch);
    }
    if (!packed.ok) return { ok: false, landed, message: `${landed} rows imported. ${packed.message}` };
    return { ok: true, landed };
}
