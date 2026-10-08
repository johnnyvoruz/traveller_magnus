<script setup lang="ts">
/**
 * The Characters pane (character MVP): mine and shared with me, one sheet, and share by link.
 * The sheet is Agent D's. The store behind it is Agent A's characters modules.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { session } from '../../account/session.ts';
import Icon from '../../design/Icon.vue';
import { observeSize } from '../../platform/browser.ts';
import { atPane, addressPane } from '../../shell/pane.ts';
import Panel from '../../shell/Panel.vue';
import { readSpan, writeSpan, type PanelSpan } from '../../shell/panel_state.ts';
import { registerCommand } from '../../shell/registry.ts';
import { showToast } from '../../shell/toast.ts';
import CharacterSheet from '../../workspace/CharacterSheet.vue';
import EditableText from '../../workspace/EditableText.vue';
import SignInCard from '../../workspace/SignInCard.vue';
import {
    answerConfirm,
    bindSheet,
    characters,
    confirm,
    createCharacter,
    deleteCharacter,
    giveOwnership,
    listAccess,
    listInvites,
    loadCharacters,
    makeInvite,
    openCharacter,
    removeAccess,
    renameCharacter,
    revokeInvite,
} from './client.ts';
import type { CharacterAccessRow, CharacterHandle, CharacterInvite } from '../types.ts';
import {
    EMPTY_ALL,
    EMPTY_MINE,
    EMPTY_SHARED,
    NAME_MAX,
    characterGroups,
    duplicateName,
    pregenCount,
    pregenName,
    presenceTone,
    shareFace,
    type RowFace,
    type ShareInvite,
    type SharePerson,
} from './model.ts';

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: []; width: [px: number] }>();

const route = useRoute();
const router = useRouter();
const panel = ref<{ element: HTMLElement | null } | null>(null);
const span = ref<PanelSpan>(readSpan());
const query = ref('');
const making = ref(false);
const draft = ref('');
const nameEl = ref<HTMLInputElement | null>(null);
const busy = ref(false);
const pregenN = ref(2);
const ownArmed = ref('');
const fresh = ref<{ id: string; url: string } | null>(null);
const people = ref<SharePerson[]>([]);
const invites = ref<ShareInvite[]>([]);
const live = ref<CharacterHandle | null>(null);

let stopSize: (() => void) | null = null;
let sized: HTMLElement | null = null;
let stopCommands: (() => void) | null = null;

const signedIn = computed(() => session.user !== null);
const characterId = computed(() => {
    const pane = addressPane(route.path, route.query).pane;
    return pane.kind === 'characters' ? pane.character : null;
});
const groups = computed(() => characterGroups(characters.items));

function matches(face: RowFace): boolean {
    const needle = query.value.trim().toLowerCase();
    if (!needle) return true;
    return (face.name + '\n' + face.summary + '\n' + (face.owner ?? '') + '\n' + face.here).toLowerCase().includes(needle);
}

const mine = computed(() => groups.value.mine.filter(matches));
const shared = computed(() => groups.value.shared.filter(matches));
const sheet = computed(() => (live.value ? bindSheet(live.value) : null));
const share = computed(() => shareFace({
    role: live.value?.role === 'owner' ? 'owner' : 'editor',
    people: people.value,
    invites: invites.value,
    freshUrl: fresh.value ? fresh.value.url : null,
}));
const others = computed(() => (live.value ? live.value.who : []).filter((person) => person.name.trim().length > 0));

function canOwn(): boolean {
    return live.value !== null && live.value.role === 'owner' && live.value.status !== 'gone';
}

function quiet(handle: CharacterHandle): string {
    if (handle.status === 'connecting') return 'Connecting';
    if (handle.status === 'live') return 'Live';
    if (handle.status === 'offline') return 'Offline. Changes are sent when they can be.';
    return handle.notice || 'This character is no longer open.';
}

function panelElement(): HTMLElement | null {
    return panel.value ? panel.value.element : null;
}

function publish(): void {
    const el = panelElement();
    emit('width', props.open && el ? el.offsetWidth : 0);
}

function bindSize(): void {
    const el = panelElement();
    if (el === sized) return;
    if (stopSize) stopSize();
    stopSize = null;
    sized = el;
    if (el) stopSize = observeSize(el, publish);
}

function chooseSpan(next: PanelSpan): void {
    span.value = next;
    writeSpan(next);
    void nextTick(publish);
}

function go(id: string | null): void {
    void router.push(atPane(route.path, route.query, { kind: 'characters', character: id }));
}

function onKey(event: KeyboardEvent): void {
    if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target as HTMLElement | null;
    const tag = target ? target.tagName : '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    const input = panelElement()?.querySelector<HTMLElement>('.ch-search input');
    if (!input) return;
    event.preventDefault();
    event.stopPropagation();
    input.focus();
}

async function beginOrCreate(): Promise<void> {
    if (!signedIn.value || busy.value) return;
    if (characterId.value) go(null);
    if (!making.value) {
        making.value = true;
        draft.value = '';
        void nextTick(() => { if (nameEl.value) nameEl.value.focus(); });
        return;
    }
    const name = draft.value.trim();
    if (!name) return;
    busy.value = true;
    try {
        const made = await createCharacter(name);
        if (!made) {
            showToast(characters.error || 'The character could not be made.');
            return;
        }
        making.value = false;
        draft.value = '';
        go(made.id);
    } finally {
        busy.value = false;
    }
}

async function duplicateOf(id: string, name: string): Promise<void> {
    if (busy.value) return;
    busy.value = true;
    try {
        const made = await createCharacter(duplicateName(name), id);
        if (!made) {
            showToast(characters.error || 'That character could not be copied.');
            return;
        }
        go(made.id);
    } finally {
        busy.value = false;
    }
}

async function duplicateOpen(): Promise<void> {
    if (!live.value || live.value.role !== 'owner') {
        showToast('Open one of yours, then Duplicate.');
        return;
    }
    await duplicateOf(live.value.id, live.value.character?.name ?? '');
}

async function makePregens(): Promise<void> {
    if (!live.value || live.value.role !== 'owner' || busy.value) return;
    const count = pregenCount(Number(pregenN.value));
    if (count === null) {
        showToast('Choose a number from 2 to 12.');
        return;
    }
    const base = live.value.character?.name ?? '';
    const from = live.value.id;
    busy.value = true;
    let made = 0;
    try {
        for (let n = 1; n <= count; n += 1) {
            const created = await createCharacter(pregenName(base, n), from);
            if (created) made += 1;
        }
    } finally {
        busy.value = false;
    }
    go(null);
    showToast(made === count ? count + ' pregens made.' : 'Some pregens could not be made.');
}

async function rename(text: string): Promise<void> {
    if (!live.value || live.value.role !== 'owner') return;
    const name = text.trim();
    if (!name || name === (live.value.character?.name ?? '')) return;
    const ok = await renameCharacter(live.value.id, name);
    if (!ok) showToast(characters.error || 'The name was not saved.');
}

async function refreshShare(id: string): Promise<void> {
    const owner = live.value !== null && live.value.role === 'owner';
    const access = await listAccess(id);
    const links = owner ? await listInvites(id) : [];
    if (characterId.value !== id) return;
    people.value = (access ?? []).map((person: CharacterAccessRow) => ({ userId: person.userId, name: person.name, role: person.role }));
    invites.value = (links ?? [])
        .filter((invite: CharacterInvite) => !invite.revokedAt && !invite.claimedAt)
        .map((invite) => ({ id: invite.id, expiresAt: invite.expiresAt }));
}

async function makeLink(): Promise<void> {
    if (!canOwn() || !live.value) return;
    const made = await makeInvite(live.value.id);
    if (!made) {
        showToast(characters.error || 'The link could not be made.');
        return;
    }
    fresh.value = { id: made.id, url: made.url };
    await refreshShare(live.value.id);
}

async function copyLink(): Promise<void> {
    const url = fresh.value?.url;
    if (!url) return;
    try {
        await navigator.clipboard.writeText(url);
        showToast('Link copied.');
    } catch {
        showToast('Select the link and copy it.');
    }
}

async function revoke(inviteId: string): Promise<void> {
    if (!live.value) return;
    const ok = await revokeInvite(live.value.id, inviteId);
    if (!ok) showToast('The link could not be revoked.');
    if (fresh.value && fresh.value.id === inviteId) fresh.value = null;
    await refreshShare(live.value.id);
}

async function revokeFromCommand(): Promise<void> {
    if (invites.value.length !== 1) {
        showToast('Open Share and choose a link.');
        return;
    }
    await revoke(invites.value[0].id);
}

async function dropAccess(userId: string): Promise<void> {
    if (!live.value) return;
    const ok = await removeAccess(live.value.id, userId);
    if (!ok) showToast('That person could not be removed.');
    if (ownArmed.value === userId) ownArmed.value = '';
    await refreshShare(live.value.id);
}

async function removeFromCommand(): Promise<void> {
    const editors = people.value.filter((person) => person.role === 'editor');
    if (editors.length !== 1) {
        showToast('Open Share and choose a person.');
        return;
    }
    await dropAccess(editors[0].userId);
}

async function transfer(userId: string): Promise<void> {
    if (!live.value) return;
    const id = live.value.id;
    const ok = await giveOwnership(id, userId);
    if (!ok) {
        showToast(characters.error || 'They could not be made the owner.');
        return;
    }
    ownArmed.value = '';
    await refreshShare(id);
    showToast('They own this character now.');
}

function askOwn(userId: string): void {
    if (ownArmed.value === userId) {
        void transfer(userId);
        return;
    }
    ownArmed.value = userId;
}

function ownFromCommand(): void {
    if (ownArmed.value) {
        void transfer(ownArmed.value);
        return;
    }
    const editors = people.value.filter((person) => person.role === 'editor');
    if (editors.length !== 1) {
        showToast('Open Share and choose a person.');
        return;
    }
    ownArmed.value = editors[0].userId;
}

async function removeCharacter(): Promise<void> {
    if (!canOwn() || !live.value || confirm.open) return;
    const id = live.value.id;
    const ok = await deleteCharacter(id);
    if (ok) go(null);
    else if (characters.error) showToast(characters.error);
}

function bindCommands(): void {
    if (stopCommands) stopCommands();
    stopCommands = null;
    if (!props.open) return;
    const off = [
        registerCommand({ id: 'character-new', name: 'New character', runnable: () => signedIn.value && !busy.value, run: () => { void beginOrCreate(); } }),
        registerCommand({ id: 'character-duplicate', name: 'Duplicate', runnable: () => canOwn(), run: () => { void duplicateOpen(); } }),
        registerCommand({ id: 'character-pregens', name: 'Make pregens', runnable: () => canOwn(), run: () => { void makePregens(); } }),
        registerCommand({ id: 'character-share', name: 'Share by link', runnable: () => canOwn(), run: () => { void makeLink(); } }),
        registerCommand({ id: 'character-copy-link', name: 'Copy the link', runnable: () => fresh.value !== null, run: () => { void copyLink(); } }),
        registerCommand({ id: 'character-revoke', name: 'Revoke the link', runnable: () => canOwn(), run: () => { void revokeFromCommand(); } }),
        registerCommand({ id: 'character-remove', name: 'Remove access', runnable: () => canOwn(), run: () => { void removeFromCommand(); } }),
        registerCommand({ id: 'character-own', name: 'Make them the owner', runnable: () => canOwn(), run: () => { ownFromCommand(); } }),
        registerCommand({ id: 'character-delete', name: 'Delete character', runnable: () => canOwn() && !confirm.open, run: () => { void removeCharacter(); } }),
        registerCommand({ id: 'character-delete-yes', name: 'Delete it', runnable: () => confirm.open, run: () => { answerConfirm(true); } }),
    ];
    stopCommands = () => { for (const stop of off) stop(); };
}

watch(() => props.open, (open) => {
    if (open) span.value = readSpan();
    void nextTick(() => { bindSize(); publish(); });
    bindCommands();
});

watch(() => [props.open, signedIn.value] as const, () => {
    if (props.open && signedIn.value) void loadCharacters();
}, { immediate: true });

watch(() => live.value?.role, (role) => {
    if (role === 'owner' && live.value) void refreshShare(live.value.id);
});

watch(characterId, (id) => {
    if (confirm.open) answerConfirm(false);
    ownArmed.value = '';
    fresh.value = null;
    people.value = [];
    invites.value = [];
    if (live.value) {
        live.value.close();
        live.value = null;
    }
    if (id) {
        live.value = openCharacter(id);
        void refreshShare(id);
    }
    if (!props.open) return;
    void nextTick(() => {
        const root = panelElement();
        if (!root) return;
        const target = id
            ? root.querySelector<HTMLElement>('.ch-name .edit-view, .ch-back')
            : root.querySelector<HTMLElement>('.ch-search input, .ch-first .ui-btn');
        if (target) target.focus();
    });
}, { immediate: true });

onMounted(() => {
    bindCommands();
    bindSize();
    void nextTick(publish);
});

onBeforeUnmount(() => {
    if (stopCommands) stopCommands();
    if (stopSize) stopSize();
    if (confirm.open) answerConfirm(false);
    if (live.value) live.value.close();
    emit('width', 0);
});
</script>

<template>
  <div class="characters-root" @keydown="onKey">
    <Panel
      ref="panel"
      :open="open"
      title="Characters"
      meta=""
      chip=""
      :span="span"
      @close="$emit('close')"
      @span="chooseSpan"
    >
      <template #glyph><Icon name="user" :size="16" /></template>
      <div v-if="!signedIn" class="ch-pad">
        <SignInCard />
      </div>
      <div v-else class="ch-pad">
        <p v-if="characters.error" class="ch-trouble" role="alert">{{ characters.error }}</p>
        <template v-if="!characterId">
          <div class="ch-tools">
            <label class="ch-search">
              <Icon name="search" :size="14" />
              <input v-model="query" type="search" placeholder="Search characters" aria-label="Search characters">
            </label>
            <button type="button" class="ui-btn is-primary" data-command="character-new" :disabled="busy" @click="beginOrCreate">
              <Icon name="plus" :size="12" />New character
            </button>
          </div>
          <form v-if="making" class="ch-form" @submit.prevent>
            <label>
              <span>Name</span>
              <input ref="nameEl" v-model="draft" type="text" :maxlength="NAME_MAX" :disabled="busy" aria-label="Name the new character">
            </label>
            <button type="submit" class="ui-btn is-primary" data-command="character-new" :disabled="busy || !draft.trim()" @click.prevent="beginOrCreate">Create</button>
            <button type="button" class="ui-btn" :disabled="busy" @click="making = false">Cancel</button>
          </form>
          <p v-if="characters.status === 'loading'" class="ch-empty">Loading characters.</p>
          <div v-else-if="characters.items.length === 0 && !query.trim()" class="ch-first">
            <p class="ch-empty">{{ EMPTY_ALL }}</p>
          </div>
          <template v-else>
            <h2 class="ui-heading">Mine</h2>
            <p v-if="mine.length === 0" class="ch-empty">{{ query.trim() ? 'No character matches.' : EMPTY_MINE }}</p>
            <ul v-else class="ch-rows">
              <li v-for="face in mine" :key="face.id">
                <button type="button" class="ch-row" :data-id="face.id" @click="go(face.id)">
                  <b>{{ face.name }}</b>
                  <span v-if="face.summary">{{ face.summary }}</span>
                  <span v-if="face.here" class="ch-here-line">Here: {{ face.here }}</span>
                </button>
                <button type="button" class="ui-btn" data-command="character-duplicate" :disabled="busy" @click="duplicateOf(face.id, face.name)">Duplicate</button>
              </li>
            </ul>
            <h2 class="ui-heading">Shared with me</h2>
            <p v-if="shared.length === 0" class="ch-empty">{{ query.trim() ? 'No character matches.' : EMPTY_SHARED }}</p>
            <ul v-else class="ch-rows">
              <li v-for="face in shared" :key="face.id">
                <button type="button" class="ch-row" :data-id="face.id" @click="go(face.id)">
                  <b>{{ face.name }}</b>
                  <span v-if="face.summary">{{ face.summary }}</span>
                  <span v-if="face.owner">Owned by {{ face.owner }}</span>
                  <span v-if="face.here" class="ch-here-line">Here: {{ face.here }}</span>
                </button>
              </li>
            </ul>
          </template>
        </template>
        <template v-else-if="live">
          <button type="button" class="ui-btn ch-back" @click="go(null)">
            <Icon name="arrow-left" :size="12" />All characters
          </button>
          <div class="ch-head">
            <div class="ch-name">
              <EditableText
                :value="live.character ? live.character.name : ''"
                label="Name"
                prompt="Untitled character"
                title
                :max="NAME_MAX"
                :disabled="live.role !== 'owner' || live.status === 'gone'"
                @save="rename"
              />
            </div>
            <p class="ch-owner">{{ live.role === 'owner' ? 'You own this' : 'Owned by ' + (live.ownerName || 'someone') }}</p>
            <p class="ch-status">{{ quiet(live) }}</p>
            <ul v-if="others.length" class="ch-marks">
              <li
                v-for="person in others"
                :key="person.id"
                class="ch-mark"
                :style="{ '--ch-tone': 'var(' + presenceTone(person.colour) + ')' }"
              >{{ person.name }}</li>
            </ul>
          </div>
          <p v-if="live.status === 'gone'" class="ch-empty">{{ live.notice || 'This character is no longer open.' }}</p>
          <CharacterSheet
            v-else-if="sheet"
            :doc="sheet.doc"
            :editable="sheet.editable"
            :presence="sheet.presence"
            @change="sheet.change"
            @enter="sheet.enter"
            @leave="sheet.leave"
          />
          <section v-if="live.status !== 'gone'" class="ch-share" :aria-label="share.readOnly ? 'Who has access' : 'Share'">
            <h2 class="ui-heading">{{ share.readOnly ? 'Who has access' : 'Share' }}</h2>
            <p v-if="share.readOnly" class="ch-empty">You can edit the sheet. You cannot change who else can.</p>
            <div v-if="share.canInvite" class="ch-acts">
              <button type="button" class="ui-btn" data-command="character-share" @click="makeLink">Share by link</button>
              <button type="button" class="ui-btn" data-command="character-duplicate" :disabled="busy" @click="duplicateOpen">Duplicate</button>
              <label class="ch-count">
                <span>Pregens</span>
                <input v-model.number="pregenN" type="number" min="2" max="12" aria-label="How many pregens">
              </label>
              <button type="button" class="ui-btn" data-command="character-pregens" :disabled="busy" @click="makePregens">Make pregens</button>
            </div>
            <div v-if="share.fresh" class="ch-fresh">
              <p>{{ share.fresh.note }}</p>
              <input class="ch-link" type="text" readonly :value="share.fresh.url" aria-label="The share link">
              <button type="button" class="ui-btn" data-command="character-copy-link" @click="copyLink">Copy</button>
              <button type="button" class="ui-btn" @click="fresh = null">Hide</button>
            </div>
            <ul v-if="share.invites.length" class="ch-people">
              <li v-for="invite in share.invites" :key="invite.id">
                <span>{{ invite.line }}</span>
                <button type="button" class="ui-btn" data-command="character-revoke" @click="revoke(invite.id)">Revoke</button>
              </li>
            </ul>
            <ul v-if="share.people.length" class="ch-people">
              <li v-for="person in share.people" :key="person.userId">
                <span>{{ person.name }}<em v-if="person.role === 'owner'"> owner</em></span>
                <button v-if="person.remove" type="button" class="ui-btn" data-command="character-remove" @click="dropAccess(person.userId)">Remove</button>
                <button v-if="person.own" type="button" class="ui-btn" data-command="character-own" @click="askOwn(person.userId)">
                  {{ ownArmed === person.userId ? 'Yes, make them the owner' : 'Make them the owner' }}
                </button>
              </li>
            </ul>
            <p v-if="share.readOnly && share.people.length === 0" class="ch-empty">No one else is listed.</p>
            <div v-if="share.canInvite" class="ch-acts">
              <button type="button" class="ui-btn" data-command="character-delete" @click="removeCharacter">
                <Icon name="trash" :size="12" />Delete
              </button>
            </div>
            <div v-if="confirm.open" class="ch-ask" role="alertdialog" aria-labelledby="ch-ask-title">
              <p id="ch-ask-title">{{ confirm.title }}</p>
              <p>{{ confirm.message }}</p>
              <button type="button" class="ui-btn" data-command="character-delete-yes" @click="answerConfirm(true)">{{ confirm.yes }}</button>
              <button type="button" class="ui-btn" @click="answerConfirm(false)">{{ confirm.no }}</button>
            </div>
          </section>
        </template>
      </div>
    </Panel>
  </div>
</template>

<style>
.characters-root {
  display: contents;
}

.ch-pad {
  padding: 16px;
}

.ch-tools,
.ch-acts,
.ch-form,
.ch-fresh {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.ch-tools {
  margin-bottom: 12px;
}

.ch-search {
  flex: 1 1 160px;
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 36px;
  padding: 0 12px;
  border: 1px solid var(--line-2);
  border-radius: var(--r-2);
  background: var(--bg-2);
  color: var(--text-muted);
}

.ch-search input,
.ch-form input,
.ch-count input,
.ch-link {
  min-width: 0;
  margin: 0;
  border: 0;
  background: transparent;
  color: var(--text-0);
  font: 400 14px/1.4 var(--font-text);
}

.ch-search input {
  flex: 1 1 auto;
  padding: 0;
}

.ch-search input::placeholder {
  color: var(--text-muted);
}

.ch-form,
.ch-fresh {
  margin: 0 0 12px;
  padding: 12px;
  border-radius: var(--r-2);
  background: var(--bg-2);
}

.ch-form label,
.ch-count {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-1);
  font: 600 13px/1.2 var(--font-text);
}

.ch-form input,
.ch-count input,
.ch-link {
  min-height: 32px;
  padding: 0 8px;
  border: 1px solid var(--line-2);
  border-radius: var(--r-2);
  background: var(--bg-1);
}

.ch-link {
  flex: 1 1 180px;
}

.ch-empty,
.ch-status,
.ch-owner,
.ch-fresh p {
  margin: 0 0 8px;
  color: var(--text-muted);
  font: 400 13px/1.45 var(--font-text);
}

.ch-status,
.ch-owner {
  font-size: 12px;
}

.ch-trouble {
  margin: 0 0 8px;
  color: var(--danger);
  font: 600 13px/1.4 var(--font-text);
}

.ch-rows {
  margin: 0;
  padding: 0;
  list-style: none;
}

.ch-rows li {
  display: flex;
  align-items: stretch;
  gap: 8px;
  margin: 0 0 8px;
  border-radius: var(--r-2);
  background: var(--panel-raised);
}

.ch-row {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  margin: 0;
  padding: 10px 12px;
  border: 0;
  background: transparent;
  color: var(--text-1);
  font: 400 13px/1.4 var(--font-text);
  text-align: left;
  cursor: pointer;
}

.ch-row b {
  color: var(--text-0);
  font: 700 14.5px/1.35 var(--font-text);
  overflow-wrap: anywhere;
}

.ch-row span,
.ch-here-line {
  overflow: hidden;
  color: var(--text-muted);
  font-size: 12px;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.ch-rows .ui-btn {
  align-self: center;
  margin-right: 8px;
}

.ch-back {
  margin-bottom: 8px;
}

.ch-head {
  margin-bottom: 12px;
}

.ch-marks,
.ch-people {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 8px 0;
  padding: 0;
  list-style: none;
}

.ch-mark {
  max-width: 100%;
  padding: 2px 8px;
  border: 2px solid var(--ch-tone, var(--attention));
  border-radius: var(--r-2);
  background: var(--bg-1);
  color: var(--text-0);
  font: 600 12px/1.4 var(--font-text);
}

.ch-people li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  width: 100%;
  color: var(--text-0);
  font: 400 13px/1.4 var(--font-text);
}

.ch-people em {
  color: var(--text-muted);
  font-style: normal;
}

.ch-share {
  margin-top: 16px;
}

.ch-ask {
  margin-top: 12px;
  padding: 12px;
  border: 1px solid var(--danger);
  border-radius: var(--r-2);
  background: var(--bg-1);
}

.ch-ask p {
  margin: 0 0 8px;
  color: var(--text-0);
  font: 400 14px/1.45 var(--font-text);
}
</style>
