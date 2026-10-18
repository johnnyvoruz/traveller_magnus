<script setup lang="ts">
/**
 * Systems that feel alive, the switches (spec_living_systems.md §4; streams/D.md LS3). In the account
 * menu beside this campaign's other switches (public games, my name, the course): the referee's
 * **Show background traffic**, written as one settings change on the held
 * revision; then **Quiet on this device**, which anyone can set and which wins on this device. System
 * Comms is the orbit view's own button. Someone
 * who cannot change the campaign (a player, later) sees the campaign's state, read-only. The words
 * are Lane E's, in living/words.ts (LS3b), so the switches and the ticker say the same. Quiet sits
 * under its own heading, This device (DU18b): the one setting that belongs to the device, not the campaign.
 */
import { computed } from 'vue';
import { commit } from '../campaign/commit.ts';
import { campaign } from '../campaign/store.ts';
import Icon from '../design/Icon.vue';
import { device, livingChange, livingOf, setQuiet, type Living } from '../living/quiet.ts';
import { LIVING_WORDS } from '../living/words.ts';

const props = defineProps<{
    /** The open campaign is this person's own: the referee's switches can be changed. */
    canChange: boolean;
    busy?: boolean;
    /**
     * Which switches (DU10): the campaign's two (the Campaigns panel's card), this device's quiet (the
     * account menu), or both. Both when not given.
     */
    part?: 'campaign' | 'device' | 'all';
}>();

const showCampaign = computed(() => props.part !== 'device');
const showDevice = computed(() => props.part !== 'campaign');
/** In the account menu these are menu items; on the Campaigns panel's card, plain switches. */
const switchRole = computed(() => (props.part === 'campaign' ? 'switch' : 'menuitemcheckbox'));

const living = computed((): Living => livingOf(campaign.settings));

function flip(key: keyof Living): void {
    const settings = campaign.settings;
    if (!props.canChange || props.busy || !settings) return;
    commit({ settings: livingChange(settings, { ...living.value, [key]: !living.value[key] }) });
}
</script>

<template>
  <template v-if="showCampaign && campaign.settings">
    <button
      type="button"
      :role="switchRole"
      class="account-public living-switch"
      data-command="living-traffic"
      :aria-checked="living.traffic ? 'true' : 'false'"
      aria-describedby="living-traffic-say"
      :disabled="!canChange || busy"
      @click="flip('traffic')"
    >
      <Icon name="shuttle-space" :size="15" /><span>{{ LIVING_WORDS.trafficLabel }}</span><em>{{ living.traffic ? 'On' : 'Off' }}</em>
    </button>
    <p id="living-traffic-say" class="account-say">{{ LIVING_WORDS.trafficHelp }}</p>
    <p v-if="!canChange" class="account-say" data-living-read-only>The referee turns these on or off for the campaign.</p>
  </template>
  <!-- DU18b: this device's own settings, one group; today it holds the quiet switch only. -->
  <template v-if="showDevice">
  <p class="account-group" data-this-device>This device</p>
  <button
    type="button"
    :role="switchRole"
    class="account-public living-switch"
    data-command="living-quiet"
    :aria-checked="device.quiet ? 'true' : 'false'"
    aria-describedby="living-quiet-say"
    @click="setQuiet(!device.quiet)"
  >
    <Icon name="moon" :size="15" /><span>{{ LIVING_WORDS.quietLabel }}</span><em>{{ device.quiet ? 'On' : 'Off' }}</em>
  </button>
  <p id="living-quiet-say" class="account-say">{{ LIVING_WORDS.quietHelp }}</p>
  </template>
</template>
