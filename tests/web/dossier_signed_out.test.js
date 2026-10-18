/**
 * ES2: a cold load of /s/Spinward_Marches, signed out, says to sign in.
 * Signed in, the panel keeps the sentence that tells you to switch Build on.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const webRoot = path.join(root, 'apps', 'web');

const PROPS = {
    open: true,
    slug: 'Spinward_Marches',
    hex: '',
    sectorName: 'Spinward Marches',
    subsectorName: '',
    entry: null,
    tree: null,
    bodyKey: null,
    error: false,
    pending: false,
    missing: false,
    allegiances: [],
};

describe('signed-out sector dossier', { concurrency: 1 }, () => {
    /** @type {import('vite').ViteDevServer | null} */
    let server = null;
    let cacheDir = '';
    /** @type {{ user: object | null }} */
    let session = { user: null };

    test.before(async () => {
        cacheDir = fs.mkdtempSync(path.join(tmpdir(), 'e-es2-ssr-'));
        const { createServer } = await import('vite');
        server = await createServer({
            root: webRoot,
            cacheDir,
            server: { middlewareMode: true, hmr: false, ws: false },
            appType: 'custom',
            logLevel: 'silent',
        });
        session = (await server.ssrLoadModule('/src/account/session.ts')).session;
        session.user = null;
    });

    test.after(async () => {
        if (session) session.user = null;
        if (server) await server.close();
        if (cacheDir) fs.rmSync(cacheDir, { recursive: true, force: true });
    });

    async function render(url) {
        const component = (await server.ssrLoadModule('/src/dossier/DossierPanel.vue')).default;
        const { createSSRApp } = await import('vue');
        const { renderToString } = await import('vue/server-renderer');
        const { createMemoryHistory, createRouter } = await import('vue-router');
        const router = createRouter({
            history: createMemoryHistory(),
            routes: [
                { path: '/s/:sector', component },
                { path: '/s/:sector/sub/:letter', component },
            ],
        });
        await router.push(url);
        await router.isReady();
        return renderToString(createSSRApp(component, PROPS).use(router));
    }

    test('a cold load of /s/Spinward_Marches, signed out, links Sign in', async () => {
        session.user = null;
        const html = await render('/s/Spinward_Marches');
        assert.match(html, /<button type="button" class="doss-signin">Sign in<\/button> to build here\./);
        assert.equal(html.includes('Build is off. Switch it on'), false);
    });

    test('signed in, the sector keeps the switch-it-on sentence', async () => {
        session.user = { id: 'me', email: null, role: 'user', profile: null, username: null, hasPasskey: false, unusedRecoveryCodes: 0, linkedProviders: [] };
        const html = await render('/s/Spinward_Marches');
        session.user = null;
        assert.match(html, /Build is off\. Switch it on to select and generate in this sector\./);
        assert.equal(html.includes('doss-signin'), false);
    });
});
