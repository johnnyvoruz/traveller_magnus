<script setup lang="ts">
/**
 * Images on a journal entry, in the same pattern as a record: choose, drop, or paste,
 * then a strip. The first image is the avatar. Remove can be taken back from the toast.
 * prepareImage and uploadImage are campaign/images.ts. The list is saved with saveEntry.
 */
import { computed, nextTick, ref, watch } from 'vue';
import { CAMPAIGN_LIMITS, type CampaignImage } from '@voyage/shared';
import { prepareImage, uploadImage, type PreparedImage } from '../../campaign/images.ts';
import { saveEntry } from '../../campaign/journal.ts';
import { campaign } from '../../campaign/store.ts';
import Icon from '../../design/Icon.vue';
import { showToast } from '../../shell/toast.ts';
import { closeLightbox, lightbox, openLightbox, uploads } from '../gallery_state.ts';
import { acceptFile, imageUrl, imageWords, withImageBack } from '../images.ts';
import Lightbox from '../Lightbox.vue';
import RecordAvatar from '../RecordAvatar.vue';
import {
    ENTRY_FULL, entryImageCaption, entryImageFirst, entryImages, withEntryImage, withoutEntryImage,
} from './entry_images.ts';
import { entryIcon } from './list.ts';

const props = defineProps<{
    id: string;
    /** The avatar in the page head, or the strip of every image. */
    part: 'avatar' | 'strip';
    /** Changes cannot be made just now (offline). */
    readOnly: boolean;
}>();

const fileEl = ref<HTMLInputElement | null>(null);
const stripEl = ref<HTMLElement | null>(null);
const dragging = ref(false);
/** An upload that failed after the image was read: it can be sent again without reading the file. */
const retry = ref<PreparedImage | null>(null);
/** The failed upload was a Change, so a retry still becomes the avatar. */
let retryFront = false;

const entry = computed(() => {
    void campaign.seq;
    const found = campaign.journal[props.id];
    return found && !found.deleted ? found : null;
});
const images = computed((): CampaignImage[] => entryImages(entry.value ? entry.value.images : null));
const primary = computed(() => images.value[0] ?? null);
const universeId = computed(() => campaign.universeId ?? '');
const upload = computed(() => uploads[props.id] ?? null);
const full = computed(() => images.value.length >= CAMPAIGN_LIMITS.images);
const shown = computed(() => (lightbox.value && lightbox.value.id === props.id ? lightbox.value.index : null));
const face = computed(() => (entry.value ? {
    name: entry.value.title.trim() || 'Entry',
    type: 'note' as const,
    images: images.value.length ? images.value : null,
} : null));

function url(hash: string): string {
    return imageUrl(universeId.value, hash);
}

function fail(message: string, file: string, prepared: PreparedImage | null = null, front = false): void {
    retry.value = prepared;
    retryFront = front;
    uploads[props.id] = { stage: 'failed', message, file };
}

function toImage(prepared: PreparedImage): CampaignImage {
    return {
        hash: prepared.hash,
        thumbHash: prepared.thumbHash,
        width: prepared.width,
        height: prepared.height,
        bytes: prepared.bytes,
    };
}

async function send(prepared: PreparedImage, file: string, front = false): Promise<boolean> {
    uploads[props.id] = { stage: 'uploading', message: '', file };
    if (!campaign.universeId) {
        fail('The image could not be saved.', file, prepared, front);
        return false;
    }
    const uploaded = await uploadImage(campaign.universeId, prepared);
    if (!uploaded.ok) {
        fail('The upload failed.', file, prepared, front);
        return false;
    }
    const latest = campaign.journal[props.id];
    if (!latest || latest.deleted) {
        fail('That entry is not open.', file, prepared, front);
        return false;
    }
    const added = withEntryImage(latest.images, toImage(prepared), front);
    if ('error' in added) {
        fail(ENTRY_FULL, file);
        return false;
    }
    if (!saveEntry({ ...latest, images: added.images })) {
        fail('The upload failed.', file, prepared, front);
        return false;
    }
    delete uploads[props.id];
    retry.value = null;
    return true;
}

