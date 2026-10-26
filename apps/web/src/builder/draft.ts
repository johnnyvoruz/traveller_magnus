/**
 * A local edit of one stored system. Nothing is written until Keep.
 * The draft call names the stored envelope every time, debounced, and an older
 * answer is dropped. Keep joins the map queue so it takes the rev a save in
 * flight already applied. A 409 leaves the draft and offers the server's row.
 * When that row is a newer tree, Keep mine re-reads its form and applies the
 * local edits by field id. Keep posts only after that, and never against a hash
 * that is gone. Blank creates a system, then opens this same handle.
 */
import { ref, type Ref } from 'vue';
import type {
    EditForm,
    FormChange,
    FormChanged,
    FormMessage,
    FormField,
    FormRoll,
    FormValue,
} from '@voyage/shared';
import type { BuilderHex as HexRow } from '@voyage/shared';
import { loadSchemas, schemas } from '../platform/schemas.ts';
import type { UndoToken } from './types.ts';

type FetchResult = Promise<unknown>;

export type KeepOutcome =
    | { status: 'kept'; row: HexRow; undo: UndoToken }
    | { status: 'conflict'; current: HexRow | null; message: string }
    | { status: 'refused'; message: string; messages: FormMessage[] };

export type DraftPort = {
    request(method: string, url: string, body?: unknown): FetchResult;
    schedule: (fn: () => void, ms: number) => () => void;
    /** Same delay as the map queue, so a draft and a save share one wait. */
    delay: number;
    hexPath(hexKey: string, suffix?: string): string;
    keep(hexKey: string, body: { hash: string; changes: FormChange[]; roll?: FormRoll[] }): Promise<KeepOutcome>;
};

/** A field the new system no longer has. `label` is the name the person saw. */
export type DroppedField = { id: string; label: string };

export type BlankOpened = { draft: DraftHandle; undo: UndoToken };

export type DraftHandle = {
    form: Ref<EditForm>;
    dirty: Ref<boolean>;
    /** Fields the last draft answer said had moved, with the engine's words. */
    changedByEngine: Ref<FormChanged[]>;
    messages: Ref<FormMessage[]>;
    /** The row stored now, when Keep lost a race. Null while the draft still leads. */
    conflict: Ref<HexRow | null>;
    /** True when that row's tree is not the one this draft names. Keep will not resend the old hash. */
    replaced: Ref<boolean>;
    /** Fields dropped while applying this draft onto a newer tree, named for the person. */
    dropped: Ref<DroppedField[]>;
    set(fieldId: string, value: FormValue): void;
    /**
     * Append one star or one body. Each call is its own change, in call order.
     * `id` is the client's and is the same id Keep sends.
     */
    add(field: 'star.add' | 'body.add', id: string): void;
    /** Drop one pending change, including a remove whose field has already left the form. */
    unset(fieldId: string): void;
    rollAgain(id: string): void;
    keep(): Promise<UndoToken | null>;
    /** Re-read the stored form and lay this draft's edits on it. Does not Keep. */
    keepMine(): Promise<void>;
    /** Show the stored form and throw this draft away. */
    takeTheirs(): Promise<void>;
    discard(): void;
};

type DraftMap = {
    openDraft(hexKey: string): Promise<DraftHandle>;
    blank(hexKey: string): Promise<BlankOpened>;
};

let bound: DraftMap | null = null;

/** The map the signed-in views opened. Tests call `map.openDraft` on their own map. */
export function attachDraftMap(map: DraftMap | null): void {
    bound = map;
}

export function openDraft(hexKey: string): Promise<DraftHandle> {
    if (!bound) throw new Error('offline');
    return bound.openDraft(hexKey);
}

export function blank(hexKey: string): Promise<BlankOpened> {
    if (!bound) throw new Error('offline');
    return bound.blank(hexKey);
}

function cloneField(field: FormField): FormField {
    const copy: FormField = {
        id: field.id,
        label: field.label,
        kind: field.kind,
        permission: field.permission,
        value: field.value,
        options: field.options.map((option) => ({ value: option.value, label: option.label })),
    };
    if (field.lookup !== undefined) copy.lookup = field.lookup;
    return copy;
}

