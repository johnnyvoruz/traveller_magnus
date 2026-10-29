<script setup lang="ts">
/**
 * The session board (streams/D.md DU1; UX backlog U1): the Campaign panel at the table. Not live, it
 * offers Start a session. Live: the clock large with the weekday and the time, the +1 hour / +1 day /
 * +1 week row (the view day moves; the campaign date does not), the party's place with who is aboard,
 * the dice, the current world's records and the markets nearby, and the session entry open beside for
 * typing with @ mentions. End the session writes the entry's played date and, when the clock moved,
 * asks whether to advance the campaign date to it. Every piece is one the app already had.
 */
import { computed, onMounted, ref, watch } from 'vue';
import type { CampaignAnchor, CampaignRecord } from '@voyage/shared';
import { saveEntry } from '../../campaign/journal.ts';
import { campaign, setCampaignDate } from '../../campaign/store.ts';
import { trackOf } from '../../campaign/track.ts';
import { publishViewDay, resetViewDay } from '../../campaign/view_day.ts';
import DiceButton from '../../dice/DiceButton.vue';
import Icon from '../../design/Icon.vue';
import AskModal from '../../shell/AskModal.vue';
import { showToast } from '../../shell/toast.ts';
import { saveParty, saveRecord } from '../actions.ts';
import { campaignAsk } from '../campaign_command.ts';
import EntryPage from '../journal/EntryPage.vue';
import { createSession } from '../journal/create.ts';
import MarketsNearby from '../MarketsNearby.vue';
import { EMPTY_PARTY, memberVessel, partyMembers, partyVessel, partyVessels, resolveAnchor, withAnchor } from '../party.ts';
import { campaignDays, partyWhere } from '../party_where.ts';
import { parseHexKey } from '../places.ts';
import RecordAvatar from '../RecordAvatar.vue';
import RecordsHere from '../RecordsHere.vue';
import { stardate } from '../stardate.ts';
import { dockShipAt } from '../track_actions.ts';
import WhereBlock from '../WhereBlock.vue';
import {
    beginLive,
    clockMoved,
    endAsk,
    endedWords,
    endLive,
    liveFor,
    playedDate,
    readLive,
    sessionLabel,
    setLiveDays,
    sinceWords,
    step,
    STEPS,
    timeWords,
    type StepKind,
} from './live.ts';

const props = defineProps<{
    /** Changes cannot be made just now (offline): no start, no end; the clock still moves. */
    readOnly: boolean;
}>();

const emit = defineEmits<{
    /** The map has to be seen (a pick, a locate): the panel gives way. */
    map: [];
    /** The session ended, or the entry was asked for: the journal opens on it. */
    journal: [id: string];
    /** A record's page. */
    open: [id: string];
}>();

const now = computed(() => liveFor(campaign.universeId));
/** The session entry, live and not deleted. A session whose entry has gone is over. */
const entry = computed(() => {
    const found = now.value ? campaign.journal[now.value.entryId] : null;
    return found && !found.deleted ? found : null;
});
const isLive = computed(() => now.value !== null && entry.value !== null);
const label = computed(() => (entry.value ? sessionLabel(entry.value) : 'Session'));
const since = computed(() => (now.value ? sinceWords(now.value.startedAt) : ''));

// ---- The clock -------------------------------------------------------------------------------

const campaignDay = computed(() => campaignDays(campaign.clock));
/** The board's clock: the session's own day count, or the campaign date until the first step. */
const days = computed(() => (now.value && now.value.days !== null ? now.value.days : campaignDay.value));
const said = computed(() => stardate(days.value));
const time = computed(() => timeWords(days.value));
const campaignSaid = computed(() => stardate(campaignDay.value));
const off = computed(() => clockMoved(days.value, campaignDay.value));

function move(kind: StepKind): void {
    const next = step(days.value, kind);
    setLiveDays(next);
    publishViewDay(next, campaign.clock ? campaign.clock.days : null);
}

