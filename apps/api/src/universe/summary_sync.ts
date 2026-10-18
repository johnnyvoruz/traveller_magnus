import type { CampaignSummary } from './campaign';

/** A yes is kept for the isolate. A no is asked again, so applying 0022 needs no restart. */
let summariesReady = false;

const MINUTE = 60 * 1000;

type Slot = { at: number; key: string };

const lastUpsert = new Map<string, Slot>();

/** Both gates: the values differ from the last upsert, and that upsert was at least a minute ago. */
export function summaryFingerprint(summary: CampaignSummary): string {
    return JSON.stringify([summary.vessels, summary.aboard, summary.clockDays, summary.records, summary.changedAt]);
}

export function summaryUpsertDue(universeId: string, summary: CampaignSummary, nowMs: number): boolean {
    const slot = lastUpsert.get(universeId);
    const key = summaryFingerprint(summary);
    if (!slot) return true;
    if (slot.key === key) return false;
    return nowMs - slot.at >= MINUTE;
}

export function noteSummaryUpsert(universeId: string, summary: CampaignSummary, nowMs: number): void {
    lastUpsert.set(universeId, { at: nowMs, key: summaryFingerprint(summary) });
}

export function forgetSummaryUpsert(universeId: string, summary: CampaignSummary): void {
    const slot = lastUpsert.get(universeId);
    if (slot && slot.key === summaryFingerprint(summary)) lastUpsert.delete(universeId);
}

export function resetSummaryUpserts(): void {
    lastUpsert.clear();
}

export async function detectSummaries(db: D1Database): Promise<boolean> {
    if (summariesReady) return true;
    const row = await db.prepare(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'universe_summaries'`,
    ).first<{ name: string }>();
    summariesReady = row?.name === 'universe_summaries';
    return summariesReady;
}

export function parseSummary(raw: unknown): CampaignSummary | null {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const row = raw as Record<string, unknown>;
    if (!Array.isArray(row.vessels) || row.vessels.some((item) => typeof item !== 'string')) return null;
    if (typeof row.aboard !== 'number' || !Number.isInteger(row.aboard) || row.aboard < 0) return null;
    if (!(row.clockDays === null || (typeof row.clockDays === 'number' && Number.isFinite(row.clockDays)))) return null;
    if (typeof row.records !== 'number' || !Number.isInteger(row.records) || row.records < 0) return null;
    if (typeof row.changedAt !== 'string' || !row.changedAt) return null;
    return {
        vessels: row.vessels as string[],
        aboard: row.aboard,
        clockDays: row.clockDays,
        records: row.records,
        changedAt: row.changedAt,
    };
}

/** Drop `summary` from a Durable Object body before the client schema sees it. */
export function liftSummary(data: object): CampaignSummary | null {
    if (!('summary' in data)) return null;
    const raw = (data as { summary?: unknown }).summary;
    delete (data as { summary?: unknown }).summary;
    return parseSummary(raw);
}

export async function splitSummary(response: Response): Promise<{ response: Response; summary: CampaignSummary | null }> {
    if (!response.ok) return { response, summary: null };
    const text = await response.text();
    let body: { data?: object };
    try {
        body = JSON.parse(text) as { data?: object };
    } catch {
        return { response: new Response(text, { status: response.status, headers: response.headers }), summary: null };
    }
    if (!body.data || !('summary' in body.data)) {
        return { response: new Response(text, { status: response.status, headers: response.headers }), summary: null };
    }
    const summary = liftSummary(body.data);
    const headers = new Headers(response.headers);
    headers.delete('content-length');
    return {
        response: new Response(JSON.stringify(body), { status: response.status, headers }),
        summary,
    };
}

type SummaryRow = {
    universeId: string;
    vessels: string;
    aboard: number;
    clockDays: number | null;
    records: number;
    changedAt: string;
};

export function summaryFromRow(row: SummaryRow): CampaignSummary | null {
    let vessels: unknown;
    try {
        vessels = JSON.parse(row.vessels);
    } catch {
        return null;
    }
    return parseSummary({
        vessels,
        aboard: Number(row.aboard),
        clockDays: row.clockDays == null ? null : Number(row.clockDays),
        records: Number(row.records),
        changedAt: String(row.changedAt),
    });
}

/** Null when the table is absent. A present table with no rows is an empty map. */
export async function readSummaries(db: D1Database, ids: string[]): Promise<Map<string, CampaignSummary> | null> {
    if (!await detectSummaries(db)) return null;
    const found = new Map<string, CampaignSummary>();
    if (!ids.length) return found;
    const marks = ids.map(() => '?').join(', ');
    const listed = await db.prepare(
        `SELECT universe_id AS universeId, vessels, aboard, clock_days AS clockDays, record_count AS records, changed_at AS changedAt
         FROM universe_summaries WHERE universe_id IN (${marks})`,
    ).bind(...ids).all<SummaryRow>();
    for (const row of listed.results ?? []) {
        const summary = summaryFromRow(row);
        if (summary) found.set(row.universeId, summary);
    }
    return found;
}

export async function readSummary(db: D1Database, universeId: string): Promise<CampaignSummary | null | undefined> {
    const found = await readSummaries(db, [universeId]);
    if (!found) return undefined;
    return found.get(universeId) ?? null;
}

/**
 * Upsert only when the values changed and this isolate's last upsert for the universe
 * was at least a minute ago. The Durable Object row is already current.
 */
export async function rememberCampaignSummary(db: D1Database, universeId: string, summary: CampaignSummary | null): Promise<void> {
    if (!summary) return;
    if (!await detectSummaries(db)) return;
    const nowMs = Date.now();
    if (!summaryUpsertDue(universeId, summary, nowMs)) return;
    noteSummaryUpsert(universeId, summary, nowMs);
    try {
        await db.prepare(
            `INSERT INTO universe_summaries (universe_id, vessels, aboard, clock_days, record_count, changed_at)
             VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT(universe_id) DO UPDATE SET
                vessels = excluded.vessels,
                aboard = excluded.aboard,
                clock_days = excluded.clock_days,
                record_count = excluded.record_count,
                changed_at = excluded.changed_at`,
        ).bind(
            universeId,
            JSON.stringify(summary.vessels),
            summary.aboard,
            summary.clockDays,
            summary.records,
            summary.changedAt,
        ).run();
    } catch (err) {
        forgetSummaryUpsert(universeId, summary);
        throw err;
    }
}
