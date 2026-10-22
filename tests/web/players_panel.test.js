/**
 * P6 (players_build_plan.md): the player's campaign panel. Each screen rendered for a player: the
 * record read-only with "For players" as its body, the Party with "Where are we" and "Your ship", the
 * journal with Add a note only, the records list with no Add; never a count of hidden things (F24).
 * View as players (P5) loads the projection as a player's page would, and nothing can be written.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const webRoot = path.join(root, 'apps', 'web');
const read = (rel) => fs.readFileSync(path.join(webRoot, 'src', rel), 'utf8');

const rid = (n) => 'cr_00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const stamp = '2026-10-17T00:00:00.000Z';
const record = (n, type, name, visibility, over = {}) => ({
    id: rid(n), type, kind: '', name, summary: '', details: '', tags: [], anchor: null, when: null, visibility,
    playerNotes: null, sheet: null, status: null, images: null, provenance: null, rev: 3, createdAt: stamp, updatedAt: stamp, deleted: false, ...over,
});
const settings = (party) => ({ party: { vesselIds: [], aboard: {}, memberIds: [], anchor: null, ...party }, kinds: {}, calendar: { dateFormat: 'imperial' }, rev: 2 });
// No count, no "left out", no "not marked": a player never learns how much is hidden.
const HIDDEN_WORDS = /left out|not marked|hidden|not shared|referee only/i;
/** The words on screen: the markup's attributes (aria-hidden) are not words a player reads. */
const words = (html) => html.replace(/<[^>]+>/g, ' ');

describe('the player\'s screens render', { concurrency: 1 }, () => {
    let server = null;
    let cacheDir = '';
    let store = null;

    test.before(async () => {
        cacheDir = fs.mkdtempSync(path.join(tmpdir(), 'd-players-panel-'));
        const { createServer } = await import('vite');
        server = await createServer({ root: webRoot, cacheDir, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'silent' });
        store = await server.ssrLoadModule('/src/campaign/store.ts');
    });

    test.after(async () => {
        if (server) await server.close();
        if (cacheDir) fs.rmSync(cacheDir, { recursive: true, force: true, maxRetries: 5 });
    });

    function hold(records, party = {}) {
        const { campaign } = store;
        for (const key of Object.keys(campaign.records)) delete campaign.records[key];
        for (const row of records) campaign.records[row.id] = row;
        campaign.settings = settings(party);
        campaign.clock = null;
        campaign.status = 'ready';
        campaign.universeId = 'u_test';
    }

    async function render(file, props = {}) {
        const view = (await server.ssrLoadModule(file)).default;
        const { createSSRApp } = await import('vue');
        const { renderToString } = await import('vue/server-renderer');
        const { createRouter, createMemoryHistory } = await import('vue-router');
        const app = createSSRApp(view, props);
        const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:any(.*)*', component: { render: () => null } }] });
        app.use(router);
        await router.push('/');
        await router.isReady();
        return (await renderToString(app)).replace(/<!--[\s\S]*?-->/g, '');
    }

    test('a record: read-only, "For players" as its body, then what the projection carries', async () => {
        hold([record(1, 'person', 'Mara Vell', 'players', { playerNotes: 'A broker who pays on time.', summary: 'Broker at the highport.', tags: ['contact'] })]);
        store.campaign.role = 'player';
        const html = await render('/src/workspace/players/PlayerRecordPage.vue', { id: rid(1), beside: false });
        assert.match(html, /<h2 class="prec-name">Mara Vell<\/h2>/);
        assert.match(html, /For players<\/h3><p class="prec-text">A broker who pays on time\.<\/p>/);
        assert.match(html, /Broker at the highport\./);
        assert.doesNotMatch(html, /<input|<textarea|<select|contenteditable|Delete|Change/, 'nothing to change');
        assert.doesNotMatch(words(html), HIDDEN_WORDS);
        const gone = await render('/src/workspace/players/PlayerRecordPage.vue', { id: rid(9), beside: false });
        assert.match(gone, /This record is not here\./);
        assert.doesNotMatch(words(gone), HIDDEN_WORDS);
    });

    test('the Party: Where are we, Your ship, the people; nothing to change', async () => {
        const ship = record(2, 'vessel', 'Quiet Keel', 'players', { anchor: { kind: 'system', hexKey: 'Spinward_Marches/1910', bodyKey: null, locationLabel: 'Regina' } });
        const mara = record(1, 'person', 'Mara Vell', 'players');
        hold([ship, mara], { vesselIds: [ship.id], memberIds: [mara.id], aboard: { [mara.id]: ship.id } });
        const html = await render('/src/workspace/players/PlayerParty.vue');
        assert.match(html, /Where are we<\/h3>/);
        assert.match(html, /Regina system/);
        assert.match(html, /Your ship<\/h3>[\s\S]*?Quiet Keel/);
        assert.match(html, /The party <span class="ui-count">1<\/span>[\s\S]*?Mara Vell/);
        assert.doesNotMatch(html, /Move the party|Add a ship|Add someone|Make lead|<select/);
        assert.doesNotMatch(words(html), HIDDEN_WORDS);
    });

    test('View as players: the projection, as a player\'s page; the role is player, so nothing can be written', async () => {
        const shared = record(1, 'person', 'Mara Vell', 'players');
        const secret = record(2, 'person', 'The Hidden Hand', 'referee');
        hold([shared, secret]);
        store.campaign.role = 'owner';
        const viewAs = await server.ssrLoadModule('/src/workspace/players/view_as.ts');
        assert.equal(await viewAs.startViewAs(), true);
        assert.equal(viewAs.viewAs.on, true);
        assert.equal(store.campaign.role, 'player');
        assert.deepEqual(Object.keys(store.campaign.records), [shared.id], 'the referee-only record is gone from the view');
        assert.equal(store.campaign.records[shared.id].rev, 0, 'held as a player holds it');
        const { commit } = await server.ssrLoadModule('/src/campaign/commit.ts');
        const { pending } = await server.ssrLoadModule('/src/campaign/commit.ts');
        commit({ records: [{ ...shared, name: 'Changed', baseRev: 0 }] });
        assert.equal(store.campaign.records[shared.id].name, 'Mara Vell', 'a record change is refused');
        assert.equal(pending.value, false);
        viewAs.viewAs.on = false;
        store.campaign.role = null;
    });
});

