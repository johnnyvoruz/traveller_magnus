/**
 * The designer's acts on a system designed by hand (findings/builder_system_design.md §16):
 * add a body, remove one, move it up or down, give it to another parent, make it the
 * mainworld, and "Design by hand" on a generated or charted system. Each is one function, run
 * by a registered command and its control alike.
 *
 * Every act is a change to the draft, kept by Keep with the rest (ruling 1 of 2026-10-10):
 * a value, a move, a new parent, the mainworld, and adding and removing a body. Discard drops
 * them all; one Keep is one revision. A body added is named by the screen (`s<n>`, `b<n>`)
 * and its fields can be set at once (findings/builder_handle_ready.md). A remove that takes
 * others with it is asked about first, with the count the server's answer gives (ruling 3).
 */
import { reactive } from 'vue';
import { showToast } from '../../shell/toast.ts';
import { addField, draftHandle, dropEdit, edit, editing, openEdit, rollField, setField, unsetField } from './edit.ts';
import { formIds, handList, handUi, moveChanges, moveTarget, nextId, nodeTitle, orbitsValue, parentOptions, removeChanges, removeTakesOthers, reparentChanges, type HandKind, type HandNode } from './hand.ts';
import { buildStore, ownSectors } from './seam.ts';

/** The bodies of the open draft, as the list shows them. Empty when no hand-designed draft is open. */
export function handNodes(): HandNode[] {
    const handle = draftHandle.value;
    return handle && edit.mode === 'hand' ? handList(handle.form.value) : [];
}

export function selectedNode(): HandNode | null {
    return handNodes().find((item) => item.id === handUi.selected) ?? null;
}

/** The world a new moon is given to: the selected world, or the world the selected moon orbits. */
export function moonHost(): HandNode | null {
    const list = handNodes();
    const node = list.find((item) => item.id === handUi.selected);
    if (!node || node.kind === 'star') return null;
    if (node.kind !== 'moon') return node;
    return list.find((item) => item.id === node.parent) ?? null;
}

/** The star a new world is given to: the selected star, or the star the selected body stands under. */
function starFor(list: readonly HandNode[]): HandNode | null {
    let at = list.find((item) => item.id === handUi.selected) ?? null;
    for (let step = 0; at && at.kind !== 'star' && step < 4; step += 1) {
        const parent = at.parent;
        at = list.find((item) => item.id === parent) ?? null;
    }
    return at;
}

/** A body this draft has added and the server's answer does not show yet. */
function pending(id: string): { id: string; kind: HandKind } | null {
    return edit.added.find((item) => item.id === id) ?? null;
}

/** Why a body of this kind cannot be added now, or empty when it can. */
export function addWhy(kind: HandKind): string {
    if (draftHandle.value === null || edit.mode !== 'hand') return 'To add a body, open a system designed by hand.';
    if (kind === 'star') return '';
    if (!handNodes().some((item) => item.kind === 'star') && !edit.added.some((item) => item.kind === 'star')) return 'Add a star first.';
    if (kind === 'moon' && !moonHost()) return 'To add a moon, first select the world it orbits.';
    return '';
}

function busy(): boolean {
    return edit.keeping || edit.leaving !== null || handUi.removing !== null;
}

export function canAdd(kind: HandKind): boolean {
    return addWhy(kind) === '' && !busy();
}

/**
 * Add a star, world, gas giant, belt or moon to the draft. The screen names it, so what it
 * is and what it orbits are set in the same draft: a world under the selected star (or the
 * star the selection stands under), a moon under the selected world. Nothing is stored.
 */
