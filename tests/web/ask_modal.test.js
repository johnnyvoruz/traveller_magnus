/**
 * DU23: one modal frame, one confirm, one toast rule. The confirm (shell/AskModal.vue) in the shared frame:
 * its title and text, Cancel (or the screen's own words) and the confirm, red for a delete, its busy words,
 * the reason box. Who uses it: the store's report, take down, restore and remove, the Player Pack, deleting a
 * campaign. The store's old copy is gone. Toasts never stack past two. No native dialog anywhere.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { dismissToast, showToast, toasts } from '../../apps/web/src/shell/toast.ts';
import { deleteWhat, deleteWords } from '../../apps/web/src/workspace/campaigns.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const webRoot = path.join(root, 'apps', 'web');
const read = (rel) => fs.readFileSync(path.join(webRoot, 'src', rel), 'utf8');

describe('the confirm', { concurrency: 1 }, () => {
    let server = null;
    let cacheDir = '';

    test.before(async () => {
        cacheDir = fs.mkdtempSync(path.join(tmpdir(), 'd-ask-'));
        const { createServer } = await import('vite');
        server = await createServer({ root: webRoot, cacheDir, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'silent' });
    });

    test.after(async () => {
        if (server) await server.close();
        if (cacheDir) fs.rmSync(cacheDir, { recursive: true, force: true, maxRetries: 5 });
    });

    async function render(props) {
        const view = (await server.ssrLoadModule('/src/shell/AskModal.vue')).default;
        const { createSSRApp, h } = await import('vue');
        const { renderToString } = await import('vue/server-renderer');
        const ctx = {};
        const html = await renderToString(createSSRApp({ render: () => h(view, props) }), ctx);
        return html + ((ctx.teleports && ctx.teleports.body) || '');
    }

    test('in the shared frame: an alert dialog with its title and text, Cancel then the confirm', async () => {
        const html = await render({ title: 'Download the Player Pack?', text: 'It holds 3 handouts.', confirm: 'Download' });
        assert.match(html, /class="ui-modal ui-ask" role="alertdialog" aria-modal="true" aria-labelledby="ui-ask-h" aria-describedby="ui-ask-text"/);
        assert.match(html, /class="ui-modal-scrim"/);
        assert.match(html, /class="ui-modal-card ui-ask-card"/);
        assert.match(html, /<h2 id="ui-ask-h"[^>]*>Download the Player Pack\?<\/h2>/);
        assert.match(html, /<p id="ui-ask-text"[^>]*>It holds 3 handouts\.<\/p>/);
        assert.match(html, /data-ask-cancel[^>]*>Cancel<\/button>[\s\S]*data-ask-confirm[^>]*>Download<\/button>/);
        assert.doesNotMatch(html, /is-danger/);
        assert.doesNotMatch(html, /<textarea/);
    });

    test('a delete: the screen\'s own back-out words, red, its busy words; a reason when asked', async () => {
        const html = await render({ title: 'Delete Traders?', text: deleteWhat(31), confirm: 'Delete', cancelLabel: 'Keep it', danger: true, busy: true, busyText: 'Deleting…' });
        assert.match(html, />Keep it<\/button>/);
        assert.match(html, /<button type="submit" class="[^"]*\bis-danger\b[^"]*"[^>]*data-ask-confirm>Deleting…<\/button>/);
        assert.match(html, /Its 31 records go with it\. This cannot be undone\./);
        const asked = await render({ title: 'Report this package', text: 'Say what is wrong.', confirm: 'Report', reason: true, error: 'That did not send.' });
        assert.match(asked, /<span>Reason<\/span><textarea[^>]*maxlength="500"/);
        assert.match(asked, /class="ui-ask-err" role="alert">That did not send\./);
        assert.match(asked, /<button type="submit"[^>]* disabled data-ask-confirm>Report<\/button>/, 'no reason yet, no confirm');
    });
});

test('the delete words: the title asks, the text says what goes', () => {
    assert.equal(deleteWhat(null), 'Everything in it goes with it. This cannot be undone.');
    assert.equal(deleteWhat(0), 'It has no records. This cannot be undone.');
    assert.equal(deleteWhat(1), 'Its one record goes with it. This cannot be undone.');
    assert.equal(deleteWords('Traders', 2), 'Delete Traders? Its 2 records go with it. This cannot be undone.', 'unchanged');
});

test('who uses the one confirm; the store\'s copy is gone', () => {
    const users = {
        'workspace/market/ProductPage.vue': 3,
        'workspace/market/ImportsList.vue': 1,
        'workspace/journal/JournalList.vue': 1,
        'workspace/CampaignsPanel.vue': 1,
        'characters/screens/CharactersPanel.vue': 1,
    };
    for (const [file, count] of Object.entries(users)) {
        const source = read(file);
        assert.match(source, /import AskModal from '[./]+shell\/AskModal\.vue';/, file);
        assert.equal((source.match(/<AskModal\b/g) || []).length, count, file);
    }
    assert.equal(fs.existsSync(path.join(webRoot, 'src', 'workspace', 'market', 'MarketAsk.vue')), false);
    assert.doesNotMatch(read('workspace/journal/JournalList.vue'), /class="jn-ask"/);
    assert.doesNotMatch(read('workspace/CampaignsPanel.vue'), /cps-delete-q/);
    // DU23b: the Characters pane's own strip is gone; the store's words are the campaign delete's shape.
    assert.doesNotMatch(read('characters/screens/CharactersPanel.vue'), /ch-ask/);
    assert.match(read('characters/store.ts'), /askConfirm\('Delete ' \+ name \+ '\?', DELETE_WHAT\)/);
    assert.match(read('characters/store.ts'), /no: 'Keep it'/);
});

test('toasts never stack past two: a third replaces the oldest', () => {
    for (const toast of [...toasts]) dismissToast(toast.id);
    showToast('One.');
    showToast('Two.');
    showToast('Three.');
    assert.deepEqual(toasts.map((toast) => toast.message), ['Two.', 'Three.']);
    for (const toast of [...toasts]) dismissToast(toast.id);
});

test('no native dialog in the app', () => {
    const files = [];
    const walk = (dir) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) walk(full);
            else if (/\.(ts|vue)$/.test(entry.name)) files.push(full);
        }
    };
    walk(path.join(webRoot, 'src'));
    for (const file of files) {
        const source = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
        assert.doesNotMatch(source, /(^|[^\w.])(window\.)?(alert|confirm|prompt)\(/m, path.relative(root, file));
    }
});
