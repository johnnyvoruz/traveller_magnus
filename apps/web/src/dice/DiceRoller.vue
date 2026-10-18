<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { locatorHeight, nextFrame, onPageResize, prefersReducedMotion } from '../platform/browser.ts';
import { closeRoller, diceAsk } from './command.ts';
import DiceButton from './DiceButton.vue';
import { d3Face } from './roll.ts';

const PIPS: Record<number, number[]> = {
    1: [5],
    2: [3, 7],
    3: [3, 5, 7],
    4: [1, 3, 7, 9],
    5: [1, 3, 5, 7, 9],
    6: [1, 3, 4, 6, 7, 9],
};

const SIDES = [
    { name: 'f1', value: 1 },
    { name: 'f6', value: 6 },
    { name: 'f3', value: 3 },
    { name: 'f4', value: 4 },
    { name: 'f2', value: 2 },
    { name: 'f5', value: 5 },
] as const;

const SHOW: Record<number, [number, number]> = {
    1: [0, 0],
    6: [0, 180],
    3: [0, -90],
    4: [0, 90],
    2: [-90, 0],
    5: [90, 0],
};

const latest = computed(() => diceAsk.rolls[0] ?? null);
const title = computed(() => {
    const roll = latest.value;
    if (!roll) return '';
    if (roll.mode === 'boon') return 'Boon';
    if (roll.mode === 'bane') return 'Bane';
    if (roll.mode === 'd66') return 'D66';
    if (roll.mode === 'd3') return 'D3';
    if (roll.mode === '2d3') return '2D3';
    return `${roll.dice.length}D`;
});

const formula = computed(() => {
    const roll = latest.value;
    if (!roll || roll.dm === 0 || roll.mode === 'd66') return '';
    const sign = roll.dm > 0 ? '+' : '−';
    return `${title.value}${sign}${Math.abs(roll.dm)} = ${roll.total + roll.dm}`;
});

const shownTotal = computed(() => {
    const roll = latest.value;
    if (!roll) return '';
    if (roll.mode === 'd66') return String(roll.total);
    return String(roll.total + roll.dm);
});

const trayOn = ref(false);
const cardOn = ref(false);
const locatorPx = ref(0);
const cardPx = ref(0);
const cardEl = ref<HTMLElement | null>(null);

function readLocator(): void {
    locatorPx.value = locatorHeight();
    const node = cardEl.value;
    cardPx.value = node && node.getClientRects().length > 0 ? node.offsetHeight : 0;
}
const settled = ref(false);
const spinning = ref(false);
const transforms = ref<string[]>([]);
let timers: ReturnType<typeof setTimeout>[] = [];

function clearTimers(): void {
    for (const timer of timers) clearTimeout(timer);
    timers = [];
}

function facePose(face: number, tumble: boolean): string {
    const turn = SHOW[face] ?? [0, 0];
    if (!tumble) return `rotateX(${turn[0]}deg) rotateY(${turn[1]}deg)`;
    const kx = (2 + Math.floor(Math.random() * 2)) * 360;
    const ky = (2 + Math.floor(Math.random() * 2)) * 360;
    return `rotateX(${kx + turn[0]}deg) rotateY(${ky + turn[1]}deg) rotateZ(0deg)`;
}

function wildPose(): string {
    const x = Math.floor(Math.random() * 360);
    const y = Math.floor(Math.random() * 360);
    const z = Math.floor(Math.random() * 360);
    return `rotateX(${x}deg) rotateY(${y}deg) rotateZ(${z}deg)`;
}

function pipAt(pip: number): { gridRow: string; gridColumn: string } {
    return {
        gridRow: String(Math.floor((pip - 1) / 3) + 1),
        gridColumn: String(((pip - 1) % 3) + 1),
    };
}

function pipsFor(face: number): number[] {
    return PIPS[face] ?? [];
}

function dismiss(): void {
    clearTimers();
    trayOn.value = false;
    cardOn.value = false;
    settled.value = false;
    spinning.value = false;
}

function afterFrame(): Promise<void> {
    return new Promise((resolve) => { nextFrame(() => resolve()); });
}

async function play(): Promise<void> {
    const roll = diceAsk.rolls[0];
    if (!roll) return;
    clearTimers();
    cardOn.value = false;
    settled.value = false;
    spinning.value = false;
    trayOn.value = false;
    const reduced = prefersReducedMotion();
    transforms.value = roll.dice.map((face) => (reduced ? facePose(face, false) : wildPose()));
    await nextTick();
    trayOn.value = true;
    await nextTick();
    if (!reduced) {
        await afterFrame();
        spinning.value = true;
        transforms.value = roll.dice.map((face) => facePose(face, true));
    }
    const landed = reduced ? 150 : 1150;
    timers.push(setTimeout(() => {
        readLocator();
        cardOn.value = true;
        settled.value = true;
    }, landed));
    timers.push(setTimeout(() => { trayOn.value = false; }, landed + 800));
}

