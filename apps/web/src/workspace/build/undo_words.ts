/**
 * What an Undo did, said truthfully (prompts/d_undo_words.md part 1; findings/builder_undo_faults.md).
 * The store's `undo` answers one of three ways:
 *
 * - nothing (`null`): everything the token could put back was put back, or it was already spent.
 *   The map shows it; the toast that offered Undo is enough.
 * - a report with a `message`: the server refused (a hex changed after the act). Its sentence is
 *   said, and the token is still good, so Undo is offered again.
 * - a report with `left` and no message: a job put back what it could and left the hexes that had
 *   changed since. Said once, naming them; the token is spent. The left hexes are marked on the map
 *   while that toast shows.
 *
 * A grow act's Undo can also answer with a token that puts it back again (Restore). A report is
 * told from that token by `left`.
 */
import { reactive, watch } from 'vue';
import { showToast, toasts, TOAST_ACTION_MS } from '../../shell/toast.ts';
import { buildStore, type UndoOutcome, type UndoToken } from './seam.ts';

export function isOutcome(value: unknown): value is UndoOutcome {
    return !!value && typeof value === 'object' && Array.isArray((value as { left?: unknown }).left);
}

/** "Kora", "Kora and Hebburn", "Kora, Hebburn, and Kabelac", "Kora, Hebburn, Kabelac, Sethos, and 3 more". */
export function nameList(names: readonly string[], cap = 4): string {
    const shown = names.slice(0, cap);
    const more = names.length - shown.length;
    const items = more > 0 ? [...shown, more + ' more'] : shown;
    if (items.length <= 1) return items.join('');
    if (items.length === 2) return items[0] + ' and ' + items[1];
    return items.slice(0, -1).join(', ') + ', and ' + items[items.length - 1];
}

function systems(count: number): string {
    return count + (count === 1 ? ' system' : ' systems');
}

/** The sentence for an Undo that left hexes as they are: they had changed after the act. */
export function leftWords(restored: number, names: readonly string[]): string {
    const first = restored > 0 ? 'Undo put back ' + systems(restored) + '.' : 'Undo didn’t put anything back.';
    const n = names.length;
    const second = n === 1
        ? '1 system had changed, so it was left as it is: ' + nameList(names) + '.'
        : n + ' systems had changed, so they were left as they are: ' + nameList(names) + '.';
    return first + ' ' + second;
}

/** The hexes an Undo left, marked on the map while its toast shows. */
export const undoLeft = reactive({ keys: [] as string[], toast: 0 });

watch(() => toasts.map((item) => item.id), (ids) => {
    if (undoLeft.toast !== 0 && !ids.includes(undoLeft.toast)) {
        undoLeft.keys = [];
        undoLeft.toast = 0;
    }
});

export type UndoSay = {
    /** Offers this Undo again: the toast it came from is gone, and the token is still good. */
    again: () => void;
    /** A hex as the pane names it. */
    name: (hexKey: string) => string;
};

/**
 * Says what an answer from `undo` means. Returns the token a grow act's Undo gives for Restore,
 * or null for anything else.
 */
export function sayUndo(answer: UndoToken | UndoOutcome | null | void, how: UndoSay): UndoToken | null {
    if (!answer) return null;
    if (!isOutcome(answer)) return answer;
    if (answer.message) {
        showToast(answer.message, { action: { label: 'Undo', run: how.again } });
        return null;
    }
    if (answer.left.length) {
        const id = showToast(leftWords(answer.restored, answer.left.map(how.name)), { ms: TOAST_ACTION_MS });
        undoLeft.keys = [...answer.left];
        undoLeft.toast = id;
    }
    return null;
}

/**
 * Runs one Undo and says what it did. A failure is said in the store's words. True when the
 * store answered with nothing: everything was put back, and nothing has been said yet.
 */
export async function runUndo(token: UndoToken, how: UndoSay): Promise<boolean> {
    const store = buildStore();
    if (!store) return false;
    try {
        const answer = await store.undo(token);
        sayUndo(answer, how);
        return !answer;
    } catch (err) {
        showToast(err instanceof Error && err.message ? err.message : 'Undo failed. Try again.');
        return false;
    }
}

/** What Undo did to a blank system: the hex is empty again, and nothing else on the map says so. */
export function blankUndone(hexKey: string): string {
    return 'Removed the blank system at ' + hexKey.slice(hexKey.lastIndexOf('/') + 1) + '.';
}
