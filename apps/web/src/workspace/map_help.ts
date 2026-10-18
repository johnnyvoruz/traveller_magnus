/**
 * The map's own help, in place (streams/D.md DU36; UX backlog U36): a "?" at the map's corner that
 * lays the map's gestures over it. It opens by itself once, then never again: after a first visit's
 * line of help has ended (first_visit.ts), when nothing covers the map. Every line is what the code
 * does today: map/input.ts (drag, wheel, pinch, arrows, + and −), the Home command, a click and a
 * double click in views/MapView.vue, and Build's pointer and keys (build/pointer.ts, build/commands.ts,
 * the neighbour keys in MapView). Pure: it runs under Node.
 */

/** Set once the help has been seen, by itself or from "?". */
export const HELP_KEY = 'voyage_map_help_seen';

/** One line: the keys or the gesture, and what it does. */
export type HelpLine = { keys: string[]; does: string };
export type HelpGroup = { title: string; lines: HelpLine[] };

/** With a mouse and keys. */
export const POINTER_HELP: HelpGroup[] = [
    {
        title: 'The map',
        lines: [
            { keys: ['Drag'], does: 'Move the map.' },
            { keys: ['Wheel'], does: 'Zoom in or out where the pointer is.' },
            { keys: ['←', '↑', '→', '↓'], does: 'Move the map.' },
            { keys: ['+', '-'], does: 'Zoom in or out.' },
            { keys: ['Home'], does: 'Go to the home view.' },
        ],
    },
    {
        title: 'Worlds',
        lines: [
            { keys: ['Click'], does: 'Open the system in a hex.' },
            { keys: ['Double-click'], does: 'Open a system in the orbit view.' },
        ],
    },
];

/** Build's, shown to someone who can turn Build on. */
export const POINTER_BUILD: HelpGroup = {
    title: 'With Build on',
    lines: [
        { keys: ['S'], does: 'Turn Select hexes on or off.' },
        { keys: ['Shift+drag'], does: 'Select hexes. Alt+Shift+drag takes them away.' },
        { keys: ['Space+drag'], does: 'Move the map while Select hexes is on.' },
        { keys: ['U', 'I', 'O', 'N', 'M', ','], does: 'Step from the selected hex to the next one. With Shift, add it.' },
        { keys: ['Right-click'], does: 'The menu for a hex, or for the selection.' },
    ],
};

/** On a touch screen. */
export const TOUCH_HELP: HelpGroup[] = [
    {
        title: 'The map',
        lines: [
            { keys: ['Drag'], does: 'Move the map.' },
            { keys: ['Pinch'], does: 'Zoom in or out.' },
            { keys: ['Tap'], does: 'Open the system in a hex.' },
        ],
    },
];

export const TOUCH_BUILD: HelpGroup = {
    title: 'With Build on',
    lines: [{ keys: ['Drag'], does: 'With Select hexes on, select hexes. Two fingers still move the map.' }],
};

/**
 * The help opens by itself only once: not seen yet, a first visit's line of help has ended, the
 * chart is drawn, and no pane or Build covers the map.
 */
export function helpDue(at: { seen: boolean; hintDone: boolean; chartReady: boolean; paneOpen: boolean; buildOn: boolean }): boolean {
    return !at.seen && at.hintDone && at.chartReady && !at.paneOpen && !at.buildOn;
}
