<script setup lang="ts">
/**
 * The layout choice at the picture's upper left (showpiece D2; follow-up 3): a split button
 * whose face shows the layout in use and whose arrow opens the three; 1, 2 and 3 from the
 * keyboard as before. Each choice names its command.
 */
import { nextTick, ref, watch } from 'vue';
import Icon from '../design/Icon.vue';
import type { FaIconName } from '../design/icons.ts';
import { LAYOUTS } from './commands.ts';
import type { Mode } from './picture.ts';

const props = defineProps<{ mode: Mode }>();
const emit = defineEmits<{ mode: [mode: Mode] }>();

const open = ref(false);
const arrow = ref<HTMLElement | null>(null);
const menu = ref<HTMLElement | null>(null);

const ICONS: Record<Mode, FaIconName> = { orbits: 'bullseye', row: 'grip-lines-vertical', column: 'grip-lines' };
const TITLES: Record<Mode, string> = {
    orbits: 'Bodies at their orbital positions',
    row: 'The planets in a row, star at the left, in orbit order',
    column: 'The planets in a column, star at the top, in orbit order',
};

function current() {
    return LAYOUTS.find((item) => item.mode === props.mode) ?? LAYOUTS[0];
}

function toggle(): void {
    open.value = !open.value;
    if (open.value) void nextTick(() => {
        const el = menu.value ? menu.value.querySelector<HTMLElement>('[aria-checked="true"]') : null;
        if (el) el.focus();
    });
}

function close(back = true): void {
    if (!open.value) return;
    open.value = false;
    if (back && arrow.value) arrow.value.focus();
}

function choose(mode: Mode): void {
    emit('mode', mode);
    close();
}

function onMenuKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close();
        return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const items = menu.value ? Array.from(menu.value.querySelectorAll<HTMLElement>('[role="radio"]')) : [];
    const at = items.indexOf(event.target as HTMLElement);
    if (at < 0) return;
    event.preventDefault();
    event.stopPropagation();
    items[(at + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus();
}

watch(() => props.mode, () => { close(false); });
</script>

<template>
  <div class="orbit-corner" :class="{ 'is-open': open }">
    <button
      type="button"
      class="orbit-corner-face"
      :data-command="current().id"
      :title="TITLES[mode] + ' (' + current().key + '); the arrow opens the three'"
      @click="toggle"
    >
      <Icon :name="ICONS[mode]" :size="11" /><span>{{ current().label }}</span>
    </button>
    <button
      ref="arrow"
      type="button"
      class="orbit-corner-arrow"
      aria-haspopup="true"
      :aria-expanded="open ? 'true' : 'false'"
      aria-label="Choose the layout"
      title="Orbits, Row or Column (1, 2, 3)"
      @click="toggle"
    >
      <Icon name="caret-down" :size="11" />
    </button>
    <div v-if="open" class="orbit-pop-backdrop" @click="close(false)"></div>
    <div v-if="open" ref="menu" class="orbit-corner-menu" role="radiogroup" aria-label="Layout" @keydown="onMenuKey">
      <button
        v-for="item in LAYOUTS"
        :key="item.mode"
        type="button"
        role="radio"
        :data-command="item.id"
        :aria-checked="mode === item.mode ? 'true' : 'false'"
        :title="TITLES[item.mode] + ' (' + item.key + ')'"
        @click="choose(item.mode)"
      >
        <Icon :name="ICONS[item.mode]" :size="11" /><span>{{ item.label }}</span><kbd>{{ item.key }}</kbd>
      </button>
    </div>
  </div>
</template>

<style>
.orbit-corner {
  position: absolute;
  left: 14px;
  top: 14px;
  z-index: 3;
  display: inline-flex;
  border: 1px solid var(--signal-dim);
  border-radius: var(--r-3);
  background: var(--chrome-glass);
}

.orbit-corner-face,
.orbit-corner-arrow {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  margin: 0;
  padding: 0 11px;
  border: 0;
  background: transparent;
  color: var(--signal);
  font: 600 12.5px/1 var(--font-text);
  cursor: pointer;
}

.orbit-corner-face {
  border-radius: var(--r-3) 0 0 var(--r-3);
}

.orbit-corner-arrow {
  padding: 0 8px;
  border-left: 1px solid var(--line-1);
  border-radius: 0 var(--r-3) var(--r-3) 0;
  color: var(--text-muted);
}

.orbit-corner-face:hover,
.orbit-corner-arrow:hover,
.orbit-corner.is-open .orbit-corner-arrow {
  background: var(--row-active);
  color: var(--signal);
}

.orbit-corner-face:focus-visible,
.orbit-corner-arrow:focus-visible {
  outline-offset: -2px;
}

.orbit-corner-menu {
  position: absolute;
  left: 0;
  top: calc(100% + 6px);
  z-index: 7;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 170px;
  padding: 6px;
  border: 1px solid var(--signal-dim);
  border-radius: var(--r-3);
  background: var(--chrome-bg);
  box-shadow: var(--shadow-pop);
}

.orbit-corner-menu button {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  padding: 7px 10px;
  border: 0;
  border-radius: var(--r-2);
  background: transparent;
  color: var(--text-1);
  font: 500 13px/1.3 var(--font-text);
  text-align: left;
  cursor: pointer;
}

.orbit-corner-menu button .ui-icon {
  color: var(--signal);
}

.orbit-corner-menu button span {
  flex: 1 1 auto;
}

.orbit-corner-menu button kbd {
  color: var(--text-muted);
  font: 600 11px/1 var(--font-code);
}

.orbit-corner-menu button:hover,
.orbit-corner-menu button:focus-visible {
  background: var(--row-active);
}

.orbit-corner-menu button[aria-checked="true"] {
  color: var(--signal);
}

.orbit-corner-menu button:focus-visible {
  outline-offset: -2px;
}
</style>