function cloneForm(form: EditForm): EditForm {
    const copy: EditForm = {
        edition: form.edition,
        sections: form.sections.map((section) => ({
            id: section.id,
            label: section.label,
            fields: section.fields.map((field) => cloneField(field)),
        })),
    };
    if (form.mode) copy.mode = form.mode;
    return copy;
}

function findField(form: EditForm, id: string): FormField | null {
    for (const section of form.sections) {
        for (const field of section.fields) {
            if (field.id === id) return field;
        }
    }
    return null;
}

function writeField(form: EditForm, id: string, value: FormValue): void {
    const field = findField(form, id);
    if (field) field.value = value;
}

/** A bare 400 names the field by `details.code` `field`. The sentence stays the message. */
function fieldIdFrom(details: unknown): string | null {
    const parsed = schemas().FieldRefusalDetails.safeParse(details);
    return parsed.success ? parsed.data.id : null;
}

function listedMessages(details: unknown): FormMessage[] {
    if (!details || typeof details !== 'object' || Array.isArray(details)) return [];
    const raw = (details as { messages?: unknown }).messages;
    if (!Array.isArray(raw)) return [];
    const out: FormMessage[] = [];
    for (const item of raw) {
        const parsed = schemas().FormMessage.safeParse(item);
        if (parsed.success) out.push(parsed.data);
    }
    return out;
}

/**
 * A draft the server refuses (HTTP 400). The words and the field id land on
 * `messages`. `holds` stays true so Keep does not post while it stands.
 * A drop or a conflict is not this.
 */
function refusalMessages(err: unknown, _form: EditForm): FormMessage[] | null {
    if (!err || typeof err !== 'object') return null;
    if ((err as { status?: unknown }).status !== 400) return null;
    const listed = listedMessages((err as { details?: unknown }).details);
    if (listed.length) {
        return listed.some((item) => item.holds) ? listed : listed.map((item) => ({ ...item, holds: true }));
    }
    const raw = err instanceof Error ? err.message : '';
    const text = raw && raw !== 'offline' ? raw : 'The server refused this draft.';
    return [{ id: fieldIdFrom((err as { details?: unknown }).details), text, holds: true }];
}

