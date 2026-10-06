<script setup lang="ts">
/**
 * A vessel's track on its record page (K12, the track as a record): the legs in order, each
 * from → to with its dates, mode and G; "Remove last leg", undone from its toast; and, with
 * no legs, one sentence and the way to the orbit view of the vessel's system, where a course
 * is plotted. Both controls are commands first (track_rows.ts TRACK_COMMANDS).
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { campaign } from '../campaign/store.ts';
import { trackOf } from '../campaign/track.ts';
import Icon from '../design/Icon.vue';
import { orbitPath } from '../orbit/bodies.ts';
import { registerCommand } from '../shell/registry.ts';
import { liveById, parseHexKey, resolvePlace } from './places.ts';
import { removeLastTrackLeg } from './track_actions.ts';
import { TRACK_COMMANDS, shownRows, trackRows } from './track_rows.ts';

const props = defineProps<{
    id: string;
    /** Changes cannot be made just now (offline). */
    readOnly: boolean;
}>();

const router = useRouter();
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
    if (at) void router.push(orbitPath(at.slug, at.hex, at.bodyKey));
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
  <section v-if="record" ref="rootEl" class="trk" :data-legs="rows.length">
    <div class="trk-head">
      <h3 class="ui-heading">Track <span v-if="rows.length" class="ui-count">{{ rows.length }}</span></h3>
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
        </li>
      </ol>
    </template>
  </section>
</template>

<style>
.trk-head {
  display: flex;
  align-items: center;
  gap: 10px;
}

.trk-head .ui-heading {
  flex: 1 1 auto;
  gap: 8px;
}

.trk-head .ui-heading .ui-count {
  margin-left: 0;
}

.ui-btn.trk-remove {
  height: 28px;
  padding: 0 9px;
  font-size: 12.5px;
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
