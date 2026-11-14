/**
 * Systems suggested as a Directions box is typed (DN2): the top search field's own search (`search/omni.ts`,
 * the `/api/truth/search` route on the released chart), systems only, best first. Each suggestion carries the
 * system it names, so a pick fills the box with that system even where two share a name.
 */
import type { TruthManifest } from '@voyage/shared';
import { chartNow, ensureChart } from '../search/chart_hold.ts';
import { rankResults, systemResults, type SearchItem } from '../search/omni.ts';
import type { RouteEnd } from './route_plan.ts';

export type EndSuggestion = { label: string; detail: string; end: RouteEnd };

export const SUGGESTION_CAP = 6;
/** Fewer letters than this ask nothing. */
export const SUGGEST_FROM = 2;

type Deps = {
    fetch: (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; json(): Promise<unknown> }>;
    chart: () => Promise<{ version: string; manifest: TruthManifest | null }>;
};

async function heldChart(): Promise<{ version: string; manifest: TruthManifest | null }> {
    await ensureChart();
    return chartNow();
}

const DEFAULTS: Deps = { fetch: (url, init) => fetch(url, init), chart: heldChart };

/** The systems the search finds for these words; empty for too few letters, or when the search fails. */
export async function suggestEnds(text: string, signal?: AbortSignal, deps: Deps = DEFAULTS): Promise<EndSuggestion[]> {
    const words = text.trim();
    if (words.length < SUGGEST_FROM) return [];
    try {
        const { version, manifest } = await deps.chart();
        if (!version || !manifest) return [];
        const url = '/api/truth/search?q=' + encodeURIComponent(words) + '&version=' + encodeURIComponent(version);
        const response = await deps.fetch(url, { signal });
        if (!response.ok) return [];
        const body = await response.json() as { ok?: boolean; data?: { items?: SearchItem[] } };
        if (!body || !body.ok || !body.data || !Array.isArray(body.data.items)) return [];
        const ranked = rankResults(words, systemResults(body.data.items, manifest, 'all'));
        const out: EndSuggestion[] = [];
        for (const result of ranked) {
            if (result.kind !== 'system') continue;
            out.push({ label: result.name || result.detail.split(' · ')[0], detail: result.detail, end: { sector: result.sector, hex: result.hex } });
            if (out.length === SUGGESTION_CAP) break;
        }
        return out;
    } catch {
        return [];
    }
}
