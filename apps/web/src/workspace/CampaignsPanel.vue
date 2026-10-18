<script setup lang="ts">
/**
 * The Campaigns panel (streams/D.md DU10; UX backlog U10: "a major cleanup of the account window").
 * `?panel=campaigns`: the referee's campaigns as cards. The open one says where the party is, the
 * campaign date and how many records it holds, and carries Show records, Rename, Export, Import and
 * Delete (one confirm), with its switches (public games, my name, the course, the living systems)
 * folded under Settings. Another campaign's card says when it last changed and opens it. New campaign
 * sits at the top. What the account menu did for campaigns is here now; the menu keeps the person.
 * Only the open campaign is loaded in the browser, so another card cannot say its party, date or
 * records without a server route (see d_stream.md DU10).
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { CAMPAIGN_LIMITS } from '@voyage/shared';
import { session } from '../account/session.ts';
import { importCampaign, parseExport } from '../campaign/import.ts';
import { campaign, createCampaign, deleteCampaign, renameCampaign, switchCampaign } from '../campaign/store.ts';
import Icon from '../design/Icon.vue';
import { observeSize, saveBlob } from '../platform/browser.ts';
import { apiFetch } from '../platform/http.ts';
import { addressPane, atPane } from '../shell/pane.ts';
import Panel from '../shell/Panel.vue';
import { onSpan, readSpan, writeSpan, type PanelSpan } from '../shell/panel_state.ts';
import { showToast } from '../shell/toast.ts';
import { forgetDeleted } from './actions.ts';
import { CAMPAIGN_CAP, canCreate, cleanCampaignName, deleteWords, freshName, sortCampaigns } from './campaigns.ts';
import LivingSettings from './LivingSettings.vue';
import PlayingIn from './players/PlayingIn.vue';
import { stopLocate } from './locate.ts';
import { dateWords } from './market/storefront.ts';
import { retryCampaign } from './opening.ts';
import { partyWords, resolveAnchor } from './party.ts';
import { campaignDays, partyMarker, partyWhere } from './party_where.ts';
import { placeWords } from './places.ts';
import { COURSE_LABEL, COURSE_LATER, setShowCourse, showCourseOf } from './public_course.ts';
import { partyOnChart, PUBLIC_GAMES_LABEL, PUBLIC_GAMES_NO_PLACE, PUBLIC_GAMES_SAY, publicGamesOf, publicGamesToast, setPublicGames, setShowReferee, showRefereeOf } from './public_games.ts';
import { liveRecords } from './records.ts';
import SignInCard from './SignInCard.vue';
import { stardate } from './stardate.ts';

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: []; width: [px: number] }>();

const route = useRoute();
const router = useRouter();
const panel = ref<{ element: HTMLElement | null } | null>(null);
const span = ref<PanelSpan>(readSpan());
let stopSpan: (() => void) | null = null;
let stopSize: (() => void) | null = null;
let sized: HTMLElement | null = null;

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

// ---- The campaigns ---------------------------------------------------------------

/** What a card shows in place of its actions: a name for a new campaign, a new name, or the delete's question. */
const mode = ref<'' | 'new' | 'rename' | 'delete'>('');
const draft = ref('');
const busy = ref(false);
const trouble = ref('');

const signedIn = computed(() => session.user !== null);
/** The open campaign first (its card carries the actions), then the rest as the menu sorted them. */
const campaigns = computed(() => {
    const sorted = sortCampaigns(campaign.universes);
    return [...sorted.filter((item) => item.id === campaign.universeId), ...sorted.filter((item) => item.id !== campaign.universeId)];
});
const openOne = computed(() => campaign.universes.find((item) => item.id === campaign.universeId) ?? null);
const ready = computed(() => campaign.status === 'ready' || campaign.status === 'error');
const full = computed(() => !canCreate(campaign.universes.length));
const recordCount = computed(() => liveRecords(campaign.records).length);
/** Import takes an open campaign with no records and no links (campaign/import.ts says so too). */
const emptyCampaign = computed(() => Object.keys(campaign.records).length === 0 && Object.keys(campaign.links).length === 0);
const fileEl = ref<HTMLInputElement | null>(null);
const question = computed(() => (openOne.value ? deleteWords(openOne.value.name, recordCount.value) : ''));

