import {
    BUILDER_LIMITS,
    BuilderAbsent,
    BuilderHex,
    BuilderJob,
    SectorHex,
    type BuilderAbsent as Absent,
    type BuilderFailure,
    type BuilderHex as HexRow,
    type BuilderHexPage,
    type BuilderJob as JobRow,
    type BuilderJobUndo,
    type SectorHex as ChartEntry,
} from '@voyage/shared';
import type { Sql, SqlRow } from './campaign';

export class HexRefusal extends Error {
    readonly code: 'validation' | 'conflict' | 'not_found';
    readonly details: unknown;

    constructor(code: 'validation' | 'conflict' | 'not_found', message: string, details?: unknown) {
        super(message);
        this.code = code;
        this.details = details;
    }
}

export type Pin = {
    seed: string;
    settings: Record<string, unknown>;
    truthVersion: string | null;
};

export type Captured = {
    rev: number;
    treeHash: string | null;
    baseHash: string | null;
    roll: number;
    deleted: number;
    engineVersion: string | null;
    entry: ChartEntry;
} | null;

/** A chart hex that has no row yet. Remove writes a tombstone from this. */
export type ChartHex = {
    baseHash: string | null;
    entry: ChartEntry;
};

export type JobBlob = {
    failures: BuilderFailure[];
    skipped: number;
    leftEmpty?: number;
    undone?: boolean;
    written?: Record<string, number>;
    /** Hex keys written, in the order the batches applied them. */
    placed?: string[];
    applied?: number[];
    /** Bytes this job stored. The queue adds the unsettled part once, when the job ends. */
    objectBytes?: number;
    /** Bytes already added to the universe row. A retry subtracts this and does not add them again. */
    bytesSettled?: number;
    /** Why the job failed when the reason names no hex. */
    error?: string;
};

const HEX_KEY = /^[^/]+\/\d{4}$/;

export function generationSeed(universeSeed: string, roll: number): string {
    if (roll === 0) return universeSeed;
    return `${universeSeed}/roll/${roll}`;
}

export function sectorOf(hexKey: string): { sector: string; local: string } {
    const slash = hexKey.indexOf('/');
    return { sector: hexKey.slice(0, slash), local: hexKey.slice(slash + 1) };
}

/** Door path for one hex. The slash in the key is a path separator; encoding it is decoded away. */
export function hexDoorPath(hexKey: string): string {
    const { sector, local } = sectorOf(hexKey);
    return `/hexes/${encodeURIComponent(sector)}/${local}`;
}

/** A chart row exists, including a partial world with no tree. Absence means empty. */
export function chartHoldsSystem(entry: unknown): boolean {
    return !!entry && typeof entry === 'object';
}

export function chartTree(entry: unknown): string | null {
    if (!entry || typeof entry !== 'object') return null;
    const tree = (entry as { tree?: unknown }).tree;
    return typeof tree === 'string' && /^[0-9a-f]{64}$/.test(tree) ? tree : null;
}

function ownMap(pin: Pin): boolean {
    return pin.truthVersion === null;
}

function absent(hexKey: string, pin: Pin): Absent {
    return BuilderAbsent.parse({
        hexKey,
        state: ownMap(pin) || ownSectorKey(hexKey) ? 'own' : 'truth',
        treeHash: null,
        baseHash: null,
        roll: 0,
        rev: 0,
    });
}

/** A referee sector id starts with "~". Chart slugs never contain that character. */
export function ownSectorKey(hexKey: string): boolean {
    return hexKey.startsWith('~');
}

function placeOf(deleted: number, pin: Pin, hexKey: string): HexRow['state'] {
    if (deleted) return 'removed';
    return ownMap(pin) || ownSectorKey(hexKey) ? 'own' : 'override';
}

function emptyEntry(tree: string | null): ChartEntry {
    return {
        tree,
        type: 'SYSTEM_PRESENT',
        name: '',
        uwp: '',
        allegiance: '',
        zone: '',
        bases: '',
        tradeCodes: [],
        pbg: '',
        ix: 0,
        partial: null,
    };
}

function entryOf(value: unknown, tree: string | null): ChartEntry {
    const parsed = SectorHex.safeParse(value);
    return parsed.success ? parsed.data : emptyEntry(tree);
}

function rowOf(record: SqlRow, pin: Pin): HexRow {
    const summary = parseSummary(record.summary);
    const treeHash = record.tree_hash ? String(record.tree_hash) : null;
    return BuilderHex.parse({
        hexKey: String(record.hex_key),
        state: placeOf(Number(record.deleted) ? 1 : 0, pin, String(record.hex_key)),
        treeHash,
        baseHash: record.base_hash ? String(record.base_hash) : null,
        roll: Number.isInteger(record.roll) ? Number(record.roll) : summary.roll,
        rev: Number(record.rev),
        updatedAt: String(record.updated_at),
        entry: summary.entry ?? entryOf(null, treeHash),
    });
}

function parseSummary(value: unknown): { roll: number; baseHash: string | null; engineVersion: string | null; entry: ChartEntry | null } {
    if (typeof value !== 'string' || !value) return { roll: 0, baseHash: null, engineVersion: null, entry: null };
    try {
        const parsed = JSON.parse(value) as { roll?: unknown; baseHash?: unknown; engineVersion?: unknown; entry?: unknown };
        const entry = SectorHex.safeParse(parsed.entry);
        return {
            roll: typeof parsed.roll === 'number' && Number.isInteger(parsed.roll) && parsed.roll >= 0 ? parsed.roll : 0,
            baseHash: typeof parsed.baseHash === 'string' ? parsed.baseHash : null,
            engineVersion: typeof parsed.engineVersion === 'string' ? parsed.engineVersion : null,
            entry: entry.success ? entry.data : null,
        };
    } catch {
        return { roll: 0, baseHash: null, engineVersion: null, entry: null };
    }
}

