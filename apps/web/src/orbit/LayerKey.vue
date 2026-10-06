<script setup lang="ts">
/**
 * The key at the picture's foot, which is the toggle (showpiece D1): one chip per layer
 * with its own mark, pressed to show or hide it. An entry that is off stays listed, dimmed
 * and dashed, so the key never says less than the picture draws. Keys 4 to 0 from the
 * keyboard. It replaces the chip row above the picture and the legend that stood here.
 */
import { LAYERS, toggled } from './commands.ts';
import Icon from '../design/Icon.vue';
import type { Layers } from './picture.ts';

const props = defineProps<{ layers: Layers }>();
const emit = defineEmits<{ layers: [layers: Layers] }>();

function flip(key: (typeof LAYERS)[number]['key']): void {
    emit('layers', toggled(props.layers, key));
}
</script>

<template>
  <div class="orbit-key" role="group" aria-label="Key: press an entry to show or hide it">
    <button
      v-for="item in LAYERS"
      :key="item.key"
      type="button"
      class="orbit-key-item"
      :class="{ 'is-off': !layers[item.key] }"
      :data-command="item.id"
      :aria-pressed="layers[item.key] ? 'true' : 'false'"
      :title="(layers[item.key] ? 'Hide ' : 'Show ') + item.label.toLowerCase() + ' (' + item.hotkey + ') — ' + item.title"
      @click="flip(item.key)"
    >
      <span class="orbit-key-mark" :class="'is-' + item.key" aria-hidden="true">
        <Icon v-if="item.key === 'markMainworld'" name="star" :size="11" />
      </span>
      <span class="orbit-key-word">{{ item.label }}</span>
    </button>
  </div>
</template>

<style>
.orbit-key {
  position: absolute;
  left: 14px;
  bottom: 14px;
  z-index: 3;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  max-width: calc(100% - 120px);
}

.orbit-key-item {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 28px;
  margin: 0;
  padding: 0 10px 0 8px;
  border: 1px solid var(--line-2);
  border-radius: var(--r-pill);
  background: var(--chrome-glass);
  color: var(--text-1);
  font: 500 12px/1 var(--font-text);
  cursor: pointer;
  transition: border-color var(--t-fast) var(--ease-out), color var(--t-fast) var(--ease-out);
}

.orbit-key-item:hover {
  border-color: var(--signal-dim);
}

.orbit-key-item.is-off {
  border-style: dashed;
  color: var(--text-muted);
}

.orbit-key-item.is-off .orbit-key-mark {
  opacity: 0.35;
}

.orbit-key-item:focus-visible {
  outline-offset: 1px;
}

/* Each entry's mark is the thing the picture draws. */
.orbit-key-mark {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 12px;
  color: var(--signal);
}

.orbit-key-mark.is-paths {
  height: 0;
  border-top: 1px solid var(--orbit-ring);
  opacity: 0.8;
}

.orbit-key-mark.is-moons::before {
  content: '';
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--text-muted);
}

.orbit-key-mark.is-habitable::before {
  content: '';
  width: 14px;
  height: 9px;
  border-radius: 2px;
  background: var(--orbit-hz);
  opacity: 0.85;
}

.orbit-key-mark.is-jump::before {
  content: '';
  width: 11px;
  height: 11px;
  border: 1px dashed var(--orbit-jump);
  border-radius: 50%;
}

.orbit-key-mark.is-dayNight::before {
  content: '';
  width: 11px;
  height: 11px;
  border-radius: 50%;
  background: linear-gradient(90deg, var(--daylight) 50%, var(--night-sky) 50%);
}

.orbit-key-mark.is-scan::before {
  content: '';
  width: 11px;
  height: 11px;
  border: 1px solid var(--signal);
  border-radius: 2px;
}

/* A narrow stage: the marks alone, the words in the title. */
.orbit-stage.is-narrow .orbit-key-word {
  display: none;
}

.orbit-stage.is-narrow .orbit-key-item {
  padding: 0 8px;
}

@media (prefers-reduced-motion: reduce) {
  .orbit-key-item {
    transition: none;
  }
}
</style>