watch(() => diceAsk.played, (played) => {
    if (!played) {
        dismiss();
        return;
    }
    void play();
});

watch(cardOn, () => {
    void nextTick().then(readLocator);
});

function onKey(event: KeyboardEvent): void {
    if (!cardOn.value || event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    dismiss();
}

let stopResize = (): void => {};
onMounted(() => {
    document.addEventListener('keydown', onKey, true);
    readLocator();
    stopResize = onPageResize(readLocator);
});
onBeforeUnmount(() => {
    document.removeEventListener('keydown', onKey, true);
    stopResize();
    clearTimers();
});
</script>

<template>
  <Teleport to="body">
    <div v-if="latest && (trayOn || cardOn)" class="dice-tray" :class="{ 'is-on': trayOn }" aria-hidden="true">
      <div
        v-for="(face, index) in latest.dice"
        :key="'die-' + latest.id + '-' + index"
        class="die-wrap"
        :class="{ 'is-dropped': settled && !latest.kept[index] }"
      >
        <div class="die" :class="{ 'is-spin': spinning }" :style="{ transform: transforms[index] || facePose(face, false) }">
          <div v-for="side in SIDES" :key="side.name" class="face" :class="side.name">
            <span
              v-for="pip in PIPS[side.value]"
              :key="side.name + '-' + pip"
              class="pip"
              :class="{ 'is-one': side.value === 1 }"
              :style="pipAt(pip)"
            ></span>
          </div>
        </div>
      </div>
    </div>
    <div
      v-if="diceAsk.open"
      class="dice-bar"
      role="region"
      aria-label="Dice roller"
      :style="{ '--locator-height': locatorPx + 'px', '--dice-card-height': cardPx + 'px' }"
    >
      <DiceButton />
      <button type="button" class="dice-bar-x" @click="closeRoller">Close</button>
    </div>
    <div ref="cardEl" v-if="latest && cardOn" class="dice-card is-on" :style="{ '--locator-height': locatorPx + 'px' }" @click="dismiss">
      <button type="button" class="ui-btn is-icon dice-card-x" aria-label="Close dice" @click.stop="dismiss">×</button>
      <span class="dice-card-title">{{ formula || title }}</span>
      <span class="dice-total">{{ shownTotal }}</span>
      <span class="dice-faces">
        <span
          v-for="(face, index) in latest.dice"
          :key="'card-' + latest.id + '-' + index"
          class="card-die"
          :class="{ 'is-dropped': !latest.kept[index] }"
        >
          <span v-if="latest.mode === 'd3' || latest.mode === '2d3'" class="card-d3">{{ d3Face(face) }}</span>
          <span class="card-face">
            <span
              v-for="pip in pipsFor(face)"
              :key="pip"
              class="pip"
              :class="{ 'is-one': face === 1 }"
              :style="pipAt(pip)"
            ></span>
          </span>
        </span>
      </span>
    </div>
  </Teleport>
</template>

<style>
.dice-tray {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 34px;
  pointer-events: none;
  opacity: 0;
  transition: opacity var(--t-fast);
  background: radial-gradient(circle at 50% 50%, color-mix(in srgb, var(--bg-0) 72%, transparent), transparent 55%);
}

.dice-tray.is-on {
  opacity: 1;
}

.die-wrap {
  width: 66px;
  height: 66px;
  perspective: 700px;
}

.die-wrap.is-dropped {
  opacity: 0.35;
}

.dice-tray.is-on .die-wrap {
  animation: dice-toss 1.1s cubic-bezier(.2, .8, .3, 1);
}

.dice-tray.is-on .die-wrap:nth-child(2) {
  animation-name: dice-toss-2;
}

.dice-tray.is-on .die-wrap:nth-child(3) {
  animation-name: dice-toss-3;
}

@keyframes dice-toss {
  0% { transform: translate(-180px, -140px) scale(.6); }
  60% { transform: translate(0, 10px) scale(1.06); }
  80% { transform: translate(0, -6px) scale(1); }
  100% { transform: none; }
}

@keyframes dice-toss-2 {
  0% { transform: translate(180px, -160px) scale(.6); }
  62% { transform: translate(0, 10px) scale(1.06); }
  82% { transform: translate(0, -5px) scale(1); }
  100% { transform: none; }
}

@keyframes dice-toss-3 {
  0% { transform: translate(0, 180px) scale(.6); }
  62% { transform: translate(0, 10px) scale(1.06); }
  82% { transform: translate(0, -5px) scale(1); }
  100% { transform: none; }
}

.die {
  position: relative;
  width: 66px;
  height: 66px;
  transform-style: preserve-3d;
}

.die.is-spin {
  transition: transform 1.1s cubic-bezier(.15, .7, .25, 1);
}

.face {
  position: absolute;
  inset: 0;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(3, 1fr);
  padding: 9px;
  background: var(--bg-2);
  border: 1px solid var(--signal);
  border-radius: 11px;
  box-shadow: inset 0 0 14px var(--signal-glow);
  backface-visibility: hidden;
}

.f1 { transform: translateZ(33px); }
.f6 { transform: rotateY(180deg) translateZ(33px); }
.f3 { transform: rotateY(90deg) translateZ(33px); }
.f4 { transform: rotateY(-90deg) translateZ(33px); }
.f2 { transform: rotateX(90deg) translateZ(33px); }
.f5 { transform: rotateX(-90deg) translateZ(33px); }

.pip {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--signal);
  place-self: center;
}

