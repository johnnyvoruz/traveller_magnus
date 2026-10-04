<script setup lang="ts">
/**
 * The docked body card (legacy .sv-tip-docked, style.css:2590-2604): parked at the stage's
 * top left so it never covers the body it describes, with bracket corners. It shows the body
 * under the pointer, or the selected body when nothing is hovered. Contents are orbit/card.ts.
 */
import { ref, watch } from 'vue';
import Icon from '../design/Icon.vue';
import type { BodyCardModel } from './card.ts';

const props = defineProps<{
    model: BodyCardModel;
    /** Changes when the card moves to another body: the dock animation runs again. */
    bodyKey: string;
}>();

const helpOpen = ref(false);
watch(() => props.bodyKey, () => { helpOpen.value = false; });
</script>

<template>
  <aside :key="bodyKey" class="orbit-body-card" aria-label="Body under the pointer">
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
        <span>{{ model.season.text }}</span>
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
.orbit-body-card {
  position: absolute;
  top: 18px;
  left: 18px;
  z-index: 2;
  width: max-content;
  min-width: 200px;
  max-width: min(310px, calc(100% - 36px));
  padding: 10px 12px;
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