function summaryJson(roll: number, baseHash: string | null, engineVersion: string | null, entry: ChartEntry): string {
    return JSON.stringify({ roll, baseHash, engineVersion, entry });
}

function current(sql: Sql, hexKey: string): SqlRow | null {
    const rows = sql.exec(`SELECT * FROM hexes WHERE hex_key = ?`, hexKey);
    return rows[0] ?? null;
}

function view(sql: Sql, hexKey: string, pin: Pin): HexRow | Absent {
    const row = current(sql, hexKey);
    return row ? rowOf(row, pin) : absent(hexKey, pin);
}

function requireKey(hexKey: string): void {
    if (!HEX_KEY.test(hexKey)) throw new HexRefusal('validation', 'That hex address is not valid. Check the address and try again.');
}

function assertRev(sql: Sql, hexKey: string, baseRev: number, pin: Pin): SqlRow | null {
    const row = current(sql, hexKey);
    const rev = row ? Number(row.rev) : 0;
    if (rev !== baseRev) throw new HexRefusal('conflict', 'This hex changed. Reload it, then try again.', { code: 'hex_changed', current: view(sql, hexKey, pin) });
    return row;
}

function nextRev(sql: Sql, hexKey: string, baseRev: number): number {
    const rows = sql.exec(`SELECT MAX(rev) AS rev FROM hex_history WHERE hex_key = ?`, hexKey);
    const max = Number(rows[0]?.rev ?? 0);
    return Math.max(baseRev, max) + 1;
}

type HexFields = {
    hexKey: string; rev: number; at: string; deleted: number; baseHash: string | null;
    treeHash: string | null; engineVersion: string | null; roll: number; action: string;
    entry: ChartEntry;
};

