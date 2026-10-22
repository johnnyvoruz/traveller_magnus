<script setup lang="ts">
/**
 * System Comms (CC1, CC1b). One transmitter, bars only, above the planet tabs.
 * Playback is this receiver's word reveal. The controller decides when a line plays.
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { createCommsController, type CommsController } from './comms/controller.ts';
import { commsGradientIds, mountCommsReceiver, type CommsMessage, type CommsReceiver as Screen, type CommsTheme } from './comms/receiver_render.ts';
import type { SystemFacts } from './facts.ts';

const props = defineProps<{
    facts: SystemFacts | null;
    truthVersion: string;
    campaignKey: string;
    /** Chatter on, and this system view is showing. */
    shown: boolean;
    /** The address carried mayday. The controller plays the archive once, even when shown is false. */
    mayday?: boolean;
}>();

const rootEl = ref<HTMLElement | null>(null);
const themeMode = ref<CommsTheme>('normal');
const ids = commsGradientIds();
let receiver: Screen | null = null;
let ctl: CommsController | null = null;

function push(): void {
    ctl?.update({
        facts: props.facts,
        truthVersion: props.truthVersion,
        campaignKey: props.campaignKey,
        shown: props.shown,
        mayday: props.mayday,
    });
}

onMounted(() => {
    const root = rootEl.value;
    if (!root) return;
    let done = () => {};
    const screen = mountCommsReceiver(root, { onTranscriptComplete: () => done() });
    receiver = screen;
    ctl = createCommsController({
        screen: {
            transmit: screen.transmit,
            idle: screen.idle,
            onTranscriptComplete: (cb) => { done = cb; },
            theme: (mode) => {
                themeMode.value = mode;
                screen.theme(mode);
            },
            destroy: screen.destroy,
        },
    });
    push();
});

watch(() => [props.facts, props.truthVersion, props.campaignKey, props.shown, props.mayday] as const, push);

onBeforeUnmount(() => {
    ctl?.destroy();
    ctl = null;
    receiver?.destroy();
    receiver = null;
});

function transmit(msg: CommsMessage): void {
    receiver?.transmit(msg);
}

function idle(opts?: { keepLast?: boolean }): void {
    receiver?.idle(opts);
}

defineExpose({ transmit, idle });
</script>

