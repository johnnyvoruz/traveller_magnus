import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
// The API workspace's `zod` is 3.25, whose `zod/v4` is not the Zod 4 the MCP SDK wraps.
// `zod4` is the package alias `npm:zod@4.6.5`.
import { z } from 'zod4';
import type { AppContext } from '../auth/session';
import {
    agentAccessOn,
    detectTokens,
    rateLimited,
    requireBearer,
    tokenReadLimited,
    tokenSubmitLimited,
    TOKENS_UNAVAILABLE,
    AGENTS_PAUSED,
    SCOPE_MISSING,
    type AgentActor,
} from '../auth/tokens';
import { agentCampaigns } from '../routes/agent';
import { fail } from '../http';
import { headersForDoor } from '../universe/door_headers';

const READ = { readOnlyHint: true } as const;
const SUBMIT = { destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;

function toolText(value: unknown, isError = false) {
    return {
        isError,
        content: [{ type: 'text' as const, text: JSON.stringify(value) }],
        structuredContent: value,
    };
}

async function asTool(response: Response) {
    const body = await response.json().catch(() => ({ ok: false, error: { code: 'internal', message: 'Something went wrong. Try again.' } }));
    if (!response.ok || (body && typeof body === 'object' && 'ok' in body && (body as { ok: boolean }).ok === false)) {
        return toolText(body, true);
    }
    const data = body && typeof body === 'object' && 'data' in body ? (body as { data: unknown }).data : body;
    return toolText(data, false);
}

function scopeError(scope: string) {
    return toolText({ ok: false, error: { code: 'scope_missing', message: SCOPE_MISSING, details: { scope } } }, true);
}

async function ownedDoor(c: AppContext, actor: AgentActor, universeId: string, path: string, init?: RequestInit): Promise<Response> {
    if (actor.universeId && actor.universeId !== universeId) return fail(c, 404, 'not_found', 'No such universe.');
    const row = await c.env.DB.prepare(
        `SELECT id FROM universes WHERE id = ? AND owner_id = ? AND deleted_at IS NULL`,
    ).bind(universeId, actor.id).first<{ id: string }>();
    if (!row) return fail(c, 404, 'not_found', 'No such universe.');
    const headers = headersForDoor(new Headers(init?.headers), actor.id, universeId);
    if (actor.tokenId) headers.set('x-voyage-token-id', actor.tokenId);
    const stub = c.env.UNIVERSE.get(c.env.UNIVERSE.idFromName(universeId));
    const url = new URL(path, 'https://universe.local');
    return stub.fetch(new Request(url, { method: init?.method ?? 'GET', headers, body: init?.body }));
}

function serverFor(c: AppContext, actor: AgentActor) {
    const server = new McpServer({ name: 'traveller-voyage', version: '1.2.0' });
    const can = (scope: 'campaign:read' | 'proposals:write') => actor.scopes.includes(scope);
    server.registerTool('list_campaigns', {
        description: 'List the campaigns this agent can read.',
        inputSchema: {} as any,
        annotations: READ,
    }, async () => {
        if (!can('campaign:read')) return scopeError('campaign:read');
        return asTool(await agentCampaigns(c));
    });
    server.registerTool('read_campaign_index', {
        description: 'Read the compact campaign index, including referee-only rows.',
        inputSchema: { universeId: z.string() } as any,
        annotations: READ,
    }, async ({ universeId }: { universeId: string }) => {
        if (!can('campaign:read')) return scopeError('campaign:read');
        if (actor.tokenId && tokenReadLimited(actor.tokenId)) return asTool(rateLimited(c));
        return asTool(await ownedDoor(c, actor, universeId, '/campaign/index'));
    });
    server.registerTool('read_records', {
        description: 'Read up to 50 records and the links that touch them.',
        inputSchema: { universeId: z.string(), ids: z.array(z.string()).max(50) } as any,
        annotations: READ,
    }, async ({ universeId, ids }: { universeId: string; ids: string[] }) => {
        if (!can('campaign:read')) return scopeError('campaign:read');
        if (actor.tokenId && tokenReadLimited(actor.tokenId)) return asTool(rateLimited(c));
        return asTool(await ownedDoor(c, actor, universeId, `/campaign/records?ids=${encodeURIComponent(ids.join(','))}`));
    });
    server.registerTool('search_records', {
        description: 'Search live record names, tags and summaries.',
        inputSchema: {
            universeId: z.string(),
            q: z.string(),
            type: z.string().optional(),
            limit: z.number().int().optional(),
        } as any,
        annotations: READ,
    }, async ({ universeId, q, type, limit }: { universeId: string; q: string; type?: string; limit?: number }) => {
        if (!can('campaign:read')) return scopeError('campaign:read');
        if (actor.tokenId && tokenReadLimited(actor.tokenId)) return asTool(rateLimited(c));
        const query = new URLSearchParams({ q });
        if (type) query.set('type', type);
        if (limit != null) query.set('limit', String(limit));
        return asTool(await ownedDoor(c, actor, universeId, `/campaign/search?${query}`));
    });
    server.registerTool('submit_proposals', {
        description: 'Submit a proposal batch. Nothing is applied. If the batch is unreviewed, stop at reviewUrl and do not resubmit.',
        inputSchema: { universeId: z.string(), batch: z.any() } as any,
        annotations: SUBMIT,
    }, async ({ universeId, batch }: { universeId: string; batch: unknown }) => {
        if (!can('proposals:write')) return scopeError('proposals:write');
        if (actor.tokenId && tokenSubmitLimited(actor.tokenId)) return asTool(rateLimited(c));
        return asTool(await ownedDoor(c, actor, universeId, '/campaign/proposals', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(batch),
        }));
    });
    server.registerTool('read_proposal_batch', {
        description: 'Read one proposal batch. If every proposal is pending, stop at reviewUrl and do not resubmit.',
        inputSchema: { universeId: z.string(), batchId: z.string() } as any,
        annotations: READ,
    }, async ({ universeId, batchId }: { universeId: string; batchId: string }) => {
        if (!can('campaign:read')) return scopeError('campaign:read');
        if (actor.tokenId && tokenReadLimited(actor.tokenId)) return asTool(rateLimited(c));
        return asTool(await ownedDoor(c, actor, universeId, `/campaign/proposals/${encodeURIComponent(batchId)}`));
    });
    return server;
}

function authenticateHeader(response: Response): Response {
    if (response.status !== 401) return response;
    const headers = new Headers(response.headers);
    headers.set('www-authenticate', 'Bearer error="invalid_token"');
    return new Response(response.body, { status: response.status, headers });
}

/** One stateless MCP endpoint. Bearer only. GET and DELETE are 405. */
export async function mcpFetch(c: AppContext): Promise<Response> {
    const origin = c.req.header('origin');
    if (origin && origin !== new URL(c.req.url).origin) {
        return fail(c, 403, 'forbidden', 'That request was blocked. Reload the page and try again.');
    }
    if (!await detectTokens(c.env.DB)) return fail(c, 503, 'tokens_unavailable', TOKENS_UNAVAILABLE);
    if (!await agentAccessOn(c.env.DB)) return fail(c, 503, 'agents_paused', AGENTS_PAUSED);
    if (c.req.method !== 'POST') {
        return c.json({ ok: false, error: { code: 'method_not_allowed', message: 'That page does not exist.' } }, 405);
    }
    const actor = await requireBearer(c);
    if (actor instanceof Response) return authenticateHeader(actor);
    const handler = createMcpHandler(() => serverFor(c, actor));
    return handler.fetch(c.req.raw);
}
