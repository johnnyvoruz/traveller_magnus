// nodejs_compat provides this module at runtime. The API tsconfig types only the Workers runtime.
// @ts-expect-error TS2591
import { createHash } from 'node:crypto';
import {
    CAMPAIGN_LIMITS,
    CampaignChanges,
    CampaignLink,
    CampaignRecord,
    type CampaignChangesResult,
    type CampaignClock,
    type CampaignLink as CampaignLinkRow,
    type CampaignPage,
    type CampaignRecord as CampaignRecordRow,
    type CampaignSettings,
    type LinkChange,
    type RecordChange,
} from '@voyage/shared';

/**
 * One statement per call. SELECT returns rows; other statements return none.
 * `transaction` runs `fn` as one unit: the adapter commits when `fn` returns
 * and rolls the unit back when `fn` throws. The Durable Object uses
 * `storage.transactionSync`. Campaign code does not send transaction SQL.
 */
export interface Sql {
    exec(query: string, ...params: Array<string | number | null>): SqlRow[];
    transaction<T>(fn: () => T): T;
}

export type SqlRow = Record<string, unknown>;

const RECORD_PROVENANCE = 'provenance' in CampaignRecord.shape;
const LINK_PROVENANCE = 'provenance' in CampaignLink.shape;

const ANCESTOR = 'An organization cannot be its own ancestor.';

export class CampaignRefusal extends Error {
    readonly code: 'validation' | 'too_large';
    readonly details: unknown;

    constructor(code: 'validation' | 'too_large', message: string, details?: unknown) {
        super(message);
        this.code = code;
        this.details = details;
    }
}

export function installCampaignSchema(sql: Sql): void {
    sql.exec(`CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)`);
    sql.exec(`CREATE TABLE IF NOT EXISTS campaign_records (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        kind TEXT NOT NULL,
        name TEXT NOT NULL,
        summary TEXT NOT NULL,
        details TEXT NOT NULL,
        tags TEXT NOT NULL,
        anchor TEXT,
        when_json TEXT,
        visibility TEXT NOT NULL,
        player_notes TEXT,
        sheet TEXT,
        status TEXT,
        images TEXT,
        provenance TEXT,
        rev INTEGER NOT NULL,
        seq INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted INTEGER NOT NULL
    )`);
    sql.exec(`CREATE INDEX IF NOT EXISTS campaign_records_seq ON campaign_records(seq)`);
    sql.exec(`CREATE INDEX IF NOT EXISTS campaign_records_type ON campaign_records(type)`);
    sql.exec(`CREATE TABLE IF NOT EXISTS campaign_links (
        id TEXT PRIMARY KEY,
        from_id TEXT NOT NULL,
        to_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        role TEXT NOT NULL,
        link_order INTEGER NOT NULL,
        since_json TEXT,
        until_json TEXT,
        notes TEXT NOT NULL,
        visibility TEXT NOT NULL,
        provenance TEXT,
        rev INTEGER NOT NULL,
        seq INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted INTEGER NOT NULL
    )`);
    sql.exec(`CREATE INDEX IF NOT EXISTS campaign_links_seq ON campaign_links(seq)`);
    sql.exec(`CREATE INDEX IF NOT EXISTS campaign_links_from_id ON campaign_links(from_id)`);
    sql.exec(`CREATE INDEX IF NOT EXISTS campaign_links_to_id ON campaign_links(to_id)`);
    sql.exec(`CREATE TABLE IF NOT EXISTS lists (
        kind TEXT PRIMARY KEY,
        rev INTEGER,
        updated_at TEXT,
        payload TEXT
    )`);
    sql.exec(`CREATE TABLE IF NOT EXISTS list_history (
        kind TEXT NOT NULL,
        rev INTEGER NOT NULL,
        at TEXT,
        action TEXT,
        payload_hash TEXT,
        PRIMARY KEY (kind, rev)
    )`);
    sql.exec(`INSERT INTO meta (key, value) VALUES ('schemaVersion', '2') ON CONFLICT(key) DO UPDATE SET value = '2'`);
    sql.exec(`INSERT INTO meta (key, value) VALUES ('campaignSeq', '0') ON CONFLICT(key) DO NOTHING`);
}

function text(value: unknown): string | null {
    return value == null ? null : String(value);
}