<template>
  <section
    ref="rootEl"
    class="trx-receiver"
    data-mode="idle"
    data-waveform="bars"
    :data-comms-theme="themeMode"
    role="region"
    aria-label="System Comms"
  >
    <div class="trx-rim">
      <div class="trx-rim-alert" aria-hidden="true"></div>
      <div class="trx-panel">
        <div class="trx-microline trx-microline--top" aria-hidden="true"><b></b><i></i><i></i><i></i></div>
        <header class="trx-header">
          <div class="trx-brand">
            <span class="trx-antenna" aria-hidden="true">
              <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path class="trx-air trx-air--far" d="M7.2 5.1c-6.3 6.5-6.3 15.3 0 21.8M24.8 5.1c6.3 6.5 6.3 15.3 0 21.8" />
                <path class="trx-air trx-air--near" d="M10.9 8.5c-3.8 4.3-3.8 9.7 0 14M21.1 8.5c3.8 4.3 3.8 9.7 0 14" />
                <g class="trx-tower-broadcast" aria-hidden="true">
                  <path class="trx-tower-ping trx-tower-ping--a" d="M10.9 8.5c-3.8 4.3-3.8 9.7 0 14M21.1 8.5c3.8 4.3 3.8 9.7 0 14" />
                  <path class="trx-tower-ping trx-tower-ping--b" d="M10.9 8.5c-3.8 4.3-3.8 9.7 0 14M21.1 8.5c3.8 4.3 3.8 9.7 0 14" />
                  <path class="trx-tower-ping trx-tower-ping--c" d="M10.9 8.5c-3.8 4.3-3.8 9.7 0 14M21.1 8.5c3.8 4.3 3.8 9.7 0 14" />
                </g>
                <circle class="trx-antenna-dot" cx="16" cy="14" r="2.7" />
                <path class="trx-antenna-mast" d="M16 16.5v10.2M12.8 27l3.2-9 3.2 9M13.6 23.6h4.8" />
              </svg>
            </span>
            <span class="trx-heading">SYSTEM COMMS</span>
          </div>
          <div class="trx-top-status">
            <span class="trx-live-dot" aria-hidden="true"></span>
            <span data-trx-status>MONITORING</span>
            <span class="trx-counter" data-trx-clock>00:00:00</span>
          </div>
        </header>
        <div class="trx-rule" aria-hidden="true"></div>
        <div class="trx-metadata" aria-label="Channel details">
          <span class="trx-chip trx-chip--cyan" data-trx-channel>CH 03</span>
          <span class="trx-chip trx-chip--channel" data-trx-kind>LOCAL APPROACH</span>
          <span class="trx-chip trx-chip--label">SRC</span>
          <span class="trx-chip trx-chip--source" data-trx-source>PORT CONTROL</span>
          <span class="trx-chip trx-chip--signal"><b>SIG</b><span class="trx-sigbars" data-trx-sig data-signal="0" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span></span>
        </div>
        <div class="trx-copy" data-trx-copy>
          <div class="trx-speaker" data-trx-speaker>OPEN BAND</div>
          <div class="trx-transcription" data-trx-words><span class="trx-idle-label">Awaiting transmission</span></div>
          <span class="trx-a11y" aria-live="polite" aria-atomic="true" data-trx-a11y></span>
        </div>
        <div class="trx-wave-frame" aria-hidden="true">
          <div class="trx-wave-headline"><span>LOCAL SIGNAL</span><span data-trx-band>OPEN BAND</span></div>
          <svg
            class="trx-wave"
            viewBox="0 0 700 43"
            preserveAspectRatio="none"
            xmlns="http://www.w3.org/2000/svg"
            :style="{ '--trx-spectrum': `url(#${ids.spectrum})` }"
          >
            <defs>
              <linearGradient :id="ids.spectrum" x1="0" y1="0" x2="1" y2="0">
                <stop class="trx-stop-0" offset="0" />
                <stop class="trx-stop-1" offset="0.29" />
                <stop class="trx-stop-2" offset="0.47" />
                <stop class="trx-stop-3" offset="0.64" />
                <stop class="trx-stop-4" offset="0.84" />
                <stop class="trx-stop-5" offset="1" />
              </linearGradient>
              <linearGradient :id="ids.glow" x1="0" y1="0" x2="1" y2="0">
                <stop class="trx-glow-stop" offset="0" stop-opacity="0" />
                <stop class="trx-glow-stop" offset="0.5" stop-opacity="0.23" />
                <stop class="trx-glow-stop" offset="1" stop-opacity="0" />
              </linearGradient>
            </defs>
            <path class="trx-wave-guide" d="M0 8H700 M0 21.5H700 M0 35H700" />
            <path class="trx-wave-ticks" d="" data-trx-ticks />
            <path class="trx-wave-under" d="M0 21.5H700" data-trx-ghost />
            <path class="trx-wave-trace" d="M0 21.5H700" data-trx-trace />
            <rect class="trx-wave-playhead-halo" x="0" y="0" width="18" height="43" :fill="`url(#${ids.glow})`" data-trx-headhalo />
            <line class="trx-wave-playhead" x1="0" y1="2" x2="0" y2="41" data-trx-playhead />
          </svg>
          <div class="trx-wave-endcap"></div>
        </div>
        <div class="trx-microline trx-microline--bottom" aria-hidden="true"><b></b><i></i><i></i></div>
      </div>
    </div>
  </section>
</template>

