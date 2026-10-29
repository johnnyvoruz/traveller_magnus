import { SURFACE_BODY_KEY, SURFACE_PAYLOAD_MAX, SURFACE_TOO_LARGE, SurfacePut } from '@voyage/shared';
import type { Sql } from './campaign.ts';
import { HexRefusal } from './hexes.ts';

const HEX_KEY = /^[^/]+\/\d{4}$/;

const SURFACE_CHANGED = 'This map changed. Reload it, then try again.';

const READ_FAILED = 'That request could not be read. Try again.';

export { SURFACE_TOO_LARGE };

/** The painted-surface table. Created on the object. No D1 migration. */
export function installSurfaceSchema(sql: Sql): void {
    sql.exec(`CREATE TABLE IF NOT EXISTS surfaces (
        hex_key TEXT NOT NULL,
        body_key TEXT NOT NULL,
        rev INTEGER NOT NULL,
        updated_at TEXT,
        payload TEXT,
        PRIMARY KEY (hex_key, body_key)
    )`);
}

function requireKeys(hexKey: string, bodyKey: string): void {
    if (!HEX_KEY.test(hexKey) || !SURFACE_BODY_KEY.test(bodyKey)) {
        throw new HexRefusal('validation', READ_FAILED);
    }
}

function payloadBytes(value: unknown): number {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

type Stored = { rev: number; edits: unknown };

function storedRow(sql: Sql, hexKey: string, bodyKey: string): Stored {
    const rows = sql.exec(
        `SELECT rev, payload FROM surfaces WHERE hex_key = ? AND body_key = ?`,
        hexKey,
        bodyKey,
    );
    const row = rows[0];
    if (!row) return { rev: 0, edits: null };
    let edits: unknown = null;
    if (typeof row.payload === 'string' && row.payload) {
        try {
            edits = JSON.parse(row.payload);
        } catch {
            edits = null;
        }
    }
    return { rev: Number(row.rev), edits };
}

export function readSurface(sql: Sql, hexKey: string, bodyKey: string): { rev: number; edits: unknown } {
    installSurfaceSchema(sql);
    requireKeys(hexKey, bodyKey);
    const row = storedRow(sql, hexKey, bodyKey);
    if (row.rev === 0 || row.edits == null) return { rev: 0, edits: null };
    return row;
}

/**
 * Writes one body's paint. `edits: null` deletes the row and the next read is
 * rev 0. A stale baseRev writes nothing. This does not touch the hex table.
 */
export function writeSurface(sql: Sql, hexKey: string, bodyKey: string, body: unknown, now: string): { rev: number; edits: unknown } {
    installSurfaceSchema(sql);
    requireKeys(hexKey, bodyKey);
    if (payloadBytes(body) > SURFACE_PAYLOAD_MAX) throw new HexRefusal('validation', SURFACE_TOO_LARGE);
    const parsed = SurfacePut.safeParse(body);
    if (!parsed.success) throw new HexRefusal('validation', READ_FAILED);
    const edits = parsed.data.edits;
    if (edits !== null && payloadBytes(edits) > SURFACE_PAYLOAD_MAX) {
        throw new HexRefusal('validation', SURFACE_TOO_LARGE);
    }
    const payload = edits === null ? null : JSON.stringify(edits);
    return sql.transaction(() => {
        const current = storedRow(sql, hexKey, bodyKey);
        const rev = current.edits == null ? 0 : current.rev;
        if (rev !== parsed.data.baseRev) {
            throw new HexRefusal('conflict', SURFACE_CHANGED, {
                code: 'surface_changed',
                current: { rev, edits: current.edits },
            });
        }
        if (payload === null) {
            sql.exec(`DELETE FROM surfaces WHERE hex_key = ? AND body_key = ?`, hexKey, bodyKey);
            return { rev: 0, edits: null };
        }
        const next = rev + 1;
        if (rev === 0) {
            sql.exec(
                `INSERT INTO surfaces (hex_key, body_key, rev, updated_at, payload) VALUES (?, ?, ?, ?, ?)`,
                hexKey, bodyKey, next, now, payload,
            );
        } else {
            sql.exec(
                `UPDATE surfaces SET rev = ?, updated_at = ?, payload = ? WHERE hex_key = ? AND body_key = ?`,
                next, now, payload, hexKey, bodyKey,
            );
        }
        return { rev: next, edits };
    });
}

/** Body key to the stored edits document. An absent table is no paint. */
export function surfacesForHex(sql: Sql, hexKey: string): Record<string, unknown> {
    let rows: ReturnType<Sql['exec']>;
    try {
        rows = sql.exec(`SELECT body_key, payload FROM surfaces WHERE hex_key = ?`, hexKey);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes('no such table')) return {};
        throw err;
    }
    const out: Record<string, unknown> = {};
    for (const row of rows) {
        if (typeof row.body_key !== 'string' || typeof row.payload !== 'string' || !row.payload) continue;
        try {
            const parsed = JSON.parse(row.payload) as unknown;
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) out[row.body_key] = parsed;
        } catch {
            // A payload that is not JSON does not leave with the package.
        }
    }
    return out;
}
