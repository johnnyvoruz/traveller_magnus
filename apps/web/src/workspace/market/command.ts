/**
 * "My packages" in the command palette, offered only while someone is signed in
 * (findings/marketplace_screens_design.md 3), and "Marketplace", the rail item, offered to
 * everyone. The lines that call these are in shell/registry.ts; the account menu's entry
 * reaches the same My packages address.
 */
import { watch } from 'vue';
import { session } from '../../account/session.ts';
import type { Command } from '../../shell/registry.ts';

export const MY_PACKAGES_PATH = '/packages?mine=1';
export const MARKETPLACE_PATH = '/packages';

function go(path: string): void {
    // Imported when run, not when the registry loads: the router imports the views that import the registry.
    void import('../../router.ts').then((mod) => mod.router.push(path));
}

export function offerMarketplace(register: (command: Command) => () => void): void {
    register({ id: 'marketplace', name: 'Marketplace', run: () => go(MARKETPLACE_PATH) });
}

export function offerMyPackages(register: (command: Command) => () => void): void {
    let remove: (() => void) | null = null;
    watch(() => session.user !== null, (signedIn) => {
        if (remove) remove();
        remove = signedIn ? register({ id: 'my-packages', name: 'My packages', run: () => go(MY_PACKAGES_PATH) }) : null;
    }, { immediate: true });
}