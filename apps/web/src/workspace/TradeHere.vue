<script setup lang="ts">
/**
 * Trade here (DT5; backlog T5, D's half) on a vessel at its current world. The procedure is Z's
 * `campaign/trade.ts`, read from rules/mgt2e_trade.json: find a supplier (or a buyer: the same roll), the
 * goods on offer, a price for each, Buy (a cargo lot with its origin and price, and an expense on the
 * ledger) and, for a lot brought from elsewhere, a sale price and Sell (income on the ledger; the lot
 * leaves). Every roll shows its dice, each DM by the file's label, and its sources. The referee types
 * the Traveller's skill and characteristic DM; nothing here is a rule of its own. Saves ride the
 * vessel's record (vessel_trade.ts), as the Cargo and Ledger sections' do.
 */
import { computed, reactive, ref, watch } from 'vue';
import { validateTableSet, type CargoLot, type TableSetData } from '@voyage/shared';
import { addCargo, capacityTons, removeCargo, tonsUsed } from '../campaign/cargo.ts';
import { postLedger } from '../campaign/ledger.ts';
import { formatCredits } from '../campaign/money.ts';
import { newEntryId } from '../campaign/commit.ts';
import { campaign, transport } from '../campaign/store.ts';
import {
    findSupplier,
    goodsAvailable,
    purchasePrice,
    rollLocalBroker,
    salePrice,
    tradeChoice,
    tradeGood,
    type BrokerHire,
    type BrokerRoll,
    type GoodsLot,
    type GoodsResult,
    type PriceResult,
    type SupplierKind,
    type SupplierResult,
} from '../campaign/trade.ts';
import { cryptoFace } from '../dice/roll.ts';
import { storageGet, storageSet } from '../platform/browser.ts';
import { apiFetch } from '../platform/http.ts';
import { truthAt } from './build/acts.ts';
import { buildStore } from './build/seam.ts';
import { resolveAnchor } from './party.ts';
import { campaignDays, vesselWhere } from './party_where.ts';
import { fieldsOf } from './sheet_fields.ts';
import { boughtLine, boughtLot, brokerFeeLine, citeWords, diceWords, dmWords, goodOfLot, priceWords, signed, soldLine, thirdWords, tradeLogEntry, tradeLogOn, tradeLogSave, tradeWorldOf } from './trade_here.ts';
import { dayOf, ledgerOf, manifestOf, statusWithTrade, writeTrade } from './vessel_trade.ts';

const props = defineProps<{
    id: string;
    /** Changes cannot be made just now (offline). */
    readOnly: boolean;
}>();

/** The account's trade set, when the campaign chose one that is not the official file. */
const ownSet = ref<TableSetData | null>(null);
const rolled = computed(() => {
    void campaign.seq;
    return tradeChoice(campaign.settings, ownSet.value ? [ownSet.value] : []);
});
const tables = computed(() => rolled.value.tables);

let setLoad = 0;
watch(() => campaign.settings?.tableSets?.trade ?? '', (id) => {
    const ticket = ++setLoad;
    ownSet.value = null;
    if (!id || id === 'official:trade') return;
    void apiFetch(transport.fetch, '/api/table-sets/' + encodeURIComponent(id)).then(async (res) => {
        if (ticket !== setLoad || !res.ok) return;
        const body = await res.json() as { data?: unknown };
        const checked = validateTableSet(body.data);
        if (ticket === setLoad && checked.ok && checked.set) ownSet.value = checked.set;
    }).catch(() => { /* the official file stays, and tradeChoice says so */ });
}, { immediate: true });

const record = computed(() => {
    void campaign.seq;
    const found = campaign.records[props.id];
    return found && !found.deleted && found.type === 'vessel' ? found : null;
});

