/**
 * A quiet refresh of the open campaign while the campaign panel is open and the tab is visible
 * (players_build_plan.md P9). One read, thirty seconds apart, from the seq already held.
 * Nothing is cleared first, so a list does not jump. A failure raises no toast.
 *
 * BV1b (findings/live_records_plan.md): while the panel is open, a socket to the universe's
 * `GET .../campaign/live` (B's BV1a) says `{ t: 'changed', seq }` after each write, and the page pulls
 * the same read at once, unless a save is in flight (its own answer updates the store). While the socket
 * is up the thirty-second timer is off. Two upgrades that fail, or a socket the browser blocks, fall back
 * to the timer. A hidden tab keeps the socket and pulls nothing; shown again, it pulls once when a change
 * came meanwhile or the socket is down. The screens read `campaign.records`; a form keeps its own boxes.
 */
import { CampaignPage, PlayersPage } from '@voyage/shared';
import { onPageVisibility, pageVisible } from '../platform/browser.ts';
import { apiFetch } from '../platform/http.ts';
import { rebuildCampaignIndex } from './index.ts';
import { rebuildJournalIndex } from './journal.ts';
import { pending } from './commit.ts';
import { notePendingCount } from './proposals.ts';
import { JOURNAL_PUBLIC_HEADERS, parseRead, pendingProposalCount } from './read.ts';
import { applyPlayersPage, campaign, liftAuthorNames, markMembershipGone, noteUnauthorized, transport } from './store.ts';
import { transport as liveTransport, type LiveSocket, type SocketHandlers } from '../characters/transport.ts';

/** The gap between reads while the panel stays open and the tab stays visible. */
export const POLL_MS = 30_000;
/** Upgrades that fail before the timer takes over, as the character sheet does (`characters/live.ts`). */
export const UPGRADES_BEFORE_POLL = 2;
/** The wait before another upgrade after a failure or a dropped socket. */
export const RETRY_MS = 3_000;

/** The socket's door. Tests replace `open`; the browser's WebSocket by default (`characters/transport.ts`). */
export const campaignSocket: { open: (url: string, handlers: SocketHandlers) => LiveSocket } = {
    open: (url, handlers) => liveTransport.openSocket(url, handlers),
};

