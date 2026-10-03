export type Command = {
    id: string;
    name: string;
    keys?: string[];
    run: () => void;
};

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
            event.preventDefault();
            command.run();
            return true;
        }
    }
    return false;
}
