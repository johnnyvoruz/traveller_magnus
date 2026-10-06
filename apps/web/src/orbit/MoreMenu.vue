<script setup lang="ts">
/**
 * The time row's overflow ("kebab") menu: the tools that are used now and then, kept out of
 * the row (slice_2_campaign.md K6, Johnny 2026-10-04: the line-up search moves here). The
 * menu lists the tools; choosing one shows it in the same popover, with a way back to the
 * list. Each tool is a slot named by its id and stays mounted, so a search that is running
 * or a result that was found is still there when the menu is opened again.
 */
import { nextTick, ref, watch } from 'vue';
import Icon from '../design/Icon.vue';
import type { FaIconName } from '../design/icons.ts';
import OrbitPopover from './OrbitPopover.vue';

export type MoreItem = { id: string; label: string; icon: FaIconName; note: string };

const props = defineProps<{
    open: boolean;
    items: MoreItem[];
}>();

const emit = defineEmits<{ pop: [open: boolean] }>();

/** The tool shown, or '' for the list. It is kept while the menu is shut. */
const shown = ref('');
const bodyEl = ref<HTMLElement | null>(null);

function focusFirst(): void {
    void nextTick(() => {
        const el = bodyEl.value;
        const target = el ? el.querySelector<HTMLElement>(shown.value ? '.orbit-more-back' : '.orbit-more-item') : null;
        if (target) target.focus();
    });
}

function choose(id: string): void {
    shown.value = id;
    focusFirst();
}

function back(): void {
    shown.value = '';
    focusFirst();
}

/** Up and Down move through the list, as a menu's keys do. */
function onListKey(event: KeyboardEvent): void {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const el = bodyEl.value;
    if (!el) return;
    const items = [...el.querySelectorAll<HTMLElement>('.orbit-more-item')];
    if (!items.length) return;
    event.preventDefault();
    const at = items.findIndex((item) => item === event.target);
    const step = event.key === 'ArrowDown' ? 1 : -1;
    items[(at + step + items.length) % items.length].focus();
}

watch(() => props.open, (open) => { if (open) focusFirst(); });
watch(() => props.items.map((item) => item.id).join(' '), () => {
    if (shown.value && !props.items.some((item) => item.id === shown.value)) shown.value = '';
});
</script>

<template>
  <OrbitPopover
    id="orbit-more"
    :open="open"
    icon="ellipsis-vertical"
    label="More tools"
    :show-label="false"
    title="More tools"
    @toggle="emit('pop', !open)"
    @close="emit('pop', false)"
  >
    <div ref="bodyEl" class="orbit-more">
      <div v-show="!shown" class="orbit-more-list" role="menu" aria-label="More tools" @keydown="onListKey">
        <button
          v-for="item in items"
          :key="item.id"
          type="button"
          class="orbit-more-item"
          role="menuitem"
          :data-command="'orbit-' + item.id"
          @click="choose(item.id)"
        >
          <Icon :name="item.icon" :size="14" />
          <span class="orbit-more-text">
            <b>{{ item.label }}</b>
            <small>{{ item.note }}</small>
          </span>
          <Icon name="chevron-right" :size="11" />
        </button>
        <p v-if="!items.length" class="orbit-pop-note">Nothing here for this system.</p>
      </div>
      <div v-for="item in items" v-show="shown === item.id" :key="item.id" class="orbit-more-tool">
        <button type="button" class="orbit-more-back" @click="back">
          <Icon name="chevron-left" :size="11" />More tools
        </button>
        <h3 class="orbit-more-title">{{ item.label }}</h3>
        <slot :name="item.id" />
      </div>
    </div>
  </OrbitPopover>
</template>

<style>
.orbit-more {
  width: min(320px, 70vw);
}

.orbit-more-list {
  display: grid;
  gap: 2px;
  margin: -4px -6px;
}

.orbit-more-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  margin: 0;
  padding: 8px;
  border: 0;
  border-radius: var(--r-2);
  background: transparent;
  color: var(--text-1);
  font: 400 13px/1.35 var(--font-text);
  text-align: left;
  cursor: pointer;
}

.orbit-more-item:hover,
.orbit-more-item:focus-visible {
  background: var(--row-active);
}

.orbit-more-item .ui-icon {
  color: var(--signal);
}

.orbit-more-item .ui-icon:last-child {
  color: var(--text-muted);
}

.orbit-more-text {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-width: 0;
}

.orbit-more-text b {
  font-weight: 600;
}

.orbit-more-text small {
  color: var(--text-muted);
  font-size: 12px;
}

.orbit-more-back {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 8px -4px;
  padding: 2px 6px 2px 4px;
  border: 0;
  border-radius: var(--r-1);
  background: transparent;
  color: var(--signal);
  font: 600 12px/1.4 var(--font-text);
  cursor: pointer;
}

.orbit-more-back:hover {
  background: var(--row-active);
}

.orbit-more-title {
  margin: 0 0 6px;
  color: var(--text-0);
  font: 700 13px/1.4 var(--font-text);
}

/* A tool's rows: a checkbox with its words, a slider with its label. */
.orbit-pop-check,
.orbit-pop-range {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 6px 0;
  color: var(--text-1);
  font: 400 13px/1.4 var(--font-text);
}

.orbit-pop-check input {
  margin: 0;
  accent-color: var(--signal);
}

.orbit-pop-range span {
  flex: 0 0 auto;
}

.orbit-pop-range .orbit-jog {
  flex: 1 1 auto;
  min-width: 120px;
}
</style>
