<script setup lang="ts">
/**
 * The party ship's Cargo, Passengers, Fuel and Ledger as a player reads them (Lane D's DP2; Johnny's yes
 * to question 129): each as the referee's section on VesselTrade.vue reads, less every control and
 * referee-only mark (no Add, Deliver, Board, Disembark, Refuel, base fuel, Post this month's upkeep,
 * Remove). Read from the store, which for a player holds the projection (`playersView`) and nothing
 * else. The Ledger and the Passengers list fold after ten as the referee's do (DU38); Show all unfolds.
 *
 * DS4b: a member whose character crews this ship with a Trade or Ledger switch on acts here. The page
 * then shows the referee's own sections and Find passengers and freight as that character
 * (`who="player"`: each press one piece through the append door), under the one sentence of the
 * timeline rule. Without a switch, or with no character, it reads as before. A member with several
 * characters picks who presses; the first is the default.
 */
import { computed, onMounted, ref, watch } from 'vue';
import { capacityTons, tonsUsed } from '../../campaign/cargo.ts';
import { ledgerBalance, ledgerByPeriod } from '../../campaign/ledger.ts';
import { formatCredits } from '../../campaign/money.ts';
import { fuelCapacityTons, fuelTonsOf } from '../../campaign/refuel.ts';
import { campaign } from '../../campaign/store.ts';
import { isBoarded } from '../passenger_fare.ts';
import { fieldsOf } from '../sheet_fields.ts';
import { periodsShown, shownRows } from '../traffic_here.ts';
import { crewOf, may } from '../crew.ts';
import ShipLocker from '../ShipLocker.vue';
import TrafficHere from '../TrafficHere.vue';
import VesselTrade from '../VesselTrade.vue';
import { PLAYERS_TRADE } from '../trade_write.ts';
import { actingPerson, loadMe, me, pickPerson, playsNone } from './me.ts';
import { PLAYER_NO_CHARACTER } from './players_words.ts';
import { dayWords, ledgerOf, lotMeta, manifestOf } from '../vessel_trade.ts';
import { fuelWords, holdWords, LEDGER_KIND_WORDS, tonsWords } from './player_ship.ts';

const props = defineProps<{ id: string }>();
const emit = defineEmits<{ open: [id: string] }>();

const record = computed(() => {
    void campaign.seq;
    const found = campaign.records[props.id];
    return found && !found.deleted && found.type === 'vessel' ? found : null;
});
const cargo = computed(() => (record.value ? manifestOf(record.value).cargo : []));
const passengers = computed(() => (record.value ? manifestOf(record.value).passengers : []));
/** The crew (DS2): the rows the projection kept, names and roles. */
const crew = computed(() => crewOf(record.value));
const ledger = computed(() => (record.value ? ledgerOf(record.value) : []));
const capacity = computed(() => (record.value ? capacityTons(fieldsOf(record.value.sheet)) : null));
const used = computed(() => tonsUsed(cargo.value));
const gauge = computed(() => (capacity.value ? Math.min(1, used.value / capacity.value) : 0));
const over = computed(() => capacity.value !== null && used.value > capacity.value);
const fuelCapacity = computed(() => (record.value ? fuelCapacityTons(fieldsOf(record.value.sheet)) : null));
const aboard = computed(() => (record.value ? fuelTonsOf(record.value.status) : null));
const fuelGauge = computed(() => (fuelCapacity.value && aboard.value !== null ? Math.min(1, aboard.value / fuelCapacity.value) : 0));
const balance = computed(() => ledgerBalance(ledger.value));
/** Newest day first, as the referee's Ledger reads. */
const periods = computed(() => ledgerByPeriod(ledger.value).reverse());
const allLines = ref(false);
const linesShown = computed(() => shownRows(ledger.value.length, allLines.value));
const periodsCut = computed(() => periodsShown(periods.value, linesShown.value.shown));
const allPassengers = ref(false);
const passengersShown = computed(() => shownRows(passengers.value.length, allPassengers.value));

const credits = (n: number): string => formatCredits(n);

// ---- DS4b: who presses, and what their switches open ----------------------------------------------------

onMounted(() => { void loadMe(campaign.universeId ?? ''); });
watch(() => campaign.universeId, (id) => { if (id) void loadMe(id); });

/** The member's characters, by name, for the picker. */
const mine = computed(() => me.personIds.map((id) => ({ id, name: personOf(id)?.name ?? 'A character' })));
const acting = computed(() => actingPerson());
const canTrade = computed(() => !!acting.value && may(record.value, acting.value, 'trade'));
const canLedger = computed(() => !!acting.value && may(record.value, acting.value, 'ledger'));
/** The page acts: the character pressing crews this ship with a Trade or Ledger switch on. */
const acts = computed(() => canTrade.value || canLedger.value);
/** BM2c (Johnny 141): the member plays no character here, as the server said; the page has no ship actions and says so. */
const none = computed(() => playsNone(campaign.universeId));

function pick(event: Event): void {
    pickPerson((event.target as HTMLSelectElement).value);
}

