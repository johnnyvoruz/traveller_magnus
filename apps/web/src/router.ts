import { createRouter, createWebHistory } from 'vue-router';
import { scrollToTop } from './platform/browser.ts';
import Account from './views/Account.vue';
import MapView from './views/MapView.vue';

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
        { path: '/campaign', name: 'campaign', component: MapView },
        { path: '/account', name: 'account', component: Account },
    ],
});

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
}

router.afterEach((to, from) => {
    if (to.path !== from.path && !to.hash) scrollToTop();
});
