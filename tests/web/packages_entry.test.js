/**
 * Cold load of the two marketplace routes, and the account-menu entry that opens the list.
 * The sign-in card is painted in onMounted after loadSession (PackagesView.vue), so a server
 * render of a cold load is the loading shell. The browser pass checks the card.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const webRoot = path.join(root, 'apps', 'web');
let cacheDir = '';

describe('my packages entry', { concurrency: 1 }, () => {
    /** @type {import('vite').ViteDevServer | null} */
    let server = null;
    /** @type {{ user: object | null }} */
    let session = { user: null };

    test.before(async () => {
        cacheDir = fs.mkdtempSync(path.join(tmpdir(), 'e-packages-ssr-'));
        const { createServer } = await import('vite');
        server = await createServer({
            root: webRoot,
            cacheDir,
            server: { middlewareMode: true, hmr: false, ws: false },
            appType: 'custom',
            logLevel: 'silent',
        });
        session = (await server.ssrLoadModule('/src/account/session.ts')).session;
    });

    test.after(async () => {
        session.user = null;
        if (server) await server.close();
        if (cacheDir) fs.rmSync(cacheDir, { recursive: true, force: true });
    });

    test('the router table names both package routes', () => {
        const text = fs.readFileSync(path.join(webRoot, 'src', 'router.ts'), 'utf8');
        assert.match(text, /\{ path: '\/packages', name: 'packages', component: \(\) => import\('\.\/workspace\/market\/PackagesView\.vue'\) \}/);
        assert.match(text, /\{ path: '\/packages\/:packageId', name: 'package', component: \(\) => import\('\.\/workspace\/market\/PackagesView\.vue'\) \}/);
    });

    test('a cold load of /packages renders the list shell', async () => {
        session.user = null;
        const html = await renderAt('/packages');
        // The app's frame (prompts/d_store_harden.md item 1): the rail, Marketplace its current item,
        // the brand at the top, and no "Map" button of the store's own.
        assert.match(html, /^<div class="mk-app"><nav class="rail"/);
        assert.match(html, /<button[^>]*aria-label="Marketplace"[^>]*aria-current="page"/);
        assert.match(html, /<div class="mk-scroll"><main class="is-store mk-page"><header class="mk-bar"><a [^>]*class="[^"]*mk-brand"/);
        assert.match(html, /<span class="ui-brand" aria-hidden="true">Traveller<span class="ui-brand-dot">\.<\/span>voyage<\/span>/);
        // The videos' ground behind the page, and the rule under the heading (item 5).
        assert.match(html, /<div class="ui-ground mk-ground" aria-hidden="true"><\/div>/);
        assert.match(html, /<h1 class="mk-title">Marketplace<\/h1><div class="ui-rule mk-title-rule" aria-hidden="true"><\/div>/);
        assert.doesNotMatch(html, />Map<\/a>/);
        assert.match(html, /<h1 class="mk-title">Marketplace<\/h1>/);
        assert.match(html, /aria-label="Loading packages"/);
        assert.match(html, /aria-label="Search packages"/);
        assert.doesNotMatch(html, /coming soon/i);
        assert.doesNotMatch(html, /Sign in to publish/);
    });

    test('a cold load of /packages/:packageId renders the package shell', async () => {
        session.user = null;
        const html = await renderAt('/packages/anything');
        assert.match(html, /^<div class="mk-app"><nav class="rail"/);
        assert.match(html, /<button[^>]*aria-label="Marketplace"[^>]*aria-current="page"/);
        assert.match(html, /<div class="mk-scroll"><main class="mk-page"><header class="mk-bar"><a [^>]*class="[^"]*mk-brand"/);
        // The product page's title is its hero's h1, painted once the package is read.
        assert.match(html, /aria-label="Loading the package"/);
        assert.doesNotMatch(html, /class="mk-title"/);
        assert.match(html, /href="\/packages"/);
        assert.doesNotMatch(html, /Loading packages/);
        assert.doesNotMatch(html, /coming soon/i);
    });

    test('the account menu offers My packages while signed in, and hides it while signed out', async () => {
        const menu = (await server.ssrLoadModule('/src/workspace/AccountMenu.vue')).default;
        const { createSSRApp } = await import('vue');
        const { renderToString } = await import('vue/server-renderer');
        const { createMemoryHistory, createRouter } = await import('vue-router');
        const router = createRouter({
            history: createMemoryHistory(),
            routes: [{ path: '/', component: menu }],
        });
        await router.push('/');
        await router.isReady();
        session.user = { id: 'me', email: null, role: 'user', profile: { handle: 'varn' } };
        // The menu is teleported to the body: its markup is in the render's teleports.
        const rendered = async () => {
            const ctx = {};
            await renderToString(createSSRApp(menu, { open: true }).use(router), ctx);
            return (ctx.teleports && ctx.teleports.body) || '';
        };
        const signedIn = await rendered();
        const item = signedIn.match(/<button type="button" role="menuitem" class="account-packages">[\s\S]*?<\/button>/);
        assert.ok(item, 'My packages is a menu item');
        assert.match(item[0], /role="menuitem"/);
        assert.match(item[0], /<span>My packages<\/span>/);
        assert.doesNotMatch(item[0], /<em|ui-count|badge/);
        session.user = null;
        const signedOut = await rendered();
        assert.doesNotMatch(signedOut, /account-packages/);
        assert.doesNotMatch(signedOut, />My packages</);
    });

    async function renderAt(url) {
        const view = (await server.ssrLoadModule('/src/workspace/market/PackagesView.vue')).default;
        const { createSSRApp, h } = await import('vue');
        const { renderToString } = await import('vue/server-renderer');
        const { createMemoryHistory, createRouter } = await import('vue-router');
        const router = createRouter({
            history: createMemoryHistory(),
            routes: [
                { path: '/', component: { render: () => h('div') } },
                { path: '/packages', name: 'packages', component: view },
                { path: '/packages/:packageId', name: 'package', component: view },
            ],
        });
        await router.push(url);
        await router.isReady();
        return renderToString(createSSRApp(view).use(router));
    }
});