export function addBody(kind: HandKind): void {
    const handle = draftHandle.value;
    if (!handle || !canAdd(kind)) return;
    const list = handNodes();
    const host = kind === 'moon' ? moonHost() : null;
    const chosen = pending(handUi.selected);
    const star = kind === 'star' || kind === 'moon' ? null : (chosen && chosen.kind === 'star' ? chosen.id : (starFor(list) ?? { id: '' }).id);
    const taken = [...formIds(handle.form.value), ...edit.added.map((item) => item.id)];
    const id = nextId(kind === 'star' ? 's' : 'b', taken);
    addField(kind === 'star' ? 'star.add' : 'body.add', id, kind);
    if (kind === 'gas' || kind === 'belt') setField(id + '.kind', kind);
    if (kind === 'moon' && host) {
        setField(id + '.kind', 'moon');
        setField(id + '.parent', host.id);
    } else if (star) setField(id + '.parent', star);
    handUi.selected = id;
}

export function canMoveBody(id: string, by: -1 | 1): boolean {
    return !busy() && moveTarget(handNodes(), id, by) !== null;
}

export function moveBody(id: string, by: -1 | 1): void {
    if (!canMoveBody(id, by)) return;
    for (const change of moveChanges(handNodes(), id, by)) setField(change.id, change.value);
}

/** Give a body to another parent: the picker, and a row dropped on another row. */
export function giveBody(id: string, to: string): void {
    if (busy()) return;
    for (const change of reparentChanges(handNodes(), id, to)) setField(change.id, change.value);
}

/** Whether a row may be dropped on another: the same question the picker answers. */
export function canGive(id: string, to: string): boolean {
    const list = handNodes();
    const node = list.find((item) => item.id === id);
    if (!node || orbitsValue(node) === to || id === to) return false;
    const option = parentOptions(list, id).find((item) => item.value === to);
    return !!option && option.why === '';
}

export function canRemoveBody(id: string): boolean {
    return !busy() && handNodes().some((item) => item.id === id);
}

/**
 * Remove a body: a change to the draft. A star with anything orbiting it, or a world with
 * moons, takes them with it, and the pane asks first, with the count the server's answer
 * gives; Cancel takes the remove back out of the draft.
 */
export function removeBody(id: string): void {
    if (!canRemoveBody(id)) return;
    const list = handNodes();
    const node = list.find((item) => item.id === id);
    if (!node) return;
    for (const change of removeChanges(list, id)) setField(change.id, change.value);
    // The row goes from the list and the bar counts the change; Discard puts it back.
    if (removeTakesOthers(list, id)) handUi.removing = { id, name: nodeTitle(node), kind: node.kind, before: list.map((item) => item.id) };
}

/** The ask: yes. The remove stays in the draft until Keep. */
export function confirmRemove(): void {
    handUi.removing = null;
}

/** The ask: no. The remove is taken back out of the draft, and everything it took returns with the next answer. */
export function cancelRemove(): void {
    const asking = handUi.removing;
    if (!asking) return;
    unsetField(asking.id + '.remove');
    handUi.selected = asking.id;
    handUi.removing = null;
}

export function canMainworld(id: string): boolean {
    const node = handNodes().find((item) => item.id === id);
    return !busy() && !!node && node.kind !== 'star' && !node.mainworld;
}

export function makeMainworld(id: string): void {
    if (canMainworld(id)) setField(id + '.mainworld', true);
}

// ---- hand and generated, both ways (ruling 5 of 2026-10-10) -------------------------------------

/** Whether a hex's stored system is designed by hand, as last read, and the revision it was read at. */
const modes = reactive<Record<string, { rev: number; hand: boolean }>>({});
const asked = new Set<string>();

/**
 * Whether the system a hex holds is designed by hand, generated, or not yet known. The row
 * does not carry it, so the server's form is asked once for each revision of the row; a
 * system as charted (no row) is never by hand. Until the answer is in it is null, and the
 * menus show neither "Design by hand…" nor "Generate" for it.
 */
export function handMode(hexKey: string): 'hand' | 'generated' | null {
    const store = buildStore();
    const port = ownSectors();
    if (!store || !port) return null;
    void store.tick();
    const row = store.row(hexKey);
    if (!row) return 'generated';
    if (row.state === 'removed') return null;
    const known = modes[hexKey];
    if (known && known.rev === row.rev) return known.hand ? 'hand' : 'generated';
    const mark = hexKey + '@' + row.rev;
    if (!asked.has(mark)) {
        asked.add(mark);
        const rev = row.rev;
        void port.formMode(hexKey).then(
            (mode) => { modes[hexKey] = { rev, hand: mode === 'hand' }; },
            () => { asked.delete(mark); },
        );
    }
    return null;
}

