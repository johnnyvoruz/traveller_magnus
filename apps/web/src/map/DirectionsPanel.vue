<script setup lang="ts">
/**
 * Directions on the chart (streams/D.md DN1), for the referee and players alike: From and To, Jump 1 to 6,
 * the fuel choice and the ship's kit, then the route drawn and its legs listed (`directions.ts`, on A's
 * planner). Nothing is saved: closing the panel clears the route. MapView.vue mounts it and draws.
 */
import { reactive, ref } from 'vue';
import Icon from '../design/Icon.vue';
import type { RouteEnd } from './route_plan.ts';
import { blankForm, directions, endWords, FUEL_CHOICES, JUMPS, type DirectionsIndex } from './directions.ts';

const props = defineProps<{
    /** The loaded sectors, read on each press. */
    indexes: () => DirectionsIndex[];
    /** The hex selected on the chart, read on Use selected. */
    selected: () => RouteEnd | null;
    /** The party ship's jump (1 to 6) in a campaign with a party ship; absent, the button is not offered. */
    partyJump?: number | null;
    /** The party ship's name, for the button. */
    partyShip?: string;
}>();

const emit = defineEmits<{
    route: [stops: RouteEnd[] | null];
    close: [];
}>();

const form = reactive(blankForm());
const lines = ref<string[]>([]);
const total = ref('');
const said = ref('');

function clear(): void {
    lines.value = [];
    total.value = '';
    said.value = '';
    emit('route', null);
}

function useSelected(box: 'from' | 'to'): void {
    const at = props.selected();
    if (!at) {
        said.value = 'Select a system on the chart first.';
        return;
    }
    form[box] = endWords(props.indexes(), at);
    said.value = '';
}

function swap(): void {
    const from = form.from;
    form.from = form.to;
    form.to = from;
    if (lines.value.length) go();
}

function useShipJump(): void {
    if (props.partyJump) form.jump = props.partyJump;
}

function go(): void {
    const result = directions(props.indexes(), form);
    if (!result.ok) {
        lines.value = [];
        total.value = '';
        said.value = result.message;
        emit('route', null);
        return;
    }
    said.value = '';
    lines.value = result.lines;
    total.value = result.total;
    emit('route', result.stops);
}

function close(): void {
    clear();
    emit('close');
}
</script>

<template>
  <section class="dir ui-frame" aria-labelledby="dir-h" data-directions>
    <div class="dir-head">
      <h2 id="dir-h" class="ui-frame-label">Directions</h2>
      <button type="button" class="ui-btn dir-x" aria-label="Close Directions" title="Close" data-directions-close @click="close"><Icon name="xmark" :size="12" /></button>
    </div>
    <form class="dir-form" @submit.prevent="go">
      <div class="dir-ends">
        <label class="dir-fld"><span>From</span>
          <input v-model="form.from" class="dir-box" placeholder="Regina, or Spinward Marches 1910" autocomplete="off" data-directions-from />
        </label>
        <button type="button" class="ui-btn dir-use" data-directions-from-selected @click="useSelected('from')">Use selected</button>
        <label class="dir-fld"><span>To</span>
          <input v-model="form.to" class="dir-box" placeholder="A system's name or hex" autocomplete="off" data-directions-to />
        </label>
        <button type="button" class="ui-btn dir-use" data-directions-to-selected @click="useSelected('to')">Use selected</button>
      </div>
      <button type="button" class="ui-btn dir-swap" data-directions-swap @click="swap">Swap From and To</button>
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
      <button v-if="partyJump" type="button" class="ui-btn dir-ship" data-directions-ship-jump @click="useShipJump">Use {{ partyShip || 'the party ship' }}’s jump (Jump-{{ partyJump }})</button>
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
      <p class="dir-total" role="status" data-directions-total>{{ total }}</p>
      <ol class="dir-legs">
        <li v-for="(line, i) in lines" :key="i" data-directions-leg>{{ line }}</li>
      </ol>
      <p class="dir-fine">Shown on the chart. Nothing is saved; closing Directions clears the route.</p>
    </div>
  </section>
</template>

<style>
/* Over the chart, on its right. The frame's own rule sets position and padding, so these are the more specific. */
.ui-frame.dir {
  position: absolute;
  z-index: 6;
  top: 76px;
  right: 16px;
  box-sizing: border-box;
  width: min(380px, calc(100% - 32px));
  max-height: calc(100% - 150px);
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

.dir-form {
  display: grid;
  gap: 10px;
  margin-top: 8px;
}

.dir-ends {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 6px 8px;
  align-items: end;
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

.dir-row {
  display: grid;
  grid-template-columns: 7.5em 1fr;
  gap: 8px;
}

.dir-swap,
.dir-ship {
  justify-self: start;
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

.dir-total {
  margin: 0 0 8px;
  color: var(--text-0);
  font: 600 13px/1.4 var(--font-text);
}

.dir-legs {
  display: grid;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
  color: var(--text-1);
  font: 400 12.5px/1.45 var(--font-text);
}

.dir-fine {
  margin: 10px 0 0;
  color: var(--text-muted);
  font: 400 11.5px/1.4 var(--font-text);
}

/* On a phone the panel is the width of the screen less its gutters, and the controls meet 44 px. */
@media (max-width: 599px) {
  /* Below the search box and the date, from past the rail (as the search box starts) to the gutter. It ends
     above the corner buttons, which sit on the world sheet when it is up (--sheet-cover, shell/PanelHost.vue),
     and scrolls inside itself when the legs run long. */
  .ui-frame.dir {
    top: 128px;
    right: 16px;
    bottom: calc(var(--chrome-inset) + max(var(--sheet-cover, 0px), env(safe-area-inset-bottom, 0px)) + 52px);
    left: calc(var(--rail-width) + var(--chrome-inset));
    width: auto;
    height: auto;
    max-height: none;
  }

  .dir .ui-btn,
  .dir-box {
    min-height: 44px;
  }

  .dir-check {
    min-height: 44px;
  }
}
</style>
