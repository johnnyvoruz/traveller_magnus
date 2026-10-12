/**
 * The build acts as commands (findings/builder_system_design.md §1): one list, read by the
 * registry (and so the omnibox), the right-click menu and the pane's buttons. `keys` are the
 * hexes acted on: the many-hex selection, else the one hex the map has selected.
 */
import type { FaIconName } from '../../design/icons.ts';
import { generateMany, discardPreview, hexName, hexState, keepPreview, overChart, previewAt, removeHexes, restorable, restoreHexes, rollAgain, stopBuild, tallyOf } from './acts.ts';
import { discardEdit, edit, editDirty, holdLeaving, keepEdit, openBlank, openEdit, draftHandle } from './edit.ts';
import { handUi } from './hand.ts';
import { addBody, askDesign, canAdd, canMainworld, canMoveBody, canRemoveBody, canRollProfile, handMode, isHandHex, makeMainworld, moveBody, removeBody, rollProfile } from './hand_acts.ts';
import { canDelete, canMove, canNewSector, canRename, deleteSector, newSector, startMove, startRename } from './sector_acts.ts';
import { askSectorName, inEmptySlot } from './grow_acts.ts';
import { canPickSelected, openPicker } from './orbit_pick.ts';
import { canPublish, kindOfKeys, openPublish, signedIn } from '../market/market.ts';
import { build, JOB_HOLD, plural, removeTargets } from './state.ts';

export type BuildCommandId =
    | 'build-select' | 'build-generate' | 'build-generate-with' | 'build-keep' | 'build-roll'
    | 'build-discard' | 'build-stop' | 'build-restore' | 'build-remove'
    | 'build-edit' | 'build-draft-keep' | 'build-draft-discard' | 'build-blank'
    | 'build-sector-new' | 'build-sector-rename' | 'build-sector-move' | 'build-sector-delete'
    | 'build-design-hand' | 'build-add-star' | 'build-add-world' | 'build-add-gas' | 'build-add-belt' | 'build-add-moon'
    | 'build-body-up' | 'build-body-down' | 'build-body-mainworld' | 'build-body-remove' | 'build-body-orbit' | 'build-publish' | 'build-body-roll';

export const BUILD_COMMANDS: readonly { id: BuildCommandId; name: string; keys?: string[] }[] = [
    { id: 'build-select', name: 'Select hexes', keys: ['s'] },
    { id: 'build-generate', name: 'Generate a system', keys: ['g'] },
    { id: 'build-generate-with', name: 'Generate with…', keys: ['G'] },
    // One Keep: the preview, or the draft, whichever is open (Ctrl+Enter for the draft as before; K too).
    { id: 'build-keep', name: 'Keep', keys: ['k', 'Ctrl+Enter'] },
    { id: 'build-roll', name: 'Roll again', keys: ['r'] },
    { id: 'build-discard', name: 'Discard the preview' },
    { id: 'build-stop', name: 'Stop generating', keys: ['x'] },
    { id: 'build-restore', name: 'Restore to the chart' },
    { id: 'build-remove', name: 'Remove', keys: ['Delete'] },
    { id: 'build-edit', name: 'Edit this system', keys: ['e'] },
    { id: 'build-draft-discard', name: 'Discard the draft' },
    { id: 'build-blank', name: 'Blank system' },
    // Step 3: a sector of the referee's own, and a system designed by hand.
    { id: 'build-sector-new', name: 'New sector', keys: ['n'] },
    { id: 'build-sector-rename', name: 'Rename the sector or subsector', keys: ['F2'] },
    { id: 'build-sector-move', name: 'Move the sector…' },
    { id: 'build-sector-delete', name: 'Delete the sector' },
    { id: 'build-design-hand', name: 'Design by hand…' },
    { id: 'build-add-star', name: 'Add star' },
    { id: 'build-add-world', name: 'Add world' },
    { id: 'build-add-gas', name: 'Add gas giant' },
    { id: 'build-add-belt', name: 'Add belt' },
    { id: 'build-add-moon', name: 'Add moon' },
    { id: 'build-body-up', name: 'Move the selected body up' },
    { id: 'build-body-down', name: 'Move the selected body down' },
    { id: 'build-body-mainworld', name: 'Make the selected body the mainworld' },
    { id: 'build-body-remove', name: 'Remove the selected body' },
    { id: 'build-body-orbit', name: 'Pick the orbit of the selected body' },
    { id: 'build-publish', name: 'Publish selection…' },
    { id: 'build-body-roll', name: 'Roll profile' },
];

const ADD_KIND = {
    'build-add-star': 'star',
    'build-add-world': 'world',
    'build-add-gas': 'gas',
    'build-add-belt': 'belt',
    'build-add-moon': 'moon',
} as const;

