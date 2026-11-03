import { redactString, type CampaignRecord } from '@voyage/shared';
import { storedCampaignRecord, type Sql } from './campaign.ts';
import { surfacesForHex } from './surfaces.ts';

export type PublishHexSource = {
    hexKey: string;
    found: boolean;
    deleted: boolean;
    baseHash: string | null;
    treeHash: string | null;
    summary: unknown;
    /** Body key to the stored paint. Empty when this hex has none. Omitted by older callers. */
    surfaces?: Record<string, unknown>;
};

export type PublishRecordSource = {
    id: string;
    found: boolean;
    deleted: boolean;
    record: unknown;
};

export type PublishSources = {
    hexes: PublishHexSource[];
    records: PublishRecordSource[];
};

function asList(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
}

function textOrNull(value: unknown): string | null {
    return typeof value === 'string' && value ? value : null;
}

function peerRecords(records: readonly unknown[]): CampaignRecord[] {
    const out: CampaignRecord[] = [];
    for (const row of records) {
        if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
        const item = row as CampaignRecord;
        if (typeof item.id !== 'string') continue;
        out.push(item);
    }
    return out;
}

function hiddenIdsOf(records: readonly CampaignRecord[]): string[] {
    const ids: string[] = [];
    for (const record of records) {
        if (record.deleted || record.visibility !== 'players') ids.push(record.id);
    }
    return ids;
}

function stripValue(value: unknown, records: readonly CampaignRecord[], hiddenIds: readonly string[]): unknown {
    if (typeof value === 'string') return redactString(value, records, hiddenIds);
    if (Array.isArray(value)) return value.map((item) => stripValue(item, records, hiddenIds));
    if (value && typeof value === 'object') {
        const out: Record<string, unknown> = {};
        for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
            if (key === 'fuelMark' || key === 'roles') continue;
            out[key] = stripValue(item, records, hiddenIds);
        }
        return out;
    }
    return value;
}

/** A place label is the referee's. The chart hex stays. */
function anchorForHidden(anchor: unknown): unknown {
    if (!anchor || typeof anchor !== 'object' || Array.isArray(anchor)) return anchor ?? null;
    const row = { ...(anchor as Record<string, unknown>) };
    delete row.locationLabel;
    return row;
}

function redactWords(value: unknown, records: readonly CampaignRecord[], hiddenIds: readonly string[]): unknown {
    return typeof value === 'string' ? redactString(value, records, hiddenIds) : value;
}

/**
 * A record named in `recordIds` (the dialog's ticked list). Player notes never go out.
 * The naval or scout mark never goes out. A `:::referee` passage never goes out.
 * A mention of a record players cannot see reads "a record", the same as their page.
 * A record players cannot see publishes its name, kind and tags. Its text, notes,
 * sheet, status, pictures, place label and provenance stay behind.
 * `peers` are the records in this publish, so a players mention of one of them keeps that name.
 */
export function recordForPublish(record: unknown, peers: readonly unknown[] = []): unknown {
    if (!record || typeof record !== 'object' || Array.isArray(record)) return record;
    const source = record as Record<string, unknown>;
    const list = peerRecords(peers.length ? peers : [record]);
    const hiddenIds = hiddenIdsOf(list);
    const hidden = source.visibility !== 'players';
    if (hidden) {
        const tags = Array.isArray(source.tags)
            ? source.tags.map((tag) => redactWords(tag, list, hiddenIds))
            : source.tags;
        return {
            ...source,
            name: redactWords(source.name, list, hiddenIds),
            kind: redactWords(source.kind, list, hiddenIds),
            tags,
            summary: '',
            details: '',
            playerNotes: null,
            sheet: null,
            status: null,
            images: null,
            provenance: null,
            anchor: anchorForHidden(source.anchor),
        };
    }
    const out = stripValue(source, list, hiddenIds) as Record<string, unknown>;
    out.playerNotes = null;
    return out;
}

/**
 * A link whose two ends are both in the package. Ends, kind and role stay.
 * Notes go through the players redaction. Provenance stays behind.
 */
export function linkForPublish(link: unknown, peers: readonly unknown[] = []): unknown {
    if (!link || typeof link !== 'object' || Array.isArray(link)) return link;
    const source = link as Record<string, unknown>;
    const list = peerRecords(peers);
    const hiddenIds = hiddenIdsOf(list);
    const { provenance: _provenance, ...rest } = source;
    void _provenance;
    return {
        ...rest,
        role: redactWords(rest.role, list, hiddenIds),
        notes: redactWords(rest.notes, list, hiddenIds),
        provenance: null,
    };
}

/** Rows the publish job copies. Missing ids come back with `found: false`. */
export function readPublishSources(sql: Sql, body: unknown): PublishSources {
    const input = body && typeof body === 'object' ? body as { hexKeys?: unknown; recordIds?: unknown } : {};
    const hexes = asList(input.hexKeys).filter((item): item is string => typeof item === 'string').map((hexKey) => {
        const rows = sql.exec(
            `SELECT deleted, base_hash, tree_hash, summary FROM hexes WHERE hex_key = ?`,
            hexKey,
        );
        const surfaces = surfacesForHex(sql, hexKey);
        const row = rows[0];
        if (!row) {
            return { hexKey, found: false, deleted: false, baseHash: null, treeHash: null, summary: null, surfaces };
        }
        let summary: unknown = null;
        if (typeof row.summary === 'string' && row.summary) {
            try {
                summary = JSON.parse(row.summary);
            } catch {
                summary = null;
            }
        }
        return {
            hexKey,
            found: true,
            deleted: Number(row.deleted) === 1,
            baseHash: textOrNull(row.base_hash),
            treeHash: textOrNull(row.tree_hash),
            summary,
            surfaces,
        };
    });
    const loaded = asList(input.recordIds).filter((item): item is string => typeof item === 'string').map((id) => {
        const record = storedCampaignRecord(sql, id);
        if (!record) return { id, found: false, deleted: false, record: null };
        if (record.deleted === true) return { id, found: true, deleted: true, record };
        return { id, found: true, deleted: false, record };
    });
    const peers = loaded.flatMap((row) => (row.record ? [row.record] : []));
    const records = loaded.map((row) => (
        row.record ? { ...row, record: recordForPublish(row.record, peers) } : row
    ));
    return { hexes, records };
}
