<script setup lang="ts">
/**
 * A vessel's track on its record page (K12, the track as a record): the legs in order, each
 * from → to with its dates, mode and G; "Remove last leg", undone from its toast; and, with
 * no legs, one sentence and the way to the orbit view of the vessel's system, where a course
 * is plotted. Both controls are commands first (track_rows.ts TRACK_COMMANDS).
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { campaign } from '../campaign/store.ts';
import { trackOf } from '../campaign/track.ts';
import Icon from '../design/Icon.vue';
import { orbitPath } from '../orbit/bodies.ts';
import { withQuery } from '../shell/pane.ts';
import { registerCommand } from '../shell/registry.ts';
import { liveById, parseHexKey, resolvePlace } from './places.ts';
import { removeLastTrackLeg } from './track_actions.ts';
import { TRACK_COMMANDS, anchorName, shownRows, trackRows } from './track_rows.ts';
import AdvanceClock from './AdvanceClock.vue';
import { daysTo } from './advance_clock.ts';
import { campaignDays, vesselWhere } from './party_where.ts';
import { appendLeg } from '../campaign/track.ts';
import { rollJumpHours } from '../campaign/travel.ts';
import { tonsWords, type JumpRoll } from '../orbit/estimates.ts';
import type { Plan } from '../orbit/layout.ts';
import { earliestDeparture, vesselPosition } from '../orbit/ship_list.ts';
import { showToast } from '../shell/toast.ts';
import { NO_PICTURE, NO_TARGET, NO_THRUST, NOT_DOCKED, READING, jumpFromHere, jumpWords, jumpedWords, limitFlight, thrustOf, tradeTargetOf } from './jump_from_here.ts';
import { fieldsOf } from './sheet_fields.ts';
import { parsecsBetween } from '../map/geometry.ts';
import { postLedger } from '../campaign/ledger.ts';
import { fuelTonsOf } from '../campaign/refuel.ts';
import { marketsChart, sectorAtOf, startMarkets } from './markets_near.ts';
import { dayOf, ledgerOf, statusWithTrade, writeTrade } from './vessel_trade.ts';
import { NO_HULL, fuelTaken, fuelTakenLine, fuelTakenMemo, fuelTakenWords, hullTonsOf, jumpFuelOf, jumpFuelWords, latestJump } from './jump_fuel.ts';
import { loadPlan, planAsk } from './system_plan.ts';

const props = defineProps<{
    id: string;
    /** Changes cannot be made just now (offline). */
    readOnly: boolean;
}>();

const router = useRouter();
const route = useRoute();
const rootEl = ref<HTMLElement | null>(null);
/** The earlier legs are unfolded. */
const all = ref(false);

const record = computed(() => {
    const found = campaign.records[props.id];
    return found && !found.deleted && found.type === 'vessel' ? found : null;
});
const rows = computed(() => {
    const legs = record.value ? trackOf(record.value) : null;
    return legs ? trackRows(legs, campaign.records) : [];
});
const shown = computed(() => shownRows(rows.value, all.value));
/** The campaign date as the clock counts it; null without a clock. A leg that arrives after it offers Advance to the arrival (DU39). */
const now = computed(() => (campaign.clock ? campaignDays(campaign.clock) : null));
/** The vessel's system, where its course is plotted; null while it is nowhere. */
const system = computed(() => {
    const place = record.value ? resolvePlace(props.id, liveById(campaign.records)) : null;
    const where = place ? parseHexKey(place.hexKey) : null;
    return place && where ? { ...where, bodyKey: place.bodyKey } : null;
});

const canRemove = (): boolean => !props.readOnly && rows.value.length > 0;
const canOrbit = (): boolean => system.value !== null;

function removeLast(): void {
    if (!canRemove() || !removeLastTrackLeg(props.id)) return;
    // The control may have gone with the last leg: focus stays in the section.
    void nextTick(() => {
        const el = rootEl.value ? rootEl.value.querySelector<HTMLElement>('.trk-remove, .trk-orbit') : null;
        if (el) el.focus();
    });
}

