<script setup lang="ts">
/**
 * A record's avatar. The first image fills the box; the kind's icon shows when
 * there is none, or the image fails. A person or a character is a circle.
 */
import { computed, ref, watch } from 'vue';
import type { CampaignRecord } from '@voyage/shared';
import Icon from '../design/Icon.vue';
import type { FaIconName } from '../design/icons.ts';
import { avatarShape } from './crumb.ts';
import { imageUrl, primaryImage } from './images.ts';
import { typeInfo } from './records.ts';

const props = defineProps<{
    record: Pick<CampaignRecord, 'name' | 'type' | 'images'>;
    universeId: string | null;
    size: 'head' | 'row' | 'chip';
    /** A journal row has no record type. The icon is the journal kind's. */
    icon?: FaIconName;
}>();

const failed = ref(false);
const image = computed(() => primaryImage(props.record));
const src = computed(() => (props.universeId && image.value ? imageUrl(props.universeId, image.value.thumbHash) : ''));
watch(() => (image.value ? image.value.hash : ''), () => { failed.value = false; });
</script>

<template>
  <span
    class="rec-avatar"
    :class="'is-' + size"
    :data-shape="avatarShape(record.type)"
    :title="record.name"
  >
    <img
      v-if="src && !failed"
      :src="src"
      :alt="record.name"
      loading="lazy"
      decoding="async"
      @error="failed = true"
    >
    <Icon v-else :name="icon || typeInfo(record.type).icon" :size="size === 'head' ? 22 : size === 'row' ? 16 : 12" />
  </span>
</template>

<style>
.rec-avatar {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border: 1px solid var(--signal-line);
  background: var(--wash-faint);
  color: var(--signal);
}

.rec-avatar.is-head { width: 52px; height: 52px; }
.rec-avatar.is-row { width: 38px; height: 38px; }
.rec-avatar.is-chip { width: 22px; height: 22px; }

.rec-avatar[data-shape="circle"] { border-radius: var(--r-pill); }
.rec-avatar[data-shape="square"] { border-radius: var(--r-2); }

.rec-avatar img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
  background: var(--bg-0);
}
</style>
