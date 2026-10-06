<script setup lang="ts">
/**
 * One control drawer (follow-up 6; findings/orbit_drawers_design.md §2, §4): a shelf that
 * unrolls from the header's lower edge over the top of the picture. Open, it is revealed
 * from the top by a clip (never scaled), a signal hairline draws along its bottom edge, and
 * its groups land one step apart (--t-stagger); closed, it climbs back at --t-fast with no
 * stagger. Under reduced motion it is there or it is not. Closed, it is inert, so nothing
 * in it takes focus or a key. The groups are the slot's children with class orbit-drawer-group
 * and a --i order; the drawer stays mounted so a close can animate.
 */
import { ref } from 'vue';
import { DRAWERS, type DrawerId } from './commands.ts';

const props = defineProps<{
    id: DrawerId;
    open: boolean;
}>();

const emit = defineEmits<{ close: [] }>();

const label = DRAWERS.find((item) => item.id === props.id)?.label ?? props.id;
const rootEl = ref<HTMLElement | null>(null);

defineExpose({
    /** The shelf's height, so what sits under it (a toast) can move down while it is open. */
    height: () => (rootEl.value ? rootEl.value.offsetHeight : 0),
});

/** Esc inside the drawer closes it (the view puts focus back on the tab). The rest of the keys are the view's. */
function onKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        emit('close');
    }
}
</script>

<template>
  <div
    :id="'orbit-drawer-' + id"
    ref="rootEl"
    class="orbit-drawer"
    :class="{ 'is-open': open }"
    role="region"
    :aria-label="label"
    :inert="!open"
    @keydown="onKey"
  >
    <div class="orbit-drawer-body">
      <slot />
    </div>
    <i class="orbit-drawer-edge" aria-hidden="true"></i>
  </div>
</template>

<style>
/* The shelf hangs from the header over the picture; the picture does not move. */
.orbit-drawer {
  position: absolute;
  top: 0;
  right: 0;
  left: 0;
  z-index: 6;
  visibility: hidden;
  background: var(--chrome-glass);
  border-bottom: 1px solid var(--line-1);
  box-shadow: var(--shadow-chrome);
  backdrop-filter: blur(8px);
  clip-path: inset(0 0 100% 0);
  transition: clip-path var(--t-fast) var(--ease-out), visibility 0s linear var(--t-fast);
}

.orbit-drawer.is-open {
  visibility: visible;
  clip-path: inset(0);
  transition: clip-path var(--t-base) var(--ease-out), visibility 0s;
}

.orbit-drawer-body {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 16px;
  padding: 10px 14px 12px;
}

/* The hairline draws left to right as the shelf unrolls. */
.orbit-drawer-edge {
  position: absolute;
  right: 0;
  bottom: -1px;
  left: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--signal) 20%, var(--signal) 80%, transparent);
  transform: scaleX(0);
  transform-origin: left;
  transition: transform var(--t-fast) var(--ease-out);
}

.orbit-drawer.is-open .orbit-drawer-edge {
  transform: scaleX(1);
  transition: transform var(--t-base) var(--ease-out);
}

/* The groups land one after another, --t-stagger apart, from the --i each is given; closing has no stagger. */
.orbit-drawer-group {
  opacity: 0;
  transform: translateY(4px);
  transition: opacity var(--t-fast) var(--ease-out), transform var(--t-fast) var(--ease-out);
}

.orbit-drawer.is-open .orbit-drawer-group {
  opacity: 1;
  transform: none;
  transition-delay: calc(var(--t-stagger) * var(--i, 0));
}

@media (prefers-reduced-motion: reduce) {
  .orbit-drawer,
  .orbit-drawer.is-open,
  .orbit-drawer-edge,
  .orbit-drawer.is-open .orbit-drawer-edge,
  .orbit-drawer-group,
  .orbit-drawer.is-open .orbit-drawer-group {
    transition: none;
    transition-delay: 0s;
  }

  .orbit-drawer-group {
    transform: none;
  }
}
</style>
