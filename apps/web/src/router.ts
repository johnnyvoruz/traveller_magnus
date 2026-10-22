import { createRouter, createWebHistory } from 'vue-router';
import { loadSession, session } from './account/session.ts';
import { scrollToTop, storageGet } from './platform/browser.ts';
import { bindRouter } from './shell/go.ts';
import { addressPane, campaignRedirect, hostsCampaign, withQuery, type Query } from './shell/pane.ts';
import MapView from './views/MapView.vue';
import { FIRST_PLACE, FIRST_WORLD, LAST_VIEW_KEY, parseView, WELCOME_KEY, welcomeDue } from './workspace/first_visit.ts';
import { guardRecovery } from './workspace/passkey/recovery.ts';

const joinPage = () => import('./characters/screens/JoinPage.vue');

/** Starts the pane chunk the address names. Not awaited: the view paints first. */
function preloadPane(path: string, query: Query): void {
    const pane = addressPane(path, query).pane;
    if (pane.kind === 'dossier') void import('./dossier/DossierPanel.vue');
    else if (pane.kind === 'characters') void import('./characters/screens/CharactersPanel.vue');
    else if (hostsCampaign(pane)) void import('./workspace/CampaignPanel.vue');
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
        { path: '/s/:sector/sub/:letter', name: 'subsector', component: MapView },
        { path: '/s/:sector/:hex', name: 'hex', component: MapView },
        { path: '/s/:sector/:hex/b/:body', name: 'body', component: MapView },
        { path: '/s/:sector/:hex/orbit', name: 'orbit', component: () => import('./views/OrbitView.vue') },
        { path: '/s/:sector/:hex/orbit/b/:body', name: 'orbit-body', component: () => import('./views/OrbitView.vue') },
        { path: '/account', redirect: (to) => accountRedirect(to.query) },
        { path: '/claim/:token', name: 'claim', component: () => import('./characters/screens/ClaimPage.vue') },
        { path: '/join/:token', name: 'join', component: joinPage },
        { path: '/join', name: 'join-held', component: joinPage },
        { path: '/packages', name: 'packages', component: () => import('./workspace/market/PackagesView.vue') },
        { path: '/packages/:packageId', name: 'package', component: () => import('./workspace/market/PackagesView.vue') },
        { path: '/changes', name: 'changes', component: () => import('./views/ChangesView.vue') },
        { path: '/changes/:version', name: 'change', component: () => import('./views/ChangesView.vue') },
        { path: '/help', name: 'help', component: () => import('./views/HelpView.vue') },
        { path: '/welcome', name: 'welcome', component: () => import('./views/WelcomeView.vue') },
        { path: '/campaign/r/:record', redirect: (to) => legacyRedirect(to) },
        { path: '/campaign/party', redirect: (to) => legacyRedirect(to) },
        { path: '/campaign', redirect: (to) => legacyRedirect(to) },
        // A batch's review link (the server's reviewUrl): the Proposals pane on that batch, in its campaign.
        { path: '/universes/:universe/proposals/:batch', redirect: (to) => reviewRedirect(to.params) },
    ],
});

bindRouter(router);

/** The account is a panel over the map (DU11). /account stays, so the recovery flow and a provider's callback keep their address. */
function accountRedirect(query: Query): { path: string; query: Record<string, string>; replace: true } {
    return { path: '/', query: withQuery(query, { panel: 'account' }), replace: true };
}

/** A batch's review link onto the Proposals pane; the section opens that campaign when another is open. */
function reviewRedirect(params: Record<string, string | string[]>): { path: string; query: Record<string, string>; replace: true } {
    return { path: '/', query: { panel: 'proposals', batch: String(params.batch), universe: String(params.universe) }, replace: true };
}

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
    router.addRoute({
        path: '/dev/city-lights',
        name: 'city-lights',
        component: () => import('./dev/city-lights/CityLights.vue'),
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

// The guard installs once per router.
guardRecovery(router);

function stored(key: string): string | null {
    return storageGet(key);
}

/**
 * A signed-out first visit opens /welcome once, after the address has settled and the
 * session is known. A named address, a returning camera, and a signed-in person stay put.
 */
if (typeof window !== 'undefined') {
    void router.isReady().then(() => loadSession()).then(() => {
        const path = router.currentRoute.value.path;
        // An address that asked for the account (/account redirects to /?panel=account) gets it, not the welcome.
        const asked = addressPane(path, router.currentRoute.value.query).pane.kind === 'account';
        const home = !asked && (path === '/' || path === '' || path === FIRST_PLACE || path === FIRST_WORLD);
        const due = welcomeDue({
            signedIn: session.user !== null,
            shown: stored(WELCOME_KEY) === '1',
            returning: parseView(stored(LAST_VIEW_KEY)) !== null,
        });
        if (home && due) void router.push('/welcome');
    });
}