/** A system designed by hand: Generate is offered on it, and says that it replaces it. */
export function isHandHex(hexKey: string): boolean {
    return handMode(hexKey) === 'hand';
}

// ---- "Design by hand" on a generated or charted system -----------------------------------------

/** The pane says what it means, before anything changes. A system already by hand just opens. */
export async function askDesign(hexKey: string, name: string): Promise<void> {
    const port = ownSectors();
    if (!port || handUi.askBusy) return;
    handUi.askError = '';
    handUi.askBusy = true;
    try {
        const mode = await port.formMode(hexKey);
        if (mode === 'hand') {
            showToast((name || 'This system') + ' is already designed by hand.');
            void openEdit(hexKey, name);
            return;
        }
        handUi.asking = hexKey;
        handUi.askName = name;
    } finally {
        handUi.askBusy = false;
    }
}

export function cancelDesign(): void {
    handUi.asking = '';
    handUi.askName = '';
    handUi.askError = '';
}

/**
 * The engine stops running for this system. The toast's Undo returns the version kept before;
 * a system as charted has no row yet, and is designed on the chart's own (rev 0).
 */
export async function confirmDesign(): Promise<void> {
    const port = ownSectors();
    const store = buildStore();
    const hexKey = handUi.asking;
    const name = handUi.askName;
    if (!port || !store || !hexKey || handUi.askBusy) return;
    const row = store.row(hexKey);
    handUi.askBusy = true;
    handUi.askError = '';
    try {
        const back = await port.designByHand(hexKey, row ? row.rev : 0);
        cancelDesign();
        showToast((name || 'This system') + ' is now designed by hand. Building no longer generates it.', {
            action: {
                label: 'Undo',
                run: () => {
                    // The version before is not by hand: the designer shuts, and Edit opens the form again.
                    if (editing(hexKey)) dropEdit();
                    void back();
                },
            },
        });
        void openEdit(hexKey, name);
    } catch (err) {
        handUi.askError = err instanceof Error && err.message ? err.message : 'Design by hand failed. Try again.';
    } finally {
        handUi.askBusy = false;
    }
}

// ---- a profile roll (contracts/b_builder.md "Hand: roll a profile") ---------------------------------

/** The draft's roll id for a body's profile. It is not a row of the form. */
export function profileRollId(id: string): string {
    return id + '.profile.roll';
}

/**
 * Why the roll cannot run for this body, or what it does not fill, as one plain sentence; empty
 * when it fills every cell. `blocked` is true when the button cannot do anything.
 */
export function rollNote(id: string): { text: string; blocked: boolean } {
    const handle = draftHandle.value;
    const node = handNodes().find((item) => item.id === id);
    if (!handle || !node || node.kind === 'star') return { text: '', blocked: true };
    if (handle.form.value.edition !== 'MgT2E') return { text: 'Roll profile works on MgT2E systems only.', blocked: true };
    if (node.kind === 'moon') return { text: 'A roll doesn’t fill a moon’s profile.', blocked: true };
    if (node.kind === 'gas') return { text: 'A roll doesn’t fill a gas giant’s profile.', blocked: false };
    if (node.mainworld) return { text: 'On the mainworld, a roll fills only size, atmosphere, and hydrographics.', blocked: false };
    return { text: '', blocked: false };
}

export function canRollProfile(id: string): boolean {
    return !busy() && handUi.rolling === '' && !rollNote(id).blocked;
}

/** Roll one body's profile into the draft: the cells fill when the answer arrives; Keep stores them, Discard drops them. */
export function rollProfile(id: string): void {
    if (!canRollProfile(id)) return;
    handUi.rolling = id;
    rollField(profileRollId(id));
}
