import { createRouter, createWebHistory } from 'vue-router';
import { scrollToTop } from './platform/browser.ts';
import { addressPane, campaignRedirect, type Query } from './shell/pane.ts';
import Account from './views/Account.vue';
import MapView from './views/MapView.vue';

/** Starts the pane chunk the address names. Not awaited: the view paints first. */
function preloadPane(path: string, query: Query): void {
    const pane = addressPane(path, query).pane;
    if (pane.kind === 'dossier') void import('./dossier/DossierPanel.vue');
    else if (pane.kind === 'campaign' || pane.kind === 'party') void import('./workspace/CampaignPanel.vue');
}

export const router = createRouter({
    history: createWebHistory(),
    scrollBehavior(to, from, saved) {
        if (saved) return { ...saved, behavior: 'auto' };
        const samePage = from.matched.length > 0 && to.path === from.path;
        if (to.hash) return { el: to.hash, top: 0, behavior: samePage ? 'smooth' : 'auto' };
        return { top: 0, left: 0, behavior: 'auto' };
    },
    routes: [
        { path: '/', name: 'home', component: MapView },
        { path: '/s/:sector', name: 'sector', component: MapView },
        { path: '/s/:sector/:hex', name: 'hex', component: MapView },
        { path: '/s/:sector/:hex/b/:body', name: 'body', component: MapView },
        { path: '/s/:sector/:hex/orbit', name: 'orbit', component: () => import('./views/OrbitView.vue') },
        { path: '/s/:sector/:hex/orbit/b/:body', name: 'orbit-body', component: () => import('./views/OrbitView.vue') },
        { path: '/account', name: 'account', component: Account },
        { path: '/campaign/r/:record', redirect: (to) => legacyRedirect(to) },
        { path: '/campaign/party', redirect: (to) => legacyRedirect(to) },
        { path: '/campaign', redirect: (to) => legacyRedirect(to) },
    ],
});

/** The three old campaign paths, replaced so Back does not stop on them. */
function legacyRedirect(to: { path: string; query: Query }): { path: string; query: Record<string, string>; replace: true } | { path: string } {
    const next = campaignRedirect(to.path, to.query);
    return next ? { path: next.path, query: next.query, replace: true } : { path: '/' };
}

if (import.meta.env.DEV || import.meta.env.MODE === 'preview') {
    router.addRoute({ path: '/design', name: 'design', component: () => import('./views/DesignView.vue') });
}

if (import.meta.env.DEV) {
    router.addRoute({
        path: '/dev/surface-parity',
        name: 'surface-parity',
        component: () => import('./dev/surface-parity/SurfaceParity.vue'),
    });
    router.addRoute({
        path: '/dev/surface-sheet',
        name: 'surface-sheet',
        component: () => import('./dev/surface-sheet/SurfaceSheet.vue'),
    });
    router.addRoute({
        path: '/dev/surface-parity/gl',
        name: 'surface-parity-gl',
        component: () => import('./dev/surface-parity/GlParity.vue'),
    });
    router.addRoute({
        path: '/dev/deck-plan',
        name: 'deck-plan',
        component: () => import('./dev/deck-plan/DeckPlanPage.vue'),
    });
}

router.beforeEach((to) => {
    const next = campaignRedirect(to.path, to.query);
    if (next) {
        preloadPane(next.path, next.query);
        return { path: next.path, query: next.query, replace: true };
    }
    preloadPane(to.path, to.query);
});

router.afterEach((to, from) => {
    if (to.path !== from.path && !to.hash) scrollToTop();
});
