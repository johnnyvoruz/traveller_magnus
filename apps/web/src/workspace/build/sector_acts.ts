/**
 * The acts on a sector of the referee's own, and on an empty slot (findings/builder_system_design.md
 * §15 and §16): New sector, Rename, Move, Delete, and a subsector's name. Each is one function,
 * run by a registered command and its button alike; each ends in the one toast with Undo, and
 * none asks first. What is selected (`sectorUi.at`) is set by the map view from the address.
 */
import { reactive } from 'vue';
import { showToast } from '../../shell/toast.ts';
import { ownSectors, type SectorUndoToken, type Slot } from './seam.ts';
import { cleanName, NAME_MAX, sameSlot, subsectorOwnName } from './sectors.ts';
import { plural } from './state.ts';

export type SectorAt =
    | { kind: 'slot'; slot: Slot }
    /** `letter` null is the sector itself. */
    | { kind: 'own'; id: string; letter: string | null };

/** What the acts ask of the map view: where to go afterwards, and what a sector holds. */
export type SectorNav = {
    openSector: (id: string, letter: string | null) => void;
    openSlot: (slot: Slot) => void;
    /** How many systems of the referee's the sector holds, as far as the map has read them. */
    systems: (id: string) => number;
    /** Whether a slot is free: nothing charted there and no sector of the referee's. */
    free: (slot: Slot) => boolean;
};

export const sectorUi = reactive({
    at: null as SectorAt | null,
    /** The name box of an empty slot. */
    name: '',
    /** The pane's title is a box. */
    renaming: false,
    /** The sector being moved; the chart offers the empty slots. */
    moving: '',
    /** The slot the keyboard is on while moving. */
    cursor: null as Slot | null,
    busy: false,
    error: '',
    /** Where the selected slot is, in words; said under the pane's title. */
    where: '',
    /** Goes up when the name box should take focus. */
    focusName: 0,
});

let nav: SectorNav | null = null;

export function setSectorNav(source: SectorNav | null): void {
    nav = source;
}

/** The address changed: what is selected changes, and anything half done there is dropped. */
export function setSectorAt(at: SectorAt | null): void {
    const before = sectorUi.at;
    const same = before !== null && at !== null && before.kind === at.kind
        && (before.kind === 'slot' && at.kind === 'slot' ? sameSlot(before.slot, at.slot) : before.kind === 'own' && at.kind === 'own' && before.id === at.id && before.letter === at.letter);
    sectorUi.at = at;
    if (same) return;
    sectorUi.renaming = false;
    sectorUi.error = '';
    if (!at || at.kind !== 'slot') sectorUi.name = '';
    if (sectorUi.moving && !(at && at.kind === 'own' && at.id === sectorUi.moving)) cancelMove();
}

export function ownAt(): { id: string; letter: string | null } | null {
    return sectorUi.at && sectorUi.at.kind === 'own' ? sectorUi.at : null;
}

/** The name the pane shows for what is selected, or empty when it has none. */
export function nameAt(): string {
    const store = ownSectors();
    const at = ownAt();
    const sector = store && at ? store.get(at.id) : null;
    if (!sector || !at) return '';
    return at.letter === null ? sector.name : subsectorOwnName(sector, at.letter);
}

function fail(err: unknown): void {
    sectorUi.error = err instanceof Error && err.message ? err.message : 'That did not work.';
}

/** An Undo that could not be done says so where it was pressed: the pane may be showing something else by then. */
function sayFail(err: unknown): void {
    showToast(err instanceof Error && err.message ? err.message : 'That could not be undone.');
}

function offerUndo(message: string, token: SectorUndoToken, after?: () => void): void {
    showToast(message, {
        action: {
            label: 'Undo',
            run: () => {
                const store = ownSectors();
                if (!store) return;
                void store.undo(token).then(() => { if (after) after(); }, sayFail);
            },
        },
    });
}

async function run<T>(act: () => Promise<T>): Promise<T | null> {
    if (sectorUi.busy) return null;
    sectorUi.busy = true;
    sectorUi.error = '';
    try {
        return await act();
    } catch (err) {
        fail(err);
        return null;
    } finally {
        sectorUi.busy = false;
    }
}

// ---- New sector ---------------------------------------------------------------------------------

export function canNewSector(): boolean {
    return sectorUi.at !== null && sectorUi.at.kind === 'slot' && !sectorUi.busy && ownSectors() !== null;
}

