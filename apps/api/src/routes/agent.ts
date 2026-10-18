import type { Hono } from 'hono';
import type { AppEnv } from '../env';
import { fail } from '../http';
import { requireAgent, rateLimited, tokenReadLimited, tokenSubmitLimited, type AgentActor } from '../auth/tokens';
import { privateNoStore } from '../universe/door_headers';
import { ownedUniverse, type OwnedUniverse } from '../universe/forward';
import { rememberCampaignSummary, splitSummary } from '../universe/summary_sync';
import { refreshAfterCampaign } from './public_games';

async function readAgent(c: Parameters<typeof requireAgent>[0], scope: 'campaign:read' | 'proposals:write'): Promise<{ actor: AgentActor; owned: OwnedUniverse } | Response> {
    const actor = await requireAgent(c, scope);
    if (actor instanceof Response) return actor;
    if (actor.via === 'token' && actor.tokenId) {
        const limited = scope === 'proposals:write' ? tokenSubmitLimited(actor.tokenId) : tokenReadLimited(actor.tokenId);
        if (limited) return rateLimited(c);
    }
    const owned = await ownedUniverse(c, actor);
    if (owned instanceof Response) return owned;
    return { actor, owned };
}

function door(owned: OwnedUniverse, url: URL, raw: Request, extra?: Record<string, string>): Promise<Response> {
    return owned.forward(new Request(url, raw), extra);
}

export async function agentCampaigns(c: Parameters<typeof requireAgent>[0]): Promise<Response> {
    const actor = await requireAgent(c, 'campaign:read');
    if (actor instanceof Response) return privateNoStore(actor);
    if (actor.via === 'token' && actor.tokenId && tokenReadLimited(actor.tokenId)) return privateNoStore(rateLimited(c));
    const bound = actor.universeId;
    const listed = bound
        ? await c.env.DB.prepare(
            `SELECT id, name, truth_version AS truthVersion FROM universes WHERE id = ? AND owner_id = ? AND deleted_at IS NULL`,
        ).bind(bound, actor.id).all<{ id: string; name: string; truthVersion: string | null }>()
        : await c.env.DB.prepare(
            `SELECT id, name, truth_version AS truthVersion FROM universes WHERE owner_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC`,
        ).bind(actor.id).all<{ id: string; name: string; truthVersion: string | null }>();
    const items = [];
    for (const row of listed.results ?? []) {
        const headers = new Headers();
        headers.set('x-voyage-user-id', actor.id);
        headers.set('x-voyage-universe-id', row.id);
        const stub = c.env.UNIVERSE.get(c.env.UNIVERSE.idFromName(row.id));
        const response = await stub.fetch(new Request('https://universe.local/campaign/index', { headers }));
        const body = await response.json().catch(() => null) as { ok?: boolean; data?: { clock?: { days: number; rev: number } | null; counts?: { records: number; links: number; journal: number; pendingProposals: number } } } | null;
        if (!response.ok || !body?.ok || !body.data?.counts) {
            return privateNoStore(fail(c, 500, 'internal', 'Something went wrong. Try again.'));
        }
        items.push({
            id: row.id,
            name: row.name,
            truthVersion: row.truthVersion,
            clock: body.data.clock ?? null,
            counts: {
                records: body.data.counts.records,
                links: body.data.counts.links,
                journal: body.data.counts.journal,
            },
            pendingProposals: body.data.counts.pendingProposals,
        });
    }
    return privateNoStore(c.json({ ok: true, data: { items } }));
}

export function mountAgentRoutes(route: Hono<AppEnv>): void {
    route.get('/:id/campaign/index', async (c) => {
        const access = await readAgent(c, 'campaign:read');
        if (access instanceof Response) return privateNoStore(access);
        const url = new URL('https://universe.local/campaign/index');
        return privateNoStore(await door(access.owned, url, c.req.raw));
    });

    route.get('/:id/campaign/records', async (c) => {
        const access = await readAgent(c, 'campaign:read');
        if (access instanceof Response) return privateNoStore(access);
        const url = new URL(c.req.url);
        url.pathname = '/campaign/records';
        return privateNoStore(await door(access.owned, url, c.req.raw));
    });

    route.get('/:id/campaign/search', async (c) => {
        const access = await readAgent(c, 'campaign:read');
        if (access instanceof Response) return privateNoStore(access);
        const url = new URL(c.req.url);
        url.pathname = '/campaign/search';
        return privateNoStore(await door(access.owned, url, c.req.raw));
    });

    route.post('/:id/campaign/proposals', async (c) => {
        const access = await readAgent(c, 'proposals:write');
        if (access instanceof Response) return privateNoStore(access);
        const url = new URL(c.req.url);
        url.pathname = '/campaign/proposals';
        const extra = access.actor.tokenId ? { 'x-voyage-token-id': access.actor.tokenId } : undefined;
        return privateNoStore(await door(access.owned, url, c.req.raw, extra));
    });

    route.get('/:id/campaign/proposals', async (c) => {
        const access = await readAgent(c, 'campaign:read');
        if (access instanceof Response) return privateNoStore(access);
        const url = new URL(c.req.url);
        url.pathname = '/campaign/proposals';
        return privateNoStore(await door(access.owned, url, c.req.raw));
    });

    route.post('/:id/campaign/proposals/:batchId/resolve', async (c) => {
        const owned = await ownedUniverse(c);
        if (owned instanceof Response) return privateNoStore(owned);
        const url = new URL(c.req.url);
        url.pathname = `/campaign/proposals/${c.req.param('batchId')}/resolve`;
        const forwarded = await owned.forward(new Request(url, c.req.raw));
        const taken = await splitSummary(forwarded);
        if (taken.response.ok) await rememberCampaignSummary(c.env.DB, owned.row.id, taken.summary);
        await refreshAfterCampaign(c.env, owned, taken.response);
        return privateNoStore(taken.response);
    });

    route.delete('/:id/campaign/proposals/:batchId', async (c) => {
        const owned = await ownedUniverse(c);
        if (owned instanceof Response) return privateNoStore(owned);
        const url = new URL(c.req.url);
        url.pathname = `/campaign/proposals/${c.req.param('batchId')}`;
        return privateNoStore(await owned.forward(new Request(url, c.req.raw)));
    });

    route.get('/:id/campaign/proposals/:batchId', async (c) => {
        const access = await readAgent(c, 'campaign:read');
        if (access instanceof Response) return privateNoStore(access);
        const url = new URL(c.req.url);
        url.pathname = `/campaign/proposals/${c.req.param('batchId')}`;
        return privateNoStore(await door(access.owned, url, c.req.raw));
    });
}
