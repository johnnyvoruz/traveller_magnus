import { reactive } from 'vue';
import {
    CampaignPage,
    Universe,
    type CampaignClock,
    type CampaignLink,
    type CampaignRecord,
    type CampaignSettings,
} from '@voyage/shared';
import { storageGet, storageSet } from '../platform/browser.ts';
import { apiFetch } from '../platform/http.ts';
import { commit, flushCampaign, pending } from './commit.ts';
import { rebuildCampaignIndex } from './index.ts';

type FetchLike = typeof fetch;
type Schedule = (fn: () => void, ms: number) => () => void;
type UniverseRow = ReturnType<typeof Universe.parse>;

/** Device key for the universe opened last. One browser, one choice. */
export const CAMPAIGN_UNIVERSE_KEY = 'voyage.campaign.universeId';

export const campaign = reactive({
    status: 'signed-out' as 'signed-out' | 'loading' | 'ready' | 'error',
    universeId: null as string | null,
    universes: [] as UniverseRow[],
    records: {} as Record<string, CampaignRecord>,
    links: {} as Record<string, CampaignLink>,
    settings: null as CampaignSettings | null,
    clock: null as CampaignClock | null,
    seq: 0,
});

function defaultSchedule(fn: () => void, ms: number): () => void {
    const id = setTimeout(fn, ms);
    return () => clearTimeout(id);
}

export const transport: { fetch: FetchLike; schedule: Schedule } = {
    fetch,
    schedule: defaultSchedule,
};

/** Truth version passed to the last open. New campaigns pin to the same chart. */
let pinnedTruth: string | null = null;

function clearRows(): void {
    for (const key of Object.keys(campaign.records)) delete campaign.records[key];
    for (const key of Object.keys(campaign.links)) delete campaign.links[key];
    campaign.settings = null;
    campaign.clock = null;
    campaign.seq = 0;
    campaign.universeId = null;
    rebuildCampaignIndex(campaign.records, campaign.links);
}

function signOutLocal(): void {
    clearRows();
    campaign.universes = [];
    campaign.status = 'signed-out';
}

export function resetCampaignState(): void {
    clearRows();
    campaign.universes = [];
    campaign.status = 'signed-out';
    pinnedTruth = null;
    transport.fetch = fetch;
    transport.schedule = defaultSchedule;
}

function replaceRows(
    records: Record<string, CampaignRecord>,
    links: Record<string, CampaignLink>,
    settings: CampaignSettings,
    clock: CampaignClock | null,
    seq: number,
): void {
    for (const key of Object.keys(campaign.records)) delete campaign.records[key];
    for (const key of Object.keys(campaign.links)) delete campaign.links[key];
    Object.assign(campaign.records, records);
    Object.assign(campaign.links, links);
    campaign.settings = settings;
    campaign.clock = clock;
    campaign.seq = seq;
    rebuildCampaignIndex(campaign.records, campaign.links);
}

function remember(id: string): void {
    storageSet(CAMPAIGN_UNIVERSE_KEY, id);
}

function remembered(): string | null {
    const id = storageGet(CAMPAIGN_UNIVERSE_KEY);
    return id ? id : null;
}

async function readList(): Promise<UniverseRow[] | null> {
    const listed = await apiFetch(transport.fetch, '/api/universes');
    if (listed.status === 401) {
        signOutLocal();
        return null;
    }
    if (!listed.ok) {
        campaign.status = 'error';
        return null;
    }
    const universes = Universe.array().parse((await listed.json()).data);
    campaign.universes = universes;
    return universes;
}

/** The account's campaigns. A 401 signs the store out and returns an empty list. */
export async function listCampaigns(): Promise<UniverseRow[]> {
    const rows = await readList();
    return rows ?? [];
}

async function postCampaign(name: string): Promise<UniverseRow | null> {
    const created = await apiFetch(transport.fetch, '/api/universes', {
        method: 'POST',
        body: JSON.stringify({
            name,
            truthVersion: pinnedTruth,
            editionDefault: 'MgT2E',
        }),
    });
    if (created.status === 401) {
        signOutLocal();
        return null;
    }
    if (!created.ok) {
        campaign.status = 'error';
        return null;
    }
    const universe = Universe.parse((await created.json()).data);
    const index = campaign.universes.findIndex((item) => item.id === universe.id);
    if (index >= 0) campaign.universes[index] = universe;
    else campaign.universes.push(universe);
    return universe;
}

