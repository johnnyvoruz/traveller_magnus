import type { Context, MiddlewareHandler } from 'hono';
import type { AppEnv } from './env';

/**
 * Report-only policy for the app, the chart CDN, and the sheet fonts.
 * The same text is in apps/web/public/_headers. It is not enforced.
 * Google Fonts are used by the pages under /sheets/.
 */
export const REPORT_ONLY_POLICY = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob: https://cdn.traveller.voyage",
    "connect-src 'self' https://cdn.traveller.voyage wss:",
    "font-src 'self' https://fonts.gstatic.com",
    "worker-src 'self' blob:",
    "frame-ancestors 'none'",
    'report-uri /api/csp-report',
].join('; ');

function stamp(headers: Headers): void {
    headers.set('x-content-type-options', 'nosniff');
    headers.set('referrer-policy', 'strict-origin-when-cross-origin');
    headers.set('x-frame-options', 'DENY');
    headers.set('content-security-policy-report-only', REPORT_ONLY_POLICY);
}

function carriedSocket(response: Response): WebSocket | null {
    const socket = (response as Response & { webSocket?: WebSocket | null }).webSocket;
    return socket ?? null;
}

/** On every Worker response except a WebSocket upgrade. A 101 carries the socket the runtime needs, and copying it drops that socket. */
export const securityHeaders: MiddlewareHandler<AppEnv> = async (c, next) => {
    await next();
    if (c.res.status === 101 || carriedSocket(c.res)) return;
    try {
        stamp(c.res.headers);
    } catch {
        const headers = new Headers(c.res.headers);
        stamp(headers);
        const socket = carriedSocket(c.res);
        c.res = new Response(c.res.body, {
            status: c.res.status,
            statusText: c.res.statusText,
            headers,
            ...(socket ? { webSocket: socket } : {}),
        });
    }
};

/** The browser's report. Logged and discarded. No table. */
export async function cspReport(c: Context<AppEnv>): Promise<Response> {
    const text = await c.req.text().catch(() => '');
    console.log(JSON.stringify({ event: 'csp-report', body: text.slice(0, 2000) }));
    return c.body(null, 204);
}
