/**
 * The panes a person has opened, this tab only. Back walks the stack.
 * The browser's history is not used: it can leave the app.
 * A pane counts once. Closing the pane clears the stack.
 */
import { computed, ref } from 'vue';
import { showsSystemOverview } from '../orbit/opening.ts';
import { addressPane, type Query } from './pane.ts';

export type SeenPane = { path: string; query: Record<string, string> };

type Entry = SeenPane & { id: string };

export const paneBack = ref<Entry[]>([]);

/** Half or full, shared by every pane. Full covers the map; half leaves the hex above. */
export const sheetFull = ref(false);

export const canPaneBack = computed(() => paneBack.value.length > 1);

export function toggleSheet(): void {
    sheetFull.value = !sheetFull.value;
}

/** Path plus the pane it shows. The camera and the clock are not a different pane. */
export function paneId(path: string, query: Query): string {
    const address = addressPane(path, query);
    if (address.pane.kind === 'shut') return '';
    // The system overview shares the body-less orbit path with the opening mainworld.
    // The query keeps those two panes apart, so Back can return to the body.
    const overview = address.view.kind === 'orbit' && address.view.body === null && showsSystemOverview(query);
    const id = { path, view: address.view, pane: address.pane, ...(overview ? { overview: '1' } : {}) };
    return JSON.stringify(id);
}

function strings(query: Query): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(query)) {
        const raw = Array.isArray(value) ? value[0] : value;
        if (typeof raw === 'string' && raw.length > 0) out[key] = raw;
    }
    return out;
}

/** Remember the pane on screen. Shut clears. The same pane again does not stack. */
export function notePane(path: string, query: Query): void {
    const id = paneId(path, query);
    if (!id) {
        paneBack.value = [];
        return;
    }
    const snap: Entry = { id, path, query: strings(query) };
    const stack = paneBack.value;
    const at = stack.findIndex((entry) => entry.id === id);
    if (at === stack.length - 1 && stack.length > 0) {
        const next = stack.slice();
        next[at] = snap;
        paneBack.value = next;
        return;
    }
    if (at >= 0) {
        paneBack.value = [...stack.slice(0, at), snap];
        return;
    }
    paneBack.value = [...stack, snap];
}

/** The pane before this one, taken off the stack. Null when this is the first. */
export function backTo(): SeenPane | null {
    const stack = paneBack.value;
    if (stack.length < 2) return null;
    const target = stack[stack.length - 2];
    paneBack.value = stack.slice(0, -1);
    return { path: target.path, query: target.query };
}

/** Tests. A session starts empty. */
export function resetPaneBack(): void {
    paneBack.value = [];
    sheetFull.value = false;
}
