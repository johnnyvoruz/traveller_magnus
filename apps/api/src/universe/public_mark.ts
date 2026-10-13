import { publicMarkHex, type CampaignPage, type CampaignRecord } from '@voyage/shared';
import type { Env } from '../env';

const PLACE_TABLES = new Set(['records', 'settings', 'clock']);

export function placeTouched(applied: { table: string }[]): boolean {
    return applied.some((row) => PLACE_TABLES.has(row.table));
}

async function readDocument(env: Env, universeId: string): Promise<{
    records: CampaignRecord[];
    settings: CampaignPage['settings'];
    clock: CampaignPage['clock'];
}> {
    const stub = env.UNIVERSE.get(env.UNIVERSE.idFromName(universeId));
    const records = new Map<string, CampaignRecord>();
    let settings: CampaignPage['settings'] | null = null;
    let clock: CampaignPage['clock'] = null;
    let after = 0;
    for (let page = 0; page < 40; page += 1) {
        const response = await stub.fetch(new Request(`https://universe.internal/campaign?after=${after}&limit=1000`));
        const body = await response.json() as { ok?: boolean; data?: CampaignPage };
        if (!response.ok || !body.ok || !body.data) break;
        for (const record of body.data.records) records.set(record.id, record);
        settings = body.data.settings;
        clock = body.data.clock;
        if (body.data.done) break;
        if (body.data.seq <= after) break;
        after = body.data.seq;
    }
    return {
        records: [...records.values()],
        settings: settings ?? {
            party: { vesselId: null, memberIds: [], anchor: null },
            kinds: {},
            calendar: { dateFormat: 'imperial' },
            rev: 0,
        },
        clock,
    };
}

/** One D1 write. Deletes the mark when the contract does not publish a hex. */
export async function writePublicMark(env: Env, universeId: string, truthVersion: string | null): Promise<void> {
    const document = await readDocument(env, universeId);
    const hex = truthVersion ? publicMarkHex({
        settings: document.settings,
        records: document.records,
        clock: document.clock,
    }) : null;
    if (!hex || !truthVersion) {
        await env.DB.prepare(`DELETE FROM public_marks WHERE universe_id = ?`).bind(universeId).run();
        return;
    }
    const now = new Date().toISOString();
    await env.DB.prepare(
        `INSERT INTO public_marks (universe_id, truth_version, sector_slug, local_hex, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(universe_id) DO UPDATE SET
            truth_version = excluded.truth_version,
            sector_slug = excluded.sector_slug,
            local_hex = excluded.local_hex,
            updated_at = excluded.updated_at`,
    ).bind(universeId, truthVersion, hex.sector, hex.localHex, now).run();
}

export async function deletePublicMark(env: Env, universeId: string): Promise<void> {
    await env.DB.prepare(`DELETE FROM public_marks WHERE universe_id = ?`).bind(universeId).run();
}