/** The open campaign, said on its card: who the party is, where, the date, the records. */
const openFacts = computed(() => {
    void campaign.seq;
    const facts: string[] = [];
    const settings = campaign.settings;
    if (settings && campaign.status === 'ready') {
        const who = partyWords(settings.party, campaign.records);
        if (who) facts.push(who);
        const where = partyWhere(settings.party, campaign.records, campaignDays(campaign.clock));
        if (where.underway && where.underway.text) facts.push(where.underway.text);
        else {
            const place = resolveAnchor(where.anchor, campaign.records);
            if (place) facts.push(placeWords(place).join(' · '));
        }
    }
    facts.push(campaign.clock ? stardate(campaign.clock.days).date : 'No campaign date');
    facts.push(recordCount.value + (recordCount.value === 1 ? ' record' : ' records'));
    return facts;
});

/** Focus the first of these selectors that finds something (a selector list would take page order instead). */
function focusIn(...selectors: string[]): void {
    void nextTick(() => {
        const root = panelElement();
        for (const selector of selectors) {
            const el = root ? root.querySelector<HTMLElement>(selector) : null;
            if (el) {
                el.focus();
                return;
            }
        }
    });
}

function begin(next: 'new' | 'rename' | 'delete'): void {
    trouble.value = '';
    draft.value = next === 'new' ? freshName(campaign.universes.map((item) => item.name)) : next === 'rename' && openOne.value ? openOne.value.name : '';
    mode.value = next;
    focusIn('.cps-form input, .cps-form .is-primary');
}

function back(): void {
    mode.value = '';
    trouble.value = '';
}

/** Another campaign is open now: what belonged to the last one is let go. */
function changed(): void {
    forgetDeleted();
    stopLocate();
}

/** The open campaign's records, in the Campaign panel. */
function showRecords(): void {
    void router.push(atPane(route.path, route.query, { kind: 'campaign', record: null }));
}

async function run(work: () => Promise<void>, then: () => void): Promise<void> {
    if (busy.value) return;
    busy.value = true;
    trouble.value = '';
    try {
        await work();
        if (campaign.status === 'error') {
            // The store marks the whole campaign in error when a list call fails; the open one is read back so the panel stands.
            trouble.value = 'That could not be done. Try again.';
            void retryCampaign();
            return;
        }
        then();
    } catch {
        trouble.value = 'That could not be done. Try again.';
    } finally {
        busy.value = false;
    }
}

/** Open another campaign; its records follow. */
function pick(id: string): void {
    if (id === campaign.universeId) {
        showRecords();
        return;
    }
    void run(() => switchCampaign(id), () => {
        changed();
        showRecords();
    });
}

function create(): void {
    const name = cleanCampaignName(draft.value);
    if (!name || full.value) return;
    void run(async () => { await createCampaign(name); }, () => {
        changed();
        mode.value = '';
        showRecords();
    });
}

function rename(): void {
    const name = cleanCampaignName(draft.value);
    const target = openOne.value;
    if (!name || !target) return;
    if (name === target.name) {
        back();
        return;
    }
    void run(() => renameCampaign(target.id, name), back);
}

function remove(): void {
    const target = openOne.value;
    if (!target) return;
    void run(() => deleteCampaign(target.id), () => {
        changed();
        mode.value = '';
        showToast('Deleted ' + target.name + '.');
    });
}