function openOrbit(): void {
    const at = system.value;
    if (at) void router.push({ path: orbitPath(at.slug, at.hex, at.bodyKey), query: withQuery(route.query, {}) });
}

// ---- Jump to the destination from here (DT7) ---------------------------------------------------------------

/** The campaign date for the legs; a campaign with no clock is on the default start, as every screen reads it. */
const today = computed(() => campaignDays(campaign.clock));
/** Where the ship is at the date: docked at a body or a bare system (a world), or not (under way, holding at a point). */
const here = computed(() => {
    const now = record.value;
    if (!now) return null;
    void campaign.seq;
    const where = vesselWhere(now, campaign.records, today.value);
    if (where.underway || !where.anchor || where.anchor.kind !== 'system' || where.anchor.point) return null;
    return { hexKey: where.anchor.hexKey, bodyKey: where.anchor.bodyKey ?? null, anchor: where.anchor };
});
/** The vessel has a place at all (an anchor, or a track that puts it somewhere): with none, the block says nothing (DF35). */
const placed = computed(() => {
    const now = record.value;
    if (!now) return false;
    void campaign.seq;
    return vesselWhere(now, campaign.records, today.value).anchor !== null;
});
const target = computed(() => tradeTargetOf(props.id));
const thrust = computed(() => (record.value ? thrustOf(fieldsOf(record.value.sheet)) : null));
/** The earliest the legs may depart: the date, or the arrival of the leg under way when that is later. */
const departs = computed(() => (record.value ? earliestDeparture(vesselPosition(record.value, today.value), today.value) : today.value));
/** The jump's hours, the file's roll: rolled when a destination is chosen, again when it changes. */
const roll = ref<JumpRoll | null>(null);
watch(() => (target.value ? target.value.hexKey : null), (key) => { roll.value = key ? rollJumpHours() : null; }, { immediate: true });
/** The picture of the system the ship is docked in, read as the orbit view reads it. */
const plan = ref<Plan | null>(null);
const planState = ref<'idle' | 'reading' | 'ready' | 'none'>('idle');
let planTicket = 0;
watch(() => (here.value && target.value ? planAsk(here.value.hexKey) : null), (ask) => {
    const ticket = ++planTicket;
    if (!ask || ask.kind === 'wait') { plan.value = null; planState.value = ask ? 'reading' : 'idle'; return; }
    if (ask.kind !== 'private' && ask.kind !== 'public') { plan.value = null; planState.value = 'none'; return; }
    planState.value = 'reading';
    const at = here.value;
    if (!at) return;
    void loadPlan(at.hexKey, ask).then((found) => {
        if (ticket !== planTicket) return;
        plan.value = found;
        planState.value = found ? 'ready' : 'none';
    });
}, { immediate: true });
const limit = computed(() => (plan.value && here.value && thrust.value !== null ? limitFlight(plan.value, here.value.bodyKey, departs.value, thrust.value) : null));
const jumpPlan = computed(() => {
    const at = here.value;
    const to = target.value;
    const rolled = roll.value;
    if (!at || !to || !rolled || !limit.value || thrust.value === null) return null;
    return jumpFromHere(at.hexKey, at.anchor, limit.value, to, departs.value, thrust.value, rolled);
});
/** What the button will write, or why it cannot yet. */
const jumpSay = computed((): string => {
    if (jumpPlan.value) return jumpWords(jumpPlan.value);
    if (thrust.value === null) return NO_THRUST;
    if (planState.value === 'reading' || planState.value === 'idle') return READING;
    return NO_PICTURE;
});