function jsonText(value: unknown): string | null {
    return value == null ? null : JSON.stringify(value);
}

function parseJson(value: unknown): unknown {
    if (value == null) return null;
    return JSON.parse(String(value));
}

function bit(value: unknown): boolean {
    return Number(value) === 1;
}

function nextSeq(sql: Sql): number {
    const rows = sql.exec(`SELECT value FROM meta WHERE key = 'campaignSeq'`);
    const seq = Number(rows[0]?.value ?? 0) + 1;
    sql.exec(
        `INSERT INTO meta (key, value) VALUES ('campaignSeq', ?) ON CONFLICT(key) DO UPDATE SET value = ?`,
        String(seq),
        String(seq),
    );
    return seq;
}

function countLive(sql: Sql, table: 'campaign_records' | 'campaign_links'): number {
    const rows = sql.exec(`SELECT COUNT(*) AS n FROM ${table} WHERE deleted = 0`);
    return Number(rows[0]?.n ?? 0);
}

function defaultSettings(): CampaignSettings {
    return {
        party: { vesselId: null, memberIds: [], anchor: null },
        kinds: {},
        calendar: { dateFormat: 'imperial' },
        rev: 0,
    };
}

function readSettings(sql: Sql): CampaignSettings {
    const rows = sql.exec(`SELECT payload FROM lists WHERE kind = 'campaignSettings'`);
    if (!rows.length || rows[0].payload == null) return defaultSettings();
    return parseJson(rows[0].payload) as CampaignSettings;
}

function readClock(sql: Sql): CampaignClock | null {
    const rows = sql.exec(`SELECT payload FROM lists WHERE kind = 'campaignTime'`);
    if (!rows.length || rows[0].payload == null) return null;
    return parseJson(rows[0].payload) as CampaignClock;
}

function recordFrom(row: SqlRow) {
    const record = {
        id: String(row.id),
        type: row.type,
        kind: String(row.kind),
        name: String(row.name),
        summary: String(row.summary),
        details: String(row.details),
        tags: parseJson(row.tags) ?? [],
        anchor: parseJson(row.anchor),
        when: parseJson(row.when_json),
        visibility: row.visibility,
        playerNotes: text(row.player_notes),
        sheet: parseJson(row.sheet),
        status: parseJson(row.status),
        images: parseJson(row.images),
        rev: Number(row.rev),
        createdAt: String(row.created_at),
        updatedAt: String(row.updated_at),
        deleted: bit(row.deleted),
    };
    if (!RECORD_PROVENANCE) return record;
    return { ...record, provenance: parseJson(row.provenance) };
}

function linkFrom(row: SqlRow) {
    const link = {
        id: String(row.id),
        from: String(row.from_id),
        to: String(row.to_id),
        kind: row.kind,
        role: String(row.role),
        order: Number(row.link_order),
        since: parseJson(row.since_json),
        until: parseJson(row.until_json),
        notes: String(row.notes),
        visibility: row.visibility,
        rev: Number(row.rev),
        createdAt: String(row.created_at),
        updatedAt: String(row.updated_at),
        deleted: bit(row.deleted),
    };
    if (!LINK_PROVENANCE) return link;
    return { ...link, provenance: parseJson(row.provenance) };
}

function loadRecord(sql: Sql, id: string): SqlRow | null {
    const rows = sql.exec(`SELECT * FROM campaign_records WHERE id = ?`, id);
    return rows[0] ?? null;
}

function loadLink(sql: Sql, id: string): SqlRow | null {
    const rows = sql.exec(`SELECT * FROM campaign_links WHERE id = ?`, id);
    return rows[0] ?? null;
}

function isFullRecord(change: RecordChange): change is Extract<RecordChange, { name: string }> {
    return 'name' in change;
}

function isFullLink(change: LinkChange): change is Extract<LinkChange, { from: string }> {
    return 'from' in change;
}

function provenanceParam(change: object, previous: unknown): string | null {
    if (!('provenance' in change)) return previous == null ? null : String(previous);
    const value = (change as { provenance?: unknown }).provenance;
    return value == null ? null : JSON.stringify(value);
}

