<script setup lang="ts">
/**
 * Directions on the chart (streams/D.md DN1, DN2), for the referee and players alike: From and To, Jump 1 to 6,
 * the fuel choice and the ship's kit, then the route drawn and its legs listed (`directions.ts`, on A's
 * planner). Nothing is saved: closing the panel clears the route. MapView.vue mounts it and draws.
 *
 * DN2: each box suggests systems as it is typed (`directions_search.ts`); the first empty box offers
 * "Use <name>" for the system open in the system panel; the system panel's From here and To here arrive as an
 * ask (`directions_state.ts`). With both ends set the route is planned at once, and again on any change.
 * Below 600 px, while a system is open, the panel folds to its ends and total above the world sheet.
 *
 * The result is a list of stops: the start, then one row a jump with its parsecs, the fuel taken there and the
 * planner's notes. A stop's name opens that system. A new pair of ends asks the chart to show the whole route
 * (`fit`), and Show the route asks again. In a campaign with a party ship the jump starts at the ship's.
 */
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Icon from '../design/Icon.vue';
import type { RouteEnd } from './route_plan.ts';
import { blankForm, endWords, FUEL_CHOICES, JUMPS, sameEnd, type DirectionsIndex, type DirectionsLeg, type PinnedEnd } from './directions.ts';
import { bothSettled, FINDING_WORDS, planFetching, saidAfter, type GridSector } from './directions_fetch.ts';
import { directionsState, emptyBox, otherBox, type EndBox } from './directions_state.ts';
import { suggestEnds, type EndSuggestion } from './directions_search.ts';

const props = defineProps<{
    /** The loaded sectors, read on each plan. */
    indexes: () => DirectionsIndex[];
    /** The party ship's jump (1 to 6) in a campaign with a party ship; absent, the button is not offered. */
    partyJump?: number | null;
    /** The party ship's name, for the button. */
    partyShip?: string;
    /** DN1b: the chart's sectors, loaded or not, to read an end by sector and hex and to find the route's box. */
    grid?: () => GridSector[];
    /** DN1b: fetch one sector's index; resolves when it is in (or it does not come). */
    fetchIndex?: (slug: string) => Promise<unknown>;
}>();

const emit = defineEmits<{
    route: [stops: RouteEnd[] | null];
    /** Show the whole route on the chart. */
    fit: [];
    close: [];
}>();

const BOXES = ['from', 'to'] as const;

const route = useRoute();
const router = useRouter();
const form = reactive(blankForm());
// The party ship's jump is where the choice starts; the person may change it.
if (props.partyJump) form.jump = props.partyJump;
const pinned = reactive<{ from: PinnedEnd | null; to: PinnedEnd | null }>({ from: null, to: null });
const lines = ref<string[]>([]);
const origin = ref<{ end: RouteEnd; name: string } | null>(null);
const legs = ref<DirectionsLeg[]>([]);
const total = ref('');
/** The ends of the route last shown whole, so a change of jump or fuel leaves the camera alone. */
let fitted = '';
const said = ref('');
const boxes: Record<EndBox, HTMLInputElement | null> = { from: null, to: null };
/** On a phone with a system open, the full form shows only after a press. */
const expanded = ref(false);
/** The box whose suggestions show, and them; the wait before asking, and the ask in flight. */
const suggestFor = ref<EndBox | null>(null);
const suggestions = ref<EndSuggestion[]>([]);
let timer: ReturnType<typeof setTimeout> | null = null;
let asking: AbortController | null = null;