function remember(sql: Sql, fields: HexFields): void {
    sql.exec(
        `INSERT INTO hex_history (hex_key, rev, at, action, actor, tree_hash, summary, deleted)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        fields.hexKey, fields.rev, fields.at, fields.action, 'owner', fields.treeHash,
        summaryJson(fields.roll, fields.baseHash, fields.engineVersion, fields.entry), fields.deleted,
    );
}

function insertHex(sql: Sql, fields: HexFields): void {
    const { sector, local } = sectorOf(fields.hexKey);
    const entry = fields.entry;
    sql.exec(
        `INSERT INTO hexes (
            hex_key, sector_slug, local_hex, rev, updated_at, deleted, base_hash, tree_hash,
            engine_version, type, name, uwp, allegiance, zone, bases, trade_codes, pbg, ix,
            summary, provenance, roll
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
        fields.hexKey, sector, local, fields.rev, fields.at, fields.deleted, fields.baseHash, fields.treeHash,
        fields.engineVersion, entry.type || (fields.deleted ? 'REMOVED' : 'SYSTEM_PRESENT'),
        entry.name, entry.uwp, entry.allegiance, entry.zone, entry.bases, JSON.stringify(entry.tradeCodes),
        entry.pbg, entry.ix, summaryJson(fields.roll, fields.baseHash, fields.engineVersion, entry), fields.roll,
    );
    remember(sql, fields);
}

function updateHex(sql: Sql, fields: HexFields): void {
    const entry = fields.entry;
    sql.exec(
        `UPDATE hexes SET rev = ?, updated_at = ?, deleted = ?, base_hash = ?, tree_hash = ?,
            engine_version = ?, type = ?, name = ?, uwp = ?, allegiance = ?, zone = ?, bases = ?,
            trade_codes = ?, pbg = ?, ix = ?, summary = ?, roll = ? WHERE hex_key = ?`,
        fields.rev, fields.at, fields.deleted, fields.baseHash, fields.treeHash, fields.engineVersion,
        entry.type || (fields.deleted ? 'REMOVED' : 'SYSTEM_PRESENT'),
        entry.name, entry.uwp, entry.allegiance, entry.zone, entry.bases, JSON.stringify(entry.tradeCodes),
        entry.pbg, entry.ix, summaryJson(fields.roll, fields.baseHash, fields.engineVersion, entry),
        fields.roll, fields.hexKey,
    );
    remember(sql, fields);
}

export function readPin(sql: Sql): Pin | null {
    const rows = sql.exec(`SELECT value FROM meta WHERE key = 'builderPin'`);
    if (!rows[0] || typeof rows[0].value !== 'string') return null;
    const parsed = JSON.parse(rows[0].value) as Pin;
    return {
        seed: parsed.seed,
        settings: parsed.settings,
        truthVersion: parsed.truthVersion,
    };
}

/** First call stores the pin. Later calls keep it. */
export function ensurePin(sql: Sql, pin: Pin): Pin {
    const stored = readPin(sql);
    if (stored) return stored;
    sql.exec(
        `INSERT INTO meta (key, value) VALUES ('builderPin', ?)`,
        JSON.stringify(pin),
    );
    return pin;
}

export function readHexPage(sql: Sql, sector: string, cursor: string | null, limit: number, pin: Pin): BuilderHexPage {
    if (!sector) throw new HexRefusal('validation', 'sector is required.');
    const size = Math.min(Math.max(limit, 1), BUILDER_LIMITS.page);
    const rows = cursor
        ? sql.exec(
            `SELECT * FROM hexes WHERE sector_slug = ? AND hex_key > ? ORDER BY hex_key LIMIT ?`,
            sector, cursor, size + 1,
        )
        : sql.exec(
            `SELECT * FROM hexes WHERE sector_slug = ? ORDER BY hex_key LIMIT ?`,
            sector, size + 1,
        );
    const page = rows.slice(0, size).map((row) => rowOf(row, pin));
    const next = rows.length > size ? page[page.length - 1].hexKey : null;
    return { items: page, nextCursor: next };
}

export function readHex(sql: Sql, hexKey: string, pin: Pin): HexRow {
    requireKey(hexKey);
    const row = current(sql, hexKey);
    if (!row) throw new HexRefusal('not_found', 'No such hex.');
    return rowOf(row, pin);
}

export type GeneratedWrite = {
    hexKey: string;
    treeHash: string;
    baseHash: string | null;
    roll: number;
    baseRev: number;
    engineVersion: string;
    entry?: ChartEntry;
    /** History action. Generate stays `generate`. An edit is `keep`. */
    action?: string;
};

export function writeGenerated(sql: Sql, write: GeneratedWrite, pin: Pin, now: string): HexRow {
    requireKey(write.hexKey);
    const row = assertRev(sql, write.hexKey, write.baseRev, pin);
    const fields: HexFields = {
        hexKey: write.hexKey,
        rev: nextRev(sql, write.hexKey, write.baseRev),
        at: now,
        deleted: 0,
        baseHash: write.baseHash,
        treeHash: write.treeHash,
        engineVersion: write.engineVersion,
        roll: write.roll,
        action: write.action === 'keep' ? 'keep' : 'generate',
        entry: write.entry ?? emptyEntry(write.treeHash),
    };
    if (row) updateHex(sql, fields);
    else insertHex(sql, fields);
    return rowOf(current(sql, write.hexKey)!, pin);
}

/** One system. A stale baseRev writes nothing. The check and the write are one transaction. */
export function applyGenerated(sql: Sql, write: GeneratedWrite, pin: Pin, now: string): HexRow {
    return sql.transaction(() => writeGenerated(sql, write, pin, now));
}

export function removeHex(sql: Sql, hexKey: string, baseRev: number, pin: Pin, now: string, chart: ChartHex | null = null): HexRow | Absent {
    requireKey(hexKey);
    return sql.transaction(() => {
        const row = assertRev(sql, hexKey, baseRev, pin);
        if (row && Number(row.deleted)) throw new HexRefusal('validation', 'Nothing to remove.', { reason: 'empty' });
        if (!row) {
            if (ownMap(pin) || ownSectorKey(hexKey) || !chart) throw new HexRefusal('validation', 'Nothing to remove.', { reason: 'empty' });
            const parsed = SectorHex.safeParse(chart.entry);
            if (!parsed.success) throw new HexRefusal('validation', 'The chart entry is not a sector hex.');
            insertHex(sql, {
                hexKey,
                rev: nextRev(sql, hexKey, baseRev),
                at: now,
                deleted: 1,
                baseHash: chart.baseHash,
                treeHash: null,
                engineVersion: null,
                roll: 0,
                action: 'remove',
                entry: parsed.data,
            });
            return rowOf(current(sql, hexKey)!, pin);
        }
        if (ownMap(pin) || ownSectorKey(hexKey)) {
            sql.exec(`DELETE FROM hexes WHERE hex_key = ?`, hexKey);
            return absent(hexKey, pin);
        }
        const kept = parseSummary(row.summary);
        updateHex(sql, {
            hexKey,
            rev: nextRev(sql, hexKey, baseRev),
            at: now,
            deleted: 1,
            baseHash: row.base_hash ? String(row.base_hash) : null,
            treeHash: null,
            engineVersion: row.engine_version ? String(row.engine_version) : kept.engineVersion,
            roll: Number(row.roll) || kept.roll,
            action: 'remove',
            entry: kept.entry ?? emptyEntry(null),
        });
        return rowOf(current(sql, hexKey)!, pin);
    });
}

export function restoreHex(sql: Sql, hexKey: string, baseRev: number, pin: Pin, now: string): Absent {
    requireKey(hexKey);
    void now;
    return sql.transaction(() => {
        assertRev(sql, hexKey, baseRev, pin);
        if (ownMap(pin) || ownSectorKey(hexKey)) throw new HexRefusal('validation', 'This universe has no chart.', { reason: 'no_chart' });
        const row = current(sql, hexKey);
        if (!row) throw new HexRefusal('validation', 'Nothing to restore.', { reason: 'empty' });
        sql.exec(`DELETE FROM hexes WHERE hex_key = ?`, hexKey);
        return absent(hexKey, pin);
    });
}

export function revertHex(sql: Sql, hexKey: string, toRev: number, baseRev: number, pin: Pin, now: string): HexRow | Absent {
    requireKey(hexKey);
    return sql.transaction(() => {
        assertRev(sql, hexKey, baseRev, pin);
        if (toRev === 0) {
            sql.exec(`DELETE FROM hexes WHERE hex_key = ?`, hexKey);
            return absent(hexKey, pin);
        }
        const history = sql.exec(`SELECT * FROM hex_history WHERE hex_key = ? AND rev = ?`, hexKey, toRev);
        const prior = history[0];
        if (!prior) throw new HexRefusal('not_found', 'No such revision.');
        const parsed = parseSummary(prior.summary);
        const treeHash = prior.tree_hash ? String(prior.tree_hash) : null;
        const fields: HexFields = {
            hexKey,
            rev: nextRev(sql, hexKey, baseRev),
            at: now,
            deleted: Number(prior.deleted) ? 1 : 0,
            baseHash: parsed.baseHash,
            treeHash,
            engineVersion: parsed.engineVersion,
            roll: parsed.roll,
            action: 'revert',
            entry: parsed.entry ?? emptyEntry(treeHash),
        };
        if (current(sql, hexKey)) updateHex(sql, fields);
        else insertHex(sql, fields);
        return rowOf(current(sql, hexKey)!, pin);
    });
}

function jobBlob(raw: unknown): JobBlob {
    if (typeof raw !== 'string' || !raw) return { failures: [], skipped: 0 };
    try {
        const parsed = JSON.parse(raw) as JobBlob;
        return {
            failures: Array.isArray(parsed.failures) ? parsed.failures : [],
            skipped: typeof parsed.skipped === 'number' ? parsed.skipped : 0,
            undone: parsed.undone === true,
            written: parsed.written && typeof parsed.written === 'object' ? parsed.written : {},
            placed: Array.isArray(parsed.placed) ? parsed.placed.filter((key) => typeof key === 'string') : [],
            leftEmpty: typeof parsed.leftEmpty === 'number' && parsed.leftEmpty > 0 ? parsed.leftEmpty : 0,
            applied: Array.isArray(parsed.applied) ? parsed.applied : [],
            objectBytes: typeof parsed.objectBytes === 'number' && parsed.objectBytes > 0 ? parsed.objectBytes : 0,
            bytesSettled: typeof parsed.bytesSettled === 'number' && parsed.bytesSettled > 0 ? parsed.bytesSettled : 0,
            error: typeof parsed.error === 'string' && parsed.error.length > 0 ? parsed.error : undefined,
        };
    } catch {
        return { failures: [], skipped: 0 };
    }
}

function jobOf(record: SqlRow): JobRow {
    const blob = jobBlob(record.failures);
    return BuilderJob.parse({
        id: String(record.id),
        kind: 'generate',
        state: String(record.state),
        total: Number(record.total),
        done: Number(record.done),
        failed: Number(record.failed),
        skipped: blob.skipped,
        leftEmpty: blob.leftEmpty ?? 0,
        placed: blob.placed ?? [],
        failures: blob.failures,
        createdAt: String(record.created_at),
        finishedAt: record.finished_at ? String(record.finished_at) : null,
        ...(blob.error ? { error: blob.error } : {}),
    });
}

export type JobSpec = {
    hexKeys: string[];
    edition: string;
    generator: string;
    roll: number;
    filledToo: boolean;
    /** Absent on a job stored before density. Treated as `every`. */
    density?: 'every' | 'sparse' | 'standard' | 'dense';
    seed: string;
    settings: Record<string, unknown>;
    engineVersion: string;
    captured: Record<string, Captured>;
    /** Sectors this act made, at the rev they were made. Absent on a generate that made none. */
    madeSectors?: { id: string; rev: number }[];
};

/** Insert a queued job. Caller holds the transaction when the insert shares one with sector rows. */
export function insertJob(sql: Sql, id: string, spec: JobSpec, pin: Pin, now: string): JobRow {
    const captured: Record<string, Captured> = {};
    for (const hexKey of spec.hexKeys) {
        requireKey(hexKey);
        const row = current(sql, hexKey);
        if (!row) captured[hexKey] = null;
        else {
            const parsed = parseSummary(row.summary);
            captured[hexKey] = {
                rev: Number(row.rev),
                treeHash: row.tree_hash ? String(row.tree_hash) : null,
                baseHash: row.base_hash ? String(row.base_hash) : null,
                roll: Number(row.roll) || parsed.roll,
                deleted: Number(row.deleted) ? 1 : 0,
                engineVersion: row.engine_version ? String(row.engine_version) : parsed.engineVersion,
                entry: parsed.entry ?? emptyEntry(row.tree_hash ? String(row.tree_hash) : null),
            };
        }
    }
    const stored: JobSpec = { ...spec, captured };
    sql.exec(`INSERT INTO meta (key, value) VALUES (?, ?)`, `job:${id}`, JSON.stringify(stored));
    sql.exec(
        `INSERT INTO jobs (id, kind, state, total, done, failed, failures, created_at, finished_at)
         VALUES (?, 'generate', 'queued', ?, 0, 0, ?, ?, NULL)`,
        id, spec.hexKeys.length, JSON.stringify({ failures: [], skipped: 0, leftEmpty: 0, written: {}, placed: [], applied: [] }), now,
    );
    sql.exec(
        `INSERT INTO snapshots (id, at, label, trigger, manifest_hash, bytes)
         VALUES (?, ?, ?, 'generate', '', ?)`,
        id, now, 'Before generate', JSON.stringify(captured).length,
    );
    void pin;
    return jobOf(sql.exec(`SELECT * FROM jobs WHERE id = ?`, id)[0]);
}

export function createJob(sql: Sql, id: string, spec: JobSpec, pin: Pin, now: string): JobRow {
    return sql.transaction(() => insertJob(sql, id, spec, pin, now));
}

/** The stored job, its blob, and its spec. */
export function readJobBundle(sql: Sql, id: string): { state: string; blob: JobBlob; spec: JobSpec } {
    const row = sql.exec(`SELECT * FROM jobs WHERE id = ?`, id)[0];
    if (!row) throw new HexRefusal('not_found', 'No such job.');
    return { state: String(row.state), blob: jobBlob(row.failures), spec: readJobSpec(sql, id) };
}

export function saveJobBlob(sql: Sql, id: string, blob: JobBlob): void {
    sql.exec(`UPDATE jobs SET failures = ? WHERE id = ?`, JSON.stringify(blob), id);
}

/** A queued or running job becomes stopped. A finished job is left as it is. */
export function markJobStopped(sql: Sql, id: string, now: string): void {
    const row = sql.exec(`SELECT * FROM jobs WHERE id = ?`, id)[0];
    if (!row) throw new HexRefusal('not_found', 'No such job.');
    if (row.state !== 'queued' && row.state !== 'running') return;
    sql.exec(`UPDATE jobs SET state = 'stopped', finished_at = ? WHERE id = ?`, now, id);
}

export function requireWrittenRev(sql: Sql, hexKey: string, rev: number, pin: Pin): void {
    requireKey(hexKey);
    const row = current(sql, hexKey);
    const live = row ? Number(row.rev) : 0;
    if (live !== rev) throw new HexRefusal('conflict', 'This hex changed. Reload it, then try again.', { code: 'hex_changed', current: view(sql, hexKey, pin) });
}

/** Put one written hex back to the row captured at job create. The row is deleted when there was none. */
export function undoWrittenHex(sql: Sql, hexKey: string, writtenRev: number, prior: Captured, pin: Pin, now: string): { toRev: number; baseRev: number } {
    requireWrittenRev(sql, hexKey, writtenRev, pin);
    if (!prior) {
        sql.exec(`DELETE FROM hexes WHERE hex_key = ?`, hexKey);
        return { toRev: writtenRev, baseRev: 0 };
    }
    const fields: HexFields = {
        hexKey,
        rev: nextRev(sql, hexKey, writtenRev),
        at: now,
        deleted: prior.deleted,
        baseHash: prior.baseHash,
        treeHash: prior.treeHash,
        engineVersion: prior.engineVersion,
        roll: prior.roll,
        action: 'undo',
        entry: prior.entry ?? emptyEntry(prior.treeHash),
    };
    updateHex(sql, fields);
    return { toRev: writtenRev, baseRev: Number(current(sql, hexKey)!.rev) };
}

export function readJob(sql: Sql, id: string, since = 0): JobRow {
    const rows = sql.exec(`SELECT * FROM jobs WHERE id = ?`, id);
    if (!rows[0]) throw new HexRefusal('not_found', 'No such job.');
    const job = jobOf(rows[0]);
    if (since <= 0) return job;
    return { ...job, placed: job.placed.slice(since) };
}

export type SliceHex = { state: string; treeHash: string | null; baseHash: string | null };

/** One slice of a job: its keys, the pin, and the rows those keys already have. */
export function readJobSlice(sql: Sql, id: string, offset: number, count: number): {
    job: { state: string; done: number; total: number; applied: number[]; objectBytes: number; bytesSettled: number };
    pin: { truthVersion: string | null };
    spec: {
        hexKeys: string[];
        total: number;
        edition: string;
        generator: string;
        roll: number;
        filledToo: boolean;
        density?: JobSpec['density'];
        seed: string;
        settings: Record<string, unknown>;
        engineVersion: string;
        captured: Record<string, Captured>;
    };
    rows: Array<SliceHex | null>;
} {
    if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(count) || count < 1 || count > BUILDER_LIMITS.batch) {
        throw new HexRefusal('validation', 'Invalid request.');
    }
    const pin = readPin(sql);
    if (!pin) throw new HexRefusal('validation', 'This universe has no generation pin. Open it again.');
    const jobRow = sql.exec(`SELECT state, done, total, failures FROM jobs WHERE id = ?`, id)[0];
    if (!jobRow) throw new HexRefusal('not_found', 'No such job.');
    const blob = jobBlob(jobRow.failures);
    const spec = readJobSpec(sql, id);
    const hexKeys = spec.hexKeys.slice(offset, offset + count);
    const captured: Record<string, Captured> = {};
    for (const hexKey of hexKeys) captured[hexKey] = spec.captured[hexKey] ?? null;
    return {
        job: {
            state: String(jobRow.state),
            done: Number(jobRow.done),
            total: Number(jobRow.total),
            applied: blob.applied ?? [],
            objectBytes: blob.objectBytes ?? 0,
            bytesSettled: blob.bytesSettled ?? 0,
        },
        pin: { truthVersion: pin.truthVersion },
        spec: {
            hexKeys,
            total: spec.hexKeys.length,
            edition: spec.edition,
            generator: spec.generator,
            roll: spec.roll,
            filledToo: spec.filledToo,
            density: spec.density,
            seed: spec.seed,
            settings: spec.settings,
            engineVersion: spec.engineVersion,
            captured,
        },
        rows: readSliceRows(sql, hexKeys, pin),
    };
}

