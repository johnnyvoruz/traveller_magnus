/**
 * The route guard that keeps a recovery session on /account (findings/passkey_screens_design.md
 * §4). It routes on `session.gate` (account/session.ts): `recovery` from the redeem call, or from
 * GET /api/me answering `passkey_required` after a reload. Small on purpose: router.ts
 * loads it with the first chunk.
 */
import { watch } from 'vue';
import type { Router } from 'vue-router';
import { session } from '../../account/session.ts';

export const RECOVERY_PATH = '/account';

/**
 * Where a route goes in a recovery session: /account, which redirects to the account panel
 * (`panel=account`, DU11), where the recovery screen shows. The panel itself stays.
 */
export function recoveryRedirect(path: string, query: Record<string, unknown> = {}): string | null {
    if (session.gate !== 'recovery' || path === RECOVERY_PATH || query.panel === 'account') return null;
    return RECOVERY_PATH;
}

/**
 * The address a person was at when they opened sign-in or the account page: sign-up, the
 * recovery screen and "Back to the map" return there. Memory only; unknown is the home view.
 */
let returnTo: string | null = null;

export function noteReturn(path: string): void {
    if (path && !path.startsWith(RECOVERY_PATH) && !/[?&]panel=account(&|$)/.test(path)) returnTo = path;
}

export function returnPath(): string {
    return returnTo || '/';
}

type Guarded = Pick<Router, 'beforeEach' | 'replace' | 'currentRoute'>;
const guarded = new WeakSet<object>();

/**
 * Every route sends a recovery session to the account page: a route asked for while the gate is
 * up, and the route already open when it goes up. router.ts installs it where the router is made;
 * the sign-in card calls it again after a redeem, which only leaves the open route.
 */
export function guardRecovery(router: Guarded): void {
    const leave = (): void => {
        const now = recoveryRedirect(router.currentRoute.value.path, router.currentRoute.value.query);
        if (now) void router.replace(now);
    };
    if (!guarded.has(router)) {
        guarded.add(router);
        router.beforeEach((to) => recoveryRedirect(to.path, to.query) ?? undefined);
        watch(() => session.gate, leave);
    }
    leave();
}
