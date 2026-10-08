<script setup lang="ts">
/**
 * One section of an official sheet (the ship's, the character's): a chamfered panel under
 * its cyan tab. The tab is the section's switch, the whole width of the panel; folded, the
 * panel is the tab's bar alone, with the count of boxes filled in. The fold is a reveal
 * (height and opacity together over --t-base), none under reduced motion. It holds no
 * state: the sheet says whether it is open.
 */
import Icon from '../design/Icon.vue';

defineProps<{
    name: string;
    open: boolean;
    /** How many of its boxes hold a value: shown on the bar while it is folded. */
    count?: number;
}>();

defineEmits<{ toggle: [] }>();
</script>

<template>
  <section class="sheet-panel" :class="{ 'is-closed': !open }" :aria-label="name">
    <h4 class="sheet-tab-row">
      <button type="button" class="sheet-tab" :aria-expanded="open ? 'true' : 'false'" :title="(open ? 'Collapse ' : 'Expand ') + name" @click="$emit('toggle')">
        <span class="sheet-tab-chip"><Icon name="caret-down" :size="10" /><span>{{ name }}</span></span>
        <em v-if="!open && count">{{ count }}</em>
      </button>
    </h4>
    <div class="sheet-fold" :class="{ 'is-open': open }" :inert="!open">
      <div class="sheet-fold-in">
        <div class="sheet-body">
          <slot />
        </div>
      </div>
    </div>
  </section>
</template>

<style>
/* A panel with chamfered corners, and its cyan tab at the top left. Folded, it is the tab's bar alone, the full panel width. */
.sheet-panel {
  position: relative;
  padding: 0;
  background: var(--panel-raised);
  clip-path: polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px);
}

.sheet-tab-row {
  margin: 0;
}

/* The tab is the section's switch, the whole width of the panel: pressed, the section folds or opens; the caret says which. */
.sheet-tab {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  margin: 0;
  padding: 0 12px 0 0;
  border: 0;
  background: transparent;
  color: var(--on-signal);
  font: 700 11px/1.5 var(--font-text);
  letter-spacing: 0.08em;
  text-align: left;
  text-transform: uppercase;
  cursor: pointer;
}

.sheet-tab-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 4px 16px 4px 12px;
  background: var(--signal);
  clip-path: polygon(0 0, 100% 0, calc(100% - 8px) 100%, 0 100%);
}

.sheet-tab .ui-icon {
  transition: transform var(--t-base) var(--ease-out);
}

.sheet-panel.is-closed .sheet-tab .ui-icon {
  transform: rotate(-90deg);
}

.sheet-tab em {
  padding: 0 7px;
  border-radius: var(--r-pill);
  background: var(--signal);
  color: var(--on-signal);
  font: 700 10px/1.6 var(--font-code);
  font-style: normal;
  letter-spacing: 0;
}

.sheet-tab:hover .sheet-tab-chip,
.sheet-tab:focus-visible .sheet-tab-chip {
  background: var(--signal-bright);
}

.sheet-tab:focus-visible {
  outline-offset: -2px;
}

/* The fold: the body's height and opacity run together over --t-base, a reveal, never a snap. */
.sheet-fold {
  display: grid;
  grid-template-rows: 0fr;
  opacity: 0;
  transition: grid-template-rows var(--t-base) var(--ease-out), opacity var(--t-base) var(--ease-out);
}

.sheet-fold.is-open {
  grid-template-rows: 1fr;
  opacity: 1;
}

.sheet-fold-in {
  min-height: 0;
  overflow: hidden;
}

@media (prefers-reduced-motion: reduce) {
  .sheet-tab .ui-icon,
  .sheet-fold {
    transition: none;
  }
}

.sheet-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px 12px;
}

/* ---- What both sheets' sections hold: rows of labelled boxes, value tags, tables. (Moved here from ShipSheet.vue so a person's page has them without the ship sheet's code.) ---- */
/* The sheet reads as part of the panel: its panels stack with no frame of their own. */
.sheet-frame {
  display: flex;
  flex-direction: column;
  gap: 10px;
}


.sheet-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 14px;
}

.sheet-field {
  display: flex;
  flex: 1 1 200px;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.sheet-field.is-tall {
  flex: 1 1 100%;
  flex-direction: column;
  align-items: stretch;
  gap: 4px;
}

.sheet-label {
  flex: 1 1 auto;
  min-width: 0;
  color: var(--text-1);
  font: 500 12.5px/1.4 var(--font-text);
}

.sheet-input {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  margin: 0;
  padding: 4px 8px;
  border: 1px solid var(--line-2);
  border-radius: var(--r-1);
  background: var(--bg-2);
  color: var(--text-0);
  font: 500 13px/1.4 var(--font-text);
}

.sheet-input:focus-visible {
  outline: none;
  border-color: var(--signal);
  box-shadow: 0 0 0 2px var(--signal-glow);
}

.sheet-input:disabled {
  opacity: 0.6;
}

/* A value tag: rust-red, the number of the thing. */
/* (In a SheetBox the frame takes the tag's room and the input fills it.) */
.sbox .sheet-input.is-tag {
  flex: 1 1 auto;
  width: 100%;
}

.sheet-field .sheet-input.is-tag,
.sbox .sheet-input.is-tag {
  flex: 0 1 150px;
  width: auto;
  border-color: var(--sheet-rust-line);
  background: var(--sheet-rust);
  color: var(--text-0);
  font: 700 13px/1.4 var(--font-code);
  font-variant-numeric: var(--tabular);
  clip-path: polygon(6px 0, 100% 0, calc(100% - 6px) 100%, 0 100%);
}

.sbox .sheet-input.is-tag {
  flex: 1 1 auto;
  width: 100%;
}

.sheet-field .sheet-input.is-tag::placeholder {
  color: var(--text-0);
}

.sheet-input.is-tall {
  resize: vertical;
  font-family: var(--font-text);
}

.sheet-tick {
  width: 16px;
  height: 16px;
  margin: 0;
  accent-color: var(--signal);
}

/* Tables: a numbered series across the page; the critical hits as ticks. A table is the column's width, and wider only when its cells cannot fit; only then does it scroll. */
.sheet-table-wrap {
  overflow-x: auto;
}

.sheet-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  margin: 0;
}

.sheet-table.is-ticks {
  width: auto;
}

.sheet-table th + th,
.sheet-table th + td,
.sheet-table td + td {
  padding-left: 4px;
}

.sheet-table tbody th,
.sheet-table tbody td {
  padding-bottom: 3px;
}

.sheet-th {
  padding: 2px 0;
  color: var(--text-muted);
  font: 700 10.5px/1.4 var(--font-text);
  letter-spacing: 0.06em;
  text-align: left;
  text-transform: uppercase;
  white-space: nowrap;
}

/* The row's key column stays while the table scrolls sideways, so the row keeps its context. */
.sheet-th.is-row {
  position: sticky;
  left: 0;
  z-index: 1;
  background: var(--panel-raised);
  color: var(--text-1);
  font-variant-numeric: var(--tabular);
}

.sheet-table tbody .sheet-th.is-row {
  padding-right: 8px;
}

.sheet-table td {
  min-width: 72px;
}

.sheet-table.is-ticks td {
  min-width: 0;
  padding-left: 4px;
  text-align: center;
}

.sheet-table .sheet-input {
  padding: 3px 7px;
  font-size: 12.5px;
}
</style>
