import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from './env';

type Ctx = Parameters<MiddlewareHandler<AppEnv>>[0];

export function ok(c: Ctx, data: unknown, status: 200 | 201 | 202 = 200) {
    return c.json({ ok: true, data }, status);
}

export function fail(c: Ctx, status: 400 | 401 | 403 | 404 | 409 | 429 | 500 | 503, code: string, message: string, details?: unknown) {
    const error: { code: string; message: string; details?: unknown } = { code, message };
    if (details !== undefined) error.details = details;
    return c.json({ ok: false, error }, status);
}

export const requestContext: MiddlewareHandler<AppEnv> = async (c, next) => {
    const requestId = crypto.randomUUID();
    c.set('requestId', requestId);
    c.set('userId', null);
    const started = Date.now();
    await next();
    console.log(JSON.stringify({
        requestId,
        route: c.req.path,
        userId: c.get('userId'),
        universeId: null,
        status: c.res.status,
        duration: Date.now() - started,
    }));
};
