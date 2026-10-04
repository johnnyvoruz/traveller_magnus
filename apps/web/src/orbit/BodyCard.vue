<script setup lang="ts">
/**
 * A docked body card (legacy .sv-tip-docked, style.css:2590-2604): parked at the stage's
 * top left so it never covers the body it describes, with bracket corners. The stage stacks
 * up to two in `.orbit-cards`: the selected body's card, which stays put, and under it the
 * card of another body under the pointer. Contents are orbit/card.ts.
 */
import { ref, watch } from 'vue';
import Icon from '../design/Icon.vue';
import type { BodyCardModel } from './card.ts';

const props = defineProps<{
    model: BodyCardModel;
    /** The body shown. A pinned card docks again when it changes; a hover card just changes its words. */
    bodyKey: string;
    /** The card is pinned to the selected body, so it can be closed; a hover card goes when the pointer leaves. */
    closable: boolean;
    /** The card sits under the pinned one: quieter, and no bracket corners. */
    under?: boolean;
}>();

defineEmits<{ close: [] }>();

const helpOpen = ref(false);
watch(() => props.bodyKey, () => { helpOpen.value = false; });
</script>

<template>
  <aside
    :key="closable ? bodyKey : 'hover'"
    class="orbit-body-card"
    :class="{ 'is-closable': closable, 'is-under': under }"
    :aria-label="closable ? 'Selected body' : 'Body under the pointer'"
  >
    <button v-if="closable" type="button" class="orbit-body-card-close" title="Close this card" aria-label="Close this card" @click="$emit('close')">
      <Icon name="xmark" :size="12" />
    </button>
    <h2 class="orbit-body-card-title">
      {{ model.title }}
      <span v-if="model.sub" class="orbit-body-card-sub">({{ model.sub }})</span>
    </h2>
    <dl class="orbit-body-card-lines">
      <div v-for="line in model.lines" :key="line.label" :class="{ 'has-gap': line.gap }" :title="line.hint || undefined">
        <dt>{{ line.label }}</dt>
        <dd :class="{ 'is-strong': line.strong }">{{ line.value }}</dd>
      </div>
    </dl>
    <div v-if="model.season" class="orbit-body-card-season">
      <p class="orbit-season-text">
        <span class="orbit-season-lines">
          <span v-for="line in model.season.lines" :key="line">{{ line }}</span>
        </span>
        <button
          type="button"
          class="orbit-season-help"
          :aria-expanded="helpOpen"
          aria-label="How seasons are measured"
          :title="model.seasonHelp"
          @click="helpOpen = !helpOpen"
        >
          <Icon name="circle-question" :size="13" />
        </button>
      </p>
      <p v-if="model.season.orbit" class="orbit-season-orbit">{{ model.season.orbit }}</p>
      <p v-if="helpOpen" class="orbit-season-note">
        {{ model.seasonHelp }}
        <span v-if="model.season.inputs" class="orbit-season-inputs">{{ model.season.inputs }}</span>
      </p>
    </div>
  </aside>
</template>

<style>
/* The stack at the stage's top left: the pinned card, and a hover card under it. */
.orbit-cards {
  position: absolute;
  top: 18px;
  left: 18px;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
  width: max-content;
  max-width: min(310px, calc(100% - 36px));
  max-height: calc(100% - 36px);
  pointer-events: none;
}

.orbit-body-card {
  position: relative;
  flex: 0 0 auto;
  box-sizing: border-box;
  min-width: 200px;
  max-width: 100%;
  padding: 10px 12px;
  pointer-events: auto;
  border: 1px solid var(--signal-line);
  border-radius: var(--r-2);
  background: var(--chrome-glass);
  box-shadow: 0 0 24px var(--wash), 0 0 0 1px var(--wash-faint);
  color: var(--text-1);
  font: 400 12px/1.5 var(--font-text);
  animation: orbit-card-dock var(--t-rail) ease-out;
}

