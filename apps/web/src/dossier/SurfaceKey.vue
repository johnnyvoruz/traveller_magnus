<script setup lang="ts">
/**
 * The symbol key. Names and order come from legendGroups (surface/hybrid/symbols.ts),
 * which reads SURFACE_CODES and CODE_TABLE, the same table drawSymbols uses.
 * Glyphs are drawCode, the same draw the map uses. A pop key is taken out of flow
 * so opening it does not change the map's height.
 */
import { computed } from 'vue';
import { CODE_TABLE, type SurfaceCode } from '../surface/hybrid/codes.ts';
import { drawCode, iconPaint, type IconSet } from '../surface/hybrid/icons.ts';
import type { HybridModel } from '../surface/hybrid/model.ts';
import { legendGroups } from '../surface/hybrid/symbols.ts';

const props = defineProps<{
    model: HybridModel | null;
    iconSet: IconSet | null;
    /** column: beside the large map. pop: over the column map, out of flow. */
    placement: 'column' | 'pop';
}>();

const groups = computed(() => (props.model ? legendGroups(props.model) : { here: [], absent: [] }));

function nameOf(code: SurfaceCode): string {
    return CODE_TABLE[code].name;
}

function paint(el: unknown, code: SurfaceCode): void {
    if (!(el instanceof HTMLCanvasElement)) return;
    const ctx = el.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, el.width, el.height);
    drawCode(ctx, props.iconSet, code, 12, 12, 9, iconPaint('--icon-mark'));
}
</script>

<template>
  <div
    :id="placement === 'pop' ? 'surf-key' : undefined"
    class="surf-key"
    :class="placement === 'pop' ? 'surf-key-pop' : 'surf-key-col'"
    role="region"
    aria-label="Symbol key"
  >
    <ul class="surf-key-list">
      <li v-for="code in groups.here" :key="code" class="surf-key-row">
        <canvas width="24" height="24" :ref="(el) => paint(el, code)" aria-hidden="true"></canvas>
        <span>{{ nameOf(code) }}</span>
      </li>
    </ul>
    <p v-if="groups.absent.length" class="surf-key-note">Not on this world</p>
    <ul v-if="groups.absent.length" class="surf-key-list">
      <li v-for="code in groups.absent" :key="code" class="surf-key-row">
        <canvas width="24" height="24" :ref="(el) => paint(el, code)" aria-hidden="true"></canvas>
        <span>{{ nameOf(code) }}</span>
      </li>
    </ul>
  </div>
</template>

<style>
.surf-key {
  margin: 0;
  padding: 8px 10px;
  color: var(--text-1);
  font: 400 12px/16px var(--font-text);
}

.surf-key-pop {
  position: absolute;
  z-index: 4;
  top: 8px;
  right: 8px;
  width: min(280px, calc(100% - 16px));
  max-height: calc(100% - 16px);
  overflow: auto;
  border: 1px solid var(--line-1);
  border-radius: var(--r-3);
  background: var(--bg-1);
  box-shadow: var(--shadow-pop);
}

.surf-key-col {
  flex: 0 0 260px;
  align-self: stretch;
  max-height: calc(100vh - 48px);
  overflow: auto;
  border: 1px solid var(--line-1);
  border-radius: var(--r-4);
  background: var(--bg-1);
}

.surf-key-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.surf-key-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 24px;
}

.surf-key-row canvas {
  flex: 0 0 auto;
  width: 24px;
  height: 24px;
}

.surf-key-note {
  margin: 10px 0 4px;
  color: var(--text-muted);
  font: 600 12px/16px var(--font-text);
}
</style>
