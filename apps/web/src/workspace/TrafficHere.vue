<script setup lang="ts">
/**
 * Find passengers and freight (DT6; backlog T6) on a vessel at its current world. Passengers (DT6a):
 * who wants a jump to a world within the ship's range. The rolls are Z's `campaign/traffic_lots.ts`,
 * read from rules/mgt2e_trade.json or the campaign's chosen trade set; every roll shows its dice, each
 * DM by the file's own label, the row it landed on, and its sources. The referee types the check's
 * Effect and the highest Steward skill aboard; a blank Steward is nobody (A's AT2, question 102). Take
 * adds unnamed passengers of a class to the ship's list, each boarded with the fare (DT3's lot and
 * ledger line), one commit on the vessel's record (vessel_trade.ts). Freight (DT6b): the three lot rolls
 * for the same jump, each lot's tons from the file's dice and its pay on delivery from the fares table;
 * Take a lot puts it in the hold with the pay on it, and Deliver on the cargo row (VesselTrade.vue) posts
 * the pay. Mail (DT6c): after the freight roll (its total DM is the mail table's band, Johnny's ZT0 Q8),
 * whether the ship is chosen to carry mail, with the referee's word on arms, rank and SOC DM; Take puts
 * every container in the hold as one lot, paid on delivery the same way. Nothing here is a rule of its own.
 */
import { computed, reactive, ref, watch } from 'vue';
import { addCargo, capacityTons, tonsUsed } from '../campaign/cargo.ts';
import { postLedger } from '../campaign/ledger.ts';
import { formatCredits } from '../campaign/money.ts';
import { campaign } from '../campaign/store.ts';
import { fare, freightPay, freightTraffic, mailOffer, passageNeeds, passengerTraffic, trafficTables, type FreightResult, type MailResult, type Passenger, type TrafficResult } from '../campaign/traffic_lots.ts';
import { cryptoFace } from '../dice/roll.ts';
import { JUMP_FIELD, jumpNumberOf, jumpParsecs } from '../map/jump_ring.ts';
import { truthAt } from './build/acts.ts';
import { buildStore } from './build/seam.ts';
import { entryAt, marketsAround, startMarkets } from './markets_near.ts';
import { resolveAnchor } from './party.ts';
import { campaignDays, vesselWhere } from './party_where.ts';
import { fieldsOf } from './sheet_fields.ts';
import { citeWords, tradeWorldOf } from './trade_here.ts';
import { useTradeSet } from './trade_set.ts';
import { berthBoxes, berthWords, countsOf, effectOf, fitTake, freightLot, freightWords, holdWords, lotWords, mailLot, mailOfferWords, mailWords, needsWords, passengerWords, rangeFor, rankOf, reachable, rollWords, shownLots, stewardOf, takenLines, takenLots, takeOf, tookWords } from './traffic_here.ts';
import { dayOf, ledgerOf, manifestOf, statusWithTrade, writeTrade } from './vessel_trade.ts';

const props = defineProps<{
    id: string;
    /** Changes cannot be made just now (offline). */
    readOnly: boolean;
}>();

const { ownSet, rolled } = useTradeSet();
const credits = formatCredits;

/** The sheet's box the passengers are compared with by eye: the PDF names it so. */
const CAPACITY_FIELD = 'Passenger Capactiy';
const FARE_KEYS: readonly string[] = ['high', 'middle', 'basic', 'low'];

const record = computed(() => {
    void campaign.seq;
    const found = campaign.records[props.id];
    return found && !found.deleted && found.type === 'vessel' ? found : null;
});

/** The world under the ship, as Trade here reads it (Build's row there, else the chart's), or the chart's index row when the map has not read that sector. */
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
    const entry = row ? (row.state === 'removed' ? null : row.entry) : truthAt(at.hexKey) ?? entryAt(at.hexKey);
    if (!entry || !entry.uwp) return { underway: false as const, hexKey: at.hexKey, name: '', world: null };
    return { underway: false as const, hexKey: at.hexKey, name: entry.name || at.hexKey, world: tradeWorldOf(entry) };
});
const world = computed(() => (place.value && !place.value.underway ? place.value.world : null));
const worldName = computed(() => (place.value && !place.value.underway ? place.value.name : ''));

