/**
 * DL8: the example campaign from the welcome window. The entry shows only when the route answers (a 404 or a
 * 503 leaves no button); going in opens the Campaign panel on A's load, read-only, with the banner; leaving puts
 * the address back and resets the store, and a signed-in referee's campaign opens again. The fetch here
 * throws "Illegal invocation" unless it is called plainly, as a browser's does: called as `transport.fetch(...)`
 * the example never loaded in a browser.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { resetCampaign } from '../../apps/web/src/campaign/commit.ts';
import { loadDemo } from '../../apps/web/src/campaign/demo.ts';
import { campaign, transport } from '../../apps/web/src/campaign/store.ts';
import { checkExample, enterExample, example, EXAMPLE_BANNER, EXAMPLE_ENTRY, leaveExample } from '../../apps/web/src/workspace/example_campaign.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => fs.readFileSync(path.join(root, 'apps', 'web', 'src', rel), 'utf8');
const STAMP = '2026-10-04T00:00:00.000Z';

function projection() {
    return {
        records: [{
            id: 'cr_11111111-1111-4111-8111-111111111111', type: 'vessel', kind: '', name: 'Open barge', summary: '', details: '', tags: [],
            anchor: null, when: null, visibility: 'players', playerNotes: null, sheet: null, status: null, images: null,
            createdAt: STAMP, updatedAt: STAMP, deleted: false,
        }],
        links: [],
        journal: [],
        settings: { party: { vesselIds: [], aboard: {}, memberIds: [], anchor: null }, kinds: {}, calendar: { dateFormat: 'imperial' } },
        clock: { days: 1105 * 365 + 99 },
    };
}

/** A fetch that, like a browser's, refuses to be called as another object's method. */
function strictFetch(status, body) {
    const calls = [];
    const fn = function (url, init) {
        if (this !== undefined && this !== globalThis) throw new TypeError('Illegal invocation');
        calls.push({ url: String(url), credentials: init && init.credentials });
        return Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body });
    };
    return { fn, calls };
}

function fakeRouter(path, query = {}) {
    const pushed = [];
    return {
        pushed,
        currentRoute: { value: { path, query } },
        push: async (to) => { pushed.push(to); },
    };
}

function fresh() {
    resetCampaign();
    example.on = false;
    example.available = null;
    example.back = null;
}

test('the entry shows only when the route answers; asked once; no cookie', async () => {
    for (const [status, shown] of [[404, false], [503, false], [200, true]]) {
        fresh();
        const fake = strictFetch(status, status === 200 ? { ok: true, data: projection() } : { ok: false });
        transport.fetch = fake.fn;
        assert.equal(await checkExample(), shown, String(status));
        assert.equal(await checkExample(), shown);
        assert.equal(fake.calls.length, 1, 'asked once');
        assert.equal(fake.calls[0].credentials, 'omit');
    }
});

test('A\'s load works with a browser\'s fetch (a plain call)', async () => {
    fresh();
    transport.fetch = strictFetch(200, { ok: true, data: projection() }).fn;
    const page = await loadDemo();
    assert.ok(page, 'loaded');
    assert.equal(campaign.role, 'player');
    assert.equal(campaign.universeId, null);
});

test('going in from the welcome: the Campaign panel; leaving: the home map, the store reset', async () => {
    fresh();
    transport.fetch = strictFetch(200, { ok: true, data: projection() }).fn;
    const router = fakeRouter('/welcome', {});
    assert.equal(await enterExample(router), true);
    assert.equal(example.on, true);
    assert.deepEqual(router.pushed, [{ path: '/', query: { panel: 'campaign' } }]);
    assert.equal(campaign.status, 'ready');
    assert.equal(Object.keys(campaign.records).length, 1);
    await leaveExample(router);
    assert.equal(example.on, false);
    assert.deepEqual(router.pushed[1], { path: '/', query: { panel: 'closed' } });
    assert.equal(campaign.status, 'signed-out');
    assert.equal(Object.keys(campaign.records).length, 0);
});

test('going in from a hex: leaving goes back there; a missing example says so and stays', async () => {
    fresh();
    transport.fetch = strictFetch(200, { ok: true, data: projection() }).fn;
    const router = fakeRouter('/s/Spinward_Marches/1910', { panel: 'dossier', date: '120' });
    await enterExample(router);
    await leaveExample(router);
    assert.deepEqual(router.pushed[1], { path: '/s/Spinward_Marches/1910', query: { panel: 'dossier', date: '120' } });
    fresh();
    transport.fetch = strictFetch(404, { ok: false }).fn;
    const missing = fakeRouter('/welcome');
    assert.equal(await enterExample(missing), false);
    assert.equal(example.on, false);
    assert.equal(example.available, false, 'the entry goes');
    assert.deepEqual(missing.pushed, []);
});

test('the screens: the entry, the banner, read-only, the referee\'s things hidden, the date', () => {
    assert.equal(EXAMPLE_ENTRY, 'Look around an example campaign');
    assert.equal(EXAMPLE_BANNER, 'This is an example. Create an account to start your own.');
    const welcome = read('workspace/WelcomeWindow.vue');
    assert.match(welcome, /<button v-if="example\.available" type="button" class="ui-btn is-primary" :disabled="entering" data-example-enter @click="lookAround">/);
    assert.match(welcome, /onMounted\(\(\) => \{\s+document\.addEventListener\('keydown', onKey\);\s+void checkExample\(\);/);
    const panel = read('workspace/CampaignPanel.vue');
    assert.match(panel, /if \(example\.on\) return campaign\.status;\s+if \(!signedIn\.value\) return 'signed-out';/, 'signed out too');
    assert.match(panel, /<SignInCard v-if="!signedIn && !example\.on" \/>/);
    assert.match(panel, /<ExampleBar v-if="example\.on && status === 'ready'" \/>\s+<ViewAsBar v-if="status === 'ready' && !example\.on" \/>/);
    assert.equal((panel.match(/:read-only="!online \|\| example\.on" :player="isPlayer"/g) || []).length, 2, 'no Add a note');
    assert.match(panel, /const entryReadOnly = computed\(\(\) => !online\.value \|\| example\.on \|\|/);
    assert.match(panel, /const isReferee = computed\(\(\) => campaign\.role === 'owner'/, 'the example is opened as a player: no menu, no Copy for your AI, no invite');
    const bar = read('workspace/ExampleBar.vue');
    assert.match(bar, /<button v-if="!session\.user" type="button" class="example-bar-link" data-example-create @click="createAccount">Create an account<\/button>/);
    assert.match(bar, /void leaveExample\(router, \{ path: '\/', query: \{ panel: 'account' \} \}\);/, 'Create an account leaves the example first');
    assert.match(read('workspace/StardateChip.vue'), /if \(example\.on && campaign\.clock\) return stardate\(campaign\.clock\.days\);/);
});
