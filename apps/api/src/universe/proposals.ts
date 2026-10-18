// nodejs_compat provides this module at runtime. The API tsconfig types only the Workers runtime.
// @ts-expect-error TS2591
import { createHash } from 'node:crypto';
import {
    CAMPAIGN_RECORD_TYPES,
    CampaignChanges,
    Proposal,
    ProposalBatchSubmit,
    ProposalResolve,
    PROPOSAL_LIMITS,
    type CampaignRecord,
    type Proposal as ProposalValue,
} from '@voyage/shared';
import { applyCampaignChanges, CampaignRefusal, storedCampaignRecord, type Sql, type SqlRow } from './campaign.ts';

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function ulid(now = Date.now()): string {
    let time = '';
    let t = now;
    for (let i = 0; i < 10; i += 1) {
        time = CROCKFORD[t % 32] + time;
        t = Math.floor(t / 32);
    }
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    let rand = '';
    for (let i = 0; i < 16; i += 1) rand += CROCKFORD[bytes[i]! % 32];
    return time + rand;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const PENDING_DAYS = 30;
const KEEP_DAYS = 90;
const SWEEP_LIMIT = 100;
const SEARCH_PATTERN_BYTES = 50;
const RECORD_CAP = 50;
const NO_UNIVERSE = 'No such universe.';
const INVALID = 'Invalid request.';
const REVIEW_FIRST = 'Review or drop some proposals first.';
const BATCH_COUNT = 'A batch holds at most 200 proposals.';
const BATCH_BYTES = 'A batch is at most 256 KB.';
const QUOTE = 'A proposal keeps at most three quotes of 300 characters, and a question is at most 1,000 characters.';
const RESOLVE_LIMIT = 'Resolve at most 50 proposals at a time.';
const IDEMPOTENCY = 'That key was already used for a different batch.';
const UNAVAILABLE = 'Proposals are not available yet.';

export class ProposalRefusal extends Error {
    readonly status: 400 | 404 | 409 | 429 | 503;
    readonly code: string;

    constructor(status: 400 | 404 | 409 | 429 | 503, code: string, message: string) {
        super(message);
        this.name = 'ProposalRefusal';
        this.status = status;
        this.code = code;
    }
}

type Issue = { code?: string; message: string; path: Array<string | number> };

export function installProposalSchema(sql: Sql): void {
    sql.exec(`CREATE TABLE IF NOT EXISTS proposal_batches (
        id TEXT PRIMARY KEY,
        idempotency_key TEXT NOT NULL UNIQUE,
        body_hash TEXT NOT NULL,
        token_id TEXT,
        source TEXT NOT NULL,
        state TEXT NOT NULL,
        pending INTEGER NOT NULL,
        accepted INTEGER NOT NULL,
        dropped INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        reviewed_at TEXT,
        expires_at TEXT NOT NULL
    )`);
    sql.exec(`CREATE INDEX IF NOT EXISTS proposal_batches_state ON proposal_batches(state, created_at)`);
    sql.exec(`CREATE TABLE IF NOT EXISTS proposals (
        id TEXT PRIMARY KEY,
        batch_id TEXT NOT NULL,
        ordinal INTEGER NOT NULL,
        ref TEXT,
        op TEXT NOT NULL,
        target_id TEXT,
        base_rev INTEGER,
        payload TEXT NOT NULL,
        evidence TEXT NOT NULL,
        state TEXT NOT NULL,
        decided_at TEXT,
        applied_rev INTEGER,
        note TEXT
    )`);
    sql.exec(`CREATE INDEX IF NOT EXISTS proposals_batch ON proposals(batch_id, ordinal)`);
}

export function proposalsReady(sql: Sql): boolean {
    const rows = sql.exec(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'proposal_batches'`);
    return rows.length > 0;
}

function refuse(status: ProposalRefusal['status'], code: string, message: string): never {
    throw new ProposalRefusal(status, code, message);
}

function requireReady(sql: Sql): void {
    if (!proposalsReady(sql)) refuse(503, 'proposals_unavailable', UNAVAILABLE);
}

function hashBody(value: unknown): string {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function plusDays(iso: string, days: number): string {
    return new Date(Date.parse(iso) + days * DAY_MS).toISOString();
}

function reviewUrl(universeId: string, batchId: string): string {
    return `/universes/${universeId}/proposals/${batchId}`;
}

function parseJson(value: unknown): unknown {
    if (typeof value !== 'string') return null;
    try {
        return JSON.parse(value);
    } catch {
        return null;
    }
}

function issuePath(issue: Issue): string[] {
    return issue.path.map((part) => String(part));
}

function submitIssue(issues: Issue[]): ProposalRefusal {
    const quote = issues.some((issue) => {
        if (issue.code !== 'too_big') return false;
        const path = issuePath(issue);
        return path.includes('quote') || path.includes('evidence') || path[path.length - 1] === 'text';
    });
    if (quote) return new ProposalRefusal(400, 'too_large', QUOTE);
    const count = issues.some((issue) => issue.code === 'too_big' && issue.path.length === 1 && issue.path[0] === 'proposals');
    if (count) return new ProposalRefusal(400, 'too_large', BATCH_COUNT);
    if (issues.some((issue) => issue.message === 'too_large')) return new ProposalRefusal(400, 'too_large', BATCH_BYTES);
    return new ProposalRefusal(400, 'validation', INVALID);
}

function resolveIssue(issues: Issue[]): ProposalRefusal {
    const count = issues.some((issue) => issue.code === 'too_big' && issue.path.length === 1 && issue.path[0] === 'decisions');
    if (count) return new ProposalRefusal(400, 'too_large', RESOLVE_LIMIT);
    return new ProposalRefusal(400, 'validation', INVALID);
}

function live(sql: Sql, id: string): boolean {
    const rows = sql.exec(`SELECT deleted FROM campaign_records WHERE id = ?`, id);
    return rows.length > 0 && Number(rows[0].deleted) !== 1;
}

type BatchRow = SqlRow & {
    id: string;
    source: string;
    state: string;
    pending: number;
    accepted: number;
    dropped: number;
    created_at: string;
    reviewed_at: string | null;
    expires_at: string;
    body_hash?: string;
    idempotency_key?: string;
};

function toStored(row: SqlRow) {
    return {
        id: String(row.id),
        ordinal: Number(row.ordinal),
        proposal: parseJson(row.payload) as ProposalValue,
        targetId: row.target_id == null ? null : String(row.target_id),
        state: String(row.state) as 'pending' | 'accepted' | 'dropped' | 'conflict',
        appliedRev: row.applied_rev == null ? null : Number(row.applied_rev),
        decidedAt: row.decided_at == null ? null : String(row.decided_at),
        note: row.note == null ? null : String(row.note),
    };
}

function toBatch(row: BatchRow, universeId: string, proposals?: ReturnType<typeof toStored>[]) {
    return {
        id: String(row.id),
        source: parseJson(row.source) as { kind: 'transcript' | 'notes' | 'other'; label: string; realDate: string | null; durationSeconds?: number; tool?: string },
        state: String(row.state) as 'open' | 'reviewed' | 'expired',
        counts: { pending: Number(row.pending), accepted: Number(row.accepted), dropped: Number(row.dropped) },
        createdAt: String(row.created_at),
        reviewedAt: row.reviewed_at == null ? null : String(row.reviewed_at),
        expiresAt: String(row.expires_at),
        reviewUrl: reviewUrl(universeId, String(row.id)),
        ...(proposals ? { proposals } : {}),
    };
}

function loadProposals(sql: Sql, batchId: string) {
    return sql.exec(`SELECT * FROM proposals WHERE batch_id = ? ORDER BY ordinal`, batchId).map((row) => toStored(row));
}

function loadBatch(sql: Sql, batchId: string): BatchRow | null {
    const rows = sql.exec(`SELECT * FROM proposal_batches WHERE id = ?`, batchId);
    return (rows[0] as BatchRow | undefined) ?? null;
}

/** Pending batches past 30 days expire. Reviewed and expired batches leave after 90 days, 100 a call. */
export function sweepProposals(sql: Sql, now: string): void {
    if (!proposalsReady(sql)) return;
    const nowMs = Date.parse(now);
    const keep = KEEP_DAYS * DAY_MS;
    sql.transaction(() => {
        const rows = sql.exec(`SELECT id, state, pending, expires_at, reviewed_at, created_at FROM proposal_batches`);
        let removed = 0;
        for (const row of rows) {
            if (removed >= SWEEP_LIMIT) break;
            const state = String(row.state);
            const expiresMs = Date.parse(String(row.expires_at));
            const reviewedMs = row.reviewed_at == null ? null : Date.parse(String(row.reviewed_at));
            const drop = (state === 'reviewed' && reviewedMs != null && nowMs - reviewedMs >= keep)
                || (state === 'expired' && nowMs - expiresMs >= keep);
            if (!drop) continue;
            sql.exec(`DELETE FROM proposals WHERE batch_id = ?`, String(row.id));
            sql.exec(`DELETE FROM proposal_batches WHERE id = ?`, String(row.id));
            removed += 1;
        }
        const open = sql.exec(`SELECT id, pending FROM proposal_batches WHERE state = 'open' AND expires_at <= ?`, now);
        for (const row of open) {
            sql.exec(
                `UPDATE proposals SET state = 'dropped', decided_at = ? WHERE batch_id = ? AND state = 'pending'`,
                now,
                String(row.id),
            );
            sql.exec(
                `UPDATE proposal_batches SET state = 'expired', pending = 0, dropped = dropped + ? WHERE id = ?`,
                Number(row.pending),
                String(row.id),
            );
        }
    });
}

function recount(sql: Sql, batchId: string, now: string): void {
    const pending = Number(sql.exec(`SELECT COUNT(*) AS n FROM proposals WHERE batch_id = ? AND state = 'pending'`, batchId)[0]?.n ?? 0);
    const accepted = Number(sql.exec(`SELECT COUNT(*) AS n FROM proposals WHERE batch_id = ? AND state = 'accepted'`, batchId)[0]?.n ?? 0);
    const dropped = Number(sql.exec(`SELECT COUNT(*) AS n FROM proposals WHERE batch_id = ? AND state = 'dropped'`, batchId)[0]?.n ?? 0);
    const state = pending > 0 ? 'open' : 'reviewed';
    if (state === 'reviewed') {
        sql.exec(
            `UPDATE proposal_batches SET state = 'reviewed', pending = ?, accepted = ?, dropped = ?, reviewed_at = COALESCE(reviewed_at, ?) WHERE id = ?`,
            pending,
            accepted,
            dropped,
            now,
            batchId,
        );
    } else {
        sql.exec(
            `UPDATE proposal_batches SET state = 'open', pending = ?, accepted = ?, dropped = ? WHERE id = ?`,
            pending,
            accepted,
            dropped,
            batchId,
        );
    }
}

function recordIdOf(proposal: ProposalValue): string | null {
    if (proposal.op === 'record.update' || proposal.op === 'track.append' || proposal.op === 'cargo.append' || proposal.op === 'passengers.append' || proposal.op === 'ledger.append') {
        return proposal.id;
    }
    if (proposal.op === 'link.create') {
        return null;
    }
    return null;
}

export type SubmitResult = { batch: ReturnType<typeof toBatch>; created: boolean };

export function submitProposals(
    sql: Sql,
    body: unknown,
    now: string,
    tokenId: string | null,
    universeId: string,
    charge?: () => boolean,
): SubmitResult {
    requireReady(sql);
    sweepProposals(sql, now);
    const parsed = ProposalBatchSubmit.safeParse(body);
    if (!parsed.success) throw submitIssue(parsed.error.issues as Issue[]);
    const input = parsed.data;
    for (const proposal of input.proposals) {
        const id = recordIdOf(proposal);
        if (id && !live(sql, id)) refuse(400, 'validation', INVALID);
        if (proposal.op === 'link.create') {
            for (const end of [proposal.link.from, proposal.link.to]) {
                if ('id' in end && !live(sql, end.id)) refuse(400, 'validation', INVALID);
            }
        }
    }
    const hash = hashBody(input);
    const existing = sql.exec(`SELECT * FROM proposal_batches WHERE idempotency_key = ?`, input.idempotencyKey)[0] as BatchRow | undefined;
    if (existing) {
        if (String(existing.body_hash) !== hash) refuse(409, 'idempotency_conflict', IDEMPOTENCY);
        if (charge && !charge()) refuse(429, 'rate_limited', 'Too many requests.');
        return { batch: toBatch(existing, universeId, loadProposals(sql, String(existing.id))), created: false };
    }
    const open = Number(sql.exec(`SELECT COUNT(*) AS n FROM proposal_batches WHERE state = 'open'`)[0]?.n ?? 0);
    if (open >= PROPOSAL_LIMITS.openBatches) refuse(400, 'too_large', REVIEW_FIRST);
    const pending = Number(sql.exec(`SELECT COUNT(*) AS n FROM proposals WHERE state = 'pending'`)[0]?.n ?? 0);
    if (pending + input.proposals.length > PROPOSAL_LIMITS.pendingPerUniverse) refuse(400, 'too_large', REVIEW_FIRST);
    if (charge && !charge()) refuse(429, 'rate_limited', 'Too many requests.');
    const batchId = `pb_${ulid()}`;
    const rows = input.proposals.map((proposal, ordinal) => {
        let target: string | null = null;
        let baseRev: number | null = null;
        if (proposal.op === 'record.create') target = `cr_${crypto.randomUUID()}`;
        else if (proposal.op === 'link.create') target = `cl_${crypto.randomUUID()}`;
        else if (proposal.op === 'journal.create') target = `cj_${crypto.randomUUID()}`;
        else if (proposal.op === 'clock.set') {
            target = 'campaignTime';
            baseRev = proposal.baseRev;
        } else if (proposal.op === 'question') target = null;
        else {
            target = proposal.id;
            baseRev = proposal.baseRev;
        }
        return {
            id: `pp_${ulid()}`,
            ordinal,
            proposal,
            target,
            baseRev,
        };
    });
    const expires = plusDays(now, PENDING_DAYS);
    sql.transaction(() => {
        sql.exec(
            `INSERT INTO proposal_batches (
                id, idempotency_key, body_hash, token_id, source, state, pending, accepted, dropped, created_at, reviewed_at, expires_at
            ) VALUES (?, ?, ?, ?, ?, 'open', ?, 0, 0, ?, NULL, ?)`,
            batchId,
            input.idempotencyKey,
            hash,
            tokenId,
            JSON.stringify(input.source),
            rows.length,
            now,
            expires,
        );
        for (const row of rows) {
            sql.exec(
                `INSERT INTO proposals (
                    id, batch_id, ordinal, ref, op, target_id, base_rev, payload, evidence, state, decided_at, applied_rev, note
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL, NULL, NULL)`,
                row.id,
                batchId,
                row.ordinal,
                row.proposal.ref ?? null,
                row.proposal.op,
                row.target,
                row.baseRev,
                JSON.stringify(row.proposal),
                JSON.stringify(row.proposal.evidence),
                );
        }
    });
    const stored = loadBatch(sql, batchId);
    if (!stored) refuse(503, 'proposals_unavailable', UNAVAILABLE);
    return { batch: toBatch(stored, universeId, loadProposals(sql, batchId)), created: true };
}

export function listBatches(sql: Sql, state: string | null, now: string, universeId: string) {
    requireReady(sql);
    sweepProposals(sql, now);
    const wanted = state == null || state === '' ? 'open' : state;
    if (wanted !== 'open' && wanted !== 'reviewed') refuse(400, 'validation', INVALID);
    const rows = sql.exec(
        `SELECT * FROM proposal_batches WHERE state = ? ORDER BY created_at DESC`,
        wanted,
    ) as BatchRow[];
    return { items: rows.map((row) => toBatch(row, universeId)), nextCursor: null };
}

export function readBatch(sql: Sql, batchId: string, now: string, universeId: string) {
    requireReady(sql);
    sweepProposals(sql, now);
    const row = loadBatch(sql, batchId);
    if (!row) refuse(404, 'not_found', NO_UNIVERSE);
    return toBatch(row, universeId, loadProposals(sql, batchId));
}

export function deleteBatch(sql: Sql, batchId: string): void {
    requireReady(sql);
    const row = loadBatch(sql, batchId);
    if (!row) refuse(404, 'not_found', NO_UNIVERSE);
    sql.transaction(() => {
        sql.exec(`DELETE FROM proposals WHERE batch_id = ?`, batchId);
        sql.exec(`DELETE FROM proposal_batches WHERE id = ?`, batchId);
    });
}

type Built = {
    changes: {
        records?: unknown[];
        links?: unknown[];
        journal?: unknown[];
        clock?: unknown;
    };
    proposalByKey: Map<string, string>;
    creates: Set<string>;
};

function endId(end: { id: string } | { ref: string }, refs: Map<string, string>): string | null {
    if ('id' in end) return end.id;
    return refs.get(end.ref) ?? null;
}

function statusOf(record: CampaignRecord): Record<string, unknown> {
    if (!record.status || typeof record.status !== 'object') return {};
    return { ...(record.status as Record<string, unknown>) };
}

function buildChange(sql: Sql, proposal: ProposalValue, targetId: string | null, baseRev: number, now: string, refs: Map<string, string>): { table: 'records' | 'links' | 'journal' | 'clock'; id: string; change: unknown } | null {
    if (proposal.op === 'question') return null;
    if (proposal.op === 'record.create') {
        const id = targetId ?? '';
        return {
            table: 'records',
            id,
            change: {
                id,
                ...proposal.record,
                when: proposal.record.when ?? null,
                visibility: 'referee',
                playerNotes: null,
                sheet: null,
                status: proposal.record.status ?? null,
                images: null,
                provenance: null,
                rev: 0,
                createdAt: now,
                updatedAt: now,
                deleted: false,
                baseRev: 0,
            },
        };
    }
    if (proposal.op === 'journal.create') {
        const id = targetId ?? '';
        return {
            table: 'journal',
            id,
            change: {
                id,
                ...proposal.entry,
                author: 'referee',
                visibility: 'referee',
                mentions: [],
                images: null,
                rev: 0,
                createdAt: now,
                updatedAt: now,
                deleted: false,
                baseRev: 0,
            },
        };
    }
    if (proposal.op === 'link.create') {
        const from = endId(proposal.link.from, refs);
        const to = endId(proposal.link.to, refs);
        if (!from || !to) refuse(400, 'validation', INVALID);
        const id = targetId ?? '';
        return {
            table: 'links',
            id,
            change: {
                id,
                from,
                to,
                kind: proposal.link.kind,
                role: proposal.link.role,
                order: 0,
                since: proposal.link.since ?? null,
                until: proposal.link.until ?? null,
                notes: proposal.link.notes ?? '',
                visibility: 'referee',
                provenance: null,
                rev: 0,
                createdAt: now,
                updatedAt: now,
                deleted: false,
                baseRev: 0,
            },
        };
    }
    if (proposal.op === 'clock.set') {
        return { table: 'clock', id: 'campaignTime', change: { days: proposal.days, baseRev } };
    }
    const stored = storedCampaignRecord(sql, proposal.id);
    if (!stored || stored.deleted) refuse(400, 'validation', INVALID);
    const next: CampaignRecord & { baseRev: number } = { ...stored, baseRev, deleted: false };
    if (proposal.op === 'record.update') {
        if (proposal.set) Object.assign(next, proposal.set);
        if (proposal.append?.details) next.details = `${next.details}${proposal.append.details}`;
        if (proposal.append?.tags) next.tags = [...next.tags, ...proposal.append.tags];
    } else {
        const status = statusOf(next);
        if (proposal.op === 'track.append') status.track = [...(Array.isArray(status.track) ? status.track : []), proposal.leg];
        if (proposal.op === 'cargo.append') status.cargo = [...(Array.isArray(status.cargo) ? status.cargo : []), ...proposal.lots];
        if (proposal.op === 'passengers.append') status.passengers = [...(Array.isArray(status.passengers) ? status.passengers : []), ...proposal.passengers];
        if (proposal.op === 'ledger.append') status.ledger = [...(Array.isArray(status.ledger) ? status.ledger : []), ...proposal.lines];
        next.status = status as CampaignRecord['status'];
    }
    return { table: 'records', id: proposal.id, change: next };
}

export function resolveBatch(sql: Sql, batchId: string, body: unknown, now: string, universeId: string) {
    requireReady(sql);
    sweepProposals(sql, now);
    const parsed = ProposalResolve.safeParse(body);
    if (!parsed.success) throw resolveIssue(parsed.error.issues as Issue[]);
    const row = loadBatch(sql, batchId);
    if (!row) refuse(404, 'not_found', NO_UNIVERSE);
    const storedRows = sql.exec(`SELECT * FROM proposals WHERE batch_id = ? ORDER BY ordinal`, batchId);
    const byId = new Map(storedRows.map((item) => [String(item.id), item]));
    const seen = new Set<string>();
    for (const decision of parsed.data.decisions) {
        if (seen.has(decision.proposalId)) refuse(400, 'validation', INVALID);
        seen.add(decision.proposalId);
        const found = byId.get(decision.proposalId);
        if (!found || String(found.state) !== 'pending') refuse(400, 'validation', INVALID);
    }
    const refs = new Map<string, string>();
    for (const item of storedRows) {
        if (item.ref != null && item.target_id != null && String(item.op) === 'record.create') refs.set(String(item.ref), String(item.target_id));
    }
    const accepting = parsed.data.decisions.filter((decision) => decision.action === 'accept');
    const built: Built = { changes: { records: [], links: [], journal: [] }, proposalByKey: new Map(), creates: new Set() };
    const order = ['record.create', 'record.update', 'track.append', 'cargo.append', 'passengers.append', 'ledger.append', 'link.create', 'journal.create', 'clock.set'];
    const ranked = [...accepting].sort((a, b) => {
        const left = byId.get(a.proposalId);
        const right = byId.get(b.proposalId);
        return order.indexOf(String(left?.op)) - order.indexOf(String(right?.op));
    });
    let clock: unknown = null;
    for (const decision of ranked) {
        const item = byId.get(decision.proposalId);
        if (!item) continue;
        const proposal = (decision.change ?? parseJson(item.payload)) as ProposalValue;
        const checked = Proposal.safeParse(proposal);
        if (!checked.success) refuse(400, 'validation', INVALID);
        const baseRev = decision.baseRev ?? (item.base_rev == null ? 0 : Number(item.base_rev));
        const piece = buildChange(sql, checked.data, item.target_id == null ? null : String(item.target_id), baseRev, now, refs);
        if (!piece) continue;
        const key = `${piece.table}:${piece.id}`;
        built.proposalByKey.set(key, decision.proposalId);
        if (checked.data.op === 'record.create' || checked.data.op === 'link.create' || checked.data.op === 'journal.create') built.creates.add(decision.proposalId);
        if (piece.table === 'clock') {
            if (clock) refuse(400, 'validation', INVALID);
            clock = piece.change;
        } else {
            const list = built.changes[piece.table] as unknown[];
            list.push(piece.change);
        }
    }
    if (clock) built.changes.clock = clock;
    if (!built.changes.records?.length) delete built.changes.records;
    if (!built.changes.links?.length) delete built.changes.links;
    if (!built.changes.journal?.length) delete built.changes.journal;
    const applied: { proposalId: string; table: string; id: string; rev: number; seq: number }[] = [];
    const conflicts: { proposalId: string; table: string; id: string; current: unknown }[] = [];
    let summary: unknown;
    const hasWrite = built.changes.records || built.changes.links || built.changes.journal || built.changes.clock;
    if (hasWrite) {
        const ready = CampaignChanges.safeParse(built.changes);
        if (!ready.success) refuse(400, 'validation', INVALID);
        try {
            const wrote = applyCampaignChanges(sql, ready.data, now);
            summary = wrote.summary;
            for (const rowApplied of wrote.applied) {
                const proposalId = built.proposalByKey.get(`${rowApplied.table}:${rowApplied.id}`);
                if (!proposalId) continue;
                applied.push({ proposalId, table: rowApplied.table, id: rowApplied.id, rev: rowApplied.rev, seq: rowApplied.seq });
            }
            for (const rowConflict of wrote.conflicts) {
                const proposalId = built.proposalByKey.get(`${rowConflict.table}:${rowConflict.id}`);
                if (!proposalId) continue;
                const current = rowConflict.current as { rev?: unknown };
                if (built.creates.has(proposalId) && typeof current?.rev === 'number') {
                    applied.push({ proposalId, table: rowConflict.table, id: rowConflict.id, rev: current.rev, seq: 0 });
                    continue;
                }
                conflicts.push({ proposalId, table: rowConflict.table, id: rowConflict.id, current: rowConflict.current });
            }
        } catch (err) {
            if (err instanceof CampaignRefusal) {
                refuse(400, err.code === 'too_large' ? 'too_large' : 'validation', err.code === 'validation' ? INVALID : err.message);
            }
            throw err;
        }
    }
    const acceptedIds = new Set(applied.map((item) => item.proposalId));
    sql.transaction(() => {
        for (const decision of parsed.data.decisions) {
            if (decision.action === 'drop') {
                sql.exec(`UPDATE proposals SET state = 'dropped', decided_at = ? WHERE id = ?`, now, decision.proposalId);
                continue;
            }
            if (conflicts.some((item) => item.proposalId === decision.proposalId)) continue;
            if (!acceptedIds.has(decision.proposalId) && byId.get(decision.proposalId)?.op !== 'question') continue;
            const rev = applied.find((item) => item.proposalId === decision.proposalId)?.rev ?? null;
            sql.exec(
                `UPDATE proposals SET state = 'accepted', decided_at = ?, applied_rev = ? WHERE id = ?`,
                now,
                rev,
                decision.proposalId,
            );
        }
        recount(sql, batchId, now);
    });
    const fresh = loadBatch(sql, batchId);
    if (!fresh) refuse(404, 'not_found', NO_UNIVERSE);
    return { batch: toBatch(fresh, universeId, loadProposals(sql, batchId)), applied, conflicts, summary };
}

function settingsPayload(sql: Sql): { party: unknown; calendar: unknown; kinds: Record<string, string[]>; rev: number } {
    const rows = sql.exec(`SELECT rev, payload FROM lists WHERE kind = 'campaignSettings'`);
    if (!rows.length || rows[0].payload == null) {
        return { party: { vesselIds: [], aboard: {}, memberIds: [], anchor: null }, calendar: { dateFormat: 'imperial' }, kinds: {}, rev: 0 };
    }
    const parsed = parseJson(rows[0].payload) as { party?: unknown; calendar?: unknown; kinds?: Record<string, string[]>; rev?: number } | null;
    return {
        party: parsed?.party ?? { vesselIds: [], aboard: {}, memberIds: [], anchor: null },
        calendar: parsed?.calendar ?? { dateFormat: 'imperial' },
        kinds: parsed?.kinds ?? {},
        rev: Number(parsed?.rev ?? rows[0].rev ?? 0),
    };
}

export function readIndex(sql: Sql): unknown {
    const clockRow = sql.exec(`SELECT payload FROM lists WHERE kind = 'campaignTime'`)[0];
    const clock = clockRow?.payload == null ? null : parseJson(clockRow.payload);
    const records = sql.exec(`SELECT id, type, kind, name, tags, anchor, visibility, rev, updated_at FROM campaign_records WHERE deleted = 0 ORDER BY name`);
    const journal = sql.exec(`SELECT id, kind, title, when_json, sequence, rev FROM campaign_journal WHERE deleted = 0 ORDER BY seq DESC LIMIT 50`);
    const recordCount = Number(sql.exec(`SELECT COUNT(*) AS n FROM campaign_records WHERE deleted = 0`)[0]?.n ?? 0);
    const linkCount = Number(sql.exec(`SELECT COUNT(*) AS n FROM campaign_links WHERE deleted = 0`)[0]?.n ?? 0);
    const journalCount = Number(sql.exec(`SELECT COUNT(*) AS n FROM campaign_journal WHERE deleted = 0`)[0]?.n ?? 0);
    const pending = proposalsReady(sql)
        ? Number(sql.exec(`SELECT COUNT(*) AS n FROM proposals WHERE state = 'pending'`)[0]?.n ?? 0)
        : 0;
    return {
        clock,
        settings: settingsPayload(sql),
        records: records.map((row) => ({
            id: String(row.id),
            type: row.type,
            kind: String(row.kind),
            name: String(row.name),
            tags: parseJson(row.tags) ?? [],
            anchor: parseJson(row.anchor),
            visibility: row.visibility,
            rev: Number(row.rev),
            updatedAt: String(row.updated_at),
        })),
        journal: journal.map((row) => ({
            id: String(row.id),
            kind: row.kind,
            title: String(row.title),
            when: parseJson(row.when_json),
            sequence: row.sequence == null ? null : Number(row.sequence),
            rev: Number(row.rev),
        })),
        counts: { records: recordCount, links: linkCount, journal: journalCount, pendingProposals: pending },
    };
}

export function readRecords(sql: Sql, ids: string[]): { records: unknown[]; links: unknown[] } {
    const wanted = [...new Set(ids)].slice(0, RECORD_CAP);
    const records = [];
    const found = new Set<string>();
    for (const id of wanted) {
        const row = storedCampaignRecord(sql, id);
        if (!row || row.deleted) continue;
        records.push(row);
        found.add(row.id);
    }
    if (!found.size) return { records, links: [] };
    const links = sql.exec(`SELECT * FROM campaign_links WHERE deleted = 0`).filter((row) => found.has(String(row.from_id)) || found.has(String(row.to_id))).map((row) => ({
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
        provenance: parseJson(row.provenance),
        rev: Number(row.rev),
        createdAt: String(row.created_at),
        updatedAt: String(row.updated_at),
        deleted: Number(row.deleted) === 1,
    }));
    return { records, links };
}

export function searchRecords(sql: Sql, q: string, type: string | null, limit: number): { items: unknown[] } {
    if (q.length < 2 || q.length > 40) refuse(400, 'validation', INVALID);
    if (type && !CAMPAIGN_RECORD_TYPES.includes(type as typeof CAMPAIGN_RECORD_TYPES[number])) refuse(400, 'validation', INVALID);
    if (!Number.isInteger(limit) || limit < 1 || limit > 20) refuse(400, 'validation', INVALID);
    const escaped = q.replace(/[\\%_]/g, (ch) => `\\${ch}`);
    const pattern = `%${escaped}%`;
    if (new TextEncoder().encode(pattern).length > SEARCH_PATTERN_BYTES) refuse(400, 'validation', INVALID);
    const rows = type
        ? sql.exec(
            `SELECT id, type, kind, name, summary, anchor, rev FROM campaign_records
             WHERE deleted = 0 AND type = ? AND (
                lower(name) LIKE lower(?) ESCAPE '\\' OR lower(summary) LIKE lower(?) ESCAPE '\\' OR lower(tags) LIKE lower(?) ESCAPE '\\'
             ) ORDER BY name LIMIT ?`,
            type,
            pattern,
            pattern,
            pattern,
            limit,
        )
        : sql.exec(
            `SELECT id, type, kind, name, summary, anchor, rev FROM campaign_records
             WHERE deleted = 0 AND (
                lower(name) LIKE lower(?) ESCAPE '\\' OR lower(summary) LIKE lower(?) ESCAPE '\\' OR lower(tags) LIKE lower(?) ESCAPE '\\'
             ) ORDER BY name LIMIT ?`,
            pattern,
            pattern,
            pattern,
            limit,
        );
    return {
        items: rows.map((row) => ({
            id: String(row.id),
            type: row.type,
            kind: String(row.kind),
            name: String(row.name),
            summary: String(row.summary),
            anchor: parseJson(row.anchor),
            rev: Number(row.rev),
        })),
    };
}

export function proposalError(err: ProposalRefusal): Response {
    const headers = err.status === 429 ? { 'retry-after': '60' } : undefined;
    return Response.json({ ok: false, error: { code: err.code, message: err.message } }, { status: err.status, headers });
}

export async function respondProposals(
    sql: Sql,
    request: Request,
    options: { allowMutation: () => boolean; allowProposal: () => boolean; universeId: string },
): Promise<Response | null> {
    const url = new URL(request.url);
    const path = url.pathname;
    const agentRead = path === '/campaign/index' || path === '/campaign/records' || path === '/campaign/search';
    const proposal = path === '/campaign/proposals' || path.startsWith('/campaign/proposals/');
    if (!agentRead && !proposal) return null;
    const now = new Date().toISOString();
    try {
        if (request.method === 'GET' && path === '/campaign/index') {
            return Response.json({ ok: true, data: readIndex(sql) });
        }
        if (request.method === 'GET' && path === '/campaign/records') {
            const raw = url.searchParams.get('ids') ?? '';
            const ids = raw.split(',').map((item) => item.trim()).filter(Boolean);
            if (!ids.length || ids.length > RECORD_CAP) throw new ProposalRefusal(400, 'validation', INVALID);
            return Response.json({ ok: true, data: readRecords(sql, ids) });
        }
        if (request.method === 'GET' && path === '/campaign/search') {
            const q = url.searchParams.get('q') ?? '';
            const type = url.searchParams.get('type');
            const limitRaw = url.searchParams.get('limit');
            const limit = limitRaw == null || limitRaw === '' ? 20 : Number(limitRaw);
            return Response.json({ ok: true, data: searchRecords(sql, q, type, limit) });
        }
        if (!proposalsReady(sql)) return proposalError(new ProposalRefusal(503, 'proposals_unavailable', UNAVAILABLE));
        if (request.method === 'POST' && path === '/campaign/proposals') {
            let body: unknown;
            try {
                body = await request.json();
            } catch {
                throw new ProposalRefusal(400, 'validation', INVALID);
            }
            const result = submitProposals(sql, body, now, request.headers.get('x-voyage-token-id'), options.universeId, options.allowProposal);
            return Response.json({ ok: true, data: { batch: result.batch } }, { status: result.created ? 201 : 200 });
        }
        const batchMatch = /^\/campaign\/proposals\/([^/]+)$/.exec(path);
        const resolveMatch = /^\/campaign\/proposals\/([^/]+)\/resolve$/.exec(path);
        if (request.method === 'GET' && path === '/campaign/proposals') {
            return Response.json({ ok: true, data: listBatches(sql, url.searchParams.get('state'), now, options.universeId) });
        }
        if (request.method === 'GET' && batchMatch) {
            return Response.json({ ok: true, data: readBatch(sql, decodeURIComponent(batchMatch[1]), now, options.universeId) });
        }
        if (request.method === 'DELETE' && batchMatch) {
            if (!options.allowMutation()) {
                return Response.json({ ok: false, error: { code: 'rate_limited', message: 'Too many requests.' } }, { status: 429, headers: { 'retry-after': '60' } });
            }
            deleteBatch(sql, decodeURIComponent(batchMatch[1]));
            return Response.json({ ok: true, data: {} });
        }
        if (request.method === 'POST' && resolveMatch) {
            if (!options.allowMutation()) {
                return Response.json({ ok: false, error: { code: 'rate_limited', message: 'Too many requests.' } }, { status: 429, headers: { 'retry-after': '60' } });
            }
            let body: unknown;
            try {
                body = await request.json();
            } catch {
                throw new ProposalRefusal(400, 'validation', INVALID);
            }
            const result = resolveBatch(sql, decodeURIComponent(resolveMatch[1]), body, now, options.universeId);
            return Response.json({ ok: true, data: result });
        }
        return Response.json({ ok: false, error: { code: 'not_found', message: 'That page does not exist.' } }, { status: 404 });
    } catch (err) {
        if (err instanceof ProposalRefusal) return proposalError(err);
        throw err;
    }
}