/** The world under the ship, as the map knows it (Build's row there, else the chart's). */
const place = computed(() => {
    const now = record.value;
    if (!now) return null;
    const where = vesselWhere(now, campaign.records, campaignDays(campaign.clock));
    if (where.underway) return { underway: true as const };
    const at = resolveAnchor(where.anchor, campaign.records);
    if (!at) return null;
    const store = buildStore();
    if (store) void store.tick();
    const row = store ? store.row(at.hexKey) : null;
    const entry = row ? (row.state === 'removed' ? null : row.entry) : truthAt(at.hexKey);
    if (!entry || !entry.uwp) return { underway: false as const, hexKey: at.hexKey, name: '', world: null, codes: '' };
    return { underway: false as const, hexKey: at.hexKey, name: entry.name || at.hexKey, world: tradeWorldOf(entry), codes: [entry.uwp, ...entry.tradeCodes].join(' ') };
});
const world = computed(() => (place.value && !place.value.underway ? place.value.world : null));
const worldName = computed(() => (place.value && !place.value.underway ? place.value.name : ''));

/** One tick for Buy and Sell. Off until this device has stored it for this campaign. */
const logIt = ref(false);
watch(() => campaign.universeId, (id) => {
    logIt.value = tradeLogOn(id, storageGet);
}, { immediate: true });

function rememberLog(): void {
    tradeLogSave(campaign.universeId, logIt.value, storageSet);
}

/** The note for this buy or sell, when Log it is ticked. The line is the purchase or the sale, not the fee. */
function logTrade(vessel: NonNullable<typeof record.value>, line: { memo: string } | undefined, when: { year: number; day: number }) {
    if (!line) return undefined;
    const here = place.value;
    const entry = tradeLogEntry({
        on: logIt.value,
        memo: line.memo,
        vessel: { id: vessel.id, name: vessel.name, visibility: vessel.visibility },
        hexKey: here && !here.underway ? here.hexKey : null,
        worldName: worldName.value,
        when,
        id: newEntryId(),
        whenReal: new Date().toISOString(),
    });
    return entry ? [entry] : undefined;
}

const cargo = computed(() => (record.value ? manifestOf(record.value).cargo : []));
const ledger = computed(() => (record.value ? ledgerOf(record.value) : []));
const free = computed(() => {
    const capacity = record.value ? capacityTons(fieldsOf(record.value.sheet)) : null;
    return capacity === null ? null : capacity - tonsUsed(cargo.value);
});

// ---- The Traveller and the search ------------------------------------------------------------------------

const KINDS: Array<{ kind: SupplierKind; words: string; skill: string }> = [
    { kind: 'supplier', words: 'Supplier', skill: 'Broker' },
    { kind: 'blackMarket', words: 'Black market', skill: 'Streetwise' },
    { kind: 'online', words: 'Online', skill: 'Admin' },
];
const who = reactive({ kind: 'supplier' as SupplierKind, skill: '0', broker: '0', charDm: '0', tries: '0' });
const search = ref<SupplierResult | null>(null);
const goods = ref<GoodsResult | null>(null);
/** A hired broker's fee, as the price was rolled with it: the broker's name and the file's percent. */
type Fee = { name: string; percent: number } | null;
const buys = reactive<Record<string, { price: PriceResult | null; fee: Fee; tons: string; bought: number; error: string }>>({});
const sales = reactive<Record<string, { price: PriceResult | null; fee: Fee; error: string }>>({});
const formError = ref('');

const checkSkill = computed(() => KINDS.find((item) => item.kind === who.kind)?.skill ?? 'Broker');
const charWords = computed(() => (who.kind === 'online' ? 'EDU DM' : 'EDU or SOC DM'));

function whole(text: string): number | null {
    const n = Number(text.replace('−', '-').trim());
    return text.trim() !== '' && Number.isInteger(n) ? n : null;
}

function reset(): void {
    search.value = null;
    broker.value = null;
    brokerSkill.value = '';
    goods.value = null;
    formError.value = '';
    for (const key of Object.keys(buys)) delete buys[key];
    for (const key of Object.keys(sales)) delete sales[key];
}

watch(() => (place.value && !place.value.underway ? place.value.hexKey : ''), reset);
watch(() => who.kind, reset);
watch(() => campaign.settings?.tableSets?.trade ?? '', reset);