const values = computed(() => (record.value ? fieldsOf(record.value.sheet) : null));
/** The jump number on the sheet (DU2's reading of Jump Drive Output), and the parsecs it carries. */
const jump = computed(() => jumpNumberOf(values.value));
const parsecsMax = computed(() => (jump.value === null ? null : jumpParsecs(jump.value)));
const capacityText = computed((): string => {
    const typed = values.value ? values.value[CAPACITY_FIELD] : null;
    return typeof typed === 'string' ? typed.trim() : '';
});

// The chart's grid, asked for once the ship stands somewhere; the indexes follow as `entryAt` and `marketsAround` want them.
watch(() => (place.value && !place.value.underway ? place.value.hexKey : null), (key) => {
    if (key) void startMarkets();
}, { immediate: true });

/** The worlds one jump reaches, nearest first, from the markets list around the ship. */
const worlds = computed(() => {
    const here = place.value;
    const max = parsecsMax.value;
    if (!here || here.underway || !max) return { rows: [], waiting: false };
    const found = marketsAround(here.hexKey, rangeFor(max));
    return { rows: reachable(found.rows, max), waiting: found.waiting };
});

const dest = ref('');
const destRow = computed(() => worlds.value.rows.find((row) => row.hexKey === dest.value) ?? null);
/** The destination as the traffic rolls read it: Build's row there, else the chart's index entry. */
const destWorld = computed(() => {
    const row = destRow.value;
    if (!row) return null;
    const store = buildStore();
    const built = store ? store.row(row.hexKey) : null;
    const entry = built ? (built.state === 'removed' ? null : built.entry) : entryAt(row.hexKey);
    return entry && entry.uwp ? tradeWorldOf(entry) : null;
});

function parsecWords(parsecs: number): string {
    return parsecs + (parsecs === 1 ? ' parsec' : ' parsecs');
}

// ---- The roll -------------------------------------------------------------------------------------------

const who = reactive({ effect: '', steward: '' });
const result = ref<TrafficResult | null>(null);
const resultParsecs = ref(0);
const resultDest = ref('');
/** What the referee takes of each class, as typed; the roll's count to start with. */
const taking = reactive<Record<string, string>>({});
const formError = ref('');
const said = ref('');

function rollNow(): void {
    formError.value = '';
    said.value = '';
    const from = world.value;
    const row = destRow.value;
    if (!from || !row) { formError.value = 'Choose a destination.'; return; }
    const to = destWorld.value;
    if (!to) { formError.value = 'The chart has no world to read at ' + (row.name || row.hexKey) + ' yet.'; return; }
    const effect = effectOf(who.effect);
    const steward = stewardOf(who.steward);
    if (effect === null || steward === null) { formError.value = 'Effect and Steward skill are whole numbers. Leave Steward blank when nobody aboard has the skill.'; return; }
    const found = passengerTraffic({ from, to, parsecs: row.parsecs, effect, steward, face: cryptoFace, set: ownSet.value });
    result.value = found;
    resultParsecs.value = row.parsecs;
    resultDest.value = row.name || row.hexKey;
    for (const key of Object.keys(taking)) delete taking[key];
    for (const roll of found.rolls) taking[roll.kind] = String(roll.count);
}

/** The fare for one passenger of this class over the rolled jump, from the file; null when the table has none. */
function fareOf(kind: string): number | null {
    const key = kind.trim().toLowerCase();
    if (!FARE_KEYS.includes(key)) return null;
    const found = fare(resultParsecs.value, key as Passenger, ownSet.value);
    return found ? found.credits : null;
}

