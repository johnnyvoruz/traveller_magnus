<script setup lang="ts">
import { computed } from 'vue';
import { diceAsk, roll3ddPick, rollCount, rollD3Pick, rollD66Pick, setMode, stepDm } from './command.ts';
import type { DiceCount } from './roll.ts';

const counts: DiceCount[] = [1, 2, 3];
const locked = computed(() => diceAsk.mode === 'boon' || diceAsk.mode === 'bane');
const special = computed(() => diceAsk.mode === 'd66' || diceAsk.mode === 'd3' || diceAsk.mode === '2d3' || diceAsk.mode === '3dd');
const shown = computed(() => (special.value ? 0 : locked.value ? 2 : diceAsk.count));
const dmOff = computed(() => diceAsk.mode === 'd66' || diceAsk.mode === '3dd');
</script>

<template>
  <div class="dice-picks" role="group" aria-label="Dice">
    <button
      v-for="count in counts"
      :key="count"
      type="button"
      class="dice-pick"
      :disabled="locked && count !== 2"
      :aria-pressed="shown === count ? 'true' : 'false'"
      @click="rollCount(count)"
    >{{ count }}D</button>
    <span class="dice-dm">
      <button type="button" class="dice-pick" aria-label="Lower DM" :disabled="dmOff || diceAsk.dm <= -6" @click="stepDm(-1)">−</button>
      <span class="dice-dm-n">{{ diceAsk.dm }}</span>
      <button type="button" class="dice-pick" aria-label="Raise DM" :disabled="dmOff || diceAsk.dm >= 6" @click="stepDm(1)">+</button>
    </span>
    <button type="button" class="dice-pick" :aria-pressed="diceAsk.mode === 'd3' ? 'true' : 'false'" @click="rollD3Pick(1)">D3</button>
    <button type="button" class="dice-pick" :aria-pressed="diceAsk.mode === '2d3' ? 'true' : 'false'" @click="rollD3Pick(2)">2D3</button>
    <button type="button" class="dice-pick" :aria-pressed="diceAsk.mode === 'd66' ? 'true' : 'false'" @click="rollD66Pick()">D66</button>
    <button type="button" class="dice-pick" :aria-pressed="diceAsk.mode === '3dd' ? 'true' : 'false'" @click="roll3ddPick()">3DD</button>
    <button type="button" class="dice-pick" :aria-pressed="diceAsk.mode === 'boon' ? 'true' : 'false'" @click="setMode('boon')">Boon</button>
    <button type="button" class="dice-pick" :aria-pressed="diceAsk.mode === 'bane' ? 'true' : 'false'" @click="setMode('bane')">Bane</button>
  </div>
</template>

<style>
.dice-picks {
  display: flex;
  flex: 0 0 auto;
  gap: 2px;
  margin: 0 0 -1px;
}

.dice-pick {
  display: inline-flex;
  align-items: center;
  margin: 0;
  padding: 6px 8px 8px;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--text-muted);
  font: 600 13px/1.3 var(--font-text);
  cursor: pointer;
}

.dice-pick:hover,
.dice-pick[aria-pressed="true"] {
  color: var(--signal);
}

.dice-pick[aria-pressed="true"] {
  border-bottom-color: var(--signal);
}

.dice-pick:disabled {
  cursor: default;
}

.dice-pick:disabled:not([aria-pressed="true"]) {
  opacity: 0.4;
}

.dice-dm {
  display: inline-flex;
  align-items: center;
}

.dice-dm-n {
  min-width: 1.4em;
  color: var(--text-0);
  font: 600 13px/1.3 var(--font-data);
  font-variant-numeric: tabular-nums;
  text-align: center;
}
</style>
