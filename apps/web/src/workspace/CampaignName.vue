<script setup lang="ts">
/**
 * The open campaign's name, typed in place (DU44): saved on Enter or when the box is left, through the
 * same rename the Campaigns panel uses; Esc puts the stored name back. Used by Start here and beside
 * the invite link while the campaign is still called "My map".
 */
import { computed, ref, watch } from 'vue';
import { CAMPAIGN_LIMITS } from '@voyage/shared';
import { campaign, renameCampaign } from '../campaign/store.ts';
import { showToast } from '../shell/toast.ts';
import { nameToSave, openCampaignName } from './campaign_name.ts';

const props = defineProps<{
    /** Changes cannot be made just now (offline). */
    readOnly: boolean;
    /** The box's name for a screen reader. */
    label: string;
}>();

const emit = defineEmits<{
    saved: [name: string];
}>();

const current = computed(() => openCampaignName(campaign.universes, campaign.universeId));
const draft = ref(current.value);
const busy = ref(false);
watch(current, (name) => {
    if (!busy.value) draft.value = name;
});

async function save(): Promise<void> {
    const id = campaign.universeId;
    if (!id || props.readOnly || busy.value) return;
    const name = nameToSave(draft.value, current.value);
    if (!name) {
        draft.value = current.value;
        return;
    }
    busy.value = true;
    try {
        await renameCampaign(id, name);
        emit('saved', name);
    } catch {
        showToast('The campaign could not be renamed. Try again.');
        draft.value = current.value;
    } finally {
        busy.value = false;
    }
}

function reset(): void {
    draft.value = current.value;
}
</script>

<template>
  <label class="cname">
    <span class="rec-sr">{{ label }}</span>
    <input
      v-model="draft"
      type="text"
      :maxlength="CAMPAIGN_LIMITS.name"
      :disabled="readOnly || busy"
      data-campaign-name
      @keydown.enter.prevent="save"
      @keydown.esc="reset"
      @keydown.stop
      @blur="save"
    />
  </label>
</template>

<style>
.cname {
  display: block;
  max-width: 320px;
}

.cname input {
  box-sizing: border-box;
  width: 100%;
  height: 32px;
  padding: 0 10px;
  border: 1px solid var(--line-2);
  border-radius: var(--r-2);
  background: var(--bg-1);
  color: var(--text-0);
  font: 500 14px/1.4 var(--font-text);
}

.cname input:focus-visible {
  outline: 2px solid var(--signal);
  outline-offset: 1px;
}
</style>