/** Each class as typed: the count taken, or the error the typing makes. */
const takes = computed(() => {
    const found = result.value;
    if (!found) return [];
    return found.rolls.map((roll) => {
        const n = takeOf(taking[roll.kind] ?? '', roll.count);
        const fareCr = fareOf(roll.kind);
        const error = n === null ? 'Take 0 to ' + roll.count + ' ' + roll.kind + '.' : n > 0 && fareCr === null ? 'The fares table has no ' + roll.kind + ' fare for ' + parsecWords(resultParsecs.value) + '.' : '';
        return { kind: roll.kind, n: n ?? 0, fareCr: fareCr ?? 0, error };
    });
});
const takeError = computed(() => takes.value.find((one) => one.error)?.error ?? '');
const takeTotal = computed(() => takes.value.reduce((sum, one) => sum + one.n, 0));
const fareTotal = computed(() => takes.value.reduce((sum, one) => sum + one.n * one.fareCr, 0));
const needs = computed(() => passageNeeds(countsOf(Object.fromEntries(takes.value.map((one) => [one.kind, one.n]))), ownSet.value));
/** The needs against the sheet's Staterooms and Low Berths boxes (DT6d, A's AS8b): nothing when no passengers are taken. */
const berths = computed(() => berthWords(values.value, needs.value));
/** Fit to the sheet (DU40): the sheet's two boxes as counts; the button waits on both (DT6d's "Write Staterooms…" sentence says which). */
const boxes = computed(() => berthBoxes(values.value));
const canFit = computed(() => result.value !== null && boxes.value.staterooms !== null && boxes.value.lowBerths !== null);
function fitNow(): void {
    const found = result.value;
    if (!found || !canFit.value) return;
    const fit = fitTake(found.rolls, boxes.value, free.value, (counts) => passageNeeds(counts, ownSet.value));
    if (!fit) return;
    for (const roll of found.rolls) taking[roll.kind] = String(fit[roll.kind] ?? 0);
}
const takeLabel = computed(() => (takeTotal.value > 0 ? 'Take ' + passengerWords(takeTotal.value).toLowerCase() + ', post the fares: ' + credits(fareTotal.value) : 'Take passengers'));

const allCites = computed((): string[] => {
    const found = result.value;
    if (!found) return [];
    const out: string[] = [];
    for (const cite of [...found.cites, ...found.rolls.flatMap((roll) => roll.cites), ...(takeTotal.value > 0 ? needs.value.cites : [])]) if (!out.includes(cite)) out.push(cite);
    return out;
});

// ---- Freight (DT6b) ----------------------------------------------------------------------------------------

const freight = ref<FreightResult | null>(null);
const freightParsecs = ref(0);
const freightDest = ref('');
/** The rolled lots already taken into the hold, by their place in the roll. */
const takenLotAt = ref<number[]>([]);
/** The whole list unfolded (DU37); a new roll folds it again. */
const allLots = ref(false);
const lotsShown = computed(() => shownLots(freight.value ? freight.value.lots.length : 0, allLots.value));
const freightError = ref('');
const freightSaid = ref('');

const hold = computed(() => (record.value ? manifestOf(record.value).cargo : []));
/** The free hold, from the sheet's Cargo Capacity less what is aboard; null when the box has no number. */
const free = computed(() => {
    const capacity = record.value ? capacityTons(fieldsOf(record.value.sheet)) : null;
    return capacity === null ? null : capacity - tonsUsed(hold.value);
});

function rollFreight(): void {
    formError.value = '';
    freightError.value = '';
    freightSaid.value = '';
    const from = world.value;
    const row = destRow.value;
    if (!from || !row) { formError.value = 'Choose a destination.'; return; }
    const to = destWorld.value;
    if (!to) { formError.value = 'The chart has no world to read at ' + (row.name || row.hexKey) + ' yet.'; return; }
    const effect = effectOf(who.effect);
    if (effect === null) { formError.value = 'The Effect is a whole number; blank is no check.'; return; }
    freight.value = freightTraffic({ from, to, parsecs: row.parsecs, effect, face: cryptoFace, set: ownSet.value });
    freightParsecs.value = row.parsecs;
    freightDest.value = row.name || row.hexKey;
    takenLotAt.value = [];
    allLots.value = false;
    mail.value = null;
    mailTaken.value = false;
    mailError.value = '';
}

// ---- Mail (DT6c) --------------------------------------------------------------------------------------------

