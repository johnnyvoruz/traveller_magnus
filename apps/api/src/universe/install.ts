/**
 * Install a package into this universe in place (contracts/b_marketplace.md F4).
 * The Worker reads the manifest and the chart; this module chooses an outcome per
 * hex against the stored rows and, on install, writes them in one transaction
 * after a snapshot. Records go through the campaign change path afterwards.
 */
import { CampaignRecord, type InstallOutcome } from '@voyage/shared';
import { applyCampaignChanges, storedCampaignRecord, type Sql, type SqlRow } from './campaign.ts';
import { chartTree, ownSectorKey, storedEntry, storedHexRow, writeInstalled } from './hexes.ts';

export type InstallHexInput = {
    hexKey: string;
    baseHash: string | null;
    treeHash: string | null;
    summary: Record<string, unknown> | null;
    deleted: boolean;
    /** The pinned chart's entry at this key, or null. */
    chart: unknown;
};

export type InstallRecordInput = {
    id: string;
    record: Record<string, unknown>;
};

export type PreviewHex = {
    from: string;
    to: string;
    outcome: InstallOutcome;
    removes: boolean;
    current: { name: string; uwp: string; treeHash: string | null } | null;
};

export type PreviewRecords = { add: string[]; replace: string[]; conflicts: string[] };

export type InstallBody = {
    installId: string;
    packageId: string;
    version: number;
    title: string;
    sourceUniverseId: string;
    publishedAt: string;
    hexes: InstallHexInput[];
    records: InstallRecordInput[];
    resolutions: Record<string, 'theirs' | 'mine'>;
    recordResolutions: Record<string, 'theirs' | 'mine'>;
};

export class InstallRefusal extends Error {
    readonly status: number;
    readonly code: string;
    readonly details: unknown;

    constructor(status: number, code: string, message: string, details?: unknown) {
        super(message);
        this.status = status;
        this.code = code;
        this.details = details;
    }
}

type Provenance = { packageId?: unknown; installId?: unknown; treeHash?: unknown };

function provenanceOf(row: SqlRow): Provenance | null {
    if (typeof row.provenance !== 'string' || !row.provenance) return null;
    try {
        const parsed = JSON.parse(row.provenance) as unknown;
        return parsed && typeof parsed === 'object' ? parsed as Provenance : null;
    } catch {
        return null;
    }
}

function textOf(value: unknown): string {
    return typeof value === 'string' ? value : '';
}

function chartEntry(chart: unknown): { name: string; uwp: string } | null {
    if (!chart || typeof chart !== 'object') return null;
    const entry = chart as { name?: unknown; uwp?: unknown };
    return { name: textOf(entry.name), uwp: textOf(entry.uwp) };
}

/** The entry inside a manifest summary: a live row stores `{ entry }`, a chart hex stores the entry itself. */
function summaryEntry(summary: Record<string, unknown> | null): unknown {
    if (!summary) return null;
    if (summary.entry && typeof summary.entry === 'object') return summary.entry;
    return summary;
}

function summaryEngine(summary: Record<string, unknown> | null): string | null {
    return summary && typeof summary.engineVersion === 'string' ? summary.engineVersion : null;
}

/** One hex. Pure apart from the row read. */
export function outcomeOf(sql: Sql, packageId: string, hex: InstallHexInput): PreviewHex {
    const row = storedHexRow(sql, hex.hexKey);
    const charted = !ownSectorKey(hex.hexKey) && !!hex.chart && typeof hex.chart === 'object';
    const chartHash = charted ? chartTree(hex.chart) : null;
    let present: boolean;
    let tree: string | null;
    let current: PreviewHex['current'];
    if (row) {
        present = Number(row.deleted) !== 1;
        tree = present && typeof row.tree_hash === 'string' && row.tree_hash ? row.tree_hash : null;
        const entry = storedEntry(row);
        current = present ? { name: entry?.name ?? textOf(row.name), uwp: entry?.uwp ?? textOf(row.uwp), treeHash: tree } : null;
    } else {
        present = charted;
        tree = chartHash;
        const entry = chartEntry(hex.chart);
        current = charted && entry ? { ...entry, treeHash: chartHash } : null;
    }
    const base = { from: hex.hexKey, to: hex.hexKey, removes: hex.deleted, current };
    if (hex.deleted ? !present : present && tree !== null && tree === hex.treeHash) {
        return { ...base, outcome: 'already installed' };
    }
    if (row) {
        const prov = provenanceOf(row);
        const untouchedUpdate = prov?.packageId === packageId && typeof prov.treeHash === 'string' && prov.treeHash === (tree ?? '');
        const rowTree = typeof row.tree_hash === 'string' && row.tree_hash ? row.tree_hash : null;
        const atBase = Number(row.deleted) !== 1 && rowTree !== null && rowTree === hex.baseHash;
        if (untouchedUpdate || atBase) return { ...base, outcome: 'replaces own' };
        return { ...base, outcome: 'conflict' };
    }
    if (charted) return { ...base, outcome: chartHash === hex.baseHash ? 'replaces chart' : 'conflict' };
    return { ...base, outcome: hex.baseHash === null ? 'new' : 'conflict' };
}