function createsCycle(sql: Sql, linkId: string, fromId: string, toId: string): boolean {
    if (fromId === toId) return true;
    const seen = new Set<string>();
    const stack = [toId];
    while (stack.length) {
        const id = stack.pop();
        if (id == null) break;
        if (id === fromId) return true;
        if (seen.has(id)) continue;
        seen.add(id);
        const parents = sql.exec(
            `SELECT to_id FROM campaign_links WHERE kind = 'member' AND deleted = 0 AND from_id = ? AND id != ?`,
            id,
            linkId,
        );
        for (const row of parents) stack.push(String(row.to_id));
    }
    return false;
}

function liveRecord(sql: Sql, id: string): boolean {
    const rows = sql.exec(`SELECT deleted FROM campaign_records WHERE id = ?`, id);
    return rows.length > 0 && !bit(rows[0].deleted);
}

export function readCampaign(sql: Sql, afterSeq: number, limit: number): CampaignPage {
    const cap = Math.min(1000, Math.max(1, Math.floor(limit)));
    const records = sql.exec(
        `SELECT * FROM campaign_records WHERE seq > ? ORDER BY seq LIMIT ?`,
        afterSeq,
        cap + 1,
    );
    const links = sql.exec(
        `SELECT * FROM campaign_links WHERE seq > ? ORDER BY seq LIMIT ?`,
        afterSeq,
        cap + 1,
    );
    const merged = [
        ...records.map((row) => ({ seq: Number(row.seq), table: 'records' as const, row })),
        ...links.map((row) => ({ seq: Number(row.seq), table: 'links' as const, row })),
    ].sort((a, b) => a.seq - b.seq);
    const done = merged.length <= cap;
    const page = merged.slice(0, cap);
    const counter = sql.exec(`SELECT value FROM meta WHERE key = 'campaignSeq'`);
    const universeSeq = Number(counter[0]?.value ?? 0);
    const seq = done ? universeSeq : page[page.length - 1]?.seq ?? universeSeq;
    return {
        records: page.filter((item) => item.table === 'records').map((item) => recordFrom(item.row)) as CampaignPage['records'],
        links: page.filter((item) => item.table === 'links').map((item) => linkFrom(item.row)) as CampaignPage['links'],
        settings: readSettings(sql),
        clock: readClock(sql),
        seq,
        done,
    };
}

function tombstoneLinks(sql: Sql, recordId: string, now: string, applied: CampaignChangesResult['applied']): void {
    const links = sql.exec(
        `SELECT * FROM campaign_links WHERE deleted = 0 AND (from_id = ? OR to_id = ?)`,
        recordId,
        recordId,
    );
    for (const link of links) {
        const rev = Number(link.rev) + 1;
        const seq = nextSeq(sql);
        sql.exec(
            `UPDATE campaign_links SET deleted = 1, rev = ?, seq = ?, updated_at = ? WHERE id = ?`,
            rev,
            seq,
            now,
            String(link.id),
        );
        applied.push({ table: 'links', id: String(link.id), rev, seq });
    }
}

function requireRoom(sql: Sql, table: 'campaign_records' | 'campaign_links', wasLive: boolean, willLive: boolean): void {
    if (wasLive || !willLive) return;
    const cap = table === 'campaign_records' ? CAMPAIGN_LIMITS.records : CAMPAIGN_LIMITS.links;
    if (countLive(sql, table) >= cap) {
        const noun = table === 'campaign_records' ? 'records' : 'links';
        throw new CampaignRefusal('too_large', `${cap.toLocaleString('en-US')} live ${noun} per universe.`);
    }
}

