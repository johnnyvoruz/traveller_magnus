<script setup lang="ts">
/**
 * The surface-map lead of a dossier, until the real map exists: the legacy stage's 2:1 frame
 * and caption row (style.css .dossier-map-*), with the blank diamond the legacy scanner shows
 * while a map draws. One scanner pass on first render; nothing loops.
 */
import { useId } from 'vue';
import Icon from '../design/Icon.vue';

defineProps<{ badge: string }>();

const uid = useId();
const DIAMOND = '0,0 80,133.2 160,0 240,133.2 320,0 400,133.2 480,0 560,133.2 640,0 720,133.2 800,0 '
    + '800,266.8 720,400 640,266.8 560,400 480,266.8 400,400 320,266.8 240,400 160,266.8 80,400 0,266.8';
</script>

<template>
  <figure class="doss-map">
    <div class="doss-stage">
      <svg class="doss-stage-blank" viewBox="0 0 800 400" preserveAspectRatio="none" aria-hidden="true" focusable="false">
        <defs>
          <pattern :id="uid + '-hex'" width="72" height="41.57" patternUnits="userSpaceOnUse">
            <path class="doss-stage-hex" d="M0 20.78 12 0h24l12 20.78-12 20.79H12zM48 20.78h24" />
          </pattern>
          <clipPath :id="uid + '-diamond'">
            <polygon :points="DIAMOND" />
          </clipPath>
        </defs>
        <polygon class="doss-stage-field" :points="DIAMOND" />
        <rect width="800" height="400" :fill="'url(#' + uid + '-hex)'" :clip-path="'url(#' + uid + '-diamond)'" />
      </svg>
      <div class="doss-scan" aria-hidden="true"><div class="doss-scan-beam"></div></div>
      <p class="doss-stage-note">Surface map arrives with the orbit view.</p>
    </div>
    <figcaption class="doss-map-caption">
      <p v-if="badge" class="ui-badge doss-badge"><Icon name="star" :size="10.5" /><span>{{ badge }}</span></p>
      <span class="doss-hint">Surface map</span>
    </figcaption>
  </figure>
</template>

<style>
.doss-map {
  flex: 0 0 auto;
  width: min(100%, var(--panel-column));
  margin: 0 auto 14px;
}

.doss-stage {
  position: relative;
  aspect-ratio: 800 / 400;
  overflow: hidden;
}

.doss-stage-blank {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.doss-stage-field {
  fill: var(--bg-0);
}

.doss-stage-hex {
  fill: none;
  stroke: var(--signal-dim);
  stroke-width: 1;
  opacity: 0.6;
}

.doss-stage-note {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  margin: 0;
  padding: 0 var(--sp-6);
  color: var(--text-muted);
  font: 400 12px/1.4 var(--font-text);
  text-align: center;
}

/* The legacy scanner field and beam (.map-scan-field, .map-scan-beam), one pass down. */
.doss-scan {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  clip-path: polygon(0% 0%, 10% 33.3%, 20% 0%, 30% 33.3%, 40% 0%, 50% 33.3%, 60% 0%, 70% 33.3%, 80% 0%, 90% 33.3%, 100% 0%,
    100% 66.7%, 90% 100%, 80% 66.7%, 70% 100%, 60% 66.7%, 50% 100%, 40% 66.7%, 30% 100%, 20% 66.7%, 10% 100%, 0% 66.7%);
}

.doss-scan-beam {
  position: absolute;
  left: 0;
  right: 0;
  top: -100%;
  height: 200%;
  mix-blend-mode: screen;
  background: linear-gradient(to bottom, transparent 42%,
    color-mix(in srgb, var(--signal) 8%, transparent) 45.5%,
    color-mix(in srgb, var(--signal) 32%, transparent) 49.3%,
    var(--signal-bright) 49.85%, var(--signal) 50.1%,
    color-mix(in srgb, var(--signal) 32%, transparent) 50.7%,
    color-mix(in srgb, var(--signal) 8%, transparent) 54.5%, transparent 58%);
  opacity: 0;
  animation: doss-scan-down var(--t-scan) var(--ease-scan) 1 both;
}

@keyframes doss-scan-down {
  from { transform: translateY(0); opacity: 1; }
  85% { opacity: 1; }
  to { transform: translateY(50%); opacity: 0; }
}

.doss-map-caption {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 28px;
  padding-top: 8px;
  font-size: 11.5px;
  line-height: 1.3;
}

.doss-hint {
  margin-left: auto;
  color: var(--text-muted);
  white-space: nowrap;
}

@media (prefers-reduced-motion: reduce) {
  .doss-scan {
    display: none;
  }
}
</style>