/** Files chosen, dropped or pasted, one after another; the first refusal stops the rest. `front` makes the new image the avatar. */
async function take(files: readonly File[], front = false): Promise<void> {
    if (props.readOnly || !entry.value) return;
    for (const file of files) {
        if (full.value) {
            fail(ENTRY_FULL, file.name);
            return;
        }
        const accepted = acceptFile(file);
        if (!accepted.ok) {
            fail(accepted.message, file.name);
            return;
        }
        uploads[props.id] = { stage: 'reading', message: '', file: file.name };
        const prepared = await prepareImage(file);
        if (!prepared.ok) {
            fail(prepared.message, file.name);
            return;
        }
        if (!(await send(prepared.image, file.name, front))) return;
    }
}

function tryAgain(): void {
    const prepared = retry.value;
    const name = upload.value ? upload.value.file : '';
    if (!prepared) {
        delete uploads[props.id];
        retry.value = null;
        pick();
        return;
    }
    void send(prepared, name, retryFront);
}

let placeFront = false;

function openPicker(front: boolean): void {
    if (props.readOnly || full.value) return;
    placeFront = front;
    if (fileEl.value) fileEl.value.click();
}

function pick(): void {
    openPicker(false);
}

function changeImage(): void {
    openPicker(true);
}

function onFiles(event: Event): void {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    const files = input.files ? Array.from(input.files) : [];
    const front = placeFront;
    placeFront = false;
    input.value = '';
    void take(files, front);
}

function onDrop(event: DragEvent): void {
    dragging.value = false;
    const files = event.dataTransfer ? Array.from(event.dataTransfer.files) : [];
    if (files.length) void take(files);
}

function onPaste(event: ClipboardEvent): void {
    const items = event.clipboardData ? Array.from(event.clipboardData.items) : [];
    const files: File[] = [];
    for (const item of items) {
        if (item.kind !== 'file') continue;
        const file = item.getAsFile();
        if (file) files.push(file);
    }
    if (!files.length) return;
    event.preventDefault();
    void take(files);
}

function remove(hash: string): void {
    if (props.readOnly || !entry.value) return;
    const at = images.value.findIndex((image) => image.hash === hash);
    const image = images.value[at];
    const latest = campaign.journal[props.id];
    if (!image || !latest || latest.deleted) return;
    if (!saveEntry({ ...latest, images: withoutEntryImage(latest.images, hash) })) return;
    showToast('Removed the image.', {
        action: {
            label: 'Undo',
            run: () => {
                const now = campaign.journal[props.id];
                if (now && !now.deleted) saveEntry({ ...now, images: withImageBack(now.images ?? null, image, at) });
            },
        },
    });
    void nextTick(() => {
        const el = stripEl.value ? stripEl.value.querySelector<HTMLElement>('.img-thumb-open, .img-add') : null;
        if (el) el.focus();
    });
}

function toFront(hash: string): void {
    if (props.readOnly) return;
    const latest = campaign.journal[props.id];
    if (!latest || latest.deleted) return;
    const next = entryImageFirst(latest.images, hash);
    if (next) saveEntry({ ...latest, images: next });
}

function caption(hash: string, text: string): void {
    if (props.readOnly) return;
    const latest = campaign.journal[props.id];
    if (!latest || latest.deleted) return;
    const next = entryImageCaption(latest.images, hash, text);
    if (next) saveEntry({ ...latest, images: next });
}

watch(() => props.id, () => { closeLightbox(); });
</script>