/** The system open in the system panel, from the page's address. */
const here = computed((): RouteEnd | null => {
    const sector = route.params.sector;
    const hex = route.params.hex;
    if ((route.name !== 'hex' && route.name !== 'body') || typeof sector !== 'string' || typeof hex !== 'string') return null;
    return /^\d{4}$/.test(hex) ? { sector, hex } : null;
});
const hereWords = computed(() => (here.value ? endWords(props.indexes(), here.value) : ''));
/** "Use <name>" sits by the first empty box, unless the other box already holds that system. */
const offerBox = computed((): EndBox | null => {
    if (!here.value) return null;
    const box = emptyBox(form);
    if (!box) return null;
    const other = pinned[otherBox(box)];
    if (other && sameEnd(other.end, here.value) && form[otherBox(box)].trim() === other.label) return null;
    return box;
});
const tucked = computed(() => !!here.value && !expanded.value);

function setBox(box: EndBox, el: unknown): void {
    boxes[box] = el && typeof (el as HTMLInputElement).focus === 'function' ? el as HTMLInputElement : null;
}

function focusBox(box: EndBox | null): void {
    if (box) void nextTick(() => boxes[box]?.focus());
}

function fill(box: EndBox, end: RouteEnd, label: string): void {
    form[box] = label;
    pinned[box] = { label, end };
    closeSuggestions();
}

function useHere(box: EndBox): void {
    if (!here.value) return;
    fill(box, here.value, hereWords.value);
    focusBox(emptyBox(form));
}

function swap(): void {
    const from = form.from;
    form.from = form.to;
    form.to = from;
    const pin = pinned.from;
    pinned.from = pinned.to;
    pinned.to = pin;
}

function useShipJump(): void {
    if (props.partyJump) form.jump = props.partyJump;
}

function clearRoute(): void {
    lines.value = [];
    legs.value = [];
    origin.value = null;
    total.value = '';
    fitted = '';
    emit('route', null);
}

function clear(): void {
    clearRoute();
    said.value = '';
}

/** Get directions pressed (or Enter): the suggestions close, then the plan. */
function go(): void {
    closeSuggestions();
    void plan();
}

let planTicket = 0;

/** DN1b: the sectors in the route's box fetched first ("Finding a route…"), then the plan (`directions_fetch.ts`). */
async function plan(): Promise<void> {
    const ticket = ++planTicket;
    const how = { indexes: props.indexes, grid: props.grid ? props.grid() : [], fetchIndex: props.fetchIndex, finding: () => { said.value = FINDING_WORDS; } };
    const { result, capped } = await planFetching(how, form, pinned);
    if (ticket !== planTicket) return;
    said.value = saidAfter(result, capped);
    if (!result.ok) {
        clearRoute();
        return;
    }
    // Both boxes were settled to plan: what was typed is done, so the suggestions go.
    closeSuggestions();
    lines.value = result.lines;
    legs.value = result.legs ?? [];
    origin.value = result.origin ?? null;
    total.value = result.total;
    emit('route', result.stops);
    const first = result.stops[0];
    const last = result.stops[result.stops.length - 1];
    const ends = first.sector + '/' + first.hex + '>' + last.sector + '/' + last.hex;
    if (ends !== fitted) {
        fitted = ends;
        emit('fit');
    }
}

/** A stop's name opens that system; the route stays drawn. */
function openStop(end: RouteEnd): void {
    void router.push('/s/' + end.sector + '/' + end.hex);
}

// Both ends set: plan at once, and again on any change. Words that do not find one system yet say nothing.
watch(
    () => [form.from, form.to, form.jump, form.fuel, form.scoops, form.processors, form.allowRed, pinned.from, pinned.to],
    () => {
        if (bothSettled(props.indexes(), props.grid ? props.grid() : [], form, pinned)) void plan();
        else if (lines.value.length) clearRoute();
    },
);

// The system panel's From here and To here.
watch(
    () => (directionsState.ask ? directionsState.ask.seq : 0),
    () => {
        const ask = directionsState.ask;
        if (!ask) return;
        fill(ask.box, ask.end, endWords(props.indexes(), ask.end));
        focusBox(otherBox(ask.box));
    },
    { immediate: true },
);

// Another system opened on a phone folds the panel again, above its sheet.
watch(here, (now, before) => {
    if (!now || !before || !sameEnd(now, before)) expanded.value = false;
});

