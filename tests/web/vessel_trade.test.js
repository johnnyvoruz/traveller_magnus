/**
 * A vessel's Cargo and Ledger (streams/D.md DT1; Epic T, step T1). The manifest has one source:
 * `status.cargo` and `status.passengers`, which the ship sheet's sixteen rows show and edit; a vessel
 * from before the manifest has its rows on the sheet until the first edit moves them. The sections are
 * rendered from a cold store (SSR), as the record page draws them.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { dayOf, dayWords, editedSheet, fuelMarkOf, isManifestField, ledgerOf, manifestOf, sheetView, signedAmount } from '../../apps/web/src/workspace/vessel_trade.ts';

const PERSON = 'cr_11111111-1111-4111-8111-111111111111';
const vessel = (over = {}) => ({
    id: 'cr_22222222-2222-4222-8222-222222222222', type: 'vessel', name: 'Bright Ledger', summary: '', details: '', tags: [], anchor: null,
    visibility: 'referee', playerNotes: '', images: [], sheet: null, when: null, status: null, rev: 3, updatedAt: '2026-10-17T00:00:00.000Z', deleted: false, ...over,
});
const sheet = (fields) => ({ format: 'mgt2e_ship_sheet@1', fields });

test('the manifest boxes are the sixteen Cargo and Passenger rows, and a passenger\'s person', () => {
    for (const name of ['Cargo Type 1', 'Cargo Tons 16', 'Cargo Notes 3', 'Passenger Name 2', 'Passage 9', 'Passenger Notes 16', 'Passenger Name 4 record']) assert.equal(isManifestField(name), true, name);
    for (const name of ['Cargo Capacity', 'Cargo Type 17', 'Passenger Capactiy', 'Fuel Capacity', 'Crew Name 1']) assert.equal(isManifestField(name), false, name);
});

test('the status is the manifest; a vessel from before it has its rows on the sheet', () => {
    const fresh = vessel({ status: { cargo: [{ label: 'Grain', tons: 12 }], passengers: [], ledger: [] } });
    assert.deepEqual(manifestOf(fresh).cargo, [{ label: 'Grain', tons: 12 }]);
    const old = vessel({ sheet: sheet({ 'Cargo Type 1': 'Ore', 'Cargo Tons 1': '30', 'Passenger Name 1': 'Ilsa Varn', 'Passenger Name 1 record': PERSON, Passage: '', 'Passage 1': 'High' }) });
    const m = manifestOf(old);
    assert.deepEqual(m.cargo, [{ label: 'Ore', tons: 30 }]);
    assert.deepEqual(m.passengers, [{ label: 'Ilsa Varn', class: 'High', personId: PERSON }]);
});

test('the sheet shows the manifest in its rows, beside its own boxes', () => {
    const v = vessel({ sheet: sheet({ 'Cargo Capacity': '80', 'Cargo Type 1': 'stale' }), status: { cargo: [{ label: 'Grain', tons: 12, note: 'dry' }], passengers: [{ label: 'Doc', class: 'Middle', personId: PERSON }] } });
    const shown = sheetView(v);
    assert.equal(shown['Cargo Capacity'], '80');
    assert.equal(shown['Cargo Type 1'], 'Grain', 'the manifest, not a stale sheet value');
    assert.equal(shown['Cargo Tons 1'], '12');
    assert.equal(shown['Cargo Notes 1'], 'dry');
    assert.equal(shown['Cargo Type 2'], '');
    assert.equal(shown['Passenger Name 1'], 'Doc');
    assert.equal(shown['Passenger Name 1 record'], PERSON);
});

test('a sheet edit writes the manifest and keeps the rows off the sheet; lots past sixteen stay', () => {
    const many = Array.from({ length: 18 }, (_, i) => ({ label: 'Lot ' + (i + 1), tons: 1 }));
    const v = vessel({ sheet: sheet({ 'Cargo Capacity': '80' }), status: { track: [], cargo: many, passengers: [] } });
    const next = { ...sheetView(v), 'Cargo Type 1': 'Spices', 'Cargo Tons 1': '4' };
    const out = editedSheet(v, next);
    assert.equal(out.status.cargo.length, 18);
    assert.deepEqual(out.status.cargo[0], { label: 'Spices', tons: 4 });
    assert.equal(out.status.cargo[17].label, 'Lot 18');
    assert.deepEqual(out.status.track, [], 'the rest of the status is kept');
    assert.deepEqual(out.sheet.fields, { 'Cargo Capacity': '80' }, 'the sheet keeps its own boxes only');
    // Clearing a row deletes that lot.
    const cleared = editedSheet(v, { ...sheetView(v), 'Cargo Type 2': '', 'Cargo Tons 2': '', 'Cargo Notes 2': '' });
    assert.equal(cleared.status.cargo.length, 17);
    assert.equal(cleared.status.cargo[1].label, 'Lot 3');
});

test('a person put in a Passenger Name row is that passenger\'s person', () => {
    const v = vessel({ status: { cargo: [], passengers: [] } });
    const out = editedSheet(v, { ...sheetView(v), 'Passenger Name 1': 'Ilsa Varn', 'Passenger Name 1 record': PERSON, 'Passage 1': 'Low' });
    assert.deepEqual(out.status.passengers, [{ label: 'Ilsa Varn', class: 'Low', personId: PERSON }]);
    const freed = editedSheet(vessel({ status: out.status }), { ...sheetView(vessel({ status: out.status })), 'Passenger Name 1 record': undefined });
    assert.equal(freed.status.passengers[0].personId, undefined);
});

test('dates, and the sign a kind gives an amount', () => {
    assert.deepEqual(dayOf(1105 * 365 + 13.75), { year: 1105, day: 14 });
    assert.equal(dayWords({ year: 1105, day: 14 }), '014-1105');
    assert.equal(signedAmount(200, 'expense'), -200);
    assert.equal(signedAmount(-200, 'recurring'), -200);
    assert.equal(signedAmount(-50, 'income'), 50);
    assert.deepEqual(ledgerOf(vessel()), []);
});

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const webRoot = path.join(root, 'apps', 'web');

describe('the Cargo and Ledger sections render', { concurrency: 1 }, () => {
    let server = null;
    let campaign = null;
    let cacheDir = '';

    test.before(async () => {
        cacheDir = fs.mkdtempSync(path.join(tmpdir(), 'd-vessel-trade-'));
        const { createServer } = await import('vite');
        server = await createServer({ root: webRoot, cacheDir, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'silent' });
        campaign = (await server.ssrLoadModule('/src/campaign/store.ts')).campaign;
    });

    test.after(async () => {
        if (server) await server.close();
        if (cacheDir) fs.rmSync(cacheDir, { recursive: true, force: true });
    });

    async function render(record) {
        campaign.records[record.id] = record;
        campaign.clock = { days: 1105 * 365 + 13, rev: 1 };
        const view = (await server.ssrLoadModule('/src/workspace/VesselTrade.vue')).default;
        const { createSSRApp } = await import('vue');
        const { renderToString } = await import('vue/server-renderer');
        // Vue's hydration markers left out, so the patterns read as the page does.
        return (await renderToString(createSSRApp(view, { id: record.id, readOnly: false }))).replace(/<!--[\s\S]*?-->/g, '');
    }

    test('a vessel with cargo against its capacity, and a ledger by day with its balance', async () => {
        const html = await render(vessel({
            sheet: sheet({ 'Cargo Capacity': '40 tons' }),
            status: {
                cargo: [{ label: 'Machine parts', tons: 12, value: 4800, origin: 'Regina' }, { label: 'Grain', tons: 8 }],
                passengers: [],
                ledger: [{ when: { year: 1105, day: 10 }, amount: 9000, memo: 'Freight to Efate', kind: 'income' }, { when: { year: 1105, day: 12 }, amount: -4800, memo: 'Bought Machine parts (12 t)', kind: 'expense' }],
            },
        }));
        assert.match(html, /<section class="vt-sec ui-frame" data-vessel-cargo/);
        assert.match(html, /<h3 id="vt-cargo-h" class="ui-frame-label">Cargo <span class="ui-frame-count">2<\/span><\/h3>/);
        assert.match(html, /<b>20 t<\/b> of 40 t/);
        assert.match(html, /role="meter" aria-valuenow="20" aria-valuemin="0" aria-valuemax="40"/);
        assert.match(html, /<b>Machine parts<\/b> <span class="vt-num">12 t<\/span>/);
        assert.match(html, /Cr4,800 · from Regina/);
        assert.match(html, /<h3 id="vt-ledger-h" class="ui-frame-label">Ledger <span class="ui-frame-count">Cr4,200<\/span><\/h3>/);
        // Newest day first, in the date box, with that day's sum.
        assert.match(html, /<span class="ui-date">012-1105<\/span> <span class="is-minus vt-num">−Cr4,800<\/span>[\s\S]*<span class="ui-date">010-1105<\/span>/);
        assert.match(html, /Freight to Efate <small class="vt-kind">Income<\/small>/);
    });

    test('an empty vessel says what to do, and without a capacity says where to write it', async () => {
        const html = await render(vessel({ id: 'cr_33333333-3333-4333-8333-333333333333' }));
        assert.match(html, /Nothing in the hold\. The ship sheet&#39;s Cargo rows are this list too\./);
        assert.match(html, /<b>0 t<\/b> aboard\. To see how full the hold is, write Cargo Capacity on the ship sheet\./);
        assert.match(html, /No lines yet\./);
        assert.match(html, /data-add-lot/);
        assert.match(html, /data-add-line/);
    });

    test('Fuel and costs: the month\'s lines and their total before posting; no refuel where the world is not known', async () => {
        const html = await render(vessel({ id: 'cr_55555555-5555-4555-8555-555555555555', sheet: sheet({ 'Fuel Capacity': '40', 'Mortgage Cost': '12,500', 'Life Support Cost': '2000', 'Running Cost': '' }) }));
        assert.match(html, /<section class="vt-sec ui-frame" data-vessel-costs/);
        // The store's map is not mounted here, so the world under the ship is not known: no Refuel.
        assert.match(html, /To refuel, put the ship at a world/);
        assert.doesNotMatch(html, /data-post-refuel/);
        assert.match(html, /<span class="vt-main">Mortgage Cost<\/span><span class="vt-num vt-amount is-minus">−Cr12,500<\/span>/);
        assert.match(html, /<span class="vt-main">Life Support Cost<\/span>/);
        assert.doesNotMatch(html, /Running Cost<\/span>/, 'an empty box posts nothing');
        // DF12b: it posts the upkeep, the same five boxes and figure as Upkeep.
        assert.match(html, /<h4 class="vt-part-head">This month&#39;s upkeep<\/h4>/);
        assert.match(html, /data-post-month>Post this month&#39;s upkeep: −Cr14,500, dated 014-1105<\/button>/);
        const none = await render(vessel({ id: 'cr_66666666-6666-4666-8666-666666666666' }));
        assert.match(none, /Write the ship&#39;s recurring costs on the ship sheet \(Mortgage Cost, Maintenance Cost, Life Support Cost, Salary Cost, Running Cost\) to post its upkeep each month\./);
    });

    test('DT1c: owners and their parts, the payment overdue in the warning colour, fuel aboard, upkeep', async () => {
        campaign.records[PERSON] = { ...vessel({ id: PERSON, type: 'person', name: 'Ilsa Varn' }) };
        const html = await render(vessel({
            id: 'cr_77777777-7777-4777-8777-777777777777',
            sheet: sheet({ 'Fuel Capacity': '40', 'Mortgage Cost': '12,500', 'Life Support Cost': '2000', 'Purchase Cost': '5,000,000' }),
            status: {
                owners: [{ holder: { kind: 'record', id: PERSON }, shares: 30 }, { holder: 'party', shares: 70 }],
                payment: { amountCr: 12000, everyDays: 28, nextDueDay: { year: 1105, day: 10 }, payee: 'Regina Bank' },
                fuelTons: 31,
            },
        }));
        assert.match(html, /<section class="vt-sec ui-frame" data-vessel-owners/);
        assert.match(html, /Owners <span class="vt-fine">100 shares<\/span>/);
        assert.match(html, /<span class="vt-main">Ilsa Varn<\/span>[\s\S]*?<span class="vt-num vt-amount">30%<\/span>/);
        assert.match(html, /<span class="vt-main">The party<\/span>[\s\S]*?<span class="vt-num vt-amount">70%<\/span>/);
        assert.match(html, /<b>Cr12,000 every 28 days<\/b> to Regina Bank/);
        // The clock is on day 14: four days past day 10.
        assert.match(html, /<p class="is-late vt-due" role="status">Overdue by 4 days · <span class="ui-date">010-1105<\/span><\/p>/);
        assert.match(html, /data-pay-now>Pay now: −Cr12,000<\/button>/);
        // Upkeep: the five recurring boxes only, so not the Purchase Cost.
        assert.match(html, /<b>Cr14,500 a month<\/b>/);
        assert.match(html, /<span class="vt-main">Mortgage Cost<\/span><span class="vt-num vt-amount">Cr12,500<\/span>/);
        assert.doesNotMatch(html, /<span class="vt-main">Purchase Cost<\/span><span class="vt-num vt-amount">/);
        assert.match(html, /<b>31 t<\/b> of 40 t/);
        assert.match(html, /role="meter" aria-valuenow="31" aria-valuemin="0" aria-valuemax="40" aria-label="Fuel: 31 t of 40 t"/);
    });

    test('DT1c: a payment not yet due says when; nothing set says what to do', async () => {
        const soon = await render(vessel({ id: 'cr_88888888-8888-4888-8888-888888888888', status: { payment: { amountCr: 500, everyDays: 1, nextDueDay: { year: 1105, day: 20 } } } }));
        assert.match(soon, /<p class="vt-due" role="status">Due in 6 days · /);
        assert.match(soon, /<b>Cr500 every 1 day<\/b>/);
        const none = await render(vessel({ id: 'cr_99999999-9999-4999-8999-999999999999' }));
        assert.match(none, /No owners yet\. Add who holds the ship&#39;s shares: a person, an organization, or the party\./);
        assert.match(none, /No payment set\./);
        assert.match(none, /data-set-payment>[\s\S]*?Set a payment<\/button>/);
        assert.match(none, /To compare the fuel aboard with that capacity, write Fuel Capacity on the ship sheet\./);
    });

    test('over capacity says so', async () => {
        const html = await render(vessel({ id: 'cr_44444444-4444-4444-8444-444444444444', sheet: sheet({ 'Cargo Capacity': '10' }), status: { cargo: [{ label: 'Ore', tons: 14 }] } }));
        assert.match(html, /<div class="is-over vt-gauge">/);
        assert.match(html, /The hold is over capacity by 4 t\./);
    });
});

test('DT2b: the referee\'s mark is naval or scout, and nothing else', () => {
    assert.equal(fuelMarkOf(vessel({ status: { fuelMark: 'naval' } })), 'naval');
    assert.equal(fuelMarkOf(vessel({ status: { fuelMark: 'scout' } })), 'scout');
    assert.equal(fuelMarkOf(vessel({ status: { fuelMark: 'corsair' } })), null);
    assert.equal(fuelMarkOf(vessel()), null);
});

test('DT2b: Refuel offers what the world sells, from the rules file; the mark only on a party vessel', () => {
    const page = fs.readFileSync(path.join(webRoot, 'src', 'workspace/VesselTrade.vue'), 'utf8');
    assert.match(page, /fuelOffers\(world\.value\.port, world\.value\.bases, inParty\.value, mark\.value\)/);
    assert.match(page, /<label v-if="inParty" class="vt-fld vt-mark"><span>Base fuel \(referee only\)<\/span>/);
    assert.match(page, /<option value="naval">Naval vessel<\/option>\s+<option value="scout">Scout ship<\/option>/);
    // A price the file leaves to the referee is typed before anything is posted.
    assert.match(page, /<label v-if="offer && offer\.crPerTon === null" class="vt-fld"><span>Price \(Cr per ton\)<\/span>/);
    assert.match(page, /:disabled="readOnly \|\| fuelTons <= 0 \|\| fuelCost === null"/);
    assert.match(page, /data-no-fuel>No fuel is sold here\. Starport \{\{ world\.port \}\} sells none/);
});

test('the record page shows the sections on a vessel, and the ship sheet edits the manifest', () => {
    const read = (rel) => fs.readFileSync(path.join(webRoot, 'src', rel), 'utf8');
    assert.match(read('workspace/RecordPage.vue'), /<VesselTrade v-if="record\.type === 'vessel'" :id="id" :read-only="readOnly" \/>/);
    const ship = read('workspace/ShipSheet.vue');
    assert.match(ship, /const values = computed\(\(\) => \(record\.value \? sheetView\(record\.value\) : null\)\);/);
    assert.match(ship, /if \(isManifestField\(field\.name\) \|\| !moved\) \{\n\s*writeTrade\(now, editedSheet\(now, next\)\);/);
});