/** The Traveller's Broker skill the prices use: the search's own skill when the search is the Broker check. */
const travellerBroker = computed(() => (who.kind === 'supplier' ? whole(who.skill) : whole(who.broker)) ?? 0);

// ---- A local broker (DT5b): Z's rollLocalBroker; the fixer for the black market -------------------------

const broker = ref<BrokerRoll | null>(null);
/** The skill the referee settled on from the 2D/3 roll (question 88: the file does not say how to round). */
const brokerSkill = ref('');
const brokerKind = computed((): BrokerHire['kind'] => (who.kind === 'blackMarket' ? 'illegal' : 'legal'));
type BrokerRules = { kinds?: Array<{ name: string; of: string; goods?: string }>; notes?: Array<{ text?: string }> };
const brokerRules = computed(() => (tables.value.localBrokers ?? {}) as BrokerRules);
/** What the fee is of, in the file's words ("gross proceeds"). */
const feeOf = computed(() => brokerRules.value.kinds?.find((kind) => kind.name === broker.value?.name)?.of ?? '');
/** The file's words for a fixer's natural 2. */
const informerWords = computed(() => brokerRules.value.notes?.[0]?.text ?? '');
const hire = computed((): BrokerHire | null => {
    if (!broker.value) return null;
    const skill = whole(brokerSkill.value);
    return skill === null ? null : { kind: brokerKind.value, skill };
});
const brokerError = ref('');

function hireBroker(): void {
    const rolled = rollLocalBroker(brokerKind.value, cryptoFace, tables.value);
    broker.value = rolled;
    brokerSkill.value = rolled && Number.isInteger(rolled.third) ? String(rolled.third) : '';
    brokerError.value = '';
}

function doWithout(): void {
    broker.value = null;
    brokerSkill.value = '';
    brokerError.value = '';
}

/** The broker to price with: none, or the hired one once the referee has settled the skill. False to stop. */
function pricingBroker(): BrokerHire | null | false {
    if (!broker.value) return null;
    if (!hire.value) {
        brokerError.value = "Enter the broker's skill first, as a whole number.";
        return false;
    }
    brokerError.value = '';
    return hire.value;
}

function feeOfHire(withBroker: BrokerHire | null): Fee {
    return withBroker && broker.value ? { name: broker.value.name, percent: broker.value.feePercent } : null;
}

function find(): void {
    const at = world.value;
    if (!at) return;
    const skill = whole(who.skill);
    const charDm = whole(who.charDm);
    const tries = whole(who.tries);
    if (skill === null || charDm === null || tries === null || tries < 0) {
        formError.value = 'Enter the skill, the characteristic DM, and the earlier tries as whole numbers. Tries are zero or more.';
        return;
    }
    if (who.kind !== 'supplier' && whole(who.broker) === null) {
        formError.value = 'Enter the Broker skill for the prices as a whole number.';
        return;
    }
    formError.value = '';
    reset();
    const result = findSupplier({ kind: who.kind, world: at, skill, characteristicDm: charDm, previousAttempts: tries }, cryptoFace, tables.value);
    search.value = result;
    // A search that fails counts as an earlier try on this planet this month (DM-1 next time).
    if (result.allowed && !result.found) who.tries = String(tries + 1);
}

function searchWords(result: SupplierResult): string {
    const target = result.target === null ? '' : ' against ' + result.target + '+';
    return diceWords(result.dice, '2D') + ' · ' + dmWords(result.dms) + ' = ' + result.total + target;
}

function timeWords(result: SupplierResult): string {
    if (!result.time) return '';
    const unit = result.time.unit ?? '';
    const amount = result.time.amount;
    return ' It takes ' + amount + ' ' + (amount === 1 ? unit.replace(/s$/, '') : unit) + ' (1D: ' + result.time.dice.join(', ') + ').';
}