/** Public games for the open campaign: on, off, or null when the server has no such setting (then no switch). */
const publicOn = computed(() => publicGamesOf(openOne.value));
/** The name on public cards. Null hides the switch: public is off, or the server has no such field. */
const showName = computed(() => showRefereeOf(openOne.value));
/** The course switch: null hides it (public is off); not available on a server before 0020. */
const showCourse = computed(() => showCourseOf(openOne.value, publicOn.value));
/** The server's sentence when the course switch was refused, said by the switch. */
const courseTrouble = ref('');
watch(() => (openOne.value ? openOne.value.id : ''), () => { courseTrouble.value = ''; mode.value = ''; });
/** On, and the party has no place on the chart: nothing is shown to anyone yet, and the card says what to do. */
const publicNowhere = computed(() => {
    if (publicOn.value !== true || campaign.status !== 'ready' || !campaign.settings) return false;
    const mark = partyMarker(campaign.settings.party, campaign.records, campaignDays(campaign.clock));
    return !partyOnChart(mark ? mark.hexKey : null);
});

/** The switch: the server's answer is what is shown; a refusal is said in its sentence, and the switch stays as it was. */
async function togglePublic(): Promise<void> {
    const target = openOne.value;
    const now = publicOn.value;
    if (!target || now === null || busy.value) return;
    busy.value = true;
    trouble.value = '';
    try {
        const done = await setPublicGames(target.id, !now);
        if (!done.ok) trouble.value = done.message;
        else showToast(publicGamesToast(done.public, target.name));
    } finally {
        busy.value = false;
        focusIn('[data-command="public-games"]');
    }
}

/** The name switch. A refusal is said in the server's sentence, and the switch stays as it was. */
async function toggleShowName(): Promise<void> {
    const target = openOne.value;
    const now = showName.value;
    if (!target || now === null || busy.value) return;
    busy.value = true;
    trouble.value = '';
    try {
        const done = await setShowReferee(target.id, !now);
        if (!done.ok) trouble.value = done.message;
        else showToast(done.showReferee ? 'Your name is on this game’s public cards.' : 'Your name is not on this game’s public cards.');
    } finally {
        busy.value = false;
        focusIn('[data-command="show-referee"]');
    }
}

/** The course switch. A refusal is said in the server's sentence by the switch, and the switch stays as it was. */
async function toggleShowCourse(): Promise<void> {
    const target = openOne.value;
    const now = showCourse.value;
    if (!target || !now || !now.available || busy.value) return;
    busy.value = true;
    courseTrouble.value = '';
    try {
        const done = await setShowCourse(target.id, !now.on);
        if (!done.ok) courseTrouble.value = done.message;
        else showToast(done.showCourse ? 'This game’s public cards show where its ships are going.' : 'This game’s public cards no longer show where its ships are going.');
    } finally {
        busy.value = false;
        focusIn('[data-command="show-course"]');
    }
}

/** The campaign's file, from the server, saved as it names it. */
function exportCampaign(): void {
    const target = openOne.value;
    if (!target) return;
    void run(async () => {
        const res = await apiFetch(fetch, '/api/universes/' + encodeURIComponent(target.id) + '/campaign/export');
        if (!res.ok) throw new Error('export ' + res.status);
        const found = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') || '');
        saveBlob(await res.blob(), found ? found[1] : target.name + '.campaign.json');
    }, () => {
        showToast('Exported ' + target.name + '.');
    });
}

function pickImport(): void {
    if (busy.value || !openOne.value) return;
    trouble.value = '';
    if (fileEl.value) fileEl.value.click();
}

/** A file chosen for Import: parsed and brought in. A file that does not parse is said in one sentence. */
async function onImportFile(event: Event): Promise<void> {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    const file = input.files && input.files[0];
    input.value = '';
    const target = openOne.value;
    if (!file || !target || busy.value) return;
    busy.value = true;
    trouble.value = '';
    try {
        const parsed = parseExport(await file.text());
        if (!parsed.ok) {
            trouble.value = 'This file is not a campaign export.';
            return;
        }
        const result = await importCampaign(parsed.document, target.id);
        if (!result.ok) {
            trouble.value = result.message;
            return;
        }
        showToast('Imported ' + result.landed + (result.landed === 1 ? ' row' : ' rows') + ' into ' + target.name + '.');
    } catch {
        trouble.value = 'That file could not be read.';
    } finally {
        busy.value = false;
    }
}

function onFormKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        back();
        return;
    }
    if (event.key === 'Enter' && mode.value !== 'delete') {
        event.preventDefault();
        event.stopPropagation();
        if (mode.value === 'new') create();
        else rename();
    }
}