/** The referee's word: the ship armed, the highest Naval or Scout rank aboard, the highest SOC DM. */
const post = reactive({ armed: false, rank: '', soc: '' });
const mail = ref<MailResult | null>(null);
const mailTaken = ref(false);
const mailError = ref('');
const mailNone = ref(false);

function rollMail(): void {
    mailError.value = '';
    mailNone.value = false;
    const from = world.value;
    const found = freight.value;
    if (!from || !found) { mailError.value = 'Roll for freight first: the mail table reads that roll\'s DM.'; return; }
    const rank = rankOf(post.rank);
    const soc = effectOf(post.soc);
    if (rank === null || soc === null) { mailError.value = 'Rank is a whole number 0 or more; the SOC DM a whole number. Blank is 0.'; return; }
    const offer = mailOffer({ freightDm: found.sharedDm, armed: post.armed, world: from, navalOrScoutRank: rank, socDm: soc, face: cryptoFace, set: ownSet.value });
    if (!offer) { mailNone.value = true; return; }
    mail.value = offer;
    mailTaken.value = false;
}

/** Take the mail: every container as one lot in the hold, the pay on it, one commit. */
function takeMail(): void {
    const now = record.value;
    const offer = mail.value;
    if (!now || !offer || !offer.offered || props.readOnly || mailTaken.value) return;
    writeTrade(now, { status: statusWithTrade(now, { cargo: addCargo(hold.value, mailLot(offer, worldName.value, freightDest.value)) }) });
    mailTaken.value = true;
}

/** The pay for a rolled lot on delivery, from the fares table's row for the jump; null past the table. */
function payOf(tons: number): { perTon: number; credits: number } | null {
    const found = freightPay(freightParsecs.value, tons, ownSet.value);
    return found ? { perTon: found.perTon, credits: found.credits } : null;
}

/** The file's dice for a lot of this kind ("1D x 10"), for the words. */
function specOf(kind: string): string {
    return trafficTables(ownSet.value).freight.lots.find((one) => one.name === kind)?.tons ?? '';
}

const freightCites = computed((): string[] => {
    const found = freight.value;
    if (!found) return [];
    const out: string[] = [];
    for (const cite of [...found.cites, ...found.rolls.flatMap((roll) => roll.cites), ...found.lots.flatMap((lot) => lot.cites)]) if (!out.includes(cite)) out.push(cite);
    return out;
});

/** Take a lot: into the hold as cargo with the pay on it, from here to the destination, one commit; the row's Deliver posts the pay. */
function takeLot(at: number): void {
    const now = record.value;
    const found = freight.value;
    const lot = found ? found.lots[at] : null;
    if (!now || !lot || props.readOnly || takenLotAt.value.includes(at)) return;
    const pay = payOf(lot.tons);
    if (!pay) { freightError.value = 'The fares table has no freight rate for ' + parsecWords(freightParsecs.value) + '.'; return; }
    const cargo = freightLot(lot, pay.credits, worldName.value, freightDest.value);
    writeTrade(now, { status: statusWithTrade(now, { cargo: addCargo(hold.value, cargo) }) });
    takenLotAt.value = takenLotAt.value.concat(at);
    freightSaid.value = 'Took the ' + lot.kind + ' lot, ' + lot.tons + ' t, into the hold: ' + credits(pay.credits) + ' on delivery at ' + freightDest.value + '. Deliver is on its cargo row.';
}

/** Take: the lots on the list, each with its fare, and one fare line per passenger on the ledger, one commit. */
function takeNow(): void {
    const now = record.value;
    if (!now || props.readOnly || takeError.value || takeTotal.value === 0) return;
    const when = dayOf(campaignDays(campaign.clock));
    const lots = manifestOf(now).passengers.slice();
    let ledger = ledgerOf(now);
    let fares = 0;
    for (const take of takes.value) {
        if (take.n === 0) continue;
        lots.push(...takenLots(take.n, take.kind, take.fareCr));
        for (const line of takenLines(take.n, take.kind, resultParsecs.value, take.fareCr, when)) { ledger = postLedger(ledger, line); fares += 1; }
    }
    writeTrade(now, { status: statusWithTrade(now, { passengers: lots, ledger }) });
    said.value = tookWords(takes.value, fares, credits(fareTotal.value));
    for (const take of takes.value) taking[take.kind] = '0';
}
</script>

