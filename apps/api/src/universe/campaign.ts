// nodejs_compat provides this module at runtime. The API tsconfig types only the Workers runtime.
// @ts-expect-error TS2591
import { createHash } from 'node:crypto';
import {
    CAMPAIGN_LIMITS,
    CampaignChanges,
    CampaignLink,
    CampaignRecord,
    CampaignSettings,
    Party,
    mentionsOf,
    playersObjectHashes,
    playersView,
    type CampaignChangesResult,
    type CampaignClock,
    type CampaignEntry,
    type CampaignLink as CampaignLinkRow,
    type CampaignPage,
    type PlayersView,
    type CampaignRecord as CampaignRecordRow,
    type EntryChange,
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
    readonly code: 'validation' | 'too_large' | 'forbidden';
    readonly details: unknown;

    constructor(code: 'validation' | 'too_large' | 'forbidden', message: string, details?: unknown) {
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
    sql.exec(`CREATE TABLE IF NOT EXISTS campaign_journal (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        when_json TEXT,
        real_date TEXT,
        sequence INTEGER,
        author TEXT NOT NULL,
        visibility TEXT NOT NULL,
        anchor TEXT,
        mentions TEXT NOT NULL,
        rev INTEGER NOT NULL,
        seq INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted INTEGER NOT NULL,
        images TEXT,
        author_id TEXT
    )`);
    const journalColumns = sql.exec(`SELECT name AS name FROM pragma_table_info('campaign_journal')`);
    if (!journalColumns.some((row) => row.name === 'images')) {
        sql.exec(`ALTER TABLE campaign_journal ADD COLUMN images TEXT`);
    }
    if (!journalColumns.some((row) => row.name === 'author_id')) {
        sql.exec(`ALTER TABLE campaign_journal ADD COLUMN author_id TEXT`);
    }
    sql.exec(`CREATE INDEX IF NOT EXISTS campaign_journal_seq ON campaign_journal(seq)`);
    sql.exec(`CREATE INDEX IF NOT EXISTS campaign_journal_kind ON campaign_journal(kind)`);
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
    sql.exec(`CREATE TABLE IF NOT EXISTS campaign_summary (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        vessels TEXT NOT NULL,
        aboard INTEGER NOT NULL,
        clock_days REAL,
        record_count INTEGER NOT NULL,
        changed_at TEXT NOT NULL
    )`);
    sql.exec(`INSERT INTO meta (key, value) VALUES ('schemaVersion', '3') ON CONFLICT(key) DO UPDATE SET value = '3'`);
    sql.exec(`INSERT INTO meta (key, value) VALUES ('campaignSeq', '0') ON CONFLICT(key) DO NOTHING`);
}

/** The list card's facts. The card builds the party line and the date. */
export type CampaignSummary = {
    vessels: string[];
    aboard: number;
    clockDays: number | null;
    records: number;
    changedAt: string;
};

export type CampaignWriteResult = CampaignChangesResult & { summary?: CampaignSummary };

/**
 * One row, replaced when a campaign write stored a change.
 * Vessel names follow `party.vesselIds`. A missing or deleted id is skipped.
 * `aboard` counts `party.memberIds` that still point at a live record.
 */
export function writeCampaignSummary(sql: Sql, now: string): CampaignSummary {
    const settings = readSettings(sql);
    const vessels: string[] = [];
    for (const id of settings.party.vesselIds) {
        const row = sql.exec(`SELECT name FROM campaign_records WHERE id = ? AND deleted = 0`, id)[0];
        if (row) vessels.push(String(row.name));
    }
    let aboard = 0;
    for (const id of settings.party.memberIds) {
        const row = sql.exec(`SELECT id FROM campaign_records WHERE id = ? AND deleted = 0`, id)[0];
        if (row) aboard += 1;
    }
    const clock = readClock(sql);
    const summary: CampaignSummary = {
        vessels,
        aboard,
        clockDays: clock ? clock.days : null,
        records: countLive(sql, 'campaign_records'),
        changedAt: now,
    };
    sql.exec(
        `INSERT INTO campaign_summary (id, vessels, aboard, clock_days, record_count, changed_at)
         VALUES (1, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
            vessels = excluded.vessels,
            aboard = excluded.aboard,
            clock_days = excluded.clock_days,
            record_count = excluded.record_count,
            changed_at = excluded.changed_at`,
        JSON.stringify(summary.vessels),
        summary.aboard,
        summary.clockDays,
        summary.records,
        summary.changedAt,
    );
    return summary;
}

function storedResult(
    sql: Sql,
    now: string,
    applied: CampaignChangesResult['applied'],
    conflicts: CampaignChangesResult['conflicts'],
): CampaignWriteResult {
    if (!applied.length) return { applied, conflicts };
    return { applied, conflicts, summary: writeCampaignSummary(sql, now) };
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

function countLive(sql: Sql, table: 'campaign_records' | 'campaign_links' | 'campaign_journal'): number {
    const rows = sql.exec(`SELECT COUNT(*) AS n FROM ${table} WHERE deleted = 0`);
    return Number(rows[0]?.n ?? 0);
}

function defaultSettings(): CampaignSettings {
    return {
        party: { vesselIds: [], aboard: {}, memberIds: [], anchor: null },
        kinds: {},
        calendar: { dateFormat: 'imperial' },
        rev: 0,
    };
}

function settingsFrom(raw: unknown): CampaignSettings {
    const parsed = CampaignSettings.safeParse(raw);
    return parsed.success ? parsed.data : defaultSettings();
}

function readSettings(sql: Sql): CampaignSettings {
    const rows = sql.exec(`SELECT payload FROM lists WHERE kind = 'campaignSettings'`);
    if (!rows.length || rows[0].payload == null) return defaultSettings();
    return settingsFrom(parseJson(rows[0].payload));
}

/** A 1.2.0 tab sends `vesselId` and no `vesselIds`. That write must not replace a stored ship list. */
function legacySettingsWrite(changes: unknown): boolean {
    if (!changes || typeof changes !== 'object') return false;
    const party = (changes as { settings?: { party?: unknown } }).settings?.party;
    if (!party || typeof party !== 'object' || Array.isArray(party)) return false;
    return 'vesselId' in party && !('vesselIds' in party);
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

/** A stored journal row. `authorId` is the player's account, or null on a referee note. */
type StoredJournalEntry = CampaignEntry & { authorId: string | null };

function entryFrom(row: SqlRow): StoredJournalEntry {
    return {
        id: String(row.id),
        kind: row.kind as CampaignEntry['kind'],
        title: String(row.title),
        body: String(row.body),
        when: parseJson(row.when_json) as CampaignEntry['when'],
        realDate: text(row.real_date),
        sequence: row.sequence == null ? null : Number(row.sequence),
        author: row.author as CampaignEntry['author'],
        visibility: row.visibility as CampaignEntry['visibility'],
        anchor: parseJson(row.anchor) as CampaignEntry['anchor'],
        mentions: (parseJson(row.mentions) ?? []) as CampaignEntry['mentions'],
        images: (parseJson(row.images) ?? null) as CampaignEntry['images'],
        rev: Number(row.rev),
        createdAt: String(row.created_at),
        updatedAt: String(row.updated_at),
        deleted: bit(row.deleted),
        authorId: text(row.author_id),
    };
}

/** The owner page is the campaign schema. `authorId` stays off that body. */
function ownerEntry(row: SqlRow): CampaignEntry {
    const { authorId, ...entry } = entryFrom(row);
    void authorId;
    return entry;
}

function loadRecord(sql: Sql, id: string): SqlRow | null {
    const rows = sql.exec(`SELECT * FROM campaign_records WHERE id = ?`, id);
    return rows[0] ?? null;
}

/** The stored campaign record, or null when the id is not in this universe. */
export function storedCampaignRecord(sql: Sql, id: string): CampaignRecordRow | null {
    const row = loadRecord(sql, id);
    return row ? recordFrom(row) as CampaignRecordRow : null;
}

function loadLink(sql: Sql, id: string): SqlRow | null {
    const rows = sql.exec(`SELECT * FROM campaign_links WHERE id = ?`, id);
    return rows[0] ?? null;
}

function loadEntry(sql: Sql, id: string): SqlRow | null {
    const rows = sql.exec(`SELECT * FROM campaign_journal WHERE id = ?`, id);
    return rows[0] ?? null;
}

function isFullRecord(change: RecordChange): change is Extract<RecordChange, { name: string }> {
    return 'name' in change;
}

function isFullLink(change: LinkChange): change is Extract<LinkChange, { from: string }> {
    return 'from' in change;
}

function isFullEntry(change: EntryChange): change is Extract<EntryChange, { kind: string }> {
    return 'kind' in change;
}

/**
 * A cached tab loads a public entry as `players` and saves that word back.
 * That save keeps `public` unless the caller sent `X-Voyage-Journal: public`.
 * `referee` and an explicit `public` are stored as sent.
 */
function journalVisibility(change: { visibility: string }, stored: SqlRow | null, acknowledgePublic: boolean): string {
    if (!acknowledgePublic && stored && String(stored.visibility) === 'public' && change.visibility === 'players') return 'public';
    return change.visibility;
}

/** A patch writes images only when the field is present. Omitting it leaves the stored list. */
function imagesWrite(change: object): string | null | undefined {
    if (!Object.prototype.hasOwnProperty.call(change, 'images')) return undefined;
    const value = (change as { images?: unknown }).images;
    if (value === undefined) return undefined;
    return jsonText(value);
}

type ParseIssue = {
    code?: string;
    path?: Array<string | number>;
    unionErrors?: { issues?: ParseIssue[] }[];
};

/** True when a journal change sends more than 12 images. */
function journalImageOverflow(error: { issues: ParseIssue[] }): boolean {
    function walk(issues: ParseIssue[], path: Array<string | number>): boolean {
        for (const issue of issues) {
            const here = [...path, ...(issue.path ?? [])];
            if (issue.code === 'too_big' && here[0] === 'journal' && here.includes('images')) return true;
            for (const nested of issue.unionErrors ?? []) {
                if (walk(nested.issues ?? [], here)) return true;
            }
        }
        return false;
    }
    return walk(error.issues, []);
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

export function readCampaign(sql: Sql, afterSeq: number, limit: number, withAuthor = false): CampaignPage {
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
    const journal = sql.exec(
        `SELECT * FROM campaign_journal WHERE seq > ? ORDER BY seq LIMIT ?`,
        afterSeq,
        cap + 1,
    );
    const merged = [
        ...records.map((row) => ({ seq: Number(row.seq), table: 'records' as const, row })),
        ...links.map((row) => ({ seq: Number(row.seq), table: 'links' as const, row })),
        ...journal.map((row) => ({ seq: Number(row.seq), table: 'journal' as const, row })),
    ].sort((a, b) => a.seq - b.seq);
    const done = merged.length <= cap;
    const page = merged.slice(0, cap);
    const counter = sql.exec(`SELECT value FROM meta WHERE key = 'campaignSeq'`);
    const universeSeq = Number(counter[0]?.value ?? 0);
    const seq = done ? universeSeq : page[page.length - 1]?.seq ?? universeSeq;
    return {
        records: page.filter((item) => item.table === 'records').map((item) => recordFrom(item.row)) as CampaignPage['records'],
        links: page.filter((item) => item.table === 'links').map((item) => linkFrom(item.row)) as CampaignPage['links'],
        journal: page.filter((item) => item.table === 'journal').map((item) => (
            withAuthor ? entryFrom(item.row) : ownerEntry(item.row)
        )) as CampaignPage['journal'],
        settings: readSettings(sql),
        clock: readClock(sql),
        seq,
        done,
    };
}

export type PlayersCaller = {
    userId: string;
    handles: Readonly<Record<string, string>>;
};

export type PlayersCampaignPage = {
    records: PlayersView['records'];
    links: PlayersView['links'];
    journal: PlayersView['journal'];
    settings: PlayersView['settings'];
    clock: PlayersView['clock'];
    seq: number;
    done: boolean;
    visible?: { records: string[]; links: string[]; journal: string[] };
};

function liveRows(sql: Sql): { records: SqlRow[]; links: SqlRow[]; journal: SqlRow[] } {
    return {
        records: sql.exec(`SELECT * FROM campaign_records WHERE deleted = 0`),
        links: sql.exec(`SELECT * FROM campaign_links WHERE deleted = 0`),
        journal: sql.exec(`SELECT * FROM campaign_journal WHERE deleted = 0`),
    };
}

function projectLive(sql: Sql, rows: { records: SqlRow[]; links: SqlRow[]; journal: SqlRow[] }, caller: PlayersCaller): PlayersView {
    return playersView({
        records: rows.records.map((row) => recordFrom(row)) as CampaignPage['records'],
        links: rows.links.map((row) => linkFrom(row)) as CampaignPage['links'],
        journal: rows.journal.map((row) => entryFrom(row)),
        settings: readSettings(sql),
        clock: readClock(sql),
    }, caller);
}

/**
 * One table can fill `limit` without pushing another table off the page.
 * A merged window of 1000 drops a late link when the records already fill it.
 * When a table is cut, `seq` is the earliest cut so the next page still sees that table.
 */
function pageKind<T extends { id: string }>(
    rows: readonly T[],
    seqOf: ReadonlyMap<string, number>,
    kind: string,
    afterSeq: number,
    cap: number,
): { rows: T[]; last: number | null; truncated: boolean } {
    const sorted = rows
        .map((row) => ({ row, seq: seqOf.get(`${kind}:${row.id}`) ?? 0 }))
        .filter((item) => item.seq > afterSeq)
        .sort((a, b) => a.seq - b.seq);
    const page = sorted.slice(0, cap);
    return {
        rows: page.map((item) => item.row),
        last: page.length ? page[page.length - 1].seq : null,
        truncated: sorted.length > cap,
    };
}

/** The member read. The whole live set is projected, then each table is paged on its own. */
export function readPlayersCampaign(sql: Sql, afterSeq: number, limit: number, caller: PlayersCaller): PlayersCampaignPage {
    const cap = Math.min(1000, Math.max(1, Math.floor(limit)));
    const rows = liveRows(sql);
    const seqOf = new Map<string, number>();
    for (const row of rows.records) seqOf.set(`records:${String(row.id)}`, Number(row.seq));
    for (const row of rows.links) seqOf.set(`links:${String(row.id)}`, Number(row.seq));
    for (const row of rows.journal) seqOf.set(`journal:${String(row.id)}`, Number(row.seq));
    const view = projectLive(sql, rows, caller);
    const records = pageKind(view.records, seqOf, 'records', afterSeq, cap);
    const links = pageKind(view.links, seqOf, 'links', afterSeq, cap);
    const journal = pageKind(view.journal, seqOf, 'journal', afterSeq, cap);
    const cut = [records, links, journal].filter((item) => item.truncated && item.last != null);
    const counter = sql.exec(`SELECT value FROM meta WHERE key = 'campaignSeq'`);
    const universeSeq = Number(counter[0]?.value ?? 0);
    const done = cut.length === 0;
    const seq = done ? universeSeq : Math.min(...cut.map((item) => item.last as number));
    const body: PlayersCampaignPage = {
        records: records.rows,
        links: links.rows,
        journal: journal.rows,
        settings: view.settings,
        clock: view.clock,
        seq,
        done,
    };
    if (afterSeq === 0 || seq > afterSeq) {
        body.visible = {
            records: view.records.map((row) => row.id),
            links: view.links.map((row) => row.id),
            journal: view.journal.map((row) => row.id),
        };
    }
    return body;
}

/** Image hashes on the projected records and notes. The caller does not change the set. */
export function playersCampaignHashes(sql: Sql): string[] {
    return playersObjectHashes(projectLive(sql, liveRows(sql), { userId: '', handles: {} }));
}

export function journalAuthorReady(sql: Sql): boolean {
    const rows = sql.exec(`SELECT name FROM pragma_table_info('campaign_journal')`);
    return rows.some((row) => row.name === 'author_id');
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

function requireRoom(
    sql: Sql,
    table: 'campaign_records' | 'campaign_links' | 'campaign_journal',
    wasLive: boolean,
    willLive: boolean,
): void {
    if (wasLive || !willLive) return;
    const cap = table === 'campaign_records'
        ? CAMPAIGN_LIMITS.records
        : table === 'campaign_links'
            ? CAMPAIGN_LIMITS.links
            : CAMPAIGN_LIMITS.journal;
    if (countLive(sql, table) >= cap) {
        const noun = table === 'campaign_records' ? 'records' : table === 'campaign_links' ? 'links' : 'entries';
        throw new CampaignRefusal('too_large', `${cap.toLocaleString('en-US')} live ${noun} per universe.`);
    }
}

const PLAYER_NOTES = 65_535;
const PLAYER_NOTE_SENTENCE = 'You have 65,535 notes in this campaign, the most one player can keep.';
const MEMBER_FORBIDDEN = 'You cannot change that.';

export type MemberCaller = { userId: string };

function countPlayerNotes(sql: Sql, userId: string): number {
    const rows = sql.exec(`SELECT COUNT(*) AS n FROM campaign_journal WHERE deleted = 0 AND author_id = ?`, userId);
    return Number(rows[0]?.n ?? 0);
}

function refuseMember(): never {
    throw new CampaignRefusal('forbidden', MEMBER_FORBIDDEN);
}

function assertMemberAnchor(sql: Sql, anchor: CampaignEntry['anchor']): void {
    if (anchor == null || anchor.kind === 'system') return;
    const rows = sql.exec(
        `SELECT id FROM campaign_records WHERE id = ? AND deleted = 0 AND visibility = 'players'`,
        anchor.id,
    );
    if (!rows.length) throw new CampaignRefusal('validation', 'Invalid request.');
}

function assertMemberNote(change: EntryChange): void {
    if (!isFullEntry(change)) return;
    if (change.kind !== 'note' || change.author !== 'players' || change.visibility !== 'players') refuseMember();
    if (Object.prototype.hasOwnProperty.call(change, 'images') && change.images != null) refuseMember();
}

/**
 * A member writes their own players notes. The per-player live count is the guard.
 * Those notes are not refused by the universe journal cap.
 */
function applyMemberNotes(sql: Sql, changes: unknown, now: string, member: MemberCaller): CampaignWriteResult {
    const parsed = CampaignChanges.safeParse(changes);
    if (!parsed.success) {
        const tooLarge = parsed.error.issues.some((issue) => issue.message === 'too_large');
        throw new CampaignRefusal(
            tooLarge ? 'too_large' : 'validation',
            tooLarge ? 'This change is over the campaign limit.' : journalImageOverflow(parsed.error) ? 'An entry can hold 12 images.' : 'That request could not be read. Try again.',
            parsed.error.flatten(),
        );
    }
    const input = parsed.data;
    if (input.records || input.links || input.settings || input.clock) refuseMember();
    const applied: CampaignChangesResult['applied'] = [];
    const conflicts: CampaignChangesResult['conflicts'] = [];
    return sql.transaction(() => {
        for (const change of input.journal ?? []) {
            const stored = loadEntry(sql, change.id);
            if (!stored) {
                if (!isFullEntry(change) || change.baseRev !== 0) refuseMember();
                assertMemberNote(change);
                assertMemberAnchor(sql, change.anchor);
                if (!change.deleted && countPlayerNotes(sql, member.userId) >= PLAYER_NOTES) {
                    throw new CampaignRefusal('too_large', PLAYER_NOTE_SENTENCE);
                }
                const rev = 1;
                const seq = nextSeq(sql);
                const mentions = mentionsOf(change.body);
                sql.exec(
                    `INSERT INTO campaign_journal (
                        id, kind, title, body, when_json, real_date, sequence, author, visibility,
                        anchor, mentions, images, rev, seq, created_at, updated_at, deleted, author_id
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    change.id,
                    change.kind,
                    change.title,
                    change.body,
                    jsonText(change.when),
                    change.realDate,
                    change.sequence,
                    change.author,
                    'players',
                    jsonText(change.anchor),
                    JSON.stringify(mentions),
                    imagesWrite(change) ?? null,
                    rev,
                    seq,
                    now,
                    now,
                    change.deleted ? 1 : 0,
                    member.userId,
                );
                applied.push({ table: 'journal', id: change.id, rev, seq });
                continue;
            }
            if (text(stored.author_id) !== member.userId) refuseMember();
            if (isFullEntry(change)) {
                assertMemberNote(change);
                assertMemberAnchor(sql, change.anchor);
            }
            if (change.baseRev !== Number(stored.rev)) {
                conflicts.push({
                    table: 'journal',
                    id: change.id,
                    current: ownerEntry(stored) as Extract<CampaignChangesResult['conflicts'][number], { table: 'journal' }>['current'],
                });
                continue;
            }
            const rev = Number(stored.rev) + 1;
            const seq = nextSeq(sql);
            const willDelete = change.deleted === true;
            if (bit(stored.deleted) && !willDelete && countPlayerNotes(sql, member.userId) >= PLAYER_NOTES) {
                throw new CampaignRefusal('too_large', PLAYER_NOTE_SENTENCE);
            }
            if (isFullEntry(change)) {
                const mentions = mentionsOf(change.body);
                const images = imagesWrite(change);
                if (images === undefined) {
                    sql.exec(
                        `UPDATE campaign_journal SET
                            kind = ?, title = ?, body = ?, when_json = ?, real_date = ?, sequence = ?,
                            author = ?, visibility = ?, anchor = ?, mentions = ?,
                            rev = ?, seq = ?, updated_at = ?, deleted = ?
                         WHERE id = ?`,
                        change.kind,
                        change.title,
                        change.body,
                        jsonText(change.when),
                        change.realDate,
                        change.sequence,
                        change.author,
                        'players',
                        jsonText(change.anchor),
                        JSON.stringify(mentions),
                        rev,
                        seq,
                        now,
                        willDelete ? 1 : 0,
                        change.id,
                    );
                } else {
                    sql.exec(
                        `UPDATE campaign_journal SET
                            kind = ?, title = ?, body = ?, when_json = ?, real_date = ?, sequence = ?,
                            author = ?, visibility = ?, anchor = ?, mentions = ?, images = ?,
                            rev = ?, seq = ?, updated_at = ?, deleted = ?
                         WHERE id = ?`,
                        change.kind,
                        change.title,
                        change.body,
                        jsonText(change.when),
                        change.realDate,
                        change.sequence,
                        change.author,
                        'players',
                        jsonText(change.anchor),
                        JSON.stringify(mentions),
                        images,
                        rev,
                        seq,
                        now,
                        willDelete ? 1 : 0,
                        change.id,
                    );
                }
            } else {
                sql.exec(
                    `UPDATE campaign_journal SET deleted = 1, rev = ?, seq = ?, updated_at = ? WHERE id = ?`,
                    rev,
                    seq,
                    now,
                    change.id,
                );
            }
            applied.push({ table: 'journal', id: change.id, rev, seq });
        }
        return storedResult(sql, now, applied, conflicts);
    });
}

export function applyCampaignChanges(
    sql: Sql,
    changes: unknown,
    now: string,
    acknowledgePublic = false,
    member?: MemberCaller | null,
): CampaignWriteResult {
    if (member) return applyMemberNotes(sql, changes, now, member);
    const legacyParty = legacySettingsWrite(changes);
    const parsed = CampaignChanges.safeParse(changes);
    if (!parsed.success) {
        const tooLarge = parsed.error.issues.some((issue) => issue.message === 'too_large');
        throw new CampaignRefusal(
            tooLarge ? 'too_large' : 'validation',
            tooLarge ? 'This change is over the campaign limit.' : journalImageOverflow(parsed.error) ? 'An entry can hold 12 images.' : 'That request could not be read. Try again.',
            parsed.error.flatten(),
        );
    }
    const input = parsed.data;
    const applied: CampaignChangesResult['applied'] = [];
    const conflicts: CampaignChangesResult['conflicts'] = [];
    return sql.transaction(() => {
        if (input.settings) {
            const stored = sql.exec(`SELECT rev, payload FROM lists WHERE kind = 'campaignSettings'`);
            const raw = stored.length && stored[0].payload != null ? parseJson(stored[0].payload) : null;
            const current = raw == null ? defaultSettings() : settingsFrom(raw);
            if (input.settings.baseRev !== current.rev) {
                conflicts.push({ table: 'settings', id: 'campaignSettings', current });
            } else {
                const rev = current.rev + 1;
                const seq = nextSeq(sql);
                const { baseRev: _baseRev, ...body } = input.settings;
                const rawParty = raw && typeof raw === 'object' ? (raw as { party?: { vesselIds?: unknown; aboard?: unknown } }).party : null;
                let party = body.party;
                if (legacyParty && rawParty && Array.isArray(rawParty.vesselIds)) {
                    const kept = Party.safeParse({
                        vesselIds: rawParty.vesselIds,
                        aboard: rawParty.aboard ?? {},
                        memberIds: body.party.memberIds,
                        anchor: body.party.anchor,
                    });
                    if (kept.success) party = kept.data;
                }
                const next = { ...body, party, rev };
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
        for (const change of input.journal ?? []) {
            const stored = loadEntry(sql, change.id);
            if (!stored) {
                if (!isFullEntry(change) || change.baseRev !== 0) continue;
                requireRoom(sql, 'campaign_journal', false, !change.deleted);
                const rev = 1;
                const seq = nextSeq(sql);
                const mentions = mentionsOf(change.body);
                sql.exec(
                    `INSERT INTO campaign_journal (
                        id, kind, title, body, when_json, real_date, sequence, author, visibility,
                        anchor, mentions, images, rev, seq, created_at, updated_at, deleted
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    change.id,
                    change.kind,
                    change.title,
                    change.body,
                    jsonText(change.when),
                    change.realDate,
                    change.sequence,
                    change.author,
                    journalVisibility(change, null, acknowledgePublic),
                    jsonText(change.anchor),
                    JSON.stringify(mentions),
                    imagesWrite(change) ?? null,
                    rev,
                    seq,
                    now,
                    now,
                    change.deleted ? 1 : 0,
                );
                applied.push({ table: 'journal', id: change.id, rev, seq });
                continue;
            }
            if (change.baseRev !== Number(stored.rev)) {
                conflicts.push({
                    table: 'journal',
                    id: change.id,
                    current: ownerEntry(stored) as Extract<CampaignChangesResult['conflicts'][number], { table: 'journal' }>['current'],
                });
                continue;
            }
            const rev = Number(stored.rev) + 1;
            const seq = nextSeq(sql);
            const willDelete = change.deleted === true;
            requireRoom(sql, 'campaign_journal', !bit(stored.deleted), !willDelete);
            if (isFullEntry(change)) {
                const mentions = mentionsOf(change.body);
                const images = imagesWrite(change);
                if (images === undefined) {
                    sql.exec(
                        `UPDATE campaign_journal SET
                            kind = ?, title = ?, body = ?, when_json = ?, real_date = ?, sequence = ?,
                            author = ?, visibility = ?, anchor = ?, mentions = ?,
                            rev = ?, seq = ?, updated_at = ?, deleted = ?
                         WHERE id = ?`,
                        change.kind,
                        change.title,
                        change.body,
                        jsonText(change.when),
                        change.realDate,
                        change.sequence,
                        change.author,
                        journalVisibility(change, stored, acknowledgePublic),
                        jsonText(change.anchor),
                        JSON.stringify(mentions),
                        rev,
                        seq,
                        now,
                        willDelete ? 1 : 0,
                        change.id,
                    );
                } else {
                    sql.exec(
                        `UPDATE campaign_journal SET
                            kind = ?, title = ?, body = ?, when_json = ?, real_date = ?, sequence = ?,
                            author = ?, visibility = ?, anchor = ?, mentions = ?, images = ?,
                            rev = ?, seq = ?, updated_at = ?, deleted = ?
                         WHERE id = ?`,
                        change.kind,
                        change.title,
                        change.body,
                        jsonText(change.when),
                        change.realDate,
                        change.sequence,
                        change.author,
                        journalVisibility(change, stored, acknowledgePublic),
                        jsonText(change.anchor),
                        JSON.stringify(mentions),
                        images,
                        rev,
                        seq,
                        now,
                        willDelete ? 1 : 0,
                        change.id,
                    );
                }
            } else {
                sql.exec(
                    `UPDATE campaign_journal SET deleted = 1, rev = ?, seq = ?, updated_at = ? WHERE id = ?`,
                    rev,
                    seq,
                    now,
                    change.id,
                );
            }
            applied.push({ table: 'journal', id: change.id, rev, seq });
        }
        return storedResult(sql, now, applied, conflicts);
    });
}

/**
 * Removing an import (contracts/b_marketplace.md F14): the record is deleted the way
 * the campaign's own delete does it (a tombstone at a new rev and seq, its links too).
 * The caller holds the transaction.
 */
export function deleteInstalledRecord(sql: Sql, id: string, now: string): boolean {
    const row = sql.exec(`SELECT rev, deleted FROM campaign_records WHERE id = ?`, id)[0];
    if (!row || Number(row.deleted) === 1) return false;
    const rev = Number(row.rev) + 1;
    const seq = nextSeq(sql);
    sql.exec(`UPDATE campaign_records SET deleted = 1, rev = ?, seq = ?, updated_at = ? WHERE id = ?`, rev, seq, now, id);
    tombstoneLinks(sql, id, now, []);
    return true;
}