// ---- The jump's fuel (DT8; Johnny 127 and 143): offered on the latest jump leg, taken only on the press ----
/** The hull from the sheet's Size box. */
const hull = computed(() => (record.value ? hullTonsOf(fieldsOf(record.value.sheet)) : null));
/** Fuel aboard (status.fuelTons): the gauge the Refuel section reads. Null until typed. */
const aboard = computed(() => (record.value ? fuelTonsOf(record.value.status) : null));
const lastJump = computed(() => {
    const legs = record.value ? trackOf(record.value) : null;
    return legs ? latestJump(legs) : null;
});
/** The jump's parsecs from the chart's grid; null until the grid is read, or when an end of the leg is not a system. */
const jumpLegParsecs = computed((): number | null => {
    const found = lastJump.value;
    const sectors = marketsChart.sectors;
    const from = found ? found.leg.from : null;
    const to = found ? found.leg.to : null;
    if (!sectors || !from || !to || from.kind !== 'system' || to.kind !== 'system') return null;
    return parsecsBetween(from.hexKey, to.hexKey, sectorAtOf(sectors));
});
const legFuel = computed(() => jumpFuelOf(hull.value, jumpLegParsecs.value));
const legDestination = computed(() => (lastJump.value ? anchorName(lastJump.value.leg.to, campaign.records) : ''));
const legDay = computed(() => (lastJump.value ? dayOf(lastJump.value.leg.departs) : null));
const legMemo = computed(() => (legFuel.value ? fuelTakenMemo(legDestination.value, legFuel.value) : ''));
/** The line already posted for this jump: the press is offered once. */
const taken = computed(() => (record.value && legDay.value && legMemo.value ? fuelTaken(ledgerOf(record.value), legDay.value, legMemo.value) : null));
/** Under the latest jump leg: the fuel and the button, the taken line, or why there is no figure yet. */
const jumpFuelRow = computed((): { n: number; words: string; can: boolean } | null => {
    const found = lastJump.value;
    if (!found) return null;
    if (taken.value) return { n: found.n, words: fuelTakenWords(taken.value), can: false };
    if (hull.value === null) return { n: found.n, words: NO_HULL, can: false };
    if (!legFuel.value) {
        const words = jumpLegParsecs.value === null && marketsChart.sectors ? 'The jump\'s parsecs are not known: an end of the leg is not a charted system.' : READING;
        return { n: found.n, words, can: false };
    }
    return { n: found.n, words: jumpFuelWords(legFuel.value, aboard.value), can: aboard.value !== null };
});
/** The fuel the jump about to be written will offer (DT7's block), so the referee sees it before the press. */
const planFuelSay = computed((): string => {
    const planned = jumpPlan.value;
    if (!planned) return '';
    if (hull.value === null) return NO_HULL;
    const fuel = jumpFuelOf(hull.value, planned.parsecs);
    return fuel ? jumpFuelWords(fuel, aboard.value) + '. The leg offers Take the fuel once it is written.' : '';
});
/** Posts the tons against Fuel aboard with the line the referee can remove. Nothing is taken without the press. */
function takeFuel(): void {
    const now = record.value;
    const fuel = legFuel.value;
    const when = legDay.value;
    if (!now || props.readOnly || !fuel || aboard.value === null || taken.value) return;
    if (!when) return;
    const line = fuelTakenLine(when, legDestination.value, fuel);
    const left = Math.max(0, aboard.value - fuel.tons);
    writeTrade(now, { status: statusWithTrade(now, { ledger: postLedger(ledgerOf(now), line), fuelTons: Math.max(0, aboard.value - fuel.tons) }) });
    showToast(line.memo + '. Fuel aboard is now ' + tonsWords(left) + ' t.');
}
onMounted(() => { void startMarkets(); });

/** Both legs, as the orbit view would write them: the flight, then the jump from its end. */
function jumpNow(): void {
    const now = record.value;
    const planned = jumpPlan.value;
    const to = target.value;
    if (!now || !planned || !to || props.readOnly) return;
    const first = appendLeg(props.id, planned.flight);
    if (!first.ok) { showToast(first.message); return; }
    const second = appendLeg(props.id, planned.jump);
    if (!second.ok) { showToast(second.message); return; }
    showToast(jumpedWords(planned, now.name, to.name));
}

const RUN: Record<(typeof TRACK_COMMANDS)[number]['id'], { run: () => void; runnable: () => boolean }> = {
    'track-remove-last': { run: removeLast, runnable: canRemove },
    'track-orbit': { run: openOrbit, runnable: canOrbit },
};
let unregister: Array<() => void> = [];

onMounted(() => {
    unregister = TRACK_COMMANDS.map((command) => registerCommand({ id: command.id, name: command.name, ...RUN[command.id] }));
});

