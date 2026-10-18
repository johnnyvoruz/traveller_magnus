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

/** Join and claim tokens stay out of the log. The word `<token>` is the whole remainder. */
export function loggedRoute(path: string): string {
    if (path === '/join' || path.startsWith('/join/')) return '/join/<token>';
    if (path === '/api/join' || path.startsWith('/api/join/')) return '/api/join/<token>';
    if (path === '/claim' || path.startsWith('/claim/')) return '/claim/<token>';
    return path;
}

/** The access log. `via` and `tokenId` are the only token fields. The secret is never a value here. */
export function requestLog(fields: {
    requestId: string;
    route: string;
    userId: string | null;
    via: 'cookie' | 'token' | null;
    tokenId: string | null;
    status: number;
    duration: number;
}): string {
    return JSON.stringify({
        requestId: fields.requestId,
        route: fields.route,
        userId: fields.userId,
        universeId: null,
        via: fields.via,
        tokenId: fields.tokenId,
        status: fields.status,
        duration: fields.duration,
    });
}

export const requestContext: MiddlewareHandler<AppEnv> = async (c, next) => {
    const requestId = crypto.randomUUID();
    c.set('requestId', requestId);
    c.set('userId', null);
    c.set('via', null);
    c.set('tokenId', null);
    const started = Date.now();
    await next();
    console.log(requestLog({
        requestId,
        route: loggedRoute(c.req.path),
        userId: c.get('userId'),
        via: c.get('via'),
        tokenId: c.get('tokenId'),
        status: c.res.status,
        duration: Date.now() - started,
    }));
};
