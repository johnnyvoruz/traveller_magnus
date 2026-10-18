<script setup lang="ts">
/**
 * A vessel's Cargo and Ledger on its page (streams/D.md DT1; backlog Epic T, step T1, Lane D's half).
 * Cargo: the manifest's lots (vessel_trade.ts: one source with the ship sheet's sixteen Cargo rows),
 * a gauge of tons against the sheet's Cargo Capacity, and Add a lot (label, tons, paid, where; the date
 * is the campaign clock's, on the ledger line a payment posts). Ledger: the lines by day, the balance,
 * and Add a line (amount, memo, kind, date). Fuel and costs (DT2, Lane A's campaign/refuel.ts): Refuel
 * (refined or unrefined, the typed current level, the cost from the rules file shown before posting)
 * where the screen knows the world under the ship, and Post this month's upkeep (the five recurring
 * cost boxes, the same figure as Upkeep: DF12b; shown before posting). Owners and payment (DT1c, Lane A's campaign/ship_finance.ts): who holds the
 * ship's shares and each one's part of the total, the payment as typed with when it is due and Pay now,
 * and the upkeep, one figure with its parts; Fuel shows what is aboard against the Fuel Capacity, and a
 * refuel fills it. Passengers (DT3b): the list the sheet's Passenger rows edit, and Roll a passenger
 * from the rules file's table (Lane A's campaign/passengers.ts; passenger_roll.ts says and keeps it).
 * Typed by the referee, but for that one roll: no rule of its own. Money is written by
 * campaign/money.ts. Saves ride the record's save; no server of its own.
 */
import { computed, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { CampaignRecord, CargoLot, LedgerLine, OwnerShare, ShipPayment } from '@voyage/shared';
import { addCargo, capacityTons, removeCargo, tonsUsed } from '../campaign/cargo.ts';
import { ledgerBalance, ledgerByPeriod, postLedger } from '../campaign/ledger.ts';
import { formatCredits } from '../campaign/money.ts';
import { fuelCapacityTons, fuelOffers, fuelTonsOf, monthlyLines, MONTHLY_COST_FIELDS, refuelLine, tonsToFill, type FuelOffer } from '../campaign/refuel.ts';
import { payNow, paymentWhenFromClock, shareParts, typedPaymentAmount, upkeep } from '../campaign/ship_finance.ts';
import { rollPassenger, type RolledPassenger } from '../campaign/passengers.ts';
import { commit, newLinkId, newRecordId } from '../campaign/commit.ts';
import { atPane } from '../shell/pane.ts';
import { justCreated } from './actions.ts';
import { createdLink } from './links.ts';
import { keptPassenger, rollWords } from './passenger_roll.ts';
import { created } from './records.ts';
import RecordPicker from './RecordPicker.vue';
import { starport } from '../map/uwp.ts';
import { truthAt } from './build/acts.ts';
import { buildStore } from './build/seam.ts';
import { resolveAnchor } from './party.ts';
import { campaign } from '../campaign/store.ts';
import Icon from '../design/Icon.vue';
import { campaignDays, vesselWhere } from './party_where.ts';
import { fieldsOf } from './sheet_fields.ts';
import { anchorName } from './track_rows.ts';
import { dayOf, dayWords, fuelMarkOf, ledgerOf, manifestOf, signedAmount, statusWithTrade, writeTrade, type Day } from './vessel_trade.ts';

const props = defineProps<{
    id: string;
    /** Changes cannot be made just now (offline). */
    readOnly: boolean;
}>();

const record = computed(() => {
    void campaign.seq;
    const found = campaign.records[props.id];
    return found && !found.deleted && found.type === 'vessel' ? found : null;
});
const cargo = computed(() => (record.value ? manifestOf(record.value).cargo : []));
const ledger = computed(() => (record.value ? ledgerOf(record.value) : []));
const capacity = computed(() => (record.value ? capacityTons(fieldsOf(record.value.sheet)) : null));
const used = computed(() => tonsUsed(cargo.value));
const gauge = computed(() => (capacity.value ? Math.min(1, used.value / capacity.value) : 0));
const over = computed(() => capacity.value !== null && used.value > capacity.value);
const balance = computed(() => ledgerBalance(ledger.value));
/** Newest day first, as a register reads. */
const periods = computed(() => ledgerByPeriod(ledger.value).reverse());
const today = computed((): Day => dayOf(campaignDays(campaign.clock)));
/** Where the vessel is now, in the Party tab's words: a new lot's "where". */
const here = computed(() => {
    const now = record.value;
    if (!now) return '';
    const at = vesselWhere(now, campaign.records, campaignDays(campaign.clock)).anchor;
    return at ? anchorName(at, campaign.records) : '';
});

/** A debit as "−Cr4,800". The minus is formatCredits's, before Cr. */
const credits = (n: number): string => formatCredits(n);
const tons = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(1)) + ' t';

// ---- Add a lot ------------------------------------------------------------------------------------------

const lotOpen = ref(false);
const lot = reactive({ label: '', tons: '', paid: '', where: '', post: true });
const lotError = ref('');

function openLot(): void {
    lot.label = '';
    lot.tons = '';
    lot.paid = '';
    lot.where = here.value;
    lot.post = true;
    lotError.value = '';
    lotOpen.value = true;
}

function number(text: string): number | null {
    const n = Number(text.replace(/,/g, '').trim());
    return text.trim() !== '' && Number.isFinite(n) ? n : null;
}

