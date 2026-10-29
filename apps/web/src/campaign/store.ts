import { reactive } from 'vue';
import type {
    Universe,
    CampaignClock,
    CampaignEntry as CampaignEntryRow,
    CampaignLink,
    CampaignRecord,
    CampaignSettings,
    PlayersClock,
    PlayersLink,
    PlayersPage as PlayersPageData,
    PlayersRecord,
    PlayersSettings,
    PlayingList,
} from '@voyage/shared';
import { loadSchemas, schemas } from '../platform/schemas.ts';
import { newId, storageGet, storageSet } from '../platform/browser.ts';
import { apiFetch } from '../platform/http.ts';
import { commit, flushCampaign, pending } from './commit.ts';
import { resetViewDay } from './view_day.ts';
import { JOURNAL_PUBLIC_HEADERS, parseRead } from './read.ts';
import { rebuildCampaignIndex } from './index.ts';
import { rebuildJournalIndex } from './journal.ts';

type FetchLike = typeof fetch;
type Schedule = (fn: () => void, ms: number) => () => void;
type UniverseRow = Universe;

/** Device key for the universe opened last. One browser, one choice. */
export const CAMPAIGN_UNIVERSE_KEY = 'voyage.campaign.universeId';

export const campaign = reactive({
    status: 'signed-out' as 'signed-out' | 'loading' | 'ready' | 'error' | 'gone',
    role: null as 'owner' | 'player' | null,
    universeId: null as string | null,
    universes: [] as UniverseRow[],
    playing: [] as PlayingList['items'],
    records: {} as Record<string, CampaignRecord>,
    links: {} as Record<string, CampaignLink>,
    journal: {} as Record<string, CampaignEntryRow>,
    /** Profile handle for a journal row, keyed by entry id. Not part of the entry, so a save cannot send it. */
    authorNames: {} as Record<string, string>,
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

/** Id sent with a create that has not yet answered 201 or 200. */
let pendingUniverseId: string | null = null;

function universeIdForCreate(): string {
    if (!pendingUniverseId) pendingUniverseId = newId('uni' as 'cr');
    return pendingUniverseId;
}

function clearRows(): void {
    for (const key of Object.keys(campaign.records)) delete campaign.records[key];
    for (const key of Object.keys(campaign.links)) delete campaign.links[key];
    for (const key of Object.keys(campaign.journal)) delete campaign.journal[key];
    for (const key of Object.keys(campaign.authorNames)) delete campaign.authorNames[key];
    campaign.settings = null;
    campaign.clock = null;
    campaign.seq = 0;
    campaign.universeId = null;
    rebuildCampaignIndex(campaign.records, campaign.links, null);
    rebuildJournalIndex(campaign.journal, campaign.records, null);
}

function signOutLocal(): void {
    clearRows();
    campaign.universes = [];
    campaign.playing = [];
    campaign.role = null;
    campaign.status = 'signed-out';
}

export function resetCampaignState(): void {
    clearRows();
    campaign.universes = [];
    campaign.playing = [];
    campaign.role = null;
    campaign.status = 'signed-out';
    pinnedTruth = null;
    pendingUniverseId = null;
    transport.fetch = fetch;
    transport.schedule = defaultSchedule;
}

/** The chart a later new campaign pins to. A "Playing in" campaign pins the map to its own. */
export function pinTruthVersion(version: string | null): void {
    pinnedTruth = version;
}

/** A 401 on a membership call. The campaign list and the playing list both go. */
export function noteUnauthorized(): void {
    signOutLocal();
}

/** The signed-in account is no longer a member of the open campaign. */
export function markMembershipGone(): void {
    markGone();
}

function markGone(): void {
    clearRows();
    campaign.role = 'player';
    campaign.status = 'gone';
}

async function memberRefused(res: Response): Promise<boolean> {
    if (res.status === 404) return true;
    if (res.status !== 403) return false;
    try {
        const body = await res.json() as { error?: { code?: string } };
        return body.error?.code === 'not_a_member';
    } catch {
        return false;
    }
}

function holdRecord(row: PlayersRecord): CampaignRecord {
    return { ...row, provenance: null, rev: 0 };
}

function holdLink(row: PlayersLink): CampaignLink {
    return { ...row, provenance: null, rev: 0 };
}

/**
 * The handles the owner read sends beside its journal rows (`authorName`, on every row with an author;
 * the players page carries the same and holdEntry lifts it there). The owner page's schema drops the
 * field, so it is read off the raw rows first (DF25): the referee then sees who wrote a players note.
 */
export function liftAuthorNames(body: unknown, into: Record<string, string>): void {
    const rows = body && typeof body === 'object' ? (body as { journal?: unknown }).journal : null;
    if (!Array.isArray(rows)) return;
    for (const row of rows) {
        if (!row || typeof row !== 'object') continue;
        const { id, authorName } = row as { id?: unknown; authorName?: unknown };
        if (typeof id === 'string' && typeof authorName === 'string') into[id] = authorName;
    }
}

function holdEntry(row: unknown): CampaignEntryRow {
    const raw = { ...(row as Record<string, unknown>) };
    const authorName = typeof raw.authorName === 'string' ? raw.authorName : undefined;
    delete raw.authorName;
    if (typeof raw.rev !== 'number') raw.rev = 0;
    const held = schemas().CampaignEntry.parse(raw);
    if (authorName === undefined) delete campaign.authorNames[held.id];
    else campaign.authorNames[held.id] = authorName;
    return held;
}

function holdSettings(row: PlayersSettings): CampaignSettings {
    return { ...row, rev: 0 };
}

function holdClock(row: PlayersClock): CampaignClock {
    return { ...row, rev: 0 };
}

function retain(rows: Record<string, { id: string }>, ids: readonly string[]): void {
    const allowed = new Set(ids);
    for (const id of Object.keys(rows)) if (!allowed.has(id)) delete rows[id];
}

/**
 * Merges one players page into the open store.
 * A page that carries `visible` drops every held record, link and entry whose id is not listed.
 * Rows other than the caller's own notes are stored at rev 0.
 */
export function applyPlayersPage(page: PlayersPageData): void {
    for (const record of page.records) campaign.records[record.id] = holdRecord(record);
    for (const link of page.links) campaign.links[link.id] = holdLink(link);
    for (const entry of page.journal) {
        const held = holdEntry(entry);
        campaign.journal[held.id] = held;
    }
    if (page.settings) campaign.settings = holdSettings(page.settings);
    campaign.clock = page.clock ? holdClock(page.clock) : null;
    campaign.seq = page.seq;
    if (page.visible) {
        retain(campaign.records, page.visible.records);
        retain(campaign.links, page.visible.links);
        retain(campaign.journal, page.visible.journal);
        const named = new Set(page.visible.journal);
        for (const id of Object.keys(campaign.authorNames)) {
            if (!named.has(id)) delete campaign.authorNames[id];
        }
    }
    const days = campaign.clock ? campaign.clock.days : null;
    rebuildCampaignIndex(campaign.records, campaign.links, days);
    rebuildJournalIndex(campaign.journal, campaign.records, days);
}

function replaceRows(
    records: Record<string, CampaignRecord>,
    links: Record<string, CampaignLink>,
    journal: Record<string, CampaignEntryRow>,
    settings: CampaignSettings,
    clock: CampaignClock | null,
    seq: number,
): void {
    for (const key of Object.keys(campaign.records)) delete campaign.records[key];
    for (const key of Object.keys(campaign.links)) delete campaign.links[key];
    for (const key of Object.keys(campaign.journal)) delete campaign.journal[key];
    for (const key of Object.keys(campaign.authorNames)) delete campaign.authorNames[key];
    Object.assign(campaign.records, records);
    Object.assign(campaign.links, links);
    Object.assign(campaign.journal, journal);
    campaign.settings = settings;
    campaign.clock = clock;
    campaign.seq = seq;
    const days = clock ? clock.days : null;
    rebuildCampaignIndex(campaign.records, campaign.links, days);
    rebuildJournalIndex(campaign.journal, campaign.records, days);
}

function remember(id: string): void {
    storageSet(CAMPAIGN_UNIVERSE_KEY, id);
}

function remembered(): string | null {
    const id = storageGet(CAMPAIGN_UNIVERSE_KEY);
    return id ? id : null;
}

async function readList(): Promise<UniverseRow[] | null> {
    const shared = loadSchemas();
    const listed = await apiFetch(transport.fetch, '/api/universes');
    if (listed.status === 401) {
        signOutLocal();
        return null;
    }
    if (!listed.ok) return null;
    const { Universe: UniverseSchema } = await shared;
    const universes = parseRead(UniverseSchema.array(), (await listed.json()).data);
    campaign.universes = universes;
    return universes;
}

/** The account's campaigns. A 401 signs the store out. A failed list returns null. */
export async function listCampaigns(): Promise<UniverseRow[] | null> {
    return readList();
}

async function postCampaign(name: string): Promise<UniverseRow | null> {
    const shared = loadSchemas();
    const id = universeIdForCreate();
    let created: Response;
    try {
        created = await apiFetch(transport.fetch, '/api/universes', {
            method: 'POST',
            body: JSON.stringify({
                id,
                name,
                truthVersion: pinnedTruth,
                editionDefault: 'MgT2E',
            }),
        });
    } catch {
        return null;
    }
    if (created.status === 401) {
        signOutLocal();
        return null;
    }
    if (created.status !== 201 && created.status !== 200) return null;
    pendingUniverseId = null;
    const { Universe: UniverseSchema } = await shared;
    const universe = parseRead(UniverseSchema, (await created.json()).data);
    const index = campaign.universes.findIndex((item) => item.id === universe.id);
    if (index >= 0) campaign.universes[index] = universe;
    else campaign.universes.push(universe);
    return universe;
}

async function loadPages(universe: { id: string }, role: 'owner' | 'player' = 'owner'): Promise<void> {
    const shared = loadSchemas();
    clearRows();
    campaign.role = role;
    campaign.universeId = universe.id;
    campaign.status = 'loading';
    const records: Record<string, CampaignRecord> = {};
    const links: Record<string, CampaignLink> = {};
    const journal: Record<string, CampaignEntryRow> = {};
    const names: Record<string, string> = {};
    let settings: CampaignSettings | null = null;
    let clock: CampaignClock | null = null;
    let seq = 0;
    let after = 0;
    for (;;) {
        const pageRes = await apiFetch(
            transport.fetch,
            `/api/universes/${encodeURIComponent(universe.id)}/campaign?after=${after}&limit=1000`,
            { headers: JOURNAL_PUBLIC_HEADERS },
        );
        if (pageRes.status === 401) {
            signOutLocal();
            return;
        }
        if (role === 'player' && await memberRefused(pageRes)) {
            markGone();
            return;
        }
        if (!pageRes.ok) {
            campaign.status = 'error';
            return;
        }
        const body = (await pageRes.json()).data;
        if (role === 'player') {
            const parsed = parseRead((await shared).PlayersPage, body);
            applyPlayersPage(parsed);
            if (parsed.done) break;
            if (parsed.seq <= after) {
                campaign.status = 'error';
                return;
            }
            after = parsed.seq;
            continue;
        }
        liftAuthorNames(body, names);
        const page = parseRead((await shared).CampaignPage, body);
        for (const record of page.records) records[record.id] = record;
        for (const link of page.links) links[link.id] = link;
        for (const entry of page.journal ?? []) journal[entry.id] = entry;
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
    if (role === 'player') {
        if (!campaign.settings) {
            campaign.status = 'error';
            return;
        }
        campaign.universeId = universe.id;
        campaign.role = 'player';
        campaign.status = 'ready';
        remember(universe.id);
        return;
    }
    if (!settings) {
        campaign.status = 'error';
        return;
    }
    replaceRows(records, links, journal, settings, clock, seq);
    Object.assign(campaign.authorNames, names);
    campaign.universeId = universe.id;
    campaign.status = 'ready';
    remember(universe.id);
}

/** Opens a campaign the account is playing in. The read is the players page. */
export async function loadPlayerPages(id: string): Promise<void> {
    await loadPages({ id }, 'player');
}

/**
 * Opens one campaign and loads its pages.
 * A `universeId` opens that one. Otherwise the universe this device opened last.
 * When the account has none, creates "My map" on `truthVersion`.
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
    if (!universes) {
        if (campaign.status === 'loading') campaign.status = 'error';
        return;
    }
    const asked = options.universeId || null;
    const last = asked ? null : remembered();
    const wanted = asked || last;
    let universe = wanted ? universes.find((item) => item.id === wanted) : undefined;
    if (!universe && wanted) {
        const { findPlaying } = await import('./membership.ts');
        const played = await findPlaying(wanted);
        if ((campaign.status as string) === 'signed-out') return;
        if (played) {
            pinTruthVersion(played.truthVersion);
            await loadPlayerPages(played.id);
            return;
        }
        if (asked) {
            campaign.status = 'error';
            return;
        }
    }
    if (!universe) universe = universes[0];
    if (!universe) {
        const created = await postCampaign('My map');
        if (!created) {
            if (campaign.status === 'loading') campaign.status = 'error';
            return;
        }
        universe = created;
    }
    await loadPages(universe);
}

/** Queues the campaign date. `days` is the orbit clock's day count. The server's rev wins. A write that lands clears the session's view day. */
export function setCampaignDate(days: number): void {
    const baseRev = campaign.clock ? campaign.clock.rev : 0;
    commit({ clock: { days, baseRev } });
    if (campaign.clock && Math.floor(campaign.clock.days) === Math.floor(days)) resetViewDay();
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
    const shared = loadSchemas();
    const res = await apiFetch(transport.fetch, `/api/universes/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ name }),
    });
    if (res.status === 401) {
        signOutLocal();
        return;
    }
    if (!res.ok) throw new Error('The campaign could not be renamed.');
    const updated = parseRead((await shared).Universe, (await res.json()).data);
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
    if (!res.ok) throw new Error('The campaign could not be deleted.');
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
