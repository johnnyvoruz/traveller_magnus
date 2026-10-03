import { DurableObject } from 'cloudflare:workers';
import type { Env } from '../env';
import { migrate } from './schema';

export class UniverseDO extends DurableObject<Env> {
    constructor(ctx: DurableObjectState, env: Env) {
        super(ctx, env);
        ctx.blockConcurrencyWhile(() => migrate(ctx.storage));
    }

    async fetch(): Promise<Response> {
        return new Response(null, { status: 501 });
    }
}
