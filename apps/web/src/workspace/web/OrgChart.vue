<script setup lang="ts">
/**
 * The org chart (UX backlog U40; streams/D.md DU40): the campaign's organizations as a tree, beside
 * the relationship web. Organizations that belong to another sit under it, as branches.
 */
import { computed } from 'vue';
import { campaign } from '../../campaign/store.ts';
import OrgBranch from './OrgBranch.vue';
import { orgForest } from './org_tree.ts';

const emit = defineEmits<{ open: [id: string] }>();

const roots = computed(() => orgForest(campaign.records, campaign.links));
</script>

<template>
  <div class="org" data-org-chart>
    <ul v-if="roots.length" class="org-tree" aria-label="Organizations">
      <OrgBranch v-for="node in roots" :key="node.id" :node="node" @open="emit('open', $event)" />
    </ul>
    <p v-else class="org-empty">
      No organizations yet. Add an organization record, then link people to it as members, or as
      its commander, and it appears here.
    </p>
  </div>
</template>

<style>
.org {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
}

.org-tree,
.org-children {
  display: grid;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

/* A branch hangs from its parent on a line down the left, with a tick to each card. */
.org-children {
  margin: 10px 0 0 14px;
  padding-left: 18px;
  border-left: 1px solid var(--line-2);
}

.org-children > .org-item {
  position: relative;
}

.org-children > .org-item::before {
  position: absolute;
  top: 20px;
  left: -18px;
  width: 16px;
  border-top: 1px solid var(--line-2);
  content: '';
}

.org-card {
  display: grid;
  gap: 6px;
  padding: 10px 12px;
  border: 1px solid var(--line-1);
  border-radius: var(--r-3);
  background: var(--bg-1);
}

.org-name {
  display: inline-flex;
  align-items: center;
  justify-self: start;
  gap: 7px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--text-0);
  font: 700 14px/1.3 var(--font-text);
  cursor: pointer;
}

.org-name:hover {
  color: var(--signal);
}

.org-line {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin: 0;
}

.org-line.is-quiet {
  color: var(--text-muted);
  font: 400 12px/1.4 var(--font-text);
}

.org-label {
  min-width: 96px;
  color: var(--text-muted);
  font: 600 11px/1.3 var(--font-text);
}

.org-person {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 26px;
  padding: 0 9px;
  border: 1px solid var(--line-2);
  border-radius: var(--r-pill);
  background: transparent;
  color: var(--text-1);
  font: 600 12px/1 var(--font-text);
  cursor: pointer;
}

.org-person small {
  color: var(--text-muted);
  font-weight: 400;
}

.org-person.is-lead {
  border-color: var(--signal-line);
  color: var(--text-0);
}

.org-person:hover {
  border-color: var(--signal);
}

.org-name:focus-visible,
.org-person:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}

.org-empty {
  margin: 24px 0;
  color: var(--text-muted);
  font: 400 13px/1.5 var(--font-text);
  text-align: center;
}

@media (max-width: 680px) {
  .org-person {
    min-height: 44px;
  }

  .org-label {
    min-width: 0;
    width: 100%;
  }
}
</style>
