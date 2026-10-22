<script setup lang="ts">
/**
 * The Campaign panel's menu, the referee's (SI3): Copy for your AI, and Proposals with the count
 * still waiting. A dot on the button says proposals are waiting; the count is read when the
 * campaign opens (the owner's poll page will carry it once B's BP2 is in).
 */
import { nextTick, onMounted, ref, watch } from 'vue';
import Icon from '../../design/Icon.vue';
import { loadBatches, proposals } from '../../campaign/proposals.ts';
import { campaign } from '../../campaign/store.ts';
import CopyForAi from './CopyForAi.vue';

const emit = defineEmits<{ proposals: [] }>();

const open = ref(false);
const copying = ref(false);
const menu = ref<HTMLElement | null>(null);
const button = ref<HTMLElement | null>(null);

/** The count for the dot: the open batches' counts, read once a campaign is open. */
function readCount(): void {
    if (campaign.universeId) void loadBatches('open');
}

onMounted(readCount);
watch(() => campaign.universeId, readCount);

function toggle(): void {
    open.value = !open.value;
    if (open.value) void nextTick(() => {
        const item = menu.value ? menu.value.querySelector<HTMLElement>('[role="menuitem"]') : null;
        if (item) item.focus();
    });
}

function pick(what: 'copy' | 'proposals'): void {
    open.value = false;
    if (what === 'copy') copying.value = true;
    else emit('proposals');
}

function onMenuKey(event: KeyboardEvent): void {
    const items = menu.value ? Array.from(menu.value.querySelectorAll<HTMLElement>('[role="menuitem"]')) : [];
    const at = items.indexOf(event.target as HTMLElement);
    if (event.key === 'Escape' || event.key === 'Tab') {
        if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
        }
        open.value = false;
        if (event.key === 'Escape' && button.value) button.value.focus();
        return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    event.stopPropagation();
    const next = items[(at + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length];
    if (next) next.focus();
}
</script>

<template>
  <div class="camp-menu">
    <button
      ref="button"
      type="button"
      class="camp-menu-btn"
      :aria-label="proposals.pending ? `Campaign menu, ${proposals.pending} proposals waiting` : 'Campaign menu'"
      title="Campaign menu"
      aria-haspopup="true"
      :aria-expanded="open ? 'true' : 'false'"
      data-campaign-menu
      @click="toggle"
    >
      <Icon name="ellipsis-vertical" :size="14" />
      <span v-if="proposals.pending" class="camp-menu-dot" aria-hidden="true"></span>
    </button>
    <div v-if="open" class="camp-add-backdrop" @click="open = false"></div>
    <div v-if="open" ref="menu" class="camp-add-menu" role="menu" aria-label="Campaign" @keydown="onMenuKey">
      <button type="button" role="menuitem" data-menu-copy @click="pick('copy')">
        <Icon name="file-export" :size="14" /><span>Copy for your AI</span>
      </button>
      <button type="button" role="menuitem" data-menu-proposals @click="pick('proposals')">
        <Icon name="wand-magic-sparkles" :size="14" /><span>Proposals</span>
        <b v-if="proposals.pending" class="camp-menu-count">{{ proposals.pending }}</b>
      </button>
    </div>
    <CopyForAi v-if="copying" @close="copying = false" />
  </div>
</template>

<style>
.camp-menu {
  position: relative;
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  margin-left: auto;
}

.camp-menu-btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: var(--r-2);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition: color var(--t-fast) var(--ease-out), border-color var(--t-fast) var(--ease-out);
}

.camp-menu-btn:hover,
.camp-menu-btn[aria-expanded="true"] {
  border-color: var(--control-line);
  color: var(--signal);
}

.camp-menu-dot {
  position: absolute;
  top: 4px;
  right: 5px;
  width: 7px;
  height: 7px;
  border-radius: var(--r-pill);
  background: var(--signal);
  box-shadow: 0 0 0 2px var(--bg-1);
}

.camp-menu .camp-add-menu {
  min-width: 210px;
}

.camp-menu-count {
  margin-left: auto;
  padding: 0 7px;
  border-radius: var(--r-pill);
  background: var(--wash);
  color: var(--signal);
  font: 600 12px/1.6 var(--font-text);
  font-variant-numeric: var(--tabular);
}

@media (pointer: coarse) {
  .camp-menu-btn {
    width: 44px;
    height: 44px;
  }
}
</style>
