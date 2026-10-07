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

/** The header's three control drawers (slice 2 follow-up 6; findings/orbit_drawers_design.md). */
export type DrawerId = 'time' | 'view' | 'layers';
export const DRAWERS: readonly { id: DrawerId; command: string; label: string; key: string; icon: 'clock' | 'bullseye' | 'layer-group'; help: string }[] = [
    { id: 'time', command: 'orbit-date', label: 'Time', key: 't', icon: 'clock', help: 'the Time drawer: the date fields, back 1 week and 1 week, the scrub, the speed, Set as campaign date' },
    { id: 'view', command: 'orbit-drawer-view', label: 'View', key: 'y', icon: 'bullseye', help: 'the View drawer: the layout, Fit, the picture’s scale and ring strength' },
    { id: 'layers', command: 'orbit-drawer-layers', label: 'Layers', key: 'l', icon: 'layer-group', help: 'the Layers drawer: show or hide each layer' },
];

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
    { id: 'orbit-week', name: 'Advance 1 week', keys: ['w'], help: 'a week on (and the campaign date, when the view is on it)' },
    { id: 'orbit-week-back', name: 'Back 1 week', keys: ['W'], help: 'a week back (and the campaign date, when the view is on it)' },
    { id: 'orbit-scrub', name: 'Scrub time', keys: ['s'], help: 'to the scrub (in the Time drawer): Left and Right a day, Shift an hour, hold an end to shuttle' },
    { id: 'orbit-speed', name: 'Simulation speed', keys: ['v'], help: 'to the speed slider (in the Time drawer); Left and Right change it' },
    { id: 'orbit-slower', name: 'Slower', keys: ['['], help: 'the clock a step slower' },
    { id: 'orbit-faster', name: 'Faster', keys: [']'], help: 'the clock a step faster' },
    { id: 'orbit-date', name: 'Time drawer', keys: ['t', 'T'], help: DRAWERS[0].help },
    { id: 'orbit-drawer-view', name: 'View drawer', keys: ['y', 'Y'], help: DRAWERS[1].help },
    { id: 'orbit-drawer-layers', name: 'Layers drawer', keys: ['l', 'L'], help: DRAWERS[2].help },
    { id: 'orbit-go-campaign', name: 'Back to the campaign date', keys: ['c'], help: 'the view back to the campaign date (the reset before Play)' },
    { id: 'orbit-set-campaign', name: 'Set as campaign date', keys: ['C'], help: 'the campaign date to the view’s' },
    ...LAYOUTS.map((item) => ({ id: item.id, name: 'Layout: ' + item.label, keys: [item.key], help: 'the ' + item.label.toLowerCase() + ' layout' })),
    ...LAYERS.map((item) => ({ id: item.id, name: 'Show or hide: ' + item.label, keys: [item.hotkey], help: item.label.toLowerCase() + ' on or off' })),
    { id: 'orbit-fit', name: 'Fit the system', keys: ['f'], help: 'fit the whole system' },
    { id: 'orbit-plot', name: 'Plotting mode', keys: ['p', 'P'], help: 'plotting on or off: the hairlines follow the pointer; press a body, or empty space for a point, to set the selected ship’s destination' },
    { id: 'orbit-ship-next', name: 'Select the next ship', keys: ['n', 'N'], help: 'the next ship in this system (a ship’s tag or its mark on the picture selects it too)' },
    { id: 'orbit-add-leg', name: 'Add the plotted course', keys: [], help: 'in the plot card: writes the course’s legs to the ship’s track, and puts the clock on its departure' },
    { id: 'orbit-course-undo', name: 'Remove the last waypoint', keys: [], help: 'in the plot card, and on Escape while plotting' },
    { id: 'orbit-course-clear', name: 'Clear the course', keys: [], help: 'in the plot card: every waypoint goes' },
    { id: 'orbit-plot-estimate', name: 'Return the course’s hours to the estimates', keys: [], help: 'in the plot card: every leg’s hours follow its estimate again' },
    { id: 'orbit-jump-roll', name: 'Roll the jump’s duration again', keys: [], help: 'in the jump preview: a new roll for the hours' },
    { id: 'orbit-jump', name: 'Jump', keys: [], help: 'in the status strip: the selected ship jumps to the marked system, once outside every 100D limit' },
    { id: 'orbit-picture', name: 'Picture: scale and ring strength', keys: [], help: 'in the View drawer' },
    { id: 'orbit-escape', name: 'Back', keys: ['Escape'], help: 'close the drawer, then a popover, then leave the body, then back to the map' },
];

/**
 * Parked (Johnny, 2026-10-06: "hide the line up button for now"). The search, its worker and
 * its tests stay; the control is not drawn, so the command is not registered and is not in
 * the Keys table. To bring it back: move this entry into ORBIT_COMMANDS and set LINEUP_SHOWN.
 */
export const PARKED_COMMANDS: readonly OrbitCommand[] = [
    { id: 'orbit-lineup', name: 'Line up the planets', keys: [], help: 'in the Time drawer: the next time the planets sit on one line' },
];
export const LINEUP_SHOWN = false;

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
    if (spec === 'W') return 'Shift+W';
    if (spec === 'T' || spec === 'Y' || spec === 'L' || spec === 'P' || spec === 'N') return '';
    return spec.length === 1 ? spec.toUpperCase() : spec;
}

/** The layers a toggle command flips. */
export function toggled(layers: Layers, key: LayerToggle): Layers {
    return { ...layers, [key]: !layers[key] };
}
