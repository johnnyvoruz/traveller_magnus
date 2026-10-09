<script setup lang="ts">
/**
 * The one panel (findings/panes_swap_design.md §2). Both panes stay mounted after
 * the first time each opens. Only this module imports them.
 */
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { addressPane, atPane, escapePane, focusTarget, hostsCampaign, type FocusTarget, type Pane } from './pane.ts';
import { frame, onFrame, setPaneEscape, type ViewFrame } from './frame.ts';
import { buildReady } from '../workspace/build/acts.ts';

const route = useRoute();
const router = useRouter();
const live = ref<ViewFrame | null>(null);
const stopFrame = onFrame(() => { live.value = frame(); });
live.value = frame();

const shown = computed(() => addressPane(route.path, route.query).pane);
/**
 * The dossier pane shows a hex, and in Build a sector or a subsector. With Build off a sector's
 * address has nothing for it to show, so it stays shut there, as it was before Build.
 */
const dossierOpen = computed(() => {
    if (shown.value.kind !== 'dossier') return false;
    const view = addressPane(route.path, route.query).view;
    return (view.kind !== 'sector' && view.kind !== 'subsector') || buildReady();
});
const campaignOpen = computed(() => hostsCampaign(shown.value));
const charactersOpen = computed(() => shown.value.kind === 'characters');
const campaignRecord = computed(() => (shown.value.kind === 'campaign' ? shown.value.record : null));
const campaignTab = computed((): 'records' | 'party' | 'journal' => {
    if (shown.value.kind === 'party') return 'party';
    if (shown.value.kind === 'journal') return 'journal';
    return 'records';
});
const journalEntry = computed(() => (shown.value.kind === 'journal' ? shown.value.entry : null));

const dossierLive = ref(false);
const campaignLive = ref(false);
const charactersLive = ref(false);
watch(shown, (pane) => {
    if (pane.kind === 'dossier') dossierLive.value = true;
    if (hostsCampaign(pane)) campaignLive.value = true;
    if (pane.kind === 'characters') charactersLive.value = true;
}, { immediate: true });

const DossierPanel = defineAsyncComponent(() => import('../dossier/DossierPanel.vue'));
const CampaignPanel = defineAsyncComponent(() => import('../workspace/CampaignPanel.vue'));
const CharactersPanel = defineAsyncComponent(() => import('../characters/screens/CharactersPanel.vue'));

const active = computed(() => live.value !== null && live.value.kind !== 'none');

function applyWidth(px: number): void {
    const root = document.querySelector('.app');
    if (root instanceof HTMLElement) {
        if (px > 0) root.style.setProperty('--panel-width', px + 'px');
        else root.style.removeProperty('--panel-width');
    }
    const view = live.value;
    if (view) view.setWidth(px);
}

function onDossierWidth(px: number): void {
    if (dossierOpen.value) applyWidth(px);
}

function onCampaignWidth(px: number): void {
    if (campaignOpen.value) applyWidth(px);
}

function onCharactersWidth(px: number): void {
    if (charactersOpen.value) applyWidth(px);
}

watch(shown, (pane) => {
    if (pane.kind === 'shut') applyWidth(0);
});

function closePane(): void {
    if (shown.value.kind === 'shut') return;
    void router.push(atPane(route.path, route.query, { kind: 'shut' }));
}

function retry(): void {
    const view = live.value;
    if (view) view.retry();
}

watch(live, (view) => {
    const root = document.querySelector('.app');
    if (!(root instanceof HTMLElement)) return;
    if (view && view.panelTop) root.style.setProperty('--panel-top', view.panelTop);
    else root.style.removeProperty('--panel-top');
}, { immediate: true });

/** A pane that is still arriving (its chunk, its campaign, its reveal) is asked again for this many frames. */
const FOCUS_FRAMES = 240;

/** A key pressed inside a pane goes to the view, as it did when the panes were the view's children. */
function onPaneKey(event: KeyboardEvent): void {
    const view = live.value;
    if (view && view.kind !== 'none') view.key(event);
}

function focusSoon(target: FocusTarget): void {
    const wanted = shown.value;
    const held = document.activeElement;
    let frames = 0;
    const once = (): boolean => {
        if (target === 'rail-campaign') {
            const view = live.value;
            if (view) view.focusCampaign();
            return true;
        }
        if (target === 'rail-system') {
            const view = live.value;
            if (view) view.focusSystem();
            return true;
        }
        if (target === 'record-title' || target === 'record-row' || target === 'leave') return true;
        let el: HTMLElement | null = null;
        if (target === 'dossier-heading') el = document.querySelector('.dossier-root .panel.is-open h1');
        else if (target === 'party-tab') el = document.querySelector('.campaign-root .panel.is-open .camp-tab[aria-selected="true"]');
        else if (shown.value.kind === 'characters') el = document.querySelector('.characters-root .panel.is-open .ch-search input, .characters-root .panel.is-open .ch-first .ui-btn');
        else el = document.querySelector('.campaign-root .panel.is-open .camp-search input, .campaign-root .panel.is-open .camp-first .ui-btn');
        if (!el) return false;
        if (target === 'dossier-heading') el.tabIndex = -1;
        el.focus();
        // A pane mid-reveal can refuse focus: it has landed only when the element holds it.
        return document.activeElement === el;
    };
    const again = (): void => {
        // The pane changed again, or the visitor has put focus somewhere: this move is over.
        // (Focus that fell to the body because its element went with the old pane is not a move.)
        const now = document.activeElement;
        if (shown.value !== wanted || (now !== held && now !== document.body)) return;
        frames += 1;
        if (!once() && frames < FOCUS_FRAMES) requestAnimationFrame(again);
    };
    void nextTick(again);
}

watch(shown, (next, prev) => {
    if (!prev) return;
    const target = focusTarget(prev as Pane, next);
    if (target === 'leave') return;
    focusSoon(target);
});

function onPaneEscape(): boolean {
    const view = live.value;
    if (!view || view.kind === 'none') return false;
    const step = escapePane(route.path, route.query);
    if (!step) return false;
    void router.push(step);
    return true;
}

onMounted(() => { setPaneEscape(onPaneEscape); });
onBeforeUnmount(() => {
    stopFrame();
    setPaneEscape(null);
});
</script>

<template>
  <div class="pane-host" @keydown="onPaneKey">
  <DossierPanel
    v-if="active && dossierLive && live && live.dossier"
    :orbit="live.dossier.orbit || undefined"
    :open="dossierOpen"
    :slug="live.dossier.slug"
    :hex="live.dossier.hex"
    :sector-name="live.dossier.sectorName"
    :subsector-name="live.dossier.subsectorName"
    :entry="live.dossier.entry"
    :tree="live.dossier.tree"
    :body-key="live.dossier.bodyKey"
    :error="live.dossier.error"
    :pending="live.dossier.pending"
    :missing="live.dossier.missing"
    :allegiances="live.dossier.allegiances"
    @close="closePane"
    @retry="retry"
    @width="onDossierWidth"
  />
  <CampaignPanel
    v-if="active && campaignLive && live"
    :open="campaignOpen"
    :truth-version="live.truthVersion"
    :record-id="campaignRecord"
    :tab="campaignTab"
    :entry-id="journalEntry"
    @close="closePane"
    @width="onCampaignWidth"
  />
  <CharactersPanel
    v-if="active && charactersLive && live"
    :open="charactersOpen"
    @close="closePane"
    @width="onCharactersWidth"
  />
  </div>
</template>

<style>
/* No box of its own: the panes are placed against .app, as before. */
.pane-host {
  display: contents;
}
</style>
