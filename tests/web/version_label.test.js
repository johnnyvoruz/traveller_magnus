/**
 * The app's version at the foot of the sign-in card, the account page and the signed-in
 * account menu (prompts/d_version_label.md, prompts/e_changelog.md): "Version N · What's new",
 * read from APP_VERSION, never typed, outside the menu's items, styled as a text link.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { APP_VERSION } from '../../apps/web/src/version.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const webRoot = path.join(root, 'apps', 'web');
const src = path.join(webRoot, 'src');
let cacheDir = '';
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

test('each line reads APP_VERSION and opens What\'s new', () => {
    assert.match(APP_VERSION, /^\d+\.\d+\.\d+$/);
    for (const file of FILES) {
        const source = read(file);
        assert.match(source, /import \{ APP_VERSION \} from '(\.\.\/)+version\.ts';/, file);
        assert.match(source, /data-version[^>]*>Version \{\{ APP_VERSION \}\} · What's new<\/button>/, file);
        assert.ok(!source.includes(APP_VERSION), file + ': the number is never typed');
        const rule = source.match(/-version \{([^}]*)\}/);
        assert.ok(rule, file + ': its rule');
        for (const line of ['color: var(--signal);', 'text-decoration: underline;', 'cursor: pointer;']) assert.ok(rule[1].includes(line), file + ' ' + line);
    }
    // Signed out, the account page shows the sign-in card, which says the version once.
    assert.match(read('workspace/passkey/AccountPage.vue'), /<button v-if="phase !== 'out' && phase !== 'loading'" type="button" class="pk-version" data-version/);
    assert.equal(read('workspace/passkey/SignInBody.vue').includes('ChangelogWindow'), false);
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
        cacheDir = fs.mkdtempSync(path.join(tmpdir(), 'd-version-ssr-'));
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
        assert.match(html, new RegExp('class="signin-version" data-version>Version ' + APP_VERSION.replaceAll('.', '\\.') + ' · What&#39;s new</button><!--\\]--></div>$'));
    });

    test('the signed-in account menu ends with the version, outside its items', async () => {
        session.user = { id: 'me', email: null, role: 'user', profile: { handle: 'varn' } };
        const html = await render('/src/workspace/AccountMenu.vue', { open: true }, true);
        session.user = null;
        const line = 'class="account-version" data-version>Version ' + APP_VERSION + ' · What&#39;s new</button>';
        assert.ok(html.includes(line), html.slice(html.lastIndexOf('data-version') - 80));
        const menu = html.slice(html.indexOf('role="menu"'));
        assert.ok(menu.indexOf('data-command="sign-out"') < menu.indexOf(line), 'after Sign out');
        assert.match(html, new RegExp(line.replaceAll('.', '\\.') + '<!----><!--\\]--></section>'));
    });
});