watch(() => props.open, (open) => {
    if (open) span.value = readSpan();
    mode.value = '';
    trouble.value = '';
    void nextTick(() => { bindSize(); publish(); });
    // Opened, focus lands on the open campaign's card, else the first.
    if (open) focusIn('.cps-card.is-open .cps-name', '.cps-card .cps-name');
});

onMounted(() => {
    stopSpan = onSpan(() => { span.value = readSpan(); });
    bindSize();
    void nextTick(publish);
    const pane = addressPane(route.path, route.query).pane;
    if (props.open && pane.kind === 'campaigns') focusIn('.cps-card.is-open .cps-name', '.cps-card .cps-name');
});

onBeforeUnmount(() => {
    if (stopSpan) stopSpan();
    if (stopSize) stopSize();
});
</script>

<template>
  <div class="campaigns-root">
    <Panel ref="panel" :open="open" title="Campaigns" meta="" chip="" :span="span" @close="$emit('close')" @span="chooseSpan">
      <template #glyph><Icon name="book-sparkles" :size="16" /></template>
      <div class="cps-pad">
        <SignInCard v-if="!signedIn" />
        <template v-else>
          <div class="cps-tools">
            <p class="cps-count">{{ campaigns.length }} of {{ CAMPAIGN_CAP }} campaigns</p>
            <button v-if="mode !== 'new'" type="button" class="ui-btn is-primary" data-campaign-new :disabled="busy || full || !ready" :title="full ? 'Ten campaigns is the most an account holds' : 'Make another campaign'" @click="begin('new')">
              <Icon name="plus" :size="13" />New campaign
            </button>
          </div>
          <div v-if="mode === 'new'" class="cps-form" role="group" aria-label="New campaign" @keydown="onFormKey">
            <label class="cps-field"><span>Name the new campaign</span><input v-model="draft" type="text" class="camp-input" :maxlength="CAMPAIGN_LIMITS.name" :disabled="busy"></label>
            <div class="cps-acts">
              <button type="button" class="ui-btn is-primary" :disabled="busy || !cleanCampaignName(draft)" @click="create"><Icon name="check" :size="12" />{{ busy ? 'Saving…' : 'Create' }}</button>
              <button type="button" class="ui-btn" :disabled="busy" @click="back">Cancel</button>
            </div>
          </div>
          <p v-if="trouble" class="cps-trouble" role="alert">{{ trouble }}</p>
          <p v-if="ready && !campaigns.length" class="cps-none">No campaigns yet. A campaign holds your records, the party and the journal.</p>
          <ul class="cps-list">
            <li v-for="item in campaigns" :key="item.id">
              <article class="cps-card ui-frame" :class="{ 'is-open': item.id === campaign.universeId }" :aria-labelledby="'cps-h-' + item.id" :data-campaign="item.id">
                <div class="cps-head">
                  <h3 :id="'cps-h-' + item.id" class="cps-name" tabindex="-1">{{ item.name }}</h3>
                  <span v-if="item.id === campaign.universeId" class="ui-chip cps-open">Open</span>
                  <span v-if="item.publicGames" class="ui-chip cps-public">Public</span>
                </div>
                <p v-if="item.id === campaign.universeId" class="cps-facts" data-campaign-facts>{{ openFacts.join(' · ') }}</p>
                <p v-else class="cps-facts">Changed <span class="ui-date">{{ dateWords(item.updatedAt) }}</span></p>

                <template v-if="item.id !== campaign.universeId">
                  <div class="cps-acts">
                    <button type="button" class="ui-btn" :disabled="busy" data-campaign-open @click="pick(item.id)"><Icon name="book-sparkles" :size="13" />Open</button>
                  </div>
                </template>
                <template v-else>
                  <div v-if="mode === 'delete'" class="cps-form" role="alertdialog" aria-labelledby="cps-delete-q" @keydown="onFormKey">
                    <p id="cps-delete-q" class="cps-q">{{ question }}</p>
                    <div class="cps-acts">
                      <button type="button" class="ui-btn is-primary is-danger" :disabled="busy" data-campaign-delete-go @click="remove"><Icon name="trash" :size="12" />{{ busy ? 'Deleting…' : 'Delete' }}</button>
                      <button type="button" class="ui-btn" :disabled="busy" @click="back">Keep it</button>
                    </div>
                  </div>
                  <div v-else-if="mode === 'rename'" class="cps-form" role="group" aria-label="Rename the campaign" @keydown="onFormKey">
                    <label class="cps-field"><span>A new name</span><input v-model="draft" type="text" class="camp-input" :maxlength="CAMPAIGN_LIMITS.name" :disabled="busy"></label>
                    <div class="cps-acts">
                      <button type="button" class="ui-btn is-primary" :disabled="busy || !cleanCampaignName(draft)" @click="rename"><Icon name="check" :size="12" />{{ busy ? 'Saving…' : 'Rename' }}</button>
                      <button type="button" class="ui-btn" :disabled="busy" @click="back">Cancel</button>
                    </div>
                  </div>
                  <div v-else class="cps-acts">
                    <button type="button" class="ui-btn is-primary" data-campaign-records @click="showRecords"><Icon name="book-sparkles" :size="13" />Show records</button>
                    <button type="button" class="ui-btn" :disabled="busy" data-campaign-rename @click="begin('rename')"><Icon name="pen-to-square" :size="13" />Rename</button>
                    <button type="button" class="ui-btn" :disabled="busy" data-campaign-export @click="exportCampaign"><Icon name="file-export" :size="13" />Export</button>
                    <button type="button" class="ui-btn account-import" :disabled="busy || !emptyCampaign" :title="emptyCampaign ? 'Bring a campaign file into this empty campaign' : 'Import takes an empty campaign: make a new one first'" @click="pickImport">
                      <Icon name="file-import" :size="13" />Import into {{ openOne?.name }}…
                    </button>
                    <button type="button" class="ui-btn" :disabled="busy" data-campaign-delete @click="begin('delete')"><Icon name="trash" :size="13" />Delete</button>
                  </div>
                  <p v-if="!emptyCampaign && mode === ''" class="cps-fine">Import takes an empty campaign: make a new one first.</p>

                  <details class="cps-back" data-campaign-settings>
                    <summary>Settings</summary>
                    <!-- Public games: only when the server has the setting. Off until the referee turns it on. -->
                    <button
                      v-if="openOne && publicOn !== null"
                      type="button"
                      role="switch"
                      class="account-public cps-switch"
                      data-command="public-games"
                      :aria-checked="publicOn ? 'true' : 'false'"
                      aria-describedby="account-public-say"
                      :disabled="busy"
                      @click="togglePublic"
                    >
                      <Icon name="eye" :size="15" /><span>{{ PUBLIC_GAMES_LABEL }}</span><em>{{ publicOn ? 'On' : 'Off' }}</em>
                    </button>
                    <p v-if="openOne && publicOn !== null" id="account-public-say" class="account-say">{{ PUBLIC_GAMES_SAY }}</p>
                    <p v-if="openOne && publicNowhere" class="account-say is-todo" role="status" data-public-nowhere>{{ PUBLIC_GAMES_NO_PLACE }}</p>
                    <button
                      v-if="openOne && showName !== null"
                      type="button"
                      role="switch"
                      class="account-public account-show-name cps-switch"
                      data-command="show-referee"
                      :aria-checked="showName ? 'true' : 'false'"
                      :disabled="busy"
                      @click="toggleShowName"
                    >
                      <Icon name="user" :size="15" /><span>Show my name on public cards</span><em>{{ showName ? 'On' : 'Off' }}</em>
                    </button>
                    <button
                      v-if="openOne && showCourse"
                      type="button"
                      role="switch"
                      class="account-public account-show-course cps-switch"
                      data-command="show-course"
                      :aria-checked="showCourse.on ? 'true' : 'false'"
                      :aria-describedby="!showCourse.available || courseTrouble ? 'account-course-say' : undefined"
                      :disabled="busy || !showCourse.available"
                      @click="toggleShowCourse"
                    >
                      <Icon name="route" :size="15" /><span>{{ COURSE_LABEL }}</span><em>{{ showCourse.on ? 'On' : 'Off' }}</em>
                    </button>
                    <p v-if="openOne && showCourse && courseTrouble" id="account-course-say" class="account-say is-todo" role="alert" data-course-trouble>{{ courseTrouble }}</p>
                    <p v-else-if="openOne && showCourse && !showCourse.available" id="account-course-say" class="account-say" data-course-later>{{ COURSE_LATER }}</p>
                    <!-- Systems that feel alive (LS3): this campaign's two switches. This device's quiet stays in the account menu. -->
                    <LivingSettings part="campaign" :can-change="!!openOne" :busy="busy" />
                  </details>
                </template>
              </article>
            </li>
          </ul>
          <!-- Campaigns this account plays in (P5). -->
          <PlayingIn />
          <input ref="fileEl" class="vplan-file" type="file" accept="application/json,.json" tabindex="-1" aria-hidden="true" @change="onImportFile">
        </template>
      </div>
    </Panel>
  </div>
