<script setup lang="ts">
/**
 * The pane's body in Build when what is selected is an empty slot on the grid of sectors
 * (findings/builder_system_design.md §16, mockup kb3_slot_empty): one thing is offered, a new
 * sector of the referee's own, with its name. The chart is not touched.
 */
import { nextTick, onMounted, ref, watch } from 'vue';
import Icon from '../../design/Icon.vue';
import { newSector, sectorUi } from './sector_acts.ts';
import { NAME_MAX } from './sectors.ts';

const box = ref<HTMLInputElement | null>(null);

function focusBox(): void {
    void nextTick(() => { if (box.value) box.value.focus(); });
}

onMounted(focusBox);
watch(() => sectorUi.focusName, focusBox);
</script>

<template>
  <div class="build-pane sector-pane">
    <p class="build-lead">No sector is charted in this slot.</p>
    <div class="build-card">
      <label class="sector-label" for="sector-new-name">Name</label>
      <input
        id="sector-new-name"
        ref="box"
        v-model="sectorUi.name"
        class="sector-box"
        type="text"
        autocomplete="off"
        spellcheck="false"
        :maxlength="NAME_MAX"
        :disabled="sectorUi.busy"
        @keydown.enter.prevent="newSector()"
      />
      <div class="build-acts sector-acts">
        <button type="button" class="ui-btn is-primary build-big" data-command="build-sector-new" :disabled="sectorUi.busy" :aria-busy="sectorUi.busy ? 'true' : undefined" @click="newSector()">
          <Icon name="plus" :size="13" />{{ sectorUi.busy ? 'Making…' : 'New sector' }}<kbd class="build-key">N</kbd>
        </button>
      </div>
      <p class="build-with">It is yours alone: sixteen subsectors, A to P, named when you name them. The chart is not touched.</p>
    </div>
    <p v-if="sectorUi.error" class="build-error" role="alert">{{ sectorUi.error }}</p>
    <p class="build-fine sector-fine">A charted sector cannot be replaced; you change it hex by hex.</p>
  </div>
</template>

<style>
.sector-label {
  display: block;
  margin-bottom: 4px;
  color: var(--text-muted);
  font: 500 12px/1.3 var(--font-text);
}

.sector-box {
  box-sizing: border-box;
  display: block;
  width: 100%;
  height: 36px;
  margin: 0;
  padding: 0 10px;
  border: 1px solid var(--control-line);
  border-radius: var(--r-2);
  background: var(--bg-2);
  color: var(--text-0);
  font: 400 14.5px/1.2 var(--font-text);
}

.sector-acts {
  margin-top: 10px;
}

.sector-fine {
  margin-top: 10px;
}
</style>
