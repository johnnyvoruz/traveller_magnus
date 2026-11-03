/**
 * DP2: a player sees the party ship's sections. On the player's record page of a players vessel that is
 * one of the party's ships, Cargo, Passengers, Fuel and the Ledger read as the referee's sections do, less
 * every control and referee-only mark, and the ship sheet reads as text at the end; a players vessel that
 * is not the party's reads as before. The words come from the projection as it arrives (players_view.ts).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { deckPlanOf, fuelWords, holdWords, isPartyShip, LEDGER_KIND_WORDS, tonsWords } from '../../apps/web/src/workspace/players/player_ship.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const webRoot = path.join(root, 'apps', 'web');
const read = (rel) => fs.readFileSync(path.join(webRoot, 'src', rel), 'utf8');

const rid = (n) => 'cr_00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const stamp = '2026-11-01T00:00:00.000Z';
const record = (n, type, name, visibility, over = {}) => ({
    id: rid(n), type, kind: '', name, summary: '', details: '', tags: [], anchor: null, when: null, visibility,
    playerNotes: null, sheet: null, status: null, images: null, provenance: null, rev: 3, createdAt: stamp, updatedAt: stamp, deleted: false, ...over,
});
const settings = (party) => ({ party: { vesselIds: [], aboard: {}, memberIds: [], anchor: null, ...party }, kinds: {}, calendar: { dateFormat: 'imperial' }, rev: 2 });
const ledger = Array.from({ length: 12 }, (_, i) => ({ when: { year: 1105, day: 10 + i }, amount: i % 3 === 0 ? 4000 : -1500, memo: 'Line ' + (i + 1), kind: i % 3 === 0 ? 'income' : 'expense' }));
const ship = () => record(1, 'vessel', 'Kestrel Dawn', 'players', {
    playerNotes: 'Your ship.',
    sheet: { schema: 'mgt2e_ship_sheet@1', fields: { 'Jump Drive Output': '2', 'Cargo Capacity': '64', 'Fuel Capacity': '41', 'Staterooms': '10', 'Mortgage Cost': '160,000' } },
    status: {
        cargo: [{ label: 'Grain', tons: 12, value: 2400, origin: 'Regina' }, { label: 'Freight, major lot', tons: 20, payCr: 20000, note: 'Cr20,000 on delivery', destination: 'Jenghe' }],
        passengers: [{ label: 'Tam Oduya', class: 'Middle', fareCr: 6600, personId: rid(2) }, { label: 'Ree Chandra', class: 'High' }],
        ledger,
        fuelTons: 30,
        fuelMark: 'naval',
    },
});
/** The words on screen: the markup's attributes are not words a player reads. */
const words = (html) => html.replace(/<[^>]+>/g, ' ');
/** The referee's controls and marks, as words; "Boarded, Cr6,600" is a fare, not the Board button. */
const CONTROL_WORDS = /\b(Add a lot|Deliver|Board|Disembark|Roll a passenger|Refuel|Base fuel|Naval|Post this month|Pay now|Set a payment|Trade here|Find passengers|Take|Remove|Set up the ship|Add a line|Add an owner|referee)\b/i;

test('the rule: a players vessel among the party\'s ships, and nothing else', () => {
    const party = { vesselIds: [rid(1), rid(3)] };
    assert.equal(isPartyShip(ship(), party), true);
    assert.equal(isPartyShip(record(3, 'vessel', 'Tender', 'players'), party), true, 'the second ship too, not only "Your ship"');
    assert.equal(isPartyShip(record(4, 'vessel', 'Other', 'players'), party), false, 'a players vessel that is not the party\'s');
    assert.equal(isPartyShip(record(1, 'vessel', 'Hidden', 'referee'), party), false);
    assert.equal(isPartyShip(record(1, 'person', 'Mara', 'players'), party), false);
    assert.equal(isPartyShip({ ...ship(), deleted: true }, party), false);
    assert.equal(isPartyShip(ship(), null), false);
    assert.equal(isPartyShip(ship(), { vesselIds: null }), false);
    assert.equal(isPartyShip(null, party), false);
});