function isAdd(id: BuildCommandId): id is keyof typeof ADD_KIND {
    return id in ADD_KIND;
}

/** One system, as charted or the builder's own. */
function editable(keys: readonly string[]): boolean {
    if (keys.length !== 1) return false;
    const state = hexState(keys[0]);
    return state === 'truth' || state === 'override' || state === 'own';
}

/** One hex that Generate can fill: empty, or removed by the builder. */
function fillable(keys: readonly string[]): boolean {
    if (keys.length !== 1) return false;
    const state = hexState(keys[0]);
    return state === 'empty' || state === 'removed';
}

/** One system designed by hand: Generate replaces it, with the preview first and Undo after (ruling 5 of 2026-10-10). */
function replaceable(keys: readonly string[]): boolean {
    return keys.length === 1 && isHandHex(keys[0]);
}

export function canBuild(id: BuildCommandId, keys: readonly string[]): boolean {
    const busy = build.job !== null || build.rolling !== '';
    // A sector's acts answer to what the address selects, not to hexes.
    if (id === 'build-sector-new') return canNewSector();
    if (id === 'build-sector-rename') return canRename();
    if (id === 'build-sector-move') return canMove();
    if (id === 'build-sector-delete') return canDelete();
    // The designer's acts answer to the open draft and the body selected in it.
    if (isAdd(id)) return canAdd(ADD_KIND[id]);
    if (id === 'build-body-up') return canMoveBody(handUi.selected, -1);
    if (id === 'build-body-down') return canMoveBody(handUi.selected, 1);
    if (id === 'build-body-mainworld') return canMainworld(handUi.selected);
    if (id === 'build-body-remove') return canRemoveBody(handUi.selected);
    if (id === 'build-body-orbit') return canPickSelected();
    if (id === 'build-body-roll') return edit.mode === 'hand' && canRollProfile(handUi.selected);
    // One system or many hexes; not over an open draft or preview, which would publish what is not kept.
    if (id === 'build-publish') return signedIn() && draftHandle.value === null && !edit.opening && !build.preview && canPublish(keys, hexState);
    if (id === 'build-draft-keep') return editDirty() && !edit.keeping && handUi.removing === null;
    if (id === 'build-draft-discard') return draftHandle.value !== null && !edit.keeping;
    // While a draft is open nothing else acts on the map: the draft is kept or discarded first.
    if (draftHandle.value !== null || edit.opening) return false;
    if (id === 'build-edit') return !busy && !build.preview && editable(keys);
    // A system already by hand is not designed again: it offers Generate in that place.
    if (id === 'build-design-hand') return !busy && !build.preview && editable(keys) && !replaceable(keys);
    // A blank system needs a sector to stand in: a hex in an empty slot is generated, which makes the sector first.
    if (id === 'build-blank') return !busy && !build.preview && keys.length === 1 && hexState(keys[0]) === 'empty' && !inEmptySlot(keys);
    if (id === 'build-select') return true;
    if (id === 'build-stop') return build.job !== null && build.job.state === 'running';
    if (id === 'build-keep') return (build.preview !== null && !busy) || canBuild('build-draft-keep', keys);
    if (id === 'build-roll') return build.preview !== null && !busy;
    if (id === 'build-discard') return build.preview !== null;
    if (busy || keys.length === 0) return false;
    if (id === 'build-generate') {
        if (build.preview) return false;
        return keys.length > 1 ? tallyOf(keys).empty.length > 0 : fillable(keys) || replaceable(keys);
    }
    if (id === 'build-generate-with') return !build.preview && (keys.length > 1 || fillable(keys));
    if (id === 'build-restore') return restorable(keys).length > 0;
    return removeTargets(tallyOf(keys)).length > 0;
}

export function runBuild(id: BuildCommandId, keys: readonly string[]): void {
    if (!canBuild(id, keys)) return;
    if (id === 'build-sector-new') void newSector();
    else if (id === 'build-sector-rename') startRename();
    else if (id === 'build-sector-move') startMove();
    else if (id === 'build-sector-delete') void deleteSector();
    else if (isAdd(id)) addBody(ADD_KIND[id]);
    else if (id === 'build-body-up') moveBody(handUi.selected, -1);
    else if (id === 'build-body-down') moveBody(handUi.selected, 1);
    else if (id === 'build-body-mainworld') makeMainworld(handUi.selected);
    else if (id === 'build-body-remove') removeBody(handUi.selected);
    else if (id === 'build-body-orbit') openPicker(handUi.selected);
    else if (id === 'build-body-roll') rollProfile(handUi.selected);
    else if (id === 'build-publish') openPublish(kindOfKeys(keys));
    else if (id === 'build-design-hand') void askDesign(keys[0], hexName(keys[0]));
    else if (id === 'build-draft-keep') void keepEdit();
    else if (id === 'build-draft-discard') {
        if (!holdLeaving(() => { /* the editor is already closed */ }, false)) discardEdit();
    } else if (id === 'build-edit') void openEdit(keys[0], hexName(keys[0]));
    else if (id === 'build-blank') void openBlank(keys[0]);
    else if (id === 'build-select') build.selecting = !build.selecting;
    else if (id === 'build-stop') stopBuild();
    else if (id === 'build-keep') void (build.preview ? keepPreview() : keepEdit());
    else if (id === 'build-roll') rollAgain();
    else if (id === 'build-discard') discardPreview();
    else if (id === 'build-generate') {
        // In an empty slot the sector is made first, and it needs a name: the pane asks for it.
        if (inEmptySlot(keys)) askSectorName(keys);
        else if (keys.length > 1) generateMany(keys);
        else void previewAt(keys[0]);
    } else if (id === 'build-generate-with') build.sheetOpen = true;
    else if (id === 'build-restore') void restoreHexes(keys);
    else void removeHexes(keys);
}

