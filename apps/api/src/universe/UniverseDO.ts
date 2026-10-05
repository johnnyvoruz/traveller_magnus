import { DurableObject } from 'cloudflare:workers';
import type { Env } from '../env';
import { applyCampaignChanges, CampaignRefusal, readCampaign, type Sql } from './campaign';
import { migrate } from './schema';

const WINDOW = 60_000;
const BUDGET = 120;

export class UniverseDO extends DurableObject<Env> {
    private mutationHits: number[] = [];

    constructor(ctx: DurableObjectState, env: Env) {
        super(ctx, env);
        ctx.blockConcurrencyWhile(() => migrate(ctx.storage));
    }

    private allowMutation(): boolean {
        const now = Date.now();
        this.mutationHits = this.mutationHits.filter((at) => now - at < WINDOW);
        if (this.mutationHits.length >= BUDGET) return false;
        this.mutationHits.push(now);
        return true;
    }

    async fetch(request: Request): Promise<Response> {
        const url = new URL(request.url);
        const sql: Sql = {
            exec: (query, ...params) => this.ctx.storage.sql.exec(query, ...params).toArray() as ReturnType<Sql['exec']>,
            transaction: (fn) => this.ctx.storage.transactionSync(fn),
        };
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
                const result = applyCampaignChanges(sql, body, new Date().toISOString());
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
        return Response.json({ ok: false, error: { code: 'not_found', message: 'No such route.' } }, { status: 404 });
    }
}
