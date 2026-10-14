/**
 * Sectors the referee made. The id is the hex-key sector segment and is not the grid slot.
 * Chart slots are refused by the Worker before this runs (`charted` on the door body).
 */
import {
    emptySubsectors,
    OwnSectorId,
    RefereeSector,
    SectorGenerateUndone,
    SectorGenerateUndo,
    SectorMake,
    SectorMove,
    SectorRename,
    SectorUndo,
    SubsectorLetter,
    SubsectorRename,
    type RefereeSector as SectorRow,
    type SubsectorNames,
} from '@voyage/shared';
import type { Sql, SqlRow } from './campaign';
import {
    HexRefusal,
    insertJob,
    markJobStopped,
    readJobBundle,
    requireWrittenRev,
    saveJobBlob,
    sectorOf,
    undoWrittenHex,
    writeGenerated,
    type GeneratedWrite,
    type JobSpec,
    type Pin,
} from './hexes.ts';

type Snapshot = {
    sector: {
        id: string;
        x: number;
        y: number;
        name: string;
        subsectors: SubsectorNames;
        deleted: boolean;
    };
    /** Hex rows to put back. Null leaves the hexes as they are. */
    hexes: SqlRow[] | null;
};

function json(data: unknown, status = 200): Response {
    return Response.json({ ok: true, data }, { status });
}

async function bodyOf(request: Request): Promise<unknown> {
    try {
        return await request.json();
    } catch {
        throw new HexRefusal('validation', 'Invalid JSON.');
    }
}

function namesOf(value: unknown): SubsectorNames {
    if (typeof value !== 'string' || value === '') return emptySubsectors();
    const parsed = JSON.parse(value) as unknown;
    const names = emptySubsectors();
    if (!Array.isArray(parsed)) return names;
    for (let i = 0; i < 16; i++) names[i] = typeof parsed[i] === 'string' ? parsed[i].slice(0, 80) : '';
    return names;
}

function view(row: SqlRow): SectorRow {
    return RefereeSector.parse({
        id: String(row.sector_slug),
        slot: { x: Number(row.x), y: Number(row.y) },
        name: String(row.display_name),
        subsectors: namesOf(row.subsectors),
        rev: Number(row.rev),
        deleted: Number(row.deleted) === 1,
    });
}

function live(sql: Sql, id: string): SqlRow | null {
    const rows = sql.exec(`SELECT * FROM sectors WHERE sector_slug = ? AND source = 'referee'`, id);
    return rows[0] ?? null;
}

function requireLive(sql: Sql, id: string): SqlRow {
    if (!OwnSectorId.safeParse(id).success) throw new HexRefusal('validation', 'That sector address is not valid. Check the address and try again.');
    const row = live(sql, id);
    if (!row || Number(row.deleted) === 1) throw new HexRefusal('not_found', 'No such sector.');
    return row;
}

function assertRev(row: SqlRow, baseRev: number): void {
    if (Number(row.rev) !== baseRev) {
        throw new HexRefusal('conflict', 'This sector changed. Reload it, then try again.', { current: view(row) });
    }
}

function slotTaken(sql: Sql, x: number, y: number, except: string): SqlRow | null {
    const rows = sql.exec(
        `SELECT * FROM sectors WHERE source = 'referee' AND deleted = 0 AND x = ? AND y = ? AND sector_slug != ?`,
        x, y, except,
    );
    return rows[0] ?? null;
}

function refuseSlot(sql: Sql, x: number, y: number, except: string, charted: boolean): void {
    if (charted) throw new HexRefusal('validation', 'That slot holds a charted sector.', { reason: 'charted' });
    const taken = slotTaken(sql, x, y, except);
    if (taken) throw new HexRefusal('conflict', 'That slot is in use. Choose another slot.', { code: 'slot_in_use', current: view(taken) });
}

function hexesOf(sql: Sql, id: string): SqlRow[] {
    return sql.exec(`SELECT * FROM hexes WHERE sector_slug = ?`, id);
}

function remember(sql: Sql, id: string, rev: number, at: string, action: string, payload: Snapshot): void {
    sql.exec(
        `INSERT INTO sector_history (sector_slug, rev, at, action, payload) VALUES (?, ?, ?, ?, ?)`,
        id, rev, at, action, JSON.stringify(payload),
    );
}

