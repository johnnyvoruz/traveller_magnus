<script setup lang="ts">
/**
 * The Campaign panel (design §1 to §3). Signed out it says what signing in gives and offers
 * the one button. Signed in it opens the campaign the first time it is shown (never before:
 * the viewer does not wait on it), then shows the record list, or one record, or at full
 * width the list with the record beside it. Each has its own address, so Back works.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { CampaignRecordType } from '@voyage/shared';
import { session } from '../account/session.ts';
import { campaign } from '../campaign/store.ts';
import { isOnline, observeSize, onOnlineChange } from '../platform/browser.ts';
import Icon from '../design/Icon.vue';
import Panel from '../shell/Panel.vue';
import { readSpan, writeSpan, type PanelSpan } from '../shell/panel_state.ts';
import { createRecord, justCreated } from './actions.ts';
import CampaignList from './CampaignList.vue';
import PartyPanel from './PartyPanel.vue';
import { partyWords } from './party.ts';
import { ensureCampaign, openFailed, retryCampaign } from './opening.ts';
import { typeInfo } from './records.ts';
import RecordPage from './RecordPage.vue';
import SignInCard from './SignInCard.vue';

const props = defineProps<{
    open: boolean;
    /** The truth version the map is showing: a new campaign is pinned to it. Empty until the chart has loaded. */
    truthVersion: string;
    /** The record the address names, or null for the list. */
    recordId: string | null;
    /** The tab the address names: the records, or the party. */
    tab: 'records' | 'party';
}>();

const emit = defineEmits<{
    close: [];
    width: [px: number];
}>();

const route = useRoute();
const router = useRouter();
const panel = ref<{ element: HTMLElement | null } | null>(null);
const list = ref<{ focusSearch: () => void } | null>(null);
const span = ref<PanelSpan>(readSpan());
const online = ref(true);
let stopSize: (() => void) | null = null;
let stopOnline: (() => void) | null = null;
let sized: HTMLElement | null = null;

const signedIn = computed(() => session.user !== null);
/** The open campaign's own name, once the store has listed it. */
const campaignName = computed(() => {
    const found = campaign.universes.find((item) => item.id === campaign.universeId);
    return found ? found.name : '';
});

/** What the panel shows: the store's status, or an error when the open itself threw. */
const status = computed(() => {
    if (!signedIn.value) return 'signed-out';
    if (openFailed.value) return 'error';
    return campaign.status === 'signed-out' ? 'loading' : campaign.status;
});

const shownRecord = computed(() => {
    const found = props.recordId ? campaign.records[props.recordId] : null;
    return found && !found.deleted ? found : null;
});
const title = computed(() => shownRecord.value && span.value !== 'full' ? shownRecord.value.name : 'Campaign');
/** The tabs' counts and words. */
const recordCount = computed(() => Object.values(campaign.records).filter((record) => !record.deleted).length);
const partyLine = computed(() => (campaign.settings ? partyWords(campaign.settings.party, campaign.records) : ''));

/** The records tab, or the party's: each is an address, so Back works. */
function showTab(tab: 'records' | 'party'): void {
    const path = tab === 'party' ? '/campaign/party' : '/campaign';
    if (route.path !== path) void router.push({ path, query: route.query });
}

function onTabKey(event: KeyboardEvent): void {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    event.stopPropagation();
    const next = props.tab === 'party' ? 'records' : 'party';
    focusTab = true;
    showTab(next);
}

/** The keyboard moved between the tabs: focus follows once the address has changed. */
let focusTab = false;
watch(() => props.tab, () => {
    if (!focusTab) return;
    focusTab = false;
    void nextTick(() => {
        const el = panelElement();
        const tab = el ? el.querySelector<HTMLElement>('.camp-tab[aria-selected="true"]') : null;
        if (tab) tab.focus();
    });
});
const eyebrow = computed(() => {
    if (!signedIn.value) return '';
    if (shownRecord.value && span.value !== 'full') return 'Campaign · ' + typeInfo(shownRecord.value.type).many;
    return campaignName.value;
});

/** Opens the campaign once the panel is shown to a signed-in user and the chart's version is known. */
async function load(): Promise<void> {
    if (!props.open || !signedIn.value) return;
    await ensureCampaign(props.truthVersion);
}

function retry(): void {
    void retryCampaign(props.truthVersion);
}

/** A pick or a locate needs the chart: at full width the panel steps down to a column (design J7). The choice is not kept. */
function showMap(): void {
    if (span.value !== 'full') return;
    span.value = 'column';
    void nextTick(publish);
}

