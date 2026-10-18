<script setup lang="ts">
/**
 * "Add a cover" (prompts/d_storefront.md point 5): a file chooser, a drop target and paste, as on
 * a record's gallery (RecordGallery.vue). The preview is the 16:9 crop the card uses. The file is
 * read into a WebP pair here (cover_image.ts); the parent sends it, or keeps it until publish. A map
 * package's screenshot is trimmed to its systems first (D5), and the editor says so.
 * Remove is a plain delete, with no undo.
 */
import { ref } from 'vue';
import Icon from '../../design/Icon.vue';
import { sourceWords, type CoverSource } from '../../marketplace/covers.ts';
import { imageFiles, prepareCover, type PreparedCover } from './cover_image.ts';

const props = defineProps<{
    /** The picture the card shows now, or the draft's preview. */
    src: string;
    source: CoverSource;
    /** "Remove cover" is offered (an upload is there). */
    canRemove: boolean;
    busy?: boolean;
    /** The parent's sentence, for a send that failed. */
    error?: string;
    title: string;
    /** A map or system package: a screenshot of the map is trimmed to its systems. */
    map?: boolean;
}>();

const emit = defineEmits<{ take: [cover: PreparedCover]; remove: [] }>();

const fileEl = ref<HTMLInputElement | null>(null);
const reading = ref(false);
const problem = ref('');
const dragging = ref(false);
/** The last picture taken was trimmed to its systems. */
const trimmed = ref(false);

async function take(files: readonly File[]): Promise<void> {
    const file = imageFiles(files)[0];
    if (!file) {
        if (files.length) problem.value = (files[0].name || 'That file') + ' is not an image.';
        return;
    }
    if (reading.value || props.busy) return;
    reading.value = true;
    problem.value = '';
    try {
        const made = await prepareCover(file, undefined, props.map === true);
        if (made.ok) {
            trimmed.value = made.trimmed;
            emit('take', made.cover);
        } else problem.value = made.message;
    } finally {
        reading.value = false;
    }
}

function pick(): void {
    if (fileEl.value) fileEl.value.click();
}

function onFiles(event: Event): void {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    const files = input.files ? Array.from(input.files) : [];
    input.value = '';
    void take(files);
}

function onDrop(event: DragEvent): void {
    dragging.value = false;
    void take(event.dataTransfer ? Array.from(event.dataTransfer.files) : []);
}

function onPaste(event: ClipboardEvent): void {
    const files: File[] = [];
    for (const item of event.clipboardData ? Array.from(event.clipboardData.items) : []) {
        const file = item.kind === 'file' ? item.getAsFile() : null;
        if (file) files.push(file);
    }
    if (!files.length) return;
    event.preventDefault();
    void take(files);
}
</script>

<template>
  <section
    class="mk-cover-ed"
    :class="{ 'is-dragging': dragging }"
    aria-label="Cover"
    @dragover.prevent="dragging = true"
    @dragleave="dragging = false"
    @drop.prevent="onDrop"
    @paste="onPaste"
  >
    <input ref="fileEl" class="vplan-file" type="file" accept="image/*" tabindex="-1" aria-hidden="true" @change="onFiles">
    <div class="mk-cover-ed-row">
      <div
        class="mk-cover-ed-crop"
        tabindex="0"
        role="button"
        :aria-label="'Cover of ' + title + '. Choose a file, drop one here, or paste one.'"
        :aria-busy="reading || busy ? 'true' : undefined"
        @click="pick"
        @keydown.enter.prevent="pick"
        @keydown.space.prevent="pick"
      >
        <img :src="src" :alt="title">
      </div>
      <div class="mk-cover-ed-side">
        <p class="mk-cover-ed-src"><b>Cover</b> {{ sourceWords(source) }}</p>
        <p class="mk-fine">Add a picture for your package. For a map, take a screenshot of it and paste it here{{ map ? ': the empty chart round the systems is trimmed away, so they read on a card' : '' }}.</p>
        <div class="mk-cover-ed-acts">
          <button type="button" class="ui-btn" :disabled="reading || busy" @click="pick"><Icon name="plus" :size="13" />{{ source === 'upload' ? 'Replace cover' : 'Add a cover' }}</button>
          <button v-if="canRemove" type="button" class="ui-btn" :disabled="reading || busy" @click="emit('remove')">Remove cover</button>
        </div>
        <p v-if="reading" class="mk-fine" role="status">Reading the image…</p>
        <p v-else-if="trimmed && source === 'upload'" class="mk-fine" role="status" data-cover-trimmed>Trimmed to the systems, so they read on a card.</p>
        <p v-else-if="busy" class="mk-fine" role="status">Saving the cover…</p>
        <p v-if="problem || error" class="mk-err" role="alert">{{ problem || error }}</p>
      </div>
    </div>
  </section>
</template>

<style>
.mk-cover-ed {
  padding: 10px;
  border: 1px dashed var(--line-1);
  border-radius: var(--r-3);
  background: var(--bg-1);
}

.mk-cover-ed.is-dragging {
  border-color: var(--signal);
}

.mk-cover-ed-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.mk-cover-ed-crop {
  flex: 0 0 auto;
  width: min(240px, 100%);
  aspect-ratio: 16 / 9;
  overflow: hidden;
  border: 1px solid var(--line-1);
  border-radius: var(--r-2);
  background: var(--store-placeholder);
  cursor: pointer;
}

.mk-cover-ed-crop img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.mk-cover-ed-side {
  display: flex;
  flex: 1 1 200px;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.mk-cover-ed-side p {
  margin: 0;
}

.mk-cover-ed-src {
  color: var(--text-1);
}

.mk-cover-ed-src b {
  margin-right: 6px;
  color: var(--text-0);
}

.mk-cover-ed-acts {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
</style>
