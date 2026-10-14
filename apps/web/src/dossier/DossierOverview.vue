<script setup lang="ts">
import { computed, ref, useId } from 'vue';
import type { PanelSpan } from '../shell/panel_state.ts';
import { ribbonCellWords, uwpWords } from './code_words.ts';
import type { OverviewModel } from './model.ts';
import Icon from '../design/Icon.vue';
import JourneyTimes from './JourneyTimes.vue';
import SocioBlock from './SocioBlock.vue';
import StatRows from './StatRows.vue';
import StellarLines from './StellarLines.vue';
import SystemTree from './SystemTree.vue';
import UwpRibbon from './UwpRibbon.vue';
import { locating, startLocate, stopLocate, systemSubject } from '../workspace/locate.ts';

const props = defineProps<{
    model: OverviewModel;
    span: PanelSpan;
    error: boolean;
    /** Offer Explore orbits (not when the panel already sits beside the orbit view). */
    orbitLink?: boolean;
    /** Campaign records per body key, shown as counts in the system tree. */
    counts?: Record<string, number>;
    /** This system's key, "slug/hhhh". Locate is offered only beside the map. */
    hexKey?: string;
    /** Build is on: Explore orbits is a plain button, so the pane has one filled control. */
    plainOrbit?: boolean;
}>();

defineEmits<{
    open: [key: string];
    orbit: [];
    retry: [];
}>();

const locateBtn = ref<HTMLButtonElement | null>(null);
const ribbonFocus = ref(false);
const ribbonTipId = useId();
/** One sentence per digit, read when the ribbon link itself has keyboard focus. */
const ribbonTip = computed(() => {
    const ribbon = props.model.ribbon;
    if (!ribbon) return '';
    if (ribbon.kind === 'plain') return uwpWords();
    return ribbon.cells.map((cell) => ribbonCellWords(cell.label, cell.digit)).filter((item) => item).join(' ');
});
const locateSubject = computed(() => (props.hexKey ? systemSubject(props.hexKey) : ''));
const isLocating = computed(() => locateSubject.value !== '' && locating.recordId === locateSubject.value);

/** The line starts level with this button, as the record pages measure theirs. */
function originY(): number | null {
    const el = locateBtn.value;
    if (!el) return null;
    const box = el.getBoundingClientRect();
    return box.height > 0 ? box.top + box.height / 2 : null;
}

function toggleLocate(): void {
    if (!props.hexKey) return;
    if (isLocating.value) {
        stopLocate();
        return;
    }
    startLocate(systemSubject(props.hexKey), props.hexKey, originY);
}
</script>

