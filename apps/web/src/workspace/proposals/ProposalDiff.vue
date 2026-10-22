<script setup lang="ts">
/**
 * A proposal's fields beside what is stored now (SI3). A change shows Now and Proposed; an
 * append shows what it adds after the count already there; a new record shows its fields.
 */
import type { DiffRow } from './proposal_words.ts';

defineProps<{ rows: readonly DiffRow[] }>();
</script>

<template>
  <dl v-if="rows.length" class="pdiff">
    <div v-for="(row, i) in rows" :key="i" class="pdiff-row" :data-how="row.how">
      <dt>{{ row.label }}<span v-if="row.how === 'add'" class="pdiff-how">adds</span></dt>
      <dd>
        <p v-if="row.before !== null && row.how === 'set'" class="pdiff-before"><span class="pdiff-tag">Now</span>{{ row.before || 'Empty' }}</p>
        <p v-else-if="row.before !== null && row.how === 'add'" class="pdiff-before pdiff-count">{{ row.before }}</p>
        <p class="pdiff-after"><span v-if="row.how === 'set'" class="pdiff-tag is-new">Proposed</span>{{ row.after }}</p>
      </dd>
    </div>
  </dl>
</template>

<style>
.pdiff {
  display: grid;
  gap: 6px;
  margin: 8px 0 0;
}

.pdiff-row {
  display: grid;
  grid-template-columns: 84px minmax(0, 1fr);
  gap: 2px 10px;
}

.pdiff-row dt {
  color: var(--text-muted);
  font: 500 12px/1.5 var(--font-text);
}

.pdiff-how {
  display: block;
  color: var(--signal-dim);
  font-size: 11px;
}

.pdiff-row dd {
  min-width: 0;
  margin: 0;
}

.pdiff-before,
.pdiff-after {
  margin: 0;
  overflow-wrap: anywhere;
  white-space: pre-line;
  font: 400 13px/1.45 var(--font-text);
}

.pdiff-before {
  color: var(--text-muted);
  text-decoration: line-through;
  text-decoration-color: var(--line-2);
}

.pdiff-count {
  text-decoration: none;
  font-size: 12px;
}

.pdiff-after {
  color: var(--text-0);
}

.pdiff-tag {
  display: inline-block;
  margin-right: 6px;
  padding: 0 5px;
  border-radius: var(--r-1);
  background: var(--neutral-wash);
  color: var(--text-muted);
  font: 600 10.5px/1.6 var(--font-text);
  text-decoration: none;
  vertical-align: 1px;
}

.pdiff-tag.is-new {
  background: var(--wash);
  color: var(--signal);
}

@media (max-width: 520px) {
  .pdiff-row {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