/* The bracket corners. */
.orbit-body-card::before,
.orbit-body-card::after {
  content: '';
  position: absolute;
  width: 22px;
  height: 22px;
  border: 0 solid var(--signal);
  pointer-events: none;
}

.orbit-body-card::before {
  top: -1px;
  left: -1px;
  border-top-width: 2px;
  border-left-width: 2px;
}

.orbit-body-card::after {
  right: -1px;
  bottom: -1px;
  border-right-width: 2px;
  border-bottom-width: 2px;
}

/* The hover card under a pinned one: no brackets, a quieter edge, and it gives way when the stage is short. */
.orbit-body-card.is-under {
  flex: 0 1 auto;
  min-height: 0;
  overflow: hidden;
  border-color: var(--line-2);
  box-shadow: var(--shadow-chrome);
  pointer-events: none;
  animation-name: orbit-card-rise;
  animation-duration: var(--t-fast);
}

.orbit-body-card.is-under::before,
.orbit-body-card.is-under::after {
  display: none;
}

.orbit-body-card.is-under .orbit-season-help {
  display: none;
}

@keyframes orbit-card-rise {
  from {
    opacity: 0;
    transform: translateY(-6px);
  }

  to {
    opacity: 1;
    transform: none;
  }
}

@keyframes orbit-card-dock {
  from {
    opacity: 0;
    transform: translateX(-12px);
  }

  to {
    opacity: 1;
    transform: none;
  }
}

.orbit-body-card.is-closable .orbit-body-card-title {
  padding-right: 22px;
}

.orbit-body-card-close {
  position: absolute;
  top: 6px;
  right: 6px;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: var(--r-2);
  background: none;
  color: var(--text-muted);
  cursor: pointer;
}

.orbit-body-card-close:hover {
  background: var(--surface-2);
  color: var(--signal-bright);
}

.orbit-season-lines span {
  display: block;
}

.orbit-season-lines span + span {
  color: var(--text-1);
}

.orbit-body-card-title {
  margin: 0 0 5px;
  padding-bottom: 4px;
  border-bottom: 1px solid var(--line-1);
  color: var(--signal);
  font: 600 12px/1.5 var(--font-text);
  overflow-wrap: anywhere;
}

.orbit-body-card-sub {
  color: var(--text-muted);
  font-weight: 400;
}

.orbit-body-card-lines {
  margin: 0;
}

.orbit-body-card-lines > div {
  display: flex;
  gap: 6px;
}

.orbit-body-card-lines > div.has-gap {
  margin-top: 4px;
}

.orbit-body-card-lines dt {
  flex: 0 0 auto;
}

.orbit-body-card-lines dt::after {
  content: ':';
}

.orbit-body-card-lines dd {
  margin: 0;
  min-width: 0;
  font-variant-numeric: var(--tabular);
  overflow-wrap: anywhere;
}

.orbit-body-card-lines dd.is-strong {
  color: var(--text-0);
  font-weight: 700;
}

.orbit-body-card-season {
  margin-top: 6px;
  padding-top: 5px;
  border-top: 1px solid var(--line-1);
}

.orbit-body-card-season p {
  margin: 0;
}

.orbit-season-text {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  color: var(--text-0);
}

.orbit-season-help {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 18px;
  margin: 0 0 0 auto;
  padding: 0;
  border: 0;
  border-radius: var(--r-2);
  background: none;
  color: var(--signal);
  cursor: pointer;
}

.orbit-season-help:hover {
  color: var(--signal-bright);
}

.orbit-season-orbit,
.orbit-season-note {
  color: var(--text-muted);
}

.orbit-season-note {
  margin-top: 4px;
}

.orbit-season-inputs {
  display: block;
  margin-top: 2px;
  font-family: var(--font-code);
}

@media (prefers-reduced-motion: reduce) {
  .orbit-body-card {
    animation: none;
  }
}
</style>
