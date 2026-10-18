<script setup lang="ts">
/**
 * The map's own help, in place (streams/D.md DU36): a "?" at the map's bottom right that lays the
 * map's gestures over the map, beside it. The map view says when it opens by itself (map_help.ts
 * helpDue: once, then never again) and remembers that it was seen. Touch screens read the touch
 * lines, the rest the mouse and keys; Build's lines only for someone who can turn Build on.
 */
import { nextTick, ref, watch } from 'vue';
import Icon from '../design/Icon.vue';
import { POINTER_BUILD, POINTER_HELP, TOUCH_BUILD, TOUCH_HELP } from './map_help.ts';

const props = defineProps<{
    /** Build can be turned on here: its lines are shown. */
    build: boolean;
    /** Open by itself now (once). */
    auto: boolean;
}>();

const emit = defineEmits<{ seen: [] }>();

const open = ref(false);
const askBtn = ref<HTMLButtonElement | null>(null);
const closeBtn = ref<HTMLButtonElement | null>(null);

function show(focus: boolean): void {
    open.value = true;
    emit('seen');
    if (focus) void nextTick(() => { if (closeBtn.value) closeBtn.value.focus(); });
}

function hide(focus: boolean): void {
    open.value = false;
    if (focus && askBtn.value) askBtn.value.focus();
}

function toggle(): void {
    if (open.value) hide(false);
    else show(true);
}

function onKey(event: KeyboardEvent): void {
    if (event.key !== 'Escape' || !open.value) return;
    event.preventDefault();
    event.stopPropagation();
    hide(true);
}

// Opened by itself, it takes no focus: the person was doing something else.
watch(() => props.auto, (due) => { if (due && !open.value) show(false); }, { immediate: true });
</script>

<template>
  <div class="map-help" @keydown="onKey">
    <section v-if="open" id="map-help-card" class="map-help-card ui-frame" role="dialog" aria-modal="false" aria-labelledby="map-help-h" data-map-help>
      <div class="map-help-head">
        <h2 id="map-help-h" class="ui-kicker">Using the map</h2>
        <button ref="closeBtn" type="button" class="ui-btn is-icon map-help-x" aria-label="Close the map's help" title="Close" @click="hide(true)">
          <Icon name="xmark" :size="12" />
        </button>
      </div>
      <div class="map-help-set is-pointer">
        <template v-for="group in build ? [...POINTER_HELP, POINTER_BUILD] : POINTER_HELP" :key="group.title">
          <h3 class="map-help-group">{{ group.title }}</h3>
          <dl class="map-help-lines">
            <div v-for="line in group.lines" :key="line.does" class="map-help-line">
              <dt><kbd v-for="key in line.keys" :key="key">{{ key }}</kbd></dt>
              <dd>{{ line.does }}</dd>
            </div>
          </dl>
        </template>
      </div>
      <div class="map-help-set is-touch">
        <template v-for="group in build ? [...TOUCH_HELP, TOUCH_BUILD] : TOUCH_HELP" :key="group.title">
          <h3 class="map-help-group">{{ group.title }}</h3>
          <dl class="map-help-lines">
            <div v-for="line in group.lines" :key="line.does" class="map-help-line">
              <dt><kbd v-for="key in line.keys" :key="key">{{ key }}</kbd></dt>
              <dd>{{ line.does }}</dd>
            </div>
          </dl>
        </template>
      </div>
      <p class="map-help-more">The rest is in <RouterLink to="/help">Help</RouterLink>.</p>
    </section>
    <button
      ref="askBtn"
      type="button"
      class="map-help-ask"
      :aria-expanded="open ? 'true' : 'false'"
      aria-controls="map-help-card"
      aria-label="How to use the map"
      title="How to use the map"
      data-map-help-ask
      @click="toggle"
    >?</button>
  </div>
</template>

<style>
/* At the map's bottom right, on the search field's glass: the corner nothing else uses. */
.map-help {
  position: absolute;
  right: var(--chrome-inset);
  bottom: var(--chrome-inset);
  z-index: 3;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  max-width: calc(100% - var(--rail-width) - 2 * var(--chrome-inset));
}

.map-help-ask {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  padding: 0;
  border: 1px solid var(--control-line);
  border-radius: 50%;
  background: var(--chrome-glass);
  box-shadow: var(--shadow-chrome);
  color: var(--text-muted);
  font: 700 16px/1 var(--font-display);
  cursor: pointer;
  transition: border-color var(--t-fast) var(--ease-out), color var(--t-fast) var(--ease-out);
}

.map-help-ask:hover,
.map-help-ask[aria-expanded="true"] {
  border-color: var(--signal);
  color: var(--signal);
}

.map-help-ask:focus-visible {
  outline: 1px solid var(--signal);
  outline-offset: 2px;
}

.map-help-card {
  box-sizing: border-box;
  width: 360px;
  max-width: 100%;
  max-height: calc(100vh - 2 * (var(--chrome-top) + var(--chrome-height)) - 60px);
  overflow-y: auto;
  background: var(--chrome-glass);
  box-shadow: var(--shadow-chrome), 0 0 24px var(--frame-glow);
}

.map-help-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.ui-btn.map-help-x {
  width: 28px;
  height: 28px;
}

.map-help-group {
  margin: 12px 0 4px;
  color: var(--text-0);
  font: 700 12.5px/1.4 var(--font-text);
}

.map-help-lines {
  display: grid;
  gap: 4px;
  margin: 0;
}

.map-help-line {
  display: grid;
  grid-template-columns: minmax(0, 118px) minmax(0, 1fr);
  align-items: baseline;
  gap: 10px;
}

.map-help-line dt {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
}

.map-help-line dd {
  margin: 0;
  color: var(--text-1);
  font: 400 12.5px/1.45 var(--font-text);
}

.map-help-line kbd {
  padding: 0 5px;
  border: 1px solid var(--line-2);
  border-radius: var(--r-1);
  color: var(--text-0);
  font: 500 11px/1.5 var(--font-code);
  white-space: nowrap;
}

.map-help-more {
  margin: 12px 0 0;
  color: var(--text-muted);
  font: 400 12.5px/1.45 var(--font-text);
}

.map-help-more a {
  color: var(--signal);
}

/* Touch screens read the touch lines; a mouse reads the rest. */
.map-help-set.is-touch {
  display: none;
}

@media (pointer: coarse) {
  .map-help-set.is-touch {
    display: block;
  }

  .map-help-set.is-pointer {
    display: none;
  }

  .map-help-ask {
    width: 44px;
    height: 44px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .map-help-ask {
    transition: none;
  }
}
</style>
