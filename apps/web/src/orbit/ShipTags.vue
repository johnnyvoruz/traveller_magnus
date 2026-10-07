<script setup lang="ts">
/**
 * The ships' tags (Johnny, 2026-10-06: "I want the ship tag to look like the planet select
 * tag … it's nearly impossible to see right now"). Every ship on the picture has one, and it
 * is the planet's selection tag (OrbitRenderer's readout tag): the same plate (--orbit-tag
 * at 82%), 1 px edge, 3 px bar at its leading edge, 3 px corners, the name in 700 11 px mono
 * capitals and a second line in 10 px mono, 34 px high, on a 1 px leader that leaves the
 * mark on the diagonal and runs level into the tag. The second line is the ship's state in
 * the strip's short words. It is HTML over the picture, so it can be pressed and reached by
 * Tab; pressing it selects the ship.
 *
 * The selected ship's tag is the amber one, exactly the planet's. Unselected, the party's
 * ship is teal and any other ship is the picture's white, the colours their designators are
 * drawn in. Places are orbit/ship_marks.ts shipTags: always down and to the right of the
 * mark, so a tag never flips while its ship moves and never meets a planet's tag, which
 * goes up. Nothing here moves under reduced motion.
 */
import type { ShipTag, TagsMore } from './ship_marks.ts';
import { TAG_RUN } from './ship_marks.ts';

defineProps<{
    tags: readonly ShipTag[];
    more: readonly TagsMore[];
    /** The selected ship's id, or null. */
    selected: string | null;
    /** Each ship's state in short words, by id. */
    notes: Record<string, string>;
    /** The picture's size, for the leaders. */
    width: number;
    height: number;
}>();

defineEmits<{ select: [id: string]; open: [bodyKey: string] }>();

function leader(tag: { markX: number; markY: number; kneeX: number; kneeY: number }): string {
    return tag.markX + ',' + tag.markY + ' ' + tag.kneeX + ',' + tag.kneeY + ' ' + (tag.kneeX + TAG_RUN) + ',' + tag.kneeY;
}
</script>

<template>
  <div class="orbit-tags">
    <svg class="orbit-tag-leaders" :viewBox="'0 0 ' + width + ' ' + height" :width="width" :height="height" aria-hidden="true" focusable="false">
      <polyline v-for="tag in tags" :key="tag.id" :points="leader(tag)" :class="{ 'is-selected': tag.id === selected, 'is-party': tag.kind === 'party' }" />
      <polyline v-for="item in more" :key="'more-' + item.bodyKey" :points="leader(item)" />
    </svg>
    <TransitionGroup name="orbit-tag">
      <button
        v-for="tag in tags"
        :key="tag.id"
        type="button"
        class="orbit-tag"
        :class="{ 'is-selected': tag.id === selected, 'is-party': tag.kind === 'party' }"
        :style="{ left: tag.x + 'px', top: tag.kneeY + 'px' }"
        :aria-pressed="tag.id === selected ? 'true' : 'false'"
        :aria-label="tag.name + (tag.kind === 'party' ? ', the party’s ship' : '') + (notes[tag.id] ? ', ' + notes[tag.id] : '') + '. ' + (tag.id === selected ? 'Selected' : 'Select')"
        :title="tag.id === selected ? tag.name + ' is selected' : 'Select ' + tag.name"
        @click="$emit('select', tag.id)"
      >
        <b>{{ tag.name }}</b>
        <span>{{ notes[tag.id] || ' ' }}</span>
      </button>
      <button
        v-for="item in more"
        :key="'more-' + item.bodyKey"
        type="button"
        class="orbit-tag is-more"
        :style="{ left: item.x + 'px', top: item.kneeY + 'px' }"
        :aria-label="item.count + ' more ships here. Show them'"
        :title="'Show ' + item.count + ' more'"
        @click="$emit('open', item.bodyKey)"
      >
        <b>+{{ item.count }}</b>
        <span>more here</span>
      </button>
    </TransitionGroup>
  </div>
</template>

<style>
/* Over the picture, taking no presses of its own: only the tags do. */
.orbit-tags {
  position: absolute;
  inset: 0;
  z-index: 1;
  overflow: hidden;
  pointer-events: none;
}

.orbit-tag-leaders {
  position: absolute;
  top: 0;
  left: 0;
}

/* The leader: 1 px, at the planet tag's 75%. */
.orbit-tag-leaders polyline {
  fill: none;
  stroke: var(--text-1);
  stroke-width: 1;
  opacity: 0.75;
}

.orbit-tag-leaders polyline.is-party {
  stroke: var(--signal);
}

.orbit-tag-leaders polyline.is-selected {
  stroke: var(--orbit-lock);
}

/*
 * The tag, drawn as the renderer draws the planet's: w = text + 16, h = 34, the name's
 * baseline at 14 and the detail's at 28, the bar 3 px wide down the leading edge.
 */
.orbit-tag {
  --tag-ink: var(--text-0);
  position: absolute;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 3px;
  box-sizing: border-box;
  height: 34px;
  margin: -17px 0 0;
  padding: 0 8px;
  border: 1px solid color-mix(in srgb, var(--tag-ink) 80%, transparent);
  border-radius: 3px;
  background: linear-gradient(var(--tag-ink), var(--tag-ink)) left / 3px 100% no-repeat, color-mix(in srgb, var(--orbit-tag) 82%, transparent);
  color: var(--tag-ink);
  text-align: left;
  white-space: nowrap;
  cursor: pointer;
  pointer-events: auto;
}

.orbit-tag b {
  font: 700 11px/1 var(--font-code);
  text-transform: uppercase;
}

/* The state can run long (a point's words): past this it is cut, and the whole of it is in the tag's label. */
.orbit-tag span {
  max-width: 220px;
  overflow: hidden;
  color: var(--text-1);
  font: 400 10px/1.2 var(--font-code);
  text-overflow: ellipsis;
}

/* The party's ship is teal, as its designator is. */
.orbit-tag.is-party {
  --tag-ink: var(--signal);
}

/* Selected: the planet's own tag, amber, with its detail in teal. */
.orbit-tag.is-selected {
  --tag-ink: var(--orbit-lock);
}

.orbit-tag.is-selected span {
  color: var(--signal);
}

.orbit-tag:hover {
  border-color: var(--tag-ink);
}

/* It comes out along its leader and goes back the same way. */
.orbit-tag-enter-active {
  transition: opacity var(--t-base) var(--ease-out), transform var(--t-base) var(--ease-out);
}

.orbit-tag-leave-active {
  transition: opacity var(--t-fast) var(--ease-out), transform var(--t-fast) var(--ease-out);
}

.orbit-tag-enter-from,
.orbit-tag-leave-to {
  opacity: 0;
  transform: translate(-10px, -10px);
}

@media (prefers-reduced-motion: reduce) {
  .orbit-tag-enter-active,
  .orbit-tag-leave-active {
    transition: none;
  }
}
</style>
