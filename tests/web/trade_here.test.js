/**
 * DT5 (backlog T5, D's half): Trade here on a vessel. The world the procedure reads (from the index), the
 * words each roll is shown with (dice, every DM by the file's label, the sources), the lot and the ledger line
 * a purchase or a sale writes, and which good a lot is. A seeded worked example runs Z's functions with the
 * screen's words. The screen's wiring: Buy and Sell write through the vessel's record, one price per good.
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

/** Dice that fall as listed, in order. */
const seeded = (faces) => { let i = 0; return () => faces[i++ % faces.length]; };

describe('trade here', { concurrency: 1 }, () => {
    let server = null;
    let cacheDir = '';
    let here = null;
    let trade = null;

    test.before(async () => {
        cacheDir = fs.mkdtempSync(path.join(tmpdir(), 'd-trade-here-'));
        const { createServer } = await import('vite');
        server = await createServer({ root: webRoot, cacheDir, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'silent' });
        here = await server.ssrLoadModule('/src/workspace/trade_here.ts');
        trade = await server.ssrLoadModule('/src/campaign/trade.ts');
    });

    test.after(async () => {
        if (server) await server.close();
        if (cacheDir) fs.rmSync(cacheDir, { recursive: true, force: true, maxRetries: 5 });
    });

    test('a UWP character as a number: digits, then A on (no I or O); anything else is null', () => {
        assert.deepEqual(['0', '9', 'A', 'B', 'H', 'J', 'Z', '?', 'I', ''].map(here.uwpDigit), [0, 9, 10, 11, 17, 18, 33, null, null, null]);
    });

    test('the world as the procedure reads it, from the index row', () => {
        assert.deepEqual(here.tradeWorldOf({ uwp: 'A879533-B', tradeCodes: ['Ni', 'Cp'], zone: '' }), {
            tradeCodes: ['Ni', 'Cp'], starport: 'A', population: 5, lawLevel: 3, techLevel: 11, zone: null,
        });
        assert.equal(here.tradeWorldOf({ uwp: 'X5437C7-5', tradeCodes: [], zone: 'R' }).zone, 'red');
        assert.equal(here.tradeWorldOf({ uwp: 'C200423-7', tradeCodes: [], zone: 'A' }).zone, 'amber');
        assert.equal(here.tradeWorldOf({ uwp: 'C20', tradeCodes: [], zone: '' }), null, 'no population to read');
    });

    test('a roll\'s words: a true minus, the dice, every DM by its label, the sources by line', () => {
        assert.equal(here.signed(-2), '−2');
        assert.equal(here.signed(0), '+0');
        assert.equal(here.diceWords([4, 3], '2D'), '2D: 4, 3');
        assert.equal(here.dmWords([{ label: 'Broker skill', dm: 1, cites: [] }, { label: 'Class A', dm: 6, cites: [] }]), 'Broker skill +1 · Class A +6');
        assert.equal(here.citeWords(['assets/trade.txt:323-324', 'assets/trade.txt:333', 'assets/trade.txt:333']), 'trade.txt 323-324 · 333');
        assert.equal(here.citeWords([]), '');
    });

    test('a worked example, seeded: Lanth (A879533-B, Ni Cp), Broker 1, EDU DM +1', () => {
        const world = here.tradeWorldOf({ uwp: 'A879533-B', tradeCodes: ['Ni', 'Cp'], zone: '' });
        const found = trade.findSupplier({ kind: 'supplier', world, skill: 1, characteristicDm: 1 }, seeded([6, 4, 4]));
        assert.equal(here.diceWords(found.dice, '2D') + ' · ' + here.dmWords(found.dms) + ' = ' + found.total + ' against ' + found.target + '+',
            '2D: 6, 4 · Broker skill +1 · EDU or SOC DM +1 · Class A +6 = 18 against 8+');
        assert.equal(found.found, true);
        assert.deepEqual(found.time, { dice: [4], amount: 4, unit: 'days' });
        const good = trade.tradeGood('11');
        const price = trade.purchasePrice({ good, world, tons: 10, brokerSkill: 1 }, seeded([3, 3, 4]));
        assert.equal(here.dmWords(price.dms), 'Traveller\'s Broker skill +1 · Purchase DM, none +0 · Sale DM, Non-Industrial −2 · the supplier\'s Broker skill −2');
        assert.equal(price.total, 7);
        assert.equal(price.percent, 105);
        assert.equal(here.priceWords(price.perTon, 10), 'Cr21,000 a ton, Cr210,000 for 10 t');
        const lot = here.boughtLot(good, 10, price.perTon * 10, 'Lanth');
        assert.deepEqual(lot, { label: 'Common Electronics', tons: 10, value: 210000, origin: 'Lanth', note: 'Trade good 11' });
        assert.deepEqual(here.boughtLine(good, 10, 210000, 'Lanth', { year: 1105, day: 100 }), { when: { year: 1105, day: 100 }, amount: -210000, memo: 'Bought Common Electronics (10 t) at Lanth', kind: 'expense' });
        assert.deepEqual(here.soldLine(lot, 160000, 'Aramis', { year: 1105, day: 104 }), { when: { year: 1105, day: 104 }, amount: 160000, memo: 'Sold Common Electronics (10 t) at Aramis', kind: 'income' });
    });

    test('a local broker (DT5b), seeded: the 2D/3 roll, its DMs on the price, the fee as a line of its own', () => {
        const world = here.tradeWorldOf({ uwp: 'A879533-B', tradeCodes: ['Ni', 'Cp'], zone: '' });
        const hired = trade.rollLocalBroker('legal', seeded([4, 5]));
        assert.equal(hired.name, 'Local broker');
        assert.equal(here.thirdWords(hired.total, hired.third), '9 ÷ 3 = 3');
        assert.equal(here.thirdWords(8, 8 / 3), '8 ÷ 3 = 2.67', 'not rounded: question 88 is open');
        assert.equal(hired.informer, false);
        assert.equal(here.citeWords(hired.cites), 'trade.txt 356-362');
        const price = trade.purchasePrice({ good: trade.tradeGood('11'), world, tons: 10, brokerSkill: 1, broker: { kind: 'legal', skill: 3 } }, seeded([3, 3, 4]));
        assert.equal(here.dmWords(price.dms), 'Local broker\'s Broker skill +3 · Local broker on negotiations +2 · Purchase DM, none +0 · Sale DM, Non-Industrial −2 · the supplier\'s Broker skill −2');
        assert.equal(price.brokerFee, (price.price * 10) / 100);
        assert.deepEqual(here.brokerFeeLine(hired.name, hired.feePercent, 'Common Electronics', 21000, 'Lanth', { year: 1105, day: 100 }),
            { when: { year: 1105, day: 100 }, amount: -21000, memo: 'Local broker\'s fee, 10% (Common Electronics at Lanth)', kind: 'expense' });
        const fixer = trade.rollLocalBroker('illegal', seeded([1, 1]));
        assert.equal(fixer.informer, true, 'a natural 2 on the fixer\'s roll');
    });

    test('which good a lot is: its note first, then its label as the type; a lot the table does not list is none', () => {
        const tables = trade.tradeTables(null);
        assert.equal(here.goodOfLot({ label: 'Renamed by the referee', tons: 5, note: 'Trade good 12' }, tables).type, 'Common Industrial Goods');
        assert.equal(here.goodOfLot({ label: 'common electronics', tons: 5 }, tables).d66, '11');
        assert.equal(here.goodOfLot({ label: 'Machine parts', tons: 12 }, tables), null);
    });
});