function writeSector(sql: Sql, row: {
    id: string; x: number; y: number; name: string; subsectors: SubsectorNames;
    rev: number; deleted: number; at: string;
}, existing: boolean): void {
    if (!existing) {
        sql.exec(
            `INSERT INTO sectors (sector_slug, display_name, x, y, source, subsectors, rev, deleted, updated_at)
             VALUES (?, ?, ?, ?, 'referee', ?, ?, ?, ?)`,
            row.id, row.name, row.x, row.y, JSON.stringify(row.subsectors), row.rev, row.deleted, row.at,
        );
        return;
    }
    sql.exec(
        `UPDATE sectors SET display_name = ?, x = ?, y = ?, subsectors = ?, rev = ?, deleted = ?, updated_at = ?
         WHERE sector_slug = ?`,
        row.name, row.x, row.y, JSON.stringify(row.subsectors), row.rev, row.deleted, row.at, row.id,
    );
}

function snapshotOf(row: SqlRow, hexes: SqlRow[] | null): Snapshot {
    const sector = view(row);
    return {
        sector: {
            id: sector.id,
            x: sector.slot.x,
            y: sector.slot.y,
            name: sector.name,
            subsectors: sector.subsectors,
            deleted: sector.deleted,
        },
        hexes,
    };
}

function chartedOf(body: unknown): boolean {
    return !!body && typeof body === 'object' && (body as { charted?: unknown }).charted === true;
}

function make(sql: Sql, id: string, name: string, x: number, y: number, charted: boolean, now: string): SectorRow {
    if (!OwnSectorId.safeParse(id).success) throw new HexRefusal('validation', 'That sector address is not valid. Check the address and try again.');
    if (live(sql, id)) throw new HexRefusal('conflict', 'That sector already exists.');
    refuseSlot(sql, x, y, id, charted);
    const subsectors = emptySubsectors();
    writeSector(sql, { id, x, y, name, subsectors, rev: 1, deleted: 0, at: now }, false);
    const row = live(sql, id)!;
    remember(sql, id, 1, now, 'make', snapshotOf(row, null));
    return view(row);
}

function rename(sql: Sql, id: string, name: string, baseRev: number, now: string): SectorRow {
    const row = requireLive(sql, id);
    assertRev(row, baseRev);
    const rev = baseRev + 1;
    const subsectors = namesOf(row.subsectors);
    writeSector(sql, { id, x: Number(row.x), y: Number(row.y), name, subsectors, rev, deleted: 0, at: now }, true);
    const next = live(sql, id)!;
    remember(sql, id, rev, now, 'rename', snapshotOf(next, null));
    return view(next);
}

function move(sql: Sql, id: string, x: number, y: number, baseRev: number, charted: boolean, now: string): SectorRow {
    const row = requireLive(sql, id);
    assertRev(row, baseRev);
    refuseSlot(sql, x, y, id, charted);
    const rev = baseRev + 1;
    writeSector(sql, {
        id, x, y, name: String(row.display_name), subsectors: namesOf(row.subsectors), rev, deleted: 0, at: now,
    }, true);
    const next = live(sql, id)!;
    remember(sql, id, rev, now, 'move', snapshotOf(next, null));
    return view(next);
}

function renameSubsector(sql: Sql, id: string, letter: string, name: string, baseRev: number, now: string): SectorRow {
    const row = requireLive(sql, id);
    assertRev(row, baseRev);
    const subsectors = namesOf(row.subsectors);
    subsectors[letter.charCodeAt(0) - 65] = name;
    const rev = baseRev + 1;
    writeSector(sql, {
        id, x: Number(row.x), y: Number(row.y), name: String(row.display_name), subsectors, rev, deleted: 0, at: now,
    }, true);
    const next = live(sql, id)!;
    remember(sql, id, rev, now, 'subsector', snapshotOf(next, null));
    return view(next);
}

function localIn(local: string, letter: string): boolean {
    if (!/^\d{4}$/.test(local)) return false;
    const col = Number(local.slice(0, 2));
    const row = Number(local.slice(2, 4));
    if (col < 1 || col > 32 || row < 1 || row > 40) return false;
    const found = String.fromCharCode(65 + Math.floor((row - 1) / 10) * 4 + Math.floor((col - 1) / 8));
    return found === letter;
}