function recordProvenance(value: unknown): { mode?: unknown; universeId?: unknown } | null {
    return value && typeof value === 'object' ? value as { mode?: unknown; universeId?: unknown } : null;
}

export function recordOutcomes(sql: Sql, sourceUniverseId: string, ids: string[]): PreviewRecords {
    const out: PreviewRecords = { add: [], replace: [], conflicts: [] };
    for (const id of ids) {
        const stored = storedCampaignRecord(sql, id);
        if (!stored || stored.deleted === true) {
            out.add.push(id);
            continue;
        }
        const prov = recordProvenance((stored as { provenance?: unknown }).provenance);
        if (prov?.mode === 'copy' && prov.universeId === sourceUniverseId) out.replace.push(id);
        else out.conflicts.push(id);
    }
    return out;
}

export function previewInstall(sql: Sql, body: { packageId: string; sourceUniverseId: string; hexes: InstallHexInput[]; recordIds: string[] }): { hexes: PreviewHex[]; records: PreviewRecords } {
    return {
        hexes: body.hexes.map((hex) => outcomeOf(sql, body.packageId, hex)),
        records: recordOutcomes(sql, body.sourceUniverseId, body.recordIds),
    };
}

const RECORD_KEYS = CampaignRecord.keyof().options as string[];

export function applyInstall(sql: Sql, body: InstallBody, now: string): { written: number; skipped: number; records: number; snapshotId: string } {
    const preview = previewInstall(sql, {
        packageId: body.packageId,
        sourceUniverseId: body.sourceUniverseId,
        hexes: body.hexes,
        recordIds: body.records.map((item) => item.id),
    });
    const missing = preview.hexes.filter((hex) => hex.outcome === 'conflict' && !body.resolutions[hex.to]).map((hex) => hex.to);
    const missingRecords = preview.records.conflicts.filter((id) => !body.recordResolutions[id]);
    if (missing.length || missingRecords.length) {
        throw new InstallRefusal(409, 'conflict', 'Choose theirs or mine for every conflict.', { hexKeys: missing, recordIds: missingRecords });
    }
    const snapshotId = body.installId;
    let written = 0;
    let skipped = 0;
    sql.transaction(() => {
        const captured: Record<string, SqlRow | null> = {};
        for (const hex of body.hexes) captured[hex.hexKey] = storedHexRow(sql, hex.hexKey);
        const capturedRecords: Record<string, unknown> = {};
        for (const item of body.records) capturedRecords[item.id] = storedCampaignRecord(sql, item.id);
        const blob = JSON.stringify({ hexes: captured, records: capturedRecords });
        sql.exec(`INSERT INTO meta (key, value) VALUES (?, ?)`, `install:${body.installId}`, blob);
        sql.exec(
            `INSERT INTO snapshots (id, at, label, trigger, manifest_hash, bytes) VALUES (?, ?, ?, 'install', '', ?)`,
            snapshotId, now, `Before install ${body.title} v${body.version}`.slice(0, 200), blob.length,
        );
        for (let i = 0; i < body.hexes.length; i += 1) {
            const hex = body.hexes[i]!;
            const outcome = preview.hexes[i]!.outcome;
            const take = outcome === 'new' || outcome === 'replaces chart' || outcome === 'replaces own'
                || (outcome === 'conflict' && body.resolutions[hex.hexKey] === 'theirs');
            if (!take) {
                skipped += 1;
                continue;
            }
            const charted = !ownSectorKey(hex.hexKey) && !!hex.chart && typeof hex.chart === 'object';
            writeInstalled(sql, {
                hexKey: hex.hexKey,
                treeHash: hex.treeHash,
                baseHash: charted ? chartTree(hex.chart) : null,
                engineVersion: summaryEngine(hex.summary),
                deleted: hex.deleted,
                charted,
                entry: hex.deleted && charted ? hex.chart : summaryEntry(hex.summary),
                provenance: JSON.stringify({
                    packageId: body.packageId,
                    version: body.version,
                    installId: body.installId,
                    treeHash: hex.deleted ? '' : hex.treeHash ?? '',
                }),
            }, now);
            written += 1;
        }
    });
    const changes = [];
    for (const item of body.records) {
        if (preview.records.conflicts.includes(item.id) && body.recordResolutions[item.id] !== 'theirs') continue;
        const stored = storedCampaignRecord(sql, item.id) as { rev?: unknown } | null;
        const change: Record<string, unknown> = {};
        for (const key of RECORD_KEYS) if (key in item.record) change[key] = item.record[key];
        change.provenance = {
            mode: 'copy',
            universeId: body.sourceUniverseId,
            recordId: item.id,
            rev: typeof item.record.rev === 'number' ? item.record.rev : 0,
            at: body.publishedAt,
        };
        change.deleted = false;
        change.baseRev = stored && typeof stored.rev === 'number' ? stored.rev : 0;
        changes.push(change);
    }
    let records = 0;
    if (changes.length) {
        const result = applyCampaignChanges(sql, { records: changes }, now);
        records = result.applied.length;
    }
    return { written, skipped, records, snapshotId };
}