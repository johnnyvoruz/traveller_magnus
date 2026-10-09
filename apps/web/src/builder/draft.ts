/**
 * A local edit of one stored system. Nothing is written until Keep.
 * The draft call names the stored envelope every time, debounced, and an older
 * answer is dropped. Keep joins the map queue so it takes the rev a save in
 * flight already applied. A 409 leaves the draft and offers the server's row.
 */
import { ref, type Ref } from 'vue';
import {
    FormAnswer,
    FormRead,
    type EditForm,
    type FormChange,
    type FormChanged,
    type FormField,
    type FormMessage,
    type FormRoll,
    type FormValue,
} from '@voyage/shared';
import type { BuilderHex as HexRow } from '@voyage/shared';
import type { UndoToken } from './types.ts';

type FetchResult = Promise<unknown>;

export type KeepOutcome =
    | { status: 'kept'; row: HexRow; undo: UndoToken }
    | { status: 'conflict'; current: HexRow | null }
    | { status: 'refused'; message: string; messages: FormMessage[] };

export type DraftPort = {
    request(method: string, url: string, body?: unknown): FetchResult;
    schedule: (fn: () => void, ms: number) => () => void;
    /** Same delay as the map queue, so a draft and a save share one wait. */
    delay: number;
    hexPath(hexKey: string, suffix?: string): string;
    keep(hexKey: string, body: { hash: string; changes: FormChange[]; roll?: FormRoll[] }): Promise<KeepOutcome>;
};

export type DraftHandle = {
    form: Ref<EditForm>;
    dirty: Ref<boolean>;
    /** Fields the last draft answer said had moved, with the engine's words. */
    changedByEngine: Ref<FormChanged[]>;
    messages: Ref<FormMessage[]>;
    /** The row stored now, when Keep lost a race. Null while the draft still leads. */
    conflict: Ref<HexRow | null>;
    set(fieldId: string, value: FormValue): void;
    rollAgain(id: string): void;
    keep(): Promise<UndoToken | null>;
    discard(): void;
};

type DraftMap = { openDraft(hexKey: string): Promise<DraftHandle> };

let bound: DraftMap | null = null;

/** The map the signed-in views opened. Tests call `map.openDraft` on their own map. */
export function attachDraftMap(map: DraftMap | null): void {
    bound = map;
}

export function openDraft(hexKey: string): Promise<DraftHandle> {
    if (!bound) throw new Error('offline');
    return bound.openDraft(hexKey);
}

function cloneForm(form: EditForm): EditForm {
    return {
        edition: form.edition,
        sections: form.sections.map((section) => ({
            id: section.id,
            label: section.label,
            fields: section.fields.map((field) => ({
                id: field.id,
                label: field.label,
                kind: field.kind,
                permission: field.permission,
                value: field.value,
                options: field.options.map((option) => ({ value: option.value, label: option.label })),
            })),
        })),
    };
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

export async function startDraft(port: DraftPort, hexKey: string): Promise<DraftHandle> {
    const data = await port.request('GET', port.hexPath(hexKey, '/form'));
    const read = FormRead.safeParse(data);
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

    async function publish(token: number): Promise<void> {
        if (token !== epoch) return;
        const body = bodyNow();
        let answerData: unknown;
        try {
            answerData = await port.request('POST', port.hexPath(hexKey, '/draft'), body);
        } catch {
            return;
        }
        if (token !== epoch) return;
        const answer = FormAnswer.safeParse(answerData);
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
        if (!field || field.permission === 'read') return;
        rolls = rolls.filter((id) => id !== fieldId);
        const origin = findField(baseline, fieldId);
        if (origin && origin.value === value) changes = changes.filter((item) => item.id !== fieldId);
        else upsert(fieldId, value);
        writeField(form.value, fieldId, value);
        note();
    }

    function rollAgain(id: string): void {
        if (!id) return;
        changes = changes.filter((item) => item.id !== id);
        if (!rolls.includes(id)) rolls.push(id);
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
        if (held) throw new Error(held.text || 'The engine could not build this system.');
        if (!dirty.value) return null;
        const mark = epoch;
        const sent = bodyNow();
        const outcome = await port.keep(hexKey, sent);
        if (outcome.status === 'conflict') {
            conflict.value = outcome.current;
            return null;
        }
        if (outcome.status === 'refused') {
            if (outcome.messages.length) messages.value = outcome.messages;
            throw new Error(outcome.message);
        }
        if (outcome.row.treeHash) hash = outcome.row.treeHash;
        conflict.value = null;
        if (mark === epoch) {
            changes = [];
            rolls = [];
            baseline = cloneForm(form.value);
            dirty.value = false;
            changedByEngine.value = [];
            messages.value = [];
        }
        return outcome.undo;
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
    }

    return { form, dirty, changedByEngine, messages, conflict, set, rollAgain, keep, discard };
}
