<script setup lang="ts">
/**
 * The symbol key for the large map. Names and order come from legendGroups, which reads
 * SURFACE_CODES and CODE_TABLE, the same table drawSymbols uses. Each glyph is drawCode
 * on a swatch from legendInk, so a dark mark is not drawn on the dark panel.
 * There is no column pop-over: the column opens this legend with the large map.
 */
import { computed, ref } from 'vue';
import { CODE_TABLE, type SurfaceCode } from '../surface/hybrid/codes.ts';
import { drawCode, type IconSet } from '../surface/hybrid/icons.ts';
import type { HybridModel } from '../surface/hybrid/model.ts';
import { legendBlocks, legendGroups, legendInk } from '../surface/hybrid/symbols.ts';

const props = defineProps<{
    model: HybridModel | null;
    iconSet: IconSet | null;
    /** The code whose hexes are marked, when a row has focus or the pointer. */
    active: SurfaceCode | null;
}>();

const emit = defineEmits<{ highlight: [code: SurfaceCode | null] }>();

const absentOpen = ref(false);
const groups = computed(() => (props.model ? legendGroups(props.model) : { here: [] as SurfaceCode[], absent: [] as SurfaceCode[] }));
const hereBlocks = computed(() => legendBlocks(groups.value.here));
const absentBlocks = computed(() => legendBlocks(groups.value.absent));

function nameOf(code: SurfaceCode): string {
    return CODE_TABLE[code].name;
}

function paint(el: unknown, code: SurfaceCode): void {
    if (!(el instanceof HTMLCanvasElement)) return;
    const ctx = el.getContext('2d');
    if (!ctx) return;
    const ink = legendInk(code);
    ctx.clearRect(0, 0, el.width, el.height);
    ctx.fillStyle = 'rgba(' + ink.ground[0] + ',' + ink.ground[1] + ',' + ink.ground[2] + ',1)';
    ctx.fillRect(1, 1, 22, 22);
    drawCode(ctx, props.iconSet, code, 12, 12, 8, 'rgba(' + ink.ink[0] + ',' + ink.ink[1] + ',' + ink.ink[2] + ',1)');
}

function enter(code: SurfaceCode): void {
    emit('highlight', code);
}

function leave(code: SurfaceCode): void {
    if (props.active === code) emit('highlight', null);
}
</script>

<template>
  <div class="surf-key" role="region" aria-label="Symbol key">
    <div class="surf-key-cols">
      <section v-for="block in hereBlocks" :key="block.kind">
        <h3 class="surf-key-head">{{ block.heading }}</h3>
        <ul class="surf-key-list">
          <li v-for="code in block.codes" :key="code">
            <button
              type="button"
              class="surf-key-row"
              :aria-pressed="active === code ? 'true' : 'false'"
              @mouseenter="enter(code)"
              @mouseleave="leave(code)"
              @focus="enter(code)"
              @blur="leave(code)"
            >
              <canvas width="24" height="24" :ref="(el) => paint(el, code)" aria-hidden="true"></canvas>
              <span>{{ nameOf(code) }}</span>
            </button>
          </li>
        </ul>
      </section>
    </div>
    <button
      v-if="groups.absent.length"
      type="button"
      class="surf-key-absent"
      :aria-expanded="absentOpen ? 'true' : 'false'"
      @click="absentOpen = !absentOpen"
    >
      Not on this world ({{ groups.absent.length }})
    </button>
    <div v-if="absentOpen" class="surf-key-cols">
      <section v-for="block in absentBlocks" :key="'off-' + block.kind">
        <h3 class="surf-key-head">{{ block.heading }}</h3>
        <ul class="surf-key-list">
          <li v-for="code in block.codes" :key="code">
            <button
              type="button"
              class="surf-key-row"
              :aria-pressed="active === code ? 'true' : 'false'"
              @mouseenter="enter(code)"
              @mouseleave="leave(code)"
              @focus="enter(code)"
              @blur="leave(code)"
            >
              <canvas width="24" height="24" :ref="(el) => paint(el, code)" aria-hidden="true"></canvas>
              <span>{{ nameOf(code) }}</span>
            </button>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>

<style>
.surf-key {
  margin: 0;
  padding: 12px 14px;
  color: var(--text-1);
  font: 400 14px/20px var(--font-text);
  background: var(--bg-1);
}

.surf-key-cols {
  margin: 0;
}

.surf-key-head {
  margin: 10px 0 4px;
  color: var(--text-1);
  font: 600 12px/16px var(--font-text);
}

.surf-key-cols section:first-child .surf-key-head {
  margin-top: 0;
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
  width: 100%;
  margin: 0;
  padding: 2px 4px;
  border: 0;
  border-radius: var(--r-2);
  background: transparent;
  color: var(--text-1);
  font: 400 14px/20px var(--font-text);
  text-align: left;
  cursor: pointer;
}

.surf-key-row[aria-pressed="true"],
.surf-key-row:hover,
.surf-key-row:focus-visible {
  background: var(--row-active);
  outline: none;
}

.surf-key-row canvas {
  flex: 0 0 auto;
  width: 24px;
  height: 24px;
  border-radius: var(--r-2);
}

.surf-key-absent {
  display: block;
  width: 100%;
  margin: 12px 0 0;
  padding: 6px 4px;
  border: 0;
  background: transparent;
  color: var(--text-1);
  font: 600 14px/20px var(--font-text);
  text-align: left;
  cursor: pointer;
}

.surf-key-absent:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}

@media (min-width: 1024px) and (min-height: 700px) {
  .surf-key-cols {
    columns: 2;
    column-gap: 16px;
  }

  .surf-key-cols section {
    break-inside: avoid;
  }
}
</style>