function cell(value: unknown): string | number | null {
    if (value == null) return null;
    if (typeof value === 'number' || typeof value === 'string') return value;
    return String(value);
}

function restoreHexes(sql: Sql, hexes: SqlRow[]): void {
    for (const hex of hexes) {
        const key = String(hex.hex_key);
        const existing = sql.exec(`SELECT hex_key FROM hexes WHERE hex_key = ?`, key);
        if (existing.length) throw new HexRefusal('conflict', 'A hex in that copy is already stored.', { hexKey: key });
        sql.exec(
            `INSERT INTO hexes (
                hex_key, sector_slug, local_hex, rev, updated_at, deleted, base_hash, tree_hash,
                engine_version, type, name, uwp, allegiance, zone, bases, trade_codes, pbg, ix,
                summary, provenance, roll
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            key, cell(hex.sector_slug), cell(hex.local_hex), cell(hex.rev), cell(hex.updated_at), cell(hex.deleted),
            cell(hex.base_hash), cell(hex.tree_hash), cell(hex.engine_version), cell(hex.type), cell(hex.name), cell(hex.uwp),
            cell(hex.allegiance), cell(hex.zone), cell(hex.bases), cell(hex.trade_codes), cell(hex.pbg), cell(hex.ix),
            cell(hex.summary), cell(hex.provenance), typeof hex.roll === 'number' ? hex.roll : 0,
        );
    }
}

function dropHexes(sql: Sql, rows: SqlRow[]): void {
    for (const hex of rows) sql.exec(`DELETE FROM hexes WHERE hex_key = ?`, String(hex.hex_key));
}

function clearSubsector(sql: Sql, id: string, letter: string, baseRev: number, now: string): { sector: SectorRow; removed: number } {
    const row = requireLive(sql, id);
    assertRev(row, baseRev);
    const gone = hexesOf(sql, id).filter((hex) => localIn(String(hex.local_hex), letter));
    const rev = baseRev + 1;
    writeSector(sql, {
        id, x: Number(row.x), y: Number(row.y), name: String(row.display_name),
        subsectors: namesOf(row.subsectors), rev, deleted: 0, at: now,
    }, true);
    dropHexes(sql, gone);
    const next = live(sql, id)!;
    remember(sql, id, rev, now, 'clear', snapshotOf(next, gone));
    return { sector: view(next), removed: gone.length };
}

function removeSector(sql: Sql, id: string, baseRev: number, now: string): SectorRow {
    const row = requireLive(sql, id);
    assertRev(row, baseRev);
    const hexes = hexesOf(sql, id);
    const rev = baseRev + 1;
    const kept = snapshotOf(row, hexes);
    kept.sector.deleted = false;
    writeSector(sql, {
        id, x: Number(row.x), y: Number(row.y), name: String(row.display_name),
        subsectors: namesOf(row.subsectors), rev, deleted: 1, at: now,
    }, true);
    dropHexes(sql, hexes);
    remember(sql, id, rev, now, 'delete', kept);
    const next = live(sql, id)!;
    return view(next);
}

function undo(sql: Sql, id: string, toRev: number, baseRev: number, now: string): SectorRow {
    if (!OwnSectorId.safeParse(id).success) throw new HexRefusal('validation', 'That sector address is not valid. Check the address and try again.');
    const row = live(sql, id);
    if (!row) throw new HexRefusal('not_found', 'No such sector.');
    assertRev(row, baseRev);
    const history = sql.exec(`SELECT * FROM sector_history WHERE sector_slug = ? AND rev = ?`, id, toRev);
    const prior = history[0];
    if (!prior || typeof prior.payload !== 'string') throw new HexRefusal('not_found', 'No such revision.');
    const payload = JSON.parse(prior.payload) as Snapshot;
    if (!payload.sector.deleted) refuseSlot(sql, payload.sector.x, payload.sector.y, id, false);
    const rev = baseRev + 1;
    writeSector(sql, {
        id,
        x: payload.sector.x,
        y: payload.sector.y,
        name: payload.sector.name,
        subsectors: payload.sector.subsectors,
        rev,
        deleted: payload.sector.deleted ? 1 : 0,
        at: now,
    }, true);
    if (payload.hexes) restoreHexes(sql, payload.hexes);
    const next = live(sql, id)!;
    remember(sql, id, rev, now, 'undo', snapshotOf(next, null));
    return view(next);
}

const SLOT_SLUG = /^~slot_(-?\d+)_(-?\d+)$/;

export type GenerateCommit = {
    sectors: { id: string; name: string; x: number; y: number; charted: boolean }[];
    hex: GeneratedWrite | null;
    job: { id: string; spec: JobSpec } | null;
};

/** Rewrite `~slot_<x>_<y>/<hhhh>` to the new sector id. Every seed must have a hex, and every such hex must name a seed. */
export function resolveMadeSectors(
    hexKeys: string[],
    seeds: { name: string; slot: { x: number; y: number } }[],
    ids: string[],
): { sectors: { id: string; name: string; x: number; y: number }[]; hexKeys: string[] } {
    if (ids.length !== seeds.length) throw new HexRefusal('validation', 'Invalid request.');
    const bySlot = new Map<string, { id: string; name: string; x: number; y: number }>();
    for (let i = 0; i < seeds.length; i++) {
        const seed = seeds[i]!;
        const key = `${seed.slot.x},${seed.slot.y}`;
        if (bySlot.has(key)) throw new HexRefusal('validation', 'You named that slot twice. Name each slot once.');
        if (!OwnSectorId.safeParse(ids[i]).success) throw new HexRefusal('validation', 'That sector address is not valid. Check the address and try again.');
        bySlot.set(key, { id: ids[i]!, name: seed.name, x: seed.slot.x, y: seed.slot.y });
    }
    const used = new Set<string>();
    const rewritten = hexKeys.map((hexKey) => {
        const slash = hexKey.indexOf('/');
        const slug = slash < 0 ? hexKey : hexKey.slice(0, slash);
        const local = slash < 0 ? '' : hexKey.slice(slash + 1);
        if (!slug.startsWith('~slot_')) return hexKey;
        const match = SLOT_SLUG.exec(slug);
        if (!match) throw new HexRefusal('validation', 'A hex names a slot that is not being made.');
        const slotKey = `${Number(match[1])},${Number(match[2])}`;
        const sector = bySlot.get(slotKey);
        if (!sector) throw new HexRefusal('validation', 'A hex names a slot that is not being made.');
        used.add(slotKey);
        return `${sector.id}/${local}`;
    });
    for (const key of bySlot.keys()) {
        if (!used.has(key)) throw new HexRefusal('validation', 'Add at least one hex to this new sector.');
    }
    return { sectors: [...bySlot.values()], hexKeys: rewritten };
}

/** Sectors, and either one hex or one job, in one transaction. A throw leaves no sector row. */
export function commitGenerate(sql: Sql, commit: GenerateCommit, pin: Pin, now: string): { sectors: SectorRow[]; hex: ReturnType<typeof writeGenerated> | null; jobId: string | null } {
    return sql.transaction(() => {
        const sectors = commit.sectors.map((sector) => make(sql, sector.id, sector.name, sector.x, sector.y, sector.charted, now));
        const hex = commit.hex ? writeGenerated(sql, commit.hex, pin, now) : null;
        if (hex && sectors.length === 1) {
            sql.exec(
                `INSERT INTO meta (key, value) VALUES (?, ?)`,
                `generateAct:${sectors[0]!.id}`,
                JSON.stringify({ hexKey: hex.hexKey, rev: hex.rev }),
            );
        }
        const jobId = commit.job
            ? insertJob(sql, commit.job.id, {
                ...commit.job.spec,
                madeSectors: sectors.map((sector) => ({ id: sector.id, rev: sector.rev })),
            }, pin, now).id
            : null;
        return { sectors, hex, jobId };
    });
}

function undoInline(sql: Sql, sectorId: string, baseRev: number, pin: Pin, now: string) {
    const row = requireLive(sql, sectorId);
    assertRev(row, baseRev);
    const stored = sql.exec(`SELECT value FROM meta WHERE key = ?`, `generateAct:${sectorId}`)[0];
    if (!stored || typeof stored.value !== 'string') throw new HexRefusal('validation', 'Nothing to undo.');
    const act = JSON.parse(stored.value) as { hexKey?: unknown; rev?: unknown };
    if (typeof act.hexKey !== 'string' || typeof act.rev !== 'number') throw new HexRefusal('validation', 'Nothing to undo.');
    requireWrittenRev(sql, act.hexKey, act.rev, pin);
    const deleted = removeSector(sql, sectorId, baseRev, now);
    return SectorGenerateUndone.parse({
        sectors: [{ id: deleted.id, toRev: deleted.rev, baseRev: deleted.rev }],
        restored: 1,
        hexes: [],
    });
}

function undoJobAct(sql: Sql, jobId: string, pin: Pin, now: string) {
    markJobStopped(sql, jobId, now);
    const bundle = readJobBundle(sql, jobId);
    if (bundle.blob.undone) throw new HexRefusal('validation', 'Already undone.', { reason: 'already_undone' });
    const made = bundle.spec.madeSectors ?? [];
    const madeIds = new Set(made.map((sector) => sector.id));
    for (const sector of made) {
        const row = live(sql, sector.id);
        if (!row || Number(row.deleted) === 1) throw new HexRefusal('not_found', 'No such sector.');
        assertRev(row, sector.rev);
    }
    const written = bundle.blob.written ?? {};
    for (const [hexKey, rev] of Object.entries(written)) requireWrittenRev(sql, hexKey, rev, pin);
    const sectors = made.map((sector) => {
        const deleted = removeSector(sql, sector.id, sector.rev, now);
        return { id: deleted.id, toRev: deleted.rev, baseRev: deleted.rev };
    });
    const hexes: { hexKey: string; toRev: number; baseRev: number }[] = [];
    let restored = 0;
    for (const [hexKey, rev] of Object.entries(written)) {
        restored += 1;
        if (madeIds.has(sectorOf(hexKey).sector)) continue;
        const prior = bundle.spec.captured[hexKey] ?? null;
        const back = undoWrittenHex(sql, hexKey, rev, prior, pin, now);
        hexes.push({ hexKey, ...back });
    }
    bundle.blob.undone = true;
    saveJobBlob(sql, jobId, bundle.blob);
    return SectorGenerateUndone.parse({ sectors, restored, hexes });
}

function list(sql: Sql): { items: SectorRow[] } {
    const rows = sql.exec(`SELECT * FROM sectors WHERE source = 'referee' AND deleted = 0 ORDER BY y, x, sector_slug`);
    return { items: rows.map(view) };
}

export async function respondSectors(sql: Sql, request: Request, now: string, pin: Pin | null): Promise<Response> {
    try {
        return await routeSector(sql, request, now, pin);
    } catch (err) {
        if (!(err instanceof HexRefusal)) throw err;
        const status = err.code === 'conflict' ? 409 : err.code === 'not_found' ? 404 : 400;
        const error: { code: string; message: string; details?: unknown } = { code: err.code, message: err.message };
        if (err.details !== undefined) error.details = err.details;
        return Response.json({ ok: false, error }, { status });
    }
}

async function routeSector(sql: Sql, request: Request, now: string, pin: Pin | null): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    if (request.method === 'GET' && path === '/sectors') {
        if (!pin) return json({ items: [] });
        return json(list(sql));
    }
    if (!pin) throw new HexRefusal('validation', 'This universe has no generation pin. Open it again.');
    if (request.method === 'POST' && path === '/sectors/generate') {
        const body = await bodyOf(request) as GenerateCommit;
        if (!body || !Array.isArray(body.sectors)) throw new HexRefusal('validation', 'Invalid request.');
        return json(commitGenerate(sql, body, pin, now));
    }
    if (request.method === 'POST' && path === '/sectors/undo-generate') {
        const parsed = SectorGenerateUndo.safeParse(await bodyOf(request));
        if (!parsed.success) throw new HexRefusal('validation', 'Invalid request.');
        const data = parsed.data;
        return json(sql.transaction(() => ('jobId' in data
            ? undoJobAct(sql, data.jobId, pin, now)
            : undoInline(sql, data.sectorId, data.baseRev, pin, now))));
    }
    if (request.method === 'POST' && path === '/sectors') {
        const body = await bodyOf(request) as { id?: string; name?: string; slot?: unknown; charted?: boolean };
        const parsed = SectorMake.safeParse({ name: body.name, slot: body.slot });
        if (!parsed.success || typeof body.id !== 'string') throw new HexRefusal('validation', 'Invalid request.');
        return json(sql.transaction(() => make(sql, body.id!, parsed.data.name, parsed.data.slot.x, parsed.data.slot.y, chartedOf(body), now)), 201);
    }
    const subClear = /^\/sectors\/([^/]+)\/subsectors\/([A-P])\/clear$/.exec(path);
    if (request.method === 'POST' && subClear) {
        const body = await bodyOf(request) as { baseRev?: number };
        if (typeof body.baseRev !== 'number') throw new HexRefusal('validation', 'Invalid request.');
        const sectorId = decodeURIComponent(subClear[1]);
        const letter = subClear[2];
        return json(sql.transaction(() => clearSubsector(sql, sectorId, letter, body.baseRev as number, now)));
    }
    const sub = /^\/sectors\/([^/]+)\/subsectors\/([A-P])$/.exec(path);
    if (request.method === 'POST' && sub) {
        const parsed = SubsectorRename.safeParse(await bodyOf(request));
        if (!parsed.success) throw new HexRefusal('validation', 'Invalid request.');
        if (!SubsectorLetter.safeParse(sub[2]).success) throw new HexRefusal('validation', 'Invalid subsector.');
        return json(sql.transaction(() => renameSubsector(sql, decodeURIComponent(sub[1]), sub[2], parsed.data.name, parsed.data.baseRev, now)));
    }
    const one = /^\/sectors\/([^/]+)\/(rename|move|delete|undo)$/.exec(path);
    if (request.method === 'POST' && one) {
        const id = decodeURIComponent(one[1]);
        const action = one[2];
        const body = await bodyOf(request);
        if (action === 'rename') {
            const parsed = SectorRename.safeParse(body);
            if (!parsed.success) throw new HexRefusal('validation', 'Invalid request.');
            return json(sql.transaction(() => rename(sql, id, parsed.data.name, parsed.data.baseRev, now)));
        }
        if (action === 'move') {
            const record = body && typeof body === 'object' ? body as { slot?: unknown; baseRev?: unknown; charted?: boolean } : {};
            const parsed = SectorMove.safeParse({ slot: record.slot, baseRev: record.baseRev });
            if (!parsed.success) throw new HexRefusal('validation', 'Invalid request.');
            return json(sql.transaction(() => move(sql, id, parsed.data.slot.x, parsed.data.slot.y, parsed.data.baseRev, chartedOf(body), now)));
        }
        if (action === 'delete') {
            const baseRev = body && typeof body === 'object' ? (body as { baseRev?: unknown }).baseRev : undefined;
            if (typeof baseRev !== 'number') throw new HexRefusal('validation', 'Invalid request.');
            return json(sql.transaction(() => removeSector(sql, id, baseRev, now)));
        }
        const parsed = SectorUndo.safeParse(body);
        if (!parsed.success) throw new HexRefusal('validation', 'Invalid request.');
        return json(sql.transaction(() => undo(sql, id, parsed.data.toRev, parsed.data.baseRev, now)));
    }
    throw new HexRefusal('not_found', 'No such route.');
}

/**
 * An own sector made by an import (contracts/b_marketplace.md F13). The Worker
 * chose a slot no chart sector holds; the slot rules are the same as for make.
 * An id that is already live is kept (an update of the same import).
 */
export function makeImportSector(sql: Sql, id: string, name: string, x: number, y: number, now: string): boolean {
    const row = live(sql, id);
    if (row && Number(row.deleted) !== 1) return false;
    if (!row) {
        make(sql, id, name, x, y, false, now);
        return true;
    }
    refuseSlot(sql, x, y, id, false);
    const rev = Number(row.rev) + 1;
    writeSector(sql, { id, x, y, name, subsectors: emptySubsectors(), rev, deleted: 0, at: now }, true);
    remember(sql, id, rev, now, 'make', snapshotOf(live(sql, id)!, null));
    return true;
}

/** Removing an import (contracts/b_marketplace.md F14): the sector it made goes, unless a system is still stored in it. */
export function dropImportSector(sql: Sql, id: string, now: string): boolean {
    const row = live(sql, id);
    if (!row || Number(row.deleted) === 1 || hexesOf(sql, id).length) return false;
    const rev = Number(row.rev) + 1;
    const sector = view(row);
    writeSector(sql, { id, x: sector.slot.x, y: sector.slot.y, name: sector.name, subsectors: sector.subsectors, rev, deleted: 1, at: now }, true);
    remember(sql, id, rev, now, 'delete', snapshotOf(live(sql, id) ?? row, null));
    return true;
}