export type BuildMenuItem = {
    id: BuildCommandId;
    label: string;
    say?: string;
    icon: FaIconName;
    key?: string;
    danger?: boolean;
    disabled?: boolean;
    rule?: boolean;
};

/** The right-click menu for the hexes acted on: every act that applies, the ones that cannot run greyed. */
export function menuFor(keys: readonly string[]): { title: string; items: BuildMenuItem[] } {
    const many = keys.length > 1;
    const count = tallyOf(keys);
    const systems = removeTargets(count).length;
    const state = many ? null : hexState(keys[0]);
    const items: BuildMenuItem[] = [];
    let checking = -1;
    if (build.preview && !many && build.preview.hexKey === keys[0]) {
        items.push({ id: 'build-keep', label: 'Keep', icon: 'check', key: 'K' });
        items.push({ id: 'build-roll', label: 'Roll again', icon: 'wand-magic-sparkles', key: 'R' });
        items.push({ id: 'build-discard', label: 'Discard', icon: 'xmark' });
        return { title: 'Preview · ' + hexName(keys[0]), items };
    }
    if (many || state === 'empty' || state === 'removed') {
        if (state === 'removed') items.push({ id: 'build-restore', label: 'Restore to the chart', icon: 'rotate-left' });
        items.push({
            id: 'build-generate',
            label: many ? 'Generate the ' + plural(count.empty.length, 'empty hex', 'empty hexes') : 'Generate a system',
            icon: 'wand-magic-sparkles',
            key: 'G',
        });
        items.push({ id: 'build-generate-with', label: 'Generate with…', icon: 'sliders', key: 'Shift+G' });
        if (state === 'empty') items.push({ id: 'build-blank', label: 'Blank system', icon: 'plus' });
    }
    if (!many && (state === 'truth' || state === 'override' || state === 'own')) {
        items.push({ id: 'build-edit', label: 'Edit', icon: 'pen-to-square', key: 'E' });
        // Until the server has said whether the system is by hand, a muted "Checking…" holds the line, so Remove
        // never moves. All three are one line high: the preview says that keeping replaces a hand system.
        const mode = handMode(keys[0]);
        if (mode === 'hand') items.push({ id: 'build-generate', label: 'Generate a system', icon: 'wand-magic-sparkles', key: 'G' });
        else if (mode === 'generated') items.push({ id: 'build-design-hand', label: 'Design by hand…', icon: 'draw-polygon' });
        else checking = items.push({ id: 'build-design-hand', label: 'Checking…', icon: 'circle-dashed' }) - 1;
    }
    if (many || state === 'override') {
        const can = restorable(keys).length;
        if (can > 0) items.push({ id: 'build-restore', label: many ? 'Restore ' + can + ' to the chart' : 'Restore to the chart', icon: 'rotate-left', rule: true });
    }
    if (systems > 0) {
        items.push({
            id: 'build-remove',
            label: many ? 'Remove the ' + plural(systems, 'system', 'systems') : 'Remove',
            ...(overChart(keys) ? { say: 'Empties the hex on your map. The chart doesn’t change' } : {}),
            icon: 'trash',
            key: 'Del',
            danger: true,
            rule: !items.some((item) => item.rule),
        });
    }
    for (const item of items) item.disabled = !canBuild(item.id, keys);
    if (checking >= 0) items[checking].disabled = true;
    // While a job writes the map, the acts that write are held: said once, on the first of them.
    const held = build.job ? items.find((item) => item.disabled) : undefined;
    if (held) held.say = JOB_HOLD;
    const hex = keys[0].slice(keys[0].lastIndexOf('/') + 1);
    const title = many ? plural(keys.length, 'hex', 'hexes') : (state === 'empty' || state === 'removed' ? 'Empty hex ' + hex : hexName(keys[0]));
    return { title, items };
}
