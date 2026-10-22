/**
 * The example campaign, the screen's side (streams/D.md DL8; backlog L8): whether one is published,
 * going in, and coming back. A's `loadDemo` (campaign/demo.ts) reads it into the store as a player
 * would see it, read-only (`exampleRead` blocks every save). Here: a probe that leaves the store alone,
 * the address to come back to, and a reactive `example.on` the Campaign panel reads (A's flag is not
 * reactive). Leaving resets the store and, for a signed-in referee, opens their own campaign again.
 */
import { reactive } from 'vue';
import type { Router } from 'vue-router';
import { session } from '../account/session.ts';
import { resetCampaign } from '../campaign/commit.ts';
import { loadDemo } from '../campaign/demo.ts';
import { transport } from '../campaign/store.ts';
import { showToast } from '../shell/toast.ts';
import { retryCampaign } from './opening.ts';

type Address = { path: string; query: Record<string, string> };

export const EXAMPLE_BANNER = 'This is an example. Create an account to start your own.';
export const EXAMPLE_ENTRY = 'Look around an example campaign';
export const EXAMPLE_MISSING = 'The example campaign isn\'t available right now.';

export const example = reactive({
    /** The example is what the Campaign panel shows. */
    on: false,
    /** Whether the route answers: null until asked. A 404 or a 503 is false, and the entry does not show. */
    available: null as boolean | null,
    /** Where the person was before going in, so leaving puts it back. */
    back: null as Address | null,
});

/** Asks once whether an example is published. Leaves the store alone. */
export async function checkExample(): Promise<boolean> {
    if (example.available !== null) return example.available;
    // A plain call: a browser's fetch called as transport.fetch(...) throws "Illegal invocation".
    const fetchNow = transport.fetch;
    try {
        const res = await fetchNow('/api/demo/campaign', { credentials: 'omit' });
        example.available = res.ok;
    } catch {
        example.available = false;
    }
    return example.available;
}

function plainQuery(query: Record<string, unknown>): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(query)) if (typeof value === 'string') out[key] = value;
    return out;
}

/**
 * Opens the example in the Campaign panel. From the welcome page the way back is the home map with
 * the panel shut; from anywhere else, that address as it was.
 */
export async function enterExample(router: Router): Promise<boolean> {
    const now = router.currentRoute.value;
    const page = await loadDemo();
    if (!page) {
        example.available = false;
        showToast(EXAMPLE_MISSING);
        return false;
    }
    example.back = now.path.startsWith('/welcome') ? { path: '/', query: { panel: 'closed' } } : { path: now.path, query: plainQuery(now.query) };
    example.on = true;
    await router.push({ path: '/', query: { panel: 'campaign' } });
    return true;
}

/** Leaves the example: the store as it was before, the address as it was. */
export async function leaveExample(router: Router, to: Address | null = null): Promise<void> {
    if (!example.on) return;
    const back = to ?? example.back ?? { path: '/', query: { panel: 'closed' } };
    example.on = false;
    example.back = null;
    resetCampaign();
    if (session.user) void retryCampaign();
    await router.push(back);
}