function readSliceRows(sql: Sql, hexKeys: string[], pin: Pin): Array<SliceHex | null> {
    if (hexKeys.length === 0) return [];
    const marks = hexKeys.map(() => '?').join(', ');
    const found = sql.exec(
        `SELECT hex_key, deleted, tree_hash, base_hash FROM hexes WHERE hex_key IN (${marks})`,
        ...hexKeys,
    );
    const byKey = new Map(found.map((row) => [String(row.hex_key), row]));
    return hexKeys.map((hexKey) => {
        const row = byKey.get(hexKey);
        if (!row) return null;
        return {
            state: placeOf(Number(row.deleted) ? 1 : 0, pin, hexKey),
            treeHash: row.tree_hash ? String(row.tree_hash) : null,
            baseHash: row.base_hash ? String(row.base_hash) : null,
        };
    });
}

export function readJobState(sql: Sql, id: string): { state: string } {
    const row = sql.exec(`SELECT state FROM jobs WHERE id = ?`, id)[0];
    if (!row) throw new HexRefusal('not_found', 'No such job.');
    return { state: String(row.state) };
}

export function readJobSpec(sql: Sql, id: string): JobSpec {
    const rows = sql.exec(`SELECT value FROM meta WHERE key = ?`, `job:${id}`);
    if (!rows[0] || typeof rows[0].value !== 'string') throw new HexRefusal('not_found', 'No such job.');
    return JSON.parse(rows[0].value) as JobSpec;
}

