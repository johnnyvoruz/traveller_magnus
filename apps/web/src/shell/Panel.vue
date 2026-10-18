<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, useId } from 'vue';
import { useRouter } from 'vue-router';
import Icon from '../design/Icon.vue';
import type { PanelSpan } from './panel_state.ts';
import { backTo, canPaneBack, sheetFull, toggleSheet } from './pane_back.ts';

const element = ref<HTMLElement | null>(null);
const titleId = useId();
const phone = ref(false);
const router = useRouter();
let stopMedia: (() => void) | null = null;

defineProps<{
    open: boolean;
    title: string;
    meta: string;
    chip: string;
    span: PanelSpan;
    /** Show the chip beside the title even under a breadcrumb (Build's line to climb). */
    keepChip?: boolean;
}>();

defineEmits<{
    close: [];
    span: [span: PanelSpan];
}>();

defineExpose({ element });

function readPhone(): void {
    const view = document.defaultView;
    phone.value = view ? view.matchMedia('(max-width: 599px)').matches : false;
}

onMounted(() => {
    readPhone();
    const view = document.defaultView;
    if (!view) return;
    const media = view.matchMedia('(max-width: 599px)');
    const onChange = (): void => { phone.value = media.matches; };
    media.addEventListener('change', onChange);
    stopMedia = () => media.removeEventListener('change', onChange);
});

onBeforeUnmount(() => {
    if (stopMedia) stopMedia();
});

function onBack(): void {
    const target = backTo();
    if (!target) return;
    void router.push({ path: target.path, query: target.query });
}

let grabY = 0;
let grabMoved = false;

function onGrabDown(event: PointerEvent): void {
    grabY = event.clientY;
    grabMoved = false;
    const el = event.currentTarget;
    if (el instanceof HTMLElement) el.setPointerCapture(event.pointerId);
}

function onGrabMove(event: PointerEvent): void {
    if (Math.abs(event.clientY - grabY) > 8) grabMoved = true;
}

function onGrabUp(): void {
    if (grabMoved) toggleSheet();
}

function onGrabClick(): void {
    if (grabMoved) {
        grabMoved = false;
        return;
    }
    toggleSheet();
}
</script>