test('the panel: player screens in place of the referee\'s; the journal\'s one way to write; the poll; gone', () => {
    const panel = read('workspace/CampaignPanel.vue');
    assert.match(panel, /<PlayerRecordPage v-if="recordId && isPlayer"/);
    assert.match(panel, /<PlayerRecordPage v-else-if="recordId && isPlayer"/);
    assert.match(panel, /<PlayerParty v-else-if="tab === 'party' && !recordId && isPlayer"/);
    assert.match(panel, /:read-only="ro" :player="isPlayer"/);
    // Read-only offline, and in the example campaign (DL8).
    assert.match(panel, /:read-only="!online \|\| example\.on" :player="isPlayer"/);
    assert.match(panel, /if \(isPlayer\.value && kind !== 'note'\) return;/);
    assert.match(panel, /<p v-if="status === 'gone'" class="camp-strip is-error" role="alert" data-campaign-gone>\{\{ NOT_IN_CAMPAIGN \}\}<\/p>/);
    assert.match(panel, /watch\(\(\) => props\.open && status\.value === 'ready' && !viewAs\.on, \(on\) => \{ watchCampaignPanel\(on\); \}, \{ immediate: true \}\);/);
    assert.match(panel, /<ViewAsBar v-if="status === 'ready' && !example\.on" \/>/, 'not in the example campaign (DL8)');
    const journal = read('workspace/journal/JournalList.vue');
    assert.match(journal, /<button v-if="player"[^>]*data-player-add-note[^>]*>\s*<Icon name="plus" :size="13" \/>Add a note/);
    assert.match(journal, /<div v-if="!first && !player" class="jn-pack">/, 'the Player Pack and its counts are the referee\'s');
    const list = read('workspace/CampaignList.vue');
    assert.match(list, /<AddButton v-if="!player"/);
    assert.match(list, /<p v-if="first && player" class="camp-first-player" data-player-empty>No records here yet\.<\/p>/);
    const rail = read('shell/Rail.vue');
    assert.match(rail, /v-if="lockedGuest \|\| buildOffered \|\| playerLock"/);
    assert.match(read('workspace/players/player_mode.ts'), /export const BUILD_REFEREE = 'Only the referee can use Build\.';/);
    for (const file of ['workspace/players/PlayerRecordPage.vue', 'workspace/players/PlayerParty.vue', 'workspace/players/ViewAsBar.vue']) {
        assert.doesNotMatch(words(read(file).split('<template>')[1].split('<style>')[0]), HIDDEN_WORDS, file);
    }
});

test('a player\'s note: kind note, by and for the players, no images; their own once made', async () => {
    const mode = read('workspace/players/player_mode.ts');
    assert.match(mode, /return \{ \.\.\.draft, author: 'players', visibility: 'players' \};/);
    assert.match(mode, /const \{ images: _images, \.\.\.draft \} = draftNote\(\);/);
    assert.match(mode, /return entry\.rev > 0 \|\| madeHere\.has\(entry\.id\);/);
});
