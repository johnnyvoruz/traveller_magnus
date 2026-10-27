<script setup lang="ts">
/**
 * The Save image sheet (streams/D.md DP1), in the shared modal frame (`.ui-modal*`, design/base.css):
 * the area (when there is a choice), the paper, the look, Save and Cancel. The chart, the system map
 * and the world surface map open the same sheet. The paper chosen last is kept per device. Escape or
 * the scrim cancels; focus starts on Cancel, so Enter never saves by accident. No native dialog.
 */
import { computed, nextTick, onMounted, ref } from 'vue';
import { storageGet, storageSet } from '../platform/browser.ts';
import { isPaper, PAPER_KEY, PAPERS, paperPixels, sizeWords, type Look, type Orientation, type Paper } from './paper.ts';

export type SheetArea = { id: string; label: string; orientation: Orientation };
export type SheetChoice = { area: string; paper: Paper; look: Look };

const props = withDefaults(defineProps<{
    areas: SheetArea[];
    busy?: boolean;
}>(), { busy: false });

const emit = defineEmits<{ (e: 'save', choice: SheetChoice): void; (e: 'cancel'): void }>();

const areaId = ref(props.areas.length > 0 ? props.areas[0].id : '');
const stored = storageGet(PAPER_KEY);
const paper = ref<Paper>(isPaper(stored) ? stored : 'A4');
const look = ref<Look>('paper');
const cancelEl = ref<HTMLButtonElement | null>(null);
const held = typeof document !== 'undefined' ? document.activeElement : null;

const orientation = computed((): Orientation => {
    const found = props.areas.find((item) => item.id === areaId.value);
    return found ? found.orientation : 'portrait';
});

const pixels = computed(() => sizeWords(paperPixels(paper.value, orientation.value)));

function cancel(): void {
    if (props.busy) return;
    emit('cancel');
    if (held instanceof HTMLElement && held.isConnected) held.focus();
}

function onKey(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    cancel();
}

function send(): void {
    if (props.busy || !areaId.value) return;
    storageSet(PAPER_KEY, paper.value);
    emit('save', { area: areaId.value, paper: paper.value, look: look.value });
}

onMounted(() => {
    void nextTick(() => { cancelEl.value?.focus(); });
});
</script>

<template>
  <Teleport to="body">
    <div class="ui-modal save-img" role="dialog" aria-modal="true" aria-labelledby="save-img-h" data-save-image @keydown="onKey">
      <div class="ui-modal-scrim" @click="cancel()"></div>
      <form class="ui-modal-card save-img-card" @submit.prevent="send">
        <div class="ui-modal-bar">
          <h2 id="save-img-h" class="ui-modal-title save-img-title">Save image</h2>
          <p class="ui-modal-meta">PNG, 300 dpi</p>
        </div>
        <fieldset v-if="areas.length > 1" class="save-img-set">
          <legend class="save-img-lbl">Area</legend>
          <label v-for="item in areas" :key="item.id" class="save-img-opt">
            <input v-model="areaId" type="radio" name="save-img-area" :value="item.id" :disabled="busy">
            <span>{{ item.label }}</span>
          </label>
        </fieldset>
        <div class="save-img-row">
          <span id="save-img-paper" class="save-img-lbl">Paper</span>
          <div class="ui-seg" role="group" aria-labelledby="save-img-paper">
            <button v-for="item in PAPERS" :key="item" type="button" :aria-pressed="paper === item" :disabled="busy" @click="paper = item">{{ item }}</button>
          </div>
          <span class="save-img-px" data-save-image-pixels>{{ pixels }}</span>
        </div>
        <div class="save-img-row">
          <span id="save-img-look" class="save-img-lbl">Look</span>
          <div class="ui-seg" role="group" aria-labelledby="save-img-look">
            <button type="button" :aria-pressed="look === 'paper'" :disabled="busy" @click="look = 'paper'">On paper</button>
            <button type="button" :aria-pressed="look === 'screen'" :disabled="busy" @click="look = 'screen'">Full colour</button>
          </div>
        </div>
        <p class="save-img-note">{{ look === 'paper' ? 'Ink on white, for printing.' : 'As the screen shows it.' }}</p>
        <div class="save-img-acts">
          <button ref="cancelEl" type="button" class="ui-btn" :disabled="busy" data-save-image-cancel @click="cancel()">Cancel</button>
          <button type="submit" class="ui-btn is-primary" :disabled="busy || !areaId" data-save-image-save>{{ busy ? 'Saving…' : 'Save' }}</button>
        </div>
      </form>
    </div>
  </Teleport>
</template>

<style>
.ui-modal-card.save-img-card {
  width: min(460px, 100%);
}

.save-img-title {
  margin: 0;
  font: 600 15px/1.35 var(--font-text);
}

.save-img .ui-modal-meta {
  margin: 0;
}

.save-img-set {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  border: 0;
}

.save-img-lbl {
  color: var(--text-muted);
  font: 500 12px/1.3 var(--font-text);
}

.save-img-set .save-img-lbl {
  padding: 0;
  margin-bottom: 2px;
}

.save-img-opt {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-1);
  font: 400 13.5px/1.4 var(--font-text);
  cursor: pointer;
}

.save-img-opt input {
  margin: 0;
  accent-color: var(--signal);
}

.save-img-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.save-img-row .save-img-lbl {
  flex: 0 0 48px;
}

.save-img-px {
  color: var(--text-muted);
  font: 400 12px/1.3 var(--font-data);
}

.save-img-note {
  margin: 0;
  color: var(--text-muted);
  font: 400 12.5px/1.45 var(--font-text);
}

.save-img-acts {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

/* Touch: 44 px, below 640 px as the store does, and on any coarse pointer. */
@media (max-width: 639px), (pointer: coarse) {
  .save-img .ui-btn,
  .save-img .ui-seg button {
    min-height: 44px;
  }

  .save-img-opt {
    min-height: 44px;
  }
}
</style>
