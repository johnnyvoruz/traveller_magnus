import { DurableObject } from 'cloudflare:workers';
import type { Env } from '../env';
import { chargesMutationBudget, MUTATION_BUDGET, MUTATION_WINDOW_MS, PROPOSAL_SUBMIT_BUDGET } from './budget';
import { respondProposals } from './proposals';
import { applyCampaignChanges, CampaignRefusal, journalAuthorReady, playersCampaignHashes, readCampaign, readPlayersCampaign, type Sql } from './campaign';
import { respondBuilder } from './hexes';
import { applyInstall, InstallRefusal, previewInstall, removeInstall, type InstallBody, type InstallRemoveBody } from './install';
import { readPublishSources } from './publish_read';
import { ensureReservationTable, parseQuotaBody, QUOTA_SENTENCE, releaseBytes, reservationTtlMs, reserveBytes, type QuotaSql } from './quota';
import { migrate } from './schema';

/** Handles the Worker read from D1. A missing or unreadable header leaves names blank. */
function handleMap(raw: string | null): Record<string, string> {
    if (!raw) return {};
    try {
        const parsed = JSON.parse(raw) as unknown;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
        const handles: Record<string, string> = {};
        for (const [key, value] of Object.entries(parsed)) {
            if (typeof value === 'string') handles[key] = value;
        }
        return handles;
    } catch {
        return {};
    }
}

export class UniverseDO extends DurableObject<Env> {
    private mutationHits: number[] = [];
    private proposalHits: number[] = [];

    constructor(ctx: DurableObjectState, env: Env) {
        super(ctx, env);
        ctx.blockConcurrencyWhile(() => migrate(ctx.storage));
    }

    private allowMutation(): boolean {
        const now = Date.now();
        this.mutationHits = this.mutationHits.filter((at) => now - at < MUTATION_WINDOW_MS);
        if (this.mutationHits.length >= MUTATION_BUDGET) return false;
        this.mutationHits.push(now);
        return true;
    }

    private allowProposal(): boolean {
        const now = Date.now();
        this.proposalHits = this.proposalHits.filter((at) => now - at < MUTATION_WINDOW_MS);
        if (this.proposalHits.length >= PROPOSAL_SUBMIT_BUDGET) return false;
        this.proposalHits.push(now);
        return true;
    }

