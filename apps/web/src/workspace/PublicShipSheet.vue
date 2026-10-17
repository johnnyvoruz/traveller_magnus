<script setup lang="ts">
/**
 * The read-only card of someone else's public ship (prompts/d_party_ships_map.md item 2): the
 * ship, who is aboard, the game, the referee when they chose to be named, and the public journal,
 * newest first, with one quiet "Example game" line at the foot of an example's card
 * (prompts/d_traffic_display.md item 8). Nothing on it changes anything. Beside the ship's marks on a
 * wide window; a sheet along the bottom of a phone. Closes with Esc, its close button, or a click
 * on empty map (MapView). While it is open the map shows its route, and its name and border
 * are the traffic colour, the map's colour for other people's ships (prompts/d_store_2.md item 4). Opened on a
 * hex with several ships, it says "1 of 3" and steps through them with Previous and Next
 * (prompts/d_public_overview_map.md item 7): those only change which ship is shown.
 */
import { computed, nextTick, ref, watch } from 'vue';
import Icon from '../design/Icon.vue';
import { SHIP_FAILED, SHIP_GONE, type ShipCardBody } from './public_card.ts';
import { SHIP_SHEET_BELOW, shipCardPlace, type ShipCardBox } from './public_ship_card.ts';

export type ShipSheetState = {
    /** Counts each opening: a new one moves focus to the card. Stepping through a stack does not. */
    opened: number;
    /** The ship shown. */
    mark: string;
    /** How many ships the hex's list holds, and which of them this is (0-based). */
    count: number;
    index: number;
    status: 'loading' | 'card' | 'gone' | 'failed';
    /** What the feed said, shown while the card loads. */
    ship: string;
    aboard: readonly string[];
    example: boolean;
    card: ShipCardBody | null;
    place: ShipCardBox;
};

const props = defineProps<{ state: ShipSheetState | null; width: number; height: number }>();
const emit = defineEmits<{ close: []; step: [delta: number] }>();

const CARD_W = 340;
const CARD_H = 460;
const GAP = 8;

const sheetEl = ref<HTMLElement | null>(null);
const narrow = computed(() => props.width < SHIP_SHEET_BELOW);
const ship = computed(() => (props.state ? (props.state.card ? props.state.card.ship : props.state.ship) : ''));
const aboard = computed(() => {
    const state = props.state;
    if (!state) return '';
    const names = state.card ? state.card.aboard : state.aboard;
    return names.join(', ');
});
const example = computed(() => (props.state ? (props.state.card ? props.state.card.example : props.state.example) : false));
const note = computed(() => {
    const status = props.state ? props.state.status : null;
    if (status === 'gone') return SHIP_GONE;
    if (status === 'failed') return SHIP_FAILED;
    return null;
});
const style = computed(() => {
    const state = props.state;
    if (!state || narrow.value) return {};
    const h = Math.min(CARD_H, props.height - GAP * 2);
    const at = shipCardPlace(state.place, props.width, props.height, h, CARD_W);
    return { left: at.left + 'px', top: at.top + 'px', width: at.width + 'px', maxHeight: h + 'px' };
});

const position = computed(() => (props.state && props.state.count > 1 ? String(props.state.index + 1) + ' of ' + String(props.state.count) : null));

// Focus goes to the card when it opens on a ship, so Esc and the keyboard reach it.
watch(() => (props.state ? props.state.opened : null), (opened) => {
    if (opened === null) return;
    void nextTick(() => { if (sheetEl.value) sheetEl.value.focus({ preventScroll: true }); });
});
</script>

