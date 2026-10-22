/**
 * C4 (streams/C.md, UX backlog U19): one cold-load check per route in the router table.
 * Map and orbit views call the browser while they set up. Their routes are named here;
 * rendering them is a proposal for the lane that owns the view.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { campaignRedirect } from '../../apps/web/src/shell/pane.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const webRoot = path.join(root, 'apps', 'web');

/** Representative address for each path in the static route table. */
const ROUTES = [
    { path: '/', sample: '/' },
    { path: '/s/:sector', sample: '/s/Spinward_Marches' },
    { path: '/s/:sector/sub/:letter', sample: '/s/Spinward_Marches/sub/C' },
    { path: '/s/:sector/:hex', sample: '/s/Spinward_Marches/1910' },
    { path: '/s/:sector/:hex/b/:body', sample: '/s/Spinward_Marches/1910/b/w0' },
    { path: '/s/:sector/:hex/orbit', sample: '/s/Spinward_Marches/1910/orbit' },
    { path: '/s/:sector/:hex/orbit/b/:body', sample: '/s/Spinward_Marches/1910/orbit/b/w0' },
    { path: '/account', sample: '/account' },
    { path: '/claim/:token', sample: '/claim/share-token' },
    { path: '/join/:token', sample: '/join/share-token' },
    { path: '/join', sample: '/join' },
    { path: '/packages', sample: '/packages' },
    { path: '/packages/:packageId', sample: '/packages/pk_W5FTJF8B2M77XHXT7FTBT1XB08' },
    { path: '/changes', sample: '/changes' },
    { path: '/changes/:version', sample: '/changes/1.2.6' },
    { path: '/help', sample: '/help' },
    { path: '/welcome', sample: '/welcome' },
    { path: '/campaign/r/:record', sample: '/campaign/r/rec_example' },
    { path: '/campaign/party', sample: '/campaign/party' },
    { path: '/campaign', sample: '/campaign' },
    { path: '/universes/:universe/proposals/:batch', sample: '/universes/01M512HB5HWM4PCPMYXXPCZC4B/proposals/pb_01M58Y6S5H0Q9PR24QN41QFN01' },
];

function routeTable() {
    const source = fs.readFileSync(path.join(webRoot, 'src', 'router.ts'), 'utf8');
    const start = source.indexOf('routes: [');
    const end = source.indexOf('],', start);
    return source.slice(start, end);
}

test('the router table and this file name the same routes', () => {
    const table = routeTable();
    const found = [...table.matchAll(/path: '([^']+)'/g)].map((match) => match[1]);
    assert.deepEqual(found, ROUTES.map((route) => route.path));
});

test('map routes render MapView and orbit routes render OrbitView', () => {
    const table = routeTable();
    for (const route of ROUTES.filter((item) => item.path.startsWith('/s/') && !item.path.includes('orbit'))) {
        const line = table.slice(table.indexOf(`path: '${route.path}'`)).split('\n')[0];
        assert.match(line, /MapView/);
    }
    for (const route of ['/s/:sector/:hex/orbit', '/s/:sector/:hex/orbit/b/:body']) {
        const line = table.slice(table.indexOf(`path: '${route}'`)).split('\n')[0];
        assert.match(line, /OrbitView\.vue/);
    }
    assert.match(table, /path: '\/', name: 'home', component: MapView/);
});

test('old campaign addresses redirect onto the map', () => {
    assert.deepEqual(campaignRedirect('/campaign/party'), { path: '/', query: { panel: 'party' } });
    assert.deepEqual(campaignRedirect('/campaign'), { path: '/', query: { panel: 'campaign' } });
    const record = campaignRedirect('/campaign/r/rec_example');
    assert.equal(record && record.path, '/');
    assert.equal(record && record.query.panel, 'campaign');
    assert.equal(record && record.query.record, 'rec_example');
});