export function stopJob(sql: Sql, id: string, now: string): JobRow {
    return sql.transaction(() => {
        const row = sql.exec(`SELECT * FROM jobs WHERE id = ?`, id)[0];
        if (!row) throw new HexRefusal('not_found', 'No such job.');
        if (row.state === 'done' || row.state === 'failed' || row.state === 'stopped') return jobOf(row);
        sql.exec(`UPDATE jobs SET state = 'stopped', finished_at = ? WHERE id = ?`, now, id);
        return jobOf(sql.exec(`SELECT * FROM jobs WHERE id = ?`, id)[0]);
    });
}

export type BatchWrite = GeneratedWrite & { capturedRev: number };

export function applyJobBatch(sql: Sql, id: string, offset: number, writes: BatchWrite[], skipped: string[], failures: BuilderFailure[], pin: Pin, now: string, finished: boolean, leftEmpty: string[] = [], addedBytes = 0): JobRow {
    return sql.transaction(() => {
        const row = sql.exec(`SELECT * FROM jobs WHERE id = ?`, id)[0];
        if (!row) throw new HexRefusal('not_found', 'No such job.');
        const blob = jobBlob(row.failures);
        if (blob.undone) return jobOf(row);
        if (blob.applied?.includes(offset)) return jobOf(row);
        const written = { ...(blob.written ?? {}) };
        const placed = [...(blob.placed ?? [])];
        const batchFailures = [...failures];
        let appliedWrites = 0;
        for (const write of writes) {
            const live = current(sql, write.hexKey);
            const rev = live ? Number(live.rev) : 0;
            if (rev !== write.capturedRev) {
                batchFailures.push({ hexKey: write.hexKey, reason: 'conflict' });
                continue;
            }
            const next = writeGenerated(sql, { ...write, baseRev: rev }, pin, now);
            written[write.hexKey] = next.rev;
            placed.push(write.hexKey);
            appliedWrites += 1;
        }
        const nextBlob: JobBlob = {
            failures: [...blob.failures, ...batchFailures].slice(0, 100),
            skipped: blob.skipped + skipped.length,
            leftEmpty: (blob.leftEmpty ?? 0) + leftEmpty.length,
            undone: blob.undone,
            written,
            placed,
            applied: [...(blob.applied ?? []), offset],
            objectBytes: (blob.objectBytes ?? 0) + (Number.isFinite(addedBytes) && addedBytes > 0 ? Math.floor(addedBytes) : 0),
        };
        const done = Math.min(Number(row.total), Number(row.done) + appliedWrites + skipped.length + batchFailures.length + leftEmpty.length);
        const failed = Number(row.failed) + batchFailures.length;
        const stopped = row.state === 'stopped';
        // The count closes the job. A tail slice can land before an earlier one,
        // and `finished` on that tail must not close the job early.
        const complete = stopped || done >= Number(row.total);
        void finished;
        let state = 'running';
        if (complete && stopped) state = 'stopped';
        else if (complete) {
            const kept = Object.keys(written).length > 0 || nextBlob.skipped > 0;
            state = !kept && nextBlob.failures.length > 0 ? 'failed' : 'done';
        }
        const finishedAt = complete ? (row.finished_at ? String(row.finished_at) : now) : null;
        sql.exec(
            `UPDATE jobs SET state = ?, done = ?, failed = ?, failures = ?, finished_at = ? WHERE id = ?`,
            state, done, failed, JSON.stringify(nextBlob), finishedAt, id,
        );
        return jobOf(sql.exec(`SELECT * FROM jobs WHERE id = ?`, id)[0]);
    });
}