/** Back to the campaign date: the clock and the map follow it again. */
function backToDate(): void {
    setLiveDays(null);
    resetViewDay();
}

// ---- The party -------------------------------------------------------------------------------

const party = computed(() => (campaign.settings ? campaign.settings.party : EMPTY_PARTY));
const vessel = computed(() => partyVessel(party.value, campaign.records));
const ships = computed(() => partyVessels(party.value, campaign.records));
const members = computed(() => partyMembers(party.value, campaign.records));
/** Where the party is at the board's clock (party_where.ts: the track, or the anchor). */
const where = computed(() => {
    void campaign.seq;
    return partyWhere(party.value, campaign.records, days.value);
});
const place = computed(() => resolveAnchor(where.value.anchor, campaign.records));
const hexKey = computed(() => (place.value ? place.value.hexKey : null));
const system = computed(() => (hexKey.value ? parseHexKey(hexKey.value) : null));
const systemName = computed(() => (place.value ? place.value.label : ''));
/** The world's records, as the dossier folds them (an absent boolean prop reads false there, so the fold is named): open to start. */
const hereOpen = ref(true);

function aboard(shipId: string): CampaignRecord[] {
    return members.value.filter((record) => memberVessel(party.value, record.id) === shipId);
}
const ashore = computed(() => members.value.filter((record) => !memberVessel(party.value, record.id)));

function names(list: readonly CampaignRecord[]): string {
    if (!list.length) return 'No one aboard';
    return list.map((record) => record.name).join(', ');
}

/** "Move the party" on the board docks at the board's clock, as the Party tab does at the campaign date. */
function moved(next: CampaignAnchor): void {
    if (!vessel.value) {
        saveParty(withAnchor(party.value, next));
        return;
    }
    if (trackOf(vessel.value)) dockShipAt(vessel.value.id, next, days.value);
    else saveRecord(vessel.value.id, { anchor: next });
}

// ---- Start and end ---------------------------------------------------------------------------

const ready = computed(() => campaign.status === 'ready' && campaign.role === 'owner' && campaign.universeId !== null);

function start(): void {
    if (props.readOnly || !ready.value || isLive.value || !campaign.universeId) return;
    const id = createSession();
    if (!id) return;
    beginLive(campaign.universeId, id, new Date().toISOString(), null);
}

const ask = ref<ReturnType<typeof endAsk> | null>(null);

function end(): void {
    if (props.readOnly || !entry.value) return;
    // The played date: today, in the referee's own calendar.
    saveEntry({ ...entry.value, realDate: playedDate(new Date()) });
    if (off.value) {
        ask.value = endAsk(days.value, campaignDay.value, label.value);
        return;
    }
    finish(false);
}

/** The session ends; the campaign date advances to the clock when the referee said so. */
function finish(advance: boolean): void {
    const was = entry.value;
    const words = label.value;
    const to = said.value.date;
    ask.value = null;
    if (advance) setCampaignDate(days.value);
    else resetViewDay();
    endLive();
    showToast(endedWords(words, advance, to));
    if (was) emit('journal', was.id);
}

onMounted(() => {
    readLive();
    // The clock the device remembers shows on the map again.
    const held = liveFor(campaign.universeId);
    if (held && held.days !== null) publishViewDay(held.days, campaign.clock ? campaign.clock.days : null);
});

/** The palette's "Start a session": carried out once the campaign is open. */
watch(() => [campaignAsk.session, ready.value] as const, ([asked, open]) => {
    if (!asked || !open) return;
    campaignAsk.session = false;
    if (!isLive.value) start();
}, { immediate: true });

/** The entry went (deleted elsewhere): the session is over on this device. */
watch(() => [now.value !== null, entry.value !== null, campaign.status] as const, ([held, exists, status]) => {
    if (held && !exists && status === 'ready') {
        endLive();
        resetViewDay();
    }
});
</script>

