<script setup lang="ts">
/**
 * The toast strip (design_reference.md §3; campaign_manager_plan.md §6.3): at most two, each
 * with an optional action. A toast leaves after its time unless the pointer is on it or focus
 * is in it. Mounted once, in App.vue, so every route shows the same toasts.
 *
 * The map's corner is the chart's foot beside the panel (or the search row when the panel
 * covers the chart). The orbit view's corner is the picture's upper right. Pages with neither
 * use the lower right. A busy toast shows a ring and is announced once; later words stay quiet.
 * The ring is the app's one spinner, design/Spinner.vue, which also stands still under reduced motion.
 */
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import Icon from '../design/Icon.vue';
import Spinner from '../design/Spinner.vue';
import { dismissToast, nextBusyAnnouncement, orbitToastBox, readPx, runToastAction, toasts, type Toast } from './toast.ts';

const route = useRoute();
const root = ref<HTMLElement | null>(null);
const said = ref('');
const announced = new Set<number>();

const timers = new Map<number, ReturnType<typeof setTimeout>>();
const held = new Set<number>();

function stop(id: number): void {
    const timer = timers.get(id);
    if (timer !== undefined) clearTimeout(timer);
    timers.delete(id);
}

function start(toast: Toast): void {
    stop(toast.id);
    if (held.has(toast.id)) return;
    timers.set(toast.id, setTimeout(() => { dismissToast(toast.id); }, toast.ms));
}

function hold(toast: Toast): void {
    held.add(toast.id);
    stop(toast.id);
}

function release(toast: Toast): void {
    held.delete(toast.id);
    start(toast);
}

function act(toast: Toast): void {
    runToastAction(toast);
}

watch(() => toasts.map((toast) => toast.id), (ids) => {
    for (const toast of toasts) if (!timers.has(toast.id) && !held.has(toast.id)) start(toast);
    for (const id of [...timers.keys()]) if (!ids.includes(id)) stop(id);
    for (const id of [...held]) if (!ids.includes(id)) held.delete(id);
}, { immediate: true });

watch(toasts, () => {
    const text = nextBusyAnnouncement(toasts, announced);
    if (text !== null) said.value = text;
}, { deep: true });

let viewport: ResizeObserver | null = null;
let added: MutationObserver | null = null;
let panelStyle: MutationObserver | null = null;
let stageSize: ResizeObserver | null = null;
let stageStyle: MutationObserver | null = null;
let stage: Element | null = null;

function railPx(): number {
    const app = document.querySelector('.app');
    const from = app instanceof HTMLElement ? getComputedStyle(app).getPropertyValue('--rail-width') : '';
    return readPx(from) || readPx(getComputedStyle(document.documentElement).getPropertyValue('--rail-width'));
}

/** Pixels left for a toast at the chart's foot, after the rail and the panel. */
function mapRoom(): number {
    const app = document.querySelector('.app');
    if (!(app instanceof HTMLElement)) return 0;
    const style = getComputedStyle(app);
    const inset = readPx(style.getPropertyValue('--chrome-inset')) || 10;
    const panel = readPx(style.getPropertyValue('--panel-width'));
    const left = railPx() + Math.max(inset, panel);
    return document.documentElement.clientWidth - left - inset;
}

function place(): void {
    const el = root.value;
    if (!el) return;
    const next = document.querySelector('.orbit-stage');
    if (next !== stage) {
        stageSize?.disconnect();
        stageStyle?.disconnect();
        stageSize = null;
        stageStyle = null;
        stage = next;
        if (next instanceof HTMLElement) {
            stageSize = new ResizeObserver(() => { place(); });
            stageSize.observe(next);
            stageStyle = new MutationObserver(() => { place(); });
            stageStyle.observe(next, { attributes: true, attributeFilter: ['style'] });
        }
    }
    const map = document.querySelector('.map');
    if (map instanceof HTMLElement) {
        const strip = map.style.getPropertyValue('--build-strip');
        if (strip) el.style.setProperty('--build-strip', strip);
        else el.style.removeProperty('--build-strip');
    } else {
        el.style.removeProperty('--build-strip');
    }
    if (!(next instanceof HTMLElement)) {
        el.style.top = '';
        el.style.right = '';
        el.style.bottom = '';
        el.style.left = '';
        el.style.maxWidth = '';
        // The chart foot beside a wide panel can fall off a short screen. Sit in the lower right instead.
        if (map instanceof HTMLElement && mapRoom() < 180) {
            const inset = readPx(getComputedStyle(document.documentElement).getPropertyValue('--chrome-inset')) || 10;
            const rail = railPx();
            const width = document.documentElement.clientWidth;
            el.style.top = 'auto';
            el.style.left = 'auto';
            el.style.right = inset + 'px';
            el.style.bottom = (inset + 44) + 'px';
            el.style.maxWidth = Math.min(460, Math.max(160, width - rail - inset * 2)) + 'px';
        }
        return;
    }
    const box = next.getBoundingClientRect();
    const placed = orbitToastBox(
        { top: box.top, right: box.right, width: box.width, height: box.height },
        readPx(next.style.getPropertyValue('--flight-strip-height')),
        readPx(next.style.getPropertyValue('--drawer-height')),
        document.documentElement.clientWidth,
    );
    el.style.top = placed.top + 'px';
    el.style.right = placed.right + 'px';
    el.style.bottom = 'auto';
    el.style.left = 'auto';
    el.style.maxWidth = placed.maxWidth + 'px';
}