// ---- Suggestions -------------------------------------------------------------------------------------------

function closeSuggestions(): void {
    if (timer) clearTimeout(timer);
    timer = null;
    if (asking) asking.abort();
    asking = null;
    suggestFor.value = null;
    suggestions.value = [];
}

function typed(box: EndBox): void {
    const words = form[box];
    const pin = pinned[box];
    if (pin && words.trim() === pin.label.trim()) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
        timer = null;
        if (asking) asking.abort();
        const ticket = new AbortController();
        asking = ticket;
        void suggestEnds(words, ticket.signal).then((found) => {
            if (asking !== ticket) return;
            suggestFor.value = found.length ? box : null;
            suggestions.value = found;
        });
    }, 200);
}

function pick(box: EndBox, item: EndSuggestion): void {
    fill(box, item.end, item.label);
    focusBox(emptyBox(form));
}

function boxKey(event: KeyboardEvent, box: EndBox): void {
    if (suggestFor.value !== box) return;
    if (event.key === 'Escape') {
        event.stopPropagation();
        closeSuggestions();
    } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        const wrap = (event.currentTarget as HTMLElement).closest('.dir-fld-wrap');
        const first = wrap ? wrap.querySelector<HTMLButtonElement>('.dir-sug-item') : null;
        if (first) first.focus();
    }
}

function close(): void {
    clear();
    emit('close');
}

onBeforeUnmount(closeSuggestions);
</script>

