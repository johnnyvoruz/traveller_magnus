/**
 * Editing a system in place, as a draft you Keep (findings/builder_system_design.md §3;
 * directives/prompts/builder_step2.md). The screen is drawn from the server's edit form and
 * knows nothing of an engine's tree: a field is an id, a label, a kind and a permission.
 * Agent A's draft handle (`builder/draft.ts`) does the talking; this holds which draft is
 * open, what the referee typed, and the words for it. The pure parts run under Node.
 */
import { reactive, shallowRef } from 'vue';
import type { EditForm, FormChanged, FormField, FormMessage, FormSection, FormValue } from '@voyage/shared';
import type { DraftHandle } from '../../builder/draft.ts';
import type { HandKind } from './hand.ts';
import { showToast } from '../../shell/toast.ts';
import { buildStore, ownSectors } from './seam.ts';
import { plural } from './state.ts';

// ---- pure: reading a form -------------------------------------------------------------------------

/** Every field's value by id, as the form holds it. */
export function valuesOf(form: EditForm): Record<string, FormValue> {
    const out: Record<string, FormValue> = {};
    for (const section of form.sections) for (const field of section.fields) out[field.id] = field.value;
    return out;
}

export function fieldOf(form: EditForm, id: string): FormField | null {
    for (const section of form.sections) for (const field of section.fields) if (field.id === id) return field;
    return null;
}

/**
 * The thing a field belongs to, from its id: `star.0.type` is of `star.0`, `body.2.moon.0.pd`
 * of `body.2.moon.0`. A field that belongs to nothing numbered has no owner.
 */
export function ownerOf(id: string): string {
    const found = /^([a-z]+\.\d+(?:\.[a-z]+\.\d+)?)\./i.exec(id);
    return found ? found[1] : '';
}

export type FieldGroup = { owner: string; moon: boolean; fields: FormField[] };

/** A section's fields in order, gathered by owner: the loose ones first as one group, then one group a star, world or moon. */
export function groupFields(section: FormSection): FieldGroup[] {
    const groups: FieldGroup[] = [];
    for (const field of section.fields) {
        const owner = ownerOf(field.id);
        const last = groups[groups.length - 1];
        if (last && last.owner === owner) last.fields.push(field);
        else groups.push({ owner, moon: owner.split('.').length > 2, fields: [field] });
    }
    return groups;
}

/** What a group is called: the value of its name field when it has one, else its owner's id in words ("Star 1"). */
export function groupTitle(group: FieldGroup): string {
    if (!group.owner) return '';
    const named = group.fields.find((field) => field.id === group.owner + '.name');
    if (named && typeof named.value === 'string' && named.value.trim()) return named.value.trim();
    const parts = group.owner.split('.');
    const kind = parts[parts.length - 2];
    const index = Number(parts[parts.length - 1]) + 1;
    return kind.charAt(0).toUpperCase() + kind.slice(1) + ' ' + index;
}

export type FieldMark = 'mine' | 'engine' | 'none';

/** Teal for what the referee changed; amber for what the engine moved because of it. */
export function markOf(id: string, mine: Record<string, FormValue>, rolled: readonly string[], changed: readonly FormChanged[]): FieldMark {
    if (id in mine || rolled.includes(id)) return 'mine';
    return changed.some((item) => item.id === id) ? 'engine' : 'none';
}

/** The engine's own words for a field it moved, or empty when it did not speak. */
export function whyOf(id: string, changed: readonly FormChanged[]): string {
    const found = changed.find((item) => item.id === id);
    return found ? found.why.trim() : '';
}

/** The first line of the engine's words, and how many more there are: a long trace is folded to its first line. */
export function firstLine(why: string): string {
    return why.split(/\r?\n/).map((line) => line.trim()).find((line) => line !== '') ?? '';
}

export function moreLines(why: string): number {
    return Math.max(0, why.split(/\r?\n/).filter((line) => line.trim() !== '').length - 1);
}