    async fetch(request: Request): Promise<Response> {
        const url = new URL(request.url);
        const sql: Sql = {
            exec: (query, ...params) => this.ctx.storage.sql.exec(query, ...params).toArray() as ReturnType<Sql['exec']>,
            transaction: (fn) => this.ctx.storage.transactionSync(fn),
        };
        const builderPath = url.pathname === '/pin' || url.pathname.startsWith('/hexes') || url.pathname.startsWith('/jobs') || url.pathname.startsWith('/sectors');
        if (chargesMutationBudget(request.method, url.pathname, request.headers.get('x-voyage-worker')) && !this.allowMutation()) {
            return Response.json(
                { ok: false, error: { code: 'rate_limited', message: 'Too many requests.' } },
                { status: 429, headers: { 'retry-after': '60' } },
            );
        }
        if (builderPath) {
            const built = await respondBuilder(sql, request, new Date().toISOString());
            if (built) return built;
        }
        if (request.method === 'GET' && url.pathname === '/campaign') {
            const after = Number(url.searchParams.get('after') ?? '0');
            const limit = Number(url.searchParams.get('limit') ?? '1000');
            if (!Number.isInteger(after) || after < 0 || !Number.isInteger(limit) || limit < 1) {
                return Response.json({ ok: false, error: { code: 'validation', message: 'That request could not be read. Try again.' } }, { status: 400 });
            }
            const withAuthor = request.headers.get('x-voyage-authors') === '1';
            return Response.json({ ok: true, data: readCampaign(sql, after, limit, withAuthor) });
        }
        if (request.method === 'GET' && url.pathname === '/campaign/seq') {
            const counter = sql.exec(`SELECT value FROM meta WHERE key = 'campaignSeq'`);
            return Response.json({ ok: true, data: { seq: Number(counter[0]?.value ?? 0) } });
        }
        if (request.method === 'GET' && url.pathname === '/campaign/object-hashes') {
            return Response.json({ ok: true, data: { hashes: playersCampaignHashes(sql) } });
        }
        if (request.method === 'GET' && url.pathname === '/campaign/players') {
            const memberId = request.headers.get('x-voyage-member');
            if (!memberId) {
                return Response.json({ ok: false, error: { code: 'validation', message: 'That request could not be read. Try again.' } }, { status: 400 });
            }
            const after = Number(url.searchParams.get('after') ?? '0');
            const limit = Number(url.searchParams.get('limit') ?? '1000');
            if (!Number.isInteger(after) || after < 0 || !Number.isInteger(limit) || limit < 1) {
                return Response.json({ ok: false, error: { code: 'validation', message: 'That request could not be read. Try again.' } }, { status: 400 });
            }
            return Response.json({ ok: true, data: readPlayersCampaign(sql, after, limit, { userId: memberId, handles: handleMap(request.headers.get('x-voyage-handles')) }) });
        }
        if (request.method === 'PATCH' && url.pathname === '/campaign/changes') {
            const memberId = request.headers.get('x-voyage-member');
            if (!memberId && !this.allowMutation()) {
                return Response.json(
                    { ok: false, error: { code: 'rate_limited', message: 'Too many requests.' } },
                    { status: 429, headers: { 'retry-after': '60' } },
                );
            }
            if (memberId && !journalAuthorReady(sql)) {
                return Response.json(
                    { ok: false, error: { code: 'players_unavailable', message: 'Players are not available yet.' } },
                    { status: 503 },
                );
            }
            let body: unknown;
            try {
                body = await request.json();
            } catch {
                return Response.json({ ok: false, error: { code: 'validation', message: 'That request could not be read. Try again.' } }, { status: 400 });
            }
            try {
                const acknowledgePublic = !memberId && request.headers.get('x-voyage-journal') === 'public';
                const result = applyCampaignChanges(sql, body, new Date().toISOString(), acknowledgePublic, memberId ? { userId: memberId } : null);
                return Response.json({ ok: true, data: result });
            } catch (err) {
                if (err instanceof CampaignRefusal) {
                    const error: { code: string; message: string; details?: unknown } = { code: err.code, message: err.message };
                    if (err.details !== undefined) error.details = err.details;
                    return Response.json({ ok: false, error }, { status: err.code === 'forbidden' ? 403 : 400 });
                }
                throw err;
            }
        }
        const proposed = await respondProposals(sql, request, {
            allowMutation: () => this.allowMutation(),
            allowProposal: () => this.allowProposal(),
            universeId: request.headers.get('x-voyage-universe-id') ?? '',
        });
        if (proposed) return proposed;
        if (request.method === 'POST' && url.pathname === '/publish-read') {
            let body: unknown;
            try {
                body = await request.json();
            } catch {
                return Response.json({ ok: false, error: { code: 'validation', message: 'That request could not be read. Try again.' } }, { status: 400 });
            }
            return Response.json({ ok: true, data: readPublishSources(sql, body) });
        }
        if (request.method === 'POST' && (url.pathname === '/install/preview' || url.pathname === '/install' || url.pathname === '/install/remove')) {
            if (url.pathname !== '/install/preview' && !this.allowMutation()) {
                return Response.json(
                    { ok: false, error: { code: 'rate_limited', message: 'Too many requests.' } },
                    { status: 429, headers: { 'retry-after': '60' } },
                );
            }
            let body: unknown;
            try {
                body = await request.json();
            } catch {
                return Response.json({ ok: false, error: { code: 'validation', message: 'That request could not be read. Try again.' } }, { status: 400 });
            }
            try {
                const data = url.pathname === '/install/remove'
                    ? removeInstall(sql, body as InstallRemoveBody, new Date().toISOString())
                    : url.pathname === '/install'
                    ? applyInstall(sql, body as InstallBody, new Date().toISOString())
                    : previewInstall(sql, body as Parameters<typeof previewInstall>[1]);
                return Response.json({ ok: true, data });
            } catch (err) {
                if (err instanceof InstallRefusal) {
                    const error: { code: string; message: string; details?: unknown } = { code: err.code, message: err.message };
                    if (err.details !== undefined) error.details = err.details;
                    return Response.json({ ok: false, error }, { status: err.status });
                }
                throw err;
            }
        }
        if (request.method === 'POST' && (url.pathname === '/quota/reserve' || url.pathname === '/quota/release')) {
            return this.quota(sql, request, url.pathname);
        }
        return Response.json({ ok: false, error: { code: 'not_found', message: 'That page does not exist.' } }, { status: 404 });
    }

    /**
     * Read D1 first. The check and the insert then run with no await between them,
     * so a second reserve sees the first row. A refusal is 400, never a wait.
     */
    private async quota(sql: Sql, request: Request, pathname: string): Promise<Response> {
        let body: unknown;
        try {
            body = await request.json();
        } catch {
            return Response.json({ ok: false, error: { code: 'validation', message: 'That request could not be read. Try again.' } }, { status: 400 });
        }
        const parsed = parseQuotaBody(body);
        if (parsed === 'too_large') {
            return Response.json({ ok: false, error: { code: 'too_large', message: QUOTA_SENTENCE } }, { status: 400 });
        }
        if (!parsed) return Response.json({ ok: false, error: { code: 'validation', message: 'That request could not be read. Try again.' } }, { status: 400 });
        const quotaSql: QuotaSql = {
            exec: (query, ...params) => sql.exec(query, ...params) as ReturnType<QuotaSql['exec']>,
        };
        ensureReservationTable(quotaSql);
        const releasing = pathname === '/quota/release';
        const objectBytes = releasing || parsed.bytes === 0 ? 0 : await this.chargedBytes(parsed.universeId);
        const now = Date.now();
        const ttlMs = reservationTtlMs((this.env as Env & { QUOTA_RESERVATION_MS?: string }).QUOTA_RESERVATION_MS);
        let refused = false;
        sql.transaction(() => {
            if (releasing) releaseBytes(quotaSql, parsed.id, parsed.bytes);
            else refused = !reserveBytes(quotaSql, { id: parsed.id, bytes: parsed.bytes, objectBytes, now, ttlMs }).ok;
        });
        if (refused) {
            return Response.json({ ok: false, error: { code: 'too_large', message: QUOTA_SENTENCE } }, { status: 400 });
        }
        return Response.json({ ok: true, data: { id: parsed.id, bytes: parsed.bytes } });
    }

    private async chargedBytes(universeId: string): Promise<number> {
        const row = await this.env.DB.prepare(
            `SELECT object_bytes AS objectBytes FROM universes WHERE id = ?`,
        ).bind(universeId).first<{ objectBytes: number }>();
        return row?.objectBytes ?? 0;
    }
}
