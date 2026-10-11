/**
 * "My packages" in the command palette, offered only while someone is signed in
 * (findings/marketplace_screens_design.md §3). The one line that calls this is in
 * shell/registry.ts; Lane E's account menu entry will reach the same address.
 */
import { watch } from 'vue';
import { session } from '../../account/session.ts';
import type { Command } from '../../shell/registry.ts';

export const MY_PACKAGES_PATH = '/packages';

export function offerMyPackages(register: (command: Command) => () => void): void {
    let remove: (() => void) | null = null;
    watch(() => session.user !== null, (signedIn) => {
        if (remove) remove();
        remove = signedIn
            ? register({
                id: 'my-packages',
                name: 'My packages',
                // Imported when run, not when the registry loads: the router imports the views that import the registry.
                run: () => { void import('../../router.ts').then((mod) => mod.router.push(MY_PACKAGES_PATH)); },
            })
            : null;
    }, { immediate: true });
}