</template>

<style>
.campaigns-root {
  display: contents;
}

/* The import's file input, hidden as the shipyard's is (VesselPlan.vue). */
.vplan-file {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

.cps-pad {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
}

.cps-tools,
.cps-acts,
.cps-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.cps-tools {
  justify-content: space-between;
}

.cps-count,
.cps-none,
.cps-fine {
  margin: 0;
  color: var(--text-muted);
  font: 400 12.5px/1.45 var(--font-text);
}

.cps-trouble {
  margin: 0;
  color: var(--attention);
  font: 400 13px/1.45 var(--font-text);
}

.cps-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.cps-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cps-card.is-open {
  border-color: var(--signal-dim);
}

.cps-name {
  margin: 0;
  color: var(--text-0);
  font: 700 16px/1.3 var(--font-text);
}

.cps-name:focus-visible {
  outline: 1px solid var(--signal);
  outline-offset: 2px;
}

.cps-facts {
  margin: 0;
  color: var(--text-1);
  font: 400 13px/1.45 var(--font-text);
}

.cps-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cps-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  color: var(--text-muted);
  font: 500 12px/1.3 var(--font-text);
}

.cps-q {
  margin: 0;
  color: var(--text-0);
}

/* The card's back: its switches, folded until asked for. */
.cps-back {
  border-top: 1px solid var(--line-soft);
  padding-top: 8px;
}

