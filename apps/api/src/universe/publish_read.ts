import { stripRefereeBlocks } from '@voyage/shared';
import { storedCampaignRecord, type Sql } from './campaign.ts';

export type PublishHexSource = {
    hexKey: string;
    found: boolean;
    deleted: boolean;
    baseHash: string | null;
    treeHash: string | null;
    summary: unknown;
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

function stripValue(value: unknown): unknown {
    if (typeof value === 'string') return stripRefereeBlocks(value);
    if (Array.isArray(value)) return value.map(stripValue);
    if (value && typeof value === 'object') {
        const out: Record<string, unknown> = {};
        for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
            if (key === 'fuelMark') continue;
            out[key] = stripValue(item);
        }
        return out;
    }
    return value;
}

/**
 * A record named in `recordIds` (the dialog's ticked list). Player notes never go out.
 * The naval or scout mark never goes out. A `:::referee` passage never goes out.
 * A record players cannot see also loses its writeup and its sheet.
 */
export function recordForPublish(record: unknown): unknown {
    if (!record || typeof record !== 'object' || Array.isArray(record)) return record;
    const source = record as Record<string, unknown>;
    const hidden = source.visibility !== 'players';
    const out = stripValue(source) as Record<string, unknown>;
    out.playerNotes = null;
    if (hidden) {
        out.summary = '';
        out.details = '';
        out.sheet = null;
    }
    return out;
}

/** Rows the publish job copies. Missing ids come back with `found: false`. */
export function readPublishSources(sql: Sql, body: unknown): PublishSources {
    const input = body && typeof body === 'object' ? body as { hexKeys?: unknown; recordIds?: unknown } : {};
    const hexes = asList(input.hexKeys).filter((item): item is string => typeof item === 'string').map((hexKey) => {
        const rows = sql.exec(
            `SELECT deleted, base_hash, tree_hash, summary FROM hexes WHERE hex_key = ?`,
            hexKey,
        );
        const row = rows[0];
        if (!row) {
            return { hexKey, found: false, deleted: false, baseHash: null, treeHash: null, summary: null };
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
        };
    });
    const records = asList(input.recordIds).filter((item): item is string => typeof item === 'string').map((id) => {
        const record = storedCampaignRecord(sql, id);
        if (!record) return { id, found: false, deleted: false, record: null };
        if (record.deleted === true) return { id, found: true, deleted: true, record };
        return { id, found: true, deleted: false, record: recordForPublish(record) };
    });
    return { hexes, records };
}