function showGoods(): void {
    const at = world.value;
    if (!at || !search.value || !search.value.found) return;
    goods.value = goodsAvailable({ world: at, blackMarket: who.kind === 'blackMarket' }, cryptoFace, tables.value);
    for (const lot of goods.value.lots) buys[lot.d66] = { price: null, fee: null, tons: String(lot.tons), bought: 0, error: '' };
}

const FROM_WORDS: Record<GoodsLot['from'][number], string> = { common: 'common goods', tradeCode: 'trade codes', random: 'random roll' };

function lotFrom(lot: GoodsLot): string {
    const parts = [...new Set(lot.from)].map((from) => FROM_WORDS[from]);
    if (parts.length < 3) return parts.join(' and ');
    return parts.slice(0, -1).join(', ') + ', and ' + parts[parts.length - 1];
}

function tonsRollWords(lot: GoodsLot): string {
    const spec = tradeGood(lot.d66, tables.value)?.tons ?? '';
    return lot.tonsRolls.map((roll) => spec + ': ' + roll.dice.join(', ') + (roll.dm ? ' DM ' + signed(roll.dm) : '') + ' → ' + roll.tons + ' t').join('; ');
}

function priceRollWords(result: PriceResult): string {
    return diceWords(result.dice, '3D') + ' · ' + dmWords(result.dms) + ' = ' + result.total + (result.percent === null ? '' : ' → ' + result.percent + '%');
}

// ---- Buy ------------------------------------------------------------------------------------------------

function left(lot: GoodsLot): number {
    return lot.tons - (buys[lot.d66]?.bought ?? 0);
}

function priceLot(lot: GoodsLot): void {
    const at = world.value;
    const good = tradeGood(lot.d66, tables.value);
    const slot = buys[lot.d66];
    if (!at || !good || !slot) return;
    const withBroker = pricingBroker();
    if (withBroker === false) return;
    slot.price = purchasePrice({ good, world: at, tons: left(lot), brokerSkill: travellerBroker.value, broker: withBroker }, cryptoFace, tables.value);
    slot.fee = feeOfHire(withBroker);
    slot.error = '';
}

function buy(lot: GoodsLot): void {
    const now = record.value;
    const good = tradeGood(lot.d66, tables.value);
    const slot = buys[lot.d66];
    if (!now || !good || !slot || !slot.price || slot.price.perTon === null || props.readOnly) return;
    const tons = Number(slot.tons.trim());
    if (!Number.isFinite(tons) || tons <= 0) { slot.error = 'Enter the tons to buy. Use a number greater than zero.'; return; }
    if (tons > left(lot)) { slot.error = 'The supplier has ' + left(lot) + ' t left.'; return; }
    if (free.value !== null && tons > free.value) { slot.error = 'The hold has ' + Math.max(0, free.value) + ' t free.'; return; }
    const paid = slot.price.perTon * tons;
    const when = dayOf(campaignDays(campaign.clock));
    let lines = postLedger(ledger.value, boughtLine(good, tons, paid, worldName.value, when));
    if (slot.fee) lines = postLedger(lines, brokerFeeLine(slot.fee.name, slot.fee.percent, good.type, (paid * slot.fee.percent) / 100, worldName.value, when));
    writeTrade(now, { status: statusWithTrade(now, {
        cargo: addCargo(cargo.value, boughtLot(good, tons, paid, worldName.value)),
        ledger: lines,
    }) }, logTrade(now, lines[ledger.value.length], when));
    slot.bought += tons;
    slot.tons = String(left(lot));
    slot.error = '';
}

// ---- Sell -----------------------------------------------------------------------------------------------

/** The lots aboard, each with its good when the table knows it; one bought here is not for sale here. */
const aboard = computed(() => cargo.value.map((lot, index) => ({
    lot,
    index,
    key: index + ':' + lot.label + ':' + lot.tons,
    good: goodOfLot(lot, tables.value),
    here: !!lot.origin && lot.origin === worldName.value,
})));