function addLot(): void {
    const now = record.value;
    if (!now || props.readOnly) return;
    const label = lot.label.trim();
    const t = number(lot.tons);
    const paid = lot.paid.trim() ? number(lot.paid) : null;
    if (!label) { lotError.value = 'Name the lot: what the cargo is.'; return; }
    if (t === null || t < 0) { lotError.value = 'Give the tons as a number, 0 or more.'; return; }
    if (lot.paid.trim() && (paid === null || paid < 0)) { lotError.value = 'Give what was paid as a number of credits, or leave it empty.'; return; }
    const next: CargoLot = { label, tons: t };
    if (paid !== null) next.value = paid;
    if (lot.where.trim()) next.origin = lot.where.trim();
    const change: { cargo: CargoLot[]; ledger?: LedgerLine[] } = { cargo: addCargo(cargo.value, next) };
    if (paid && lot.post) change.ledger = postLedger(ledger.value, { when: today.value, amount: signedAmount(paid, 'expense'), memo: 'Bought ' + label + ' (' + tons(t) + ')', kind: 'expense' });
    writeTrade(now, { status: statusWithTrade(now, change) });
    lotOpen.value = false;
}

function dropLot(index: number): void {
    const now = record.value;
    if (!now || props.readOnly) return;
    writeTrade(now, { status: statusWithTrade(now, { cargo: removeCargo(cargo.value, index) }) });
}

// ---- Add a line -----------------------------------------------------------------------------------------

const lineOpen = ref(false);
const line = reactive({ amount: '', memo: '', kind: 'expense' as LedgerLine['kind'], day: '', year: '' });
const lineError = ref('');

function openLine(): void {
    line.amount = '';
    line.memo = '';
    line.kind = 'expense';
    line.day = String(today.value.day);
    line.year = String(today.value.year);
    lineError.value = '';
    lineOpen.value = true;
}

function addLine(): void {
    const now = record.value;
    if (!now || props.readOnly) return;
    const amount = number(line.amount);
    const day = number(line.day);
    const year = number(line.year);
    if (amount === null || amount === 0) { lineError.value = 'Give the amount in credits.'; return; }
    if (!line.memo.trim()) { lineError.value = 'Say what the line is for.'; return; }
    if (day === null || !Number.isInteger(day) || day < 1 || day > 365 || year === null || !Number.isInteger(year)) { lineError.value = 'Give the date as a day from 1 to 365 and a year.'; return; }
    const posted: LedgerLine = { when: { year, day }, amount: signedAmount(amount, line.kind), memo: line.memo.trim(), kind: line.kind };
    writeTrade(now, { status: statusWithTrade(now, { ledger: postLedger(ledger.value, posted) }) });
    lineOpen.value = false;
}

// ---- Fuel and costs (DT2) ---------------------------------------------------------------------------------

/**
 * The world under the ship, as the map knows it (Build's row there, else the chart's): its name and its
 * starport class. Null under way, at a hex the map has not read, or at an empty hex.
 */
const world = computed(() => {
    const now = record.value;
    if (!now) return null;
    void campaign.seq;
    const where = vesselWhere(now, campaign.records, campaignDays(campaign.clock));
    if (where.underway) return null;
    const place = resolveAnchor(where.anchor, campaign.records);
    if (!place) return null;
    const store = buildStore();
    if (store) void store.tick();
    const row = store ? store.row(place.hexKey) : null;
    const entry = row ? (row.state === 'removed' ? null : row.entry) : truthAt(place.hexKey);
    if (!entry || !entry.uwp) return null;
    return { name: entry.name || place.hexKey, port: starport(entry.uwp), bases: entry.bases || '' };
});
const fuelCapacity = computed(() => (record.value ? fuelCapacityTons(fieldsOf(record.value.sheet)) : null));
/** The offer picked, by its key ("starport:C", "base:N"), and a base fuel's price as typed. */
const fuel = reactive({ pick: '', price: '' });
/** Tons aboard (status.fuelTons, DT1c): typed by the referee, filled by a refuel. Null until typed. */
const aboard = computed(() => (record.value ? fuelTonsOf(record.value.status) : null));
const fuelLevel = computed(() => aboard.value ?? 0);
const fuelGauge = computed(() => (fuelCapacity.value ? Math.min(1, fuelLevel.value / fuelCapacity.value) : 0));
const fuelTons = computed(() => tonsToFill(fuelCapacity.value, fuelLevel.value));
// ---- What this world sells (DT2b, Lane A's fuelOffers from the rules file) ----
/** A ship the players are attached to: base fuel is offered only to one of these, when marked. */
const inParty = computed(() => {
    const party = campaign.settings ? campaign.settings.party : null;
    return !!party && !!record.value && party.vesselIds.includes(record.value.id);
});
const mark = computed(() => (record.value ? fuelMarkOf(record.value) : null));
const offers = computed((): FuelOffer[] => (world.value ? fuelOffers(world.value.port, world.value.bases, inParty.value, mark.value) : []));
const offerKey = (offer: FuelOffer): string => offer.from + ':' + offer.code;
const offer = computed(() => offers.value.find((item) => offerKey(item) === fuel.pick) ?? offers.value[0] ?? null);
const BASE_WORDS: Record<string, string> = { naval: 'Naval base', scout: 'Scout base' };
const baseWords = computed(() => (mark.value ? BASE_WORDS[mark.value] : 'Base'));
function offerWords(item: FuelOffer): string {
    const grade = item.grade === 'refined' ? 'Refined' : 'Unrefined';
    if (item.from === 'starport') return grade + ' at the starport, ' + credits(item.crPerTon ?? 0) + ' a ton';
    return grade + ' at the ' + baseWords.value.toLowerCase() + (item.crPerTon !== null ? ', ' + credits(item.crPerTon) + ' a ton' : ', at the price you type');
}
/** Cr a ton for the offer picked: the file's, or the typed one where the file leaves it to the referee. */
const fuelPrice = computed(() => {
    const now = offer.value;
    if (!now) return null;
    if (now.crPerTon !== null) return now.crPerTon;
    const typed = number(fuel.price);
    return typed !== null && typed >= 0 ? typed : null;
});
const fuelCost = computed(() => (fuelPrice.value !== null ? fuelTons.value * fuelPrice.value : null));
const fuelSaid = ref('');
const fuelError = ref('');