export function messagesFor(id: string | null, messages: readonly FormMessage[]): FormMessage[] {
    return messages.filter((item) => item.id === id);
}

/** A message whose field is not on the form is shown with the ones that name no field. */
export function looseMessages(form: EditForm, messages: readonly FormMessage[]): FormMessage[] {
    return messages.filter((item) => item.id === null || fieldOf(form, item.id) === null);
}

/**
 * Where each of the seven rule places stands (findings/builder_system_design.md §3, R1 to R7):
 * after the section it is about. A place is drawn empty; it shows text only if the server
 * ever puts some in its field.
 */
export const RULE_PLACES: Readonly<Record<string, readonly string[]>> = {
    profile: ['rule.R1'],
    chart: ['rule.R2', 'rule.R4', 'rule.R5', 'rule.R7'],
    system: ['rule.R3', 'rule.R6'],
};

export function rulesAfter(form: EditForm, sectionId: string): FormField[] {
    const ids = RULE_PLACES[sectionId] ?? [];
    const out: FormField[] = [];
    for (const id of ids) {
        const field = fieldOf(form, id);
        if (field) out.push(field);
    }
    return out;
}

/** "3 changes", counting what was typed and what was sent to be rolled again. */
export function changeLine(mine: Record<string, FormValue>, rolled: readonly string[], messages: readonly FormMessage[]): string {
    const count = Object.keys(mine).length + rolled.length;
    const said = messages.length ? ' · ' + plural(messages.length, 'message', 'messages') : '';
    return plural(count, 'change', 'changes') + said;
}

/** A typed number box's text as the value to send: a number, or null when it is empty or not one. */
export function numberValue(text: string): number | null {
    const trimmed = text.trim();
    if (trimmed === '') return null;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
}

// ---- the open draft -------------------------------------------------------------------------------

export type DraftOpener = (hexKey: string) => Promise<DraftHandle>;
/** A blank system names no engine and no star (ruling 6 of 2026-10-09): the hex is all it is sent. */
export type BlankOpener = (hexKey: string) => Promise<{ draft: DraftHandle; undo: { id: string } }>;

let opener: DraftOpener | null = null;
let blanker: BlankOpener | null = null;
/** An open that was overtaken (the hex changed, Discard was pressed) does not land. */
let ticket = 0;

/** The map view hands over Agent A's `openDraft` once the store is open. Tests hand over their own. */
export function setDraftOpener(open: DraftOpener | null, blank: BlankOpener | null = null): void {
    opener = open;
    blanker = blank;
}

/** The open draft. Held apart from `edit`: a reactive object would unwrap the handle's own refs. */
export const draftHandle = shallowRef<DraftHandle | null>(null);

export const edit = reactive({
    hexKey: '',
    name: '',
    /** `hand`: a system designed by hand, where the engine never runs and the designer is shown. */
    mode: 'generated' as 'generated' | 'hand',
    opening: false,
    keeping: false,
    error: '',
    /** The values the form had when the draft was opened, to tell what was typed. */
    baseline: {} as Record<string, FormValue>,
    labels: {} as Record<string, string>,
    /** What the referee typed, by field id; a value put back to what it was is not here. */
    mine: {} as Record<string, FormValue>,
    /** Fields and bodies sent to be rolled again. */
    rolled: [] as string[],
    /** Bodies this draft adds, in the order they were added: each waits for Keep with the rest. */
    added: [] as { id: string; kind: HandKind }[],
    /** Goes up when the whole form is replaced under the referee (Take theirs, Keep mine): every box shows the form's value again. */
    resync: 0,
    /** A place the referee tried to go with changes unkept; the pane asks before going. */
    leaving: null as null | { go: () => void; going: boolean },
});

export function editing(hexKey: string): boolean {
    return draftHandle.value !== null && edit.hexKey === hexKey;
}

/** There is something to lose. */
export function editDirty(): boolean {
    return draftHandle.value !== null && draftHandle.value.dirty.value;
}

