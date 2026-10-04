<script setup lang="ts">
import { ref } from 'vue';
import Icon from '../design/Icon.vue';
import type { PanelSpan } from './panel_state.ts';

const element = ref<HTMLElement | null>(null);

defineProps<{
    open: boolean;
    title: string;
    meta: string;
    chip: string;
    span: PanelSpan;
}>();

defineEmits<{
    close: [];
    span: [span: PanelSpan];
}>();

defineExpose({ element });
</script>

<template>
  <section
    ref="element"
    class="panel"
    :class="{ 'is-open': open }"
    :data-span="span"
    :aria-hidden="open ? 'false' : 'true'"
    :inert="open ? undefined : true"
  >
    <div class="panel-card">
      <header class="panel-head">
        <div class="panel-titles">
          <p v-if="$slots.eyebrow" class="panel-eyebrow">
            <slot name="eyebrow" />
          </p>
          <div class="panel-title-row">
            <span v-if="$slots.glyph" class="panel-glyph"><slot name="glyph" /></span>
            <h1>{{ title }}</h1>
            <!-- The chip text is the hex chip of the legacy title row; the eyebrow slot is the breadcrumb. -->
            <span v-if="chip && !$slots.eyebrow" class="ui-hex">{{ chip }}</span>
          </div>
          <p v-if="meta" class="panel-meta">{{ meta }}</p>
        </div>
        <div class="panel-tools">
          <div class="ui-seg panel-spans" role="group" aria-label="Panel width">
            <button type="button" title="Column" :aria-pressed="span === 'column'" @click="$emit('span', 'column')">Column</button>
            <button type="button" title="Half page" :aria-pressed="span === 'half'" @click="$emit('span', 'half')">Half</button>
            <button type="button" title="Full page" :aria-pressed="span === 'full'" @click="$emit('span', 'full')">Full</button>
          </div>
        </div>
        <button type="button" class="panel-close" aria-label="Close panel" title="Close" @click="$emit('close')">
          <Icon name="xmark" :size="18" />
        </button>
      </header>
      <div v-if="$slots.actions" class="panel-bar">
        <slot name="actions" />
      </div>
      <div class="panel-body">
        <slot />
      </div>
    </div>
  </section>
</template>

<style>
/*
 * The measured box is the card plus its side gutters, so the map's workspace starts one inset
 * past the card (legacy --inspector-width is the pane width plus 20).
 */
.panel {
  position: absolute;
  top: var(--panel-top);
  left: var(--rail-width);
  bottom: 0;
  z-index: 3;
  display: flex;
  box-sizing: border-box;
  padding: 0 var(--chrome-inset) var(--chrome-inset);
  opacity: 0;
  transform: translateX(calc(var(--sp-2) * -1));
  pointer-events: none;
  transition: opacity var(--t-base) var(--ease-out), transform var(--t-base) var(--ease-out), left var(--t-rail) ease;
}

.panel.is-open {
  opacity: 1;
  transform: translateX(0);
}

.panel-card {
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  min-height: 0;
  overflow: hidden;
  background: var(--bg-1);
  border: 1px solid var(--line-1);
  border-radius: var(--r-4);
  box-shadow: var(--shadow-panel);
  color: var(--text-1);
  font: 400 14px/1.55 var(--font-text);
}

.panel.is-open .panel-card {
  pointer-events: auto;
}

.panel-card *,
.panel-card *::before,
.panel-card *::after {
  box-sizing: border-box;
}

.panel[data-span="column"] .panel-card {
  width: min(var(--panel-column), calc(100vw - var(--rail-width) - 2 * var(--chrome-inset)));
}

.panel[data-span="half"] .panel-card {
  width: min(
    calc(100vw - var(--rail-width) - 2 * var(--chrome-inset)),
    max(var(--panel-column), calc((100vw - var(--rail-width) - 2 * var(--chrome-inset)) / 2))
  );
}

.panel[data-span="full"] .panel-card {
  width: calc(100vw - var(--rail-width) - 2 * var(--chrome-inset));
}

.panel-head {
  position: relative;
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  min-height: 58px;
  padding: 12px 48px 12px 16px;
  background: var(--surface-1);
  border-bottom: 1px solid var(--signal-line);
}

.panel-titles {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.panel-title-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 10px;
  min-width: 0;
}

.panel-title-row:has(.panel-glyph) {
  flex-wrap: nowrap;
}

.panel-glyph {
  display: inline-flex;
  flex: 0 0 auto;
}

.panel-titles h1 {
  margin: 0;
  min-width: 0;
  color: var(--text-0);
  font: 700 21px/1.2 var(--font-text);
  letter-spacing: -0.2px;
  overflow-wrap: anywhere;
}

.panel-eyebrow {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0;
  color: var(--signal);
  font: 600 10.5px/1.3 var(--font-text);
  letter-spacing: 1.2px;
  text-transform: uppercase;
  overflow-wrap: anywhere;
}

.panel-meta {
  margin: 0;
  color: var(--text-muted);
  font: 400 12px/1.35 var(--font-text);
  overflow-wrap: anywhere;
}

.panel-tools {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 8px;
  margin-left: auto;
  padding-left: 12px;
}

.panel-close {
  position: absolute;
  top: 50%;
  right: 10px;
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: var(--r-2);
  background: transparent;
  color: var(--signal-dim);
  cursor: pointer;
  transform: translateY(-50%);
  transition: background var(--t-fast) var(--ease-out), color var(--t-fast) var(--ease-out);
}

.panel-close:hover {
  background: var(--wash-faint);
  color: var(--signal);
}

.panel-close:active {
  transform: translateY(-50%) scale(0.9);
}

/* Controls for what the panel shows; stays put while the body scrolls (legacy .atlas-body-bar). */
.panel-bar {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 6px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--line-soft);
}

.panel-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  scrollbar-gutter: stable;
}

.panel-body:has(.doss[data-span="half"]),
.panel-body:has(.doss[data-span="full"]) {
  overflow: hidden;
  scrollbar-gutter: auto;
}

@media (prefers-reduced-motion: reduce) {
  .panel,
  .panel-close {
    transition: none;
  }
}
</style>
