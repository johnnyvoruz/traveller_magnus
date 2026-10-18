<script setup lang="ts">
/**
 * The entry's body (journal design §4). Reading, tokens are chips, and bold, italic, lists,
 * and links draw as themselves. Editing, the text is the text, and Enter is a new line.
 * A chip opens what it names. A tag in the source stays text.
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { CAMPAIGN_LIMITS, type CampaignRecord } from '@voyage/shared';
import { type BodyPart } from './body.ts';
import MentionList from './MentionList.vue';
import RichNodes from './RichNodes.vue';
import { parseRich } from './rich.ts';
import { filterMentions, mentionBackspace, mentionQuery, mentionToken } from './mention.ts';

const props = defineProps<{
    value: string;
    disabled?: boolean;
    nameOf: (target: string) => string | null;
    records: Readonly<Record<string, CampaignRecord>>;
}>();

const emit = defineEmits<{
    save: [text: string];
    open: [part: BodyPart];
}>();

const editing = ref(false);
const draft = ref('');
const caret = ref(0);
const active = ref(0);
const box = ref({ top: 0, left: 0 });
/** The @ Escape already closed, so the same query stays text until it changes. */
const skip = ref<string | null>(null);
const field = ref<HTMLTextAreaElement | null>(null);
const view = ref<HTMLElement | null>(null);
const mentionList = ref<{ $el?: HTMLElement } | null>(null);
let leaving = false;
let frameObserver: ResizeObserver | null = null;

const nodes = computed(() => parseRich(props.value, props.nameOf));
const mention = computed(() => {
    if (!editing.value) return null;
    const found = mentionQuery(draft.value, caret.value);
    if (!found || skip.value === found.start + ':' + found.query) return null;
    return found;
});
const hits = computed(() => (mention.value ? filterMentions(props.records, mention.value.query) : []));
const noRecords = computed(() => filterMentions(props.records, '', 1).length === 0);

watch(() => mention.value?.query, () => { active.value = 0; });

function grow(): void {
    const el = field.value;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 2 + 'px';
}

function edit(): void {
    if (props.disabled || editing.value) return;
    draft.value = props.value;
    skip.value = null;
    editing.value = true;
    void nextTick(() => {
        const el = field.value;
        if (!el) return;
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
        caret.value = el.value.length;
        grow();
        placeMention();
        watchFrame(true);
    });
}

/** A fixed list follows the caret when the entry's frame changes size. */
function watchFrame(on: boolean): void {
    if (frameObserver) {
        frameObserver.disconnect();
        frameObserver = null;
    }
    const el = field.value;
    if (!on || !el) return;
    const frame = el.closest('article') ?? el;
    frameObserver = new ResizeObserver(() => { if (mention.value) placeMention(); });
    frameObserver.observe(frame);
}

function close(refocus: boolean): void {
    editing.value = false;
    watchFrame(false);
    if (refocus) void nextTick(() => { if (view.value) view.value.focus(); });
}

onBeforeUnmount(() => watchFrame(false));

function save(refocus: boolean): void {
    if (!editing.value || leaving) return;
    leaving = true;
    const text = draft.value;
    close(refocus);
    if (text !== props.value) emit('save', text);
    leaving = false;
}

function readCaret(): void {
    const el = field.value;
    caret.value = el ? el.selectionStart : 0;
    placeMention();
}

/**
 * position:fixed inside the panel is relative to that panel: it is transformed,
 * so a viewport number would sit too low and too far right.
 */
function fixedOrigin(el: HTMLElement): { top: number; left: number } {
    let node: HTMLElement | null = el.parentElement;
    while (node && node !== document.documentElement) {
        const style = getComputedStyle(node);
        if (style.transform !== 'none' || style.perspective !== 'none' || style.filter !== 'none') {
            const at = node.getBoundingClientRect();
            return { top: at.top, left: at.left };
        }
        node = node.parentElement;
    }
    return { top: 0, left: 0 };
}