describe('cold load render', { concurrency: 1 }, () => {
    /** @type {import('vite').ViteDevServer | null} */
    let server = null;
    let cacheDir = '';

    test.before(async () => {
        cacheDir = fs.mkdtempSync(path.join(tmpdir(), 'c-cold-ssr-'));
        const { createServer } = await import('vite');
        server = await createServer({
            root: webRoot,
            cacheDir,
            server: { middlewareMode: true, hmr: false, ws: false },
            appType: 'custom',
            logLevel: 'silent',
        });
    });

    test.after(async () => {
        if (server) await server.close();
        if (cacheDir) fs.rmSync(cacheDir, { recursive: true, force: true });
    });

    async function render(file, url) {
        const component = (await server.ssrLoadModule(file)).default;
        const { createSSRApp } = await import('vue');
        const { renderToString } = await import('vue/server-renderer');
        const { createMemoryHistory, createRouter } = await import('vue-router');
        const router = createRouter({
            history: createMemoryHistory(),
            routes: [
                { path: '/', component },
                { path: '/account', component },
                { path: '/claim/:token', component },
                { path: '/join/:token', component },
                { path: '/join', component },
                { path: '/packages', component },
                { path: '/packages/:packageId', component },
                { path: '/changes', component },
                { path: '/help', component },
                { path: '/welcome', component },
            ],
        });
        await router.push(url);
        await router.isReady();
        const ctx = {};
        const html = await renderToString(createSSRApp(component).use(router), ctx);
        return html + ((ctx.teleports && ctx.teleports.body) || '');
    }

    test('/account is the account panel over the map (DU11): its title, the account loading, no page of its own', async () => {
        const html = await render('/src/workspace/passkey/AccountPanel.vue', '/?panel=account');
        assert.match(html, />Account</);
        assert.match(html, /Loading your account/);
        assert.doesNotMatch(html, /Back to the map/);
        assert.doesNotMatch(html, /<main/);
    });

    test('/claim/:token renders the claim page', async () => {
        const html = await render('/src/characters/screens/ClaimPage.vue', '/claim/share-token');
        assert.match(html, /A character has been shared with you/);
        assert.match(html, /Checking your session/);
    });

    test('/join/:token renders the join page', async () => {
        const html = await render('/src/characters/screens/JoinPage.vue', '/join/share-token');
        assert.match(html, /You&#39;re invited/);
        assert.match(html, /Checking your session/);
    });

    test('/join renders the same join page', async () => {
        const html = await render('/src/characters/screens/JoinPage.vue', '/join');
        assert.match(html, /You&#39;re invited/);
        assert.match(html, /Checking your session/);
    });

    test('/packages renders the marketplace', async () => {
        const html = await render('/src/workspace/market/PackagesView.vue', '/packages');
        assert.match(html, /Marketplace/);
    });

    test('/packages/:packageId renders the marketplace', async () => {
        const html = await render('/src/workspace/market/PackagesView.vue', '/packages/pk_W5FTJF8B2M77XHXT7FTBT1XB08');
        assert.match(html, /Marketplace/);
    });

    test('/changes/:version names the same window', () => {
        const table = routeTable();
        const line = table.slice(table.indexOf("path: '/changes/:version'")).split('\n')[0];
        assert.match(line, /ChangesView\.vue/);
    });

    test('/changes renders the changelog on a cold load', async () => {
        const view = fs.readFileSync(path.join(webRoot, 'src', 'views', 'ChangesView.vue'), 'utf8');
        assert.match(view, /<MapView \/>/);
        const html = await render('/src/workspace/ChangelogWindow.vue', '/changes');
        assert.match(html, /id="changes-h"/);
    });

    test('/help renders the guide on a cold load', async () => {
        const view = fs.readFileSync(path.join(webRoot, 'src', 'views', 'HelpView.vue'), 'utf8');
        assert.match(view, /<MapView \/>/);
        const html = await render('/src/workspace/HelpWindow.vue', '/help');
        assert.match(html, /id="help-h"/);
    });

    test('/welcome renders the welcome window on a cold load', async () => {
        const view = fs.readFileSync(path.join(webRoot, 'src', 'views', 'WelcomeView.vue'), 'utf8');
        assert.match(view, /<MapView \/>/);
        const html = await render('/src/workspace/WelcomeWindow.vue', '/welcome');
        assert.match(html, /id="welcome-h"/);
        assert.match(html, /\/landing\/fly\.webp/);
    });
});
