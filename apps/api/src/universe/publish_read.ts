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
        return { id, found: true, deleted: record.deleted === true, record };
    });
    return { hexes, records };
}
