/**
 * "Help" in the command palette, signed in or out. The line that calls this is in
 * shell/registry.ts. The move goes through shell/go.ts, so this file does not import the router.
 */
import { pushRoute } from '../shell/go.ts';
import type { Command } from '../shell/registry.ts';

export const HELP_PATH = '/help';

function go(path: string): void {
    pushRoute(path);
}

export function offerHelp(register: (command: Command) => () => void): void {
    register({ id: 'help', name: 'Help', run: () => go(HELP_PATH) });
}