<template>
  <section v-if="record" class="tf ui-frame" data-traffic-here aria-labelledby="tf-h">
    <div class="tf-head">
      <h3 id="tf-h" class="ui-frame-label">Find passengers and freight</h3>
      <p class="tf-fine" data-traffic-set>{{ rolled.label }}<template v-if="rolled.words">. {{ rolled.words }}</template></p>
      <span v-if="world" class="tf-where">{{ worldName }}</span>
    </div>

    <p v-if="!place" class="tf-note">To find passengers, set where the ship is.</p>
    <p v-else-if="place.underway" class="tf-note">The ship is under way. Look for passengers when it is at a world.</p>
    <p v-else-if="!world" class="tf-note">There is no world here. If the chart has not read this hex, the world shows when it has.</p>
    <p v-else-if="jump === null" class="tf-note" data-traffic-nojump>Write the ship's jump number in the sheet's {{ JUMP_FIELD }} box to list the worlds it can reach.</p>
    <template v-else>
      <form class="tf-form" data-traffic-form @submit.prevent="rollNow">
        <label class="tf-fld tf-dest"><span>Destination, within {{ parsecWords(parsecsMax ?? 0) }}</span>
          <select v-model="dest" class="tf-box" data-traffic-dest>
            <option value="">{{ worlds.rows.length ? 'Choose a world' : worlds.waiting ? 'Reading the chart' : 'No worlds within range' }}</option>
            <option v-for="row in worlds.rows" :key="row.hexKey" :value="row.hexKey">{{ row.name || row.hexKey }} · {{ parsecWords(row.parsecs) }}</option>
          </select>
        </label>
        <label class="tf-fld tf-small"><span>Check Effect</span><input v-model="who.effect" class="tf-box tf-num" inputmode="numeric" placeholder="0" data-traffic-effect /></label>
        <label class="tf-fld tf-small"><span>Highest Steward skill aboard</span><input v-model="who.steward" class="tf-box tf-num" inputmode="numeric" placeholder="None" data-traffic-steward /></label>
        <p v-if="formError" class="tf-err" role="alert">{{ formError }}</p>
        <div class="tf-acts">
          <button type="submit" class="ui-btn is-primary" :disabled="!destRow" data-traffic-roll>Roll for passengers</button>
          <button type="button" class="ui-btn" :disabled="!destRow" data-traffic-roll-freight @click="rollFreight">Roll for freight</button>
          <span class="tf-fine">The Effect is the Broker, Carouse or Streetwise check's; blank is no check. A blank Steward means nobody aboard has the skill.</span>
        </div>
      </form>

      <div v-if="freight" class="tf-roll" data-traffic-freight role="status">
        <p class="tf-roll-say"><b>Freight for {{ freightDest }}, {{ parsecWords(freightParsecs) }}.</b> Three rolls, Incidental, Minor and Major, as the file lists them; each lot's tons from its dice; pay on delivery from the fares table.</p>
        <ul class="tf-rows">
          <li v-for="roll in freight.rolls" :key="roll.kind" class="tf-row" :data-traffic-freight-kind="roll.kind">
            <div class="tf-row-top">
              <b class="tf-kind">{{ roll.kind }}</b>
              <span class="tf-count" data-traffic-freight-count>{{ lotWords(roll.count) }}</span>
            </div>
            <p class="tf-roll-dice" data-traffic-dice>{{ rollWords(roll) }}</p>
          </li>
        </ul>
        <p v-if="freight.unread.length" class="tf-err" role="alert" data-traffic-freight-unread>DMs the file names that this screen cannot read, not applied: {{ freight.unread.join(', ') }}.</p>
        <ul v-if="freight.lots.length" class="tf-lots">
          <li v-for="(lot, at) in freight.lots.slice(0, lotsShown.shown)" :key="at" class="tf-lot" :class="{ 'is-taken': takenLotAt.includes(at) }" :data-traffic-lot="at">
            <span class="tf-lot-main"><b>{{ lot.kind }} lot</b> <span class="tf-lot-words" data-traffic-lot-words>{{ freightWords(lot, specOf(lot.kind), payOf(lot.tons)) }}</span></span>
            <span v-if="holdWords(lot.tons, free)" class="tf-lot-hold" data-traffic-lot-hold>{{ holdWords(lot.tons, free) }}</span>
            <span v-if="takenLotAt.includes(at)" class="tf-lot-taken" data-traffic-lot-taken>In the hold</span>
            <button v-else type="button" class="ui-btn" :disabled="readOnly || !payOf(lot.tons)" data-traffic-take-lot @click="takeLot(at)">Take the lot</button>
          </li>
        </ul>
        <p v-else class="tf-fine">No lots on offer for this jump.</p>
        <button v-if="lotsShown.more" type="button" class="tf-more" data-traffic-lots-more @click="allLots = true">Show all {{ freight.lots.length }} lots</button>
        <p v-if="freightError" class="tf-err" role="alert">{{ freightError }}</p>
        <p v-if="freightSaid" class="tf-said" role="status" data-traffic-freight-said>{{ freightSaid }}</p>
        <p v-if="citeWords(freightCites)" class="tf-src">Sources: {{ citeWords(freightCites) }}</p>

        <form class="tf-form tf-mail" data-traffic-mail-form @submit.prevent="rollMail">
          <p class="tf-mail-say"><b>Mail.</b> The mail table reads this freight roll's DM ({{ freight.sharedDm >= 0 ? '+' + freight.sharedDm : '−' + (-freight.sharedDm) }}), the world's tech level, and your word on the rest.</p>
          <label class="tf-check"><input v-model="post.armed" type="checkbox" data-traffic-armed /> The ship is armed</label>
          <label class="tf-fld tf-small"><span>Highest Naval or Scout rank aboard</span><input v-model="post.rank" class="tf-box tf-num" inputmode="numeric" placeholder="0" data-traffic-rank /></label>
          <label class="tf-fld tf-small"><span>Highest SOC DM aboard</span><input v-model="post.soc" class="tf-box tf-num" inputmode="numeric" placeholder="0" data-traffic-soc /></label>
          <p v-if="mailError" class="tf-err" role="alert">{{ mailError }}</p>
          <p v-if="mailNone" class="tf-err" role="alert" data-traffic-mail-none>The trade tables have no mail table.</p>
          <div class="tf-acts">
            <button type="submit" class="ui-btn is-primary" data-traffic-roll-mail>Is there mail?</button>
          </div>
          <div v-if="mail" class="tf-mail-result" data-traffic-mail-result role="status">
            <p class="tf-roll-dice" data-traffic-mail-dice>{{ mailWords(mail) }}</p>
            <template v-if="mail.offered">
              <p class="tf-roll-say" data-traffic-mail-offer>{{ mailOfferWords(mail) }}</p>
              <p v-if="holdWords(mail.tons, free)" class="tf-lot-hold" data-traffic-mail-hold>{{ holdWords(mail.tons, free) }}</p>
              <p v-if="mailTaken" class="tf-said" data-traffic-mail-taken>The mail is in the hold, one lot: Deliver is on its cargo row.</p>
              <div v-else class="tf-acts">
                <button type="button" class="ui-btn is-primary tf-take-all" :disabled="readOnly" data-traffic-take-mail @click="takeMail">Take the mail: {{ mail.containers }} {{ mail.containers === 1 ? 'container' : 'containers' }}, {{ credits(mail.credits) }} on delivery</button>
              </div>
            </template>
            <p v-if="mail.unread.length" class="tf-err" role="alert">DMs the file names that this screen cannot read, not applied: {{ mail.unread.join(', ') }}.</p>
            <p v-if="citeWords(mail.cites)" class="tf-src">Sources: {{ citeWords(mail.cites) }}</p>
          </div>
        </form>
      </div>

      <div v-if="result" class="tf-roll" data-traffic-result role="status">
        <p class="tf-roll-say"><b>Passengers for {{ resultDest }}, {{ parsecWords(resultParsecs) }}.</b> Each roll's DMs are the file's, by its own labels.</p>
        <ul class="tf-rows">
          <li v-for="roll in result.rolls" :key="roll.kind" class="tf-row" :data-traffic-kind="roll.kind">
            <div class="tf-row-top">
              <b class="tf-kind">{{ roll.kind }}</b>
              <span class="tf-count" data-traffic-count>{{ passengerWords(roll.count) }}</span>
              <span v-if="fareOf(roll.kind) !== null" class="tf-fare" data-traffic-fare>{{ credits(fareOf(roll.kind) ?? 0) }} each</span>
              <label v-if="roll.count > 0" class="tf-take"><span>Take</span><input v-model="taking[roll.kind]" class="tf-box tf-num" inputmode="numeric" :aria-label="'Take ' + roll.kind + ' passengers, up to ' + roll.count" data-traffic-take /></label>
            </div>
            <p class="tf-roll-dice" data-traffic-dice>{{ rollWords(roll) }}</p>
          </li>
        </ul>
        <p v-if="result.unread.length" class="tf-err" role="alert" data-traffic-unread>DMs the file names that this screen cannot read, not applied: {{ result.unread.join(', ') }}.</p>
        <p v-if="takeTotal > 0" class="tf-fine" data-traffic-needs>{{ passengerWords(takeTotal) }} need {{ needsWords(needs) || 'nothing the file lists' }}<template v-if="capacityText">. The sheet's Passenger Capacity box says: {{ capacityText }}</template>.</p>
        <p v-for="line in berths.lines" :key="line.field" class="tf-fine" :class="{ 'is-short': line.short > 0 }" data-traffic-berths :data-traffic-berth="line.field" :data-traffic-short="line.short">{{ line.words }}</p>
        <p v-if="berths.missing" class="tf-fine" data-traffic-berths-missing>{{ berths.missing }}</p>
        <p v-if="takeError" class="tf-err" role="alert">{{ takeError }}</p>
        <div class="tf-acts">
          <button type="button" class="ui-btn" :disabled="readOnly || !canFit" :title="canFit ? 'Fill the Take boxes with what the sheet\'s staterooms, low berths and free hold take, the dearest fares first' : 'Write Staterooms and Low Berths on the ship sheet first'" data-traffic-fit @click="fitNow">Fit to the sheet</button>
          <button type="button" class="ui-btn is-primary tf-take-all" :disabled="readOnly || takeTotal === 0 || takeError !== ''" data-traffic-take-all @click="takeNow">{{ takeLabel }}</button>
          <span class="tf-fine">Taken passengers go on the ship's list unnamed, boarded with the fare; name one there or roll a passenger.</span>
        </div>
        <p v-if="said" class="tf-said" role="status" data-traffic-said>{{ said }}</p>
        <p v-if="citeWords(allCites)" class="tf-src">Sources: {{ citeWords(allCites) }}</p>
      </div>
    </template>
  </section>