/** The passenger's record when the projection kept it (a players person), to open; else the label alone. */
function personOf(id: string | undefined): { id: string; name: string } | null {
    if (!id) return null;
    const found = campaign.records[id];
    return found && !found.deleted ? { id: found.id, name: found.name } : null;
}
</script>

<template>
  <div v-if="record" class="pship" data-player-ship :data-player-acts="acts ? 'yes' : 'no'">
    <label v-if="mine.length > 1" class="pship-who" data-acting-as>
      <span>Acting as</span>
      <select class="pship-who-box" :value="acting" @change="pick">
        <option v-for="one in mine" :key="one.id" :value="one.id">{{ one.name }}</option>
      </select>
    </label>

    <p v-if="none" class="pship-rule" role="note" data-player-none>{{ PLAYER_NO_CHARACTER }}</p>

    <template v-if="acts">
      <p class="pship-rule" role="note" data-players-trade>{{ PLAYERS_TRADE }}</p>
      <VesselTrade :id="id" :read-only="false" who="player" />
      <TrafficHere v-if="canTrade" :id="id" :read-only="false" who="player" />
    </template>

    <template v-else>
    <section class="pship-sec ui-frame" data-player-cargo aria-labelledby="pship-cargo-h">
      <h3 id="pship-cargo-h" class="ui-frame-label">Cargo <span v-if="cargo.length" class="ui-frame-count">{{ cargo.length }}</span></h3>
      <div class="pship-gauge" :class="{ 'is-over': over }">
        <span class="pship-gauge-words" data-hold-words>{{ holdWords(used, capacity) }}</span>
        <span v-if="capacity !== null" class="pship-gauge-bar" role="meter" :aria-valuenow="used" aria-valuemin="0" :aria-valuemax="capacity" :aria-label="'Cargo: ' + tonsWords(used) + ' of ' + tonsWords(capacity)"><i :style="{ width: gauge * 100 + '%' }"></i></span>
        <span v-if="over" class="pship-over" role="status">The hold is over capacity by {{ tonsWords(used - capacity!) }}.</span>
      </div>
      <ol v-if="cargo.length" class="pship-rows">
        <li v-for="(item, i) in cargo" :key="i" class="pship-row" data-cargo-row>
          <span class="pship-main"><b>{{ item.label || 'Unnamed lot' }}</b> <span class="pship-num">{{ tonsWords(item.tons) }}</span></span>
          <span v-if="lotMeta(item)" class="pship-meta" data-lot-meta>{{ lotMeta(item) }}</span>
        </li>
      </ol>
      <p v-else class="pship-none">The hold is empty.</p>
    </section>

    <ShipLocker :id="id" :read-only="false" who="player" />

    <section class="pship-sec ui-frame" data-player-passengers aria-labelledby="pship-pass-h">
      <h3 id="pship-pass-h" class="ui-frame-label">Passengers <span v-if="passengers.length" class="ui-frame-count">{{ passengers.length }}</span></h3>
      <ul v-if="passengers.length" class="pship-rows">
        <li v-for="(item, i) in passengers.slice(0, passengersShown.shown)" :key="i" class="pship-row" :class="{ 'is-boarded': isBoarded(item) }" data-passenger-row>
          <span class="pship-main">
            <button v-if="personOf(item.personId)" type="button" class="pship-link" @click="emit('open', personOf(item.personId)!.id)">{{ personOf(item.personId)!.name }}</button>
            <b v-else>{{ item.label || 'Unnamed passenger' }}</b>
          </span>
          <span v-if="item.class" class="pship-class">{{ item.class }}</span>
          <span v-if="isBoarded(item)" class="pship-fare" data-fare>Boarded, {{ credits(item.fareCr ?? 0) }}</span>
        </li>
      </ul>
      <p v-else class="pship-none">No passengers.</p>
      <button v-if="passengersShown.more" type="button" class="pship-more" data-passengers-more @click="allPassengers = true">Show all {{ passengers.length }} passengers</button>
    </section>


    <section class="pship-sec ui-frame" data-player-fuel aria-labelledby="pship-fuel-h">
      <h3 id="pship-fuel-h" class="ui-frame-label">Fuel</h3>
      <div class="pship-gauge">
        <span class="pship-gauge-words" data-fuel-words>{{ fuelWords(aboard, fuelCapacity) }}</span>
        <span v-if="fuelCapacity !== null && aboard !== null" class="pship-gauge-bar" role="meter" :aria-valuenow="aboard" aria-valuemin="0" :aria-valuemax="fuelCapacity" :aria-label="'Fuel: ' + tonsWords(aboard) + ' of ' + tonsWords(fuelCapacity)"><i :style="{ width: fuelGauge * 100 + '%' }"></i></span>
      </div>
    </section>

    <section class="pship-sec ui-frame" data-player-ledger aria-labelledby="pship-ledger-h">
      <h3 id="pship-ledger-h" class="ui-frame-label">Ledger <span class="ui-frame-count" :class="{ 'is-minus': balance < 0 }">{{ credits(balance) }}</span></h3>
      <div v-if="ledger.length" class="pship-days">
        <section v-for="period in periodsCut" :key="period.year + '-' + period.day" class="pship-day-group">
          <h4 class="pship-day-head"><span class="ui-date">{{ dayWords({ year: period.year, day: period.day }) }}</span> <span class="pship-num" :class="{ 'is-minus': period.balance < 0 }">{{ credits(period.balance) }}</span></h4>
          <ul class="pship-rows">
            <li v-for="(item, i) in period.lines" :key="i" class="pship-row" data-ledger-line>
              <span class="pship-main">{{ item.memo }} <small class="pship-kind">{{ LEDGER_KIND_WORDS[item.kind] }}</small></span>
              <span class="pship-num pship-amount" :class="{ 'is-minus': item.amount < 0 }">{{ credits(item.amount) }}</span>
            </li>
          </ul>
        </section>
        <button v-if="linesShown.more" type="button" class="pship-more" data-ledger-more @click="allLines = true">Show all {{ ledger.length }} lines</button>
      </div>
      <p v-else class="pship-none">Nothing on the ledger yet.</p>
    </section>
    </template>

    <section v-if="crew.length" class="pship-sec ui-frame" data-player-crew aria-labelledby="pship-crew-h">
      <h3 id="pship-crew-h" class="ui-frame-label">Crew <span class="ui-frame-count">{{ crew.length }}</span></h3>
      <ul class="pship-rows">
        <li v-for="row in crew" :key="row.personId" class="pship-row" data-crew-row>
          <span class="pship-main">
            <button v-if="personOf(row.personId)" type="button" class="pship-link" @click="emit('open', personOf(row.personId)!.id)">{{ personOf(row.personId)!.name }}</button>
            <b v-else>Someone aboard</b>
          </span>
          <span class="pship-class">{{ row.role || 'Crew' }}</span>
        </li>
      </ul>
    </section>
  </div>