/** The tons aboard, typed: written to the ship's status at once, as a sheet box is. */
function setAboard(event: Event): void {
    const now = record.value;
    if (!now || props.readOnly) return;
    const n = number((event.target as HTMLInputElement).value);
    if (n === null || n < 0) {
        fuelError.value = 'Give the fuel aboard as a number of tons, 0 or more.';
        return;
    }
    fuelError.value = '';
    writeTrade(now, { status: statusWithTrade(now, { fuelTons: n }) });
}

/** Posts the refuel and fills the tanks: the fuel aboard becomes the Fuel Capacity. */
function postRefuel(): void {
    const now = record.value;
    const cap = fuelCapacity.value;
    if (!now || props.readOnly || cap === null) return;
    const picked = offer.value;
    const price = fuelPrice.value;
    if (!picked || price === null) return;
    const tonsIn = tonsToFill(cap, fuelLevel.value);
    // The starport's price is the file's (refuelLine); a base's is the referee's, written the same way.
    const posted = picked.from === 'starport'
        ? refuelLine(today.value, cap, fuelLevel.value, picked.grade)
        : tonsIn > 0 ? { when: today.value, amount: -(tonsIn * price), memo: 'Refuel, ' + picked.grade + ', ' + baseWords.value.toLowerCase() + ', ' + tonsIn + ' t', kind: 'expense' as const } : null;
    if (!posted) return;
    writeTrade(now, { status: statusWithTrade(now, { ledger: postLedger(ledger.value, posted), fuelTons: cap }) });
    fuelSaid.value = 'Posted: ' + posted.memo + ', ' + credits(posted.amount) + '. The tanks are full.';
}

/** The referee's mark on a party vessel, written at once (DT2b). Not marked clears it. */
function setMark(event: Event): void {
    const now = record.value;
    if (!now || props.readOnly) return;
    const value = (event.target as HTMLSelectElement).value;
    writeTrade(now, { status: statusWithTrade(now, { fuelMark: value === 'naval' || value === 'scout' ? value : undefined }) });
}

/** What Post this month would post: one recurring line per cost box with a number, dated today. */
const month = computed(() => (record.value ? monthlyLines(fieldsOf(record.value.sheet), today.value) : []));
const monthTotal = computed(() => ledgerBalance(month.value));
const monthSaid = ref('');

function postMonth(): void {
    const now = record.value;
    if (!now || props.readOnly || !month.value.length) return;
    let next = ledger.value;
    for (const posted of month.value) next = postLedger(next, posted);
    writeTrade(now, { status: statusWithTrade(now, { ledger: next }) });
    monthSaid.value = "Posted this month's upkeep: " + month.value.length + (month.value.length === 1 ? ' line, ' : ' lines, ') + credits(monthTotal.value) + ', dated ' + dayWords(today.value) + '.';
}

// ---- Passengers and Roll a passenger (DT3b) ---------------------------------------------------------------

const route = useRoute();
const router = useRouter();
const passengers = computed(() => (record.value ? manifestOf(record.value).passengers : []));
const rolled = ref<RolledPassenger | null>(null);
const rollError = ref('');

function rollOne(): void {
    if (props.readOnly) return;
    const next = rollPassenger();
    rolled.value = next;
    rollError.value = next ? '' : 'The passenger table could not be rolled: its dice are not D66, or the roll is not one of its entries.';
}

function openRecord(id: string): void {
    void router.push(atPane(route.path, route.query, { kind: 'campaign', record: id }));
}

/** Keep: the person, aboard and linked as a passenger, and on the list, in one change; then its page, name marked. */
function keepRolled(): void {
    const now = record.value;
    const roll = rolled.value;
    if (!now || !roll || props.readOnly) return;
    const kept = keptPassenger(now, roll, { person: newRecordId(), link: newLinkId() }, new Date().toISOString());
    const status = statusWithTrade(now, { passengers: kept.passengers }) as CampaignRecord['status'];
    commit({ records: [created(kept.person), { ...now, status, baseRev: now.rev }], links: [createdLink(kept.link)] });
    rolled.value = null;
    justCreated.value = kept.person.id;
    openRecord(kept.person.id);
}

// ---- Owners, payment and upkeep (DT1c) -------------------------------------------------------------------

const owners = computed((): OwnerShare[] => {
    const status = record.value ? record.value.status : null;
    return status && Array.isArray(status.owners) ? status.owners : [];
});
const shares = computed(() => shareParts(owners.value));

function holderName(holder: OwnerShare['holder']): string {
    if (holder === 'party') return 'The party';
    const found = campaign.records[holder.id];
    return found && !found.deleted ? found.name : 'A record that is gone';
}

/** A holder's part of the total, as a percentage: arithmetic on the typed counts, not a price. */
const percent = (part: number): string => (Math.round(part * 1000) / 10).toLocaleString('en-US') + '%';
const count = (n: number): string => n.toLocaleString('en-US') + (n === 1 ? ' share' : ' shares');

const ownerOpen = ref(false);
const owner = reactive({ holder: null as OwnerShare['holder'] | null, shares: '' });
const ownerError = ref('');

function openOwner(): void {
    owner.holder = null;
    owner.shares = '';
    ownerError.value = '';
    ownerOpen.value = true;
}

function pickHolder(picked: CampaignRecord): void {
    owner.holder = { kind: 'record', id: picked.id };
}

