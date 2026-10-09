<script setup lang="ts">
/**
 * The build acts as a floating menu: under the bar's More button, and at the pointer on a
 * right-click. The app's one floating menu: on the body, fixed, placed by pop_place.ts.
 * Arrow keys move, Escape closes and gives focus back.
 */
import { nextTick, onMounted, ref } from 'vue';
import Icon from '../../design/Icon.vue';
import type { FaIconName } from '../../design/icons.ts';
import { placePop, type Rect } from '../pop_place.ts';

export type MenuItem = {
    id: string;
    label: string;
    /** A second line saying what the act does. */
    say?: string;
    icon: FaIconName;
    key?: string;
    danger?: boolean;
    disabled?: boolean;
    /** A rule is drawn above this item. */
    rule?: boolean;
};

const props = defineProps<{ title: string; items: MenuItem[]; anchor: Rect }>();
const emit = defineEmits<{ pick: [id: string]; close: [] }>();

const menu = ref<HTMLElement | null>(null);
const at = ref({ left: props.anchor.left, top: props.anchor.bottom });

function buttons(): HTMLElement[] {
    return menu.value ? Array.from(menu.value.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)')) : [];
}

function onKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        emit('close');
        return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    event.stopPropagation();
    const items = buttons();
    const index = items.indexOf(event.target as HTMLElement);
    const next = items[(index + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length];
    if (next) next.focus();
}

onMounted(() => {
    void nextTick(() => {
        const el = menu.value;
        if (!el) return;
        const box = el.getBoundingClientRect();
        const placed = placePop(props.anchor, { width: box.width, height: box.height }, { width: document.documentElement.clientWidth, height: document.documentElement.clientHeight });
        at.value = { left: placed.left, top: placed.top };
        const first = buttons()[0];
        if (first) first.focus();
    });
});
</script>

<template>
  <Teleport to="body">
    <div class="build-menu-back" @click="$emit('close')" @contextmenu.prevent="$emit('close')"></div>
    <div ref="menu" class="build-menu" role="menu" :aria-label="title" :style="{ left: at.left + 'px', top: at.top + 'px' }" @keydown="onKey">
      <p class="build-menu-title">{{ title }}</p>
      <template v-for="item in items" :key="item.id">
        <hr v-if="item.rule" />
        <button type="button" role="menuitem" :class="{ 'is-danger': item.danger }" :disabled="item.disabled" @click="$emit('pick', item.id)">
          <Icon :name="item.icon" :size="13" />
          <span class="build-menu-text">{{ item.label }}<small v-if="item.say">{{ item.say }}</small></span>
          <kbd v-if="item.key">{{ item.key }}</kbd>
        </button>
      </template>
    </div>
  </Teleport>
</template>

<style>
.build-menu-back {
  position: fixed;
  inset: 0;
  z-index: 40;
}

.build-menu {
  position: fixed;
  z-index: 41;
  display: flex;
  flex-direction: column;
  gap: 2px;
  box-sizing: border-box;
  width: 320px;
  max-width: calc(100vw - 16px);
  padding: 6px;
  border: 1px solid var(--signal-dim);
  border-radius: var(--r-3);
  background: var(--chrome-bg);
  box-shadow: var(--shadow-pop);
  color: var(--text-1);
  font: 400 13.5px/1.4 var(--font-text);
}

.build-menu-title {
  margin: 0;
  padding: 5px 10px 3px;
  color: var(--text-muted);
  font: 700 11px/1.4 var(--font-text);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.build-menu hr {
  width: 100%;
  margin: 4px 0;
  border: 0;
  border-top: 1px solid var(--line-1);
}

.build-menu button {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0;
  padding: 7px 10px;
  border: 0;
  border-radius: var(--r-2);
  background: transparent;
  color: var(--text-1);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.build-menu button:hover:not(:disabled),
.build-menu button:focus-visible {
  background: var(--row-active);
}

.build-menu button:focus-visible {
  outline-offset: -2px;
}

.build-menu button:disabled {
  opacity: 0.45;
  cursor: default;
}

.build-menu .ui-icon {
  flex: 0 0 16px;
  color: var(--signal);
}

.build-menu button.is-danger,
.build-menu button.is-danger .ui-icon {
  color: var(--danger);
}

.build-menu-text {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-width: 0;
}

.build-menu-text small {
  color: var(--text-muted);
  font-size: 12px;
}

.build-menu kbd,
.build-key {
  flex: 0 0 auto;
  padding: 1px 5px;
  border: 1px solid var(--line-2);
  border-radius: var(--r-1);
  color: var(--text-muted);
  font: 400 11px/1.3 var(--font-code);
}
</style>
