/**
 * What's new (prompts/e_changelog.md): the first entry is the app version, every release
 * is a player-facing note, and /changes renders the window.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { CHANGELOG } from '../../apps/web/src/changelog.ts';
import { targetFor } from '../../apps/web/src/map/routes.ts';
import { APP_VERSION } from '../../apps/web/src/version.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const webRoot = path.join(root, 'apps', 'web');
const cacheDir = path.join(root, '.tmp', 'e-changelog-ssr');

function parts(version) {
    return version.split('.').map((part) => Number(part));
}

test('the first entry is this app version, and every release is in order', () => {
    const head = parts(CHANGELOG[0].version);
    const app = parts(APP_VERSION);
    const ahead = head[0] - app[0] || head[1] - app[1] || head[2] - app[2];
    assert.ok(ahead >= 0, 'the first entry is this version or a newer one waiting on the push');
    assert.equal(CHANGELOG.some((release) => release.version === APP_VERSION), true);
    const seen = new Set();
    for (let i = 0; i < CHANGELOG.length; i++) {
        const release = CHANGELOG[i];
        assert.equal(seen.has(release.version), false, release.version);
        seen.add(release.version);
        assert.equal(parts(release.version).length, 3, release.version);
        if (i > 0) {
            const newer = parts(CHANGELOG[i - 1].version);
            const older = parts(release.version);
            const down = newer[0] - older[0] || newer[1] - older[1] || newer[2] - older[2];
            assert.ok(down > 0, release.version + ' follows a newer version');
        }
        assert.match(release.date, /^\d{4}-\d{2}-\d{2}$/, release.version);
        const [year, month, day] = release.date.split('-').map((part) => Number(part));
        const parsed = new Date(Date.UTC(year, month - 1, day));
        assert.equal(parsed.getUTCFullYear(), year, release.version);
        assert.equal(parsed.getUTCMonth(), month - 1, release.version);
        assert.equal(parsed.getUTCDate(), day, release.version);
        assert.ok(release.title.trim().length > 0, release.version);
        assert.ok(release.items.length >= 1 && release.items.length <= 6, release.version);
        assert.equal(release.story.length, 2, release.version);
        if (release.version === '1.3.0' || release.version === '1.3.1') {
            assert.equal(release.picture, '/changes/' + release.version + '.png', release.version);
            const file = path.join(webRoot, 'public', 'changes', release.version + '.png');
            const bytes = fs.readFileSync(file);
            assert.ok(bytes.length < 300 * 1024, release.version);
            assert.equal(bytes.readUInt32BE(16), 1200, release.version);
        } else {
            assert.equal(release.picture, undefined, release.version);
        }
        for (const item of [...release.items, ...release.story]) {
            assert.equal(item.includes('`'), false, item);
            assert.equal(item.includes('/src/'), false, item);
            assert.equal(/\.ts\b|\.vue\b/.test(item), false, item);
            assert.equal(/\blane\s+[a-z]\b/i.test(item), false, item);
            assert.equal(/orchestrator/i.test(item), false, item);
            assert.equal(/\b(engine|truth|overlay|manifest|generator)\b/i.test(item), false, item);
            assert.equal(item.includes('!'), false, item);
        }
        for (const line of release.story) assert.equal(line.endsWith('.'), true, line);
    }
});

test('the map keeps /changes, and the route draws the window over the map', () => {
    const router = fs.readFileSync(path.join(webRoot, 'src', 'router.ts'), 'utf8');
    assert.match(router, /path: '\/changes', name: 'changes', component: \(\) => import\('\.\/views\/ChangesView\.vue'\)/);
    const view = fs.readFileSync(path.join(webRoot, 'src', 'views', 'ChangesView.vue'), 'utf8');
    assert.match(view, /<MapView \/>/);
    assert.match(view, /<ChangelogWindow :version="version" @close="leave" \/>/);
    assert.match(view, /router\.replace\('\/'\)/);
    assert.match(router, /path: '\/changes\/:version', name: 'change', component: \(\) => import\('\.\/views\/ChangesView\.vue'\)/);
    const manifest = { sectors: [{ slug: 'Spinward_Marches', x: 0, y: 0, tags: ['OTU'], canonical: true }] };
    assert.deepEqual(targetFor({ path: '/changes' }, manifest).kind, targetFor({ path: '/' }, manifest).kind);
    assert.deepEqual(targetFor({ path: '/changes/1.2.6' }, manifest).kind, targetFor({ path: '/' }, manifest).kind);
});

describe('rendered', { concurrency: 1 }, () => {
    /** @type {import('vite').ViteDevServer | null} */
    let server = null;

    test.before(async () => {
        fs.rmSync(cacheDir, { recursive: true, force: true });
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
        fs.rmSync(cacheDir, { recursive: true, force: true });
    });

    test('the window renders the current release open', async () => {
        const component = (await server.ssrLoadModule('/src/workspace/ChangelogWindow.vue')).default;
        const { createSSRApp } = await import('vue');
        const { renderToString } = await import('vue/server-renderer');
        const ctx = {};
        await renderToString(createSSRApp(component), ctx);
        const html = (ctx.teleports && ctx.teleports.body) || '';
        assert.match(html, /What&#39;s new/);
        assert.match(html, new RegExp('>' + APP_VERSION.replaceAll('.', '\\.') + '<'));
        assert.match(html, /class="ui-date">17 October 2026</);
        assert.match(html, /<details open>/);
        assert.equal((html.match(/<details/g) || []).length, CHANGELOG.length);
        assert.equal((html.match(/<details open>/g) || []).length, 1);
        assert.match(html, /class="ui-modal changes"/);
        assert.match(html, /aria-label="Close"/);
        assert.match(html, /href="\/changes\/1\.2\.6"/);
    });

    test('a version page is two lines, a picture, and the list folded under it', async () => {
        const component = (await server.ssrLoadModule('/src/workspace/ChangelogBody.vue')).default;
        const { createSSRApp } = await import('vue');
        const { renderToString } = await import('vue/server-renderer');
        const html = await renderToString(createSSRApp(component, { version: '1.3.0' }));
        assert.match(html, /What&#39;s new/);
        assert.match(html, />1\.3\.0</);
        assert.match(html, /Players/);
        assert.match(html, /Players can join your campaign with an invite link/);
        assert.match(html, /href="\/changes"/);
        assert.match(html, /href="\/help"/);
        assert.match(html, /src="\/changes\/1\.3\.0\.png"/);
        assert.match(html, /The full list/);
        assert.equal(html.includes('<details open'), false);
    });

    test('an unknown version says it is not listed', async () => {
        const component = (await server.ssrLoadModule('/src/workspace/ChangelogBody.vue')).default;
        const { createSSRApp } = await import('vue');
        const { renderToString } = await import('vue/server-renderer');
        const html = await renderToString(createSSRApp(component, { version: '9.9.9' }));
        assert.match(html, /This version is not in What&#39;s new\./);
        assert.match(html, /href="\/changes"/);
    });
});
