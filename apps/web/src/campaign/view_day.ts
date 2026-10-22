/**
 * The day the session is looking at. One value for the orbit view and the map.
 * Null follows the campaign date. Nothing here is stored, and nothing is written
 * to the campaign.
 */
import { ref } from 'vue';
import { stardate } from '../workspace/stardate.ts';

/** Null means the view follows the campaign date. */
export const viewDay = ref<number | null>(null);

/** Bumps when a campaign-date write clears the view day, so an open orbit clock can follow. */
export const viewReset = ref(0);

/** The day marks read. A campaign with no date of its own keeps the day the caller already has. */
export function readingDay(campaignDay: number): number {
    const looking = viewDay.value;
    if (looking !== null && Number.isFinite(looking)) return looking;
    return campaignDay;
}

/** True when the session is looking at a different day from the campaign date. */
export function viewIsOff(campaignDay: number | null): boolean {
    const looking = viewDay.value;
    if (looking === null || campaignDay === null || !Number.isFinite(campaignDay)) return false;
    return Math.floor(looking) !== Math.floor(campaignDay);
}

/**
 * The orbit clock publishes the day it is showing. The same calendar day as the
 * campaign date clears the override, so the map follows the campaign again.
 */
export function publishViewDay(days: number, campaignDay: number | null): void {
    if (!Number.isFinite(days)) return;
    if (campaignDay !== null && Math.floor(days) === Math.floor(campaignDay)) {
        if (viewDay.value !== null) viewDay.value = null;
        return;
    }
    if (viewDay.value === days) return;
    viewDay.value = days;
}

/** The pill and a campaign-date write. The view follows the campaign date again. */
export function resetViewDay(): void {
    viewDay.value = null;
    viewReset.value += 1;
}

/** The map pill. `days` is the view day; the date is the app's stardate. */
export function viewingLabel(days: number): string {
    return 'Viewing ' + stardate(days).date + ' · Back to the campaign date';
}