<template>
  <section class="dir ui-frame" :class="{ 'is-tucked': tucked }" aria-labelledby="dir-h" data-directions>
    <div class="dir-head">
      <h2 id="dir-h" class="ui-frame-label">Directions</h2>
      <button type="button" class="ui-btn dir-x" aria-label="Close Directions" title="Close" data-directions-close @click="close"><Icon name="xmark" :size="12" /></button>
    </div>
    <!-- On a phone with a system open: the ends and the total, the rest a press away. -->
    <div class="dir-brief" data-directions-brief>
      <p class="dir-brief-line">{{ form.from.trim() || 'From' }} → {{ form.to.trim() || 'To' }}</p>
      <p v-if="total" class="dir-brief-total">{{ total }}</p>
      <button type="button" class="ui-btn" aria-expanded="false" data-directions-expand @click="expanded = true">Show all of Directions</button>
    </div>
    <form class="dir-form" @submit.prevent="go">
      <div class="dir-ends">
        <div class="dir-ends-boxes">
          <div v-for="box in BOXES" :key="box" class="dir-fld-wrap">
            <label class="dir-fld dir-end"><span>{{ box === 'from' ? 'From' : 'To' }}</span>
              <input
                :ref="(el) => setBox(box, el)"
                v-model="form[box]"
                class="dir-box"
                :placeholder="box === 'from' ? 'Regina, or Spinward Marches 1910' : 'A system’s name or hex'"
                autocomplete="off"
                role="combobox"
                aria-autocomplete="list"
                :aria-expanded="suggestFor === box ? 'true' : 'false'"
                :aria-controls="'dir-sug-' + box"
                :data-directions-from="box === 'from' ? '' : undefined"
                :data-directions-to="box === 'to' ? '' : undefined"
                @input="typed(box)"
                @keydown="boxKey($event, box)"
              />
            </label>
            <ul v-if="suggestFor === box" :id="'dir-sug-' + box" class="dir-sug" role="listbox" :aria-label="(box === 'from' ? 'From' : 'To') + ' suggestions'" data-directions-suggestions>
              <li v-for="item in suggestions" :key="item.end.sector + '/' + item.end.hex" role="option" aria-selected="false">
                <button type="button" class="dir-sug-item" data-directions-suggestion @click="pick(box, item)" @keydown.esc.stop="closeSuggestions">
                  <b>{{ item.label }}</b><small>{{ item.detail }}</small>
                </button>
              </li>
            </ul>
            <button v-if="offerBox === box" type="button" class="ui-btn dir-use" :data-directions-use="box" @click="useHere(box)">Use {{ hereWords }}</button>
          </div>
        </div>
        <button type="button" class="ui-btn is-icon dir-swap" aria-label="Swap From and To" title="Swap From and To" data-directions-swap @click="swap"><span aria-hidden="true">⇅</span></button>
      </div>
      <div class="dir-row">
        <label class="dir-fld dir-small"><span>Jump</span>
          <select v-model.number="form.jump" class="dir-box" data-directions-jump>
            <option v-for="n in JUMPS" :key="n" :value="n">Jump-{{ n }}</option>
          </select>
        </label>
        <label class="dir-fld"><span>Fuel</span>
          <select v-model="form.fuel" class="dir-box" data-directions-fuel>
            <option v-for="choice in FUEL_CHOICES" :key="choice.value" :value="choice.value">{{ choice.label }}</option>
          </select>
        </label>
      </div>
      <p v-if="partyJump && form.jump === partyJump" class="dir-ship-note" data-directions-ship-jump>Jump-{{ partyJump }} is {{ partyShip || 'the party ship' }}’s jump.</p>
      <button v-else-if="partyJump" type="button" class="ui-btn dir-ship" data-directions-ship-jump @click="useShipJump">Use {{ partyShip || 'the party ship' }}’s jump (Jump-{{ partyJump }})</button>
      <div class="dir-checks">
        <label class="dir-check"><input v-model="form.scoops" type="checkbox" data-directions-scoops /> Fuel scoops</label>
        <label class="dir-check"><input v-model="form.processors" type="checkbox" data-directions-processors /> Fuel processors</label>
        <label class="dir-check"><input v-model="form.allowRed" type="checkbox" data-directions-red /> Allow Red zones</label>
      </div>
      <div class="dir-acts">
        <button type="submit" class="ui-btn is-primary" data-directions-go>Get directions</button>
        <button v-if="lines.length" type="button" class="ui-btn" data-directions-clear @click="clear">Clear</button>
      </div>
    </form>
    <p v-if="said" class="dir-said" role="status" data-directions-said>{{ said }}</p>
    <div v-if="lines.length" class="dir-result" data-directions-result>
      <div class="dir-sum">
        <p class="dir-total" role="status" data-directions-total>{{ total }}</p>
        <button type="button" class="ui-btn dir-fit" data-directions-fit @click="emit('fit')"><Icon name="expand" :size="11" />Show the route</button>
      </div>
      <ol class="dir-legs">
        <li v-if="origin" class="dir-stop is-origin" data-directions-origin>
          <span class="dir-stop-mark" aria-hidden="true"></span>
          <span class="dir-stop-body">
            <button type="button" class="dir-stop-name" :title="'Open ' + origin.name" @click="openStop(origin.end)">{{ origin.name }}</button>
            <span class="dir-stop-meta">Start</span>
          </span>
        </li>
        <li v-for="(leg, i) in legs" :key="i" class="dir-stop" :class="{ 'is-last': i === legs.length - 1 }" data-directions-leg>
          <span class="dir-stop-mark" aria-hidden="true">{{ i + 1 }}</span>
          <span class="dir-stop-body">
            <span class="dir-stop-top">
              <button type="button" class="dir-stop-name" :title="'Open ' + leg.name" @click="openStop(leg.end)">{{ leg.name }}</button>
              <span class="dir-stop-far">{{ leg.parsecs }}</span>
            </span>
            <span v-if="leg.fuel" class="dir-stop-meta">{{ leg.fuel }}</span>
            <span v-for="note in leg.notes" :key="note" class="dir-stop-note">{{ note }}</span>
          </span>
        </li>
      </ol>
      <p class="dir-fine">Shown on the chart. Nothing is saved; closing Directions clears the route.</p>
    </div>
  </section>
