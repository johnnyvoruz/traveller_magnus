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
 * from the rules file's table (Lane A's campaign/passengers.ts; passenger_roll.ts says and keeps it). Each
 * passenger's Passage is one of the rules file's classes, and Board posts the fare for the jump to the
 * ledger from the file's fares table (DT3; passenger_fare.ts).
 * Typed by the referee, but for that one roll: no rule of its own. Money is written by
 * campaign/money.ts. Saves ride the record's save; no server of its own.
 */
import { computed, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { CampaignRecord, CargoLot, LedgerLine, OwnerShare, PassengerLot, ShipPayment } from '@voyage/shared';
import { addCargo, capacityTons, removeCargo, tonsUsed } from '../campaign/cargo.ts';
import { ledgerBalance, ledgerByPeriod, postLedger } from '../campaign/ledger.ts';
import { formatCredits } from '../campaign/money.ts';
import { fuelCapacityTons, fuelOffers, fuelTonsOf, monthlyLines, MONTHLY_COST_FIELDS, refuelLine, tonsToFill, type FuelOffer } from '../campaign/refuel.ts';
import { payNow, paymentWhenFromClock, shareParts, typedPaymentAmount, upkeep } from '../campaign/ship_finance.ts';
import { rollPassenger, type RolledPassenger } from '../campaign/passengers.ts';
import { lateReduction } from '../campaign/traffic_lots.ts';
import { cryptoFace } from '../dice/roll.ts';
import { commit, newLinkId, newRecordId } from '../campaign/commit.ts';
import { trackOf } from '../campaign/track.ts';
import { marketsChart, sectorAtOf, startMarkets } from './markets_near.ts';
import { atPane } from '../shell/pane.ts';
import { justCreated } from './actions.ts';
import { createdLink } from './links.ts';
import { boarded, boardStart, fareFor, fareLine, fareParsecs, isBoarded, nextJump, passageClasses, unboarded, withClass, type PassageClass } from './passenger_fare.ts';
import { keptPassenger, rollWords } from './passenger_roll.ts';
import { deliveredLine, disembarked, disembarkWords, dueFrom, isFreight, lastUpkeep, periodsShown, shownRows, upkeepPostedWords } from './traffic_here.ts';
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
import { PAYMENT_IS_MORTGAGE, SET_MORTGAGE_HERE, leftOutWords, monthWithPayment } from './upkeep_payment.ts';
import { dayOf, dayWords, fuelMarkOf, ledgerOf, lotMeta, manifestOf, signedAmount, statusWithTrade, writeTrade, type Day } from './vessel_trade.ts';
import CrewList from './CrewList.vue';
import ShipLocker from './ShipLocker.vue';

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
/** The Ledger folds after its first ten lines (DU38, as the freight list does); Show all unfolds it; a new line unfolds nothing. */
const allLines = ref(false);
const linesShown = computed(() => shownRows(ledger.value.length, allLines.value));
const periodsCut = computed(() => periodsShown(periods.value, linesShown.value.shown));
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
    if (!label) { lotError.value = 'Name the lot. Say what the cargo is.'; return; }
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

// ---- Deliver freight (DT6b) --------------------------------------------------------------------------------

/** The cargo row whose Deliver form is open. */
const delivering = ref<number | null>(null);
/** Delivered on time, or late (DU48, Johnny's 130: a choice, no due day): on time is chosen first each time the form opens. */
const deliver = reactive({ choice: 'ontime' as 'ontime' | 'late' });
const deliverError = ref('');

function openDeliver(i: number): void {
    delivering.value = i;
    deliver.choice = 'ontime';
    deliverError.value = '';
}

/** Deliver: the pay on the ledger as income (less the file's late cut when Delivered late is chosen, rolled now), the lot out of the hold, one commit. */
function deliverNow(): void {
    const now = record.value;
    const i = delivering.value;
    const item = i === null ? null : cargo.value[i];
    if (!now || i === null || !item || !isFreight(item) || props.readOnly) return;
    const late = deliver.choice === 'late' ? lateReduction(cryptoFace) : null;
    if (deliver.choice === 'late' && !late) { deliverError.value = 'The trade tables have no late-delivery cut.'; return; }
    const line = deliveredLine(item, today.value, late, world.value ? world.value.name : undefined);
    writeTrade(now, { status: statusWithTrade(now, { cargo: removeCargo(cargo.value, i), ledger: postLedger(ledger.value, line) }) });
    delivering.value = null;
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
/** The ship is between places at the campaign date (a leg under way): nothing is delivered or disembarked. */
const underway = computed(() => {
    const now = record.value;
    if (!now) return false;
    void campaign.seq;
    return vesselWhere(now, campaign.records, campaignDays(campaign.clock)).underway;
});
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
/** The month's lines as the sheet gives them; with a Payment set, Mortgage Cost is the Payment's and is left out, said in its place (DU47). */
const monthAll = computed(() => (record.value ? monthlyLines(fieldsOf(record.value.sheet), today.value) : []));
const monthCut = computed(() => monthWithPayment(monthAll.value, payment.value !== null));
const month = computed(() => monthCut.value.lines);
const mortgageLeftOut = computed(() => monthCut.value.leftOut);
const monthTotal = computed(() => ledgerBalance(month.value));
const monthSaid = ref('');
/** When the upkeep was last posted, from the Ledger's recurring cost lines (DU43); no month length is assumed. */
const monthLast = computed(() => upkeepPostedWords(lastUpkeep(ledger.value, MONTHLY_COST_FIELDS), today.value));

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
/** The Passengers list folds after its first ten (DU38); the rows keep their places, so a row's actions work on the same indexes. */
const allPassengers = ref(false);
const passengersShown = computed(() => shownRows(passengers.value.length, allPassengers.value));
const rolled = ref<RolledPassenger | null>(null);
const rollError = ref('');

// ---- Passage and the fare (DT3) ----------------------------------------------------------------------------

/** The rules file's passage classes and the jumps its fares table prices. */
const classes: PassageClass[] = passageClasses();
const jumps: number[] = fareParsecs();
/** The lot whose Board form is open. */
const boarding = ref<number | null>(null);
const board = reactive({ parsecs: '' });
const boardError = ref('');

/** The passenger's name: the person's when the lot holds a live one, else the lot's label. */
function passengerName(lot: PassengerLot): string {
    const person = lot.personId ? campaign.records[lot.personId] : null;
    return person && !person.deleted ? person.name : lot.label;
}

/** A Passage word the file does not name, so the select can still show it chosen. */
function strayClass(lot: PassengerLot): string {
    return lot.class && !classes.some((one) => one.name === lot.class) ? lot.class : '';
}

/** The Passage chosen on a row: written to the manifest at once, as a sheet box is. */
function setClass(i: number, event: Event): void {
    const now = record.value;
    const target = event.target;
    if (!now || props.readOnly || !(target instanceof HTMLSelectElement)) return;
    writeTrade(now, { status: statusWithTrade(now, { passengers: withClass(passengers.value, i, target.value) }) });
}

/** The ship's next jump on its track (DT3d), once the chart's grid is in to measure it. */
const nextLeg = computed(() => {
    const now = record.value;
    const sectors = marketsChart.sectors;
    return now && sectors ? nextJump(trackOf(now), campaignDays(campaign.clock), sectorAtOf(sectors)) : null;
});

/** "Next leg, Regina system to Efate system: 2 parsecs." Where the form's jump came from. */
const nextLegWords = computed((): string => {
    const next = nextLeg.value;
    if (!next) return '';
    const words = 'Next leg, ' + anchorName(next.from, campaign.records) + ' to ' + anchorName(next.to, campaign.records) + ': ' + next.parsecs + (next.parsecs === 1 ? ' parsec.' : ' parsecs.');
    return boardStart(next, jumps) ? words : words + ' The fares table has no row for that jump.';
});

function openBoard(i: number): void {
    boarding.value = i;
    board.parsecs = boardStart(nextLeg.value, jumps);
    boardError.value = '';
    if (record.value && trackOf(record.value)) void startMarkets();
}

// The grid may arrive after the form opened: an empty jump then takes the next leg's.
watch(nextLeg, (next) => {
    if (boarding.value !== null && !board.parsecs) board.parsecs = boardStart(next, jumps);
});

/** The fare the form would post: the lot's class over the chosen jump, from the file. */
const boardFare = computed(() => {
    const i = boarding.value;
    const lot = i === null ? null : passengers.value[i];
    const parsecs = Number(board.parsecs);
    return lot && parsecs ? fareFor(lot.class, parsecs) : null;
});

const boardWords = computed((): string => {
    const i = boarding.value;
    const lot = i === null ? null : passengers.value[i];
    if (!lot) return '';
    if (!classes.some((one) => one.key === lot.class.trim().toLowerCase())) return 'Choose a passage the fares table names: ' + classes.map((one) => one.name).join(', ') + '.';
    if (!board.parsecs) return 'Choose the jump to see the fare.';
    const found = boardFare.value;
    if (!found) return 'The fares table has no row for that jump.';
    return lot.class + ' passage, ' + board.parsecs + (board.parsecs === '1' ? ' parsec: ' : ' parsecs: ') + credits(found.credits) + '. It posts to the Ledger as income, dated ' + dayWords(today.value) + '.';
});

// ---- Arrival (DW3 round 5): boarded passengers leave the ship; their fares stay on the Ledger. ----
const boardedCount = computed(() => passengers.value.filter((one) => isBoarded(one)).length);
const passSaid = ref('');
function disembarkOne(i: number): void {
    const now = record.value;
    if (!now || props.readOnly || underway.value) return;
    writeTrade(now, { status: statusWithTrade(now, { passengers: disembarked(passengers.value, i) }) });
    passSaid.value = disembarkWords(1, world.value ? world.value.name : '');
}
function disembarkAll(): void {
    const now = record.value;
    const count = boardedCount.value;
    if (!now || props.readOnly || underway.value || !count) return;
    writeTrade(now, { status: statusWithTrade(now, { passengers: disembarked(passengers.value) }) });
    passSaid.value = disembarkWords(count, world.value ? world.value.name : '');
}

/** A ledger line removed (DT3c): the line goes, and the passenger it boarded, if any, is unboarded, one commit. */
function dropLine(line: LedgerLine): void {
    const now = record.value;
    if (!now || props.readOnly) return;
    writeTrade(now, { status: statusWithTrade(now, { ledger: ledger.value.filter((one) => one !== line), passengers: unboarded(passengers.value, line, passengerName) }) });
}

/** Board: the fare on the lot and the ledger line, one commit. */
function boardNow(): void {
    const now = record.value;
    const i = boarding.value;
    if (!now || i === null || props.readOnly) return;
    const lot = passengers.value[i];
    const parsecs = Number(board.parsecs);
    const found = lot && parsecs ? fareFor(lot.class, parsecs) : null;
    if (!lot || !found) { boardError.value = 'Choose a passage the fares table names, and the jump.'; return; }
    const line = fareLine(passengerName(lot), lot.class, parsecs, found.credits, today.value);
    writeTrade(now, { status: statusWithTrade(now, { passengers: boarded(passengers.value, i, lot.class, found.credits), ledger: postLedger(ledger.value, line) }) });
    boarding.value = null;
}

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
    return found && !found.deleted ? found.name : 'A missing record';
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
/** The referee has typed the due day or year of a new payment: Every no longer fills them (DU42). */
const payDayTyped = ref(false);
watch(() => pay.every, (text) => {
    if (payDayTyped.value || payment.value) return;
    const every = number(text);
    const due = every === null ? null : dueFrom(today.value, every);
    if (!due) return;
    pay.day = String(due.day);
    pay.year = String(due.year);
});

/** Set a payment, or change it. A new one's amount starts from the Mortgage Cost box; no period is assumed. */
function openPay(): void {
    const now = payment.value;
    const amount = typedPaymentAmount(now, record.value ? fieldsOf(record.value.sheet) : null);
    pay.amount = amount !== null ? String(amount) : '';
    pay.every = now ? String(now.everyDays) : '';
    pay.day = String(now ? now.nextDueDay.day : today.value.day);
    pay.year = String(now ? now.nextDueDay.year : today.value.year);
    pay.payee = now && now.payee ? now.payee : '';
    payDayTyped.value = false;
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
        <span class="vt-gauge-words"><b>{{ tons(used) }}</b><template v-if="capacity !== null"> of {{ tons(capacity) }}</template><template v-else> aboard. To see how full the hold is, write Cargo Capacity on the ship sheet.</template></span>
        <span v-if="capacity !== null" class="vt-gauge-bar" role="meter" :aria-valuenow="used" aria-valuemin="0" :aria-valuemax="capacity" :aria-label="'Cargo: ' + tons(used) + ' of ' + tons(capacity)"><i :style="{ width: gauge * 100 + '%' }"></i></span>
        <span v-if="over" class="vt-over" role="status">The hold is over capacity by {{ tons(used - capacity!) }}.</span>
      </div>
      <ol v-if="cargo.length" class="vt-rows">
        <li v-for="(item, i) in cargo" :key="i" class="vt-row">
          <span class="vt-main"><b>{{ item.label || 'Unnamed lot' }}</b> <span class="vt-num">{{ tons(item.tons) }}</span></span>
          <span v-if="lotMeta(item)" class="vt-meta" data-lot-meta>{{ lotMeta(item) }}</span>
          <button v-if="isFreight(item) && delivering !== i && !underway" type="button" class="ui-btn" :disabled="readOnly" data-deliver @click="openDeliver(i)">Deliver</button>
          <span v-else-if="isFreight(item) && underway" class="vt-fine" data-deliver-wait>Deliver when the ship arrives.</span>
          <button type="button" class="ui-btn vt-drop" :disabled="readOnly" :aria-label="'Remove ' + (item.label || 'this lot')" title="Remove this lot" @click="dropLot(i)"><Icon name="xmark" :size="11" /></button>
          <form v-if="delivering === i" class="vt-form is-inline vt-deliver" data-deliver-form @submit.prevent="deliverNow">
            <div class="vt-choice" role="radiogroup" aria-label="Delivered on time or late" data-deliver-choice>
              <label class="vt-check"><input v-model="deliver.choice" type="radio" name="deliver-choice" value="ontime" data-deliver-ontime /> Delivered on time</label>
              <label class="vt-check"><input v-model="deliver.choice" type="radio" name="deliver-choice" value="late" data-deliver-late /> Delivered late: the file's cut, 1D+4 × 10%, comes off the pay (rolled on post)</label>
            </div>
            <p class="vt-fine" data-deliver-words>Posts {{ credits(item.payCr ?? 0) }} to the ledger as income, dated {{ dayWords(today) }}; the lot leaves the hold.</p>
            <p v-if="deliverError" class="vt-err" role="alert">{{ deliverError }}</p>
            <div class="vt-acts">
              <button type="button" class="ui-btn" @click="delivering = null">Cancel</button>
              <button type="submit" class="ui-btn is-primary" :disabled="readOnly" data-deliver-post>Deliver, post the pay</button>
            </div>
          </form>
        </li>
      </ol>
      <p v-else-if="!lotOpen" class="vt-none">Nothing in the hold. The ship sheet's Cargo rows are this list too.</p>
      <form v-if="lotOpen" class="vt-form" data-lot-form @submit.prevent="addLot">
        <label class="vt-fld vt-wide"><span>Lot</span><input v-model="lot.label" class="vt-box" maxlength="120" placeholder="Machine parts" /></label>
        <label class="vt-fld"><span>Tons</span><input v-model="lot.tons" class="vt-box vt-num" inputmode="decimal" /></label>
        <label class="vt-fld"><span>Paid (Cr)</span><input v-model="lot.paid" class="vt-box vt-num" inputmode="decimal" /></label>
        <label class="vt-fld vt-wide"><span>Where</span><input v-model="lot.where" class="vt-box" maxlength="120" /></label>
        <label v-if="lot.paid.trim()" class="vt-check"><input v-model="lot.post" type="checkbox" /> Post the payment to the Ledger, dated {{ dayWords(today) }}</label>
        <p v-if="lotError" class="vt-err" role="alert">{{ lotError }}</p>
        <div class="vt-acts">
          <button type="button" class="ui-btn" @click="lotOpen = false">Cancel</button>
          <button type="submit" class="ui-btn is-primary" :disabled="readOnly">Add the lot</button>
        </div>
      </form>
    </section>

    <ShipLocker :id="id" :read-only="readOnly" who="referee" />

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
        <p class="vt-fine">An expense or a recurring cost comes off the balance. Income goes on.</p>
        <p v-if="lineError" class="vt-err" role="alert">{{ lineError }}</p>
        <div class="vt-acts">
          <button type="button" class="ui-btn" @click="lineOpen = false">Cancel</button>
          <button type="submit" class="ui-btn is-primary" :disabled="readOnly">Post the line</button>
        </div>
      </form>
      <div v-if="periods.length" class="vt-days">
        <section v-for="period in periodsCut" :key="period.year + '-' + period.day" class="vt-day-group">
          <h4 class="vt-day-head"><span class="ui-date">{{ dayWords({ year: period.year, day: period.day }) }}</span> <span class="vt-num" :class="{ 'is-minus': period.balance < 0 }">{{ credits(period.balance) }}</span></h4>
          <ul class="vt-rows">
            <li v-for="(item, i) in period.lines" :key="i" class="vt-row is-line" data-ledger-line>
              <span class="vt-main">{{ item.memo }} <small class="vt-kind">{{ KIND_WORDS[item.kind] }}</small></span>
              <span class="vt-num vt-amount" :class="{ 'is-minus': item.amount < 0 }">{{ credits(item.amount) }}</span>
              <button type="button" class="ui-btn vt-drop" :disabled="readOnly" aria-label="Remove this line" title="Remove this line" data-drop-line @click="dropLine(item)"><Icon name="xmark" :size="11" /></button>
            </li>
          </ul>
        </section>
        <button v-if="linesShown.more" type="button" class="vt-more" data-ledger-more @click="allLines = true">Show all {{ ledger.length }} lines</button>
      </div>
      <p v-else-if="!lineOpen" class="vt-none">No lines yet. Post what the ship takes in and pays out; the balance is their sum. The ship's starting funds go in as an Income line.</p>
    </section>

    <section class="vt-sec ui-frame" data-vessel-passengers aria-labelledby="vt-pass-h">
      <div class="vt-head">
        <h3 id="vt-pass-h" class="ui-frame-label">Passengers <span v-if="passengers.length" class="ui-frame-count">{{ passengers.length }}</span></h3>
        <button v-if="!rolled && boardedCount && !underway" type="button" class="ui-btn" :disabled="readOnly" data-disembark-all @click="disembarkAll">Disembark all</button>
        <button v-if="!rolled" type="button" class="ui-btn" :disabled="readOnly" data-roll-passenger @click="rollOne">Roll a passenger</button>
      </div>
      <p v-if="passSaid" class="vt-said" role="status" data-disembark-said>{{ passSaid }}</p>
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
        <li v-for="(item, i) in passengers.slice(0, passengersShown.shown)" :key="i" class="vt-row is-line vt-pass" :class="{ 'is-boarded': isBoarded(item) }" data-passenger-row>
          <span class="vt-main">
            <button v-if="item.personId && campaign.records[item.personId] && !campaign.records[item.personId].deleted" type="button" class="vt-link" @click="openRecord(item.personId)">{{ campaign.records[item.personId].name }}</button>
            <b v-else>{{ item.label || 'Unnamed passenger' }}</b>
          </span>
          <select class="vt-box vt-class" :value="item.class" :disabled="readOnly" :aria-label="'Passage for ' + (passengerName(item) || 'this passenger')" data-passage @change="setClass(i, $event)">
            <option value="">Passage</option>
            <option v-for="one in classes" :key="one.key" :value="one.name">{{ one.name }}</option>
            <option v-if="strayClass(item)" :value="strayClass(item)">{{ strayClass(item) }}</option>
          </select>
          <span v-if="isBoarded(item)" class="vt-fare" data-fare>Boarded, {{ credits(item.fareCr ?? 0) }}</span>
          <button v-if="isBoarded(item) && !underway" type="button" class="ui-btn" :disabled="readOnly" data-disembark @click="disembarkOne(i)">Disembark</button>
          <button v-else-if="boarding !== i" type="button" class="ui-btn" :disabled="readOnly" data-board @click="openBoard(i)">Board</button>
          <form v-if="boarding === i" class="vt-form is-inline vt-board" data-board-form @submit.prevent="boardNow">
            <p v-if="nextLegWords" class="vt-fine vt-leg" data-board-leg>{{ nextLegWords }}</p>
            <label class="vt-fld vt-jump"><span>Jump</span>
              <select v-model="board.parsecs" class="vt-box" data-board-jump>
                <option value="">Choose</option>
                <option v-for="n in jumps" :key="n" :value="String(n)">{{ n }} {{ n === 1 ? 'parsec' : 'parsecs' }}</option>
              </select>
            </label>
            <p class="vt-fine" data-board-fare>{{ boardWords }}</p>
            <p v-if="boardError" class="vt-err" role="alert">{{ boardError }}</p>
            <div class="vt-acts">
              <button type="button" class="ui-btn" @click="boarding = null">Cancel</button>
              <button type="submit" class="ui-btn is-primary" :disabled="readOnly || !boardFare" data-board-post>Board, post the fare</button>
            </div>
          </form>
        </li>
      </ul>
      <button v-if="passengersShown.more" type="button" class="vt-more" data-passengers-more @click="allPassengers = true">Show all {{ passengers.length }} passengers</button>
      <p v-if="!passengers.length && !rolled" class="vt-none">No passengers. The ship sheet's Passenger rows are this list too.</p>
    </section>

    <CrewList :id="id" :read-only="readOnly" />

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
          <p class="vt-fine" data-payment-mortgage>{{ PAYMENT_IS_MORTGAGE }}</p>
          <div class="vt-acts">
            <button type="button" class="ui-btn is-primary" data-pay-now :disabled="readOnly" @click="payToday">Pay now: {{ credits(-payment.amountCr) }}</button>
          </div>
        </template>
        <p v-else-if="!payOpen" class="vt-none" data-payment-none>{{ SET_MORTGAGE_HERE }} Say what the ship pays, how often, and when it is next due.</p>
        <form v-if="payOpen" class="vt-form is-inline" data-payment-form @submit.prevent="savePay">
          <p class="vt-fine" data-payment-mortgage>{{ PAYMENT_IS_MORTGAGE }}</p>
          <label class="vt-fld"><span>Amount (Cr)</span><input v-model="pay.amount" class="vt-box vt-num" inputmode="decimal" required /></label>
          <label class="vt-fld"><span>Every (days)</span><input v-model="pay.every" class="vt-box vt-num" inputmode="numeric" required /></label>
          <label class="vt-fld"><span>Next due, day</span><input v-model="pay.day" class="vt-box vt-num" inputmode="numeric" required data-pay-day @input="payDayTyped = true" /></label>
          <label class="vt-fld"><span>Year</span><input v-model="pay.year" class="vt-box vt-num" inputmode="numeric" required data-pay-year @input="payDayTyped = true" /></label>
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
        <p v-else class="vt-none">Write the ship's recurring costs on the ship sheet ({{ MONTHLY_COST_FIELDS.join(', ') }}) to see its upkeep.</p>
      </div>
    </section>

    <section class="vt-sec ui-frame" data-vessel-costs aria-labelledby="vt-costs-h">
      <div class="vt-head">
        <h3 id="vt-costs-h" class="ui-frame-label">Fuel and costs</h3>
      </div>
      <div class="vt-part" data-fuel>
        <h4 class="vt-part-head">Fuel</h4>
        <p v-if="fuelCapacity === null" class="vt-none">To compare the fuel aboard with that capacity, write Fuel Capacity on the ship sheet.</p>
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
        <p v-if="!world" class="vt-none">To refuel, put the ship at a world. If the ship is under way, or the map has not read that hex, there is nowhere to buy fuel.</p>
        <p v-else-if="fuelCapacity === null" class="vt-none">At {{ world.name }}, starport {{ world.port }}. To refuel, write Fuel Capacity on the ship sheet.</p>
        <template v-else>
          <p class="vt-at">At {{ world.name }}, starport <b>{{ world.port }}</b>.</p>
          <p v-if="!offers.length" class="vt-none" data-no-fuel>No fuel is sold here. Starport {{ world.port }} sells none<template v-if="mark">, and there is no {{ baseWords.toLowerCase() }}</template>.</p>
          <div v-else class="vt-form is-inline">
            <label class="vt-fld"><span>Fuel</span>
              <select v-model="fuel.pick" class="vt-box" data-fuel-offer>
                <option v-for="item in offers" :key="offerKey(item)" :value="offerKey(item)">{{ offerWords(item) }}</option>
              </select>
            </label>
            <label v-if="offer && offer.crPerTon === null" class="vt-fld"><span>Price (Cr per ton)</span><input v-model="fuel.price" class="vt-box vt-num" inputmode="decimal" data-fuel-price /></label>
            <p class="vt-fine" role="status">{{ fuelTons <= 0 ? 'The tanks are full. There is nothing to take on.' : fuelCost === null ? 'Type the price per ton to see what filling the tanks costs.' : 'Filling the tanks takes on ' + tons(fuelTons) + ' for ' + credits(fuelCost) + '.' }}</p>
            <div class="vt-acts">
              <button type="button" class="ui-btn is-primary" data-post-refuel :disabled="readOnly || fuelTons <= 0 || fuelCost === null" @click="postRefuel">Post the refuel</button>
            </div>
          </div>
        </template>
        <p v-if="fuelSaid" class="vt-said" role="status">{{ fuelSaid }}</p>
      </div>
      <div class="vt-part" data-month>
        <h4 class="vt-part-head">This month's upkeep</h4>
        <template v-if="month.length || mortgageLeftOut">
          <p class="vt-fine" data-month-last>{{ monthLast }}</p>
          <ul class="vt-rows">
            <li v-if="mortgageLeftOut" class="vt-row is-line" data-month-left-out>
              <span class="vt-main vt-fine">{{ leftOutWords(mortgageLeftOut) }}</span>
            </li>
            <li v-for="item in month" :key="item.memo" class="vt-row is-line">
              <span class="vt-main">{{ item.memo }}</span>
              <span class="vt-num vt-amount is-minus">{{ credits(item.amount) }}</span>
            </li>
          </ul>
          <div class="vt-acts">
            <button type="button" class="ui-btn is-primary" data-post-month :disabled="readOnly || !month.length" @click="postMonth">Post this month's upkeep: {{ credits(monthTotal) }}, dated {{ dayWords(today) }}</button>
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
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

/* On a phone the head's button drops under the label when the two do not fit, and stays at the right (DT3). */
.vt-head > .ui-btn {
  margin-left: auto;
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

/* Delivered on time or late (DU48): two radio choices, one under the other. */
.vt-choice {
  display: flex;
  flex: 1 1 100%;
  flex-direction: column;
  gap: 4px;
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

/* The fold on a long list (DU38), in the track's look, as the freight list's. */
.vt-more {
  margin: 6px 0 0;
  padding: 2px 0;
  border: 0;
  background: transparent;
  color: var(--signal);
  font: 500 12.5px/1.4 var(--font-text);
  cursor: pointer;
}

.vt-more:hover {
  color: var(--signal-bright);
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

/* A passenger row (DT3): the name, the Passage as a small select, then the fare or Board; the form below. */
.vt-class {
  flex: 0 0 auto;
  width: auto;
  min-height: 30px;
  padding: 4px 8px;
  font-size: 13px;
}

.vt-fare {
  color: var(--text-muted);
  font-size: 12.5px;
  white-space: nowrap;
}

.vt-pass.is-boarded .vt-fare {
  color: var(--signal);
}

.vt-board {
  flex: 1 1 100%;
  order: 4;
}

.vt-fld.vt-jump {
  flex: 0 1 140px;
}

/* Deliver (DT6b): the form takes the cargo row's full width under the lot. */
.vt-deliver {
  flex: 1 1 100%;
  order: 4;
}

/* The next leg's words (DT3d) sit above the jump, the form's first line. */
.vt-board .vt-leg {
  order: -1;
  color: var(--text);
}

/* A ledger line (DT3c): the memo gives way so the amount and its remove keep the line's row on a phone. */
.vt-days .vt-row .vt-main {
  flex: 1 1 80px;
}

@media (max-width: 640px) {
  .vt .ui-btn,
  .vt-box {
    min-height: 44px;
  }

  .vt-drop {
    min-width: 44px;
  }

  .vt-link {
    display: inline-flex;
    align-items: center;
    box-sizing: border-box;
    min-height: 44px;
  }
}
</style>
