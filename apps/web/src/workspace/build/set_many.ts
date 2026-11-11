/**
 * DH9, Set for N hexes: one chart field written to every system of a many-hex selection
 * (findings/hex_editor_plan.md §4 item 8, placed on the selection's own pane). Each hex is a
 * draft of its own, opened, set and kept in turn through the drafts' queue, exactly as the
 * editor would keep it; empty and removed hexes are left alone. Nothing is undone: setting
 * again takes it back. Pure: the opener is handed in, so it runs under Node.
 */
import type { DraftHandle } from '../../builder/draft.ts';

/** The two fields, by the ids the editor's form already uses (packages/generation/src/form.ts). */
export const SET_FIELDS = [
    { id: 'chart.allegiance', label: 'Allegiance' },
    { id: 'chart.region', label: 'Region' },
] as const;

export type SetFieldId = (typeof SET_FIELDS)[number]['id'];

export type SetOutcome = {
    /** Hexes whose system now holds the value. */
    done: string[];
    /** Hexes left as they were, with the reason. */
    failed: { key: string; why: string }[];
};

function count(n: number): string {
    return n + ' ' + (n === 1 ? 'hex' : 'hexes');
}

/** The button: "Set for 3 hexes". */
export function setButton(targets: number): string {
    return 'Set for ' + count(targets);
}

/** Said when some selected hexes are empty: "3 of 5 hexes hold a system". Nothing when all do. */
export function heldLine(targets: number, selected: number): string {
    if (targets >= selected) return '';
    return targets + ' of ' + count(selected) + (targets === 1 ? ' holds a system' : ' hold a system');
}

/** The one toast. */
export function setSentence(label: string, outcome: SetOutcome): string {
    const done = outcome.done.length;
    const failed = outcome.failed.length;
    if (!failed) return label + ' set for ' + count(done) + '.';
    const why = outcome.failed[0].why;
    if (!done) return label + ' was not set. ' + why;
    return label + ' set for ' + done + ' of ' + count(done + failed) + '. ' + (failed === 1 ? 'One was not changed: ' : failed + ' were not changed: ') + why;
}

function reason(err: unknown): string {
    const text = err instanceof Error ? err.message : '';
    return text && text !== 'offline' ? text : 'Cannot reach the server. Check your connection and try again.';
}

/**
 * Opens, sets and keeps one draft per hex, one after another. A conflict or a refusal leaves
 * that hex as it was and goes on with the next. `step` hears each hex as it finishes.
 */
export async function setForHexes(
    keys: readonly string[],
    fieldId: SetFieldId,
    value: string,
    open: (hexKey: string) => Promise<DraftHandle>,
    step: (done: number) => void = () => {},
): Promise<SetOutcome> {
    const out: SetOutcome = { done: [], failed: [] };
    for (const key of keys) {
        let handle: DraftHandle | null = null;
        try {
            handle = await open(key);
            handle.set(fieldId, value);
            await handle.keep();
            if (handle.conflict.value !== null) {
                out.failed.push({ key, why: 'Someone else changed this system. Try again.' });
                handle.discard();
            } else {
                out.done.push(key);
            }
        } catch (err) {
            out.failed.push({ key, why: reason(err) });
            if (handle) handle.discard();
        }
        step(out.done.length + out.failed.length);
    }
    return out;
}
