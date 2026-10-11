<script setup lang="ts">
/**
 * A record's images (K14): the avatar in the page head (`part="avatar"`), and the gallery
 * strip with add (file chooser, drop, paste), remove with undo, "Make this the avatar"
 * and the caption in place (`part="strip"`). The encoding and the upload are campaign/images.ts;
 * the upload's progress and failure are said in the saving mark's language. Sheets and
 * deck plans are not images.
 */
import { computed, nextTick, ref, watch } from 'vue';
import { CAMPAIGN_LIMITS, type CampaignImage } from '@voyage/shared';
import { addImage, makePrimary, prepareImage, removeImage, setCaption, type PreparedImage } from '../campaign/images.ts';
import { campaign } from '../campaign/store.ts';
import Icon from '../design/Icon.vue';
import { showToast } from '../shell/toast.ts';
import { saveRecord } from './actions.ts';
import { closeLightbox, lightbox, openLightbox, uploads } from './gallery_state.ts';
import { acceptFile, imageUrl, imageWords, primaryImage, withImageBack } from './images.ts';
import RecordAvatar from './RecordAvatar.vue';
import Lightbox from './Lightbox.vue';

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

const record = computed(() => {
    const found = campaign.records[props.id];
    return found && !found.deleted ? found : null;
});
const images = computed((): readonly CampaignImage[] => (record.value && record.value.images ? record.value.images : []));
const primary = computed(() => (record.value ? primaryImage(record.value) : null));
const universeId = computed(() => campaign.universeId ?? '');
const upload = computed(() => uploads[props.id] ?? null);
const full = computed(() => images.value.length >= CAMPAIGN_LIMITS.images);
const shown = computed(() => (lightbox.value && lightbox.value.id === props.id ? lightbox.value.index : null));

function url(hash: string): string {
    return imageUrl(universeId.value, hash);
}

// ---- Adding ---------------------------------------------------------------------------

function fail(message: string, file: string, prepared: PreparedImage | null = null, front = false): void {
    retry.value = prepared;
    retryFront = front;
    uploads[props.id] = { stage: 'failed', message, file };
}

async function send(prepared: PreparedImage, file: string, front = false): Promise<boolean> {
    uploads[props.id] = { stage: 'uploading', message: '', file };
    const added = await addImage(props.id, prepared);
    if (!added.ok) {
        fail('The upload failed.', file, prepared, front);
        return false;
    }
    if (front) makePrimary(props.id, prepared.hash);
    delete uploads[props.id];
    retry.value = null;
    return true;
}