function priceSale(item: { lot: CargoLot; key: string; good: ReturnType<typeof goodOfLot> }): void {
    const at = world.value;
    if (!at || !item.good) return;
    const withBroker = pricingBroker();
    if (withBroker === false) return;
    sales[item.key] = { price: salePrice({ good: item.good, world: at, tons: item.lot.tons, brokerSkill: travellerBroker.value, broker: withBroker }, cryptoFace, tables.value), fee: feeOfHire(withBroker), error: '' };
}

function sell(item: { lot: CargoLot; index: number; key: string }): void {
    const now = record.value;
    const slot = sales[item.key];
    if (!now || !slot || !slot.price || slot.price.price === null || props.readOnly) return;
    const when = dayOf(campaignDays(campaign.clock));
    let lines = postLedger(ledger.value, soldLine(item.lot, slot.price.price, worldName.value, when));
    if (slot.fee && slot.price.brokerFee !== null) lines = postLedger(lines, brokerFeeLine(slot.fee.name, slot.fee.percent, item.lot.label, slot.price.brokerFee, worldName.value, when));
    writeTrade(now, { status: statusWithTrade(now, {
        cargo: removeCargo(cargo.value, item.index),
        ledger: lines,
    }) }, logTrade(now, lines[ledger.value.length], when));
    delete sales[item.key];
}

/** "Local broker's fee, 10%: Cr21,000". */
function feeWords(fee: Fee, gross: number): string {
    return fee ? fee.name + "'s fee, " + fee.percent + '%: ' + formatCredits((gross * fee.percent) / 100) : '';
}

function gainWords(lot: CargoLot, received: number): string {
    if (typeof lot.value !== 'number') return '';
    const gain = received - lot.value;
    return gain >= 0 ? ', ' + formatCredits(gain) + ' more than was paid' : ', ' + formatCredits(-gain) + ' less than was paid';
}
</script>

