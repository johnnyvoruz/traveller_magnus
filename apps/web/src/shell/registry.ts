import { offerCampaignCommands } from '../workspace/campaign_command.ts';
import { offerDice } from '../dice/command.ts';
import { offerHelp } from '../workspace/help_command.ts';
import { offerMarketplace, offerMyPackages } from '../workspace/market/command.ts';

export type Command = {
    id: string;
    name: string;
    keys?: string[];
    /**
     * Set while one list has the keyboard. `handleKey` tries that scope before the commands
     * that are always on, so a list's `/` is not the palette's.
     */
    scope?: string;
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
let scopeNow: string | null = null;
let epoch = 0;
const listeners = new Set<() => void>();

function bump(): void {
    epoch += 1;
    for (const hear of listeners) hear();
}

/** The list that has the keyboard, or null. Commands with that scope run before the rest. */
export function setCommandScope(scope: string | null): void {
    if (scopeNow === scope) return;
    scopeNow = scope;
    bump();
}

export function commandScope(): string | null {
    return scopeNow;
}

/** Fires when a command is registered or the scope changes, so the palette can re-read. */
export function onCommandsChanged(hear: () => void): () => void {
    listeners.add(hear);
    return () => { listeners.delete(hear); };
}

export function commandEpoch(): number {
    return epoch;
}

export function registerCommand(command: Command): () => void {
    registered.push(command);
    bump();
    return () => {
        const index = registered.indexOf(command);
        if (index >= 0) registered.splice(index, 1);
        bump();
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
    if (spec === 'Ctrl+Enter') return event.ctrlKey && !event.altKey && event.key === 'Enter';
    return event.key === spec && !event.ctrlKey && !event.altKey && !event.metaKey;
}

/** The active scope first, then the commands that are always on. Another scope stays quiet. */
function ranked(): Command[] {
    const out: Command[] = [];
    if (scopeNow) {
        for (const command of registered) if (command.scope === scopeNow) out.push(command);
    }
    for (const command of registered) if (!command.scope) out.push(command);
    return out;
}

/** Ignores a key typed into a field unless it is Escape or carries Ctrl. */
export function handleKey(event: KeyboardEvent): boolean {
    if (event.defaultPrevented) return false;
    if (typing(event) && event.key !== 'Escape' && !event.ctrlKey) return false;
    for (const command of ranked()) {
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

// The marketplace stub's "My packages" (workspace/market/command.ts), while someone is signed in.
offerMyPackages(registerCommand);
// The marketplace's rail item (workspace/market/command.ts), signed in or out.
offerMarketplace(registerCommand);
// Help (workspace/help_command.ts), signed in or out.
offerHelp(registerCommand);
// The campaign's commands (workspace/campaign_command.ts), while someone is signed in.
offerCampaignCommands(registerCommand);
// The dice roller (dice/command.ts). R is its key only while no other command is using R.
offerDice(registerCommand, () => registered.some((command) =>
    command.id !== 'roll-dice'
    && !!command.keys?.some((key) => key === 'r' || key === 'R')
    && (!command.runnable || command.runnable())));
