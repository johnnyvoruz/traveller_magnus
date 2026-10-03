<script setup lang="ts">
/**
 * One clickable body: glyph, name over a detail line, then the UWP or a mainworld tag
 * (js/system_inspector.js bodyRow, style.css .atlas-body-row). The parent listens for the click.
 */
import { computed } from 'vue';
import BodyGlyph from './BodyGlyph.vue';
import type { BodyGlyphData } from './model.ts';

const props = withDefaults(defineProps<{
    bodyKey: string;
    name: string;
    facts: string[];
    glyph: BodyGlyphData;
    tag?: string;
    uwp?: string;
    moon?: boolean;
}>(), { tag: '', uwp: '', moon: false });

const lead = computed(() => props.facts[0] || '');
const mainworld = computed(() => props.tag !== '' || lead.value.startsWith('Mainworld'));
</script>

<template>
  <button type="button" class="doss-row" :class="{ 'is-moon': moon, 'is-mainworld': mainworld }">
    <BodyGlyph :glyph="glyph" :mainworld="mainworld" :size="moon ? 18 : 22" />
    <span class="doss-row-text">
      <span class="doss-row-name">{{ name }}</span>
      <small v-if="facts.length">
        <span>{{ lead }}</span><span v-if="facts.length > 1" class="doss-extra"> · {{ facts.slice(1).join(' · ') }}</span>
      </small>
    </span>
    <span v-if="tag" class="ui-tag">{{ tag }}</span>
    <span v-else-if="uwp" class="doss-row-uwp">{{ uwp }}</span>
  </button>
</template>

<style>
.doss-row {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  margin: 0 0 4px;
  padding: 7px 10px;
  border: 1px solid transparent;
  border-radius: var(--r-2);
  background: transparent;
  color: var(--text-1);
  font: 400 14px/1.55 var(--font-text);
  text-align: left;
  cursor: pointer;
  transition: border-color var(--t-fast) var(--ease-out), background var(--t-fast) var(--ease-out);
}

.doss-row:hover {
  border-color: var(--line-1);
  background: var(--panel-raised);
}

.doss-row:focus-visible {
  outline-offset: -2px;
}

.doss-row.is-mainworld {
  border-color: var(--signal-edge);
  background: var(--wash-faint);
}

.doss-row.is-mainworld:hover {
  border-color: var(--signal);
}

/*
 * A rule above every top-level body, as the stat rows have: the first under the heading in
 * the list colour, the rest soft. A world and its moons sit between two rules as one group.
 */
.doss-row:not(.is-moon) {
  margin-top: 9px;
}

.doss-row:not(.is-moon)::before {
  content: '';
  position: absolute;
  left: -1px;
  right: -1px;
  top: -6px;
  height: 1px;
  background: var(--line-soft);
}

.ui-heading + .doss-row:not(.is-moon) {
  margin-top: 5px;
}

.ui-heading + .doss-row:not(.is-moon)::before {
  background: var(--line-1);
}

/* The list closes with a rule, like a stat list. */
.doss-row:last-child {
  margin-bottom: 9px;
}

.doss-row:last-child::after {
  content: '';
  position: absolute;
  left: -1px;
  right: -1px;
  bottom: -6px;
  height: 1px;
  background: var(--line-soft);
}

.doss-row.is-moon:last-child::after {
  left: -33px;
}

/* Moons hang off their world: indented, with one rule down the left of the group. */
.doss-row.is-moon {
  width: calc(100% - 32px);
  margin-left: 32px;
  padding-block: 5px;
}

.doss-row.is-moon::before {
  content: '';
  position: absolute;
  left: -12px;
  top: -5px;
  bottom: -1px;
  width: 1px;
  background: var(--line-soft);
}

.doss-row-text {
  display: grid;
  flex: 1 1 auto;
  min-width: 0;
  gap: 1px;
}

.doss-row-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
}

.doss-row small {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-muted);
  font-size: 11.5px;
  font-variant-numeric: var(--tabular);
}

.doss-row-uwp {
  flex: 0 0 auto;
  color: var(--text-muted);
  font: 400 12px/1 var(--font-code);
  letter-spacing: 0.06em;
}

.doss[data-span="half"] .doss-extra,
.doss-body[data-span="half"] .doss-extra {
  display: none;
}

@media (prefers-reduced-motion: reduce) {
  .doss-row {
    transition: none;
  }
}
</style>