/** The list, or a record: the map's camera in the address stays as it is. */
function go(id: string | null): void {
    const path = id ? '/campaign/r/' + encodeURIComponent(id) : '/campaign';
    if (route.path !== path) void router.push({ path, query: route.query });
}

function create(type: CampaignRecordType): void {
    if (!online.value) return;
    go(createRecord(type));
}

/** "/" goes to the list's search, unless a field is being typed in. */
function onKey(event: KeyboardEvent): void {
    if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target as HTMLElement | null;
    const tag = target ? target.tagName : '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (!list.value) return;
    event.preventDefault();
    event.stopPropagation();
    list.value.focusSearch();
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

watch(() => [props.open, signedIn.value, props.truthVersion], () => {
    // The width the panel was last given may have been chosen in the dossier since.
    if (props.open) span.value = readSpan();
    void nextTick(publish);
    void load();
});
watch(span, () => { void nextTick(() => { bindSize(); publish(); }); });

/**
 * Focus follows the view, so the keyboard is never left on something that has gone: into a
 * record at its name, and back in the list on the row that was open (or the search).
 */
watch(() => props.recordId, (now, was) => {
    if (!props.open) return;
    void nextTick(() => {
        const el = panelElement();
        if (!el) return;
        let target: HTMLElement | null = null;
        if (now) {
            // A record just made opens its own name field.
            if (justCreated.value === now) return;
            target = el.querySelector<HTMLElement>('.rec .edit.is-title .edit-view');
        } else {
            for (const row of el.querySelectorAll<HTMLElement>('.camp-row')) if (row.dataset.id === was) target = row;
            if (!target) target = el.querySelector<HTMLElement>('.camp-search input, .camp-first .ui-btn');
        }
        if (target) target.focus();
    });
});

onMounted(() => {
    online.value = isOnline();
    stopOnline = onOnlineChange((now) => { online.value = now; });
    bindSize();
    void nextTick(publish);
    void load();
});

onBeforeUnmount(() => {
    if (stopSize) stopSize();
    if (stopOnline) stopOnline();
    emit('width', 0);
});

defineExpose({ remeasure: publish });
</script>

<template>
  <div class="campaign-root" @keydown="onKey">
    <Panel
      ref="panel"
      :open="open"
      :title="title"
      :meta="signedIn && !eyebrow ? 'Private to you, on top of the released map' : ''"
      chip=""
      :span="span"
      @close="$emit('close')"
      @span="chooseSpan"
    >
      <template v-if="eyebrow" #eyebrow>{{ eyebrow }}</template>
      <div class="camp" :data-span="span" :data-status="status" :data-view="recordId ? 'record' : tab === 'party' ? 'party' : 'list'">
        <SignInCard v-if="!signedIn" />
        <template v-else>
          <div v-if="status === 'ready' && (!recordId || span === 'full')" class="camp-tabs" role="tablist" aria-label="Campaign">
            <button type="button" role="tab" class="camp-tab" :aria-selected="tab === 'records' ? 'true' : 'false'" :tabindex="tab === 'records' ? 0 : -1" @click="showTab('records')" @keydown="onTabKey">
              <Icon name="book-sparkles" :size="12" />Records <b>{{ recordCount }}</b>
            </button>
            <button type="button" role="tab" class="camp-tab" :aria-selected="tab === 'party' ? 'true' : 'false'" :tabindex="tab === 'party' ? 0 : -1" @click="showTab('party')" @keydown="onTabKey">
              <Icon name="shuttle-space" :size="12" />Party <small>{{ partyLine }}</small>
            </button>
          </div>
          <p v-if="!online" class="camp-strip" role="status">
            You are offline. This is what was loaded; changes wait until you are back.
          </p>
          <div v-if="status === 'error'" class="camp-strip is-error" role="alert">
            <span>Your campaign could not be loaded.</span>
            <button type="button" class="ui-btn" @click="retry">Try again</button>
          </div>
          <ul v-else-if="status !== 'ready'" class="camp-skeleton" aria-label="Loading your campaign" aria-busy="true">
            <li v-for="n in 4" :key="n"><i></i><span><i></i><i></i><i></i></span></li>
          </ul>
          <PartyPanel v-else-if="tab === 'party' && !recordId" :read-only="!online" @map="showMap" />
          <div v-else-if="span === 'full'" class="camp-split">
            <CampaignList ref="list" :selected="recordId" :read-only="!online" @open="go" @create="create" @map="showMap" />
            <div class="camp-detail">
              <RecordPage v-if="recordId" :id="recordId" beside :read-only="!online" @back="go(null)" @map="showMap" />
              <p v-else class="camp-hint">Choose a record to read it here.</p>
            </div>
          </div>
          <RecordPage v-else-if="recordId" :id="recordId" :beside="false" :read-only="!online" @back="go(null)" @map="showMap" />
          <CampaignList v-else ref="list" :selected="null" :read-only="!online" @open="go" @create="create" @map="showMap" />
        </template>
      </div>
    </Panel>
  </div>
</template>

<style>
.campaign-root {
  display: contents;
}

.camp {
  box-sizing: border-box;
  min-height: 100%;
  padding: 16px;
  color: var(--text-1);
  font: 400 14px/1.5 var(--font-text);
}

/* Two tabs under the header: the records and the party (design J3). */
.camp-tabs {
  display: flex;
  gap: 6px;
  margin: -4px 0 12px;
  border-bottom: 1px solid var(--line-1);
}

.camp-tab {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  margin: 0 0 -1px;
  padding: 6px 10px 8px;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--text-muted);
  font: 600 13px/1.3 var(--font-text);
  cursor: pointer;
}

