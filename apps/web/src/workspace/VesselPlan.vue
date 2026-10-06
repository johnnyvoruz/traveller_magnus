<script setup lang="ts">
/**
 * A vessel's deck plan on its record page (slice_2_campaign.md K9): the Geomorph Shipyard's
 * JSON file is imported, drawn (deckplan/DeckPlanView.vue), replaced or removed. The plan is
 * the vessel's `sheet.deckPlan`; the writes are deckplan/attach.ts. Removing is undone from
 * its toast, as a delete is. The credit the licence asks for is the view's own.
 */
import { computed, ref } from 'vue';
import { DeckPlan } from '@voyage/shared';
import { campaign } from '../campaign/store.ts';
import { importDeckPlan, removeDeckPlan } from '../deckplan/attach.ts';
import DeckPlanView from '../deckplan/DeckPlanView.vue';
import Icon from '../design/Icon.vue';
import { showToast } from '../shell/toast.ts';
import PlanModal from './PlanModal.vue';

const props = defineProps<{
    id: string;
    /** Changes cannot be made just now (offline). */
    readOnly: boolean;
}>();

const fileEl = ref<HTMLInputElement | null>(null);
/** The plan at the window's size (follow-up 1). */
const large = ref(false);
/** Why the last file was refused, shown until the next try. */
const refused = ref('');
const busy = ref(false);

const record = computed(() => {
    const found = campaign.records[props.id];
    return found && !found.deleted && found.type === 'vessel' ? found : null;
});

/** The plan on the sheet, when it is one the shipyard wrote. */
const plan = computed((): DeckPlan | null => {
    const sheet = record.value ? record.value.sheet : null;
    if (!sheet || typeof sheet !== 'object' || Array.isArray(sheet)) return null;
    const parsed = DeckPlan.safeParse((sheet as Record<string, unknown>).deckPlan);
    return parsed.success ? parsed.data : null;
});

function pick(): void {
    if (props.readOnly || busy.value) return;
    refused.value = '';
    if (fileEl.value) fileEl.value.click();
}

async function onFile(event: Event): Promise<void> {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    const file = input.files && input.files[0];
    // The same file can be chosen again after a refusal.
    input.value = '';
    if (!file || props.readOnly) return;
    busy.value = true;
    try {
        const result = importDeckPlan(props.id, await file.text());
        refused.value = result.ok ? '' : result.message;
    } catch {
        refused.value = 'That file could not be read.';
    } finally {
        busy.value = false;
    }
}

function remove(): void {
    const had = plan.value;
    const name = record.value ? record.value.name : '';
    if (props.readOnly || !had) return;
    const result = removeDeckPlan(props.id);
    if (!result.ok) {
        refused.value = result.message;
        return;
    }
    refused.value = '';
    const text = JSON.stringify(had);
    showToast('Removed the deck plan of ' + name + '.', {
        action: { label: 'Undo', run: () => { importDeckPlan(props.id, text); } },
    });
}
</script>

<template>
  <section v-if="record" class="vplan" :data-plan="plan ? 'yes' : 'no'">
    <input ref="fileEl" class="vplan-file" type="file" accept="application/json,.json" tabindex="-1" aria-hidden="true" @change="onFile">
    <template v-if="plan">
      <div class="vplan-view">
        <DeckPlanView :plan="plan" />
        <button type="button" class="ui-btn is-icon vplan-expand" aria-label="See the plan at full size" title="Full size (Esc to leave)" @click="large = true">
          <Icon name="up-right-and-down-left-from-center" :size="13" />
        </button>
      </div>
      <PlanModal v-if="large" :plan="plan" :name="record.name" @close="large = false" />
      <div class="vplan-acts">
        <button type="button" class="ui-btn vplan-replace" :disabled="readOnly || busy" @click="pick">
          <Icon name="file-import" :size="13" />Replace
        </button>
        <button type="button" class="ui-btn vplan-remove" :disabled="readOnly || busy" @click="remove">
          <Icon name="trash" :size="13" />Remove
        </button>
      </div>
    </template>
    <div v-else class="vplan-empty">
      <p>No deck plan yet. Import the JSON file the Geomorph Shipyard exports; the plan is drawn from its tiles.</p>
      <button type="button" class="ui-btn vplan-import" :disabled="readOnly || busy" @click="pick">
        <Icon name="file-import" :size="13" />Import a shipyard file
      </button>
    </div>
    <p v-if="refused" class="vplan-refused" role="alert">{{ refused }}</p>
  </section>
</template>

<style>
.vplan-file {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

/* The plan is drawn in a box of the panel's width; the viewer fills it. */
.vplan-view {
  position: relative;
  height: clamp(300px, 46vh, 560px);
  overflow: hidden;
  border: 1px solid var(--line-1);
  border-radius: var(--r-3);
}

/* The way to the window-sized plan, at the box's upper right, over the viewer's own bar. */
.vplan-expand {
  position: absolute;
  top: 6px;
  right: 6px;
  z-index: 2;
  background: var(--chrome-glass);
}

.vplan-acts {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

.vplan-empty {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
  padding: 16px;
  border: 1px dashed var(--line-2);
  border-radius: var(--r-3);
}

.vplan-empty p {
  margin: 0;
  color: var(--text-muted);
  font: 400 13px/1.5 var(--font-text);
}

.vplan-refused {
  margin: 8px 0 0;
  color: var(--danger);
  font: 400 12.5px/1.45 var(--font-text);
}
</style>