<style>
.trx-receiver {
  --trx-line: rgba(59, 186, 189, 0.48);
  --trx-chip-glow: rgba(31, 177, 175, 0.07);
  --trx-chip-inset: rgba(41, 156, 153, 0.08);
  --trx-sig-glow: rgba(85, 251, 230, 0.17);
  --trx-text-glow: rgba(111, 250, 230, 0.23);
  --trx-caret-glow: rgba(97, 255, 236, 0.86);
  --trx-trace-glow: rgba(74, 235, 222, 0.38);
  --trx-rule: rgba(66, 183, 183, 0.29);
  --trx-rule-hot: rgba(100, 251, 235, 0.68);
  --trx-rule-dot: rgba(83, 237, 217, 0.45);
  --trx-counter-line: rgba(91, 198, 197, 0.24);
  --trx-wave-line: rgba(70, 162, 165, 0.22);
  --trx-micro-dot: rgba(82, 222, 214, 0.65);
  --trx-wash: rgba(42, 167, 158, 0.13);
  --trx-scan: rgba(85, 215, 205, 0.13);
  --trx-sweep: rgba(194, 255, 247, 0.95);
  --trx-sweep-glow: rgba(96, 255, 243, 0.7);
  --trx-rim-glow: rgba(68, 223, 216, 0.15);
  --trx-rim-a: rgba(92, 246, 230, 0.97);
  --trx-rim-b: rgba(57, 185, 182, 0.55);
  --trx-rim-c: rgba(49, 167, 164, 0.28);
  --trx-rim-d: rgba(109, 255, 236, 0.95);
  --comms-theme-ms: var(--comms-theme-out);
  box-sizing: border-box;
  width: 100%;
  height: 240px;
  position: relative;
  color: var(--comms-ink);
  font-family: var(--font-text);
  isolation: isolate;
  filter: drop-shadow(0 10px 26px rgba(0, 0, 0, 0.53));
  animation: trx-materialize 0.62s cubic-bezier(0.18, 0.72, 0.21, 1) both;
  pointer-events: none;
}
.trx-receiver[data-comms-theme="emergency"] {
  --comms-theme-ms: var(--comms-theme-in);
  --comms-cyan: var(--comms-emergency-hi);
  --comms-edge: var(--comms-emergency);
  --comms-sig: var(--comms-emergency-hi);
  --comms-speaker: var(--comms-emergency-hi);
  --comms-caret: var(--comms-emergency-hi);
  --comms-guide: var(--comms-emergency);
  --comms-ticks: var(--comms-emergency);
  --comms-under: var(--comms-emergency-hi);
  --comms-playhead: var(--comms-emergency-hi);
  --comms-playhead-core: var(--comms-emergency);
  --comms-endcap: var(--comms-emergency-hi);
  --comms-endcap-glow: var(--comms-emergency-glow);
  --comms-micro: var(--comms-emergency-hi);
  --comms-micro-glow: var(--comms-emergency-glow);
  --comms-bar-0: var(--comms-emergency);
  --comms-bar-1: var(--comms-emergency-hi);
  --comms-bar-3: var(--comms-emergency-hi);
  --comms-bar-5: var(--comms-emergency);
  --comms-glow: var(--comms-emergency-hi);
  --trx-line: color-mix(in srgb, var(--comms-emergency) 48%, transparent);
  --trx-chip-glow: var(--comms-emergency-glow);
  --trx-chip-inset: color-mix(in srgb, var(--comms-emergency) 16%, transparent);
  --trx-sig-glow: var(--comms-emergency-glow);
  --trx-text-glow: var(--comms-emergency-glow);
  --trx-caret-glow: var(--comms-emergency-glow);
  --trx-trace-glow: var(--comms-emergency-glow);
  --trx-rule: color-mix(in srgb, var(--comms-emergency) 35%, transparent);
  --trx-rule-hot: color-mix(in srgb, var(--comms-emergency-hi) 70%, transparent);
  --trx-rule-dot: color-mix(in srgb, var(--comms-emergency-hi) 45%, transparent);
  --trx-counter-line: color-mix(in srgb, var(--comms-emergency) 28%, transparent);
  --trx-wave-line: color-mix(in srgb, var(--comms-emergency) 28%, transparent);
  --trx-micro-dot: color-mix(in srgb, var(--comms-emergency-hi) 65%, transparent);
  --trx-wash: var(--comms-emergency-glow);
  --trx-scan: color-mix(in srgb, var(--comms-emergency) 18%, transparent);
  --trx-sweep: color-mix(in srgb, var(--comms-emergency-hi) 90%, transparent);
  --trx-sweep-glow: var(--comms-emergency-glow);
  --trx-rim-glow: var(--comms-emergency-glow);
  --trx-rim-a: var(--comms-emergency-hi);
  --trx-rim-b: color-mix(in srgb, var(--comms-emergency) 55%, transparent);
  --trx-rim-c: color-mix(in srgb, var(--comms-emergency) 28%, transparent);
  --trx-rim-d: var(--comms-emergency-hi);
}
.trx-receiver *, .trx-receiver *::before, .trx-receiver *::after { box-sizing: border-box; }
.trx-rim {
  position: relative;
  height: 100%;
  padding: 1px;
  clip-path: polygon(0 12px, 12px 0, calc(100% - 12px) 0, 100% 12px, 100% calc(100% - 12px), calc(100% - 12px) 100%, 12px 100%, 0 calc(100% - 12px));
  background: linear-gradient(110deg, var(--trx-rim-a), var(--trx-rim-b) 25%, var(--trx-rim-c) 61%, var(--trx-rim-d) 100%);
  box-shadow: 0 0 18px var(--trx-rim-glow);
}
.trx-rim-alert {
  position: absolute;
  inset: 0;
  z-index: 0;
  opacity: 0;
  pointer-events: none;
  background: linear-gradient(110deg, var(--comms-emergency-hi), var(--comms-emergency) 25%, transparent 61%, var(--comms-emergency-hi));
  transition: opacity var(--comms-theme-ms) ease;
}
.trx-receiver[data-comms-theme="emergency"] .trx-rim-alert { opacity: 1; }
.trx-panel {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  padding: 13px 17px 11px;
  overflow: hidden;
  clip-path: polygon(0 12px, 12px 0, calc(100% - 12px) 0, 100% 12px, 100% calc(100% - 12px), calc(100% - 12px) 100%, 12px 100%, 0 calc(100% - 12px));
  background:
    radial-gradient(ellipse at 86% -25%, var(--trx-wash), transparent 59%),
    linear-gradient(160deg, rgba(3, 24, 31, 0.966), rgba(1, 12, 20, 0.971) 68%, rgba(1, 26, 33, 0.95));
}
.trx-panel::before {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0.22;
  background: repeating-linear-gradient(to bottom, transparent 0, transparent 4px, var(--trx-scan) 5px, transparent 6px);
}
.trx-panel::after {
  content: "";
  position: absolute;
  left: -45%;
  top: 0;
  height: 1px;
  width: 32%;
  background: linear-gradient(90deg, transparent, var(--trx-sweep), transparent);
  box-shadow: 0 0 10px var(--trx-sweep-glow);
  animation: trx-edge-sweep 13s linear infinite;
  pointer-events: none;
}
.trx-header, .trx-brand, .trx-top-status, .trx-metadata, .trx-sigbars, .trx-wave-headline { display: flex; align-items: center; }
.trx-header { position: relative; z-index: 1; flex: none; justify-content: space-between; gap: 8px; min-height: 22px; }
.trx-brand { gap: 9px; min-width: 0; }
.trx-antenna { height: 25px; width: 25px; flex: none; display: block; margin: -2px 0; opacity: 0.9; }
.trx-antenna svg { display: block; width: 100%; height: 100%; overflow: visible; }
.trx-air { stroke: var(--comms-amber); stroke-width: 1.8; stroke-linecap: round; opacity: 0.68; stroke-dasharray: 40; }
.trx-air--near { opacity: 0.88; }
.trx-antenna-dot { fill: var(--comms-amber); filter: drop-shadow(0 0 4px rgba(255, 201, 102, 0.6)); }
.trx-antenna-mast { stroke: var(--comms-amber); stroke-linecap: round; stroke-linejoin: round; stroke-width: 1.7; }
.trx-heading {
  white-space: nowrap;
  color: var(--comms-amber);
  font-size: 10px;
  line-height: 1;
  font-weight: 800;
  letter-spacing: 0.22em;
  text-shadow: 0 0 12px rgba(249, 192, 80, 0.15);
}
.trx-top-status {
  font: 700 9px/1 var(--font-code);
  letter-spacing: 0.12em;
  gap: 7px;
  color: var(--comms-status);
  white-space: nowrap;
}
.trx-live-dot {
  width: 5px;
  height: 5px;
  flex: none;
  border-radius: 50%;
  background: var(--comms-amber);
  opacity: 0.82;
  box-shadow: 0 0 6px rgba(255, 197, 77, 0.26);
}
.trx-counter {
  border-left: 1px solid var(--trx-counter-line);
  padding-left: 9px;
  margin-left: 4px;
  letter-spacing: 0.03em;
  font-variant-numeric: tabular-nums;
  color: var(--comms-clock);
}
.trx-rule { flex: none; height: 10px; margin-top: 3px; position: relative; border-bottom: 1px solid var(--trx-rule); }
.trx-rule::before { content: ""; position: absolute; width: 34%; bottom: -1px; left: 0; border-bottom: 1px solid var(--trx-rule-hot); }
.trx-rule::after { content: ""; position: absolute; right: 14%; bottom: -2px; width: 29px; border-bottom: 3px dotted var(--trx-rule-dot); }
.trx-metadata {
  z-index: 1;
  position: relative;
  display: grid;
  align-items: center;
  grid-template-columns: 48px 113px 36px minmax(0, 1fr) 89px;
  gap: 5px;
  flex: none;
  margin-top: 10px;
  width: 100%;
  min-width: 0;
  overflow: hidden;
}
.trx-chip {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 25px;
  padding: 0 7px;
  white-space: nowrap;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  border: 1px solid var(--trx-line);
  border-radius: 3px;
  background: rgba(9, 44, 52, 0.44);
  box-shadow: inset 0 0 9px var(--trx-chip-inset), 0 0 8px var(--trx-chip-glow);
  font: 700 9px/1.2 var(--font-code);
  letter-spacing: 0.02em;
  color: var(--comms-chip);
}
.trx-chip--cyan, .trx-chip--label { color: var(--comms-cyan); text-shadow: 0 0 9px var(--trx-text-glow); }
.trx-chip--channel {
  display: block;
  width: 100%;
  line-height: 23px;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--comms-channel);
  font-size: 8px;
  letter-spacing: 0.01em;
}
.trx-chip--source {
  display: block;
  width: 100%;
  line-height: 23px;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: left;
  font-size: 8.5px;
}
.trx-chip--signal { width: 89px; justify-self: end; gap: 6px; padding: 0 6px 0 7px; }
.trx-chip--signal b { color: var(--comms-cyan); font: 700 9px/1 var(--font-code); }
.trx-sigbars { height: 13px; gap: 2px; align-items: flex-end; }
.trx-sigbars i {
  width: 3px;
  height: 7px;
  flex: none;
  background: var(--comms-sig);
  box-shadow: 0 0 4px var(--trx-sig-glow);
  opacity: 0;
  transform: scaleY(0);
  transform-origin: bottom;
}
.trx-sigbars i:nth-child(3n) { height: 10px; }
.trx-sigbars i:nth-child(4n) { height: 12px; }
.trx-sigbars i:nth-last-child(-n + 2) { background: var(--comms-sig-end); }
.trx-copy {
  z-index: 1;
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
  padding-top: 14px;
  opacity: 1;
  transform: translateY(0);
  filter: blur(0);
  transition: opacity 0.44s cubic-bezier(0.36, 0, 0.2, 1), transform 0.44s cubic-bezier(0.36, 0, 0.2, 1), filter 0.44s cubic-bezier(0.36, 0, 0.2, 1);
}
.trx-speaker {
  font: 700 9px/1.2 var(--font-code);
  letter-spacing: 0.16em;
  color: var(--comms-speaker);
  margin-bottom: 7px;
  min-height: 11px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.trx-transcription {
  min-height: 0;
  overflow: hidden;
  font: 600 13px/1.44 var(--font-text);
  letter-spacing: 0.006em;
  color: var(--comms-ink);
  text-wrap: pretty;
}
.trx-word { display: inline-block; margin-right: 0.27em; animation: trx-word-on 0.23s cubic-bezier(0.17, 0.66, 0.24, 1) both; }
.trx-caret {
  display: inline-block;
  vertical-align: -2px;
  width: 1.7px;
  height: 14px;
  margin-left: 1px;
  background: var(--comms-caret);
  box-shadow: 0 0 8px var(--trx-caret-glow);
  animation: trx-caret 0.83s steps(1) infinite;
}
.trx-idle-label { font: 500 11px/1.4 var(--font-code); letter-spacing: 0.06em; color: var(--comms-idle); }
.trx-wave-frame { flex: none; height: 47px; position: relative; z-index: 1; border-top: 1px solid var(--trx-wave-line); margin-top: 2px; }
.trx-wave-headline {
  height: 11px;
  justify-content: space-between;
  font: 600 7px/1 var(--font-code);
  letter-spacing: 0.13em;
  color: var(--comms-wave-label);
  opacity: 0.85;
}
.trx-wave { display: block; width: 100%; height: 34px; overflow: hidden; }
.trx-wave-guide { fill: none; stroke: var(--comms-guide); stroke-width: 0.65; stroke-opacity: 0.26; stroke-dasharray: 2 4; }
.trx-wave-ticks { fill: none; stroke: var(--comms-ticks); stroke-width: 0.5; stroke-opacity: 0.25; }
.trx-wave-under { fill: none; stroke: var(--comms-under); stroke-width: 1.05; opacity: 0; }
.trx-wave-trace {
  fill: none;
  stroke: var(--trx-spectrum);
  stroke-width: 2.5;
  stroke-linecap: round;
  opacity: 0.93;
  filter: drop-shadow(0 0 2px var(--trx-trace-glow));
}
.trx-wave-playhead {
  stroke: var(--comms-playhead);
  stroke-width: 1.1;
  filter: drop-shadow(0 0 3px var(--comms-playhead-core));
}
.trx-wave-endcap {
  width: 15px;
  height: 1px;
  position: absolute;
  right: 0;
  bottom: 0;
  background: var(--comms-endcap);
  box-shadow: 0 0 5px var(--comms-endcap-glow);
}
.trx-microline { position: absolute; pointer-events: none; display: flex; gap: 5px; align-items: center; }
.trx-microline--top { top: 1px; right: 15px; }
.trx-microline--bottom { bottom: 1px; left: 15px; }
.trx-microline b { width: 29px; height: 2px; background: var(--comms-micro); box-shadow: 0 0 9px var(--comms-micro-glow); }
.trx-microline i { width: 2px; height: 2px; background: var(--trx-micro-dot); }
.trx-a11y { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
.trx-rim,
.trx-panel,
.trx-panel::before,
.trx-panel::after,
.trx-rule,
.trx-rule::before,
.trx-rule::after,
.trx-counter,
.trx-sigbars i,
.trx-speaker,
.trx-caret,
.trx-wave-frame,
.trx-wave-guide,
.trx-wave-ticks,
.trx-wave-trace,
.trx-wave-playhead,
.trx-wave-endcap,
.trx-microline b,
.trx-microline i,
.trx-stop-0,
.trx-stop-1,
.trx-stop-2,
.trx-stop-3,
.trx-stop-4,
.trx-stop-5,
.trx-glow-stop {
  transition-property: color, border-color, background-color, fill, stroke, box-shadow, filter, stop-color, text-shadow;
  transition-duration: var(--comms-theme-ms);
  transition-timing-function: ease;
}
.trx-stop-0 { stop-color: var(--comms-bar-0); }
.trx-stop-1 { stop-color: var(--comms-bar-1); }
.trx-stop-2 { stop-color: var(--comms-bar-2); }
.trx-stop-3 { stop-color: var(--comms-bar-3); }
.trx-stop-4 { stop-color: var(--comms-bar-4); }
.trx-stop-5 { stop-color: var(--comms-bar-5); }
.trx-glow-stop { stop-color: var(--comms-glow); }
.trx-top-status [data-trx-status] { display: inline-block; min-width: 73px; text-align: right; transition: opacity 0.245s cubic-bezier(0.33, 0, 0.2, 1); }
.trx-wave-headline [data-trx-band] { display: inline-block; text-align: right; min-width: 80px; transition: opacity 0.245s cubic-bezier(0.33, 0, 0.2, 1); }
.trx-chip {
  transition-property: color, border-color, background-color, box-shadow, text-shadow;
  transition-duration: var(--comms-theme-ms);
  transition-timing-function: ease;
}
.trx-chip--source, .trx-chip--channel, .trx-metadata [data-trx-channel] {
  transition-property: opacity, color, border-color, background-color, box-shadow, text-shadow;
  transition-duration: 0.245s, var(--comms-theme-ms), var(--comms-theme-ms), var(--comms-theme-ms), var(--comms-theme-ms), var(--comms-theme-ms);
  transition-timing-function: cubic-bezier(0.33, 0, 0.2, 1), ease, ease, ease, ease, ease;
}
.trx-receiver .trx-air--far { opacity: 0.14; }
.trx-receiver .trx-air--near { opacity: 0.2; }
.trx-antenna .trx-tower-ping {
  fill: none;
  stroke: var(--comms-amber);
  stroke-width: 1.45;
  stroke-linecap: round;
  vector-effect: non-scaling-stroke;
  transform-box: view-box;
  transform-origin: 50% 44%;
  opacity: 0;
  animation: trx-tower-send 3.9s cubic-bezier(0.3, 0.05, 0.22, 1) infinite;
}
.trx-antenna .trx-tower-ping--b { animation-delay: -1.3s; }
.trx-antenna .trx-tower-ping--c { animation-delay: -2.6s; }
@keyframes trx-materialize { from { opacity: 0; filter: blur(3px); } to { opacity: 1; filter: blur(0); } }
@keyframes trx-word-on { from { opacity: 0; filter: blur(2.8px); transform: translateY(3px); } to { opacity: 1; filter: blur(0); transform: translateY(0); } }
@keyframes trx-caret { 50% { opacity: 0; } }
@keyframes trx-edge-sweep { to { left: 125%; } }
@keyframes trx-tower-send {
  0% { transform: scale(0.56); opacity: 0; }
  16% { opacity: 0.52; }
  43% { opacity: 0.45; }
  78% { opacity: 0.16; }
  100% { transform: scale(1.38); opacity: 0; }
}
@media (max-width: 540px) {
  .trx-receiver { height: 212px; }
  .trx-panel { padding: 8px 12px 8px; }
  .trx-heading { font-size: 9px; letter-spacing: 0.13em; }
  .trx-chip { padding: 0 5px; height: 23px; }
  .trx-metadata { grid-template-columns: 45px 90px 32px minmax(0, 1fr) 71px; gap: 4px; }
  .trx-chip--channel, .trx-chip--source { line-height: 21px; }
  .trx-chip--channel { font-size: 7.5px; }
  .trx-chip--signal { width: 71px; padding: 0 4px; gap: 4px; }
  .trx-sigbars { gap: 1px; }
  .trx-sigbars i { width: 2px; }
  .trx-copy { padding-top: 8px; }
  .trx-transcription { font-size: 12px; }
  .trx-wave-frame { height: 40px; }
}
@media (max-width: 390px) {
  .trx-metadata { grid-template-columns: 42px 73px 29px minmax(0, 1fr) 58px; gap: 3px; }
  .trx-chip--channel { font-size: 7px; }
  .trx-chip--signal { width: 58px; padding: 0 3px; gap: 3px; }
  .trx-sigbars i:nth-child(-n + 3) { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .trx-receiver, .trx-receiver *, .trx-receiver *::before, .trx-receiver *::after { animation: none !important; transition: none !important; }
  .trx-copy { filter: none !important; transform: none !important; }
  .trx-antenna .trx-tower-ping { animation: none !important; opacity: 0 !important; }
  .trx-receiver .trx-air--near { opacity: 0.7; }
  .trx-receiver .trx-air--far { opacity: 0.45; }
}
</style>
