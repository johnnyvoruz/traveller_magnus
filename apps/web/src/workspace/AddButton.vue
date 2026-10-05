<script setup lang="ts">
/**
 * The split Add button (design §2 and §4): pressing it adds a record of one type; its caret
 * lists the nine. The record list uses it ("Add") and so does a dossier ("Add here").
 */
import { nextTick, ref } from 'vue';
import type { CampaignRecordType } from '@voyage/shared';
import Icon from '../design/Icon.vue';
import { RECORD_TYPES, typeInfo } from './records.ts';

const props = withDefaults(defineProps<{
    /** The type the button itself adds. */
    type: CampaignRecordType;
    label?: string;
    /** What the caret's menu is called, and where the record goes: "Add a record", "Add a record here". */
    menuLabel?: string;
    disabled?: boolean;
    /** The quiet look, for a section inside another page. */
    quiet?: boolean;
}>(), { label: 'Add', menuLabel: 'Add a record', disabled: false, quiet: false });

const emit = defineEmits<{ add: [type: CampaignRecordType] }>();

const open = ref(false);
const menu = ref<HTMLElement | null>(null);
const caret = ref<HTMLElement | null>(null);

function add(type: CampaignRecordType): void {
    open.value = false;
    if (props.disabled) return;
    emit('add', type);
}

function toggle(): void {
    open.value = !open.value;
    if (open.value) void nextTick(() => {
        const item = menu.value ? menu.value.querySelector<HTMLElement>('[role="menuitem"]') : null;
        if (item) item.focus();
    });
}

function onMenuKey(event: KeyboardEvent): void {
    const items = menu.value ? Array.from(menu.value.querySelectorAll<HTMLElement>('[role="menuitem"]')) : [];
    const at = items.indexOf(event.target as HTMLElement);
    if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        open.value = false;
        if (caret.value) caret.value.focus();
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
  <div class="camp-add" :class="{ 'is-quiet': quiet }">
    <button
      type="button"
      class="ui-btn camp-add-main"
      :class="{ 'is-primary': !quiet }"
      :disabled="disabled"
      :title="menuLabel + ': ' + typeInfo(type).a"
      @click="add(type)"
    >
      <Icon name="plus" :size="13" />{{ label }}
    </button>
    <button
      ref="caret"
      type="button"
      class="ui-btn camp-add-more"
      :class="{ 'is-primary': !quiet }"
      :aria-label="menuLabel + ' of another type'"
      :title="menuLabel + ' of another type'"
      aria-haspopup="true"
      :aria-expanded="open ? 'true' : 'false'"
      :disabled="disabled"
      @click="toggle"
    >
      <Icon name="caret-down" :size="12" />
    </button>
    <div v-if="open" class="camp-add-backdrop" @click="open = false"></div>
    <div v-if="open" ref="menu" class="camp-add-menu" role="menu" :aria-label="menuLabel" @keydown="onMenuKey">
      <button v-for="info in RECORD_TYPES" :key="info.type" type="button" role="menuitem" @click="add(info.type)">
        <Icon :name="info.icon" :size="14" /><span>{{ info.one }}</span>
      </button>
    </div>
  </div>
</template>

<style>
/* Add: the button adds the type in view; its caret offers the nine. */
.camp-add {
  position: relative;
  display: flex;
  flex: 0 0 auto;
}

.camp-add .ui-btn {
  height: 36px;
  font-size: 14px;
}

.camp-add.is-quiet .ui-btn {
  height: 30px;
  font-size: 13px;
}

.camp-add .ui-btn.camp-add-main {
  border-radius: var(--r-2) 0 0 var(--r-2);
}

.camp-add .ui-btn.camp-add-more {
  padding: 0 9px;
  border-left-color: var(--on-signal);
  border-radius: 0 var(--r-2) var(--r-2) 0;
}

.camp-add.is-quiet .ui-btn.camp-add-more {
  margin-left: -1px;
  border-left-color: var(--control-line);
}

.camp-add-backdrop {
  position: fixed;
  inset: 0;
  z-index: 6;
}

.camp-add-menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 7;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 190px;
  padding: 6px;
  border: 1px solid var(--signal-dim);
  border-radius: var(--r-3);
  background: var(--chrome-bg);
  box-shadow: var(--shadow-pop);
}

.camp-add-menu button {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0;
  padding: 7px 10px;
  border: 0;
  border-radius: var(--r-2);
  background: transparent;
  color: var(--text-1);
  font: 400 14px/1.4 var(--font-text);
  text-align: left;
  cursor: pointer;
}

.camp-add-menu button:hover,
.camp-add-menu button:focus-visible {
  background: var(--row-active);
}

.camp-add-menu button:focus-visible {
  outline-offset: -2px;
}

.camp-add-menu .ui-icon {
  flex: 0 0 16px;
  color: var(--signal);
}
</style>
