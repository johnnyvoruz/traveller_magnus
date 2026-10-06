/**
 * The orbit view's commands (findings/orbit_showpiece_design.md §7): every control on the
 * view is one of these, registered in shell/registry.ts before it is drawn, and names its
 * command with `data-command`. The Keys popover lists this table; nothing there is typed by
 * hand. Pure data.
 */
import type { Layers, Mode } from './picture.ts';

export type LayerToggle = 'paths' | 'moons' | 'habitable' | 'jump' | 'dayNight' | 'scan' | 'markMainworld';

export type OrbitCommand = {
    id: string;
    name: string;
    /** The key specs shell/registry.ts matches (`event.key`); none for a control reached by Tab alone. */
    keys: readonly string[];
    /** The words in the Keys popover. */
    help: string;
};

export const LAYOUTS: readonly { mode: Mode; id: string; label: string; key: string }[] = [
    { mode: 'orbits', id: 'orbit-layout-orbits', label: 'Orbits', key: '1' },
    { mode: 'row', id: 'orbit-layout-row', label: 'Row', key: '2' },
    { mode: 'column', id: 'orbit-layout-column', label: 'Column', key: '3' },
];

export const LAYERS: readonly { key: LayerToggle; id: string; label: string; hotkey: string; title: string }[] = [
    { key: 'paths', id: 'orbit-layer-paths', label: 'Paths', hotkey: '4', title: 'Orbit paths for worlds and moons' },
    { key: 'moons', id: 'orbit-layer-moons', label: 'Moons', hotkey: '5', title: 'Moons and rings around each world' },
    {
        key: 'habitable', id: 'orbit-layer-habitable', label: 'Habitable', hotkey: '6',
        title: 'Habitable zone: green band around the habitable-zone centre. Worlds here can have liquid water. It is a climate band, not a safe-jump line.',
    },
    {
        key: 'jump', id: 'orbit-layer-jump', label: 'Jump limit', hotkey: '7',
        title: 'Blue circle at 100 diameters from a star or world. A jump drive cannot engage inside it, so a ship inside the line has to fly out to the circle first.',
    },
    {
        key: 'dayNight', id: 'orbit-layer-daynight', label: 'Day / night', hotkey: '8',
        title: 'Illustrative lighting facing the host star: the night half of each world, and a moon dimmed in its world’s shadow.',
    },
    {
        key: 'scan', id: 'orbit-layer-scan', label: 'Scan', hotkey: '9',
        title: 'Scan view: sensor outlines and designations on every world and moon, and a slow sweep around the primary.',
    },
    { key: 'markMainworld', id: 'orbit-layer-mainworld', label: 'Mainworld', hotkey: '0', title: 'The cyan star that marks the mainworld' },
];

/** The commands in the order the Keys popover lists them. */
export const ORBIT_COMMANDS: readonly OrbitCommand[] = [
    { id: 'orbit-play', name: 'Play or pause', keys: [' '], help: 'play or pause' },
    { id: 'orbit-week', name: 'Advance 1 week', keys: ['w', 'W'], help: 'a week on (and the campaign date, when the view is on it)' },
    { id: 'orbit-scrub', name: 'Scrub time', keys: ['s'], help: 'to the scrub: Left and Right a day, Shift an hour, hold an end to shuttle' },
    { id: 'orbit-speed', name: 'Simulation speed', keys: ['v'], help: 'to the speed slider; Left and Right change it' },
    { id: 'orbit-date', name: 'Set the date', keys: ['t'], help: 'the date fields' },
    { id: 'orbit-go-campaign', name: 'Go to the campaign date', keys: ['c'], help: 'the view to the campaign date' },
    { id: 'orbit-set-campaign', name: 'Set as campaign date', keys: ['C'], help: 'the campaign date to the view’s' },
    ...LAYOUTS.map((item) => ({ id: item.id, name: 'Layout: ' + item.label, keys: [item.key], help: 'the ' + item.label.toLowerCase() + ' layout' })),
    ...LAYERS.map((item) => ({ id: item.id, name: 'Show or hide: ' + item.label, keys: [item.hotkey], help: item.label.toLowerCase() + ' on or off' })),
    { id: 'orbit-fit', name: 'Fit the system', keys: ['f'], help: 'fit the whole system' },
    { id: 'orbit-lineup', name: 'Line up the planets', keys: [], help: 'in More tools: the next time the planets sit on one line' },
    { id: 'orbit-picture', name: 'Picture: scale and ring strength', keys: [], help: 'in More tools' },
    { id: 'orbit-escape', name: 'Back', keys: ['Escape'], help: 'close, then leave the body, then back to the map' },
];

/** What the mouse does, for the Keys popover; not commands. */
export const MOUSE_HELP: readonly [string, string][] = [
    ['Tab', 'walk the body chips; Enter selects'],
    ['Wheel', 'zoom toward the pointer'],
    ['Drag', 'move the view'],
    ['Click', 'select a body and follow it'],
    ['Double-click', 'frame a body and its moons; on empty space, fit the system'],
];

/** The key as the Keys popover shows it. */
export function keyWords(spec: string): string {
    if (spec === ' ') return 'Space';
    if (spec === 'C') return 'Shift+C';
    if (spec === 'W') return '';
    return spec.length === 1 ? spec.toUpperCase() : spec;
}

/** The layers a toggle command flips. */
export function toggled(layers: Layers, key: LayerToggle): Layers {
    return { ...layers, [key]: !layers[key] };
}