export function undoJob(sql: Sql, id: string, pin: Pin, now: string): BuilderJobUndo {
    return sql.transaction(() => {
        const row = sql.exec(`SELECT * FROM jobs WHERE id = ?`, id)[0];
        if (!row) throw new HexRefusal('not_found', 'No such job.');
        if (row.state !== 'done' && row.state !== 'stopped') {
            throw new HexRefusal('validation', 'The job is still running.', { reason: 'running' });
        }
        const blob = jobBlob(row.failures);
        if (blob.undone) throw new HexRefusal('validation', 'Already undone.', { reason: 'already_undone' });
        const spec = readJobSpec(sql, id);
        let restored = 0;
        const conflicts: string[] = [];
        for (const [hexKey, rev] of Object.entries(blob.written ?? {})) {
            const live = current(sql, hexKey);
            const liveRev = live ? Number(live.rev) : 0;
            if (liveRev !== rev) {
                conflicts.push(hexKey);
                continue;
            }
            const prior = spec.captured[hexKey] ?? null;
            if (!prior) {
                sql.exec(`DELETE FROM hexes WHERE hex_key = ?`, hexKey);
            } else {
                const fields: HexFields = {
                    hexKey,
                    rev: nextRev(sql, hexKey, liveRev),
                    at: now,
                    deleted: prior.deleted,
                    baseHash: prior.baseHash,
                    treeHash: prior.treeHash,
                    engineVersion: prior.engineVersion,
                    roll: prior.roll,
                    action: 'undo',
                    entry: prior.entry ?? emptyEntry(prior.treeHash),
                };
                updateHex(sql, fields);
            }
            restored += 1;
        }
        blob.undone = true;
        sql.exec(`UPDATE jobs SET failures = ? WHERE id = ?`, JSON.stringify(blob), id);
        return { restored, conflicts };
    });
}

export type DotSourceRow = { local: string; holds: boolean; uwp: string };

/** Every referee row in these sectors. One query each. The caller bounds the list. */
export function readDotRows(sql: Sql, sectors: string[]): { sector: string; rows: DotSourceRow[] }[] {
    return sectors.map((sector) => {
        const rows = sql.exec(`SELECT local_hex, deleted, uwp FROM hexes WHERE sector_slug = ?`, sector);
        return {
            sector,
            rows: rows.map((row) => ({
                local: String(row.local_hex ?? ''),
                holds: Number(row.deleted) !== 1,
                uwp: typeof row.uwp === 'string' ? row.uwp : '',
            })),
        };
    });
}

