/**
 * The campaign in the command palette (stream N4), offered while someone is signed in: "New
 * person" and the rest, one per record type; "Find a record…"; "Open the journal"; "Open the
 * timeline"; "Go to the party". The line that calls this is in shell/registry.ts.
 *
 * A new record, the search and the timeline need the open campaign: the command opens the
 * records list and leaves its ask in `campaignAsk`, which the Campaign panel carries out once
 * the campaign is ready (CampaignPanel.vue). The journal and the party are addresses.
 */
import { reactive, watch } from 'vue';
import type { CampaignRecordType } from '@voyage/shared';
import { session } from '../account/session.ts';
import { currentRoute, pushRoute } from '../shell/go.ts';
import { atPane, type Pane } from '../shell/pane.ts';
import type { Command } from '../shell/registry.ts';
import { RECORD_TYPES } from './records.ts';

/** What the palette asked the Campaign panel to do, and it has not done yet. */
export const campaignAsk = reactive<{ create: CampaignRecordType | null; find: boolean; timeline: boolean }>({
    create: null,
    find: false,
    timeline: false,
});

/** The store has no Campaign panel: from there the campaign opens over the map. */
const STORE_PATH = '/packages';

function goPane(pane: Pane): void {
    const here = currentRoute();
    if (!here) return;
    const away = here.path.startsWith(STORE_PATH);
    pushRoute(atPane(away ? '/' : here.path, away ? {} : here.query, pane));
}

/** The commands, one per record type and then the four ways in. */
export function campaignCommands(): Command[] {
    const list: Command[] = RECORD_TYPES.map((info) => ({
        id: 'campaign-new-' + info.type,
        name: 'New ' + info.one.toLowerCase(),
        run: () => {
            campaignAsk.create = info.type;
            goPane({ kind: 'campaign', record: null });
        },
    }));
    list.push(
        {
            id: 'campaign-find',
            name: 'Find a record…',
            run: () => {
                campaignAsk.find = true;
                goPane({ kind: 'campaign', record: null });
            },
        },
        { id: 'campaign-journal', name: 'Open the journal', run: () => goPane({ kind: 'journal', entry: null }) },
        {
            id: 'campaign-timeline',
            name: 'Open the timeline',
            run: () => {
                campaignAsk.timeline = true;
                goPane({ kind: 'campaign', record: null });
            },
        },
        { id: 'campaign-party', name: 'Go to the party', run: () => goPane({ kind: 'party' }) },
    );
    return list;
}

export function offerCampaignCommands(register: (command: Command) => () => void): void {
    let remove: (() => void) | null = null;
    watch(() => session.user !== null, (signedIn) => {
        if (remove) remove();
        remove = null;
        if (!signedIn) return;
        const stops = campaignCommands().map((command) => register(command));
        remove = () => { for (const stop of stops) stop(); };
    }, { immediate: true });
}