watch(() => route.fullPath, () => { void nextTick(place); });

onMounted(() => {
    viewport = new ResizeObserver(() => { place(); });
    viewport.observe(document.documentElement);
    const app = document.querySelector('.app');
    if (app) {
        added = new MutationObserver(() => { place(); });
        added.observe(app, { childList: true, subtree: true });
        panelStyle = new MutationObserver(() => { place(); });
        panelStyle.observe(app, { attributes: true, attributeFilter: ['style'] });
    }
    void nextTick(place);
});

onBeforeUnmount(() => {
    for (const id of [...timers.keys()]) stop(id);
    viewport?.disconnect();
    added?.disconnect();
    panelStyle?.disconnect();
    stageSize?.disconnect();
    stageStyle?.disconnect();
});
</script>

<template>
  <div ref="root" class="toasts">
    <p class="toast-said" role="status">{{ said }}</p>
    <div
      v-for="toast in toasts"
      :key="toast.id"
      class="toast"
      :role="toast.busy ? undefined : 'status'"
      @mouseenter="hold(toast)"
      @mouseleave="release(toast)"
      @focusin="hold(toast)"
      @focusout="release(toast)"
    >
      <Spinner v-if="toast.busy" class="toast-spin" :size="13" />
      <span class="toast-text">{{ toast.message }}</span>
      <button v-if="toast.action" type="button" class="toast-act" @click="act(toast)">{{ toast.action.label }}</button>
      <button type="button" class="toast-close" aria-label="Dismiss" title="Dismiss" @click="dismissToast(toast.id)">
        <Icon name="xmark" :size="13" />
      </button>
    </div>
  </div>
</template>

<style>
.toasts {
  position: absolute;
  top: var(--toast-top, auto);
  right: var(--toast-right, auto);
  bottom: var(--toast-bottom, 22px);
  left: var(--toast-left, calc(var(--rail-width) + var(--chrome-inset) + 16px));
  z-index: 10;
  display: flex;
  flex-direction: var(--toast-flow, column);
  align-items: var(--toast-align, stretch);
  gap: 8px;
  max-width: var(--toast-max, min(460px, calc(100vw - var(--rail-width) - 2 * var(--chrome-inset) - 32px)));
  pointer-events: none;
  transition: left var(--t-rail) ease;
}

/* The map's corner. .map is not an ancestor of the strip, so the chart's numbers are repeated here. */
.app:has(.map) .toasts {
  top: auto;
  right: auto;
  bottom: calc(var(--chrome-inset) + 44px);
  left: calc(var(--rail-width) + max(var(--chrome-inset), var(--panel-width, 0px)));
  max-width: min(460px, calc(100% - var(--rail-width) - max(var(--chrome-inset), var(--panel-width, 0px)) - var(--chrome-inset)));
  flex-direction: column;
  align-items: stretch;
}

.app:has(.map[data-toasts="top"]) .toasts {
  top: var(--chrome-top);
  right: calc(var(--chrome-inset) + var(--build-strip, 0px));
  bottom: auto;
  left: calc(var(--rail-width) + var(--chrome-inset) + 452px + 220px);
  flex-direction: row-reverse;
  align-items: flex-start;
  max-width: none;
}

/* A page with no chart: the lower right, under the header. */
.app:not(:has(.map)):not(:has(.orbit)) .toasts {
  top: auto;
  right: var(--chrome-inset);
  bottom: var(--chrome-inset);
  left: auto;
  max-width: min(460px, calc(100% - 2 * var(--chrome-inset)));
  flex-direction: column;
  align-items: stretch;
}

.toast {
  display: flex;
  flex: 0 1 auto;
  align-items: center;
  gap: 12px;
  box-sizing: border-box;
  max-width: 460px;
  padding: 9px 8px 9px 14px;
  /* The videos' toast: a raised card with a teal edge and a halo. */
  border: 1px solid var(--signal-dim);
  border-left: 3px solid var(--signal);
  border-radius: var(--r-3);
  background: var(--surface-1);
  box-shadow: var(--shadow-pop), 0 0 18px var(--signal-glow);
  color: var(--text-0);
  font: 400 13.5px/1.4 var(--font-text);
  pointer-events: auto;
  animation: toast-in var(--t-fast) var(--ease-out) both;
}

.toast-said {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: 0;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}

.toast-text {
  flex: 1 1 auto;
  min-width: 0;
  overflow-wrap: anywhere;
}

.toast-act {
  flex: 0 0 auto;
  margin: 0;
  padding: 4px 10px;
  border: 1px solid var(--signal-dim);
  border-radius: var(--r-2);
  background: transparent;
  color: var(--signal);
  font: 700 13px/1.3 var(--font-text);
  cursor: pointer;
}

.toast-act:hover {
  border-color: var(--signal);
  background: var(--row-active);
}

.toast-close {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: var(--r-2);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
}

.toast-close:hover {
  color: var(--text-0);
}

@keyframes toast-in {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: none; }
}

@media (prefers-reduced-motion: reduce) {
  .toasts {
    transition: none;
  }

  .toast {
    animation: none;
  }
}
</style>
