/**
 * The one way commands move the address. The router binds itself here when it is created.
 * Commands call this file. They do not import the router, and the registry does not either.
 */
import type { RouteLocationNormalizedLoaded, RouteLocationRaw, Router } from 'vue-router';

let bound: Router | null = null;

export function bindRouter(router: Router): void {
    bound = router;
}

export function currentRoute(): RouteLocationNormalizedLoaded | null {
    return bound ? bound.currentRoute.value : null;
}

export function pushRoute(to: RouteLocationRaw): void {
    if (bound) void bound.push(to);
}