function addOwner(): void {
    const now = record.value;
    if (!now || props.readOnly || !owner.holder) return;
    const n = number(owner.shares);
    if (n === null || n <= 0) { ownerError.value = 'Give the shares as a number above 0.'; return; }
    writeTrade(now, { status: statusWithTrade(now, { owners: [...owners.value, { holder: owner.holder, shares: n }] }) });
    ownerOpen.value = false;
}

function setShares(index: number, event: Event): void {
    const now = record.value;
    if (!now || props.readOnly) return;
    const n = number((event.target as HTMLInputElement).value);
    if (n === null || n <= 0) { ownerError.value = 'Give the shares as a number above 0.'; return; }
    ownerError.value = '';
    writeTrade(now, { status: statusWithTrade(now, { owners: owners.value.map((row, i) => (i === index ? { ...row, shares: n } : row)) }) });
}

function dropOwner(index: number): void {
    const now = record.value;
    if (!now || props.readOnly) return;
    writeTrade(now, { status: statusWithTrade(now, { owners: owners.value.filter((_, i) => i !== index) }) });
}

const payment = computed((): ShipPayment | null => {
    const status = record.value ? record.value.status : null;
    return status && status.payment ? status.payment : null;
});
const due = computed(() => (payment.value ? paymentWhenFromClock(payment.value, campaignDays(campaign.clock)) : null));
const plural = (n: number, one: string): string => n + ' ' + one + (n === 1 ? '' : 's');
const dueWords = computed(() => {
    const when = due.value;
    if (!when) return '';
    if (when.state === 'today') return 'Due today';
    return when.state === 'due' ? 'Due in ' + plural(when.days, 'day') : 'Overdue by ' + plural(when.days, 'day');
});

const payOpen = ref(false);
const pay = reactive({ amount: '', every: '', day: '', year: '', payee: '' });
const payError = ref('');
const paySaid = ref('');

/** Set a payment, or change it. A new one's amount starts from the Mortgage Cost box; no period is assumed. */
function openPay(): void {
    const now = payment.value;
    const amount = typedPaymentAmount(now, record.value ? fieldsOf(record.value.sheet) : null);
    pay.amount = amount !== null ? String(amount) : '';
    pay.every = now ? String(now.everyDays) : '';
    pay.day = String(now ? now.nextDueDay.day : today.value.day);
    pay.year = String(now ? now.nextDueDay.year : today.value.year);
    pay.payee = now && now.payee ? now.payee : '';
    payError.value = '';
    paySaid.value = '';
    payOpen.value = true;
}

function savePay(): void {
    const now = record.value;
    if (!now || props.readOnly) return;
    const amount = number(pay.amount);
    const every = number(pay.every);
    const day = number(pay.day);
    const year = number(pay.year);
    if (amount === null || amount <= 0) { payError.value = 'Give the payment in credits, above 0.'; return; }
    if (every === null || !Number.isInteger(every) || every <= 0) { payError.value = 'Give how often it falls due as a whole number of days.'; return; }
    if (day === null || !Number.isInteger(day) || day < 1 || day > 365 || year === null || !Number.isInteger(year)) { payError.value = 'Give the next due date as a day from 1 to 365 and a year.'; return; }
    const next: ShipPayment = { amountCr: amount, everyDays: every, nextDueDay: { year, day } };
    if (pay.payee.trim()) next.payee = pay.payee.trim();
    writeTrade(now, { status: statusWithTrade(now, { payment: next }) });
    payOpen.value = false;
}

/** Pay now: the ledger line, dated today, and the next due day moved on by the typed period. */
function payToday(): void {
    const now = record.value;
    const owed = payment.value;
    if (!now || !owed || props.readOnly) return;
    const paid = payNow(owed, today.value);
    if (!paid) return;
    writeTrade(now, { status: statusWithTrade(now, { ledger: postLedger(ledger.value, paid.line), payment: paid.payment }) });
    paySaid.value = 'Paid ' + credits(owed.amountCr) + '. Next due ' + dayWords(paid.payment.nextDueDay) + '.';
}

/** The recurring boxes summed: one figure, and each part (Lane A's upkeep). */
const upkept = computed(() => upkeep(record.value ? fieldsOf(record.value.sheet) : null));

const KIND_WORDS: Record<LedgerLine['kind'], string> = { income: 'Income', expense: 'Expense', recurring: 'Recurring cost' };
</script>

