/**
 * Install a package into this universe, in place or at a placement
 * (contracts/b_marketplace.md F4, F12, F13), and remove an import (F14).
 * The Worker reads the manifest and the chart; this module chooses an outcome per
 * hex against the stored rows and, on install, writes them in one transaction.
 * Records go through the campaign change path afterwards.
 */
import { CampaignRecord, type InstallOutcome } from '@voyage/shared';
import { applyCampaignChanges, deleteInstalledRecord, storedCampaignRecord, type Sql, type SqlRow } from './campaign.ts';
import { chartTree, deleteInstalledHex, HexRefusal, ownSectorKey, storedEntry, storedHexRow, writeInstalled } from './hexes.ts';
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
    /** The package_installs row id; every written hex and record names it. */
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

/** Meta key of the own sectors an import made, so removing it can delete them. */
const SECTORS_KEY = (installId: string) => `installsectors:${installId}`;

export function applyInstall(sql: Sql, body: InstallBody, now: string): { written: number; skipped: number; records: number } {
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
    let written = 0;
    let skipped = 0;
    sql.transaction(() => {
        const made: string[] = [];
        for (const plan of body.sectors ?? []) {
            try {
                if (makeImportSector(sql, plan.id, plan.name, plan.slot.x, plan.slot.y, now)) made.push(plan.id);
            } catch (err) {
                if (err instanceof HexRefusal) throw new InstallRefusal(409, 'conflict', 'The empty space for this piece was taken. Open the preview again.', { sectorId: plan.id });
                throw err;
            }
        }
        if (made.length) {
            const before = jsonList(metaValue(sql, SECTORS_KEY(body.installId)));
            setMeta(sql, SECTORS_KEY(body.installId), JSON.stringify([...new Set([...before, ...made])]));
        }
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
    if (changes.length) records = applyCampaignChanges(sql, { records: changes }, now).applied.filter((item) => item.table === 'records').length;
    return { written, skipped, records };
}

function metaValue(sql: Sql, key: string): string | null {
    const value = sql.exec(`SELECT value FROM meta WHERE key = ?`, key)[0]?.value;
    return typeof value === 'string' ? value : null;
}

function setMeta(sql: Sql, key: string, value: string): void {
    sql.exec(`INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?`, key, value, value);
}

function jsonList(text: string | null): string[] {
    if (!text) return [];
    try {
        const parsed = JSON.parse(text) as unknown;
        return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
    } catch {
        return [];
    }
}

function jsonObject(text: unknown): Record<string, unknown> | null {
    if (typeof text !== 'string' || !text) return null;
    try {
        const parsed = JSON.parse(text) as unknown;
        return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null;
    } catch {
        return null;
    }
}

export type InstallRemoveBody = {
    /** The package_installs row id. */
    installId: string;
    packageId: string;
    /** True when this row is the only import of the package in this universe. */
    sole: boolean;
};

/**
 * Remove an import (contracts/b_marketplace.md F14): delete every hex row and record
 * whose provenance names it, edited since or not, then the own sectors it made that
 * are left empty. All or nothing, one transaction.
 *
 * Which rows: with one import of the package (the rule from 1.1.15), every row of the
 * package. Rows written by 1.1.13 and 1.1.14 carry a per-call id, not the row id, so
 * when a 1.1.14 campaign holds the package twice the per-call ids are read back from
 * the `installed:<id>` and `installrow:<rowId>` meta keys 1.1.14 wrote.
 */
export function removeInstall(sql: Sql, body: InstallRemoveBody, now: string): { hexes: number; records: number; sectors: number } {
    return sql.transaction(() => {
        const ids = new Set<string>([body.installId]);
        const made = new Set<string>(jsonList(metaValue(sql, SECTORS_KEY(body.installId))));
        const latest = metaValue(sql, `installrow:${body.installId}`);
        if (latest) ids.add(latest);
        for (const row of sql.exec(`SELECT key, value FROM meta WHERE key LIKE 'installed:%'`)) {
            const done = jsonObject(row.value);
            const id = String(row.key).slice('installed:'.length);
            if (done?.rowId !== body.installId && !ids.has(id)) continue;
            ids.add(id);
            if (Array.isArray(done?.sectors)) for (const sector of done.sectors) if (typeof sector === 'string') made.add(sector);
        }
        const ours = (prov: Record<string, unknown> | null) => !!prov && prov.packageId === body.packageId
            && (body.sole || (typeof prov.installId === 'string' && ids.has(prov.installId)));
        let hexes = 0;
        for (const row of sql.exec(`SELECT hex_key, provenance FROM hexes WHERE provenance IS NOT NULL`)) {
            if (ours(jsonObject(row.provenance)) && deleteInstalledHex(sql, String(row.hex_key), now)) hexes += 1;
        }
        let records = 0;
        for (const row of sql.exec(`SELECT id, provenance FROM campaign_records WHERE deleted = 0 AND provenance IS NOT NULL`)) {
            const prov = jsonObject(row.provenance);
            if (prov?.mode === 'package' && ours(prov) && deleteInstalledRecord(sql, String(row.id), now)) records += 1;
        }
        let sectors = 0;
        for (const id of made) if (dropImportSector(sql, id, now)) sectors += 1;
        sql.exec(`DELETE FROM meta WHERE key = ?`, SECTORS_KEY(body.installId));
        return { hexes, records, sectors };
    });
}