<template>
  <section
    ref="element"
    class="panel"
    role="region"
    :aria-labelledby="titleId"
    :data-span="span"
    :data-sheet="phone ? (sheetFull ? 'full' : 'half') : 'side'"
    :class="{ 'is-open': open, 'is-sheet-full': sheetFull }"
    :aria-hidden="open ? 'false' : 'true'"
    :inert="open ? undefined : true"
  >
    <div class="panel-card">
      <button
        type="button"
        class="panel-grab"
        aria-label="Resize sheet"
        title="Resize sheet"
        :aria-pressed="sheetFull ? 'true' : 'false'"
        @pointerdown="onGrabDown"
        @pointermove="onGrabMove"
        @pointerup="onGrabUp"
        @click="onGrabClick"
      >
        <span class="panel-grab-bar"></span>
      </button>
      <header class="panel-head">
        <div class="panel-titles">
          <p v-if="$slots.eyebrow" class="panel-eyebrow">
            <slot name="eyebrow" />
          </p>
          <div class="panel-title-row">
            <span v-if="$slots.glyph" class="panel-glyph"><slot name="glyph" /></span>
            <!-- The title, or a box in its place while it is being renamed. -->
            <h1 :id="titleId"><slot name="title">{{ title }}</slot></h1>
            <!-- The chip text is the hex chip of the legacy title row; the eyebrow slot is the breadcrumb. -->
            <span v-if="chip && (keepChip || !$slots.eyebrow)" class="ui-hex">{{ chip }}</span>
          </div>
          <p v-if="meta" class="panel-meta">{{ meta }}</p>
        </div>
        <div class="panel-tools">
          <div v-if="$slots.pager" class="panel-pager"><slot name="pager" /></div>
          <div class="ui-seg panel-spans" role="group" aria-label="Panel width">
            <button type="button" title="Column" :aria-pressed="span === 'column'" @click="$emit('span', 'column')">Column</button>
            <button type="button" title="Half page" :aria-pressed="span === 'half'" @click="$emit('span', 'half')">Half</button>
            <button type="button" title="Full page" :aria-pressed="span === 'full'" @click="$emit('span', 'full')">Full</button>
          </div>
        </div>
        <button v-if="canPaneBack" type="button" class="panel-back" aria-label="Back" title="Back" @click="onBack">
          <Icon name="chevron-left" :size="18" />
        </button>
        <button type="button" class="panel-close" aria-label="Close panel" title="Close panel" @click="$emit('close')">
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
/* The width switch in the videos' type: small Orbitron capitals, as their kickers. */
.panel-spans button {
  padding: 5px 9px 4px;
  font: 700 10px/1.4 var(--font-display);
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

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
  /* One corner: Close, and Back when the pane stack has a previous pane. Tools stay in the content box. */
  --corner-edge: 10px;
  --corner-size: 30px;
  --corner-gap: 4px;
  --corner-extra: 8px;
  position: relative;
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  min-height: 58px;
  padding: 12px calc(var(--corner-edge) + var(--corner-size) + var(--corner-extra)) 12px 16px;
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

.panel-close,
.panel-back {
  position: absolute;
  top: 50%;
  right: var(--corner-edge);
  display: grid;
  place-items: center;
  width: var(--corner-size);
  height: var(--corner-size);
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

.panel-back {
  right: calc(var(--corner-edge) + var(--corner-size) + var(--corner-gap));
}

.panel-head:has(.panel-back) {
  padding-right: calc(var(--corner-edge) + (2 * var(--corner-size)) + var(--corner-gap) + var(--corner-extra));
}

/*
 * At Column (DF7), a header with a location line ("Spinward Marches - Vilis") is two rows: the title
 * and its hex badge across the top with back and close in the corner, then the location line with the
 * width switch beside it. On one row the switch crowded the title and pushed the badge under it. Half
 * and Full keep one row; a phone is the bottom sheet, with no switch.
 */
@media (min-width: 600px) {
  .panel[data-span="column"] .panel-head:has(.panel-meta) {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 3px 12px;
    padding-right: 16px;
  }

  .panel[data-span="column"] .panel-head:has(.panel-meta) .panel-titles {
    display: contents;
  }

  .panel[data-span="column"] .panel-head:has(.panel-meta) .panel-eyebrow,
  .panel[data-span="column"] .panel-head:has(.panel-meta) .panel-title-row {
    grid-column: 1 / -1;
    padding-right: calc(var(--corner-edge) + var(--corner-size) + var(--corner-extra));
  }

  .panel[data-span="column"] .panel-head:has(.panel-meta):has(.panel-back) .panel-eyebrow,
  .panel[data-span="column"] .panel-head:has(.panel-meta):has(.panel-back) .panel-title-row {
    padding-right: calc(var(--corner-edge) + (2 * var(--corner-size)) + var(--corner-gap) + var(--corner-extra));
  }

  .panel[data-span="column"] .panel-head:has(.panel-meta) .panel-meta {
    grid-column: 1;
  }

  .panel[data-span="column"] .panel-head:has(.panel-meta) .panel-tools {
    grid-column: 2;
    margin-left: 0;
    padding-left: 0;
  }

  .panel[data-span="column"] .panel-head:has(.panel-meta) .panel-close,
  .panel[data-span="column"] .panel-head:has(.panel-meta) .panel-back {
    top: 10px;
    transform: none;
  }

  .panel[data-span="column"] .panel-head:has(.panel-meta) .panel-close:active,
  .panel[data-span="column"] .panel-head:has(.panel-meta) .panel-back:active {
    transform: scale(0.9);
  }
}

/*
 * A panel with a pager (the world profile) supersedes DF7. Column: the width switch sits on the
 * first row of the tools, the pager on the second. Half and full keep one row: pager, then the
 * switch. Close stays in the corner. A header with no pager keeps DF7.
 */
@media (min-width: 600px) {
  .panel[data-span="column"] .panel-head:has(.panel-pager) {
    display: flex;
    flex-wrap: nowrap;
    align-items: flex-start;
    padding-right: calc(var(--corner-edge) + var(--corner-size) + var(--corner-extra));
  }

  .panel[data-span="column"] .panel-head:has(.panel-pager):has(.panel-back) {
    padding-right: calc(var(--corner-edge) + (2 * var(--corner-size)) + var(--corner-gap) + var(--corner-extra));
  }

  .panel[data-span="column"] .panel-head:has(.panel-pager) .panel-titles {
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
  }

  .panel[data-span="column"] .panel-head:has(.panel-pager) .panel-eyebrow,
  .panel[data-span="column"] .panel-head:has(.panel-pager) .panel-title-row {
    grid-column: auto;
  }

  .panel[data-span="column"] .panel-head:has(.panel-pager) .panel-tools:has(.panel-pager) {
    flex-direction: column;
    align-items: flex-end;
  }

  .panel[data-span="column"] .panel-head:has(.panel-pager) .panel-pager {
    order: 1;
  }

  .panel[data-span="column"] .panel-head:has(.panel-pager) .panel-spans {
    order: 0;
  }
}

.panel-pager {
  display: flex;
  align-items: center;
  gap: var(--sp-1);
}

.panel-close:hover,
.panel-back:hover {
  background: var(--wash-faint);
  color: var(--signal);
}

.panel-close:active,
.panel-back:active {
  transform: translateY(-50%) scale(0.9);
}

.panel-grab {
  display: none;
}

.panel-grab-bar {
  width: 36px;
  height: 4px;
  border-radius: var(--r-pill);
  background: var(--line-1);
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

/* Below 600 px the pane is a bottom sheet. Above that, the side pane is unchanged. */
@media (max-width: 599px) {
  .panel {
    top: auto;
    left: 0;
    right: 0;
    height: 50%;
    padding: 0;
    transform: translateY(100%);
  }

  .panel.is-open {
    transform: translateY(0);
  }

  .panel.is-open.is-sheet-full {
    top: 0;
    height: auto;
  }

  .panel.is-open .panel-card,
  .panel.is-open[data-span] .panel-card {
    width: 100%;
    height: 100%;
    border-bottom-left-radius: 0;
    border-bottom-right-radius: 0;
  }

  .panel.is-open.is-sheet-full .panel-card {
    border-radius: 0;
  }

  .panel-spans {
    display: none;
  }

  .panel.is-open .panel-grab {
    display: grid;
    place-items: center;
    flex: 0 0 auto;
    width: 100%;
    height: 32px;
    margin: 0;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--signal-dim);
    cursor: grab;
  }

  /* A thumb's size on the sheet (DU4): the close and back buttons are 44 px square. */
  .panel-head {
    --corner-size: 44px;
  }

  .panel-grab:active {
    cursor: grabbing;
  }

  /* The date sits under the search, still above the sheet. Wider windows keep it hidden. */
  .app .stardate {
    display: inline-flex;
    z-index: 6;
    top: calc(var(--chrome-top) + var(--chrome-height) + 8px);
    left: auto;
    right: var(--chrome-inset);
  }
}

@media (prefers-reduced-motion: reduce) {
  .panel,
  .panel-close,
  .panel-back {
    transition: none;
  }
}
</style>