export type HoldSourceRow = { local: string; present: boolean; holds: boolean };

/** Every referee row in these sectors. `holds` is a stored tree that is not removed. */
export function readHoldRows(sql: Sql, sectors: string[]): { sector: string; rows: HoldSourceRow[] }[] {
    return sectors.map((sector) => {
        const rows = sql.exec(`SELECT local_hex, deleted, tree_hash FROM hexes WHERE sector_slug = ?`, sector);
        return {
            sector,
            rows: rows.map((row) => ({
                local: String(row.local_hex ?? ''),
                present: true,
                holds: Number(row.deleted) !== 1 && typeof row.tree_hash === 'string' && row.tree_hash.length > 0,
            })),
        };
    });
}

export function countHexes(sql: Sql): number {
    const rows = sql.exec(`SELECT COUNT(*) AS n FROM hexes`);
    return Number(rows[0]?.n ?? 0);
}

/** Remember how much of this job has been added to the universe row. */
export function settleJobBytes(sql: Sql, id: string, bytes: number): number {
    return sql.transaction(() => {
        const row = sql.exec(`SELECT failures FROM jobs WHERE id = ?`, id)[0];
        if (!row) throw new HexRefusal('not_found', 'No such job.');
        const blob = jobBlob(row.failures);
        const settled = Math.max(blob.bytesSettled ?? 0, Number.isFinite(bytes) && bytes > 0 ? Math.floor(bytes) : 0);
        blob.bytesSettled = settled;
        sql.exec(`UPDATE jobs SET failures = ? WHERE id = ?`, JSON.stringify(blob), id);
        return settled;
    });
}

export function accountedBytes(sql: Sql, id: string): number {
    const row = sql.exec(`SELECT failures FROM jobs WHERE id = ?`, id)[0];
    if (!row) return 0;
    return jobBlob(row.failures).objectBytes ?? 0;
}

/** A queued or running job ends failed. A reason with a hex key is one failure. A reason with no hex key is `error`. */
export function markJobFailed(sql: Sql, id: string, now: string, reason?: string, hexKey?: string): void {
    sql.transaction(() => {
        const row = sql.exec(`SELECT * FROM jobs WHERE id = ?`, id)[0];
        if (!row) return;
        if (row.state !== 'queued' && row.state !== 'running') return;
        const blob = jobBlob(row.failures);
        let failed = Number(row.failed);
        if (reason) {
            const text = reason.slice(0, BUILDER_LIMITS.reason);
            if (hexKey && HEX_KEY.test(hexKey)) {
                blob.failures = [...blob.failures, { hexKey, reason: text }].slice(0, 100);
                failed += 1;
            } else {
                blob.error = text;
            }
        }
        sql.exec(
            `UPDATE jobs SET state = 'failed', failed = ?, failures = ?, finished_at = ? WHERE id = ?`,
            failed, JSON.stringify(blob), now, id,
        );
    });
}

function json(data: unknown, status = 200): Response {
    return Response.json({ ok: true, data }, { status });
}

function refused(err: unknown): Response | null {
    if (!(err instanceof HexRefusal)) return null;
    const status = err.code === 'conflict' ? 409 : err.code === 'not_found' ? 404 : 400;
    const error: { code: string; message: string; details?: unknown } = { code: err.code, message: err.message };
    if (err.details !== undefined) error.details = err.details;
    return Response.json({ ok: false, error }, { status });
}

async function bodyOf(request: Request): Promise<unknown> {
    try {
        return await request.json();
    } catch {
        throw new HexRefusal('validation', 'Invalid JSON.');
    }
}