</template>

<style>
/* Under the top bar, docked to the chart's right edge, so the chart between the system panel and Directions
   stays clear for the route. Its width gives way to the system panel (--panel-width, published by
   shell/PanelHost.vue): never under or over it. The frame's own rule sets position and padding, so these are
   the more specific. */
.ui-frame.dir {
  position: absolute;
  z-index: 6;
  top: calc(var(--chrome-top) + var(--chrome-height) + 8px);
  right: var(--chrome-inset);
  left: auto;
  box-sizing: border-box;
  width: min(380px, calc(100% - var(--rail-width) - max(var(--chrome-inset), calc(var(--panel-width, 0px) + 8px)) - var(--chrome-inset)));
  max-height: calc(100% - var(--chrome-top) - var(--chrome-height) - 8px - var(--chrome-inset));
  overflow-y: auto;
  padding: 12px 14px 14px;
}

.dir-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.dir-head h2 {
  margin: 0;
}

/* The folded view is a phone's alone. */
.dir-brief {
  display: none;
}

.dir-form {
  display: grid;
  gap: 10px;
  margin-top: 8px;
}

/* The two ends as one block, the swap beside them. */
.dir-ends {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
}

.dir-ends-boxes {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.dir-fld.dir-end {
  grid-template-columns: 2.6em minmax(0, 1fr);
  align-items: center;
  gap: 6px;
}

.dir-swap {
  font: 400 15px/1 var(--font-text);
}

.dir-fld-wrap {
  display: grid;
  gap: 6px;
}

.dir-use,
.dir-sug {
  margin-left: calc(2.6em + 6px);
}

.dir-use {
  justify-self: start;
}

.dir-fld {
  display: grid;
  gap: 4px;
  min-width: 0;
  color: var(--text-muted);
  font: 600 11px/1.2 var(--font-text);
}

.dir-box {
  box-sizing: border-box;
  width: 100%;
  height: 32px;
  padding: 0 8px;
  border: 1px solid var(--line-2);
  border-radius: var(--r-2);
  background: var(--panel-raised);
  color: var(--text-0);
  font: 400 13px/1.2 var(--font-text);
}

.dir-sug {
  display: grid;
  gap: 2px;
  margin: 0;
  padding: 4px;
  border: 1px solid var(--line-1);
  border-radius: var(--r-2);
  background: var(--bg-1);
  list-style: none;
}

.dir-sug-item {
  display: grid;
  gap: 1px;
  width: 100%;
  padding: 5px 8px;
  border: 0;
  border-radius: var(--r-2);
  background: transparent;
  color: var(--text-0);
  font: 500 13px/1.3 var(--font-text);
  text-align: left;
  cursor: pointer;
}

.dir-sug-item small {
  color: var(--text-muted);
  font-size: 11.5px;
}

.dir-sug-item:hover,
.dir-sug-item:focus-visible {
  background: var(--row-active);
}

.dir-row {
  display: grid;
  grid-template-columns: 7.5em 1fr;
  gap: 8px;
}

.dir-ship {
  justify-self: start;
}

.dir-ship-note {
  margin: -4px 0 0;
  color: var(--text-muted);
  font: 400 11.5px/1.4 var(--font-text);
}

.dir-checks {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 14px;
}

.dir-check {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--text-1);
  font: 400 12.5px/1.3 var(--font-text);
}