.camp-tab b {
  color: var(--text-muted);
  font: 700 11.5px/1 var(--font-code);
}

.camp-tab small {
  max-width: 180px;
  overflow: hidden;
  color: var(--text-muted);
  font: 400 12px/1.3 var(--font-text);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.camp-tab:hover {
  color: var(--text-1);
}

.camp-tab[aria-selected="true"] {
  border-bottom-color: var(--signal);
  color: var(--signal);
}

.camp-tab[aria-selected="true"] b {
  color: var(--signal);
}

/* A record's page fills the panel, so its foot sits at the bottom. */
.camp[data-view="record"]:not([data-span="full"]) {
  display: flex;
  flex-direction: column;
}

.camp[data-view="record"]:not([data-span="full"]) > .rec {
  flex: 1 1 auto;
}

/* Full width: the list, and the record chosen beside it, each the panel's whole height. */
.camp[data-span="full"] {
  display: flex;
  flex-direction: column;
}

.camp-split {
  display: grid;
  flex: 1 1 auto;
  grid-template-columns: minmax(360px, 460px) minmax(0, 1fr);
  gap: 0 22px;
}

.camp-detail {
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding-left: 22px;
  border-left: 1px solid var(--line-1);
}

.camp-detail > .rec {
  flex: 1 1 auto;
}

.camp-hint {
  margin: 0;
  padding: 22px 0;
  color: var(--text-muted);
}

/* One strip above the content: amber for a state to know about, red for a failure. */
.camp-strip {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 0 12px;
  padding: 8px 10px;
  border: 1px solid var(--line-2);
  border-left: 3px solid var(--attention);
  border-radius: var(--r-2);
  background: var(--panel-raised);
  color: var(--text-1);
  font-size: 13px;
}

.camp-strip.is-error {
  border-left-color: var(--danger);
}

.camp-strip span {
  flex: 1 1 auto;
}

/* Rows of the list's own height while the campaign loads. */
.camp-skeleton {
  margin: 0;
  padding: 0;
  list-style: none;
  border: 1px solid var(--line-1);
  border-radius: var(--r-3);
  overflow: hidden;
  background: var(--panel-raised);
}

.camp-skeleton li {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 66px;
  padding: 0 12px;
  border-bottom: 1px solid var(--line-soft);
}

.camp-skeleton li:last-child {
  border-bottom: 0;
}

.camp-skeleton li > i {
  flex: 0 0 38px;
  height: 38px;
  border-radius: var(--r-2);
  background: var(--surface-1);
}

.camp-skeleton span {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.camp-skeleton span i {
  height: 9px;
  border-radius: var(--r-1);
  background: linear-gradient(90deg, var(--surface-1), var(--surface-2), var(--surface-1));
  background-size: 200% 100%;
  animation: camp-shimmer var(--t-scan) linear infinite;
}

.camp-skeleton span i:nth-child(1) { width: 46%; }
.camp-skeleton span i:nth-child(2) { width: 88%; }
.camp-skeleton span i:nth-child(3) { width: 34%; }

@keyframes camp-shimmer {
  from { background-position: 100% 0; }
  to { background-position: -100% 0; }
}

@media (prefers-reduced-motion: reduce) {
  .camp-skeleton span i {
    animation: none;
  }
}
</style>