onBeforeUnmount(() => {
    for (const off of unregister) off();
    unregister = [];
});

watch(() => props.id, () => { all.value = false; });
</script>

<template>
  <section v-if="record" ref="rootEl" class="trk ui-frame" :data-legs="rows.length">
    <div class="trk-head">
      <h3 class="ui-frame-label">Track <span v-if="rows.length" class="ui-frame-count">{{ rows.length }}</span></h3>
      <button
        v-if="rows.length"
        type="button"
        class="ui-btn trk-remove"
        data-command="track-remove-last"
        :disabled="readOnly"
        title="Remove the last leg of the track"
        @click="removeLast"
      >
        <Icon name="rotate-left" :size="12" />Remove last leg
      </button>
    </div>

    <div v-if="!rows.length" class="trk-none">
      <p>{{ system ? 'No legs yet: plot a course in the orbit view and it is logged here.' : 'No legs yet: put the vessel somewhere, then plot a course in the orbit view.' }}</p>
      <button type="button" class="ui-btn trk-orbit" data-command="track-orbit" :disabled="!system" @click="openOrbit">
        <Icon name="solar-system" :size="13" />Open the orbit view
      </button>
    </div>

    <template v-else>
      <button v-if="shown.earlier" type="button" class="trk-earlier" @click="all = true">
        Show {{ shown.earlier }} earlier {{ shown.earlier === 1 ? 'leg' : 'legs' }}
      </button>
      <ol class="trk-legs" :start="shown.rows[0].n">
        <li v-for="row in shown.rows" :key="row.n" class="trk-leg" :class="'is-' + row.mode">
          <span class="trk-n" aria-hidden="true">{{ row.n }}</span>
          <span class="trk-mode">{{ row.modeWords }}</span>
          <span class="trk-route">
            <template v-if="row.moves">{{ row.from }} <span class="trk-arrow" aria-label="to">→</span> <b>{{ row.to }}</b></template>
            <b v-else>{{ row.to }}</b>
          </span>
          <span class="trk-accel">{{ row.accel }}</span>
          <span class="trk-when">
            <span class="trk-sr">Departs </span>{{ row.departs }}<span class="trk-arrow" aria-hidden="true">→</span><span class="trk-sr"> arrives </span>{{ row.arrives }}
          </span>
          <span v-if="row.note" class="trk-note">{{ row.note }}</span>
          <AdvanceClock v-if="now !== null && row.arrivesDays > now" :days="daysTo(now, row.arrivesDays)" :label="'Days to the arrival of leg ' + row.n" class="trk-advance" />
          <span v-if="jumpFuelRow && row.n === jumpFuelRow.n" class="trk-fuel" data-jump-fuel :data-jump-fuel-taken="taken ? 'yes' : 'no'">
            <span class="trk-fuel-words">{{ jumpFuelRow.words }}</span>
            <button v-if="jumpFuelRow.can" type="button" class="ui-btn trk-take" data-take-fuel :disabled="readOnly" title="Post the tons against Fuel aboard, with a line on the Ledger" @click="takeFuel">Take the fuel</button>
          </span>
        </li>
      </ol>
    </template>

    <div v-if="placed" class="trk-jump" data-jump-here :data-jump-state="!here ? 'away' : !target ? 'no-target' : jumpPlan ? 'ready' : 'waiting'">
      <p v-if="!here" class="trk-fine" data-jump-note>{{ NOT_DOCKED }}</p>
      <p v-else-if="!target" class="trk-fine" data-jump-note>{{ NO_TARGET }}</p>
      <template v-else>
        <p class="trk-fine" data-jump-words>{{ jumpSay }}</p>
        <p v-if="planFuelSay" class="trk-fine" data-jump-fuel-plan>{{ planFuelSay }}</p>
        <button type="button" class="ui-btn is-primary" data-jump-go :disabled="readOnly || !jumpPlan" :title="jumpPlan ? 'Write both legs to the track' : jumpSay" @click="jumpNow">
          <Icon name="shuttle-space" :size="12" />Jump to {{ target.name }}
        </button>
      </template>
    </div>
  </section>
</template>

<style>
.trk-head {
  display: flex;
  align-items: center;
  gap: 10px;
}

