/**
 * Install a package into this universe, in place or at a placement
 * (contracts/b_marketplace.md F4, F12, F13), and undo an import from its snapshot.
 * The Worker reads the manifest and the chart; this module chooses an outcome per
 * hex against the stored rows and, on install, writes them in one transaction
 * after a snapshot. Records go through the campaign change path afterwards.
 */
import { CampaignRecord, type InstallOutcome } from '@voyage/shared';
import { applyCampaignChanges, rawCampaignRecord, restoreInstalledRecord, storedCampaignRecord, type Sql, type SqlRow } from './campaign.ts';
import { chartTree, HexRefusal, ownSectorKey, restoreInstalledHex, storedEntry, storedHexRow, writeInstalled } from './hexes.ts';
import { dropImportSector, makeImportSector } from './sectors.ts';

export type InstallHexInput = {
    /** Where the hex lands in this universe. */
    hexKey: string;
    /** The package's own key; equal to hexKey for an install in place. */
    from?: string;
    /** True with a placement: the package's base hash says nothing about this space. */
    placed?: boolean;
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
    /** Own sectors a placement needs; made in the same transaction as the hexes. */
    sectors?: { id: string; slot: { x: number; y: number }; name: string }[];
    /** The package_installs row and the version it held before (null: a first import). */
    rowId?: string;
    prevVersion?: number | null;
};

/** What an import changed, kept in meta `installed:<installId>` for its undo. */
type InstallDone = {
    hexes: Record<string, number | null>;
    records: Record<string, number>;
    sectors: string[];
    rowId: string | null;
    prevVersion: number | null;
    prevInstallId: string | null;
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
    const base = { from: hex.from ?? hex.hexKey, to: hex.hexKey, removes: hex.deleted, current };
    if (hex.deleted ? !present : present && tree !== null && tree === hex.treeHash) {
        return { ...base, outcome: 'already installed' };
    }
    if (row) {
        const prov = provenanceOf(row);
        const untouchedUpdate = prov?.packageId === packageId && typeof prov.treeHash === 'string' && prov.treeHash === (tree ?? '');
        const rowTree = typeof row.tree_hash === 'string' && row.tree_hash ? row.tree_hash : null;
        const atBase = !hex.placed && Number(row.deleted) !== 1 && rowTree !== null && rowTree === hex.baseHash;
        if (untouchedUpdate || atBase) return { ...base, outcome: 'replaces own' };
        return { ...base, outcome: 'conflict' };
    }
    if (charted) return { ...base, outcome: hex.placed || chartHash === hex.baseHash ? 'replaces chart' : 'conflict' };
    return { ...base, outcome: hex.placed || hex.baseHash === null ? 'new' : 'conflict' };
}

function recordProvenance(value: unknown): { mode?: unknown; universeId?: unknown; packageId?: unknown } | null {
    return value && typeof value === 'object' ? value as { mode?: unknown; universeId?: unknown; packageId?: unknown } : null;
}

export function recordOutcomes(sql: Sql, sourceUniverseId: string, ids: string[], packageId = ''): PreviewRecords {
    const out: PreviewRecords = { add: [], replace: [], conflicts: [] };
    for (const id of ids) {
        const stored = storedCampaignRecord(sql, id);
        if (!stored || stored.deleted === true) {
            out.add.push(id);
            continue;
        }
        const prov = recordProvenance((stored as { provenance?: unknown }).provenance);
        if ((prov?.mode === 'copy' && prov.universeId === sourceUniverseId) || (prov?.mode === 'package' && prov.packageId === packageId)) out.replace.push(id);
        else out.conflicts.push(id);
    }
    return out;
}