<template>
  <section v-if="record" class="th ui-frame" data-trade-here aria-labelledby="th-h">
    <div class="th-head">
      <h3 id="th-h" class="ui-frame-label">Trade here</h3>
      <p class="th-fine" data-trade-set>{{ rolled.label }}<template v-if="rolled.words">. {{ rolled.words }}</template></p>
      <label class="th-log"><input v-model="logIt" type="checkbox" data-trade-log @change="rememberLog" /> Log it</label>
      <span v-if="world" class="th-where">{{ worldName }} <span class="th-codes">{{ place && !place.underway ? place.codes : '' }}</span></span>
    </div>

    <p v-if="!place" class="th-note">To trade, set where the ship is.</p>
    <p v-else-if="place.underway" class="th-note">The ship is under way. You can trade when it is at a world.</p>
    <p v-else-if="!world" class="th-note">There is no world here to trade with. If the chart has not read this hex, the world shows when it has.</p>
    <template v-else>
      <form class="th-form" data-trade-search @submit.prevent="find">
        <div class="th-kinds" role="group" aria-label="Where to look">
          <button v-for="item in KINDS" :key="item.kind" type="button" class="th-kind" :aria-pressed="who.kind === item.kind ? 'true' : 'false'" :data-trade-kind="item.kind" @click="who.kind = item.kind">{{ item.words }}</button>
        </div>
        <label class="th-fld"><span>{{ checkSkill }} skill</span><input v-model="who.skill" class="th-box th-num" inputmode="numeric" data-trade-skill /></label>
        <label v-if="who.kind !== 'supplier'" class="th-fld"><span>Broker skill, for prices</span><input v-model="who.broker" class="th-box th-num" inputmode="numeric" /></label>
        <label class="th-fld"><span>{{ charWords }}</span><input v-model="who.charDm" class="th-box th-num" inputmode="numeric" data-trade-char /></label>
        <label class="th-fld"><span>Earlier tries here this month</span><input v-model="who.tries" class="th-box th-num" inputmode="numeric" data-trade-tries /></label>
        <p v-if="formError" class="th-err" role="alert">{{ formError }}</p>
        <div class="th-acts">
          <button type="submit" class="ui-btn is-primary" data-trade-find>{{ who.kind === 'supplier' ? 'Find a supplier or buyer' : who.kind === 'blackMarket' ? 'Find a black market supplier' : 'Find a supplier online' }}</button>
        </div>
      </form>

      <div v-if="search" class="th-roll" :class="{ 'is-found': search.found }" data-trade-result role="status">
        <p class="th-roll-say">
          <b>{{ search.check }}:</b>
          <template v-if="!search.allowed"> {{ search.words }}</template>
          <template v-else-if="search.found"> Found.{{ timeWords(search) }}</template>
          <template v-else> Not found. A new try this month takes DM{{ signed(-1) }} more. The earlier-tries count has gone up by one.</template>
        </p>
        <p v-if="search.allowed" class="th-roll-dice" data-trade-dice>{{ searchWords(search) }}</p>
        <p v-if="citeWords(search.cites)" class="th-src">Sources: {{ citeWords(search.cites) }}</p>
        <div v-if="search.found && !goods" class="th-acts">
          <button type="button" class="ui-btn" data-trade-goods @click="showGoods">See the goods on offer</button>
        </div>
      </div>

      <div v-if="search && search.found" class="th-roll th-broker" data-trade-broker>
        <div v-if="!broker" class="th-acts">
          <button type="button" class="ui-btn" data-trade-hire @click="hireBroker">{{ brokerKind === 'illegal' ? 'Hire a local broker or fixer' : 'Hire a local broker' }}</button>
          <span class="th-fine">Prices then use the broker's skill, not the Traveller's. The fee goes on the Ledger.</span>
        </div>
        <template v-else>
          <p class="th-roll-say"><b>{{ broker.name }} hired.</b> A fee of {{ broker.feePercent }}%<template v-if="feeOf"> of {{ feeOf }}</template>.</p>
          <p class="th-roll-dice" data-trade-broker-roll>2D: {{ broker.dice.join(', ') }} = {{ broker.total }}; {{ thirdWords(broker.total, broker.third) }}</p>
          <p v-if="broker.informer" class="th-err" role="alert" data-trade-informer>A natural 2. {{ informerWords }}</p>
          <div class="th-buy">
            <label class="th-fld th-tons"><span>Broker's skill</span><input v-model="brokerSkill" class="th-box th-num" inputmode="numeric" data-trade-broker-skill /></label>
            <button type="button" class="ui-btn" data-trade-without @click="doWithout">Trade without a broker</button>
          </div>
          <p v-if="!Number.isInteger(broker.third)" class="th-fine">The trade file does not say how to round a third. Enter the skill you settle on.</p>
          <p v-if="brokerError" class="th-err" role="alert">{{ brokerError }}</p>
          <p v-if="citeWords(broker.cites)" class="th-src">Sources: {{ citeWords(broker.cites) }}</p>
        </template>
      </div>

      <div v-if="goods" class="th-goods" data-trade-goods-list>
        <h4 class="th-sub">On offer at {{ worldName }}</h4>
        <p v-if="goods.quantityDm" class="th-src">Quantity DM: {{ goods.quantityDm.label }} {{ signed(goods.quantityDm.dm) }}</p>
        <ul class="th-rows">
          <li v-for="lot in goods.lots" :key="lot.d66" class="th-row" :data-trade-lot="lot.d66">
            <div class="th-row-top">
              <b>{{ lot.type }}</b>
              <span class="th-num">{{ left(lot) }} t</span>
            </div>
            <p class="th-fine">
              {{ lot.d66 }} · base {{ lot.basePrice === null ? '—' : formatCredits(lot.basePrice) + ' a ton' }} · from {{ lotFrom(lot) }}<template v-if="lot.illegal"> · <span class="th-illegal">Illegal</span></template>
            </p>
            <p v-if="lot.tonsRolls.length" class="th-src">Tons: {{ tonsRollWords(lot) }}</p>
            <template v-if="buys[lot.d66]">
              <div v-if="!buys[lot.d66].price" class="th-acts">
                <button type="button" class="ui-btn" :disabled="left(lot) <= 0" data-trade-price @click="priceLot(lot)">Roll the price</button>
              </div>
              <template v-else>
                <p v-if="buys[lot.d66].price!.words" class="th-fine">{{ buys[lot.d66].price!.words }}</p>
                <template v-else>
                  <p class="th-roll-dice" data-trade-price-roll>{{ priceRollWords(buys[lot.d66].price!) }}</p>
                  <p class="th-price">{{ priceWords(buys[lot.d66].price!.perTon!, Number(buys[lot.d66].tons) || 0) }}</p>
                  <p v-if="buys[lot.d66].fee" class="th-fine" data-trade-fee>{{ feeWords(buys[lot.d66].fee, buys[lot.d66].price!.perTon! * (Number(buys[lot.d66].tons) || 0)) }}, a line of its own on the Ledger.</p>
                  <form class="th-buy" @submit.prevent="buy(lot)">
                    <label class="th-fld th-tons"><span>Tons</span><input v-model="buys[lot.d66].tons" class="th-box th-num" inputmode="decimal" data-trade-tons /></label>
                    <button type="submit" class="ui-btn is-primary" :disabled="readOnly || left(lot) <= 0" data-trade-buy>Buy</button>
                  </form>
                </template>
                <p v-if="buys[lot.d66].error" class="th-err" role="alert">{{ buys[lot.d66].error }}</p>
                <p v-if="buys[lot.d66].bought" class="th-fine" role="status">Bought {{ buys[lot.d66].bought }} t. It is in Cargo and on the Ledger.</p>
              </template>
            </template>
          </li>
        </ul>
        <div v-if="goods.exotics.length" class="th-exotics">
          <p v-for="(exotic, i) in goods.exotics" :key="i" class="th-fine">{{ exotic.d66 }} {{ exotic.type }}: {{ exotic.words }}</p>
        </div>
        <p v-if="citeWords(goods.cites)" class="th-src">Sources: {{ citeWords(goods.cites) }}</p>
      </div>

      <div v-if="search && search.found && aboard.length" class="th-goods" data-trade-sell>
        <h4 class="th-sub">Sell from the hold</h4>
        <ul class="th-rows">
          <li v-for="item in aboard" :key="item.key" class="th-row" :data-trade-aboard="item.index">
            <div class="th-row-top">
              <b>{{ item.lot.label }}</b>
              <span class="th-num">{{ item.lot.tons }} t</span>
            </div>
            <p v-if="item.here" class="th-fine">Bought here.</p>
            <p v-else-if="!item.good" class="th-fine">This is not a good the trade table lists. Sell it by hand on the Ledger.</p>
            <template v-else>
              <div v-if="!sales[item.key]" class="th-acts">
                <button type="button" class="ui-btn" data-trade-sale-price @click="priceSale(item)">Roll the sale price</button>
              </div>
              <template v-else>
                <p v-if="sales[item.key].price!.words" class="th-fine">{{ sales[item.key].price!.words }}</p>
                <template v-else>
                  <p class="th-roll-dice" data-trade-sale-roll>{{ priceRollWords(sales[item.key].price!) }}</p>
                  <p class="th-price">{{ priceWords(sales[item.key].price!.perTon!, item.lot.tons) }}{{ gainWords(item.lot, sales[item.key].price!.price!) }}</p>
                  <p v-if="sales[item.key].fee" class="th-fine" data-trade-fee>{{ feeWords(sales[item.key].fee, sales[item.key].price!.price!) }}, a line of its own on the Ledger.</p>
                  <div class="th-acts">
                    <button type="button" class="ui-btn is-primary" :disabled="readOnly" data-trade-sell-btn @click="sell(item)">Sell for {{ formatCredits(sales[item.key].price!.price!) }}</button>
                  </div>
                </template>
              </template>
            </template>
          </li>
        </ul>
      </div>
    </template>
  </section>