<template>
  <div class="sess" :data-live="isLive ? 'yes' : 'no'">
    <div v-if="!isLive" class="camp-first ui-ground sess-start" data-session-start>
      <span class="camp-glyph is-large" aria-hidden="true"><Icon name="play" :size="22" /></span>
      <h2>Start a session</h2>
      <p>The panel becomes the table's board: the clock, where the party is, the dice, and a new session entry open for your notes. The campaign date moves only when the session ends and you say so.</p>
      <div class="camp-first-starts">
        <button type="button" class="ui-btn is-primary" data-session-begin :disabled="readOnly || !ready" @click="start">
          <Icon name="play" :size="13" />Start a session
        </button>
      </div>
    </div>
    <template v-else>
      <div class="sess-bar">
        <span class="sess-live"><i aria-hidden="true"></i>Live</span>
        <h2 class="sess-name" data-session-name>{{ label }}</h2>
        <span class="sess-since">{{ since }}</span>
        <button type="button" class="ui-btn is-primary sess-end" data-session-end :disabled="readOnly" @click="end">End the session</button>
      </div>
      <div class="sess-split">
        <div class="sess-side">
          <section class="ui-frame sess-clock" data-session-clock aria-labelledby="sess-clock-h">
            <h3 id="sess-clock-h" class="ui-frame-label">Clock</h3>
            <p class="sess-date">
              <b data-session-date>{{ said.date }}</b>
              <span data-session-weekday>{{ said.weekday }} · {{ time }}</span>
            </p>
            <p v-if="off" class="sess-off" role="status">
              Campaign date {{ campaignSaid.date }}
              <button type="button" class="sess-link" data-session-back @click="backToDate">Back to it</button>
            </p>
            <div class="sess-steps" role="group" aria-label="Move the clock">
              <button v-for="item in STEPS" :key="item.kind" type="button" class="ui-btn" :data-session-step="item.kind" @click="move(item.kind)">{{ item.label }}</button>
            </div>
          </section>
          <section class="ui-frame sess-party" data-session-party aria-labelledby="sess-party-h">
            <h3 id="sess-party-h" class="ui-frame-label">Party</h3>
            <WhereBlock
              heading="Where are we"
              big
              :anchor="where.anchor"
              :underway="where.underway"
              locate-id="party"
              :read-only="readOnly"
              :none="vessel ? vessel.name + ' is nowhere in particular yet' : 'Nowhere in particular'"
              change-label="Move the party"
              @save="moved"
              @map="emit('map')"
            />
            <ul v-if="ships.length || ashore.length" class="sess-aboard" data-session-aboard>
              <li v-for="ship in ships" :key="ship.id">
                <RecordAvatar :record="ship" :universe-id="campaign.universeId" size="chip" />
                <span class="sess-aboard-text">
                  <button type="button" class="sess-link is-name" @click="emit('open', ship.id)">{{ ship.name }}</button>
                  <small>{{ names(aboard(ship.id)) }}</small>
                </span>
              </li>
              <li v-if="ashore.length" class="is-ashore">
                <span class="sess-aboard-text">
                  <b>Ashore</b>
                  <small>{{ names(ashore) }}</small>
                </span>
              </li>
            </ul>
          </section>
          <section class="ui-frame sess-dice" data-session-dice aria-labelledby="sess-dice-h">
            <h3 id="sess-dice-h" class="ui-frame-label">Dice</h3>
            <DiceButton />
          </section>
          <!-- The dossier's section has two roots (the records, then the journal here), so the wrapper carries the class. -->
          <div v-if="system" class="sess-here">
            <RecordsHere :slug="system.slug" :hex="system.hex" :system-name="systemName" :body-key="null" body-name="" :fold-open="hereOpen" @toggle="hereOpen = !hereOpen" />
          </div>
          <MarketsNearby :hex-key="hexKey" no-place="Under way, or nowhere yet: no world to measure from." />
        </div>
        <div class="sess-main">
          <EntryPage v-if="entry" :id="entry.id" beside :read-only="readOnly" @back="emit('journal', entry.id)" @map="emit('map')" />
        </div>
      </div>
      <AskModal
        v-if="ask"
        :title="ask.title"
        :text="ask.text"
        :confirm="ask.confirm"
        :cancel-label="ask.cancel"
        @confirm="finish(true)"
        @cancel="finish(false)"
      />
    </template>
  </div>