.dir-acts {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.dir-said {
  margin: 10px 0 0;
  color: var(--attention);
  font: 400 12.5px/1.45 var(--font-text);
}

.dir-result {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid var(--line-1);
}

.dir-sum {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  margin: 0 0 10px;
}

.dir-total {
  margin: 0;
  color: var(--text-0);
  font: 600 13px/1.4 var(--font-text);
}

.dir-fit {
  flex: 0 0 auto;
}

/* The stops, start to end: a numbered mark a jump, joined by a line down the marks' column. */
.dir-legs {
  display: grid;
  margin: 0;
  padding: 0;
  list-style: none;
  color: var(--text-1);
  font: 400 12.5px/1.45 var(--font-text);
}

.dir-stop {
  position: relative;
  display: grid;
  grid-template-columns: 22px minmax(0, 1fr);
  gap: 10px;
  padding-bottom: 10px;
}

.dir-stop::before {
  content: "";
  position: absolute;
  top: 22px;
  bottom: 0;
  left: 10px;
  width: 2px;
  background: var(--line-2);
}

.dir-stop.is-last {
  padding-bottom: 0;
}

.dir-stop.is-last::before {
  display: none;
}

.dir-stop-mark {
  display: grid;
  place-items: center;
  box-sizing: border-box;
  width: 22px;
  height: 22px;
  border: 1px solid var(--line-2);
  border-radius: 50%;
  background: var(--panel-raised);
  color: var(--text-1);
  font: 700 10.5px/1 var(--font-code);
}

.dir-stop.is-origin .dir-stop-mark,
.dir-stop.is-last .dir-stop-mark {
  border-color: var(--signal);
  color: var(--signal);
}

.dir-stop.is-origin .dir-stop-mark::after {
  content: "";
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--signal);
}

.dir-stop-body {
  display: grid;
  gap: 1px;
  min-width: 0;
  padding-top: 2px;
}

.dir-stop-top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}

.dir-stop-name {
  min-width: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--text-0);
  font: 600 13px/1.35 var(--font-text);
  text-align: left;
  overflow-wrap: anywhere;
  cursor: pointer;
}

.dir-stop-name:hover,
.dir-stop-name:focus-visible {
  color: var(--signal);
}

.dir-stop-far {
  flex: 0 0 auto;
  color: var(--text-muted);
  font: 400 12px/1.35 var(--font-text);
}

.dir-stop-meta {
  color: var(--text-muted);
}

.dir-stop-note {
  color: var(--attention);
}

.dir-fine {
  margin: 10px 0 0;
  color: var(--text-muted);
  font: 400 11.5px/1.4 var(--font-text);
}

/* On a phone: from past the rail to the gutter, under the top bar's two rows, ending above the world sheet when
   it is up (--sheet-cover), scrolling inside itself; the controls meet 44 px. */
@media (max-width: 599px) {
  .ui-frame.dir {
    top: calc(var(--chrome-top) + 2 * (var(--chrome-height) + 8px));
    right: 16px;
    left: calc(var(--rail-width) + var(--chrome-inset));
    width: auto;
    max-height: calc(100% - var(--chrome-top) - 2 * (var(--chrome-height) + 8px) - var(--chrome-inset) - max(var(--sheet-cover, 0px), env(safe-area-inset-bottom, 0px)));
  }

  /* A system open (its sheet up): the ends and the total, just above the sheet; the rest a press away. */
  .ui-frame.dir.is-tucked {
    top: auto;
    bottom: calc(var(--chrome-inset) + max(var(--sheet-cover, 0px), env(safe-area-inset-bottom, 0px)));
    max-height: none;
  }

  .dir.is-tucked .dir-brief {
    display: grid;
    gap: 4px;
    margin-top: 6px;
  }

  .dir.is-tucked .dir-form,
  .dir.is-tucked .dir-said,
  .dir.is-tucked .dir-result {
    display: none;
  }

  .dir-brief-line,
  .dir-brief-total {
    margin: 0;
    color: var(--text-0);
    font: 500 13px/1.4 var(--font-text);
    overflow-wrap: anywhere;
  }

  .dir-brief-total {
    color: var(--text-1);
    font-weight: 400;
  }

  .dir-brief .ui-btn {
    justify-self: start;
  }

  .dir .ui-btn,
  .dir-box,
  .dir-sug-item {
    min-height: 44px;
  }

  .dir-check {
    min-height: 44px;
  }
}
</style>