/** Files chosen, dropped or pasted, one after another; the first refusal stops the rest. `front` makes the new image the avatar. */
async function take(files: readonly File[], front = false): Promise<void> {
    if (props.readOnly || !record.value) return;
    for (const file of files) {
        if (full.value) {
            fail('A record can have twelve images.', file.name);
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

// ---- Remove, primary, caption -------------------------------------------------------------

function remove(hash: string): void {
    if (props.readOnly || !record.value) return;
    const at = images.value.findIndex((image) => image.hash === hash);
    const image = images.value[at];
    if (!image) return;
    removeImage(props.id, hash);
    showToast('Removed the image.', {
        action: {
            label: 'Undo',
            run: () => {
                const now = campaign.records[props.id];
                if (now && !now.deleted) saveRecord(props.id, { images: withImageBack(now.images, image, at) });
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
    makePrimary(props.id, hash);
}

function caption(hash: string, text: string): void {
    if (props.readOnly) return;
    setCaption(props.id, hash, text);
}

watch(() => props.id, () => { closeLightbox(); });
</script>

<template>
  <div
    v-if="part === 'avatar' && record"
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
      :title="'See ' + record.name"
      @click="openLightbox(id, 0)"
    >
      <RecordAvatar :record="record" :universe-id="universeId" size="head" />
    </button>
    <button
      v-else
      type="button"
      class="rec-avatar-open"
      :disabled="readOnly || full"
      title="Add an image"
      @click="pick"
    >
      <RecordAvatar :record="record" :universe-id="universeId" size="head" />
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
    v-else-if="part === 'strip' && record && images.length"
    ref="stripEl"
    class="img"
    :class="{ 'is-dragging': dragging }"
    @dragover.prevent="dragging = !readOnly"
    @dragleave="dragging = false"
    @drop.prevent="onDrop"
    @paste="onPaste"
  >
    <h3 class="ui-heading">Images <span v-if="images.length" class="ui-count">{{ images.length }}</span></h3>
    <input ref="fileEl" class="vplan-file" type="file" accept="image/*" multiple tabindex="-1" aria-hidden="true" @change="onFiles">
    <div class="img-strip" role="list" aria-label="Images">
      <div v-for="(image, index) in images" :key="image.hash" role="listitem" class="img-thumb" :class="{ 'is-primary': index === 0 }">
        <button type="button" class="img-thumb-open" :title="(image.caption || imageWords(image)) + (index === 0 ? ' · primary' : '')" @click="openLightbox(id, index)">
          <img :src="url(image.thumbHash)" :alt="image.caption || record.name + ', image ' + (index + 1)" loading="lazy">
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
      <button type="button" class="img-add" :disabled="readOnly || full || !!upload && upload.stage !== 'failed'" :title="full ? 'A record can have twelve images' : 'Add an image: choose a file, drop one here, or paste one'" @click="pick">
        <Icon name="plus" :size="14" />
        <span>{{ images.length ? 'Add' : 'Add an image' }}</span>
      </button>
    </div>
    <p class="img-hint">Drop images here, or paste one. They are kept as WebP, 2,048 px at most.</p>
    <Lightbox
      v-if="shown !== null && images[shown]"
      :images="images"
      :index="shown"
      :universe-id="universeId"
      :read-only="readOnly"
      :name="record.name"
      @close="closeLightbox"
      @index="openLightbox(id, $event)"
      @caption="caption"
    />
  </section>
</template>

<style>
/* The avatar sits in the page head. Its box does not grow when the image arrives. */
.rec-avatar-slot {
  position: relative;
  flex: 0 0 auto;
  width: 72px;
  min-height: 52px;
}

.rec-avatar-open {
  display: block;
  width: 52px;
  margin: 0;
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;
}

.rec-avatar-open:disabled {
  cursor: default;
}

.rec-avatar-label {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 3px;
  border-radius: var(--r-pill);
  background: var(--chrome-glass);
  color: var(--text-0);
  font: 600 9px/1.1 var(--font-text);
  text-align: center;
  opacity: 0;
  pointer-events: none;
}

.rec-avatar-slot:hover .rec-avatar-label,
.rec-avatar-slot:focus-within .rec-avatar-label {
  opacity: 1;
}

.rec-avatar-acts {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 4px;
}

.rec-avatar-acts button {
  min-height: 32px;
  margin: 0;
  padding: 0 4px;
  border: 1px solid var(--line-2);
  border-radius: var(--r-2);
  background: var(--chrome-bg);
  color: var(--text-0);
  font: 600 11px/1 var(--font-text);
  cursor: pointer;
}

.rec-avatar-status {
  width: 72px;
  margin: 4px 0 0;
  color: var(--text-1);
  font: 400 12px/1.3 var(--font-text);
}

.rec-avatar-status button {
  margin: 0;
  padding: 0;
  border: 0;
  background: none;
  color: var(--signal);
  font: inherit;
  cursor: pointer;
}

/* The primary image at the head of the page: as wide as the panel, no taller than a third of the screen. */
.img-hero {
  margin: 0 0 14px;
}

.img-hero-open {
  display: block;
  width: 100%;
  margin: 0;
  padding: 0;
  border: 1px solid var(--line-1);
  border-radius: var(--r-3);
  overflow: hidden;
  background: var(--bg-0);
  cursor: zoom-in;
}

.img-hero-open img {
  display: block;
  width: 100%;
  height: auto;
  max-height: min(34vh, 320px);
  object-fit: cover;
}

.img-hero-open:hover {
  border-color: var(--signal-dim);
}

.img-hero figcaption {
  margin-top: 6px;
}

.img-hero figcaption .edit-view {
  color: var(--text-muted);
  font-size: 13px;
}

/* The strip: thumbnails of one height, then the add tile. */
.img {
  border-radius: var(--r-3);
}

.img.is-dragging {
  outline: 2px dashed var(--signal);
  outline-offset: 4px;
}

.img-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.img-thumb {
  position: relative;
  width: 96px;
  height: 72px;
}

.img-thumb-open {
  display: block;
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 0;
  border: 1px solid var(--line-1);
  border-radius: var(--r-2);
  overflow: hidden;
  background: var(--bg-0);
  cursor: zoom-in;
}

.img-thumb.is-primary .img-thumb-open {
  border-color: var(--signal);
}

.img-thumb-open:hover {
  border-color: var(--signal-dim);
}

.img-thumb-open img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.img-primary-tag {
  position: absolute;
  left: 4px;
  bottom: 4px;
  padding: 1px 6px;
  border-radius: var(--r-pill);
  background: var(--signal);
  color: var(--on-signal);
  font: 700 9.5px/1.5 var(--font-text);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  pointer-events: none;
}

/* The marks on a thumbnail show while it or they are pointed at or focused. */
.img-thumb-acts {
  position: absolute;
  top: 3px;
  right: 3px;
  display: flex;
  gap: 3px;
  opacity: 0;
  transition: opacity var(--t-fast) var(--ease-out);
}

.img-thumb:hover .img-thumb-acts,
.img-thumb:focus-within .img-thumb-acts {
  opacity: 1;
}

.img-act {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  margin: 0;
  padding: 0;
  border: 1px solid var(--line-2);
  border-radius: var(--r-pill);
  background: var(--chrome-bg);
  color: var(--text-0);
  cursor: pointer;
}

.img-act:not(:disabled):hover {
  border-color: var(--signal);
  color: var(--signal);
}

.img-act.is-remove:not(:disabled):hover {
  border-color: var(--danger);
  color: var(--danger);
}

.img-add {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  width: 96px;
  height: 72px;
  margin: 0;
  padding: 0;
  border: 1px dashed var(--line-2);
  border-radius: var(--r-2);
  background: transparent;
  color: var(--text-muted);
  font: 600 12px/1.3 var(--font-text);
  cursor: pointer;
}

.img-add .ui-icon {
  color: var(--signal);
}

.img-add:not(:disabled):hover {
  border-color: var(--signal-dim);
  color: var(--text-1);
}

.img-add:disabled {
  opacity: 0.5;
  cursor: default;
}

.img-note,
.img-hint {
  margin: 8px 0 0;
  color: var(--text-muted);
  font: 400 12.5px/1.45 var(--font-text);
}

.img-failed {
  margin: 8px 0 0;
}

@media (prefers-reduced-motion: reduce) {
  .img-thumb-acts {
    transition: none;
  }
}
</style>