function clear(): void {
    ticket += 1;
    edit.hexKey = '';
    edit.name = '';
    edit.mode = 'generated';
    draftHandle.value = null;
    edit.opening = false;
    edit.keeping = false;
    edit.error = '';
    edit.baseline = {};
    edit.labels = {};
    edit.mine = {};
    edit.rolled = [];
    edit.added = [];
    edit.leaving = null;
}

function adopt(hexKey: string, name: string, handle: DraftHandle, mode: 'generated' | 'hand'): void {
    const form = handle.form.value;
    edit.mode = mode;
    const labels: Record<string, string> = {};
    for (const section of form.sections) for (const field of section.fields) labels[field.id] = field.label || field.id;
    edit.hexKey = hexKey;
    edit.name = name;
    draftHandle.value = handle;
    edit.baseline = valuesOf(form);
    edit.labels = labels;
    edit.mine = {};
    edit.rolled = [];
    edit.added = [];
    edit.leaving = null;
}

/**
 * Whether the opened system is designed by hand. The form says so; a handle that does not
 * carry the form's mode yet is asked of the server once (seam.ts `formMode`).
 */
async function modeOf(hexKey: string, handle: DraftHandle): Promise<'generated' | 'hand'> {
    const said = handle.form.value.mode;
    if (said) return said;
    const port = ownSectors();
    const read = port ? await port.formMode(hexKey) : null;
    return read === 'hand' ? 'hand' : 'generated';
}

function say(err: unknown): string {
    const text = err instanceof Error ? err.message : '';
    return text && text !== 'offline' ? text : 'Can’t reach the server, so nothing was changed. Check your connection and try again.';
}

export async function openEdit(hexKey: string, name: string): Promise<void> {
    if (!opener || edit.opening) return;
    clear();
    const mark = ticket;
    edit.hexKey = hexKey;
    edit.opening = true;
    try {
        const handle = await opener(hexKey);
        if (mark !== ticket) return;
        const mode = await modeOf(hexKey, handle);
        if (mark !== ticket) return;
        adopt(hexKey, name, handle, mode);
    } catch (err) {
        if (mark === ticket) edit.error = say(err);
    } finally {
        if (mark === ticket) edit.opening = false;
    }
}

export function setField(id: string, value: FormValue): void {
    const handle = draftHandle.value;
    if (!handle) return;
    handle.set(id, value);
    edit.rolled = edit.rolled.filter((item) => item !== id);
    if (id in edit.baseline && edit.baseline[id] === value) delete edit.mine[id];
    else edit.mine[id] = value;
    edit.error = '';
}

/** A body added to the draft under an id the screen chose; nothing is stored until Keep. */
export function addField(field: 'star.add' | 'body.add', id: string, kind: HandKind): void {
    const handle = draftHandle.value;
    if (!handle) return;
    handle.add(field, id);
    edit.added.push({ id, kind });
    edit.error = '';
}

/** A change taken back out of the draft, whether or not its field is still on the form (a remove the server has already applied). */
export function unsetField(id: string): void {
    const handle = draftHandle.value;
    if (!handle) return;
    handle.unset(id);
    delete edit.mine[id];
    edit.error = '';
}

export function rollField(id: string): void {
    const handle = draftHandle.value;
    if (!handle) return;
    handle.rollAgain(id);
    delete edit.mine[id];
    if (!edit.rolled.includes(id)) edit.rolled.push(id);
    edit.error = '';
}

/** Throws the draft away and closes the editor. Says so once, when there was something to lose. */
export function discardEdit(): void {
    const handle = draftHandle.value;
    const lost = handle !== null && handle.dirty.value;
    const name = edit.name;
    if (handle) handle.discard();
    clear();
    if (lost) showToast('Discarded your changes to ' + (name || 'this system') + '.');
}

