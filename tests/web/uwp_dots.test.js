/**
 * The UWP ribbon tiles keep the note and drop the dotted underline. Every other
 * CodeNote keeps the underline class (prompts/e_uwp_dots.md).
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

const cells = {
    kind: 'cells',
    dash: '-',
    cells: [
        { digit: 'A', label: 'Port' }, { digit: '7', label: 'Size' }, { digit: '8', label: 'Atm' },
        { digit: '8', label: 'Hyd' }, { digit: '8', label: 'Pop' }, { digit: '9', label: 'Gov' },
        { digit: '9', label: 'Law' }, { digit: 'C', label: 'TL' },
    ],
};

describe('UWP ribbon notes', { concurrency: 1 }, () => {
    /** @type {import('vite').ViteDevServer | null} */
    let server = null;

    test.before(async () => {
        cacheDir = fs.mkdtempSync(path.join(tmpdir(), 'e-uwp-ssr-'));
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

    async function render(file, props) {
        const component = (await server.ssrLoadModule(file)).default;
        const { createSSRApp } = await import('vue');
        const { renderToString } = await import('vue/server-renderer');
        return renderToString(createSSRApp(component, props));
    }

    test('ribbon cells render without the underline class, and the whole-code line keeps it', async () => {
        const tiles = await render('/src/dossier/UwpRibbon.vue', { ribbon: cells });
        assert.equal(tiles.includes('doss-note-underline'), false);
        assert.equal((tiles.match(/doss-note-term/g) || []).length, 8);
        assert.match(tiles, /role="tooltip"/);

        const plain = await render('/src/dossier/UwpRibbon.vue', { ribbon: { kind: 'plain', text: 'A788899-C' } });
        assert.match(plain, /class="doss-note-underline doss-note-term"/);
    });

    test('a stat row keeps the underline class', async () => {
        const html = await render('/src/dossier/StatRows.vue', {
            rows: [{ label: 'Travel zone', text: 'A', code: 'A', name: 'Amber' }],
        });
        assert.match(html, /class="doss-note-underline doss-note-term"/);
    });
});