test('the words: tons, the hold, the fuel, the ledger kinds; the deck plan only when the sheet holds one', () => {
    assert.equal(tonsWords(12), '12 t');
    assert.equal(tonsWords(12.25), '12.3 t');
    assert.equal(holdWords(12, 64), '12 t of 64 t');
    assert.equal(holdWords(12, null), '12 t aboard.');
    assert.equal(fuelWords(30, 41), '30 t of 41 t');
    assert.equal(fuelWords(null, 41), 'Fuel Capacity 41 t. The fuel aboard is not written yet.');
    assert.equal(fuelWords(30, null), '30 t aboard.');
    assert.equal(fuelWords(null, null), 'The ship sheet says nothing about fuel yet.');
    assert.deepEqual(LEDGER_KIND_WORDS, { income: 'Income', expense: 'Expense', recurring: 'Recurring cost' });
    assert.equal(deckPlanOf(null), null);
    assert.equal(deckPlanOf({ fields: {} }), null);
    assert.equal(deckPlanOf({ deckPlan: { not: 'a plan' } }), null);
});

describe('the player\'s record page renders the party ship', { concurrency: 1 }, () => {
    let server = null;
    let cacheDir = '';
    let store = null;

    test.before(async () => {
        cacheDir = fs.mkdtempSync(path.join(tmpdir(), 'd-player-ship-'));
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
        for (const key of Object.keys(campaign.links)) delete campaign.links[key];
        campaign.settings = settings(party);
        campaign.clock = { days: 1105 * 365 + 13, rev: 1 };
        campaign.status = 'ready';
        campaign.role = 'player';
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

    const page = () => render('/src/workspace/players/PlayerRecordPage.vue', { id: rid(1), beside: false });
    const between = (html, from, to) => html.slice(html.indexOf(from), to ? html.indexOf(to) : undefined);

    test('the party ship: Cargo, Passengers, Fuel and the Ledger under the place, the sheet at the end, no control', async () => {
        hold([ship(), record(2, 'person', 'Tam Oduya', 'players')], { vesselIds: [rid(1)] });
        const html = await page();
        assert.match(html, /For players<\/h3><p class="prec-text">Your ship\.<\/p>/);
        const sections = between(html, '<div class="pship" data-player-ship', '<section class="sheet psheet-read"');
        assert.ok(sections.length > 0, 'the sections, then the sheet');
        assert.match(sections, /Cargo <span class="ui-frame-count">2<\/span>/);
        assert.match(sections, /data-hold-words>32 t of 64 t<\/span>/, 'the hold is 32 t of 64 t: the manifest counts, not the player');
        assert.match(sections, /<b>Grain<\/b> <span class="pship-num">12 t<\/span>/);
        assert.match(sections, /data-lot-meta>Cr2,400 · from Regina<\/span>/);
        assert.match(sections, /Cr20,000 on delivery/);
        assert.match(sections, /data-lot-meta>to Jenghe · Cr20,000 on delivery<\/span>/, 'no separator leads (DF34)');
        assert.match(sections, /Passengers <span class="ui-frame-count">2<\/span>/);
        assert.match(sections, /<button type="button" class="pship-link">Tam Oduya<\/button>/, 'a kept person opens their record');
        assert.match(sections, /<b>Ree Chandra<\/b>/);
        assert.match(sections, /<span class="pship-class">Middle<\/span>/);
        assert.match(sections, /data-fare>Boarded, Cr6,600<\/span>/);
        assert.match(sections, /data-fuel-words>30 t of 41 t<\/span>/);
        assert.match(sections, /role="meter" aria-valuenow="30"/);
        assert.match(sections, /Ledger <span class="ui-frame-count">Cr4,000<\/span>/, 'four incomes of Cr4,000 less eight of Cr1,500');
        assert.equal((sections.match(/data-ledger-line/g) || []).length, 10, 'folded at ten (DU38)');
        assert.match(sections, /data-ledger-more>Show all 12 lines<\/button>/);
        assert.match(sections, /021-1105/, 'newest day first');
        assert.match(sections, /Line 12 <small class="pship-kind">Expense<\/small>/);
        assert.doesNotMatch(sections, /<input|<select|<textarea|<form/, 'no control');
        assert.deepEqual([...sections.matchAll(/<button[^>]*class="([^"]+)"/g)].map((m) => m[1]).filter((c) => c !== 'pship-link' && c !== 'pship-more'), [], 'the only buttons open a record or unfold a list');
        assert.doesNotMatch(words(sections), CONTROL_WORDS);
        const sheet = between(html, '<section class="sheet psheet-read" data-player-sheet');
        assert.match(sheet, /<h3 class="ui-heading ui-kicker">Sheet<\/h3>/);
        assert.match(sheet, /Jump Drive Output<\/span><span class="sheet-input is-tag psheet-value" title="Jump Drive Output">2<\/span>/);
        assert.match(sheet, /title="Cargo Capacity">64<\/span>/);
        assert.match(sheet, /Tam Oduya/, 'the Passenger rows are the manifest, as on the referee\'s sheet');
        assert.doesNotMatch(sheet, /<input|<select|<textarea/, 'the sheet reads as text');
        assert.doesNotMatch(words(sheet), /Naval|referee/i);
        assert.doesNotMatch(html, /data-ship-setup/, 'the Set up card is the referee\'s');
        assert.equal(html.indexOf('data-player-ship') > html.indexOf('id="prec-where"'), true, 'under the place');
    });

    test('a players vessel that is not the party\'s, and a person, read as before', async () => {
        hold([ship()], { vesselIds: [rid(5)] });
        const other = await page();
        assert.doesNotMatch(other, /data-player-ship|data-player-sheet/);
        assert.match(other, /For players<\/h3><p class="prec-text">Your ship\.<\/p>/);
        hold([record(1, 'person', 'Mara Vell', 'players', { playerNotes: 'A broker.' })], { vesselIds: [rid(1)] });
        const person = await page();
        assert.doesNotMatch(person, /data-player-ship|data-player-sheet/);
    });

    test('an empty party ship says so, and a fuel capacity with nothing aboard says what is missing', async () => {
        hold([record(1, 'vessel', 'Bare Hull', 'players', { sheet: { schema: 'mgt2e_ship_sheet@1', fields: { 'Fuel Capacity': '41' } } })], { vesselIds: [rid(1)] });
        const html = await page();
        assert.match(html, /data-hold-words>0 t aboard\.<\/span>/);
        assert.match(html, /<p class="pship-none">The hold is empty\.<\/p>/);
        assert.match(html, /<p class="pship-none">No passengers\.<\/p>/);
        assert.match(html, /data-fuel-words>Fuel Capacity 41 t\. The fuel aboard is not written yet\.<\/span>/);
        assert.match(html, /<p class="pship-none">Nothing on the ledger yet\.<\/p>/);
        assert.doesNotMatch(html, /data-ledger-more|data-passengers-more/);
    });
});

test('pins: the page mounts both under the rule; the words are the referee\'s; the projection drops the base fuel mark', () => {
    const page = read('workspace/players/PlayerRecordPage.vue');
    assert.match(page, /const partyShip = computed\(\(\) => isPartyShip\(record\.value, campaign\.settings \? campaign\.settings\.party : null\)\);/);
    assert.match(page, /<\/section>\s+<PlayerShip v-if="partyShip" :id="record\.id" @open="emit\('open', \$event\)" \/>\s+<section v-if="record\.summary\.trim\(\)"/, 'under the place, before the summary');
    assert.match(page, /<PlayerShipSheet v-if="partyShip" :id="record\.id" @open="emit\('open', \$event\)" \/>\s+<\/article>/, 'the sheet last, as on the referee\'s page');
    const trade = read('workspace/VesselTrade.vue');
    assert.match(trade, /const KIND_WORDS: Record<LedgerLine\['kind'\], string> = \{ income: 'Income', expense: 'Expense', recurring: 'Recurring cost' \};/, 'the referee\'s kind words, which LEDGER_KIND_WORDS copies');
    const shipView = read('workspace/players/PlayerShip.vue');
    assert.match(shipView, /shownRows\(ledger\.value\.length, allLines\.value\)/, 'the fold at ten (DU38)');
    assert.match(shipView, /shownRows\(passengers\.value\.length, allPassengers\.value\)/);
    assert.doesNotMatch(shipView, /fuelMarkOf|fuelMark|writeTrade|saveRecord/, 'no mark, no write');
    const sheetView = read('workspace/players/PlayerShipSheet.vue');
    assert.match(sheetView, /sheetView\(record\.value\)/, 'the sheet with the manifest rows written in, as the referee\'s');
    assert.doesNotMatch(sheetView, /writeTrade|saveRecord|<input|<textarea|<select/);
    for (const file of [shipView, sheetView, page]) {
        assert.doesNotMatch(file, /#[0-9a-f]{3,6}\b/i, 'tokens only');
        assert.doesNotMatch(file, /\bwindow\.|\bdocument\./);
    }
    const projection = fs.readFileSync(path.join(root, 'packages/shared/src/players_view.ts'), 'utf8');
    assert.match(projection, /if \(key === 'fuelMark' \|\| key === 'roles'\) continue;/, 'the read the page uses drops the base fuel mark, and the crew switches, before it arrives');
    assert.match(projection, /sheet: redactValue\(record\.sheet, records, hiddenIds\),\s+status: projectStatus\(record\.status, records, hiddenIds, kept, index\),/, 'and keeps the sheet and the status');
});