<template>
  <div
    v-if="part === 'avatar' && entry && face"
    class="rec-avatar-slot"
    :data-empty="primary ? 'no' : 'yes'"
    @dragover.prevent="dragging = !readOnly"
    @dragleave="dragging = false"
    @drop.prevent="onDrop"
  >
    <input ref="fileEl" class="vplan-file" type="file" accept="image/*" tabindex="-1" aria-hidden="true" @change="onFiles">
    <button
      v-if="primary"
      type="button"
      class="rec-avatar-open"
      :title="'See ' + face.name"
      @click="openLightbox(id, 0)"
    >
      <RecordAvatar :record="face" :universe-id="universeId" size="head" :icon="entryIcon(entry.kind)" />
    </button>
    <button
      v-else
      type="button"
      class="rec-avatar-open"
      :disabled="readOnly || full"
      title="Add an image"
      @click="pick"
    >
      <RecordAvatar :record="face" :universe-id="universeId" size="head" :icon="entryIcon(entry.kind)" />
      <span v-if="!readOnly" class="rec-avatar-label">Add an image</span>
    </button>
    <span v-if="primary && !readOnly" class="rec-avatar-acts">
      <button type="button" :disabled="full" @click="changeImage">Change</button>
      <button type="button" @click="remove(primary.hash)">Remove</button>
    </span>
    <p v-if="upload && upload.stage !== 'failed'" class="rec-avatar-status" role="status">
      {{ upload.stage === 'reading' ? 'Reading the image…' : 'Uploading…' }}
    </p>
    <p v-else-if="upload" class="rec-avatar-status" role="alert">
      {{ upload.message }} <button v-if="retry" type="button" @click="tryAgain">Try again.</button>
    </p>
  </div>

  <section
    v-else-if="part === 'strip' && entry && images.length"
    ref="stripEl"
    class="img jn-images"
    :class="{ 'is-dragging': dragging }"
    @dragover.prevent="dragging = !readOnly"
    @dragleave="dragging = false"
    @drop.prevent="onDrop"
    @paste="onPaste"
  >
    <h3 class="ui-heading">Images <span class="ui-count">{{ images.length }}</span></h3>
    <input ref="fileEl" class="vplan-file" type="file" accept="image/*" multiple tabindex="-1" aria-hidden="true" @change="onFiles">
    <div class="img-strip" role="list" aria-label="Images">
      <div v-for="(image, index) in images" :key="image.hash" role="listitem" class="img-thumb" :class="{ 'is-primary': index === 0 }">
        <button type="button" class="img-thumb-open" :title="(image.caption || imageWords(image)) + (index === 0 ? ' · primary' : '')" @click="openLightbox(id, index)">
          <img :src="url(image.thumbHash)" :alt="image.caption || face?.name + ', image ' + (index + 1)" loading="lazy">
        </button>
        <span v-if="index === 0" class="img-primary-tag">Avatar</span>
        <span class="img-thumb-acts">
          <button v-if="index > 0" type="button" class="img-act" :disabled="readOnly" aria-label="Make this the avatar" title="Make this the avatar" @click="toFront(image.hash)">
            <Icon name="star" :size="11" />
          </button>
          <button type="button" class="img-act is-remove" :disabled="readOnly" :aria-label="'Remove image ' + (index + 1)" title="Remove" @click="remove(image.hash)">
            <Icon name="xmark" :size="11" />
          </button>
        </span>
      </div>
      <button type="button" class="img-add" :disabled="readOnly || full || !!upload && upload.stage !== 'failed'" :title="full ? ENTRY_FULL : 'Add an image: choose a file, drop one here, or paste one'" @click="pick">
        <Icon name="plus" :size="14" />
        <span>{{ images.length ? 'Add' : 'Add an image' }}</span>
      </button>
    </div>
    <p class="img-hint">Drop images here, or paste one. They are kept as WebP, 2,048 px at most.</p>
    <Lightbox
      v-if="shown !== null && images[shown] && face"
      :images="images"
      :index="shown"
      :universe-id="universeId"
      :read-only="readOnly"
      :name="face.name"
      @close="closeLightbox"
      @index="openLightbox(id, $event)"
      @caption="caption"
    />
  </section>
</template>