</template>

<style>
.tf-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 12px;
  margin-bottom: 10px;
}

.tf-head .ui-frame-label {
  margin: 0;
}

.tf-where {
  color: var(--text-0);
  font: 600 13.5px/1.4 var(--font-text);
}

.tf-note,
.tf-fine {
  margin: 0;
  color: var(--text-muted);
  font: 400 12.5px/1.45 var(--font-text);
}

/* Short of staterooms or low berths (DT6d), in the look's attention colour as Payment's "Overdue". */
.tf-fine.is-short {
  color: var(--attention);
}

.tf-src {
  margin: 2px 0 0;
  color: var(--text-muted);
  font: 400 11.5px/1.4 var(--font-code);
  overflow-wrap: anywhere;
}

.tf-form {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--line-1);
  border-radius: var(--r-3);
  background: var(--bg-2);
}

.tf-fld {
  display: flex;
  flex: 1 1 110px;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  color: var(--text-muted);
  font: 500 12px/1.3 var(--font-text);
}

.tf-fld.tf-dest {
  flex: 2 1 220px;
}

.tf-fld.tf-small {
  flex: 0 1 150px;
}

.tf-box {
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

.tf-num {
  font-variant-numeric: var(--tabular);
}

.tf-acts {
  display: flex;
  flex: 1 1 100%;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  margin-top: 6px;
}

.tf-err {
  flex: 1 1 100%;
  margin: 4px 0 0;
  padding: 6px 10px;
  border-left: 3px solid var(--danger);
  background: var(--bg-1);
  color: var(--text-1);
}

.tf-roll {
  margin-top: 10px;
  padding: 10px 12px;
  border: 1px solid var(--line-1);
  border-left: 3px solid var(--signal);
  border-radius: var(--r-3);
  background: var(--bg-1);
}

.tf-roll-say {
  margin: 0 0 4px;
  color: var(--text-1);
  font: 400 13.5px/1.45 var(--font-text);
}

.tf-rows {
  margin: 6px 0 0;
  padding: 0;
  list-style: none;
}

.tf-row {
  padding: 6px 0;
}

.tf-row + .tf-row {
  border-top: 1px solid var(--line-1);
}

.tf-row-top {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 10px;
}

.tf-kind {
  min-width: 52px;
  color: var(--text-0);
  font: 600 13.5px/1.4 var(--font-text);
}

.tf-count {
  color: var(--text-1);
  font: 500 13px/1.4 var(--font-text);
}

.tf-fare {
  color: var(--text-muted);
  font: 500 12.5px/1.4 var(--font-text);
  font-variant-numeric: var(--tabular);
}

.tf-take {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
  color: var(--text-muted);
  font: 500 12px/1.3 var(--font-text);
}

.tf-take .tf-box {
  width: 64px;
  min-height: 30px;
  padding: 4px 8px;
}

.tf-roll-dice {
  margin: 2px 0 0;
  color: var(--text-0);
  font: 500 12.5px/1.45 var(--font-code);
  font-variant-numeric: var(--tabular);
  overflow-wrap: anywhere;
}

/* The take's label names the count and the credits: it wraps on a phone rather than widen the pane. */
.tf-take-all {
  max-width: 100%;
  white-space: normal;
  text-align: left;
}

.tf-lots {
  margin: 8px 0 0;
  padding: 8px 0 0;
  border-top: 1px solid var(--line-1);
  list-style: none;
}

.tf-lot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 10px;
  padding: 5px 0;
}