/* The track sits in a frame (the version-video look), as the connections do. */
.trk-head {
  margin-bottom: 10px;
}

.trk-head .ui-frame-label {
  flex: 1 1 auto;
  gap: 8px;
  margin: 0;
}

.trk.ui-frame .trk-legs {
  border-color: var(--line-1);
  background: transparent;
}

.ui-btn.trk-remove {
  height: 28px;
  padding: 0 9px;
  font-size: 12.5px;
}

/* Jump to the destination from here (DT7): what the press writes, then the button. */
.trk-jump {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  margin-top: 10px;
}

.trk-jump .trk-fine {
  flex: 1 1 240px;
  margin: 0;
  color: var(--text-muted);
  font: 400 12.5px/1.45 var(--font-text);
}

.trk-jump[data-jump-state="ready"] .trk-fine {
  color: var(--text-1);
}

/* No legs: one sentence and the one way on. */
.trk-none {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
}

.trk-none p {
  flex: 1 1 220px;
  margin: 0;
  color: var(--text-muted);
  font: 400 14px/1.45 var(--font-text);
}

.trk-earlier {
  margin: 0 0 6px;
  padding: 2px 0;
  border: 0;
  background: transparent;
  color: var(--signal);
  font: 500 12.5px/1.4 var(--font-text);
  cursor: pointer;
}

.trk-earlier:hover {
  color: var(--signal-bright);
}

/* The log: a leg is two lines, the route and then its dates as an instrument reads them. */
.trk-legs {
  margin: 0;
  padding: 0;
  border: 1px solid var(--line-1);
  border-radius: var(--r-3);
  background: var(--panel-raised);
  list-style: none;
}

.trk-leg {
  display: grid;
  grid-template-columns: 22px 64px minmax(0, 1fr) auto;
  align-items: baseline;
  gap: 2px 8px;
  padding: 8px 12px 8px 8px;
  color: var(--text-1);
  font: 400 13px/1.4 var(--font-text);
}

.trk-leg + .trk-leg {
  border-top: 1px solid var(--line-soft);
}

.trk-n {
  color: var(--text-muted);
  font: 400 12px/1.4 var(--font-code);
  font-variant-numeric: var(--tabular);
  text-align: right;
}

/* The mode in the strip's colours: teal under way, amber in jump, quiet at rest. */
.trk-mode {
  color: var(--text-muted);
  font: 700 12px/1.4 var(--font-text);
  letter-spacing: 0.04em;
  text-transform: uppercase;
  white-space: nowrap;
}

.trk-leg.is-flight .trk-mode {
  color: var(--signal);
}

.trk-leg.is-jump .trk-mode {
  color: var(--attention);
}

.trk-route {
  min-width: 0;
  overflow-wrap: anywhere;
}

.trk-route b {
  color: var(--text-0);
  font-weight: 600;
}

.trk-arrow {
  color: var(--text-muted);
}

.trk-when .trk-arrow {
  margin: 0 0.6em;
}

.trk-accel {
  color: var(--text-1);
  font: 600 12px/1.4 var(--font-code);
  font-variant-numeric: var(--tabular);
  white-space: nowrap;
}

.trk-when,
.trk-note {
  grid-column: 3 / -1;
  color: var(--text-muted);
}

.trk-when {
  font: 400 12px/1.4 var(--font-code);
  font-variant-numeric: var(--tabular);
}

.trk-advance {
  grid-column: 1 / -1;
}

/* The jump's fuel (DT8): one full row under the leg's dates, the words then the button. */
.trk-fuel {
  grid-column: 1 / -1;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-2) var(--sp-3);
  margin-top: 4px;
  font: 400 12.5px/1.4 var(--font-text);
  color: var(--text-muted);
}

.ui-btn.trk-take {
  height: 28px;
  padding: 0 9px;
  font-size: 12.5px;
}

.trk-fuel[data-jump-fuel-taken="yes"] .trk-fuel-words {
  color: var(--text-1);
}

.trk-note {
  font: 400 12.5px/1.4 var(--font-text);
  font-style: italic;
}

.trk-sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
}
</style>
