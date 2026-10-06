<script setup lang="ts">
/**
 * Day and night as a picture: one solar day drawn as a strip of light and dark over a ruler
 * of familiar units. The day itself is given in hours, the world's own measure; a long one is
 * then restated in standard days (24 hours) so it can be held against something known:
 * "4,911 hours, which is 205 standard days: 102 of light, 102 of dark". A second strip shows
 * how the daylight at 45° swings over the year, and is left out when it would be the same
 * strip again. The numbers are
 * orbit/daynight.ts dayNightFigure: geometry from the solar day and the axial tilt, with no
 * refraction, eclipses or terrain.
 */
import { computed } from 'vue';
import { spanText, type DayNightFigure, type StarportTick } from '../orbit/daynight.ts';

const props = defineProps<{
    figure: DayNightFigure;
    /** Local time at the starport (longitude 0), or null when this world has no day. */
    tick?: StarportTick | null;
}>();

const showTick = computed(() => !props.figure.locked && !!props.tick && Number.isFinite(props.tick.at));

const NOTE = 'Geometry only: the share of the solar day the star is above the horizon, from the axial tilt. No refraction, eclipses or terrain.';

/** The 45° strip: solid light, then the part that is light only in summer, then dark. */
const mid = computed(() => {
    const m = props.figure.mid;
    const day = props.figure.dayHours;
    if (!m || !(day > 0)) return null;
    const flat = m.longest - m.shortest < day * 0.02;
    // No swing worth drawing: the equator's strip already says it, at every latitude.
    if (flat) return null;
    return {
        sure: (m.shortest / day) * 100,
        swing: ((m.longest - m.shortest) / day) * 100,
        text: (m.shortest <= 0 ? 'no light' : spanText(m.shortest) + ' of light') + ' in winter, '
            + (m.longest >= day ? 'no dark' : spanText(m.longest)) + ' in summer',
        label: 'At ' + m.latitude + '° latitude' + (m.derived ? ' (parent’s tilt)' : ''),
    };
});

/** One strip stands for the whole world when the tilt is too slight to change the day with latitude or season. */
const uniform = computed(() => props.figure.mid !== null && mid.value === null);

const summary = computed(() => {
    const f = props.figure;
    if (f.locked) return 'No day and night: one face always points at the star.';
    const where = showTick.value && props.tick ? ' Starport, ' + props.tick.time + '.' : '';
    return 'One day lasts ' + f.span + (f.standard ? ', which is ' + f.standard : '') + ': '
        + spanText(f.equator.light) + ' of light and ' + spanText(f.equator.dark) + ' of dark at the equator.' + where;
});
</script>

<template>
  <section class="doss-section doss-daynight">
    <h3 class="ui-heading" :title="NOTE">Day and night</h3>
    <template v-if="figure.locked">
      <p class="doss-day-lead"><b>No day and night</b><span>one face always points at the star</span></p>
      <div class="doss-day-row">
        <div class="doss-day-ends"><span>Day side</span><span>Night side</span></div>
        <div class="doss-day-strip" role="img" :aria-label="summary">
          <i class="doss-day-light" style="width: 50%"></i>
        </div>
      </div>
    </template>
    <template v-else>
      <p class="doss-day-lead">
        <b>{{ figure.span }}</b>
        <span>from one sunrise to the next<template v-if="figure.retrograde">; the star rises in the west</template></span>
      </p>
      <p v-if="figure.standard" class="doss-day-same">That is <b>{{ figure.standard }}</b> (a standard day is 24 hours)</p>
      <div class="doss-day-row">
        <div class="doss-day-ends">
          <span>Light {{ spanText(figure.equator.light) }}</span>
          <span>Dark {{ spanText(figure.equator.dark) }}</span>
        </div>
        <p v-if="showTick && tick" class="doss-day-port" :style="{ '--at': String(tick.at) }"><span>Starport {{ tick.time }}</span></p>
        <div class="doss-day-strip" role="img" :aria-label="summary" :style="{ '--marks': figure.ruler.count }">
          <i class="doss-day-light" style="width: 50%"></i>
          <i class="doss-day-marks"></i>
          <i v-if="showTick && tick" class="doss-day-now" :style="{ '--at': String(tick.at) }"></i>
        </div>
        <p class="doss-day-caption">{{ uniform ? 'The same all year, at every latitude short of the poles' : 'At the equator, all year' }}</p>
      </div>
      <div v-if="mid" class="doss-day-row">
        <div class="doss-day-strip" role="img" :aria-label="mid.label + ': ' + mid.text" :style="{ '--marks': figure.ruler.count }">
          <i class="doss-day-light" :style="{ width: mid.sure + '%' }"></i>
          <i class="doss-day-swing" :style="{ left: mid.sure + '%', width: mid.swing + '%' }"></i>
          <i class="doss-day-marks"></i>
          <i v-if="showTick && tick" class="doss-day-now" :style="{ '--at': String(tick.at) }"></i>
        </div>
        <p class="doss-day-caption">{{ mid.label }}: {{ mid.text }}</p>
      </div>
      <p class="doss-day-key">
        <span><i class="doss-day-tick"></i>Each mark is {{ figure.ruler.label }}</span>
        <span v-if="mid"><i class="doss-day-swatch"></i>Light in summer only</span>
        <span v-if="figure.polarBeyond !== null">Polar day and night beyond {{ figure.polarBeyond }}° latitude</span>
      </p>
    </template>
  </section>