.cps-back > summary {
  color: var(--text-1);
  font: 600 13px/1.4 var(--font-text);
  cursor: pointer;
}

.cps-back .account-public,
.cps-back .living-switch {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  margin: 6px 0 0;
  padding: 8px 10px;
  border: 0;
  border-radius: var(--r-3);
  background: transparent;
  color: var(--text-0);
  font: 500 13.5px/1.35 var(--font-text);
  text-align: left;
  cursor: pointer;
}

.cps-back .account-public:hover,
.cps-back .living-switch:hover {
  background: var(--wash-faint);
}

.cps-back .account-public:disabled,
.cps-back .living-switch:disabled {
  opacity: 0.5;
  cursor: default;
}

.cps-back .account-public span,
.cps-back .living-switch span {
  flex: 1 1 auto;
}

.cps-back .account-public em,
.cps-back .living-switch em {
  color: var(--text-muted);
  font: 600 12px/1 var(--font-text);
  font-style: normal;
}

.cps-back [aria-checked='true'] em {
  color: var(--signal);
  font-weight: 700;
}

.cps-back .account-say {
  margin: 0 0 4px;
  padding: 0 10px 0 36px;
  color: var(--text-muted);
  font: 400 12px/1.45 var(--font-text);
}

.cps-back .account-say.is-todo {
  color: var(--attention);
}

@media (max-width: 599px) {
  .cps-acts .ui-btn,
  .cps-back .account-public,
  .cps-back .living-switch {
    min-height: 44px;
  }
}
</style>
