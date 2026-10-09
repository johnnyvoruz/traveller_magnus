/**
 * The build acts as commands (findings/builder_system_design.md §1): one list, read by the
 * registry (and so the omnibox), the right-click menu and the pane's buttons. `keys` are the
 * hexes acted on: the many-hex selection, else the one hex the map has selected.
 */
import type { FaIconName } from '../../design/icons.ts';
import { generateMany, discardPreview, hexName, hexState, keepPreview, overChart, previewAt, removeHexes, restorable, restoreHexes, rollAgain, stopBuild, tallyOf } from './acts.ts';
import { build, plural, removeTargets } from './state.ts';

export type BuildCommandId =
    | 'build-select' | 'build-generate' | 'build-generate-with' | 'build-keep' | 'build-roll'
    | 'build-discard' | 'build-stop' | 'build-restore' | 'build-remove';

export const BUILD_COMMANDS: readonly { id: BuildCommandId; name: string; keys?: string[] }[] = [
    { id: 'build-select', name: 'Select hexes', keys: ['s'] },
    { id: 'build-generate', name: 'Generate a system', keys: ['g'] },
    { id: 'build-generate-with', name: 'Generate with…', keys: ['G'] },
    { id: 'build-keep', name: 'Keep the preview', keys: ['k'] },
    { id: 'build-roll', name: 'Roll again', keys: ['r'] },
    { id: 'build-discard', name: 'Discard the preview' },
    { id: 'build-stop', name: 'Stop generating', keys: ['x'] },
    { id: 'build-restore', name: 'Restore to the chart' },
    { id: 'build-remove', name: 'Remove from my map', keys: ['Delete'] },
];

/** One hex that Generate can fill: empty, or removed by the builder. */
function fillable(keys: readonly string[]): boolean {
    if (keys.length !== 1) return false;
    const state = hexState(keys[0]);
    return state === 'empty' || state === 'removed';
}

export function canBuild(id: BuildCommandId, keys: readonly string[]): boolean {
    const busy = build.job !== null || build.rolling !== '';
    if (id === 'build-select') return true;
    if (id === 'build-stop') return build.job !== null && build.job.state === 'running';
    if (id === 'build-keep' || id === 'build-roll') return build.preview !== null && !busy;
    if (id === 'build-discard') return build.preview !== null;
    if (busy || keys.length === 0) return false;
    if (id === 'build-generate') {
        if (build.preview) return false;
        return keys.length > 1 ? tallyOf(keys).empty.length > 0 : fillable(keys);
    }
    if (id === 'build-generate-with') return !build.preview && (keys.length > 1 || fillable(keys));
    if (id === 'build-restore') return restorable(keys).length > 0;
    return removeTargets(tallyOf(keys)).length > 0;
}

export function runBuild(id: BuildCommandId, keys: readonly string[]): void {
    if (!canBuild(id, keys)) return;
    if (id === 'build-select') build.selecting = !build.selecting;
    else if (id === 'build-stop') stopBuild();
    else if (id === 'build-keep') void keepPreview();
    else if (id === 'build-roll') rollAgain();
    else if (id === 'build-discard') discardPreview();
    else if (id === 'build-generate') {
        if (keys.length > 1) generateMany(keys);
        else void previewAt(keys[0]);
    } else if (id === 'build-generate-with') build.sheetOpen = true;
    else if (id === 'build-restore') void restoreHexes(keys);
    else void removeHexes(keys);
}

export type BuildMenuItem = {
    id: BuildCommandId | 'build-edit';
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
    }
    if (!many && (state === 'truth' || state === 'override' || state === 'own')) {
        items.push({ id: 'build-edit', label: 'Edit', say: 'Next: editing a system in place', icon: 'pen-to-square', disabled: true });
    }
    if (many || state === 'override') {
        const can = restorable(keys).length;
        if (can > 0) items.push({ id: 'build-restore', label: many ? 'Restore ' + can + ' to the chart' : 'Restore to the chart', icon: 'rotate-left', rule: true });
    }
    if (systems > 0) {
        items.push({
            id: 'build-remove',
            label: many ? 'Remove the ' + plural(systems, 'system', 'systems') : (overChart(keys) ? 'Remove from my map' : 'Remove'),
            icon: 'trash',
            key: 'Del',
            danger: true,
            rule: !items.some((item) => item.rule),
        });
    }
    for (const item of items) if (item.id !== 'build-edit') item.disabled = !canBuild(item.id, keys);
    const hex = keys[0].slice(keys[0].lastIndexOf('/') + 1);
    const title = many ? plural(keys.length, 'hex', 'hexes') : (state === 'empty' || state === 'removed' ? 'Empty hex ' + hex : hexName(keys[0]));
    return { title, items };
}