test('the vessel page shows Trade here before Markets', () => {
    const page = read('workspace/RecordPage.vue');
    assert.match(page, /<TradeHere v-if="record\.type === 'vessel'" :id="id" :read-only="readOnly" \/>\s+<MarketsNearby/);
});

test('Buy and Sell write the vessel\'s cargo and ledger in one save; one price roll per good; dice from the app\'s roller', () => {
    const screen = read('workspace/TradeHere.vue');
    assert.match(screen, /let lines = postLedger\(ledger\.value, boughtLine\(good, tons, paid, worldName\.value, when\)\);[\s\S]{0,300}?cargo: addCargo\(cargo\.value, boughtLot\(good, tons, paid, worldName\.value\)\),\s+ledger: lines,/);
    assert.match(screen, /let lines = postLedger\(ledger\.value, soldLine\(item\.lot, slot\.price\.price, worldName\.value, when\)\);[\s\S]{0,300}?cargo: removeCargo\(cargo\.value, item\.index\),\s+ledger: lines,/);
    assert.match(screen, /<div v-if="!buys\[lot\.d66\]\.price" class="th-acts">/, 'the price button goes once rolled');
    assert.match(screen, /import \{ cryptoFace \} from '\.\.\/dice\/roll\.ts';/);
    assert.match(screen, /tradeChoice\(campaign\.settings/);
    assert.match(screen, /data-trade-set>\{\{ rolled\.label \}\}/);
    assert.match(screen, /here: !!lot\.origin && lot\.origin === worldName\.value/, 'a lot bought here is not sold here');
    assert.match(screen, /if \(free\.value !== null && tons > free\.value\)/, 'not past the hold');
});

test('the broker (DT5b): the fixer for the black market, the skill the referee settles, the fee posted beside the trade', () => {
    const screen = read('workspace/TradeHere.vue');
    assert.match(screen, /const brokerKind = computed\(\(\): BrokerHire\['kind'\] => \(who\.kind === 'blackMarket' \? 'illegal' : 'legal'\)\);/);
    assert.match(screen, /brokerSkill\.value = rolled && Number\.isInteger\(rolled\.third\) \? String\(rolled\.third\) : '';/, 'a whole third is filled in; any other is typed');
    assert.match(screen, /if \(slot\.fee\) lines = postLedger\(lines, brokerFeeLine\(/);
    assert.match(screen, /if \(slot\.fee && slot\.price\.brokerFee !== null\) lines = postLedger\(lines, brokerFeeLine\(/);
    assert.match(screen, /A natural 2\. \{\{ informerWords \}\}/, 'the file\'s own words for the informer');
    assert.match(screen, /broker: withBroker \}, cryptoFace, tables\.value\)/);
});
