import type { Context, MiddlewareHandler } from 'hono';
import type { AppEnv } from './env';
import { fail } from './http.ts';
import { allowWindow, MUTATION_BUDGET, MUTATION_WINDOW_MS } from './universe/budget.ts';

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

/** A CSP report body past this is refused and not logged. */
const REPORT_BYTES = 8192;

const REPORT_TYPES = new Set(['application/csp-report', 'application/reports+json']);

const reportHits = new Map<string, number[]>();

function mediaType(header: string | undefined): string {
    return (header ?? '').split(';')[0].trim().toLowerCase();
}

function callerAddress(c: Context<AppEnv>): string {
    const address = c.req.header('cf-connecting-ip')?.trim();
    return address || 'local';
}

function firstString(record: Record<string, unknown>, keys: string[]): string | null {
    for (const key of keys) {
        const value = record[key];
        if (typeof value === 'string') return value;
    }
    return null;
}

/** The directive name. A value that carries a URL or a query is cut back to that name. */
function directiveOf(value: string): string {
    const clean = value.replace(/[\u0000-\u001f]/g, '').trim();
    if (!clean) return '';
    if (clean.length > 120 || /[?#]|:\/\//.test(clean)) {
        const token = clean.split(/\s+/)[0] ?? '';
        return /^[A-Za-z0-9-]{1,80}$/.test(token) ? token : '';
    }
    return clean;
}

/** The host of a blocked URL. A data URL and a query string stay out of the line. */
function blockedAddress(value: string): string {
    const text = value.trim();
    if (!text) return '';
    const candidate = text.startsWith('//') ? `https:${text}` : text;
    try {
        const url = new URL(candidate);
        if (url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'ws:' || url.protocol === 'wss:') return url.host;
        return url.protocol.slice(0, -1);
    } catch {
        return /^[A-Za-z0-9._-]{1,80}$/.test(text) ? text : '';
    }
}

function oneReport(value: unknown): { directive: string; blocked: string } | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    let source = record;
    const legacy = record['csp-report'];
    if (legacy && typeof legacy === 'object' && !Array.isArray(legacy)) source = legacy as Record<string, unknown>;
    else if (record.body && typeof record.body === 'object' && !Array.isArray(record.body)) source = record.body as Record<string, unknown>;
    const directive = firstString(source, ['violated-directive', 'effective-directive', 'effectiveDirective']);
    const blocked = firstString(source, ['blocked-uri', 'blockedURL']);
    if (directive === null && blocked === null) return null;
    return { directive: directiveOf(directive ?? ''), blocked: blockedAddress(blocked ?? '') };
}

/** One log line per report. The line is the directive and the blocked host. */
export function cspReportLines(text: string): string[] {
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch {
        return [];
    }
    const list = Array.isArray(parsed) ? parsed : [parsed];
    const lines: string[] = [];
    for (const item of list) {
        const report = oneReport(item);
        if (!report) continue;
        lines.push(JSON.stringify({ event: 'csp-report', directive: report.directive, blocked: report.blocked }));
    }
    return lines;
}

async function readReport(c: Context<AppEnv>): Promise<{ over: boolean; text: string }> {
    const declared = Number(c.req.header('content-length'));
    if (Number.isFinite(declared) && declared > REPORT_BYTES) return { over: true, text: '' };
    const stream = c.req.raw.body;
    if (!stream) return { over: false, text: '' };
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
        while (true) {
            const step = await reader.read();
            if (step.done) break;
            const value = step.value;
            if (!value) continue;
            total += value.byteLength;
            if (total > REPORT_BYTES) {
                await reader.cancel();
                return { over: true, text: '' };
            }
            chunks.push(value);
        }
    } catch {
        return { over: false, text: '' };
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return { over: false, text: new TextDecoder().decode(bytes) };
}

function reject(c: Context<AppEnv>, status: 413 | 415, message: string): Response {
    return c.json({ ok: false, error: { code: 'validation', message } }, status);
}

/** A browser report. A short, typed body is logged as directive and host, then discarded. No table. */
export async function cspReport(c: Context<AppEnv>): Promise<Response> {
    if (!REPORT_TYPES.has(mediaType(c.req.header('content-type')))) {
        return reject(c, 415, 'That request could not be read. Try again.');
    }
    const read = await readReport(c);
    if (read.over) return reject(c, 413, 'That report is larger than 8 KB.');
    const address = callerAddress(c);
    const hits = reportHits.get(address) ?? [];
    if (!allowWindow(hits, Date.now(), MUTATION_BUDGET, MUTATION_WINDOW_MS)) {
        reportHits.set(address, hits);
        c.header('retry-after', '60');
        return fail(c, 429, 'rate_limited', 'Too many requests.');
    }
    reportHits.set(address, hits);
    for (const line of cspReportLines(read.text)) console.log(line);
    return c.body(null, 204);
}
