<script setup lang="ts">
/**
 * Directions on the system panel's action row (DN2). While Directions is shut: one Directions button opening a
 * two-item menu, Directions from here and Directions to here. While it is open: From here and To here as two
 * buttons. Either opens Directions with that box filled by this system (`directions_state.ts`).
 */
import { computed, ref } from 'vue';
import Icon from '../design/Icon.vue';
import { parseHexKey } from '../workspace/places.ts';
import { directionsHere, directionsState, type EndBox } from './directions_state.ts';

const props = defineProps<{
    /** This system, "slug/hhhh". */
    hexKey: string;
}>();

const menuOpen = ref(false);
const end = computed(() => {
    const place = parseHexKey(props.hexKey);
    return place ? { sector: place.slug, hex: place.hex } : null;
});

function here(box: EndBox): void {
    menuOpen.value = false;
    if (end.value) directionsHere(box, end.value);
}

function onKey(event: KeyboardEvent): void {
    if (event.key === 'Escape' && menuOpen.value) {
        event.stopPropagation();
        menuOpen.value = false;
    }
}
</script>

<template>
  <span v-if="end" class="dir-here" data-directions-here @keydown="onKey">
    <template v-if="directionsState.open">
      <button type="button" class="ui-btn" title="Start the route at this system" data-directions-here-from @click="here('from')">
        <Icon name="route" :size="13" />From here
      </button>
      <button type="button" class="ui-btn" title="End the route at this system" data-directions-here-to @click="here('to')">
        <Icon name="route" :size="13" />To here
      </button>
    </template>
    <template v-else>
      <button
        type="button"
        class="ui-btn"
        aria-haspopup="menu"
        :aria-expanded="menuOpen ? 'true' : 'false'"
        title="Directions from or to this system"
        data-directions-here-menu
        @click="menuOpen = !menuOpen"
      >
        <Icon name="route" :size="13" />Directions
      </button>
      <span v-if="menuOpen" class="dir-here-menu ui-frame" role="menu" aria-label="Directions">
        <button type="button" role="menuitem" class="dir-here-item" data-directions-here-from @click="here('from')">Directions from here</button>
        <button type="button" role="menuitem" class="dir-here-item" data-directions-here-to @click="here('to')">Directions to here</button>
      </span>
    </template>
  </span>
</template>

<style>
.dir-here {
  position: relative;
  display: inline-flex;
  flex-wrap: wrap;
  gap: inherit;
}

.ui-frame.dir-here-menu {
  position: absolute;
  z-index: 8;
  top: calc(100% + 4px);
  left: 0;
  display: grid;
  min-width: 190px;
  padding: 4px;
}

.dir-here-item {
  min-height: 32px;
  padding: 0 10px;
  border: 0;
  border-radius: var(--r-2);
  background: transparent;
  color: var(--text-0);
  font: 500 13px/1.2 var(--font-text);
  text-align: left;
  cursor: pointer;
}

.dir-here-item:hover,
.dir-here-item:focus-visible {
  background: var(--row-active);
}

@media (pointer: coarse), (max-width: 599px) {
  .dir-here-item {
    min-height: 44px;
  }
}
</style>
