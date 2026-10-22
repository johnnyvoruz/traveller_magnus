/**
 * The example campaign (AL8). One read of GET /api/demo/campaign, with no cookie.
 * The body is the players projection. It is opened the way View as players opens a page:
 * role player, then applyPlayersPage. There is no universe id and no poll, so a write
 * has nothing to send.
 */
import { PlayersPage, type PlayersPage as PlayersPageData } from '@voyage/shared';
import { exampleRead } from './commit.ts';
import { applyPlayersPage, campaign, transport } from './store.ts';

function idsOf(rows: readonly unknown[]): string[] {
    const ids: string[] = [];
    for (const row of rows) {
        if (!row || typeof row !== 'object') continue;
        const id = (row as { id?: unknown }).id;
        if (typeof id === 'string' && id) ids.push(id);
    }
    return ids;
}

/**
 * The route returns the projection (records, links, journal, settings, clock).
 * View as players loads a PlayersPage, so the missing page fields are filled here:
 * one page, done, and the ids the body already listed.
 */
function projectionPage(data: unknown): PlayersPageData | null {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
    const body = data as Record<string, unknown>;
    if (!Array.isArray(body.records) || !Array.isArray(body.links) || !Array.isArray(body.journal)) return null;
    const visible = body.visible && typeof body.visible === 'object' && !Array.isArray(body.visible)
        ? body.visible
        : {
            records: idsOf(body.records),
            links: idsOf(body.links),
            journal: idsOf(body.journal),
        };
    const parsed = PlayersPage.safeParse({
        records: body.records,
        links: body.links,
        journal: body.journal,
        settings: 'settings' in body ? body.settings : null,
        clock: 'clock' in body ? body.clock : null,
        seq: typeof body.seq === 'number' ? body.seq : 0,
        done: body.done === false ? false : true,
        visible,
    });
    return parsed.success ? parsed.data : null;
}

/** The example, or null when it is missing or not available yet. */
export async function loadDemo(): Promise<PlayersPageData | null> {
    let res: Response;
    // A plain call: a browser's fetch called as transport.fetch(...) throws "Illegal invocation".
    const fetchNow = transport.fetch;
    try {
        res = await fetchNow('/api/demo/campaign', { credentials: 'omit' });
    } catch {
        return null;
    }
    if (res.status === 404 || res.status === 503 || !res.ok) return null;
    let data: unknown;
    try {
        const body = await res.json() as { data?: unknown };
        data = body.data;
    } catch {
        return null;
    }
    const page = projectionPage(data);
    if (!page) return null;
    campaign.role = 'player';
    campaign.universeId = null;
    campaign.status = 'ready';
    exampleRead.on = true;
    applyPlayersPage(page);
    if (!page.settings) campaign.settings = null;
    return page;
}