<template>
  <div v-if="record" class="vt">
    <section class="vt-sec ui-frame" data-vessel-cargo aria-labelledby="vt-cargo-h">
      <div class="vt-head">
        <h3 id="vt-cargo-h" class="ui-frame-label">Cargo <span v-if="cargo.length" class="ui-frame-count">{{ cargo.length }}</span></h3>
        <button v-if="!lotOpen" type="button" class="ui-btn" :disabled="readOnly" data-add-lot @click="openLot"><Icon name="plus" :size="12" />Add a lot</button>
      </div>
      <div class="vt-gauge" :class="{ 'is-over': over }">
        <span class="vt-gauge-words"><b>{{ tons(used) }}</b><template v-if="capacity !== null"> of {{ tons(capacity) }}</template><template v-else> aboard. Write the Cargo Capacity on the ship sheet to see how full the hold is.</template></span>
        <span v-if="capacity !== null" class="vt-gauge-bar" role="meter" :aria-valuenow="used" aria-valuemin="0" :aria-valuemax="capacity" :aria-label="'Cargo: ' + tons(used) + ' of ' + tons(capacity)"><i :style="{ width: gauge * 100 + '%' }"></i></span>
        <span v-if="over" class="vt-over" role="status">Over capacity by {{ tons(used - capacity!) }}.</span>
      </div>
      <ol v-if="cargo.length" class="vt-rows">
        <li v-for="(item, i) in cargo" :key="i" class="vt-row">
          <span class="vt-main"><b>{{ item.label || 'Unnamed lot' }}</b> <span class="vt-num">{{ tons(item.tons) }}</span></span>
          <span class="vt-meta">
            <template v-if="item.value != null">{{ credits(item.value) }}</template>
            <template v-if="item.origin"> · from {{ item.origin }}</template>
            <template v-if="item.destination"> · to {{ item.destination }}</template>
            <template v-if="item.note"> · {{ item.note }}</template>
          </span>
          <button type="button" class="ui-btn vt-drop" :disabled="readOnly" :aria-label="'Remove ' + (item.label || 'this lot')" title="Remove this lot" @click="dropLot(i)"><Icon name="xmark" :size="11" /></button>
        </li>
      </ol>
      <p v-else-if="!lotOpen" class="vt-none">Nothing in the hold. The ship sheet's Cargo rows are this list too.</p>
      <form v-if="lotOpen" class="vt-form" data-lot-form @submit.prevent="addLot">
        <label class="vt-fld vt-wide"><span>Lot</span><input v-model="lot.label" class="vt-box" maxlength="120" placeholder="Machine parts" /></label>
        <label class="vt-fld"><span>Tons</span><input v-model="lot.tons" class="vt-box vt-num" inputmode="decimal" /></label>
        <label class="vt-fld"><span>Paid (Cr)</span><input v-model="lot.paid" class="vt-box vt-num" inputmode="decimal" /></label>
        <label class="vt-fld vt-wide"><span>Where</span><input v-model="lot.where" class="vt-box" maxlength="120" /></label>
        <label v-if="lot.paid.trim()" class="vt-check"><input v-model="lot.post" type="checkbox" /> Post the payment to the ledger, dated {{ dayWords(today) }}</label>
        <p v-if="lotError" class="vt-err" role="alert">{{ lotError }}</p>
        <div class="vt-acts">
          <button type="button" class="ui-btn" @click="lotOpen = false">Cancel</button>
          <button type="submit" class="ui-btn is-primary" :disabled="readOnly">Add the lot</button>
        </div>
      </form>
    </section>

    <section class="vt-sec ui-frame" data-vessel-ledger aria-labelledby="vt-ledger-h">
      <div class="vt-head">
        <h3 id="vt-ledger-h" class="ui-frame-label">Ledger <span class="ui-frame-count" :class="{ 'is-minus': balance < 0 }">{{ credits(balance) }}</span></h3>
        <button v-if="!lineOpen" type="button" class="ui-btn" :disabled="readOnly" data-add-line @click="openLine"><Icon name="plus" :size="12" />Add a line</button>
      </div>
      <form v-if="lineOpen" class="vt-form" data-line-form @submit.prevent="addLine">
        <label class="vt-fld"><span>Amount (Cr)</span><input v-model="line.amount" class="vt-box vt-num" inputmode="decimal" /></label>
        <label class="vt-fld"><span>Kind</span>
          <select v-model="line.kind" class="vt-box">
            <option value="expense">Expense</option>
            <option value="income">Income</option>
            <option value="recurring">Recurring cost</option>
          </select>
        </label>
        <label class="vt-fld vt-wide"><span>For</span><input v-model="line.memo" class="vt-box" maxlength="200" placeholder="Berthing fees" /></label>
        <label class="vt-fld vt-day"><span>Day</span><input v-model="line.day" class="vt-box vt-num" inputmode="numeric" /></label>
        <label class="vt-fld vt-day"><span>Year</span><input v-model="line.year" class="vt-box vt-num" inputmode="numeric" /></label>
        <p class="vt-fine">An expense or a recurring cost is taken off the balance; income is added.</p>
        <p v-if="lineError" class="vt-err" role="alert">{{ lineError }}</p>
        <div class="vt-acts">
          <button type="button" class="ui-btn" @click="lineOpen = false">Cancel</button>
          <button type="submit" class="ui-btn is-primary" :disabled="readOnly">Post the line</button>
        </div>
      </form>
      <div v-if="periods.length" class="vt-days">
        <section v-for="period in periods" :key="period.year + '-' + period.day" class="vt-day-group">
          <h4 class="vt-day-head"><span class="ui-date">{{ dayWords({ year: period.year, day: period.day }) }}</span> <span class="vt-num" :class="{ 'is-minus': period.balance < 0 }">{{ credits(period.balance) }}</span></h4>
          <ul class="vt-rows">
            <li v-for="(item, i) in period.lines" :key="i" class="vt-row is-line">
              <span class="vt-main">{{ item.memo }} <small class="vt-kind">{{ KIND_WORDS[item.kind] }}</small></span>
              <span class="vt-num vt-amount" :class="{ 'is-minus': item.amount < 0 }">{{ credits(item.amount) }}</span>
            </li>
          </ul>
        </section>
      </div>
      <p v-else-if="!lineOpen" class="vt-none">No lines yet. Post what the ship takes in and pays out; the balance is their sum.</p>
    </section>

    <section class="vt-sec ui-frame" data-vessel-passengers aria-labelledby="vt-pass-h">
      <div class="vt-head">
        <h3 id="vt-pass-h" class="ui-frame-label">Passengers <span v-if="passengers.length" class="ui-frame-count">{{ passengers.length }}</span></h3>
        <button v-if="!rolled" type="button" class="ui-btn" :disabled="readOnly" data-roll-passenger @click="rollOne">Roll a passenger</button>
      </div>
      <div v-if="rolled" class="vt-roll" data-passenger-roll>
        <span class="vt-dice" aria-hidden="true"><span v-for="(face, i) in rolled.dice" :key="i" class="vt-die">{{ face }}</span></span>
        <p class="vt-roll-words" role="status">{{ rollWords(rolled) }}</p>
        <div class="vt-acts">
          <button type="button" class="ui-btn is-primary" :disabled="readOnly" data-keep-passenger @click="keepRolled">Keep</button>
          <button type="button" class="ui-btn" :disabled="readOnly" data-roll-again @click="rollOne">Roll again</button>
          <button type="button" class="ui-btn" @click="rolled = null">Cancel</button>
        </div>
      </div>
      <p v-if="rollError" class="vt-err" role="alert">{{ rollError }}</p>
      <ul v-if="passengers.length" class="vt-rows">
        <li v-for="(item, i) in passengers" :key="i" class="vt-row is-line">
          <span class="vt-main">
            <button v-if="item.personId && campaign.records[item.personId] && !campaign.records[item.personId].deleted" type="button" class="vt-link" @click="openRecord(item.personId)">{{ campaign.records[item.personId].name }}</button>
            <b v-else>{{ item.label || 'Unnamed passenger' }}</b>
          </span>
          <span v-if="item.class" class="vt-meta">{{ item.class }}</span>
        </li>
      </ul>
      <p v-else-if="!rolled" class="vt-none">No passengers. The ship sheet's Passenger rows are this list too.</p>
    </section>

    <section class="vt-sec ui-frame" data-vessel-owners aria-labelledby="vt-owners-h">
      <div class="vt-head">
        <h3 id="vt-owners-h" class="ui-frame-label">Owners and payment</h3>
      </div>
      <div class="vt-part" data-owners>
        <div class="vt-part-row">
          <h4 class="vt-part-head">Owners <span v-if="owners.length" class="vt-fine">{{ count(shares.total) }}</span></h4>
          <button v-if="!ownerOpen" type="button" class="ui-btn" :disabled="readOnly" data-add-owner @click="openOwner"><Icon name="plus" :size="12" />Add an owner</button>
        </div>
        <ul v-if="owners.length" class="vt-rows">
          <li v-for="(row, i) in shares.holders" :key="i" class="vt-row is-line">
            <span class="vt-main">{{ holderName(row.holder) }}</span>
            <label class="vt-shares"><span class="rec-sr">Shares held by {{ holderName(row.holder) }}</span><input :value="row.shares" class="vt-box vt-num" inputmode="decimal" :disabled="readOnly" @change="setShares(i, $event)" /></label>
            <span class="vt-num vt-amount">{{ percent(row.part) }}</span>
            <button type="button" class="ui-btn vt-drop" :disabled="readOnly" :aria-label="'Remove ' + holderName(row.holder) + ' as an owner'" title="Remove this owner" @click="dropOwner(i)"><Icon name="xmark" :size="11" /></button>
          </li>
        </ul>
        <p v-else-if="!ownerOpen" class="vt-none">No owners yet. Add who holds the ship's shares: a person, an organization, or the party.</p>
        <div v-if="ownerOpen" class="vt-form" data-owner-form>
          <template v-if="!owner.holder">
            <RecordPicker exclude="" :types="['person', 'organization']" placeholder="Search your people and organizations" none="No people or organizations yet. Add one as a record first." @pick="pickHolder" @cancel="ownerOpen = false" />
            <div class="vt-acts">
              <button type="button" class="ui-btn" data-owner-party @click="owner.holder = 'party'">The party</button>
              <button type="button" class="ui-btn" @click="ownerOpen = false">Cancel</button>
            </div>
          </template>
          <form v-else class="vt-form is-inline" @submit.prevent="addOwner">
            <p class="vt-at"><b>{{ holderName(owner.holder) }}</b></p>
            <label class="vt-fld"><span>Shares</span><input v-model="owner.shares" class="vt-box vt-num" inputmode="decimal" required /></label>
            <div class="vt-acts">
              <button type="submit" class="ui-btn is-primary">Add</button>
              <button type="button" class="ui-btn" @click="ownerOpen = false">Cancel</button>
            </div>
          </form>
        </div>
        <p v-if="ownerError" class="vt-err" role="alert">{{ ownerError }}</p>
      </div>
      <div class="vt-part" data-payment>
        <div class="vt-part-row">
          <h4 class="vt-part-head">Payment</h4>
          <button v-if="!payOpen" type="button" class="ui-btn" :disabled="readOnly" data-set-payment @click="openPay"><Icon :name="payment ? 'pen-to-square' : 'plus'" :size="12" />{{ payment ? 'Change' : 'Set a payment' }}</button>
        </div>
        <template v-if="payment && !payOpen">
          <p class="vt-at"><b>{{ credits(payment.amountCr) }} every {{ plural(payment.everyDays, 'day') }}</b><template v-if="payment.payee"> to {{ payment.payee }}</template></p>
          <p class="vt-due" :class="{ 'is-late': due && due.state !== 'due' }" role="status">{{ dueWords }} · <span class="ui-date">{{ dayWords(payment.nextDueDay) }}</span></p>
          <div class="vt-acts">
            <button type="button" class="ui-btn is-primary" data-pay-now :disabled="readOnly" @click="payToday">Pay now: {{ credits(-payment.amountCr) }}</button>
          </div>
        </template>
        <p v-else-if="!payOpen" class="vt-none">No payment set. Set what the ship pays, how often, and when it is next due.</p>
        <form v-if="payOpen" class="vt-form is-inline" data-payment-form @submit.prevent="savePay">
          <label class="vt-fld"><span>Amount (Cr)</span><input v-model="pay.amount" class="vt-box vt-num" inputmode="decimal" required /></label>
          <label class="vt-fld"><span>Every (days)</span><input v-model="pay.every" class="vt-box vt-num" inputmode="numeric" required /></label>
          <label class="vt-fld"><span>Next due, day</span><input v-model="pay.day" class="vt-box vt-num" inputmode="numeric" required /></label>
          <label class="vt-fld"><span>Year</span><input v-model="pay.year" class="vt-box vt-num" inputmode="numeric" required /></label>
          <label class="vt-fld is-wide"><span>To (optional)</span><input v-model="pay.payee" class="vt-box" placeholder="The bank, a patron" /></label>
          <p v-if="payError" class="vt-err" role="alert">{{ payError }}</p>
          <div class="vt-acts">
            <button type="submit" class="ui-btn is-primary">Save</button>
            <button type="button" class="ui-btn" @click="payOpen = false">Cancel</button>
          </div>
        </form>
        <p v-if="paySaid" class="vt-said" role="status">{{ paySaid }}</p>
      </div>
      <div class="vt-part" data-upkeep>
        <h4 class="vt-part-head">Upkeep</h4>
        <template v-if="upkept.parts.length">
          <p class="vt-at"><b>{{ credits(upkept.total) }} a month</b></p>
          <ul class="vt-rows is-parts">
            <li v-for="part in upkept.parts" :key="part.name" class="vt-row is-line">
              <span class="vt-main">{{ part.name }}</span>
              <span class="vt-num vt-amount">{{ credits(part.amount) }}</span>
            </li>
          </ul>
        </template>
        <p v-else class="vt-none">Write the ship's recurring costs on the ship sheet (Mortgage, Maintenance, Life Support, Salary, Running) to see its upkeep.</p>
      </div>
    </section>

    <section class="vt-sec ui-frame" data-vessel-costs aria-labelledby="vt-costs-h">
      <div class="vt-head">
        <h3 id="vt-costs-h" class="ui-frame-label">Fuel and costs</h3>
      </div>
      <div class="vt-part" data-fuel>
        <h4 class="vt-part-head">Fuel</h4>
        <p v-if="fuelCapacity === null" class="vt-none">Write the Fuel Capacity on the ship sheet to see the fuel aboard against it.</p>
        <template v-else>
          <div class="vt-gauge">
            <span class="vt-gauge-words"><b>{{ tons(fuelLevel) }}</b> of {{ tons(fuelCapacity) }}<template v-if="aboard === null">: type what is aboard</template></span>
            <span class="vt-gauge-bar" role="meter" :aria-valuenow="fuelLevel" aria-valuemin="0" :aria-valuemax="fuelCapacity" :aria-label="'Fuel: ' + tons(fuelLevel) + ' of ' + tons(fuelCapacity)"><i :style="{ width: fuelGauge * 100 + '%' }"></i></span>
          </div>
          <label class="vt-fld vt-aboard"><span>Fuel aboard (t)</span><input :value="aboard ?? ''" class="vt-box vt-num" inputmode="decimal" placeholder="0" :disabled="readOnly" data-fuel-aboard @change="setAboard" /></label>
          <p v-if="fuelError" class="vt-err" role="alert">{{ fuelError }}</p>
        </template>
        <label v-if="inParty" class="vt-fld vt-mark"><span>Base fuel (referee only)</span>
          <select class="vt-box" :value="mark ?? ''" :disabled="readOnly" data-fuel-mark @change="setMark">
            <option value="">Not marked</option>
            <option value="naval">Naval vessel</option>
            <option value="scout">Scout ship</option>
          </select>
        </label>
      </div>
      <div class="vt-part" data-refuel>
        <h4 class="vt-part-head">Refuel</h4>
        <p v-if="!world" class="vt-none">Refuel when the ship is at a world: under way, or at a hex the map has not read, there is nowhere to buy fuel.</p>
        <p v-else-if="fuelCapacity === null" class="vt-none">At {{ world.name }}, starport {{ world.port }}. Write the Fuel Capacity on the ship sheet to refuel.</p>
        <template v-else>
          <p class="vt-at">At {{ world.name }}, starport <b>{{ world.port }}</b>.</p>
          <p v-if="!offers.length" class="vt-none" data-no-fuel>No fuel is sold here: starport {{ world.port }} sells none<template v-if="mark">, and there is no {{ baseWords.toLowerCase() }}</template>.</p>
          <div v-else class="vt-form is-inline">
            <label class="vt-fld"><span>Fuel</span>
              <select v-model="fuel.pick" class="vt-box" data-fuel-offer>
                <option v-for="item in offers" :key="offerKey(item)" :value="offerKey(item)">{{ offerWords(item) }}</option>
              </select>
            </label>
            <label v-if="offer && offer.crPerTon === null" class="vt-fld"><span>Price (Cr a ton)</span><input v-model="fuel.price" class="vt-box vt-num" inputmode="decimal" data-fuel-price /></label>
            <p class="vt-fine" role="status">{{ fuelTons <= 0 ? 'The tanks are full: nothing to take on.' : fuelCost === null ? 'Type the price a ton to see what filling the tanks costs.' : 'Fills the tanks: takes on ' + tons(fuelTons) + ' for ' + credits(fuelCost) + '.' }}</p>
            <div class="vt-acts">
              <button type="button" class="ui-btn is-primary" data-post-refuel :disabled="readOnly || fuelTons <= 0 || fuelCost === null" @click="postRefuel">Post the refuel</button>
            </div>
          </div>
        </template>
        <p v-if="fuelSaid" class="vt-said" role="status">{{ fuelSaid }}</p>
      </div>
      <div class="vt-part" data-month>
        <h4 class="vt-part-head">This month's upkeep</h4>
        <template v-if="month.length">
          <ul class="vt-rows">
            <li v-for="item in month" :key="item.memo" class="vt-row is-line">
              <span class="vt-main">{{ item.memo }}</span>
              <span class="vt-num vt-amount is-minus">{{ credits(item.amount) }}</span>
            </li>
          </ul>
          <div class="vt-acts">
            <button type="button" class="ui-btn is-primary" data-post-month :disabled="readOnly" @click="postMonth">Post this month's upkeep: {{ credits(monthTotal) }}, dated {{ dayWords(today) }}</button>
          </div>
        </template>
        <p v-else class="vt-none">Write the ship's recurring costs on the ship sheet ({{ MONTHLY_COST_FIELDS.join(', ') }}) to post its upkeep each month.</p>
        <p v-if="monthSaid" class="vt-said" role="status">{{ monthSaid }}</p>
      </div>
    </section>
  </div>