.tf-lot + .tf-lot {
  border-top: 1px solid var(--line-soft);
}

.tf-lot-main {
  flex: 1 1 200px;
  min-width: 0;
  color: var(--text-0);
  font: 400 13px/1.45 var(--font-text);
}

.tf-lot-words {
  color: var(--text-1);
  font-variant-numeric: var(--tabular);
}

.tf-lot-hold {
  flex: 1 1 100%;
  order: 3;
  color: var(--warn, var(--text-muted));
  font: 500 12px/1.4 var(--font-text);
}

/* The fold on a long list (DU37), in the track's look. */
.tf-more {
  margin: 6px 0 0;
  padding: 2px 0;
  border: 0;
  background: transparent;
  color: var(--signal);
  font: 500 12.5px/1.4 var(--font-text);
  cursor: pointer;
}

.tf-more:hover {
  color: var(--signal-bright);
}

.tf-lot-taken {
  color: var(--signal);
  font: 600 12.5px/1.4 var(--font-text);
}

.tf-lot.is-taken .tf-lot-main {
  color: var(--text-muted);
}

.tf-mail {
  margin-top: 10px;
}

.tf-mail-say {
  flex: 1 1 100%;
  margin: 0;
  color: var(--text-1);
  font: 400 13px/1.45 var(--font-text);
}

.tf-check {
  display: inline-flex;
  flex: 1 1 100%;
  align-items: center;
  gap: 6px;
  color: var(--text-1);
  font: 500 12.5px/1.3 var(--font-text);
}

.tf-mail-result {
  flex: 1 1 100%;
  margin-top: 4px;
  padding-top: 8px;
  border-top: 1px solid var(--line-1);
}

.tf-said {
  margin: 8px 0 0;
  color: var(--signal);
  font: 500 13px/1.45 var(--font-text);
}
</style>