/** Durable Object paths under the universe. Null when the path is not a builder path. */
export async function respondBuilder(sql: Sql, request: Request, now: string): Promise<Response | null> {
    const url = new URL(request.url);
    const path = url.pathname;
    const pin = readPin(sql);
    try {
        if (request.method === 'POST' && path === '/pin') {
            const incoming = await bodyOf(request) as Pin;
            if (!incoming || typeof incoming.seed !== 'string' || !incoming.settings) {
                throw new HexRefusal('validation', 'Invalid pin.');
            }
            return json(ensurePin(sql, {
                seed: incoming.seed,
                settings: incoming.settings,
                truthVersion: incoming.truthVersion ?? null,
            }));
        }
        if (request.method === 'GET' && path === '/pin') {
            if (!pin) throw new HexRefusal('not_found', 'No pin.');
            return json(pin);
        }
        if (request.method === 'GET' && path === '/hexes/hold-rows') {
            const raw = url.searchParams.get('sectors') ?? '';
            const sectors = raw.split(',').map((item) => item.trim()).filter(Boolean);
            if (sectors.length < 1 || sectors.length > 1280) throw new HexRefusal('validation', 'Invalid request.');
            if (!pin) return json(sectors.map((sector) => ({ sector, rows: [] })));
            return json(readHoldRows(sql, sectors));
        }
        if (request.method === 'GET' && path === '/hexes/dot-rows') {
            const raw = url.searchParams.get('sectors') ?? '';
            const sectors = raw.split(',').map((item) => item.trim()).filter(Boolean);
            if (sectors.length < 1 || sectors.length > 32) throw new HexRefusal('validation', 'Invalid request.');
            if (!pin) return json(sectors.map((sector) => ({ sector, rows: [] })));
            return json(readDotRows(sql, sectors));
        }
        if (!pin && request.method === 'GET' && path === '/hexes') return json({ items: [], nextCursor: null });
        if (!pin && request.method === 'GET' && path === '/hexes/count') return json({ count: 0 });
        if (path === '/sectors' || path.startsWith('/sectors/')) {
            const { respondSectors } = await import('./sectors.ts');
            return respondSectors(sql, request, now, pin);
        }
        if (!pin && (path.startsWith('/hex') || path.startsWith('/job'))) {
            throw new HexRefusal('validation', 'This universe has no generation pin. Open it again.');
        }
        if (request.method === 'GET' && path === '/hexes') {
            const sector = url.searchParams.get('sector') ?? '';
            const cursor = url.searchParams.get('cursor');
            const limit = Number(url.searchParams.get('limit') ?? '100');
            if (!Number.isInteger(limit)) throw new HexRefusal('validation', 'Invalid limit.');
            return json(readHexPage(sql, sector, cursor, limit, pin!));
        }
        if (request.method === 'GET' && path === '/hexes/count') return json({ count: countHexes(sql) });
        const one = /^\/hexes\/([^/]+)\/(\d{4})$/.exec(path);
        if (request.method === 'GET' && one) return json(readHex(sql, `${decodeURIComponent(one[1])}/${one[2]}`, pin!));
        if (request.method === 'POST' && path === '/hexes/apply') {
            return json(applyGenerated(sql, await bodyOf(request) as GeneratedWrite, pin!, now));
        }
        if (request.method === 'POST' && path === '/hexes/remove') {
            const body = await bodyOf(request) as { hexKey: string; baseRev: number; chart?: ChartHex | null };
            const chart = body.chart && SectorHex.safeParse(body.chart.entry).success ? body.chart : null;
            return json(removeHex(sql, body.hexKey, body.baseRev, pin!, now, chart));
        }
        if (request.method === 'POST' && path === '/hexes/restore') {
            const body = await bodyOf(request) as { hexKey: string; baseRev: number };
            return json(restoreHex(sql, body.hexKey, body.baseRev, pin!, now));
        }
        if (request.method === 'POST' && path === '/hexes/revert') {
            const body = await bodyOf(request) as { hexKey: string; toRev: number; baseRev: number };
            return json(revertHex(sql, body.hexKey, body.toRev, body.baseRev, pin!, now));
        }
        if (request.method === 'POST' && path === '/jobs') {
            const body = await bodyOf(request) as { id: string; spec: JobSpec };
            return json(createJob(sql, body.id, body.spec, pin!, now), 201);
        }
        const job = /^\/jobs\/([^/]+)$/.exec(path);
        if (request.method === 'GET' && job) {
            const raw = new URL(request.url).searchParams.get('since');
            const since = raw == null || raw === '' ? 0 : Number(raw);
            return json(readJob(sql, decodeURIComponent(job[1]), Number.isInteger(since) && since > 0 ? since : 0));
        }
        const spec = /^\/jobs\/([^/]+)\/spec$/.exec(path);
        if (request.method === 'GET' && spec) return json({ job: readJob(sql, decodeURIComponent(spec[1])), spec: readJobSpec(sql, decodeURIComponent(spec[1])) });
        const stop = /^\/jobs\/([^/]+)\/stop$/.exec(path);
        if (request.method === 'POST' && stop) return json(stopJob(sql, decodeURIComponent(stop[1]), now));
        const undo = /^\/jobs\/([^/]+)\/undo$/.exec(path);
        if (request.method === 'POST' && undo) return json(undoJob(sql, decodeURIComponent(undo[1]), pin!, now));
        const stateOnly = /^\/jobs\/([^/]+)\/state$/.exec(path);
        if (request.method === 'GET' && stateOnly) return json(readJobState(sql, decodeURIComponent(stateOnly[1])));
        const slice = /^\/jobs\/([^/]+)\/slice$/.exec(path);
        if (request.method === 'GET' && slice) {
            const offset = Number(url.searchParams.get('offset') ?? '0');
            const count = Number(url.searchParams.get('n') ?? '0');
            return json(readJobSlice(sql, decodeURIComponent(slice[1]), offset, count));
        }
        const fail = /^\/jobs\/([^/]+)\/fail$/.exec(path);
        if (request.method === 'POST' && fail) {
            const text = await request.text();
            let reason: string | undefined;
            let hexKey: string | undefined;
            if (text) {
                let body: { reason?: unknown; hexKey?: unknown };
                try {
                    body = JSON.parse(text) as { reason?: unknown; hexKey?: unknown };
                } catch {
                    throw new HexRefusal('validation', 'Invalid JSON.');
                }
                if (typeof body.reason === 'string') reason = body.reason;
                if (typeof body.hexKey === 'string') hexKey = body.hexKey;
            }
            markJobFailed(sql, decodeURIComponent(fail[1]), now, reason, hexKey);
            return json(readJob(sql, decodeURIComponent(fail[1])));
        }
        const settled = /^\/jobs\/([^/]+)\/settled$/.exec(path);
        if (request.method === 'POST' && settled) {
            const body = await bodyOf(request) as { bytes?: number };
            return json({ bytes: settleJobBytes(sql, decodeURIComponent(settled[1]), body.bytes ?? 0) });
        }
        const batch = /^\/jobs\/([^/]+)\/batch$/.exec(path);
        if (request.method === 'POST' && batch) {
            const body = await bodyOf(request) as {
                offset: number; writes: BatchWrite[]; skipped: string[]; failures: BuilderFailure[]; finished: boolean; leftEmpty?: string[]; addedBytes?: number;
            };
            const id = decodeURIComponent(batch[1]);
            const job = applyJobBatch(sql, id, body.offset, body.writes ?? [], body.skipped ?? [], body.failures ?? [], pin!, now, body.finished === true, body.leftEmpty ?? [], body.addedBytes ?? 0);
            return json({ ...job, objectBytes: accountedBytes(sql, id) });
        }
        return null;
    } catch (err) {
        const response = refused(err);
        if (response) return response;
        throw err;
    }
}
