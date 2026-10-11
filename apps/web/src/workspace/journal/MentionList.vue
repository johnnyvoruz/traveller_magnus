<script setup lang="ts">
/**
 * The @ list. Same rows as the record picker (RecordPicker.vue): one listbox,
 * aria-activedescendant on the field that owns it. The import loads that
 * stylesheet so this is not a second list skin.
 */
import '../RecordPicker.vue';
import type { CampaignRecord } from '@voyage/shared';
import { campaign } from '../../campaign/store.ts';
import RecordAvatar from '../RecordAvatar.vue';
import { placeLine, typeInfo } from '../records.ts';

defineProps<{
    hits: readonly CampaignRecord[];
    records: Readonly<Record<string, CampaignRecord>>;
    active: number;
    /** True when the campaign has no live record at all. */
    empty: boolean;
    query: string;
    top: number;
    left: number;
}>();

const emit = defineEmits<{
    choose: [record: CampaignRecord];
    hover: [index: number];
}>();
</script>

<template>
  <div
    id="jn-mention-list"
    class="picker jn-mention"
    role="listbox"
    aria-label="Records"
    :style="{ top: top + 'px', left: left + 'px' }"
  >
    <p v-if="empty" class="picker-none" role="status">No records yet.</p>
    <p v-else-if="!hits.length" class="picker-none" role="status">No records match “{{ query }}”.</p>
    <div v-else class="picker-list">
      <div
        v-for="(record, index) in hits"
        :id="'jn-mention-' + index"
        :key="record.id"
        role="option"
        class="picker-opt"
        :aria-selected="index === active ? 'true' : 'false'"
        @mousedown.prevent
        @mousemove="emit('hover', index)"
        @click="emit('choose', record)"
      >
        <RecordAvatar :record="record" :universe-id="campaign.universeId" size="chip" />
        <span class="picker-text">
          <b>{{ record.name }}</b>
          <small>{{ typeInfo(record.type).one }} · {{ placeLine(record, records) }}</small>
        </span>
      </div>
    </div>
  </div>
</template>

<style>
.jn-mention {
  position: fixed;
  z-index: 4;
  width: 280px;
  margin: 0;
}
</style>