</template>

<style>
/* The whole of day and night in one card, like the tiles above it. */
.doss-daynight {
  padding: 10px 12px 12px;
  border: 1px solid var(--line-soft);
  border-radius: var(--r-3);
  background: var(--panel-raised);
}

.doss-daynight > .ui-heading {
  margin-top: 0;
}

.doss-day-lead {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 2px 10px;
  margin: 0 0 10px;
}

.doss-day-lead b {
  color: var(--text-0);
  font-size: 20px;
  font-weight: 600;
  font-variant-numeric: var(--tabular);
  line-height: 1.2;
}

.doss-day-lead span {
  color: var(--text-muted);
  font-size: 12px;
}

.doss-day-same {
  margin: -6px 0 10px;
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.35;
}

.doss-day-same b {
  color: var(--text-1);
  font-weight: 600;
  font-variant-numeric: var(--tabular);
}

.doss-day-row + .doss-day-row {
  margin-top: 10px;
}

.doss-day-ends {
  display: flex;
  justify-content: space-between;
  margin-bottom: 4px;
  color: var(--text-1);
  font-size: 12px;
  font-weight: 600;
  font-variant-numeric: var(--tabular);
}

/* One solar day, left to right: light, then dark. */
.doss-day-strip {
  position: relative;
  height: 22px;
  overflow: hidden;
  border: 1px solid var(--line-2);
  border-radius: var(--r-2);
  background: var(--night-sky);
}

.doss-day-strip i {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
}

.doss-day-light {
  background: var(--daylight);
}

/* The part of the day that is light in summer and dark in winter. */
.doss-day-swing,
.doss-day-swatch {
  background: repeating-linear-gradient(135deg, var(--daylight) 0 3px, var(--night-sky) 3px 6px);
}

/* The ruler: a mark every hour, day or ten days, whichever keeps it readable. */
.doss-day-marks {
  right: 0;
  top: auto !important;
  height: 7px;
  background-image: repeating-linear-gradient(to right, var(--bg-0) 0 1px, transparent 1px calc(100% / var(--marks)));
  opacity: 0.75;
}

.doss-day-caption {
  margin: 4px 0 0;
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.35;
}

.doss-day-key {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
  margin: 10px 0 0;
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.35;
}

.doss-day-key span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.doss-day-tick {
  width: 1px;
  height: 9px;
  background: var(--text-muted);
}

/* The starport, at longitude 0. The words ride the same share of the strip as the mark. */
.doss-day-port {
  position: relative;
  height: 16px;
  margin: 0 0 2px;
}

.doss-day-port span {
  position: absolute;
  top: 0;
  left: calc(var(--at) * 100%);
  color: var(--text-0);
  font-size: 12px;
  font-weight: 600;
  font-variant-numeric: var(--tabular);
  line-height: 16px;
  white-space: nowrap;
  transform: translateX(calc(var(--at) * -100%));
  transition: left var(--t-fast) var(--ease-out), transform var(--t-fast) var(--ease-out);
}

.doss-day-strip .doss-day-now {
  left: calc(var(--at) * 100%);
  z-index: 1;
  width: 1px;
  background: var(--text-0);
  box-shadow: 0 0 0 1px var(--bg-0);
  transform: translateX(-50%);
  transition: left var(--t-fast) var(--ease-out);
}

@media (prefers-reduced-motion: reduce) {
  .doss-day-port span,
  .doss-day-strip .doss-day-now {
    transition: none;
  }
}

.doss-day-swatch {
  width: 14px;
  height: 9px;
  border-radius: 2px;
}
</style>
