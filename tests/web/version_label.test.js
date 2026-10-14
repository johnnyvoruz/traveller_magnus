/**
 * The app's version at the foot of the sign-in card, the account page and the signed-in
 * account menu (prompts/d_version_label.md): "Version 1.1.N", read from APP_VERSION, never
 * typed; the smallest text, muted, selectable, and outside the menu's items.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { APP_VERSION } from '../../apps/web/src/version.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const webRoot = path.join(root, 'apps', 'web');
const src = path.join(webRoot, 'src');
const cacheDir = path.join(root, '.tmp', 'd-version-ssr');
const read = (file) => fs.readFileSync(path.join(src, file), 'utf8');

const FILES = ['workspace/passkey/SignInBody.vue', 'workspace/passkey/AccountPage.vue', 'workspace/AccountMenu.vue'];

/** The relative luminance of a #rrggbb token (WCAG 2). */
function luminance(hex) {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function token(name) {
    const found = read('design/tokens.css').match(new RegExp('\\n\\s*' + name + ':\\s*(#[0-9a-fA-F]{6})\\b'));
    assert.ok(found, name);
    return found[1];
}

test('each line reads APP_VERSION and is small, muted and selectable', () => {
    assert.match(APP_VERSION, /^\d+\.\d+\.\d+$/);
    for (const file of FILES) {
        const source = read(file);
        assert.match(source, /import \{ APP_VERSION \} from '(\.\.\/)+version\.ts';/, file);
        assert.match(source, /data-version>Version \{\{ APP_VERSION \}\}<\/p>/, file);
        assert.ok(!source.includes(APP_VERSION), file + ': the number is never typed');
        const rule = source.match(/-version \{([^}]*)\}/);
        assert.ok(rule, file + ': its rule');
        for (const line of ['color: var(--text-muted);', 'font-size: 11px;', 'user-select: text;']) assert.ok(rule[1].includes(line), file + ' ' + line);
    }
    // Signed out, the account page shows the sign-in card, which says the version once.
    assert.match(read('workspace/passkey/AccountPage.vue'), /<p v-if="phase !== 'out' && phase !== 'loading'" class="pk-version" data-version>/);
});

test('the muted text is readable on each window', () => {
    const text = luminance(token('--text-muted'));
    for (const ground of ['--bg-0', '--bg-1', '--chrome-bg']) {
        const ratio = (text + 0.05) / (luminance(token(ground)) + 0.05);
        assert.ok(ratio >= 4.5, ground + ' ' + ratio.toFixed(2));
    }
});

describe('rendered', { concurrency: 1 }, () => {
    /** @type {import('vite').ViteDevServer | null} */
    let server = null;
    /** @type {{ user: object | null }} */
    let session = { user: null };

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
        session = (await server.ssrLoadModule('/src/account/session.ts')).session;
    });

    test.after(async () => {
        session.user = null;
        if (server) await server.close();
        fs.rmSync(cacheDir, { recursive: true, force: true });
    });

    async function render(file, props, teleported) {
        const component = (await server.ssrLoadModule(file)).default;
        const { createSSRApp } = await import('vue');
        const { renderToString } = await import('vue/server-renderer');
        const { createMemoryHistory, createRouter } = await import('vue-router');
        const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component }] });
        await router.push('/');
        await router.isReady();
        const ctx = {};
        const html = await renderToString(createSSRApp(component, props).use(router), ctx);
        return teleported ? (ctx.teleports && ctx.teleports.body) || '' : html;
    }

    test('the sign-in card ends with the version', async () => {
        session.user = null;
        const html = await render('/src/workspace/passkey/SignInBody.vue', { heading: true }, false);
        assert.match(html, new RegExp('<p class="signin-version" data-version>Version ' + APP_VERSION.replaceAll('.', '\\.') + '</p></div>$'));
    });

    test('the signed-in account menu ends with the version, outside its items', async () => {
        session.user = { id: 'me', email: null, role: 'user', profile: { handle: 'varn' } };
        const html = await render('/src/workspace/AccountMenu.vue', { open: true }, true);
        session.user = null;
        const line = '<p class="account-version" data-version>Version ' + APP_VERSION + '</p>';
        assert.ok(html.includes(line), 'the line');
        const menu = html.slice(html.indexOf('role="menu"'));
        assert.ok(menu.indexOf('data-command="sign-out"') < menu.indexOf(line), 'after Sign out');
        assert.match(html, new RegExp(line.replaceAll('.', '\\.') + '<!--\\]--></section>|' + line.replaceAll('.', '\\.') + '</section>'));
    });
});