/** Keep: one save. On success the editor closes and the toast offers Undo. A conflict leaves the draft open. */
export async function keepEdit(): Promise<boolean> {
    const handle = draftHandle.value;
    if (!handle || edit.keeping) return false;
    if (!handle.dirty.value) {
        clear();
        return true;
    }
    edit.keeping = true;
    edit.error = '';
    try {
        const token = await handle.keep();
        if (handle.conflict.value !== null) return false;
        const name = edit.name;
        clear();
        if (token) {
            showToast('Kept your changes to ' + (name || 'this system') + '.', {
                action: {
                    label: 'Undo',
                    run: () => {
                        const store = buildStore();
                        if (store) void store.undo(token);
                    },
                },
            });
        }
        return true;
    } catch (err) {
        edit.error = say(err);
        return false;
    } finally {
        edit.keeping = false;
    }
}

/** After a conflict: the stored system, and this draft thrown away (the handle re-reads the form). */
export async function takeTheirs(): Promise<void> {
    const handle = draftHandle.value;
    if (!handle) return;
    edit.error = '';
    try {
        await handle.takeTheirs();
        edit.resync += 1;
        edit.baseline = valuesOf(handle.form.value);
        edit.mine = {};
        edit.rolled = [];
        edit.added = [];
    } catch (err) {
        edit.error = say(err);
    }
}

/**
 * After a conflict: the referee's own changes laid onto the system as it is stored now, by
 * field id, and shown as a draft (the handle does it, and names what it had to drop).
 * Nothing is kept until Keep is pressed again.
 */
export async function keepMine(): Promise<void> {
    const handle = draftHandle.value;
    if (!handle) return;
    edit.error = '';
    try {
        await handle.keepMine();
        edit.resync += 1;
        const gone = new Set(handle.dropped.value.map((item) => item.id));
        for (const id of Object.keys(edit.mine)) if (gone.has(id)) delete edit.mine[id];
        edit.rolled = edit.rolled.filter((id) => !gone.has(id));
        // What the stored system holds under a change of the referee's is not known here: no "was" is said for those.
        const stored = valuesOf(handle.form.value);
        for (const id of Object.keys(edit.mine)) delete stored[id];
        edit.baseline = stored;
    } catch (err) {
        edit.error = say(err);
    }
}

/**
 * A blank system on an empty hex: the server stores an empty one at once (no star, no world,
 * no name, nothing rolled) and the designer opens on it. Undo takes it away.
 */
export async function openBlank(hexKey: string): Promise<void> {
    if (!blanker || edit.opening) return;
    clear();
    const mark = ticket;
    edit.hexKey = hexKey;
    edit.opening = true;
    try {
        const made = await blanker(hexKey);
        const token = made.undo;
        showToast('Created a blank system. Add a star, and then add its worlds.', {
            action: {
                label: 'Undo',
                run: () => {
                    if (edit.hexKey === hexKey) dropEdit();
                    const store = buildStore();
                    if (store) void store.undo(token);
                },
            },
        });
        if (mark !== ticket) return;
        const mode = await modeOf(hexKey, made.draft);
        if (mark !== ticket) return;
        adopt(hexKey, '', made.draft, mode);
    } catch (err) {
        if (mark === ticket) edit.error = say(err);
    } finally {
        if (mark === ticket) edit.opening = false;
    }
}

/** Asked to go somewhere with changes unkept: hold the going and let the pane ask. True when it was held. */
export function holdLeaving(go: () => void, going = true): boolean {
    if (!editDirty()) {
        if (draftHandle.value || edit.opening) clear();
        return false;
    }
    edit.leaving = { go, going };
    return true;
}

export async function leaveKeeping(): Promise<void> {
    const leaving = edit.leaving;
    if (!leaving) return;
    if (await keepEdit()) leaving.go();
    else edit.leaving = null;
}

export function leaveDiscarding(): void {
    const leaving = edit.leaving;
    if (!leaving) return;
    discardEdit();
    leaving.go();
}

export function stay(): void {
    edit.leaving = null;
}

/** Build was switched off, or the universe closed: the draft goes without a word. */
export function dropEdit(): void {
    if (draftHandle.value) draftHandle.value.discard();
    clear();
}