</template>

<style>
.vt {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.vt-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.vt-head .ui-frame-label {
  flex: 1 1 auto;
  margin: 0;
}

.vt-num {
  font-variant-numeric: var(--tabular);
}

.is-minus {
  color: var(--attention);
}

.vt-gauge {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 12px;
  margin-bottom: 10px;
  color: var(--text-1);
}

.vt-gauge-bar {
  flex: 1 1 160px;
  height: 6px;
  overflow: hidden;
  border: 1px solid var(--line-2);
  border-radius: var(--r-pill);
  background: var(--bg-2);
}

.vt-gauge-bar i {
  display: block;
  height: 100%;
  background: var(--signal);
}

.vt-gauge.is-over .vt-gauge-bar i {
  background: var(--attention);
}

.vt-over {
  color: var(--attention);
}

.vt-rows {
  margin: 0;
  padding: 0;
  list-style: none;
}

.vt-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px 12px;
  padding: 6px 0;
  border-bottom: 1px solid var(--line-soft);
}

.vt-main {
  flex: 1 1 auto;
  min-width: 0;
  color: var(--text-0);
}

.vt-meta {
  flex: 1 1 100%;
  order: 3;
  color: var(--text-muted);
  font-size: 12.5px;
}

.vt-meta:empty {
  display: none;
}

