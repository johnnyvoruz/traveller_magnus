import type { Hono } from 'hono';
import type { AppEnv } from '../env';
import { fail } from '../http';
import { ownedUniverse } from '../universe/forward';

const PAGE = 1000;

type LiveRow = { deleted?: boolean };

type CampaignPageBody = {
    records: LiveRow[];
    links: LiveRow[];
    journal?: LiveRow[];
    settings: unknown;
    clock: unknown;
    seq: number;
    done: boolean;
};

function dayOfYear(now: Date): string {
    const year = now.getUTCFullYear();
    const start = Date.UTC(year, 0, 1);
    const day = Math.floor((now.getTime() - start) / 86_400_000) + 1;
    return `${String(day).padStart(3, '0')}-${year}`;
}

function attachmentName(campaignName: string, now: Date): string {
    const safe = campaignName.replace(/[\u0000-\u001f"\\/]/g, '').trim() || 'campaign';
    return `${safe}-${dayOfYear(now)}.json`;
}

function live<T extends LiveRow>(rows: T[]): T[] {
    return rows.filter((row) => row.deleted !== true);
}

export function mountCampaignExport(route: Hono<AppEnv>): void {
    route.get('/:id/campaign/export', async (c) => {
        const owned = await ownedUniverse(c);
        if (owned instanceof Response) return owned;
        const records: LiveRow[] = [];
        const links: LiveRow[] = [];
        const journal: LiveRow[] = [];
        let settings: unknown = null;
        let clock: unknown = null;
        let after = 0;
        for (;;) {
            const url = new URL('https://universe.internal/campaign');
            url.searchParams.set('after', String(after));
            url.searchParams.set('limit', String(PAGE));
            const response = await owned.forward(new Request(url));
            const body = await response.json().catch(() => null) as { ok?: boolean; data?: CampaignPageBody } | null;
            if (!response.ok || !body?.ok || !body.data) {
                return new Response(JSON.stringify(body ?? { ok: false, error: { code: 'internal', message: 'Campaign read failed.' } }), {
                    status: response.ok ? 502 : response.status,
                    headers: { 'content-type': 'application/json; charset=utf-8' },
                });
            }
            const page = body.data;
            records.push(...live(page.records ?? []));
            links.push(...live(page.links ?? []));
            journal.push(...live(page.journal ?? []));
            settings = page.settings;
            clock = page.clock;
            if (page.done) break;
            if (!Number.isInteger(page.seq) || page.seq <= after) {
                return fail(c, 500, 'internal', 'Campaign page did not advance.');
            }
            after = page.seq;
        }
        const exportedAt = new Date();
        const document = {
            universe: {
                id: owned.row.id,
                name: owned.row.name,
                truthVersion: owned.row.truthVersion,
            },
            exportedAt: exportedAt.toISOString(),
            records,
            links,
            journal,
            settings,
            clock,
        };
        const filename = attachmentName(owned.row.name, exportedAt);
        return new Response(JSON.stringify(document), {
            status: 200,
            headers: {
                'content-type': 'application/json; charset=utf-8',
                'content-disposition': `attachment; filename="${filename}"`,
            },
        });
    });
}