/** With no name typed, the name box takes focus and nothing is made. */
export async function newSector(): Promise<void> {
    const store = ownSectors();
    const at = sectorUi.at;
    if (!store || !at || at.kind !== 'slot') return;
    const name = cleanName(sectorUi.name);
    if (!name) {
        sectorUi.error = sectorUi.name.trim() ? 'A name holds at most ' + NAME_MAX + ' characters.' : '';
        sectorUi.focusName += 1;
        return;
    }
    const slot = at.slot;
    const made = await run(() => store.make(name, slot));
    if (!made) return;
    sectorUi.name = '';
    if (nav) nav.openSector(made.id, null);
    showToast('Made the sector ' + made.name + '.', {
        action: {
            label: 'Undo',
            run: () => {
                void store.remove(made.id).then(() => { if (nav) nav.openSlot(slot); }, sayFail);
            },
        },
    });
}

// ---- Rename: the sector, or one of its sixteen subsectors ---------------------------------------

export function canRename(): boolean {
    return ownAt() !== null && !sectorUi.busy && !sectorUi.moving;
}

export function startRename(): void {
    if (canRename()) sectorUi.renaming = true;
}

export function cancelRename(): void {
    sectorUi.renaming = false;
    sectorUi.error = '';
}

/** Enter in the title box. A sector must have a name; a subsector's may be emptied, which clears it. */
export async function commitRename(text: string): Promise<void> {
    const store = ownSectors();
    const at = ownAt();
    if (!store || !at) return;
    const before = nameAt();
    const typed = text.replace(/\s+/g, ' ').trim();
    if (typed === before) {
        cancelRename();
        return;
    }
    if (typed.length > NAME_MAX) {
        sectorUi.error = 'A name holds at most ' + NAME_MAX + ' characters.';
        return;
    }
    if (at.letter === null && !typed) {
        sectorUi.error = 'A sector has a name.';
        return;
    }
    const letter = at.letter;
    const token = await run(() => (letter === null ? store.rename(at.id, typed) : store.renameSubsector(at.id, letter, typed)));
    if (!token) return;
    sectorUi.renaming = false;
    const what = letter === null ? 'the sector' : 'subsector ' + letter;
    offerUndo(typed ? 'Renamed ' + what + ' to ' + typed + '.' : 'Cleared the name of ' + what + '.', token);
}

// ---- Move ---------------------------------------------------------------------------------------

export function canMove(): boolean {
    const at = ownAt();
    return at !== null && at.letter === null && !sectorUi.busy;
}

export function startMove(): void {
    const store = ownSectors();
    const at = ownAt();
    if (!store || !at || !canMove()) return;
    const sector = store.get(at.id);
    if (!sector) return;
    sectorUi.renaming = false;
    sectorUi.error = '';
    sectorUi.moving = at.id;
    sectorUi.cursor = { ...sector.slot };
}

export function cancelMove(): void {
    sectorUi.moving = '';
    sectorUi.cursor = null;
}

/** The keyboard's slot while moving, one step. */
export function stepCursor(dx: number, dy: number): void {
    if (!sectorUi.moving || !sectorUi.cursor) return;
    sectorUi.cursor = { x: sectorUi.cursor.x + dx, y: sectorUi.cursor.y + dy };
}

export async function moveTo(slot: Slot): Promise<void> {
    const store = ownSectors();
    const id = sectorUi.moving;
    const sector = store && id ? store.get(id) : null;
    if (!store || !sector) return;
    if (sameSlot(sector.slot, slot)) {
        cancelMove();
        return;
    }
    if (nav && !nav.free(slot)) {
        sectorUi.error = 'That slot is taken. Pick an empty one.';
        return;
    }
    const token = await run(() => store.move(id, slot));
    if (!token) return;
    cancelMove();
    if (nav) nav.openSector(id, null);
    offerUndo('Moved ' + sector.name + '. Its hexes and names went with it.', token, () => { if (nav) nav.openSector(id, null); });
}

// ---- Delete -------------------------------------------------------------------------------------

export function canDelete(): boolean {
    return canMove() && !sectorUi.moving;
}

/** What Delete takes with it, said before it is pressed. */
export function deleteWords(): string {
    const at = ownAt();
    const count = at && nav ? nav.systems(at.id) : 0;
    const goes = count > 0 ? 'Its ' + plural(count, 'system goes', 'systems go') + ' with it. ' : '';
    return goes + 'A copy is kept; Undo puts it all back.';
}

export async function deleteSector(): Promise<void> {
    const store = ownSectors();
    const at = ownAt();
    if (!store || !at || !canDelete()) return;
    const sector = store.get(at.id);
    if (!sector) return;
    const count = nav ? nav.systems(sector.id) : 0;
    const token = await run(() => store.remove(sector.id));
    if (!token) return;
    if (nav) nav.openSlot(sector.slot);
    const held = count > 0 ? ' and its ' + plural(count, 'system', 'systems') : '';
    offerUndo('Deleted ' + sector.name + held + '. A copy is kept.', token, () => { if (nav) nav.openSector(sector.id, null); });
}