<template>
  <div class="doss" :data-span="span">
    <div class="doss-identity">
      <!-- With no mainworld callout to sit in, Explore orbits keeps its own row. Locate is already there while the tree loads. -->
      <div v-if="orbitLink && hexKey && !model.holdLead" class="doss-actions">
        <button
          v-if="model.tree"
          type="button"
          class="ui-btn"
          :class="{ 'is-primary': !plainOrbit }"
          title="Open orbit view for this system (or double-click it on the map)"
          @click="$emit('orbit')"
        >
          <Icon name="solar-system" :size="13" />Explore orbits
        </button>
        <button
          ref="locateBtn"
          type="button"
          class="ui-btn"
          data-command="locate-system"
          :aria-pressed="isLocating ? 'true' : 'false'"
          :title="isLocating ? 'Stop locating' : 'Show this system on the map'"
          @click="toggleLocate"
        >
          <Icon name="location-crosshairs" :size="13" />{{ isLocating ? 'Locating' : 'Locate' }}
        </button>
      </div>
      <button
        v-if="model.ribbon && model.mainworldKey"
        type="button"
        class="doss-ribbon-link"
        :aria-label="model.callout && model.callout.name ? 'Open ' + model.callout.name : 'Open the mainworld'"
        :aria-describedby="ribbonFocus && ribbonTip ? ribbonTipId : undefined"
        @focus="ribbonFocus = true"
        @blur="ribbonFocus = false"
        @click="$emit('open', model.mainworldKey)"
      >
        <UwpRibbon :ribbon="model.ribbon" quiet />
        <span v-if="ribbonFocus && ribbonTip" :id="ribbonTipId" class="doss-note-pop doss-ribbon-focus" role="tooltip">{{ ribbonTip }}</span>
      </button>
      <UwpRibbon v-else-if="model.ribbon" :ribbon="model.ribbon" />
      <div v-if="model.holdLead" class="doss-callout" :aria-hidden="model.callout || model.mainworldKey ? undefined : 'true'">
        <p v-if="model.callout" class="doss-callout-line">
          <span class="doss-callout-name">{{ model.callout.name }}</span>
          <span class="doss-callout-words">{{ model.callout.badge }}</span>
        </p>
        <div v-if="model.mainworldKey || (orbitLink && hexKey)" class="doss-callout-actions">
          <button v-if="model.mainworldKey" type="button" class="ui-btn" @click="$emit('open', model.mainworldKey)">
            <Icon name="earth-americas" :size="13" />Mainworld
          </button>
          <button
            v-if="orbitLink && model.tree"
            type="button"
            class="ui-btn"
            :class="{ 'is-primary': !plainOrbit }"
            title="Open orbit view for this system (or double-click it on the map)"
            @click="$emit('orbit')"
          >
            <Icon name="solar-system" :size="13" />Explore orbits
          </button>
          <button
            v-if="orbitLink && hexKey"
            ref="locateBtn"
            type="button"
            class="ui-btn"
            data-command="locate-system"
            :aria-pressed="isLocating ? 'true' : 'false'"
            :title="isLocating ? 'Stop locating' : 'Show this system on the map'"
            @click="toggleLocate"
          >
            <Icon name="location-crosshairs" :size="13" />{{ isLocating ? 'Locating' : 'Locate' }}
          </button>
        </div>
      </div>
      <StatRows :rows="model.rows" />
      <JourneyTimes v-if="model.journey" :journey="model.journey" />
      <p v-if="model.notice" class="doss-muted">{{ model.notice }}</p>
      <p v-if="error" class="doss-muted">This world's system could not be loaded.</p>
      <div v-if="error" class="doss-actions">
        <button type="button" class="ui-btn" @click="$emit('retry')"><Icon name="retry" :size="13" />Retry</button>
      </div>
    </div>
    <div class="doss-side">
      <div v-if="model.socio" class="doss-socio">
        <SocioBlock :headline="model.socio.headline" :rows="model.socio.rows" :empty="model.socio.empty" :span="span">
          <StellarLines v-if="model.stellar" :lines="model.stellar.lines" />
        </SocioBlock>
      </div>
      <slot name="records" />
      <SystemTree v-if="model.tree" :count="model.tree.count" :rows="model.tree.rows" :counts="counts" @open="$emit('open', $event)" />
    </div>
  </div>
</template>

<style>
/* The ribbon is the link to the mainworld. It keeps the ribbon's own shape. */
.doss-ribbon-link {
  position: relative;
  display: block;
  width: 100%;
  margin: 0;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  text-align: inherit;
  cursor: pointer;
}

.doss-ribbon-link > .doss-ribbon-focus {
  display: block;
  left: 0;
  right: auto;
  width: min(260px, 100%);
}

.doss-ribbon-link:hover .doss-cell {
  background: var(--wash);
}

/* One line for the mainworld, held at the control's height before the tree arrives. */
.doss-callout {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--sp-2);
  min-height: var(--sp-8);
  margin: var(--sp-2) 0;
}

.doss-callout-line {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
  margin: 0;
  min-width: 0;
  color: var(--text-1);
  font: 400 13px/1.5 var(--font-text);
}

.doss-callout-name {
  color: var(--text-0);
  font-weight: 600;
}

.doss-callout-words {
  color: var(--text-muted);
}

/* Mainworld, then Explore orbits, then Locate. They stay one set and wrap inside it when the column is narrow. */
.doss-callout-actions {
  display: flex;
  flex: 1 1 auto;
  flex-wrap: wrap;
  gap: var(--sp-2);
  min-width: 0;
  max-width: 100%;
}


</style>
