<script setup lang="ts">
/**
 * The replies under a journal entry (streams/D.md DU30). "3 replies" opens the thread: the replies
 * oldest first (who, when, the note), a box at the foot, and under each reply its own "Reply" for
 * one more level. The rows are read once per opening through the campaign read with `parent`;
 * a post and a delete go straight to the campaign write, not through the journal's queue, so a
 * reply never lands in the journal list. The server's refusal is shown in its own words.
 */
import { computed, onServerPrefetch, ref, watch } from 'vue';
import type { CampaignEntry } from '@voyage/shared';
import { session } from '../../account/session.ts';
import { newEntryId } from '../../campaign/commit.ts';
import { JOURNAL_PUBLIC_HEADERS, parseRead } from '../../campaign/read.ts';
import { campaign, transport } from '../../campaign/store.ts';
import { apiFetch } from '../../platform/http.ts';
import { loadSchemas } from '../../platform/schemas.ts';
import { showToast } from '../../shell/toast.ts';
import { bodyParts } from './body.ts';
import {
    authorWords,
    changesPath,
    dateWords,
    DELETE_FAILED,
    deleteChange,
    mayDelete,
    POST_FAILED,
    ownHandle,
    postedReply,
    READ_FAILED,
    readThread,
    refusalWords,
    replyChange,
    replyText,
    replyWords,
    restoreChange,
    threadPath,
    threadStale,
    type Reply,
} from './replies.ts';

const props = withDefaults(defineProps<{
    /** The entry, or at depth 1 the reply, these rows answer. */
    parentId: string;
    /** Live replies the last read counted; the thread's own length once it is open. */
    count: number;
    /**
     * No box and no Delete: the page is offline or the example. A player's page is read-only on an
     * entry that is not their note, and still takes a reply, so the entry page passes that through as
     * false; the thread itself stays locked while no campaign is open.
     */
    readOnly: boolean;
    /** 0 under the entry, 1 under a reply. A reply at depth 1 has no replies of its own on screen. */
    depth?: number;
    /** Open from the start: a test renders the thread this way. */
    startOpen?: boolean;
}>(), { depth: 0, startOpen: false });

const emit = defineEmits<{
    /** The thread's live count changed: the parent's row follows. */
    count: [n: number];
}>();

const open = ref(props.startOpen);
const rows = ref<Reply[] | null>(null);
const loading = ref(false);
const loadError = ref('');
const draft = ref('');
const posting = ref(false);
const postError = ref('');
const deleting = ref(new Set<string>());
/** Replies posted on this page: a player's own before any read says so. */
const made = ref(new Set<string>());
const boxEl = ref<HTMLTextAreaElement | null>(null);
let job: Promise<void> | null = null;

/** The thread takes no reply: told so, or no campaign open to take it. */
const locked = computed(() => props.readOnly || campaign.status !== 'ready' || !campaign.universeId || campaign.role === null);
const shownCount = computed(() => (rows.value ? rows.value.length : props.count));
const label = computed(() => (shownCount.value > 0 ? replyWords(shownCount.value) : 'Reply'));
/** Nothing to open: read-only, and no reply to read. */
const offered = computed(() => !(locked.value && shownCount.value === 0));
const myName = computed(() => ownHandle(session.user));

function nameOf(target: string): string | null {
    if (!target.startsWith('cr_')) return null;
    const record = campaign.records[target];
    return record && !record.deleted ? record.name : null;
}

function tellCount(): void {
    const n = rows.value ? rows.value.length : props.count;
    const held = campaign.journal[props.parentId];
    if (held) held.replies = n;
    emit('count', n);
}

async function load(): Promise<void> {
    const id = campaign.universeId;
    if (!id) {
        rows.value = [];
        return;
    }
    loading.value = true;
    loadError.value = '';
    const shared = loadSchemas();
    try {
        const res = await apiFetch(transport.fetch, threadPath(id, props.parentId), { headers: JOURNAL_PUBLIC_HEADERS });
        if (!res.ok) throw new Error('read');
        const data = (await res.json() as { data?: { journal?: unknown[] } }).data;
        const schema = (await shared).CampaignEntry;
        rows.value = readThread(data?.journal ?? [], (row) => parseRead(schema, row) as CampaignEntry);
        tellCount();
    } catch {
        loadError.value = READ_FAILED;
    } finally {
        loading.value = false;
    }
}

function ensure(): Promise<void> {
    if (!job) job = load().finally(() => { job = null; });
    return job;
}

function reload(): void {
    rows.value = null;
    void ensure();
}

watch(open, (on) => { if (on && !rows.value && !loading.value) void ensure(); }, { immediate: true });
onServerPrefetch(() => job ?? Promise.resolve());