.vt-drop {
  justify-content: center;
  min-width: 30px;
}

.vt-kind {
  margin-left: 6px;
  color: var(--text-muted);
}

.vt-amount {
  color: var(--text-0);
}

.vt-days {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.vt-day-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin: 4px 0 2px;
  color: var(--text-1);
  font: 600 13px/1.4 var(--font-text);
}

.vt-none {
  margin: 0;
  color: var(--text-muted);
}

.vt-form {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 10px;
  margin: 8px 0 4px;
  padding: 10px 12px;
  border: 1px solid var(--line-1);
  border-radius: var(--r-3);
  background: var(--bg-2);
}

.vt-fld {
  display: flex;
  flex: 1 1 110px;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  color: var(--text-muted);
  font: 500 12px/1.3 var(--font-text);
}

.vt-fld.vt-wide {
  flex: 2 1 200px;
}

.vt-fld.vt-day {
  flex: 0 1 80px;
}

.vt-box {
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

.vt-check {
  display: flex;
  flex: 1 1 100%;
  align-items: center;
  gap: 8px;
  color: var(--text-1);
}

.vt-fine {
  flex: 1 1 100%;
  margin: 0;
  color: var(--text-muted);
  font-size: 12.5px;
}

.vt-err {
  flex: 1 1 100%;
  margin: 0;
  padding: 6px 10px;
  border-left: 3px solid var(--danger);
  background: var(--bg-1);
  color: var(--text-1);
}

.vt-acts {
  display: flex;
  flex: 1 1 100%;
  justify-content: flex-end;
  gap: 8px;
}

/* Fuel and costs: two parts, each a small head, what it would post, and its button. */
.vt-part + .vt-part {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--line-soft);
}

