<script setup lang="ts">
/**
 * Ten recovery codes, shown once: two columns, Copy and Download (findings/passkey_screens_design.md
 * §2). The codes come in as a prop and stay in this component's memory; nothing is stored or logged.
 */
import { ref } from 'vue';
import { saveBlob } from '../../platform/browser.ts';
import { CODES_FILE, codesFile, LOST_MEANS_LOST } from './words.ts';

const props = defineProps<{ codes: readonly string[]; username: string }>();

const status = ref('');

async function copy(): Promise<void> {
    try {
        await globalThis.navigator.clipboard.writeText(props.codes.join('\n'));
        status.value = 'Copied.';
    } catch {
        status.value = 'The codes could not be copied. Select them, or download the file.';
    }
}

function download(): void {
    saveBlob(new Blob([codesFile(props.username, props.codes)], { type: 'text/plain;charset=utf-8' }), CODES_FILE);
    status.value = 'Downloaded ' + CODES_FILE + '.';
}
</script>

<template>
  <div class="pk-codes">
    <ol class="pk-codes-list" aria-label="Recovery codes">
      <li v-for="item in codes" :key="item"><code>{{ item }}</code></li>
    </ol>
    <div class="pk-acts">
      <button type="button" class="ui-btn" data-codes="copy" @click="copy">Copy</button>
      <button type="button" class="ui-btn" data-codes="download" @click="download">Download</button>
      <span class="pk-quiet" role="status">{{ status }}</span>
    </div>
    <p class="pk-calm">{{ LOST_MEANS_LOST }}</p>
  </div>
</template>

<style>
.pk-codes {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.pk-codes-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px 16px;
  margin: 0;
  padding: 14px 16px;
  border: 1px solid var(--line-1);
  border-radius: var(--r-3);
  background: var(--surface-1);
  list-style: none;
}

.pk-codes-list code {
  color: var(--text-0);
  font: 500 14px/1.6 var(--font-code);
  letter-spacing: 0.04em;
  user-select: all;
}

@media (max-width: 360px) {
  .pk-codes-list {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
