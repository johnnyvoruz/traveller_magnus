<script setup lang="ts">
/**
 * The entry's body (journal design §4). Reading, tokens are chips. Editing, the text is the
 * text, and Enter is a new line. A chip opens what it names. Nothing here is HTML.
 */
import { computed, nextTick, ref } from 'vue';
import { CAMPAIGN_LIMITS } from '@voyage/shared';
import { bodyParts, type BodyPart } from './body.ts';

const props = defineProps<{
    value: string;
    disabled?: boolean;
    nameOf: (target: string) => string | null;
}>();

const emit = defineEmits<{
    save: [text: string];
    open: [part: BodyPart];
}>();

const editing = ref(false);
const draft = ref('');
const field = ref<HTMLTextAreaElement | null>(null);
const view = ref<HTMLElement | null>(null);
let leaving = false;

const parts = computed(() => bodyParts(props.value, props.nameOf));

function grow(): void {
    const el = field.value;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 2 + 'px';
}

function edit(): void {
    if (props.disabled || editing.value) return;
    draft.value = props.value;
    editing.value = true;
    void nextTick(() => {
        const el = field.value;
        if (!el) return;
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
        grow();
    });
}

function close(refocus: boolean): void {
    editing.value = false;
    if (refocus) void nextTick(() => { if (view.value) view.value.focus(); });
}

function save(refocus: boolean): void {
    if (!editing.value || leaving) return;
    leaving = true;
    const text = draft.value;
    close(refocus);
    if (text !== props.value) emit('save', text);
    leaving = false;
}

function onKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        leaving = true;
        close(true);
        leaving = false;
        return;
    }
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        event.stopPropagation();
        save(true);
        return;
    }
    event.stopPropagation();
}

function onReadClick(event: MouseEvent): void {
    const target = event.target;
    if (target instanceof HTMLElement && target.closest('button')) return;
    edit();
}

function onReadKey(event: KeyboardEvent): void {
    if (event.key !== 'Enter' || event.target !== view.value) return;
    event.preventDefault();
    edit();
}

defineExpose({ edit, view });
</script>

<template>
  <div class="edit is-multiline" :class="{ 'is-editing': editing }">
    <template v-if="editing">
      <textarea
        ref="field"
        v-model="draft"
        class="edit-field"
        rows="4"
        :maxlength="CAMPAIGN_LIMITS.entryBody"
        aria-label="Entry"
        @input="grow"
        @keydown="onKey"
        @blur="save(false)"
      ></textarea>
      <p class="edit-hint"><span>Ctrl+Enter saves · Esc puts it back</span></p>
    </template>
    <div
      v-else
      ref="view"
      class="edit-view jn-read"
      :class="{ 'is-empty': !value }"
      tabindex="0"
      role="textbox"
      aria-readonly="true"
      aria-label="Entry"
      @click="onReadClick"
      @keydown="onReadKey"
    >
      <template v-if="value">
        <template v-for="(part, index) in parts" :key="index">
          <span v-if="part.kind === 'text'">{{ part.text }}</span>
          <button v-else type="button" class="ui-chip jn-token" @click="emit('open', part)">{{ part.label }}</button>
        </template>
      </template>
      <template v-else>Write the entry</template>
    </div>
  </div>
</template>

<style>
.jn-read {
  cursor: text;
}

.jn-token {
  margin: 0 2px;
  vertical-align: baseline;
  cursor: pointer;
}
</style>
