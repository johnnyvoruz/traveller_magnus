export type Command = {
    id: string;
    name: string;
    keys?: string[];
    /** Absent means the command can always run. The rail disables an item while this is false. */
    runnable?: () => boolean;
    run: () => void;
};

export type PanelWorld = { slug: string; hex: string };

/**
 * System panel. An open panel closes. A closed panel opens the selected or
 * last-opened world. With neither, the command is not runnable.
 */
export function systemPanel(state: { panelOpen: boolean; world: PanelWorld | null }):
    { runnable: false } | { runnable: true; kind: 'close' } | { runnable: true; kind: 'open'; slug: string; hex: string } {
    if (state.panelOpen) return { runnable: true, kind: 'close' };
    if (!state.world) return { runnable: false };
    return { runnable: true, kind: 'open', slug: state.world.slug, hex: state.world.hex };
}

const registered: Command[] = [];

export function registerCommand(command: Command): () => void {
    registered.push(command);
    return () => {
        const index = registered.indexOf(command);
        if (index >= 0) registered.splice(index, 1);
    };
}

export function commands(): readonly Command[] {
    return registered;
}

function typing(event: KeyboardEvent): boolean {
    const target = event.target;
    if (!target || typeof target !== 'object') return false;
    const tag = 'tagName' in target ? String(target.tagName) : '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    return 'isContentEditable' in target && target.isContentEditable === true;
}

function matches(event: KeyboardEvent, spec: string): boolean {
    if (spec === 'Ctrl+K') return event.ctrlKey && !event.altKey && (event.key === 'k' || event.key === 'K');
    return event.key === spec && !event.ctrlKey && !event.altKey && !event.metaKey;
}

/** Ignores a key typed into a field unless it is Escape or carries Ctrl. */
export function handleKey(event: KeyboardEvent): boolean {
    if (typing(event) && event.key !== 'Escape' && !event.ctrlKey) return false;
    for (const command of registered) {
        if (!command.keys) continue;
        for (const spec of command.keys) {
            if (!matches(event, spec)) continue;
            if (command.runnable && !command.runnable()) continue;
            event.preventDefault();
            command.run();
            return true;
        }
    }
    return false;
}