async function loadPages(universe: UniverseRow): Promise<void> {
    clearRows();
    campaign.universeId = universe.id;
    campaign.status = 'loading';
    const records: Record<string, CampaignRecord> = {};
    const links: Record<string, CampaignLink> = {};
    let settings: CampaignSettings | null = null;
    let clock: CampaignClock | null = null;
    let seq = 0;
    let after = 0;
    for (;;) {
        const pageRes = await apiFetch(
            transport.fetch,
            `/api/universes/${encodeURIComponent(universe.id)}/campaign?after=${after}&limit=1000`,
        );
        if (pageRes.status === 401) {
            signOutLocal();
            return;
        }
        if (!pageRes.ok) {
            campaign.status = 'error';
            return;
        }
        const page = CampaignPage.parse((await pageRes.json()).data);
        for (const record of page.records) records[record.id] = record;
        for (const link of page.links) links[link.id] = link;
        settings = page.settings;
        clock = page.clock;
        seq = page.seq;
        if (page.done) break;
        if (page.seq <= after) {
            campaign.status = 'error';
            return;
        }
        after = page.seq;
    }
    if (!settings) {
        campaign.status = 'error';
        return;
    }
    replaceRows(records, links, settings, clock, seq);
    campaign.universeId = universe.id;
    campaign.status = 'ready';
    remember(universe.id);
}

/**
 * Opens one campaign and loads its pages.
 * A `universeId` opens that one. Otherwise the universe this device opened last.
 * When the account has none, creates "My campaign" on `truthVersion`.
 * When this device has no memory and the account has several, opens the first.
 */
export async function openCampaign(options: {
    fetch: FetchLike;
    truthVersion: string | null;
    schedule?: Schedule;
    universeId?: string | null;
}): Promise<void> {
    transport.fetch = options.fetch;
    if (options.schedule) transport.schedule = options.schedule;
    pinnedTruth = options.truthVersion;
    campaign.status = 'loading';
    const universes = await readList();
    if (!universes) return;
    let universe = options.universeId
        ? universes.find((item) => item.id === options.universeId)
        : undefined;
    if (options.universeId && !universe) {
        campaign.status = 'error';
        return;
    }
    if (!universe) {
        const last = remembered();
        universe = last ? universes.find((item) => item.id === last) : undefined;
    }
    if (!universe) universe = universes[0];
    if (!universe) {
        const created = await postCampaign('My campaign');
        if (!created) return;
        universe = created;
    }
    await loadPages(universe);
}

/** Queues the campaign date. `days` is the orbit clock's day count. The server's rev wins. */
export function setCampaignDate(days: number): void {
    const baseRev = campaign.clock ? campaign.clock.rev : 0;
    commit({ clock: { days, baseRev } });
}

/** Saves the open campaign, then loads `id`. A failed save leaves the open one in place. */
export async function switchCampaign(id: string): Promise<void> {
    await flushCampaign();
    if (pending.value) return;
    let universe = campaign.universes.find((item) => item.id === id);
    if (!universe) {
        const fresh = await readList();
        if (!fresh) return;
        universe = fresh.find((item) => item.id === id);
    }
    if (!universe) {
        campaign.status = 'error';
        return;
    }
    await loadPages(universe);
}

/** Creates a campaign on the pinned truth and opens it. */
export async function createCampaign(name: string): Promise<UniverseRow | null> {
    const created = await postCampaign(name);
    if (!created) return null;
    await switchCampaign(created.id);
    return created;
}

export async function renameCampaign(id: string, name: string): Promise<void> {
    const res = await apiFetch(transport.fetch, `/api/universes/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ name }),
    });
    if (res.status === 401) {
        signOutLocal();
        return;
    }
    if (!res.ok) {
        campaign.status = 'error';
        return;
    }
    const updated = Universe.parse((await res.json()).data);
    const index = campaign.universes.findIndex((item) => item.id === id);
    if (index >= 0) campaign.universes[index] = updated;
    else campaign.universes.push(updated);
}

/** Soft-deletes a campaign. Deleting the open one flushes it, then opens another if one remains. */
export async function deleteCampaign(id: string): Promise<void> {
    if (campaign.universeId === id) {
        await flushCampaign();
        if (pending.value) return;
    }
    const res = await apiFetch(transport.fetch, `/api/universes/${encodeURIComponent(id)}`, {
        method: 'DELETE',
    });
    if (res.status === 401) {
        signOutLocal();
        return;
    }
    if (!res.ok) {
        campaign.status = 'error';
        return;
    }
    campaign.universes = campaign.universes.filter((item) => item.id !== id);
    if (remembered() === id) storageSet(CAMPAIGN_UNIVERSE_KEY, '');
    if (campaign.universeId !== id) return;
    const next = campaign.universes[0];
    if (next) await loadPages(next);
    else {
        clearRows();
        campaign.status = 'ready';
    }
}
