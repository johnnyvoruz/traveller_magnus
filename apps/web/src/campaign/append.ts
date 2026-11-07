/**
 * The append door (B's DS4a; findings/ship_crew_plan.md §3 (3a)): a member's one piece added
 * to a party ship, `PATCH /api/universes/:id/campaign/changes` with `appends: [{ id, append }]`
 * and no `baseRev`. The object merges it into the record it holds and bumps the record's rev.
 * The answer is the usual changes result; the record comes back on the next read, which this
 * module asks for at once so both lists on the screen are the server's.
 */
import type { StatusAppend } from '@voyage/shared';
import { apiFetch } from '../platform/http.ts';
import { campaign, loadPlayerPages, transport } from './store.ts';

export type AppendResult = { ok: true } | { ok: false; sentence: string };

export const APPEND_OFFLINE = 'You are offline. Try again when you are back online.';

async function sentenceOf(res: Response): Promise<string> {
    try {
        const body = await res.json() as { error?: { message?: unknown } };
        const message = body && body.error && typeof body.error.message === 'string' ? body.error.message.trim() : '';
        return message || APPEND_OFFLINE;
    } catch {
        return APPEND_OFFLINE;
    }
}

/** Sends one piece for one ship. On success the player's pages are read again. */
export async function appendStatus(id: string, append: StatusAppend['append']): Promise<AppendResult> {
    if (!campaign.universeId) return { ok: false, sentence: APPEND_OFFLINE };
    let res: Response;
    try {
        res = await apiFetch(transport.fetch, `/api/universes/${encodeURIComponent(campaign.universeId)}/campaign/changes`, {
            method: 'PATCH',
            body: JSON.stringify({ appends: [{ id, append }] }),
        });
    } catch {
        return { ok: false, sentence: APPEND_OFFLINE };
    }
    if (!res.ok) return { ok: false, sentence: await sentenceOf(res) };
    try {
        const body = await res.json() as { data?: { applied?: { table?: string; id?: string; rev?: number; seq?: number }[] } };
        for (const item of body.data?.applied ?? []) {
            if (typeof item.seq === 'number' && item.seq > campaign.seq) campaign.seq = item.seq;
            if (item.table === 'records' && typeof item.id === 'string' && typeof item.rev === 'number' && campaign.records[item.id]) campaign.records[item.id].rev = item.rev;
        }
    } catch {
        // The write landed; the read below shows it.
    }
    await loadPlayerPages(campaign.universeId);
    return { ok: true };
}