.vt-part-head {
  margin: 0 0 6px;
  color: var(--text-0);
  font: 700 13px/1.4 var(--font-text);
}

.vt-at {
  margin: 0 0 6px;
  color: var(--text-1);
}

.vt-form.is-inline {
  margin-top: 4px;
}

.vt-said {
  margin: 8px 0 0;
  color: var(--signal);
}

/* Owners and payment (DT1c): a part's head with its button; a holder's shares as a small box. */
.vt-part-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.vt-part-row .vt-part-head {
  margin: 0;
}

.vt-shares {
  flex: 0 0 auto;
}

.vt-shares .vt-box {
  width: 80px;
}

.vt-due {
  margin: 0 0 6px;
  color: var(--text-1);
}

/* Today or late: the look's warning colour. */
.vt-due.is-late {
  color: var(--attention);
}

.vt-mark {
  flex: 0 1 220px;
  margin-top: 8px;
}

.vt-aboard {
  flex: 0 1 160px;
  margin-top: 8px;
}

.vt-fld.is-wide {
  flex-basis: 100%;
}

/* A rolled passenger: the dice thrown, then what they say, then Keep or Roll again. */
.vt-roll {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  margin: 4px 0 8px;
  padding: 10px 12px;
  border: 1px solid var(--line-2);
  border-radius: var(--r-3);
  background: var(--bg-1);
}

.vt-dice {
  display: inline-flex;
  gap: 4px;
}

.vt-die {
  display: inline-grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border: 1px solid var(--signal-dim);
  border-radius: var(--r-1);
  color: var(--text-0);
  font: 700 13px/1 var(--font-code);
}

.vt-roll-words {
  flex: 1 1 200px;
  margin: 0;
  color: var(--text-0);
  font: 600 14px/1.4 var(--font-text);
}

.vt-link {
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--text-0);
  font: 700 13.5px/1.4 var(--font-text);
  text-align: left;
  cursor: pointer;
}

.vt-link:hover {
  color: var(--signal);
}

.vt-rows.is-parts .vt-row {
  padding: 3px 0;
  color: var(--text-muted);
}

@media (max-width: 640px) {
  .vt .ui-btn,
  .vt-box {
    min-height: 44px;
  }

  .vt-drop {
    min-width: 44px;
  }
}
</style>
