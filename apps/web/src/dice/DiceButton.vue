<script setup lang="ts">
import { computed } from 'vue';
import { diceAsk, recentRolls, roll3ddPick, rollAgain, rollCount, rollD3Pick, rollD66Pick, rollLine, setMode, stepDm } from './command.ts';
import type { DiceCount } from './roll.ts';

const counts: DiceCount[] = [1, 2, 3];
const locked = computed(() => diceAsk.mode === 'boon' || diceAsk.mode === 'bane');
const special = computed(() => diceAsk.mode === 'd66' || diceAsk.mode === 'd3' || diceAsk.mode === '2d3' || diceAsk.mode === '3dd');
const shown = computed(() => (special.value ? 0 : locked.value ? 2 : diceAsk.count));
const dmOff = computed(() => diceAsk.mode === 'd66' || diceAsk.mode === '3dd');
/** The strip: the last eight, newest first (DU8). */
const recent = computed(() => recentRolls());
const last = computed(() => diceAsk.rolls[0] ?? null);
/** What Roll again throws: the last roll's line, with the box it came from. */
const againWords = computed(() => (last.value ? 'Roll again: ' + (last.value.from ? last.value.from + ' · ' : '') + rollLine(last.value) : 'Roll again'));
</script>

<template>
  <div class="dice-panel">
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
  <div class="dice-recent">
    <button type="button" class="dice-pick dice-again" data-dice-again :disabled="!last" :title="againWords" :aria-label="againWords" @click="rollAgain()">Roll again</button>
    <ol v-if="recent.length" class="dice-history" aria-label="Last rolls, newest first" data-dice-history>
      <li v-for="roll in recent" :key="roll.id" class="dice-past" :title="(roll.from ? roll.from + ' · ' : '') + rollLine(roll)">
        <span v-if="roll.from" class="dice-past-from">{{ roll.from }}</span>
        <span class="dice-past-line">{{ rollLine(roll) }}</span>
      </li>
    </ol>
  </div>
  </div>
</template>

<style>
.dice-panel {
  display: flex;
  flex: 0 0 auto;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.dice-picks {
  display: flex;
  flex: 0 0 auto;
  gap: 2px;
  margin: 0 0 -1px;
}

.dice-recent {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px 8px;
  max-width: 440px;
  min-width: 0;
}

.dice-again {
  padding-top: 4px;
  padding-bottom: 6px;
}

.dice-history {
  display: flex;
  flex: 1 1 auto;
  flex-wrap: wrap;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
  min-width: 0;
}

.dice-past {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  max-width: 100%;
  margin: 0;
  padding: 1px 6px 2px;
  border: 1px solid var(--line-1);
  border-radius: var(--r-1);
  color: var(--text-1);
  font: 500 11.5px/1.4 var(--font-data);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.dice-past:first-child {
  border-color: var(--signal-dim);
  color: var(--text-0);
}

.dice-past-from {
  max-width: 9em;
  overflow: hidden;
  color: var(--text-muted);
  font: 600 10.5px/1.4 var(--font-text);
  text-overflow: ellipsis;
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
