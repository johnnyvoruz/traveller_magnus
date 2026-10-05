<script setup lang="ts">
/**
 * The Campaign panel (design §1 and §2). Signed out it says what signing in gives and offers
 * the one button. Signed in it opens the campaign the first time it is shown (never before:
 * the viewer does not wait on it) and says where that stands; the record list arrives with
 * the next step (K5b).
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { session } from '../account/session.ts';
import { campaign, openCampaign } from '../campaign/store.ts';
import { isOnline, observeSize, onOnlineChange } from '../platform/browser.ts';
import Panel from '../shell/Panel.vue';
import { readSpan, writeSpan, type PanelSpan } from '../shell/panel_state.ts';
import SignInCard from './SignInCard.vue';

const props = defineProps<{
    open: boolean;
    /** The truth version the map is showing: a new campaign is pinned to it. Empty until the chart has loaded. */
    truthVersion: string;
}>();

const emit = defineEmits<{
    close: [];
    width: [px: number];
}>();

const panel = ref<{ element: HTMLElement | null } | null>(null);
const span = ref<PanelSpan>(readSpan());
const online = ref(true);
let stopSize: (() => void) | null = null;
let stopOnline: (() => void) | null = null;
let sized: HTMLElement | null = null;
let opening = false;
/** openCampaign threw (a reply that did not parse): shown as the store's own error is. */
const failed = ref(false);

const signedIn = computed(() => session.user !== null);
/** The open campaign's own name, once the store has listed it. */
const campaignName = computed(() => {
    const found = campaign.universes.find((item) => item.id === campaign.universeId);
    return found ? found.name : '';
});
const count = computed(() => {
    let live = 0;
    for (const record of Object.values(campaign.records)) if (!record.deleted) live += 1;
    return live;
});

/** Opens the campaign once the panel is shown to a signed-in user and the chart's version is known. */
async function load(): Promise<void> {
    if (opening || !props.open || !signedIn.value || !props.truthVersion) return;
    if (campaign.status === 'ready' || campaign.status === 'loading') return;
    if (failed.value || campaign.status === 'error') return;
    await openNow();
}

async function openNow(): Promise<void> {
    opening = true;
    failed.value = false;
    try {
        await openCampaign({ fetch, truthVersion: props.truthVersion });
    } catch {
        failed.value = true;
    } finally {
        opening = false;
    }
}

/** What the panel shows: the store's status, or an error when the open itself threw. */
const status = computed(() => {
    if (!signedIn.value) return 'signed-out';
    if (failed.value) return 'error';
    return campaign.status === 'signed-out' ? 'loading' : campaign.status;
});

function retry(): void {
    if (opening || !props.truthVersion) return;
    void openNow();
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
  <div class="campaign-root">
    <Panel
      ref="panel"
      :open="open"
      title="Campaign"
      :meta="signedIn ? (campaignName ? campaignName + ' · private to you, on top of the released map' : 'Private to you, on top of the released map') : ''"
      chip=""
      :span="span"
      @close="$emit('close')"
      @span="chooseSpan"
    >
      <div class="camp" :data-span="span" :data-status="status">
        <SignInCard v-if="!signedIn" />
        <template v-else>
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
          <div v-else class="camp-empty">
            <p v-if="count === 0">No records yet.</p>
            <p v-else>{{ count }} {{ count === 1 ? 'record' : 'records' }} in this campaign.</p>
          </div>
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
  padding: 18px 16px;
  color: var(--text-1);
  font: 400 14px/1.5 var(--font-text);
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

.camp-empty {
  padding: 22px 16px;
  border: 1px dashed var(--line-2);
  border-radius: var(--r-3);
  color: var(--text-muted);
}

.camp-empty p {
  margin: 0;
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