/** The caret, in the list's own coordinates, so the list sits on the word being typed. */
function placeMention(): void {
    const el = field.value;
    if (!el || !mention.value) return;
    const style = getComputedStyle(el);
    const mirror = document.createElement('div');
    const mark = document.createElement('span');
    mirror.style.position = 'fixed';
    mirror.style.left = '0';
    mirror.style.top = '0';
    mirror.style.visibility = 'hidden';
    mirror.style.whiteSpace = 'pre-wrap';
    mirror.style.overflowWrap = 'break-word';
    mirror.style.boxSizing = 'border-box';
    mirror.style.width = el.clientWidth + 'px';
    mirror.style.font = style.font;
    mirror.style.letterSpacing = style.letterSpacing;
    mirror.style.lineHeight = style.lineHeight;
    mirror.style.padding = style.padding;
    mirror.textContent = el.value.slice(0, el.selectionStart);
    mark.textContent = ' ';
    mirror.appendChild(mark);
    document.body.appendChild(mirror);
    const origin = el.getBoundingClientRect();
    const at = mark.getBoundingClientRect();
    const mirrorBox = mirror.getBoundingClientRect();
    mirror.remove();
    const frame = el.closest('article') ?? el.parentElement;
    const bounds = frame ? frame.getBoundingClientRect() : origin;
    const width = 280;
    const raw = origin.left + (at.left - mirrorBox.left) - el.scrollLeft;
    const viewLeft = Math.max(bounds.left, Math.min(raw, bounds.right - width));
    const viewTop = origin.top + (at.bottom - mirrorBox.top) - el.scrollTop + 4;
    const base = fixedOrigin(el);
    box.value = { top: viewTop - base.top, left: viewLeft - base.left };
}

function choose(record: CampaignRecord): void {
    const el = field.value;
    const found = mention.value;
    if (!el || !found) return;
    const token = mentionToken(record.id, record.name) + ' ';
    const next = draft.value.slice(0, found.start) + token + draft.value.slice(el.selectionStart);
    const at = found.start + token.length;
    draft.value = next;
    caret.value = at;
    void nextTick(() => {
        el.focus();
        el.setSelectionRange(at, at);
        grow();
        placeMention();
    });
}

function showActive(): void {
    void nextTick(() => {
        const root = mentionList.value ? mentionList.value.$el : null;
        const el = root ? root.querySelector<HTMLElement>('[aria-selected="true"]') : null;
        if (el) el.scrollIntoView({ block: 'nearest' });
    });
}

function onKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        if (mention.value) {
            skip.value = mention.value.start + ':' + mention.value.query;
            return;
        }
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
    if (mention.value && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
        event.preventDefault();
        event.stopPropagation();
        const count = hits.value.length;
        if (!count) return;
        active.value = (active.value + (event.key === 'ArrowDown' ? 1 : count - 1)) % count;
        showActive();
        return;
    }
    if (mention.value && hits.value.length && (event.key === 'Enter' || event.key === 'Tab')) {
        event.preventDefault();
        event.stopPropagation();
        const chosen = hits.value[active.value];
        if (chosen) choose(chosen);
        return;
    }
    if (event.key === 'Backspace' && !event.metaKey && !event.ctrlKey && !event.altKey) {
        const el = field.value;
        if (el && el.selectionStart === el.selectionEnd) {
            const span = mentionBackspace(el.value, el.selectionStart);
            if (span) {
                event.preventDefault();
                event.stopPropagation();
                const at = span.from;
                draft.value = el.value.slice(0, span.from) + el.value.slice(span.to);
                caret.value = at;
                void nextTick(() => {
                    el.setSelectionRange(at, at);
                    grow();
                    readCaret();
                });
                return;
            }
        }
    }
    event.stopPropagation();
}

function onReadClick(event: MouseEvent): void {
    const target = event.target;
    if (target instanceof HTMLElement && target.closest('button, a')) return;
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
        role="combobox"
        aria-autocomplete="list"
        aria-controls="jn-mention-list"
        :aria-expanded="mention ? 'true' : 'false'"
        :aria-activedescendant="mention && hits.length ? 'jn-mention-' + active : undefined"
        @input="grow(); readCaret()"
        @keyup="readCaret"
        @click="readCaret"
        @keydown="onKey"
        @blur="save(false)"
      ></textarea>
      <MentionList
        v-if="mention"
        ref="mentionList"
        :hits="hits"
        :records="records"
        :active="active"
        :empty="noRecords"
        :query="mention.query"
        :top="box.top"
        :left="box.left"
        @choose="choose"
        @hover="active = $event"
      />
      <p class="edit-hint"><span>@ names a record · Ctrl+Enter saves · Esc puts it back</span></p>
    </template>
    <div
      v-else
      ref="view"
      class="edit-view jn-read is-rich"
      :class="{ 'is-empty': !value }"
      tabindex="0"
      role="textbox"
      aria-readonly="true"
      aria-label="Entry"
      @click="onReadClick"
      @keydown="onReadKey"
    >
      <RichNodes v-if="value" :nodes="nodes" @open="emit('open', $event)" />
      <template v-else>Write the entry</template>
    </div>
  </div>
</template>

<style>
.jn-read {
  cursor: text;
}
</style>
