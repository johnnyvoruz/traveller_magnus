/**
 * C2 (streams/C.md): /welcome over the map, the first-visit rule, and a cold render
 * of /help, /changes and /welcome.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { welcomeDue } from '../../apps/web/src/workspace/first_visit.ts';
import { firstExampleShip, releasedVersion, WELCOME_LINE, WELCOME_PANES } from '../../apps/web/src/workspace/welcome.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const webRoot = path.join(root, 'apps', 'web');
const MARK = 'pm_0123456789ABCDEFGHJKMNPQRS';

test('the landing pictures are real files under 200 kB', () => {
    const files = [
        ['apps/web/public/landing/fly.webp', 'RIFF'],
        ['apps/web/public/landing/run.webp', 'RIFF'],
        ['apps/web/public/landing/share.webp', 'RIFF'],
    ];
    for (const [file, magic] of files) {
        const bytes = fs.readFileSync(path.join(root, file));
        assert.equal(bytes.subarray(0, 4).toString('ascii'), magic, file);
        assert.ok(bytes.length < 200 * 1024, file + ' is ' + bytes.length);
    }
    const og = fs.readFileSync(path.join(root, 'apps/web/public/og.png'));
    assert.equal(og.subarray(1, 4).toString('ascii'), 'PNG');
    assert.equal(og.readUInt32BE(16), 1200);
    assert.equal(og.readUInt32BE(20), 630);
    assert.ok(og.length < 200 * 1024, 'og.png is ' + og.length);
});

test('the welcome window opens once for a signed-out first visit', () => {
    const fresh = { signedIn: false, shown: false, returning: false };
    assert.equal(welcomeDue(fresh), true);
    assert.equal(welcomeDue({ ...fresh, signedIn: true }), false);
    assert.equal(welcomeDue({ ...fresh, shown: true }), false);
    assert.equal(welcomeDue({ ...fresh, returning: true }), false);
});

test('an example ship is the first one marked example', () => {
    const body = {
        hexes: [
            { hex: '1910', ships: [{ mark: MARK, ship: 'Other', example: false }] },
            { hex: '0526', ships: [{ mark: MARK, ship: 'Mile Marker', aboard: ['Jem Oak'], example: true }] },
        ],
    };
    assert.deepEqual(firstExampleShip(body), {
        sector: 'Spinward_Marches',
        hex: '0526',
        mark: MARK,
        ship: 'Mile Marker',
        aboard: ['Jem Oak'],
    });
    assert.equal(firstExampleShip({ hexes: [] }), null);
    assert.equal(releasedVersion({ data: [{ version: 'v9', releasedAt: '2026-01-01T00:00:00Z' }, { version: 'v10', releasedAt: '2026-02-01T00:00:00Z' }] }), 'v10');
});

describe('cold load', { concurrency: 1 }, () => {
    /** @type {import('vite').ViteDevServer | null} */
    let server = null;
    let cacheDir = '';

    test.before(async () => {
        cacheDir = fs.mkdtempSync(path.join(tmpdir(), 'c-welcome-ssr-'));
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

    test('the router names /help, /changes and /welcome over the map', () => {
        const router = fs.readFileSync(path.join(webRoot, 'src', 'router.ts'), 'utf8');
        assert.match(router, /path: '\/help', name: 'help'/);
        assert.match(router, /path: '\/changes', name: 'changes'/);
        assert.match(router, /path: '\/welcome', name: 'welcome', component: \(\) => import\('\.\/views\/WelcomeView\.vue'\)/);
        for (const file of ['HelpView.vue', 'ChangesView.vue', 'WelcomeView.vue']) {
            const view = fs.readFileSync(path.join(webRoot, 'src', 'views', file), 'utf8');
            assert.match(view, /<MapView \/>/);
        }
        const routes = fs.readFileSync(path.join(webRoot, 'src', 'map', 'routes.ts'), 'utf8');
        assert.match(routes, /path === '\/help'/);
        assert.match(routes, /path === '\/changes'/);
        assert.match(routes, /path === '\/welcome'/);
    });

    async function render(file) {
        const component = (await server.ssrLoadModule(file)).default;
        const { createSSRApp } = await import('vue');
        const { renderToString } = await import('vue/server-renderer');
        const { createMemoryHistory, createRouter } = await import('vue-router');
        const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component }] });
        await router.push('/');
        await router.isReady();
        const ctx = {};
        await renderToString(createSSRApp(component).use(router), ctx);
        return (ctx.teleports && ctx.teleports.body) || '';
    }

    test('/help renders the guide on a cold load', async () => {
        const html = await render('/src/workspace/HelpWindow.vue');
        assert.match(html, /id="help-h"/);
        assert.match(html, /Make records/);
    });

    test('/changes renders the changelog on a cold load', async () => {
        const html = await render('/src/workspace/ChangelogWindow.vue');
        assert.match(html, /id="changes-h"/);
    });

    test('/welcome renders the three panes on a cold load', async () => {
        const html = await render('/src/workspace/WelcomeWindow.vue');
        assert.match(html, /id="welcome-h"/);
        const line = WELCOME_LINE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace("'", '(&#39;|\')');
        assert.match(html, new RegExp(line));
        for (const pane of WELCOME_PANES) {
            assert.match(html, new RegExp(pane.title));
            assert.match(html, new RegExp(pane.button));
            assert.match(html, new RegExp('/landing/' + pane.id + '\\.webp'));
            assert.match(html, new RegExp(pane.picture.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
        }
        assert.match(html, /Create an account/);
        assert.match(html, /Just explore/);
        assert.match(html, /Deck geomorphs by Robert Pearce/);
        assert.doesNotMatch(html, /fair use/i);
    });
});