</template>

<style>
.th-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 12px;
  margin-bottom: 10px;
}

.th-head .ui-frame-label {
  margin: 0;
}

.th-log {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  color: var(--text-1);
  font: 500 12px/1.3 var(--font-text);
}

.th-where {
  color: var(--text-0);
  font: 600 13.5px/1.4 var(--font-text);
}

.th-codes {
  margin-left: 4px;
  color: var(--text-muted);
  font: 400 12px/1.4 var(--font-code);
}

.th-note,
.th-fine {
  margin: 0;
  color: var(--text-muted);
  font: 400 12.5px/1.45 var(--font-text);
}

.th-src {
  margin: 2px 0 0;
  color: var(--text-muted);
  font: 400 11.5px/1.4 var(--font-code);
  overflow-wrap: anywhere;
}

.th-form {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--line-1);
  border-radius: var(--r-3);
  background: var(--bg-2);
}

.th-kinds {
  display: inline-flex;
  flex: 1 1 100%;
  max-width: max-content;
  border: 1px solid var(--control-line);
  border-radius: var(--r-2);
  overflow: hidden;
}

.th-kind {
  padding: 5px 10px;
  border: 0;
  background: transparent;
  color: var(--text-muted);
  font: 600 12.5px/1.3 var(--font-text);
  cursor: pointer;
  transition: background var(--t-fast) var(--ease-out), color var(--t-fast) var(--ease-out);
}