export function applyCampaignChanges(sql: Sql, changes: unknown, now: string): CampaignChangesResult {
    const parsed = CampaignChanges.safeParse(changes);
    if (!parsed.success) {
        const tooLarge = parsed.error.issues.some((issue) => issue.message === 'too_large');
        throw new CampaignRefusal(
            tooLarge ? 'too_large' : 'validation',
            tooLarge ? 'This change is over the campaign limit.' : 'Invalid request.',
            parsed.error.flatten(),
        );
    }
    const input = parsed.data;
    const applied: CampaignChangesResult['applied'] = [];
    const conflicts: CampaignChangesResult['conflicts'] = [];
    return sql.transaction(() => {
        if (input.settings) {
            const stored = sql.exec(`SELECT rev, payload FROM lists WHERE kind = 'campaignSettings'`);
            const current = stored.length ? parseJson(stored[0].payload) as CampaignSettings : defaultSettings();
            if (input.settings.baseRev !== current.rev) {
                conflicts.push({ table: 'settings', id: 'campaignSettings', current });
            } else {
                const rev = current.rev + 1;
                const seq = nextSeq(sql);
                const { baseRev: _baseRev, ...body } = input.settings;
                const next = { ...body, rev };
                const payload = JSON.stringify(next);
                if (!stored.length) {
                    sql.exec(
                        `INSERT INTO lists (kind, rev, updated_at, payload) VALUES ('campaignSettings', ?, ?, ?)`,
                        rev,
                        now,
                        payload,
                    );
                } else {
                    sql.exec(
                        `UPDATE lists SET rev = ?, updated_at = ?, payload = ? WHERE kind = 'campaignSettings'`,
                        rev,
                        now,
                        payload,
                    );
                }
                applied.push({ table: 'settings', id: 'campaignSettings', rev, seq });
            }
        }
        if (input.clock) {
            const stored = sql.exec(`SELECT rev, payload FROM lists WHERE kind = 'campaignTime'`);
            const current = stored.length && stored[0].payload != null
                ? parseJson(stored[0].payload) as CampaignClock
                : null;
            const storedRev = current ? current.rev : 0;
            if (input.clock.baseRev !== storedRev) {
                conflicts.push({ table: 'clock', id: 'campaignTime', current });
            } else {
                const rev = storedRev + 1;
                const seq = nextSeq(sql);
                const next: CampaignClock = { days: input.clock.days, rev };
                const payload = JSON.stringify(next);
                if (!stored.length) {
                    sql.exec(
                        `INSERT INTO lists (kind, rev, updated_at, payload) VALUES ('campaignTime', ?, ?, ?)`,
                        rev,
                        now,
                        payload,
                    );
                } else {
                    sql.exec(
                        `UPDATE lists SET rev = ?, updated_at = ?, payload = ? WHERE kind = 'campaignTime'`,
                        rev,
                        now,
                        payload,
                    );
                }
                sql.exec(
                    `INSERT INTO list_history (kind, rev, at, action, payload_hash) VALUES ('campaignTime', ?, ?, 'set', ?)`,
                    rev,
                    now,
                    createHash('sha256').update(payload).digest('hex'),
                );
                applied.push({ table: 'clock', id: 'campaignTime', rev, seq });
            }
        }
        for (const change of input.records ?? []) {
            const stored = loadRecord(sql, change.id);
            if (!stored) {
                if (!isFullRecord(change) || change.baseRev !== 0) continue;
                requireRoom(sql, 'campaign_records', false, !change.deleted);
                const rev = 1;
                const seq = nextSeq(sql);
                sql.exec(
                    `INSERT INTO campaign_records (
                        id, type, kind, name, summary, details, tags, anchor, when_json, visibility,
                        player_notes, sheet, status, images, provenance, rev, seq, created_at, updated_at, deleted
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    change.id,
                    change.type,
                    change.kind,
                    change.name,
                    change.summary,
                    change.details,
                    JSON.stringify(change.tags),
                    jsonText(change.anchor),
                    jsonText(change.when),
                    change.visibility,
                    change.playerNotes,
                    jsonText(change.sheet),
                    jsonText(change.status),
                    jsonText(change.images),
                    provenanceParam(change, null),
                    rev,
                    seq,
                    now,
                    now,
                    change.deleted ? 1 : 0,
                );
                applied.push({ table: 'records', id: change.id, rev, seq });
                if (change.deleted) tombstoneLinks(sql, change.id, now, applied);
                continue;
            }
            if (change.baseRev !== Number(stored.rev)) {
                conflicts.push({ table: 'records', id: change.id, current: recordFrom(stored) as CampaignRecordRow });
                continue;
            }
            const rev = Number(stored.rev) + 1;
            const seq = nextSeq(sql);
            const willDelete = change.deleted === true;
            requireRoom(sql, 'campaign_records', !bit(stored.deleted), !willDelete);
            if (isFullRecord(change)) {
                sql.exec(
                    `UPDATE campaign_records SET
                        type = ?, kind = ?, name = ?, summary = ?, details = ?, tags = ?, anchor = ?, when_json = ?,
                        visibility = ?, player_notes = ?, sheet = ?, status = ?, images = ?, provenance = ?,
                        rev = ?, seq = ?, updated_at = ?, deleted = ?
                     WHERE id = ?`,
                    change.type,
                    change.kind,
                    change.name,
                    change.summary,
                    change.details,
                    JSON.stringify(change.tags),
                    jsonText(change.anchor),
                    jsonText(change.when),
                    change.visibility,
                    change.playerNotes,
                    jsonText(change.sheet),
                    jsonText(change.status),
                    jsonText(change.images),
                    provenanceParam(change, stored.provenance),
                    rev,
                    seq,
                    now,
                    willDelete ? 1 : 0,
                    change.id,
                );
            } else {
                sql.exec(
                    `UPDATE campaign_records SET deleted = 1, rev = ?, seq = ?, updated_at = ? WHERE id = ?`,
                    rev,
                    seq,
                    now,
                    change.id,
                );
            }
            applied.push({ table: 'records', id: change.id, rev, seq });
            if (willDelete) tombstoneLinks(sql, change.id, now, applied);
        }
        for (const change of input.links ?? []) {
            const stored = loadLink(sql, change.id);
            if (!stored) {
                if (!isFullLink(change) || change.baseRev !== 0) continue;
                if (!change.deleted && (!liveRecord(sql, change.from) || !liveRecord(sql, change.to))) {
                    const { baseRev: _baseRev, ...current } = change;
                    conflicts.push({ table: 'links', id: change.id, current });
                    continue;
                }
                if (!change.deleted && change.kind === 'member' && createsCycle(sql, change.id, change.from, change.to)) {
                    throw new CampaignRefusal('validation', ANCESTOR);
                }
                requireRoom(sql, 'campaign_links', false, !change.deleted);
                const rev = 1;
                const seq = nextSeq(sql);
                sql.exec(
                    `INSERT INTO campaign_links (
                        id, from_id, to_id, kind, role, link_order, since_json, until_json, notes, visibility,
                        provenance, rev, seq, created_at, updated_at, deleted
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    change.id,
                    change.from,
                    change.to,
                    change.kind,
                    change.role,
                    change.order,
                    jsonText(change.since),
                    jsonText(change.until),
                    change.notes,
                    change.visibility,
                    provenanceParam(change, null),
                    rev,
                    seq,
                    now,
                    now,
                    change.deleted ? 1 : 0,
                );
                applied.push({ table: 'links', id: change.id, rev, seq });
                continue;
            }
            if (change.baseRev !== Number(stored.rev)) {
                conflicts.push({ table: 'links', id: change.id, current: linkFrom(stored) as CampaignLinkRow });
                continue;
            }
            const fromId = isFullLink(change) ? change.from : String(stored.from_id);
            const toId = isFullLink(change) ? change.to : String(stored.to_id);
            const kind = isFullLink(change) ? change.kind : String(stored.kind);
            if (!change.deleted && (!liveRecord(sql, fromId) || !liveRecord(sql, toId))) {
                conflicts.push({ table: 'links', id: change.id, current: linkFrom(stored) as CampaignLinkRow });
                continue;
            }
            if (!change.deleted && kind === 'member' && createsCycle(sql, change.id, fromId, toId)) {
                throw new CampaignRefusal('validation', ANCESTOR);
            }
            const rev = Number(stored.rev) + 1;
            const seq = nextSeq(sql);
            requireRoom(sql, 'campaign_links', !bit(stored.deleted), !change.deleted);
            if (isFullLink(change)) {
                sql.exec(
                    `UPDATE campaign_links SET
                        from_id = ?, to_id = ?, kind = ?, role = ?, link_order = ?, since_json = ?, until_json = ?,
                        notes = ?, visibility = ?, provenance = ?, rev = ?, seq = ?, updated_at = ?, deleted = ?
                     WHERE id = ?`,
                    change.from,
                    change.to,
                    change.kind,
                    change.role,
                    change.order,
                    jsonText(change.since),
                    jsonText(change.until),
                    change.notes,
                    change.visibility,
                    provenanceParam(change, stored.provenance),
                    rev,
                    seq,
                    now,
                    change.deleted ? 1 : 0,
                    change.id,
                );
            } else {
                sql.exec(
                    `UPDATE campaign_links SET deleted = 1, rev = ?, seq = ?, updated_at = ? WHERE id = ?`,
                    rev,
                    seq,
                    now,
                    change.id,
                );
            }
            applied.push({ table: 'links', id: change.id, rev, seq });
        }
        return { applied, conflicts };
    });
}