<template>
  <div class="psheet-layer">
    <section
      v-if="state"
      ref="sheetEl"
      class="psheet"
      :class="{ 'is-sheet': narrow }"
      :style="style"
      role="dialog"
      :aria-label="ship"
      tabindex="-1"
      data-public-ship-sheet
      @pointerdown.stop
      @keydown.esc.stop.prevent="emit('close')"
    >
      <header class="psheet-head">
        <div class="psheet-title">
          <h2 class="psheet-ship">{{ ship }}</h2>
        </div>
        <div class="psheet-tools">
          <template v-if="position">
            <button type="button" class="ui-btn is-icon" aria-label="Previous ship" title="Previous ship" :disabled="state.index === 0" data-step="-1" @click="emit('step', -1)">
              <Icon name="chevron-left" :size="14" />
            </button>
            <span class="psheet-position" aria-live="polite" data-position>{{ position }}</span>
            <button type="button" class="ui-btn is-icon" aria-label="Next ship" title="Next ship" :disabled="state.index >= state.count - 1" data-step="1" @click="emit('step', 1)">
              <Icon name="chevron-right" :size="14" />
            </button>
          </template>
          <button type="button" class="ui-btn is-icon psheet-close" aria-label="Close" title="Close (Esc)" @click="emit('close')">
            <Icon name="xmark" :size="14" />
          </button>
        </div>
      </header>
      <div class="psheet-body">
        <p v-if="aboard" class="psheet-aboard"><span>Aboard:</span> {{ aboard }}</p>
        <p v-if="note" class="psheet-note" role="status">{{ note }}</p>
        <p v-else-if="state.status === 'loading'" class="psheet-note" role="status">Loading the ship’s log…</p>
        <template v-if="state.card">
          <dl class="psheet-game">
            <div><dt>Game</dt><dd>{{ state.card.game }}</dd></div>
            <div v-if="state.card.referee" data-referee><dt>Referee</dt><dd>{{ state.card.referee }}</dd></div>
          </dl>
          <section class="psheet-journal" aria-label="Journal">
            <h3>Journal</h3>
            <article v-for="(entry, i) in state.card.journal" :key="i" class="psheet-entry">
              <h4 v-if="entry.title">{{ entry.title }}</h4>
              <p v-if="entry.date" class="psheet-date">{{ entry.date }}</p>
              <p v-if="entry.body" class="psheet-text">{{ entry.body }}</p>
            </article>
            <p v-if="state.card.journal.length === 0" class="psheet-empty">No public journal entries yet.</p>
          </section>
        </template>
      </div>
      <footer v-if="example" class="psheet-foot" data-example>Example game</footer>
    </section>
  </div>
</template>

<style>
/* Laid exactly over the chart's canvas. Only the card takes the pointer. */
.psheet-layer {
  position: absolute;
  top: 0;
  left: var(--rail-width);
  width: calc(100% - var(--rail-width));
  height: 100%;
  overflow: hidden;
  pointer-events: none;
}

.psheet {
  position: absolute;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  pointer-events: auto;
  border: 1px solid color-mix(in srgb, var(--chart-traffic) 45%, var(--line-1));
  border-radius: var(--r-4);
  background: var(--bg-1);
  box-shadow: var(--shadow-pop), 0 0 0 1px color-mix(in srgb, var(--chart-traffic) 12%, transparent);
  color: var(--text-1);
  font: 400 14px/1.5 var(--font-text);
  animation: psheet-in var(--t-fast) var(--ease-out);
}

.psheet:focus {
  outline: none;
}

.psheet:focus-visible {
  outline: 1px solid var(--signal);
  outline-offset: 2px;
}

/* A phone: a sheet along the bottom, the map still in view above it (SHIP_SHEET_SHARE: 52%). */
.psheet.is-sheet {
  left: 8px;
  right: 8px;
  bottom: 8px;
  max-height: 52%;
}

.psheet-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  padding: 12px 10px 6px 16px;
}

.psheet-tools {
  display: flex;
  align-items: center;
  gap: 2px;
  flex: none;
}

.psheet-position {
  min-width: 46px;
  color: var(--text-muted);
  font: 400 12px/1 var(--font-code);
  font-variant-numeric: var(--tabular);
  text-align: center;
  white-space: nowrap;
}

.psheet-title {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 10px;
  min-width: 0;
}

.psheet .psheet-ship {
  margin: 0;
  color: var(--chart-traffic);
  font: italic 600 18px/1.3 var(--font-text);
  letter-spacing: 0;
  overflow-wrap: anywhere;
}

.psheet-foot {
  flex: none;
  padding: 8px 16px 10px;
  border-top: 1px solid var(--line-1);
  color: var(--text-muted);
  font: 400 12px/1.4 var(--font-text);
}

.psheet-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 0 16px 16px;
  overflow: auto;
}

.psheet p {
  margin: 0;
}

.psheet .psheet-aboard {
  color: var(--text-1);
}

.psheet .psheet-aboard span,
.psheet .psheet-note,
.psheet .psheet-empty,
.psheet .psheet-date {
  color: var(--text-muted);
}

.psheet-game {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 2px 12px;
  margin: 0;
}

.psheet-game > div {
  display: contents;
}

.psheet-game dt {
  color: var(--text-muted);
}

.psheet-game dd {
  margin: 0;
  color: var(--text-0);
  overflow-wrap: anywhere;
}

.psheet-journal {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--line-1);
}

.psheet-journal h3 {
  margin: 0;
  color: var(--text-muted);
  font: 600 11px/1.4 var(--font-text);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.psheet-entry {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.psheet-entry h4 {
  margin: 0;
  color: var(--text-0);
  font: 600 14px/1.4 var(--font-text);
}

.psheet .psheet-date {
  font: 400 12px/1.4 var(--font-code);
  font-variant-numeric: var(--tabular);
}

.psheet .psheet-text {
  margin-top: 4px;
  color: var(--text-1);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

@keyframes psheet-in {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .psheet {
    animation: none;
  }
}
</style>