/** The poll moved the count (DF21): an open thread reads itself again. The rule is `threadStale`. */
watch(() => props.count, (count) => {
    const state = { open: open.value, held: rows.value ? rows.value.length : null, busy: loading.value || posting.value || deleting.value.size > 0 };
    if (threadStale(state, count)) void ensure();
});

function toggle(): void {
    open.value = !open.value;
}

async function post(): Promise<void> {
    const id = campaign.universeId;
    const text = replyText(draft.value);
    if (!id || !text || posting.value || !rows.value) return;
    const change = replyChange(props.parentId, text, newEntryId(), new Date().toISOString());
    posting.value = true;
    postError.value = '';
    try {
        const res = await apiFetch(transport.fetch, changesPath(id), {
            method: 'PATCH',
            headers: JOURNAL_PUBLIC_HEADERS,
            body: JSON.stringify({ journal: [change] }),
        });
        const body = await res.json().catch(() => null) as { data?: { applied?: Array<{ table: string; id: string; rev: number }> } } | null;
        if (!res.ok) {
            postError.value = refusalWords(body, POST_FAILED);
            return;
        }
        const applied = body?.data?.applied?.find((row) => row.table === 'journal' && row.id === change.id);
        const reply = applied ? postedReply(change, applied.rev, myName.value, campaign.role === 'owner' ? 'referee' : undefined) : null;
        if (!reply) {
            postError.value = POST_FAILED;
            return;
        }
        made.value.add(reply.id);
        rows.value.push(reply);
        draft.value = '';
        tellCount();
        if (boxEl.value) boxEl.value.focus();
    } catch {
        postError.value = POST_FAILED;
    } finally {
        posting.value = false;
    }
}

function canDelete(reply: Reply): boolean {
    return !locked.value && mayDelete(reply, campaign.role, made.value.has(reply.id));
}

async function send(change: ReturnType<typeof deleteChange>): Promise<{ ok: true; rev: number } | { ok: false; words: string }> {
    const id = campaign.universeId;
    if (!id) return { ok: false, words: DELETE_FAILED };
    try {
        const res = await apiFetch(transport.fetch, changesPath(id), {
            method: 'PATCH',
            headers: JOURNAL_PUBLIC_HEADERS,
            body: JSON.stringify({ journal: [change] }),
        });
        const body = await res.json().catch(() => null) as { data?: { applied?: Array<{ table: string; id: string; rev: number }> } } | null;
        if (!res.ok) return { ok: false, words: refusalWords(body, DELETE_FAILED) };
        const applied = body?.data?.applied?.find((row) => row.table === 'journal' && row.id === change.id);
        return applied ? { ok: true, rev: applied.rev } : { ok: false, words: DELETE_FAILED };
    } catch {
        return { ok: false, words: DELETE_FAILED };
    }
}

async function remove(reply: Reply): Promise<void> {
    if (!rows.value || deleting.value.has(reply.id)) return;
    deleting.value.add(reply.id);
    try {
        const sent = await send(deleteChange(reply));
        if (!sent.ok) {
            showToast(sent.words);
            return;
        }
        const list = rows.value;
        const at = list.indexOf(reply);
        if (at >= 0) list.splice(at, 1);
        tellCount();
        const gone = { ...reply, rev: sent.rev };
        showToast('Deleted the reply.', { action: { label: 'Undo', run: () => { void restore(gone, at); } } });
    } finally {
        deleting.value.delete(reply.id);
    }
}

async function restore(reply: Reply, at: number): Promise<void> {
    const sent = await send(restoreChange(reply, reply.rev, new Date().toISOString()));
    if (!sent.ok) {
        showToast(sent.words);
        return;
    }
    if (!rows.value) return;
    const back = { ...reply, rev: sent.rev };
    rows.value.splice(Math.min(Math.max(at, 0), rows.value.length), 0, back);
    tellCount();
}

function onBoxKey(event: KeyboardEvent): void {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        event.stopPropagation();
        void post();
        return;
    }
    if (event.key === 'Escape') return;
    event.stopPropagation();
}
</script>

