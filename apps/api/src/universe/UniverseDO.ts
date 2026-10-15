import { DurableObject } from 'cloudflare:workers';
import type { Env } from '../env';
import { chargesMutationBudget, MUTATION_BUDGET, MUTATION_WINDOW_MS } from './budget';
import { applyCampaignChanges, CampaignRefusal, readCampaign, type Sql } from './campaign';
import { respondBuilder } from './hexes';
import { applyInstall, InstallRefusal, previewInstall, removeInstall, type InstallBody, type InstallRemoveBody } from './install';
import { readPublishSources } from './publish_read';
import { migrate } from './schema';

export class UniverseDO extends DurableObject<Env> {
    private mutationHits: number[] = [];

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
                return Response.json({ ok: false, error: { code: 'validation', message: 'Invalid request.' } }, { status: 400 });
            }
            return Response.json({ ok: true, data: readCampaign(sql, after, limit) });
        }
        if (request.method === 'PATCH' && url.pathname === '/campaign/changes') {
            if (!this.allowMutation()) {
                return Response.json(
                    { ok: false, error: { code: 'rate_limited', message: 'Too many requests.' } },
                    { status: 429, headers: { 'retry-after': '60' } },
                );
            }
            let body: unknown;
            try {
                body = await request.json();
            } catch {
                return Response.json({ ok: false, error: { code: 'validation', message: 'Invalid JSON.' } }, { status: 400 });
            }
            try {
                const acknowledgePublic = request.headers.get('x-voyage-journal') === 'public';
                const result = applyCampaignChanges(sql, body, new Date().toISOString(), acknowledgePublic);
                return Response.json({ ok: true, data: result });
            } catch (err) {
                if (err instanceof CampaignRefusal) {
                    const error: { code: string; message: string; details?: unknown } = { code: err.code, message: err.message };
                    if (err.details !== undefined) error.details = err.details;
                    return Response.json({ ok: false, error }, { status: 400 });
                }
                throw err;
            }
        }
        if (request.method === 'POST' && url.pathname === '/publish-read') {
            let body: unknown;
            try {
                body = await request.json();
            } catch {
                return Response.json({ ok: false, error: { code: 'validation', message: 'Invalid JSON.' } }, { status: 400 });
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
                return Response.json({ ok: false, error: { code: 'validation', message: 'Invalid JSON.' } }, { status: 400 });
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
        return Response.json({ ok: false, error: { code: 'not_found', message: 'No such route.' } }, { status: 404 });    }
}