export function previewInstall(sql: Sql, body: { packageId: string; sourceUniverseId: string; hexes: InstallHexInput[]; recordIds: string[] }): { hexes: PreviewHex[]; records: PreviewRecords } {
    return {
        hexes: body.hexes.map((hex) => outcomeOf(sql, body.packageId, hex)),
        records: recordOutcomes(sql, body.sourceUniverseId, body.recordIds, body.packageId),
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
    const done: InstallDone = {
        hexes: {},
        records: {},
        sectors: [],
        rowId: body.rowId ?? null,
        prevVersion: body.prevVersion ?? null,
        prevInstallId: body.rowId ? metaValue(sql, `installrow:${body.rowId}`) : null,
    };
    sql.transaction(() => {
        for (const plan of body.sectors ?? []) {
            try {
                if (makeImportSector(sql, plan.id, plan.name, plan.slot.x, plan.slot.y, now)) done.sectors.push(plan.id);
            } catch (err) {
                if (err instanceof HexRefusal) throw new InstallRefusal(409, 'conflict', 'The empty space for this piece was taken. Open the preview again.', { sectorId: plan.id });
                throw err;
            }
        }
        const captured: Record<string, SqlRow | null> = {};
        for (const hex of body.hexes) captured[hex.hexKey] = storedHexRow(sql, hex.hexKey);
        const capturedRecords: Record<string, SqlRow | null> = {};
        for (const item of body.records) capturedRecords[item.id] = rawCampaignRecord(sql, item.id);
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
            const after = storedHexRow(sql, hex.hexKey);
            done.hexes[hex.hexKey] = after ? Number(after.rev) : null;
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
            mode: 'package',
            packageId: body.packageId,
            version: body.version,
            installId: body.installId,
            at: now,
        };
        change.deleted = false;
        change.baseRev = stored && typeof stored.rev === 'number' ? stored.rev : 0;
        changes.push(change);
    }
    let records = 0;
    if (changes.length) {
        const result = applyCampaignChanges(sql, { records: changes }, now);
        records = result.applied.length;
        for (const item of result.applied) if (item.table === 'records') done.records[item.id] = item.rev;
    }
    sql.transaction(() => {
        setMeta(sql, `installed:${body.installId}`, JSON.stringify(done));
        if (body.rowId) setMeta(sql, `installrow:${body.rowId}`, body.installId);
    });
    return { written, skipped, records, snapshotId };
}

function metaValue(sql: Sql, key: string): string | null {
    const value = sql.exec(`SELECT value FROM meta WHERE key = ?`, key)[0]?.value;
    return typeof value === 'string' ? value : null;
}

function setMeta(sql: Sql, key: string, value: string): void {
    sql.exec(`INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?`, key, value, value);
}

export type InstallRestore = {
    snapshotId: string;
    hexes: number;
    records: number;
    sectors: number;
    rowId: string | null;
    prevVersion: number | null;
};

/**
 * Undo an import from its snapshot (contracts/b_marketplace.md F13). All or nothing:
 * the checks and every write are one transaction. Refused when a hex or record the
 * import wrote has changed since, when a later import of the same package is still
 * in place, or when the import is already undone.
 */
export function restoreInstall(sql: Sql, snapshotId: string, now: string): InstallRestore {
    return sql.transaction(() => {
        const snap = sql.exec(`SELECT trigger FROM snapshots WHERE id = ?`, snapshotId)[0];
        if (!snap) throw new InstallRefusal(404, 'not_found', 'There is no such undo point.');
        if (snap.trigger !== 'install') throw new InstallRefusal(400, 'validation', 'Only an undo point made by an import can be restored here.');
        if (metaValue(sql, `restored:${snapshotId}`)) throw new InstallRefusal(409, 'conflict', 'This import is already undone.');
        const blobText = metaValue(sql, `install:${snapshotId}`);
        const doneText = metaValue(sql, `installed:${snapshotId}`);
        if (!blobText || !doneText) throw new InstallRefusal(409, 'conflict', 'This import was made before undo was possible, so it cannot be undone.');
        const blob = JSON.parse(blobText) as { hexes: Record<string, SqlRow | null>; records: Record<string, SqlRow | null> };
        const done = JSON.parse(doneText) as InstallDone;
        if (done.rowId && metaValue(sql, `installrow:${done.rowId}`) !== snapshotId) {
            throw new InstallRefusal(409, 'conflict', 'Undo the later import of this package first.');
        }
        const hexKeys = Object.entries(done.hexes).filter(([key, rev]) => {
            const row = storedHexRow(sql, key);
            return (row ? Number(row.rev) : null) !== rev;
        }).map(([key]) => key);
        const recordIds = Object.entries(done.records).filter(([id, rev]) => Number(rawCampaignRecord(sql, id)?.rev ?? -1) !== rev).map(([id]) => id);
        if (hexKeys.length || recordIds.length) {
            throw new InstallRefusal(409, 'conflict', 'Some systems or records changed after the import. Undo those changes first, then try again.', { hexKeys, recordIds });
        }
        for (const key of Object.keys(done.hexes)) restoreInstalledHex(sql, key, blob.hexes[key] ?? null, now);
        for (const id of Object.keys(done.records)) restoreInstalledRecord(sql, id, blob.records[id] ?? null, now);
        let sectors = 0;
        for (const id of done.sectors) if (dropImportSector(sql, id, now)) sectors += 1;
        setMeta(sql, `restored:${snapshotId}`, now);
        if (done.rowId) {
            if (done.prevInstallId) setMeta(sql, `installrow:${done.rowId}`, done.prevInstallId);
            else sql.exec(`DELETE FROM meta WHERE key = ?`, `installrow:${done.rowId}`);
        }
        return {
            snapshotId,
            hexes: Object.keys(done.hexes).length,
            records: Object.keys(done.records).length,
            sectors,
            rowId: done.rowId,
            prevVersion: done.prevVersion,
        };
    });
}