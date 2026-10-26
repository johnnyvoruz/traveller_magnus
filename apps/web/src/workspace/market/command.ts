/**
 * "My packages" in the command palette, offered only while someone is signed in
 * (findings/marketplace_screens_design.md 3), and "Marketplace", the rail item, offered to
 * everyone. The lines that call these are in shell/registry.ts; the account menu's entry
 * reaches the same My packages address.
 *
 * "Publish records" (prompts/d_store_harden.md item 3), also while someone is signed in: it opens
 * the Publish records dialog for the open campaign. On the store the store opens it; anywhere else
 * the campaign's records list opens and opens it (CampaignList.vue). Either one watches `publishAsk`.
 *
 * "Publish this record…" (Johnny 2026-10-22 20:08, ZB1 question 4), only while a record's page is open:
 * RecordPage.vue registers it while it is mounted, gated by the page's own `canPublishRecords`, and its
 * run opens the same dialog with that one record chosen. It is not the build-publish command; that one
 * keeps its name.
 */
import { reactive, watch } from 'vue';
import { session } from '../../account/session.ts';
import { currentRoute, pushRoute } from '../../shell/go.ts';
import { atPane } from '../../shell/pane.ts';
import type { Command } from '../../shell/registry.ts';

export const MY_PACKAGES_PATH = '/packages?mine=1';
export const MARKETPLACE_PATH = '/packages';

/** A "Publish records" asked for and not yet opened: the store or the records list takes it. */
export const publishAsk = reactive({ records: false });

function go(path: string): void {
    pushRoute(path);
}

/** Publish records: asked here; off the store, the campaign's records list opens over the page. */
export function askPublishRecords(): void {
    publishAsk.records = true;
    const here = currentRoute();
    if (!here || here.path.startsWith(MARKETPLACE_PATH)) return;
    pushRoute(atPane(here.path, here.query, { kind: 'campaign', record: null }));
}

export const PUBLISH_RECORD_ID = 'publish-record';
export const PUBLISH_RECORD_NAME = 'Publish this record\u2026';

/** The palette line for the record that is open. `canPublish` is the page's gate; `open` shows its dialog. */
export function publishThisRecord(canPublish: () => boolean, open: () => void): Command {
    return { id: PUBLISH_RECORD_ID, name: PUBLISH_RECORD_NAME, runnable: canPublish, run: open };
}

export function offerMarketplace(register: (command: Command) => () => void): void {
    register({ id: 'marketplace', name: 'Open the Marketplace', run: () => go(MARKETPLACE_PATH) });
}

export function offerMyPackages(register: (command: Command) => () => void): void {
    let remove: (() => void) | null = null;
    watch(() => session.user !== null, (signedIn) => {
        if (remove) remove();
        if (!signedIn) {
            remove = null;
            return;
        }
        const stops = [
            register({ id: 'my-packages', name: 'My packages', run: () => go(MY_PACKAGES_PATH) }),
            register({ id: 'publish-records', name: 'Publish records', run: askPublishRecords }),
        ];
        remove = () => { for (const stop of stops) stop(); };
    }, { immediate: true });
}