</template>

<style>
.pship {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-top: 16px;
}

.pship-num {
  font-variant-numeric: var(--tabular);
}

.pship .is-minus {
  color: var(--attention);
}

.pship-gauge {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 12px;
  color: var(--text-1);
}

.pship-gauge-words {
  font-weight: 600;
}

.pship-gauge-bar {
  flex: 1 1 160px;
  height: 6px;
  overflow: hidden;
  border: 1px solid var(--line-2);
  border-radius: var(--r-pill);
  background: var(--bg-2);
}

.pship-gauge-bar i {
  display: block;
  height: 100%;
  background: var(--signal);
}

.pship-gauge.is-over .pship-gauge-bar i {
  background: var(--attention);
}

.pship-over {
  color: var(--attention);
}

.pship-rows {
  margin: 10px 0 0;
  padding: 0;
  list-style: none;
}

.pship-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px 12px;
  padding: 6px 0;
  border-bottom: 1px solid var(--line-soft);
}

.pship-main {
  flex: 1 1 auto;
  min-width: 0;
  color: var(--text-0);
}

.pship-meta {
  flex: 1 1 100%;
  order: 3;
  color: var(--text-muted);
  font-size: 12.5px;
}

.pship-meta:empty {
  display: none;
}

.pship-kind {
  margin-left: 6px;
  color: var(--text-muted);
}

.pship-amount {
  color: var(--text-0);
}

.pship-class {
  color: var(--text-1);
  font-size: 12.5px;
}

.pship-fare {
  color: var(--text-muted);
  font-size: 12.5px;
}

.pship-row.is-boarded .pship-fare {
  color: var(--text-1);
}

.pship-link {
  padding: 0;
  border: 0;
  background: none;
  color: var(--text-0);
  font: inherit;
  font-weight: 700;
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
}

.pship-link:hover {
  color: var(--signal);
}

.pship-days {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.pship-day-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin: 4px 0 2px;
  color: var(--text-1);
  font: 600 13px/1.4 var(--font-text);
}

.pship-days .pship-rows {
  margin-top: 0;
}

.pship-none {
  margin: 0;
  color: var(--text-muted);
}

/* DS4b: which character presses, and the timeline rule's one sentence. */
.pship-who {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-muted);
  font: 500 12px/1.3 var(--font-text);
}

.pship-who-box {
  min-width: 0;
  height: 30px;
  padding: 0 8px;
  border: 1px solid var(--control-line);
  border-radius: var(--r-2);
  background: var(--bg-2);
  color: var(--text-0);
  font: 400 13px/1.2 var(--font-text);
}

/* DF41: below 600 px Acting as meets 44 px, as the other controls on a phone. */
@media (max-width: 599px) {
  .pship-who-box {
    height: 44px;
  }
}

.pship-rule {
  margin: 0;
  padding: 8px 10px;
  border-left: 3px solid var(--signal);
  background: var(--bg-2);
  color: var(--text-0);
  font: 400 13.5px/1.5 var(--font-text);
}

.pship-more {
  align-self: flex-start;
  margin-top: 8px;
  padding: 0;
  border: 0;
  background: none;
  color: var(--signal);
  font: 600 12.5px/1.4 var(--font-text);
  cursor: pointer;
}

.pship-more:hover {
  text-decoration: underline;
}
</style>