/** `wss://host/api/universes/:id/campaign/live`; the bare path where the process has no location. */
export function campaignLiveUrl(universeId: string): string {
    const path = '/api/universes/' + encodeURIComponent(universeId) + '/campaign/live';
    if (typeof location === 'undefined' || !location.host) return path;
    return (location.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + location.host + path;
}

let panelOpen = false;
let halted = false;
let inFlight = false;
let cancelTimer: (() => void) | null = null;
let cancelVis: (() => void) | null = null;

let mode: 'socket' | 'poll' = 'socket';
let failures = 0;
let socket: LiveSocket | null = null;
/** The universe the socket listens to. */
let socketFor: string | null = null;
/** True once the socket opened; a close then is a drop, not a failed upgrade. */
let socketLive = false;
/** Bumped whenever a socket is retired, so its late events are ignored. */
let token = 0;
let cancelRetry: (() => void) | null = null;
/** A change was said while the page could not pull (hidden, or a pull in flight). */
let missed = false;
/** A change said while a save was in flight: looked at again after this wait. */
export const SAVE_WAIT_MS = 1_000;
let cancelWait: (() => void) | null = null;

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

function disarmRetry(): void {
    if (!cancelRetry) return;
    cancelRetry();
    cancelRetry = null;
}

/** The panel wants a socket: open, the campaign read, not stopped, not fallen back to the timer. */
function wantSocket(): boolean {
    return panelOpen && !halted && mode === 'socket' && campaign.status === 'ready' && campaign.role !== null && campaign.universeId !== null;
}

function closeSocket(): void {
    token += 1;
    disarmRetry();
    if (cancelWait) {
        cancelWait();
        cancelWait = null;
    }
    const old = socket;
    socket = null;
    socketFor = null;
    socketLive = false;
    if (old) {
        try {
            old.close();
        } catch {
            // Already closed.
        }
    }
}

/** An upgrade that failed: try again, or after the second, the timer. */
function socketFailed(): void {
    closeSocket();
    failures += 1;
    if (failures >= UPGRADES_BEFORE_POLL) mode = 'poll';
    else cancelRetry = transport.schedule(() => { cancelRetry = null; arm(); }, RETRY_MS);
    arm();
}

/** A socket that was up went down: catch up once, and open again after the wait. */
function socketDropped(): void {
    closeSocket();
    missed = true;
    cancelRetry = transport.schedule(() => { cancelRetry = null; arm(); }, RETRY_MS);
    arm();
    catchUp();
}

function onSocketMessage(data: string): void {
    let seq: unknown = null;
    try {
        const message = JSON.parse(data) as { t?: unknown; seq?: unknown };
        if (message.t !== 'changed') return;
        seq = message.seq;
    } catch {
        return;
    }
    if (typeof seq === 'number' && seq <= campaign.seq) return;
    missed = true;
    catchUp();
}

function openSocket(): void {
    const id = campaign.universeId;
    if (!wantSocket() || !id) return;
    if (socket && socketFor === id) return;
    if (socket) closeSocket();
    if (cancelRetry) return;
    token += 1;
    const mine = token;
    let opened: LiveSocket;
    try {
        opened = campaignSocket.open(campaignLiveUrl(id), {
            onOpen: () => {
                if (mine !== token) return;
                socketLive = true;
                failures = 0;
                disarmTimer();
                catchUp();
            },
            onMessage: (data) => { if (mine === token) onSocketMessage(data); },
            onError: () => { if (mine === token && !socketLive) socketFailed(); },
            onClose: () => {
                if (mine !== token) return;
                if (socketLive) socketDropped();
                else socketFailed();
            },
        });
    } catch {
        // A socket the browser blocks: the timer at once.
        failures = UPGRADES_BEFORE_POLL;
        mode = 'poll';
        return;
    }
    if (mine !== token) return;
    socket = opened;
    socketFor = id;
}

function arm(): void {
    disarmTimer();
    if (!live()) {
        if (!wantSocket()) closeSocket();
        return;
    }
    openSocket();
    if (socketLive) return;
    cancelTimer = transport.schedule(() => tick(), POLL_MS);
}

/** Pull now for a change the socket said, or the one missed while hidden; a save in flight is left to its answer. */
function catchUp(): void {
    if (!missed || !live()) return;
    if (pending.value) {
        // The save's own answer updates the store; what landed beside it is pulled once it is back.
        if (!cancelWait) cancelWait = transport.schedule(() => { cancelWait = null; catchUp(); }, SAVE_WAIT_MS);
        return;
    }
    missed = false;
    void tick();
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
        const names: Record<string, string> = {};
        liftAuthorNames(data, names);
        const page = parseRead(CampaignPage, data);
        applyOwnerPage(page);
        Object.assign(campaign.authorNames, names);
        const pendingCount = pendingProposalCount(data);
        if (pendingCount !== null) notePendingCount(pendingCount);
        if (page.done) return false;
        if (page.seq <= after) return false;
        after = page.seq;
    }
}

async function tick(): Promise<void> {
    disarmTimer();
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
        catchUp();
    }
}

/** Shown again: one pull when a change came meanwhile or the socket is down; then the socket or the timer. */
function onShown(): void {
    if (pageVisible() && (mode === 'poll' ? false : !socketLive)) missed = true;
    arm();
    catchUp();
}

/** The campaign panel opened or closed. Closed stops the timer. Open starts the wait. */
export function watchCampaignPanel(open: boolean): void {
    panelOpen = open;
    if (!open) {
        halted = false;
        disarmTimer();
        closeSocket();
        missed = false;
        return;
    }
    halted = false;
    mode = 'socket';
    failures = 0;
    if (!cancelVis) cancelVis = onPageVisibility(() => { onShown(); });
    arm();
}

/** Stops the timer and the visibility watch. Tests and a signed-out shell use this. */
export function stopCampaignPoll(): void {
    panelOpen = false;
    halted = false;
    inFlight = false;
    disarmTimer();
    closeSocket();
    mode = 'socket';
    failures = 0;
    missed = false;
    if (cancelVis) {
        cancelVis();
        cancelVis = null;
    }
}
