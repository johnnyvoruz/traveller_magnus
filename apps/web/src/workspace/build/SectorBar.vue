<script setup lang="ts">
/**
 * The bar under the head of a sector of the referee's own, and of one of its subsectors
 * (findings/builder_system_design.md §16, mockup kb3_sector_own): Rename, Move… and, under
 * More, Delete, which asks nothing, keeps a copy and offers Undo. A subsector has Rename
 * only: it is not made or deleted, it is named.
 */
import { ref } from 'vue';
import Icon from '../../design/Icon.vue';
import BuildMenu, { type MenuItem } from './BuildMenu.vue';
import type { Rect } from '../pop_place.ts';
import { canDelete, canMove, canRename, cancelMove, deleteSector, deleteWords, sectorUi, startMove, startRename } from './sector_acts.ts';

defineProps<{ name: string; subsector: boolean }>();

const more = ref<HTMLButtonElement | null>(null);
const anchor = ref<Rect | null>(null);

function items(): MenuItem[] {
    return [{ id: 'delete', label: 'Delete this sector', say: deleteWords(), icon: 'trash', danger: true, disabled: !canDelete() }];
}

function openMore(): void {
    const el = more.value;
    if (!el) return;
    const box = el.getBoundingClientRect();
    anchor.value = { left: box.left, top: box.top, right: box.right, bottom: box.bottom };
}

function closeMore(): void {
    anchor.value = null;
    if (more.value) more.value.focus();
}

function pick(id: string): void {
    anchor.value = null;
    if (id === 'delete') void deleteSector();
}
</script>

<template>
  <div class="build-bar sector-bar">
    <template v-if="sectorUi.moving">
      <span class="build-tag is-preview">Moving</span>
      <span class="build-bar-word" role="status">Select an empty sector slot on the map</span>
      <span class="build-bar-gap"></span>
      <button type="button" class="ui-btn" @click="cancelMove()">Cancel<kbd class="build-key">Esc</kbd></button>
    </template>
    <template v-else>
      <button type="button" class="ui-btn" data-command="build-sector-rename" :disabled="!canRename() || sectorUi.renaming" title="Rename (F2). Press Enter to save the name, or Esc to cancel" @click="startRename()">
        <Icon name="pen-to-square" :size="13" />Rename<kbd class="build-key">F2</kbd>
      </button>
      <button v-if="!subsector" type="button" class="ui-btn" data-command="build-sector-move" :disabled="!canMove()" title="Move this sector to an empty sector slot. Its hexes and names move with it" @click="startMove()">
        <Icon name="up-right-and-down-left-from-center" :size="13" />Move…
      </button>
      <button
        v-if="!subsector"
        ref="more"
        type="button"
        class="ui-btn is-icon"
        data-command="build-sector-delete"
        aria-label="More sector actions"
        title="More"
        aria-haspopup="true"
        :aria-expanded="anchor ? 'true' : 'false'"
        :disabled="sectorUi.busy"
        @click="openMore"
      >
        <Icon name="ellipsis-vertical" :size="13" />
      </button>
      <span class="build-bar-gap"></span>
      <span class="build-bar-state">
        <span class="build-tag is-yours">Yours</span>
        <span class="build-bar-word">made by you</span>
      </span>
    </template>
    <BuildMenu v-if="anchor" :title="name" :items="items()" :anchor="anchor" @pick="pick" @close="closeMore" />
  </div>
</template>