export async function startDraft(port: DraftPort, hexKey: string): Promise<DraftHandle> {
    // The schemas come down while the form does. Everything below runs after this await, so `schemas()` is ready.
    const shared = loadSchemas();
    const data = await port.request('GET', port.hexPath(hexKey, '/form'));
    await shared;
    const read = schemas().FormRead.safeParse(data);
    if (!read.success) throw new Error('The server sent a form the store could not read.');

    let hash = read.data.hash;
    let baseline = cloneForm(read.data.form);
    let changes: FormChange[] = [];
    let rolls: string[] = [];
    let epoch = 0;
    let timer: (() => void) | null = null;
    const form = ref(cloneForm(read.data.form));
    const dirty = ref(false);
    const changedByEngine = ref<FormChanged[]>([]);
    const messages = ref<FormMessage[]>([]);
    const conflict = ref<HexRow | null>(null);
    const replaced = ref(false);
    const dropped = ref<DroppedField[]>([]);

    function labelOf(id: string): string {
        const live = findField(form.value, id);
        if (live && live.label) return live.label;
        const origin = findField(baseline, id);
        return origin && origin.label ? origin.label : id;
    }

    function stillThere(next: EditForm, id: string): boolean {
        if (findField(next, id)) return true;
        if (!/^body\.\d+$/.test(id)) return false;
        const prefix = id + '.';
        for (const section of next.sections) {
            for (const field of section.fields) {
                if (field.id.startsWith(prefix)) return true;
            }
        }
        return false;
    }

    /** A profile roll is not a row. It stays while its body is still on the form. */
    function profileRollStays(next: EditForm, id: string): boolean {
        if (!id.endsWith('.profile.roll')) return false;
        const owner = id.slice(0, -'.profile.roll'.length);
        if (!owner) return false;
        if (findField(next, owner)) return true;
        const prefix = owner + '.';
        for (const section of next.sections) {
            for (const field of section.fields) {
                if (field.id === owner || field.id.startsWith(prefix)) return true;
            }
        }
        return false;
    }

    async function readForm(): Promise<{ hash: string; form: EditForm }> {
        const loaded = await port.request('GET', port.hexPath(hexKey, '/form'));
        const parsed = schemas().FormRead.safeParse(loaded);
        if (!parsed.success) throw new Error('The server sent a form the store could not read.');
        return parsed.data;
    }

    function bodyNow(): { hash: string; changes: FormChange[]; roll?: FormRoll[] } {
        const body: { hash: string; changes: FormChange[]; roll?: FormRoll[] } = {
            hash,
            changes: changes.map((item) => ({ id: item.id, value: item.value })),
        };
        if (rolls.length) body.roll = rolls.map((id) => ({ id }));
        return body;
    }

    function upsert(id: string, value: FormValue): void {
        const found = changes.find((item) => item.id === id);
        if (found) found.value = value;
        else changes.push({ id, value });
    }

    /** A field of a star or body this draft has already added, before the answer returns. */
    function pendingAdd(fieldId: string): boolean {
        for (const change of changes) {
            if (change.id !== 'star.add' && change.id !== 'body.add') continue;
            const id = change.value;
            if (typeof id !== 'string' || !id) continue;
            if (fieldId === id || fieldId.startsWith(id + '.')) return true;
        }
        return false;
    }

    async function publish(token: number): Promise<void> {
        if (token !== epoch) return;
        const body = bodyNow();
        let answerData: unknown;
        try {
            answerData = await port.request('POST', port.hexPath(hexKey, '/draft'), body);
        } catch (err) {
            if (token !== epoch) return;
            const refused = refusalMessages(err, form.value);
            if (refused) messages.value = refused;
            return;
        }
        if (token !== epoch) return;
        const answer = schemas().FormAnswer.safeParse(answerData);
        if (!answer.success) return;
        form.value = answer.data.form;
        changedByEngine.value = answer.data.changed;
        messages.value = answer.data.messages;
    }

    function touch(): void {
        epoch += 1;
        const token = epoch;
        if (timer) timer();
        timer = port.schedule(() => {
            timer = null;
            void publish(token);
        }, port.delay);
    }

    function note(): void {
        dirty.value = changes.length > 0 || rolls.length > 0;
        if (!dirty.value) {
            epoch += 1;
            if (timer) timer();
            timer = null;
            form.value = cloneForm(baseline);
            changedByEngine.value = [];
            messages.value = [];
            return;
        }
        touch();
    }

    function set(fieldId: string, value: FormValue): void {
        const field = findField(form.value, fieldId);
        if (field && field.permission === 'read') return;
        if (!field && !pendingAdd(fieldId)) return;
        rolls = rolls.filter((id) => id !== fieldId);
        const origin = findField(baseline, fieldId);
        if (origin && origin.value === value) changes = changes.filter((item) => item.id !== fieldId);
        else upsert(fieldId, value);
        writeField(form.value, fieldId, value);
        note();
    }

    function add(field: 'star.add' | 'body.add', id: string): void {
        if (field !== 'star.add' && field !== 'body.add') return;
        if (!id) return;
        changes.push({ id: field, value: id });
        note();
    }

    function unset(fieldId: string): void {
        if (!changes.some((item) => item.id === fieldId)) return;
        changes = changes.filter((item) => item.id !== fieldId);
        const origin = findField(baseline, fieldId);
        if (origin) writeField(form.value, fieldId, origin.value);
        note();
    }

    function rollAgain(id: string): void {
        if (!id) return;
        changes = changes.filter((item) => item.id !== id);
        // A profile roll is applied once per entry. Any other roll stays once.
        if (id.endsWith('.profile.roll') || !rolls.includes(id)) rolls.push(id);
        note();
    }

    async function keep(): Promise<UndoToken | null> {
        if (timer) {
            timer();
            timer = null;
        }
        for (let pass = 0; pass < 4 && dirty.value; pass += 1) {
            const token = ++epoch;
            await publish(token);
            if (token === epoch) break;
        }
        const held = messages.value.find((item) => item.holds);
        if (held) throw new Error(held.text || 'This system could not be built.');
        if (replaced.value) return null;
        if (!dirty.value) return null;
        const mark = epoch;
        const sent = bodyNow();
        const outcome = await port.keep(hexKey, sent);
        if (outcome.status === 'conflict') {
            conflict.value = outcome.current;
            const tree = outcome.current ? outcome.current.treeHash : null;
            replaced.value = tree !== hash;
            return null;
        }
        if (outcome.status === 'refused') {
            if (outcome.messages.length) messages.value = outcome.messages;
            throw new Error(outcome.message);
        }
        if (outcome.row.treeHash) hash = outcome.row.treeHash;
        conflict.value = null;
        replaced.value = false;
        if (mark === epoch) {
            changes = [];
            rolls = [];
            dropped.value = [];
            baseline = cloneForm(form.value);
            dirty.value = false;
            changedByEngine.value = [];
            messages.value = [];
        }
        return outcome.undo;
    }

    async function keepMine(): Promise<void> {
        if (!conflict.value && !replaced.value) return;
        const mine = changes.map((item) => ({ id: item.id, value: item.value }));
        const mineRolls = [...rolls];
        epoch += 1;
        if (timer) timer();
        timer = null;
        const read = await readForm();
        const gone: DroppedField[] = [];
        const nextChanges: FormChange[] = [];
        for (const change of mine) {
            const carried = change.id === 'star.add' || change.id === 'body.add' || pendingAdd(change.id);
            if (!carried && !stillThere(read.form, change.id)) {
                gone.push({ id: change.id, label: labelOf(change.id) });
                continue;
            }
            const origin = findField(read.form, change.id);
            if (origin && origin.value === change.value) continue;
            nextChanges.push(change);
        }
        const nextRolls: string[] = [];
        for (const id of mineRolls) {
            if (!stillThere(read.form, id) && !profileRollStays(read.form, id)) {
                if (!gone.some((item) => item.id === id)) gone.push({ id, label: labelOf(id) });
                continue;
            }
            nextRolls.push(id);
        }
        hash = read.hash;
        baseline = cloneForm(read.form);
        form.value = cloneForm(read.form);
        changes = nextChanges;
        rolls = nextRolls;
        for (const change of changes) writeField(form.value, change.id, change.value);
        dropped.value = gone;
        conflict.value = null;
        replaced.value = false;
        dirty.value = changes.length > 0 || rolls.length > 0;
        changedByEngine.value = [];
        messages.value = [];
        if (!dirty.value) return;
        const token = ++epoch;
        await publish(token);
    }

    async function takeTheirs(): Promise<void> {
        epoch += 1;
        if (timer) timer();
        timer = null;
        const read = await readForm();
        hash = read.hash;
        baseline = cloneForm(read.form);
        form.value = cloneForm(read.form);
        changes = [];
        rolls = [];
        dirty.value = false;
        changedByEngine.value = [];
        messages.value = [];
        conflict.value = null;
        replaced.value = false;
        dropped.value = [];
    }

    function discard(): void {
        epoch += 1;
        if (timer) timer();
        timer = null;
        changes = [];
        rolls = [];
        form.value = cloneForm(baseline);
        dirty.value = false;
        changedByEngine.value = [];
        messages.value = [];
        conflict.value = null;
        replaced.value = false;
        dropped.value = [];
    }

    return {
        form,
        dirty,
        changedByEngine,
        messages,
        conflict,
        replaced,
        dropped,
        set,
        add,
        unset,
        rollAgain,
        keep,
        keepMine,
        takeTheirs,
        discard,
    };
}
