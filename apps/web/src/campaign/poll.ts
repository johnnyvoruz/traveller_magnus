/**
 * A quiet refresh of the open campaign while the campaign panel is open and the tab is visible
 * (players_build_plan.md P9). One read, thirty seconds apart, from the seq already held.
 * Nothing is cleared first, so a list does not jump. A failure raises no toast.
 */
import { CampaignPage, PlayersPage } from '@voyage/shared';
import { onPageVisibility, pageVisible } from '../platform/browser.ts';
import { apiFetch } from '../platform/http.ts';
import { rebuildCampaignIndex } from './index.ts';
import { rebuildJournalIndex } from './journal.ts';
import { pending } from './commit.ts';
import { JOURNAL_PUBLIC_HEADERS, parseRead } from './read.ts';
import {
    applyPlayersPage,
    campaign,
    markMembershipGone,
    noteUnauthorized,
    transport,
} from './store.ts';

/** The gap between reads while the panel stays open and the tab stays visible. */
export const POLL_MS = 30_000;

let panelOpen = false;
let halted = false;
let inFlight = false;
let cancelTimer: (() => void) | null = null;
let cancelVis: (() => void) | null = null;

function disarmTimer(): void {
    if (!cancelTimer) return;
    cancelTimer();
    cancelTimer = null;
}

function live(): boolean {
    return panelOpen
        && pageVisible()
        && !halted
        && !inFlight
        && campaign.status === 'ready'
        && campaign.role !== null
        && campaign.universeId !== null;
}

function arm(): void {
    disarmTimer();
    if (!live()) return;
    cancelTimer = transport.schedule(() => tick(), POLL_MS);
}

function reindex(): void {
    const days = campaign.clock ? campaign.clock.days : null;
    rebuildCampaignIndex(campaign.records, campaign.links, days);
    rebuildJournalIndex(campaign.journal, campaign.records, days);
}

function applyOwnerPage(page: ReturnType<typeof CampaignPage.parse>): void {
    for (const record of page.records) campaign.records[record.id] = record;
    for (const link of page.links) campaign.links[link.id] = link;
    for (const entry of page.journal ?? []) campaign.journal[entry.id] = entry;
    campaign.settings = page.settings;
    campaign.clock = page.clock;
    campaign.seq = page.seq;
    reindex();
}

async function refused(res: Response): Promise<boolean> {
    if (res.status === 404) return true;
    if (res.status !== 403) return false;
    try {
        const body = await res.json() as { error?: { code?: string } };
        return body.error?.code === 'not_a_member' || campaign.role === 'owner';
    } catch {
        return campaign.role === 'owner';
    }
}

/**
 * Reads pages after the seq the store holds. True when the poll must stop.
 * A player 403 or 404 clears the campaign. Any other failure leaves the rows and tries later.
 */
async function pull(): Promise<boolean> {
    const id = campaign.universeId;
    if (!id || campaign.role === null) return true;
    let after = campaign.seq;
    for (;;) {
        const res = await apiFetch(
            transport.fetch,
            `/api/universes/${encodeURIComponent(id)}/campaign?after=${after}&limit=1000`,
            { headers: JOURNAL_PUBLIC_HEADERS },
        );
        if (res.status === 401) {
            noteUnauthorized();
            return true;
        }
        if (await refused(res)) {
            if (campaign.role === 'player') markMembershipGone();
            return true;
        }
        if (!res.ok) return false;
        const data = (await res.json()).data;
        if (campaign.role === 'player') {
            const page = parseRead(PlayersPage, data);
            applyPlayersPage(page);
            if (page.done) return false;
            if (page.seq <= after) return false;
            after = page.seq;
            continue;
        }
        const page = parseRead(CampaignPage, data);
        applyOwnerPage(page);
        if (page.done) return false;
        if (page.seq <= after) return false;
        after = page.seq;
    }
}

async function tick(): Promise<void> {
    cancelTimer = null;
    if (!live()) return;
    if (pending.value) {
        arm();
        return;
    }
    inFlight = true;
    try {
        halted = await pull();
    } catch {
        halted = false;
    } finally {
        inFlight = false;
        arm();
    }
}

/** The campaign panel opened or closed. Closed stops the timer. Open starts the wait. */
export function watchCampaignPanel(open: boolean): void {
    panelOpen = open;
    if (!open) {
        halted = false;
        disarmTimer();
        return;
    }
    halted = false;
    if (!cancelVis) cancelVis = onPageVisibility(() => { arm(); });
    arm();
}

/** Stops the timer and the visibility watch. Tests and a signed-out shell use this. */
export function stopCampaignPoll(): void {
    panelOpen = false;
    halted = false;
    inFlight = false;
    disarmTimer();
    if (cancelVis) {
        cancelVis();
        cancelVis = null;
    }
}
