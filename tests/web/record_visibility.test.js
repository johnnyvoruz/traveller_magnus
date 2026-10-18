/**
 * Who can see a record, and the player notes under the referee's text
 * (apps/web/src/workspace/RecordPage.vue). The account menu hides its file
 * input the same way VesselPlan.vue hides one (apps/web/src/workspace/AccountMenu.vue).
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
const personId = 'cr_00000001-0000-4000-8000-000000000000';
const placeId = 'cr_00000002-0000-4000-8000-000000000000';

describe('record visibility and player notes', { concurrency: 1 }, () => {
    /** @type {import('vite').ViteDevServer | null} */
    let server = null;

    test.before(async () => {
        cacheDir = fs.mkdtempSync(path.join(tmpdir(), 'e-visibility-ssr-'));
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

    test('a person and a place show the journal words, and empty player notes name the way to add', async () => {
        const person = await renderRecord(personId, 'person', 'Captain Idris Voss');
        const place = await renderRecord(placeId, 'place', 'Bay 4 Drydock');
        for (const html of [person, place]) {
            assert.match(html, /aria-label="Who can read this"/);
            assert.match(html, /aria-pressed="true"[^>]*>Referee</);
            assert.match(html, /aria-pressed="false"[^>]*>Players</);
            assert.match(html, /For players/);
            assert.match(html, /Players see this text when you share the record\./);
            assert.match(html, /No notes for players yet\./);
            assert.match(html, /Add notes for players/);
            assert.match(html, /class="rec-when"/);
            assert.match(html, /No date/);
            assert.match(html, /Set a date/);
            assert.doesNotMatch(html, /Add an end date/);
            assert.doesNotMatch(html, /class="rec-ident is-players"/);
        }
    });

    test('players visibility and written notes are what the page shows', async () => {
        const html = await renderRecord(personId, 'person', 'Captain Idris Voss', {
            visibility: 'players',
            playerNotes: 'Bring the letter.',
        });
        assert.match(html, /class="[^"]*\bis-players\b[^"]*"/);
        assert.match(html, /aria-pressed="false"[^>]*>Referee</);
        assert.match(html, /aria-pressed="true"[^>]*>Players</);
        assert.match(html, /Bring the letter\./);
        assert.doesNotMatch(html, /No notes for players yet\./);
    });

    test('a dated record shows both days in the page head', async () => {
        const html = await renderRecord(personId, 'event', 'First contract', {
            when: { start: { year: 1105, day: 40 }, end: { year: 1105, day: 48 } },
        });
        assert.match(html, /class="rec-when"/);
        assert.match(html, /040-1105/);
        assert.match(html, /048-1105/);
        assert.match(html, /aria-label="Clear the date"/);
        assert.match(html, />to</);
        assert.doesNotMatch(html, /No date/);
        assert.doesNotMatch(html, /Add an end date/);
    });

    test('the Campaigns panel hides the file input with the shipyard rule, and Import still asks for a file', () => {
        // DU10: Import moved from the account menu to the open campaign's card.
        const menu = fs.readFileSync(path.join(webRoot, 'src', 'workspace', 'CampaignsPanel.vue'), 'utf8');
        const plan = fs.readFileSync(path.join(webRoot, 'src', 'workspace', 'VesselPlan.vue'), 'utf8');
        const rule = plan.slice(plan.indexOf('.vplan-file {'), plan.indexOf('.vplan-file {') + 120);
        assert.match(menu, /class="vplan-file"/);
        assert.match(menu, /tabindex="-1"/);
        assert.match(menu, /aria-hidden="true"/);
        assert.match(menu, /Import into \{\{ openOne\?\.name \}\}…/);
        for (const line of ['position: absolute;', 'width: 1px;', 'height: 1px;', 'opacity: 0;', 'pointer-events: none;']) {
            assert.match(rule, new RegExp(line.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
            assert.match(menu, new RegExp(line.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
        }
    });

    async function renderRecord(id, type, name, over = {}) {
        const store = await server.ssrLoadModule('/src/campaign/store.ts');
        const records = await server.ssrLoadModule('/src/workspace/records.ts');
        const page = (await server.ssrLoadModule('/src/workspace/RecordPage.vue')).default;
        for (const key of Object.keys(store.campaign.records)) delete store.campaign.records[key];
        const row = records.newRecord(type, id, '2026-10-11T00:00:00.000Z');
        row.name = name;
        row.rev = 1;
        Object.assign(row, over);
        store.campaign.records[id] = row;
        store.campaign.status = 'ready';
        const { createSSRApp } = await import('vue');
        const { renderToString } = await import('vue/server-renderer');
        const { createMemoryHistory, createRouter } = await import('vue-router');
        const router = createRouter({
            history: createMemoryHistory(),
            routes: [{ path: '/:pathMatch(.*)*', component: page }],
        });
        await router.push('/');
        await router.isReady();
        return renderToString(createSSRApp(page, { id, readOnly: false, beside: false }).use(router));
    }
});
