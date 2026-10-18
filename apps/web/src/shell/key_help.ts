/**
 * Keyboard help from the registry (streams/D.md DU13; UX backlog U13; the manifesto's Extendability).
 * The keys are never listed by hand: the sheet and the palette read what the registry holds now, so a
 * command registered with a key (Q, the quick note) shows up without anyone writing it down. A key is
 * said as a person presses it; commands are grouped by where they belong. Pure.
 */
import type { Command } from './registry.ts';

/** One key as it is pressed: "Q", "Shift+W", "Space", "Esc", "Ctrl+K". */
export function keyWords(key: string): string {
    if (key === ' ') return 'Space';
    if (key === 'Escape') return 'Esc';
    if (key.includes('+') && key.length > 1) return key;
    if (key.length === 1 && /[A-Z]/.test(key)) return 'Shift+' + key;
    if (key.length === 1) return key.toUpperCase();
    return key;
}

/** A command's keys, said: "K or Ctrl+Enter"; empty when it has none. Letters typed both ways count once. */
export function keysWords(keys: readonly string[] | undefined): string {
    if (!keys || !keys.length) return '';
    const said: string[] = [];
    for (const key of keys) {
        // "t" and "T" are one key to a person: say the plain one.
        if (key.length === 1 && /[A-Z]/.test(key) && keys.includes(key.toLowerCase())) continue;
        const words = keyWords(key);
        if (!said.includes(words)) said.push(words);
    }
    return said.join(' or ');
}

export type KeyGroup = { title: string; rows: { name: string; keys: string; on: boolean }[] };

const GROUPS: { title: string; test: (id: string) => boolean }[] = [
    { title: 'Build', test: (id) => id.startsWith('build') },
    { title: 'Orbit view', test: (id) => id.startsWith('orbit-') },
    { title: 'Everywhere', test: () => true },
];

/** Every registered command with a key, grouped, in the order registered; `on` is whether it can run now. */
export function keyGroups(commands: readonly Command[]): KeyGroup[] {
    const groups: KeyGroup[] = GROUPS.map((group) => ({ title: group.title, rows: [] }));
    const seen = new Set<string>();
    for (const command of commands) {
        const keys = keysWords(command.keys);
        if (!keys || seen.has(command.id)) continue;
        seen.add(command.id);
        const at = GROUPS.findIndex((group) => group.test(command.id));
        groups[at].rows.push({ name: command.name, keys, on: command.runnable ? command.runnable() : true });
    }
    return groups.filter((group) => group.rows.length > 0);
}
