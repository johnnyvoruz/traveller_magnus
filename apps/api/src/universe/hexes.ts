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

type JobBlob = {
    failures: BuilderFailure[];
    skipped: number;
    undone?: boolean;
    written?: Record<string, number>;
    applied?: number[];
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
        state: ownMap(pin) ? 'own' : 'truth',
        treeHash: null,
        baseHash: null,
        roll: 0,
        rev: 0,
    });
}

function placeOf(deleted: number, pin: Pin): HexRow['state'] {
    if (deleted) return 'removed';
    return ownMap(pin) ? 'own' : 'override';
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
        state: placeOf(Number(record.deleted) ? 1 : 0, pin),
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
    if (!HEX_KEY.test(hexKey)) throw new HexRefusal('validation', 'Invalid hex key.');
}

function assertRev(sql: Sql, hexKey: string, baseRev: number, pin: Pin): SqlRow | null {
    const row = current(sql, hexKey);
    const rev = row ? Number(row.rev) : 0;
    if (rev !== baseRev) throw new HexRefusal('conflict', 'The hex changed.', { current: view(sql, hexKey, pin) });
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

function writeGenerated(sql: Sql, write: GeneratedWrite, pin: Pin, now: string): HexRow {
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
            if (ownMap(pin) || !chart) throw new HexRefusal('validation', 'Nothing to remove.', { reason: 'empty' });
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
        if (ownMap(pin)) {
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
        if (ownMap(pin)) throw new HexRefusal('validation', 'This universe has no chart.', { reason: 'no_chart' });
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
            applied: Array.isArray(parsed.applied) ? parsed.applied : [],
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
        failures: blob.failures,
        createdAt: String(record.created_at),
        finishedAt: record.finished_at ? String(record.finished_at) : null,
    });
}

export type JobSpec = {
    hexKeys: string[];
    edition: string;
    generator: string;
    roll: number;
    filledToo: boolean;
    seed: string;
    settings: Record<string, unknown>;
    engineVersion: string;
    captured: Record<string, Captured>;
};

export function createJob(sql: Sql, id: string, spec: JobSpec, pin: Pin, now: string): JobRow {
    return sql.transaction(() => {
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
            id, spec.hexKeys.length, JSON.stringify({ failures: [], skipped: 0, written: {}, applied: [] }), now,
        );
        sql.exec(
            `INSERT INTO snapshots (id, at, label, trigger, manifest_hash, bytes)
             VALUES (?, ?, ?, 'generate', '', ?)`,
            id, now, 'Before generate', JSON.stringify(captured).length,
        );
        void pin;
        return jobOf(sql.exec(`SELECT * FROM jobs WHERE id = ?`, id)[0]);
    });
}

export function readJob(sql: Sql, id: string): JobRow {
    const rows = sql.exec(`SELECT * FROM jobs WHERE id = ?`, id);
    if (!rows[0]) throw new HexRefusal('not_found', 'No such job.');
    return jobOf(rows[0]);
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

export function applyJobBatch(sql: Sql, id: string, offset: number, writes: BatchWrite[], skipped: string[], failures: BuilderFailure[], pin: Pin, now: string, finished: boolean): JobRow {
    return sql.transaction(() => {
        const row = sql.exec(`SELECT * FROM jobs WHERE id = ?`, id)[0];
        if (!row) throw new HexRefusal('not_found', 'No such job.');
        const blob = jobBlob(row.failures);
        if (blob.applied?.includes(offset)) return jobOf(row);
        const written = { ...(blob.written ?? {}) };
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
            appliedWrites += 1;
        }
        const nextBlob: JobBlob = {
            failures: [...blob.failures, ...batchFailures].slice(0, 100),
            skipped: blob.skipped + skipped.length,
            undone: blob.undone,
            written,
            applied: [...(blob.applied ?? []), offset],
        };
        const done = Math.min(Number(row.total), Number(row.done) + appliedWrites + skipped.length + batchFailures.length);
        const failed = Number(row.failed) + batchFailures.length;
        const stopped = row.state === 'stopped';
        const complete = finished || stopped || done >= Number(row.total);
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

export function countHexes(sql: Sql): number {
    const rows = sql.exec(`SELECT COUNT(*) AS n FROM hexes`);
    return Number(rows[0]?.n ?? 0);
}

export function markJobFailed(sql: Sql, id: string, now: string): void {
    sql.exec(
        `UPDATE jobs SET state = 'failed', finished_at = ? WHERE id = ? AND state IN ('queued', 'running')`,
        now, id,
    );
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
        if (!pin && request.method === 'GET' && path === '/hexes') return json({ items: [], nextCursor: null });
        if (!pin && request.method === 'GET' && path === '/hexes/count') return json({ count: 0 });
        if (!pin && (path.startsWith('/hex') || path.startsWith('/job'))) {
            throw new HexRefusal('validation', 'The universe has no generation pin.');
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
        if (request.method === 'GET' && job) return json(readJob(sql, decodeURIComponent(job[1])));
        const spec = /^\/jobs\/([^/]+)\/spec$/.exec(path);
        if (request.method === 'GET' && spec) return json({ job: readJob(sql, decodeURIComponent(spec[1])), spec: readJobSpec(sql, decodeURIComponent(spec[1])) });
        const stop = /^\/jobs\/([^/]+)\/stop$/.exec(path);
        if (request.method === 'POST' && stop) return json(stopJob(sql, decodeURIComponent(stop[1]), now));
        const undo = /^\/jobs\/([^/]+)\/undo$/.exec(path);
        if (request.method === 'POST' && undo) return json(undoJob(sql, decodeURIComponent(undo[1]), pin!, now));
        const fail = /^\/jobs\/([^/]+)\/fail$/.exec(path);
        if (request.method === 'POST' && fail) {
            markJobFailed(sql, decodeURIComponent(fail[1]), now);
            return json(readJob(sql, decodeURIComponent(fail[1])));
        }
        const batch = /^\/jobs\/([^/]+)\/batch$/.exec(path);
        if (request.method === 'POST' && batch) {
            const body = await bodyOf(request) as {
                offset: number; writes: BatchWrite[]; skipped: string[]; failures: BuilderFailure[]; finished: boolean;
            };
            return json(applyJobBatch(sql, decodeURIComponent(batch[1]), body.offset, body.writes ?? [], body.skipped ?? [], body.failures ?? [], pin!, now, body.finished === true));
        }
        return null;
    } catch (err) {
        const response = refused(err);
        if (response) return response;
        throw err;
    }
}