.pip.is-one {
  width: 15px;
  height: 15px;
  background: var(--danger);
}

.dice-bar {
  position: fixed;
  left: 50%;
  z-index: 61;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;
  gap: var(--sp-1);
  width: min(420px, calc(100vw - 32px));
  margin: 0;
  padding: var(--sp-1) var(--sp-2);
  border: 1px solid var(--line-1);
  border-radius: var(--r-2);
  background: var(--bg-1);
  transform: translateX(-50%);
  bottom: calc(var(--chrome-inset) + var(--locator-height, 0px) + var(--sp-2) + var(--dice-card-height, 0px) + var(--sp-2) + env(safe-area-inset-bottom, 0px));
}

.dice-bar .dice-picks {
  margin: 0;
}

.dice-bar-x {
  margin: 0;
  padding: 6px 8px 8px;
  border: 0;
  background: transparent;
  color: var(--text-muted);
  font: 600 13px/1.3 var(--font-text);
  cursor: pointer;
}

.dice-bar-x:hover {
  color: var(--signal);
}

.dice-card {
  position: fixed;
  left: 50%;
  bottom: calc(var(--chrome-inset) + var(--locator-height, 0px) + var(--sp-2) + env(safe-area-inset-bottom, 0px));
  z-index: 60;
  display: grid;
  grid-template-columns: auto 1fr;
  grid-template-rows: auto auto;
  column-gap: 16px;
  row-gap: 4px;
  align-items: center;
  width: min(390px, calc(100vw - 32px));
  margin: 0;
  padding: 12px 16px 14px;
  border: 1px solid var(--signal);
  border-radius: var(--r-2);
  background: var(--bg-1);
  box-shadow: 0 18px 50px color-mix(in srgb, var(--bg-0) 80%, transparent);
  color: var(--text-0);
  font-family: var(--font-data);
  text-align: left;
  cursor: pointer;
  transform: translate(-50%, 16px);
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--t-fast), transform var(--t-fast);
}

.dice-card.is-on {
  opacity: 1;
  transform: translate(-50%, 0);
  pointer-events: auto;
}

.dice-card-title {
  grid-column: 1 / -1;
  color: var(--signal);
  font: 600 11px/1.3 var(--font-data);
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.dice-card-x {
  position: absolute;
  top: 8px;
  right: 8px;
}

.dice-total {
  font-family: var(--font-data);
  font-weight: 700;
  font-size: 54px;
  line-height: 0.9;
  font-variant-numeric: tabular-nums;
  min-width: 1.6em;
  text-align: center;
}

.dice-faces {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.card-die {
  position: relative;
  width: 24px;
  height: 24px;
  flex: 0 0 auto;
}

.card-die.is-dropped {
  opacity: 0.35;
}

.card-die:has(.card-d3) {
  width: 44px;
}

.card-d3 {
  position: absolute;
  left: 28px;
  top: 4px;
  color: var(--text-0);
  font: 600 13px/1 var(--font-data);
  font-variant-numeric: tabular-nums;
}

.card-face {
  display: grid;
  width: 24px;
  height: 24px;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(3, 1fr);
  padding: 2px;
  background: var(--bg-2);
  border: 1px solid var(--signal);
  border-radius: 4px;
  box-shadow: inset 0 0 4px var(--signal-glow);
}

.card-face .pip {
  width: 4px;
  height: 4px;
}

.card-face .pip.is-one {
  width: 6px;
  height: 6px;
}

.card-die.is-dropped::before,
.card-die.is-dropped::after {
  content: "";
  position: absolute;
  left: 2px;
  right: 2px;
  top: 50%;
  height: 1px;
  background: var(--text-0);
  z-index: 1;
}

.card-die.is-dropped::before { transform: rotate(32deg); }
.card-die.is-dropped::after { transform: rotate(-32deg); }

@media (prefers-reduced-motion: reduce) {
  .dice-tray.is-on .die-wrap { animation: none; }
  .die.is-spin { transition: none; }
  .dice-card { transition: none; }
}
</style>