<template>
  <div v-if="offered" class="jn-replies" :data-depth="depth" :data-replies="parentId">
    <h3 v-if="depth === 0" class="ui-heading">Replies</h3>
    <button
      type="button"
      class="jn-replies-toggle"
      :class="{ 'is-open': open }"
      :aria-expanded="open ? 'true' : 'false'"
      data-replies-toggle
      @click="toggle"
    >
      {{ label }}
    </button>
    <div v-if="open" class="jn-thread">
      <p v-if="loading && !rows" class="jn-quiet" role="status">Reading the replies…</p>
      <div v-else-if="loadError" class="camp-strip is-error" role="alert">
        <span>{{ loadError }}</span>
        <button type="button" class="ui-btn" @click="reload">Try again</button>
      </div>
      <ol v-else-if="rows && rows.length" class="jn-thread-rows" aria-label="Replies">
        <li v-for="reply in rows" :key="reply.id" class="jn-reply" :data-reply="reply.id">
          <p class="jn-reply-head">
            <b class="jn-reply-who">{{ authorWords(reply) }}</b>
            <span class="ui-date">{{ dateWords(reply.createdAt) }}</span>
            <button
              v-if="canDelete(reply)"
              type="button"
              class="jn-reply-act"
              data-reply-delete
              :disabled="deleting.has(reply.id)"
              @click="remove(reply)"
            >
              Delete
            </button>
          </p>
          <p class="jn-reply-text">
            <template v-for="(part, index) in bodyParts(reply.body, nameOf)" :key="index">
              <span v-if="part.kind === 'text'">{{ part.text }}</span>
              <span v-else class="ui-chip">{{ part.label }}</span>
            </template>
          </p>
          <Replies
            v-if="depth < 1"
            :parent-id="reply.id"
            :count="reply.replies"
            :read-only="locked"
            :depth="depth + 1"
            @count="reply.replies = $event"
          />
        </li>
      </ol>
      <p v-else-if="rows" class="jn-quiet">No replies yet.</p>
      <form v-if="!locked && rows" class="jn-reply-form" @submit.prevent="post">
        <textarea
          ref="boxEl"
          v-model="draft"
          class="jn-reply-box"
          rows="2"
          placeholder="Write a reply"
          aria-label="Write a reply"
          :disabled="posting"
          data-reply-box
          @keydown="onBoxKey"
        ></textarea>
        <p v-if="postError" class="jn-reply-error" role="alert" data-reply-error>{{ postError }}</p>
        <div class="jn-reply-acts">
          <button type="submit" class="ui-btn is-primary" data-reply-post :disabled="posting || !draft.trim()">{{ posting ? 'Posting…' : 'Post' }}</button>
          <span class="jn-quiet">Ctrl+Enter posts.</span>
        </div>
      </form>
    </div>
  </div>
</template>

<style>
.jn-replies {
  margin-top: 14px;
}

.jn-replies[data-depth="1"] {
  margin: 6px 0 0;
}

.jn-replies-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 28px;
  margin: 0;
  padding: 2px 0;
  border: 0;
  background: none;
  color: var(--signal);
  font: 700 12.5px/1.4 var(--font-display);
  letter-spacing: 0.08em;
  cursor: pointer;
}

.jn-replies-toggle::before {
  content: '';
  width: 0;
  height: 0;
  border: 4px solid transparent;
  border-left: 6px solid currentColor;
  border-right: 0;
  transition: transform var(--t-chevron) ease;
}

.jn-replies-toggle.is-open::before {
  transform: rotate(90deg);
}

.jn-replies-toggle:hover,
.jn-replies-toggle:focus-visible {
  color: var(--text-0);
  outline: none;
}

.jn-replies-toggle:focus-visible {
  box-shadow: 0 0 0 2px var(--focus-ring);
  border-radius: var(--r-1);
}

.jn-replies[data-depth="1"] .jn-replies-toggle {
  min-height: 24px;
  font-size: 11.5px;
}

.jn-thread {
  margin-top: 6px;
  padding-left: 12px;
  border-left: 2px solid var(--line-2);
}

.jn-thread-rows {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.jn-reply {
  margin: 0;
}

.jn-reply-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 10px;
  margin: 0;
}

.jn-reply-who {
  color: var(--text-0);
  font: 700 13px/1.4 var(--font-text);
}

.jn-reply-act {
  margin-left: auto;
  padding: 0;
  border: 0;
  background: none;
  color: var(--text-muted);
  font: 400 12px/1.4 var(--font-text);
  cursor: pointer;
}

.jn-reply-act:hover,
.jn-reply-act:focus-visible {
  color: var(--text-0);
  text-decoration: underline;
  outline: none;
}

.jn-reply-text {
  margin: 2px 0 0;
  color: var(--text-1);
  font: 400 14px/1.5 var(--font-text);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.jn-reply-form {
  margin-top: 10px;
}

.jn-reply-box {
  box-sizing: border-box;
  width: 100%;
  min-height: 34px;
  padding: 6px 9px;
  border: 1px solid var(--control-line);
  border-radius: var(--r-2);
  background: var(--bg-2);
  color: var(--text-0);
  font: 400 14px/1.4 var(--font-text);
  resize: vertical;
}

.jn-reply-error {
  margin: 6px 0 0;
  color: var(--danger);
  font: 400 13px/1.4 var(--font-text);
}

.jn-reply-acts {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-top: 6px;
}

@media (pointer: coarse) {
  .jn-replies-toggle,
  .jn-reply-act,
  .jn-reply-acts .ui-btn {
    min-height: 44px;
  }
}
</style>
