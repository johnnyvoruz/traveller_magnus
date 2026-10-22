/**
 * DJ1: a 100D jump time advances the campaign clock (Johnny 2026-10-18 10:00). Only the referee, with a
 * campaign open and its clock set, can do it; the time only (no ship moves, no journal entry). The
 * clock is days with a fraction, so a tile's hours go in as hours / 24, through the store's clock
 * change (the same one the date field uses: the held rev is its base, the server's rev wins).
 * No Undo (CRUD over undo): the date field sets it back.
 */
import { computed } from 'vue';
import { campaign, setCampaignDate } from '../campaign/store.ts';
import { clockText, secondsOfDay } from '../orbit/clock.ts';
import { showToast } from '../shell/toast.ts';
import { viewAs } from '../workspace/players/view_as.ts';
import { stardate } from '../workspace/stardate.ts';

/** "24.34h" as its figure and its unit, so the unit can sit small beside the number. */
export function journeyParts(text: string): { figure: string; unit: string } {
    const matched = /^([\d.,−-]+)\s*([^\d\s].*)$/.exec(text.trim());
    return matched ? { figure: matched[1] || text, unit: matched[2] || '' } : { figure: text, unit: '' };
}

/** The hours a tile says, exactly as stored ("24.34h" is 24.34). Null when it is not a positive number. */
export function journeyHours(text: string): number | null {
    const hours = Number(journeyParts(text).figure);
    return Number.isFinite(hours) && hours > 0 ? hours : null;
}

function hoursWords(figure: string): string {
    return figure + (figure === '1' ? ' hour' : ' hours');
}

/**
 * The referee, a campaign open, its clock set. Signed out, a player, no campaign or no clock: plain tiles.
 * Viewing as players (DJ1b) is plain tiles too, whatever the role says at that moment.
 */
export const canAdvanceClock = computed(() => campaign.role === 'owner' && campaign.status === 'ready' && campaign.clock !== null && !viewAs.on);

/** The tile's name for a screen reader and its tooltip. */
export function advanceLabel(text: string): string {
    return 'Advance the campaign ' + hoursWords(journeyParts(text).figure);
}

/** One clock change of hours / 24 on the held rev, then a toast with the new campaign date. */
export function advanceByJump(text: string): void {
    const hours = journeyHours(text);
    if (!canAdvanceClock.value || !campaign.clock || hours === null) return;
    const next = campaign.clock.days + hours / 24;
    setCampaignDate(next);
    const date = stardate(next);
    showToast('Advanced ' + hoursWords(journeyParts(text).figure) + '. The campaign date is now '
        + date.date + ', ' + clockText(secondsOfDay(next)).slice(0, 5) + '.');
}