.th-kind + .th-kind {
  border-left: 1px solid var(--control-line);
}

.th-kind:hover {
  color: var(--text-0);
}

.th-kind[aria-pressed="true"] {
  background: var(--row-active);
  color: var(--signal);
}

.th-fld {
  display: flex;
  flex: 1 1 110px;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  color: var(--text-muted);
  font: 500 12px/1.3 var(--font-text);
}

.th-fld.th-tons {
  flex: 0 1 90px;
}

.th-box {
  box-sizing: border-box;
  width: 100%;
  min-height: 34px;
  padding: 6px 9px;
  border: 1px solid var(--control-line);
  border-radius: var(--r-2);
  background: var(--bg-1);
  color: var(--text-0);
  font: 400 14px/1.3 var(--font-text);
}

.th-num {
  font-variant-numeric: var(--tabular);
}

.th-acts {
  display: flex;
  flex: 1 1 100%;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 6px;
}

.th-err {
  flex: 1 1 100%;
  margin: 4px 0 0;
  padding: 6px 10px;
  border-left: 3px solid var(--danger);
  background: var(--bg-1);
  color: var(--text-1);
}

.th-roll {
  margin-top: 10px;
  padding: 10px 12px;
  border: 1px solid var(--line-1);
  border-left: 3px solid var(--line-2);
  border-radius: var(--r-3);
  background: var(--bg-1);
}

.th-roll.is-found {
  border-left-color: var(--signal);
}

.th-roll-say {
  margin: 0 0 4px;
  color: var(--text-1);
  font: 400 13.5px/1.45 var(--font-text);
}

.th-roll-dice {
  margin: 2px 0 0;
  color: var(--text-0);
  font: 500 12.5px/1.45 var(--font-code);
  font-variant-numeric: var(--tabular);
  overflow-wrap: anywhere;
}

.th-broker .th-acts {
  align-items: center;
  margin-top: 0;
}

.th-goods {
  margin-top: 12px;
}

.th-sub {
  margin: 0 0 6px;
  color: var(--signal-dim);
  font: 700 11px/1.4 var(--font-display);
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.th-rows {
  margin: 6px 0 0;
  padding: 0;
  list-style: none;
  border: 1px solid var(--line-1);
  border-radius: var(--r-3);
  overflow: hidden;
  background: var(--panel-raised);
}

.th-row {
  padding: 8px 10px;
}

.th-row + .th-row {
  border-top: 1px solid var(--line-soft);
}

.th-row-top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  color: var(--text-0);
}

.th-illegal {
  color: var(--attention);
}

.th-price {
  margin: 4px 0 0;
  color: var(--text-0);
  font: 600 13.5px/1.4 var(--font-text);
  font-variant-numeric: var(--tabular);
}

.th-buy {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 8px;
  margin-top: 6px;
}
</style>