</template>

<style>
.sess {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-width: 0;
}

.sess-start {
  margin-top: 4px;
}

/* The bar: the live mark, the session's name, when it started, and End. */
.sess-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 14px;
  margin: 0 0 14px;
}

.sess-live {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: var(--signal);
  font: 700 12px/1.4 var(--font-display);
  letter-spacing: 0.24em;
  text-transform: uppercase;
}

.sess-live i {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--signal);
  box-shadow: 0 0 8px var(--signal-glow);
}

.sess-name {
  margin: 0;
  color: var(--text-0);
  font: 700 19px/1.3 var(--font-display);
  letter-spacing: 0.02em;
}

.sess-since {
  color: var(--text-muted);
  font-size: 13px;
}

.sess-end {
  margin-left: auto;
}

/* Full width: the board beside the entry, each the panel's whole height. */
.sess-split {
  display: grid;
  flex: 1 1 auto;
  grid-template-columns: minmax(340px, 440px) minmax(0, 1fr);
  gap: 0 22px;
}

.sess-side {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}

.sess-main {
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding-left: 22px;
  border-left: 1px solid var(--line-1);
}

.sess-main > .jn-entry {
  flex: 1 1 auto;
}

/* The clock: the date large in the display face, the weekday and the time under it. */
.sess-date {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0 0 10px;
}

.sess-date b {
  color: var(--text-0);
  font: 700 34px/1.1 var(--font-display);
  letter-spacing: 0.1em;
  font-variant-numeric: var(--tabular);
}

.sess-date span {
  color: var(--text-1);
  font: 500 15px/1.4 var(--font-text);
  font-variant-numeric: var(--tabular);
}

.sess-off {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 10px;
  margin: -4px 0 10px;
  color: var(--text-muted);
  font-size: 13px;
}

.sess-link {
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--signal);
  font: 500 13px/1.4 var(--font-text);
  cursor: pointer;
}

.sess-link:hover {
  color: var(--text-0);
}

.sess-link.is-name {
  color: var(--text-0);
  font-weight: 700;
  text-align: left;
}

.sess-link.is-name:hover {
  color: var(--signal);
}

.sess-steps {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.sess-steps .ui-btn {
  flex: 1 1 auto;
  min-height: 36px;
  font-variant-numeric: var(--tabular);
}

/* The party: the Where block as the Party tab has it, then each ship with who is aboard. */
.sess-party .where {
  margin-top: 0;
}

.sess-aboard {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 12px 0 0;
  padding: 0;
  list-style: none;
}

.sess-aboard li {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.sess-aboard-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.sess-aboard-text b {
  color: var(--text-0);
  font-weight: 700;
}

.sess-aboard-text small {
  color: var(--text-muted);
  font-size: 12.5px;
}

.sess-dice .dice-panel {
  width: 100%;
}

.sess-dice .dice-picks {
  flex-wrap: wrap;
}

.sess-dice .dice-recent {
  max-width: none;
}

/* The dossier's sections keep their own look; here they sit in the column's rhythm. */
.sess-here > .here {
  margin: 0;
}

.sess-here .ui-heading.ui-kicker {
  margin-top: 0;
}

/* Narrow (a column, a phone): one column, the entry under the board. */
@media (max-width: 899px) {
  .sess-split {
    grid-template-columns: minmax(0, 1fr);
  }

  .sess-main {
    margin-top: 14px;
    padding-top: 14px;
    padding-left: 0;
    border-top: 1px solid var(--line-1);
    border-left: 0;
  }
}
</style>
