/**
 * Opening the campaign once per visit. The map view asks as soon as it knows who is signed in
 * and which truth it shows (after its first paint, never before it), so the dossier's "your
 * records here" and the party's marker do not wait for the Campaign panel to be opened; the
 * panel asks too, and shows the outcome.
 */
import { ref } from 'vue';
import { session } from '../account/session.ts';
import { campaign, openCampaign } from '../campaign/store.ts';

let opening = false;
/** The truth version last asked for, for a "Try again" that does not know it. */
let lastVersion = '';

/** The open itself threw (a reply that did not parse): shown as the store's own error is. */
export const openFailed = ref(false);

async function openNow(truthVersion: string): Promise<void> {
    lastVersion = truthVersion;
    opening = true;
    openFailed.value = false;
    try {
        await openCampaign({ fetch, truthVersion });
    } catch {
        openFailed.value = true;
    } finally {
        opening = false;
    }
}

/** Opens the campaign unless it is open, opening, or has already failed this visit. */
export async function ensureCampaign(truthVersion: string): Promise<void> {
    if (opening || !session.user || !truthVersion) return;
    if (campaign.status === 'ready' || campaign.status === 'loading' || campaign.status === 'error' || openFailed.value) return;
    await openNow(truthVersion);
}

/** "Try again" after a failure, on the version given or the one last asked for. */
export async function retryCampaign(truthVersion: string = lastVersion): Promise<void> {
    if (opening || !session.user || !truthVersion) return;
    await openNow(truthVersion);
}

/** Signing out: the next account starts clean. */
export function forgetOpening(): void {
    openFailed.value = false;
}
