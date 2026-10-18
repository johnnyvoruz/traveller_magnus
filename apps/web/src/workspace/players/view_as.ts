/**
 * View as players (players_build_plan.md P5, built with P6): the referee sees the campaign exactly as
 * a player would. The projection (`playersView`) runs over the full store in the browser and is loaded
 * the way a player's page is (`applyPlayersPage`), with the role set to player, so the panel shows the
 * player's screens and the store refuses every change but a players note, and there are none to make
 * here. The poll waits meanwhile. Stopping reads the campaign back from the server, as the referee.
 */
import { reactive } from 'vue';
import { PlayersPage, playersView } from '@voyage/shared';
import { flushCampaign, pending } from '../../campaign/commit.ts';
import { applyPlayersPage, campaign, switchCampaign } from '../../campaign/store.ts';

export const viewAs = reactive({ on: false, busy: false });

export const VIEW_AS_BANNER = "You're seeing what players see";

/** Only the referee, with the campaign open and nothing waiting to save. */
export function canViewAs(): boolean {
    return campaign.role === 'owner' && campaign.status === 'ready' && !viewAs.on;
}

export async function startViewAs(): Promise<boolean> {
    if (!canViewAs() || viewAs.busy) return false;
    viewAs.busy = true;
    try {
        await flushCampaign();
        if (pending.value || campaign.role !== 'owner') return false;
        const view = playersView({
            records: Object.values(campaign.records),
            links: Object.values(campaign.links),
            journal: Object.values(campaign.journal),
            settings: campaign.settings,
            clock: campaign.clock,
        });
        const page = PlayersPage.parse({
            records: view.records,
            links: view.links,
            journal: view.journal,
            settings: view.settings,
            clock: view.clock,
            seq: campaign.seq,
            done: true,
            visible: {
                records: view.records.map((row) => row.id),
                links: view.links.map((row) => row.id),
                journal: view.journal.map((row) => row.id),
            },
        });
        viewAs.on = true;
        campaign.role = 'player';
        applyPlayersPage(page);
        return true;
    } finally {
        viewAs.busy = false;
    }
}

/** Back to the referee's campaign, read again from the server. */
export async function endViewAs(): Promise<void> {
    if (!viewAs.on || viewAs.busy) return;
    viewAs.busy = true;
    const id = campaign.universeId;
    try {
        viewAs.on = false;
        if (id) await switchCampaign(id);
    } finally {
        viewAs.busy = false;
    }
}
