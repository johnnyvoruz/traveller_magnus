<script setup lang="ts">
/**
 * Dev-only viewer. Pick a shipyard JSON file. The plan is drawn by DeckPlanView.
 * Nothing here is in the production build.
 */
import { DeckPlan } from '@voyage/shared';
import { ref } from 'vue';
import DeckPlanView from '../../deckplan/DeckPlanView.vue';

const note = ref('Pick a shipyard JSON file. No exported ship is in the repo.');
const plan = ref<ReturnType<typeof DeckPlan.parse> | null>(null);

async function onFile(event: Event): Promise<void> {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    const file = input.files?.[0];
    if (!file) return;
    let json: unknown;
    try {
        json = JSON.parse(await file.text());
    } catch {
        note.value = 'That file is not JSON.';
        plan.value = null;
        return;
    }
    const parsed = DeckPlan.safeParse(json);
    if (!parsed.success) {
        note.value = 'This is not a Geomorph Shipyard file.';
        plan.value = null;
        return;
    }
    plan.value = parsed.data;
    note.value = parsed.data.name;
}
</script>

<template>
  <main class="deck">
    <header class="bar">
      <label class="pick">
        Ship JSON
        <input type="file" accept="application/json,.json" @change="onFile">
      </label>
      <p class="note">{{ note }}</p>
    </header>
    <DeckPlanView v-if="plan" :plan="plan" class="view" />
  </main>
</template>

<style scoped>
.deck {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--bg-0);
  color: var(--text-1);
  font-family: var(--font-text);
}

.bar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 24px;
  align-items: baseline;
  padding: 12px 16px;
  background: var(--bg-1);
  border-bottom: 1px solid var(--line-1);
}

.pick {
  color: var(--text-0);
  font-size: 14px;
}

.note {
  margin: 0;
  font-size: 14px;
}

.view {
  flex: 1;
  min-height: 0;
}
</style>
