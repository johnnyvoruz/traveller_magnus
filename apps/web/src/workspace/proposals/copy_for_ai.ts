/**
 * Copy for your AI (spec §3.1, SI3): the open campaign as A's `aiSnapshot` takes it, the sheets a
 * Characters copy reads live (`GET /api/characters/:id`, the route the sheet screen uses; no new
 * route), and the size of each choice. The text is built in the browser; nothing is sent.
 */
import { CharacterOpen, type CampaignSettings } from '@voyage/shared';
import { AI_PARTS, aiPartOf, aiSnapshot, aiSnapshotSize, type AiPart, type AiSnapshotCampaign, type LiveSheetFields } from '../../campaign/ai_snapshot.ts';
import { parseRead } from '../../campaign/read.ts';
import { campaign, transport } from '../../campaign/store.ts';
import { apiFetch } from '../../platform/http.ts';

export type CopyChoice = 'all' | AiPart;

export const CHOICE_TITLES: Record<CopyChoice, string> = {
    all: 'All',
    ships: 'Ships',
    characters: 'Characters',
    records: 'People, places, and things',
    journal: 'Journal',
};

export const CHOICE_NOTES: Record<CopyChoice, string> = {
    all: 'Every part in this list.',
    ships: 'Vessels with their cargo, passengers, ledger, owners, and course.',
    characters: 'The party, and every person who has a character sheet, including the sheet.',
    records: 'Every other person, place, business, organization, job, event, item, and note.',
    journal: 'The last 50 journal entries.',
};

/** The open campaign in the shape `aiSnapshot` reads. Null until the campaign and its settings are loaded. */
export function openCampaignInput(): AiSnapshotCampaign | null {
    const settings: CampaignSettings | null = campaign.settings;
    if (campaign.status !== 'ready' || !settings || !campaign.universeId) return null;
    const row = campaign.universes.find((item) => item.id === campaign.universeId);
    return {
        name: row ? row.name : 'Campaign',
        records: Object.values(campaign.records),
        links: Object.values(campaign.links),
        journal: Object.values(campaign.journal),
        settings,
        clock: campaign.clock,
    };
}

/** The character ids a Characters copy reads live: sheets kept on the Characters screen. */
export function liveSheetIds(input: AiSnapshotCampaign): string[] {
    const ids: string[] = [];
    for (const record of input.records) {
        if (record.deleted || aiPartOf(record, input.settings) !== 'characters') continue;
        const sheet = record.sheet as { characterId?: unknown } | null;
        const id = sheet && typeof sheet.characterId === 'string' ? sheet.characterId : null;
        if (id && !ids.includes(id)) ids.push(id);
    }
    return ids;
}

/** Each sheet's boxes as they read now, or null when it could not be opened (the text says "not read"). */
export async function readLiveSheets(ids: readonly string[]): Promise<Record<string, LiveSheetFields | null>> {
    const out: Record<string, LiveSheetFields | null> = {};
    await Promise.all(ids.map(async (id) => {
        try {
            const res = await apiFetch(transport.fetch, `/api/characters/${encodeURIComponent(id)}`);
            if (!res.ok) {
                out[id] = null;
                return;
            }
            out[id] = parseRead(CharacterOpen, ((await res.json()) as { data?: unknown }).data).doc.fields;
        } catch {
            out[id] = null;
        }
    }));
    return out;
}

/** The text for a choice. */
export function copyText(input: AiSnapshotCampaign, parts: 'all' | readonly AiPart[], origin: string, liveSheets: Readonly<Record<string, LiveSheetFields | null>>): string {
    return aiSnapshot(input, { universeId: campaign.universeId ?? '', origin, parts, liveSheets });
}

/** "About 12,400 tokens": the size each choice shows, so it fits the AI's budget. */
export function sizeWords(tokens: number): string {
    if (tokens < 1000) return `About ${tokens} tokens`;
    return `About ${(Math.round(tokens / 100) * 100).toLocaleString('en-US')} tokens`;
}

/** The size of All and of each part alone (the date, the party and the instructions come with each). */
export function choiceSizes(input: AiSnapshotCampaign, origin: string, liveSheets: Readonly<Record<string, LiveSheetFields | null>>): Record<CopyChoice, number> {
    const out = { all: aiSnapshotSize(copyText(input, 'all', origin, liveSheets)).tokens } as Record<CopyChoice, number>;
    for (const part of AI_PARTS) out[part] = aiSnapshotSize(copyText(input, [part], origin, liveSheets)).tokens;
    return out;
}

export { AI_PARTS, aiSnapshotFileName, aiSnapshotSize } from '../../campaign/ai_snapshot.ts';
