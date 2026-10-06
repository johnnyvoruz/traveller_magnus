<script setup lang="ts">
/**
 * The Party tab (design §5): "Where are we" first, then the ship, then who is aboard, then
 * members who are not. The party is the settings document's `party` (slice §0.6), written
 * as one change; the party's place is the ship's at the campaign date, from its track when it
 * has one (party_where.ts), or the party's own anchor when there is no ship.
 */
import { computed, nextTick, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { CampaignAnchor, CampaignRecord } from '@voyage/shared';
import { lastError, pending } from '../campaign/commit.ts';
import { campaign } from '../campaign/store.ts';
import { trackOf } from '../campaign/track.ts';
import Icon from '../design/Icon.vue';
import { saveParty, saveRecord } from './actions.ts';
import { connectionsOf } from './links.ts';
import { EMPTY_PARTY, isAboard, partyMembers, partyVessel, withAnchor, withMember, withoutMember, withVessel } from './party.ts';
import { campaignDays, partyWhere } from './party_where.ts';
import { placeWords, resolvePlace, liveById } from './places.ts';
import RecordPicker from './RecordPicker.vue';
import { typeInfo } from './records.ts';
import { dockShipAt } from './track_actions.ts';
import WhereBlock from './WhereBlock.vue';

const props = defineProps<{
    /** Changes cannot be made just now (offline). */
    readOnly: boolean;
}>();

const emit = defineEmits<{ map: [] }>();

const route = useRoute();
const router = useRouter();
const rootEl = ref<HTMLElement | null>(null);

const party = computed(() => (campaign.settings ? campaign.settings.party : EMPTY_PARTY));
const vessel = computed(() => partyVessel(party.value, campaign.records));
const members = computed(() => partyMembers(party.value, campaign.records));
const empty = computed(() => !vessel.value && !members.value.length && !party.value.anchor);
const saveState = computed((): 'saving' | 'failed' | 'saved' => (lastError.value ? 'failed' : pending.value ? 'saving' : 'saved'));

/** "Where are we" at the campaign date: a place, or the ship's leg under way with the system it is in. */
const days = computed(() => campaignDays(campaign.clock));
const where = computed(() => {
    void campaign.seq;
    return partyWhere(party.value, campaign.records, days.value);
});

/**
 * "Move the party". A ship with a track is docked at the place at the campaign date (one
 * leg; the track may refuse, and says why); a ship without one has its anchor written; with
 * no ship the party's own anchor.
 */
function moved(next: CampaignAnchor): void {
    if (!vessel.value) {
        saveParty(withAnchor(party.value, next));
        return;
    }
    if (trackOf(vessel.value)) dockShipAt(vessel.value.id, next, days.value);
    else saveRecord(vessel.value.id, { anchor: next });
}

type Row = { record: CampaignRecord; role: string; aboard: boolean; where: string };

/** A member's row: the role from their crew or commands connection to the ship, and where they are when not aboard. */
const rows = computed((): Row[] => {
    const live = liveById(campaign.records);
    void Object.keys(campaign.links).length;
    void campaign.seq;
    return members.value.map((record) => {
        let role = '';
        if (vessel.value) {
            const link = connectionsOf(record.id, campaign.records, campaign.links)
                .find((item) => item.other.id === vessel.value!.id && (item.link.kind === 'crew' || item.link.kind === 'commands'));
            role = link ? (link.link.role || link.label) : '';
        }
        const aboard = isAboard(record, party.value);
        const own = resolvePlace(record.id, live);
        return { record, role, aboard, where: own ? placeWords(own).join(' · ') : 'nowhere in particular' };
    });
});
const aboardRows = computed(() => rows.value.filter((row) => row.aboard));
const ashoreRows = computed(() => rows.value.filter((row) => !row.aboard));

function open(record: CampaignRecord): void {
    void router.push({ path: '/campaign/r/' + encodeURIComponent(record.id), query: route.query });
}

// ---- Choosing the ship and the people ---------------------------------------------

const choosing = ref<'' | 'ship' | 'people'>('');
const returnTo = ref<string>('');

function choose(what: 'ship' | 'people', from: string): void {
    if (props.readOnly) return;
    returnTo.value = from;
    choosing.value = what;
}

function done(): void {
    const back = returnTo.value;
    choosing.value = '';
    void nextTick(() => {
        const el = back && rootEl.value ? rootEl.value.querySelector<HTMLElement>(back) : null;
        if (el) el.focus();
    });
}

function picked(record: CampaignRecord): void {
    if (choosing.value === 'ship') saveParty(withVessel(party.value, record.id));
    else if (choosing.value === 'people') saveParty(withMember(party.value, record.id));
    done();
}

function noShip(): void {
    if (props.readOnly) return;
    saveParty(withVessel(party.value, null));
}

function remove(record: CampaignRecord): void {
    if (props.readOnly) return;
    saveParty(withoutMember(party.value, record.id));
}

/** Puts a member aboard the ship: their own anchor becomes the ship. */
function board(record: CampaignRecord): void {
    if (props.readOnly || !vessel.value) return;
    saveRecord(record.id, { anchor: { kind: 'record', id: vessel.value.id } });
}

function onKey(event: KeyboardEvent): void {
    if (choosing.value && event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        done();
    }
}

watch(() => campaign.universeId, () => { choosing.value = ''; });
</script>

<template>
  <section ref="rootEl" class="party" :data-empty="empty ? 'true' : 'false'" @keydown="onKey">
    <div v-if="empty && !choosing" class="camp-first party-first">
      <span class="camp-glyph is-large" aria-hidden="true"><Icon name="shuttle-space" :size="22" /></span>
      <h2>No party yet</h2>
      <p>Choose the ship and who is aboard. Where the ship is, the party is: the map marks it.</p>
      <div class="camp-first-starts">
        <button type="button" class="ui-btn is-primary party-add-ship" :disabled="readOnly" @click="choose('ship', '.party-add-ship')">
          <Icon name="shuttle-space" :size="13" />Choose the ship
        </button>
        <button type="button" class="ui-btn party-add-people" :disabled="readOnly" @click="choose('people', '.party-add-people')">
          <Icon name="user" :size="13" />Add people
        </button>
      </div>
    </div>

    <div v-if="choosing" class="where-edit party-pick">
      <div class="where-step">
        <h4>{{ choosing === 'ship' ? 'The ship' : 'Who is in the party' }}</h4>
        <RecordPicker
          exclude=""
          :types="[choosing === 'ship' ? 'vessel' : 'person']"
          :placeholder="choosing === 'ship' ? 'Search your vessels' : 'Search your people'"
          :none="choosing === 'ship' ? 'No vessels yet. Add the ship as a record first.' : 'No people yet. Add a person first.'"
          @pick="picked"
          @cancel="done"
        />
      </div>
      <div class="where-foot">
        <button type="button" class="ui-btn where-cancel" @click="done">Cancel</button>
      </div>
    </div>

    <template v-if="!empty">
      <header class="party-head">
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
        <p class="rec-save party-save" :class="'is-' + saveState" role="status">
          <template v-if="saveState === 'saving'">Saving…</template>
          <template v-else-if="saveState === 'failed'">Not saved</template>
          <template v-else><Icon name="check" :size="12" />Saved</template>
        </p>
      </header>

      <section class="party-ship">
        <h3 class="ui-heading">The ship</h3>
        <div v-if="vessel" class="party-card">
          <span class="camp-glyph" aria-hidden="true"><Icon name="shuttle-space" :size="16" /></span>
          <span class="party-card-text">
            <b>{{ vessel.name }}</b>
            <span v-if="vessel.summary" class="party-card-sum">{{ vessel.summary }}</span>
          </span>
          <button type="button" class="ui-btn party-open" @click="open(vessel)">Open</button>
          <button type="button" class="ui-btn party-another" :disabled="readOnly" title="Choose another ship" @click="choose('ship', '.party-another')">
            <Icon name="rotate-left" :size="12" />Another
          </button>
          <button type="button" class="ui-btn is-icon party-noship" :disabled="readOnly" aria-label="No ship" title="The party has no ship" @click="noShip">
            <Icon name="xmark" :size="12" />
          </button>
        </div>
        <div v-else class="party-none">
          <p>No ship. The party is wherever it was put.</p>
          <button type="button" class="ui-btn party-add-ship" :disabled="readOnly" @click="choose('ship', '.party-add-ship')">
            <Icon name="shuttle-space" :size="13" />Choose the ship
          </button>
        </div>
      </section>

      <section class="party-people">
        <div class="party-people-head">
          <h3 class="ui-heading">{{ vessel ? 'Aboard' : 'The party' }} <span class="ui-count">{{ aboardRows.length }}</span></h3>
          <button type="button" class="ui-btn party-add-people" :disabled="readOnly" @click="choose('people', '.party-add-people')">
            <Icon name="plus" :size="12" />Add someone
          </button>
        </div>
        <p v-if="!aboardRows.length" class="party-none-line">{{ vessel ? 'Nobody aboard.' : 'Nobody yet.' }}</p>
        <ul v-else class="party-rows">
          <li v-for="row in aboardRows" :key="row.record.id">
            <span class="camp-glyph is-small" aria-hidden="true"><Icon :name="typeInfo(row.record.type).icon" :size="13" /></span>
            <button type="button" class="party-name" @click="open(row.record)">{{ row.record.name }}</button>
            <span class="party-role">{{ row.role || (vessel ? 'aboard ' + vessel.name : '') }}</span>
            <button type="button" class="ui-btn is-icon party-remove" :disabled="readOnly" :aria-label="'Remove ' + row.record.name + ' from the party'" title="Remove from the party" @click="remove(row.record)">
              <Icon name="xmark" :size="12" />
            </button>
          </li>
        </ul>
      </section>

      <section v-if="ashoreRows.length" class="party-people">
        <h3 class="ui-heading">Not aboard <span class="ui-count">{{ ashoreRows.length }}</span></h3>
        <ul class="party-rows">
          <li v-for="row in ashoreRows" :key="row.record.id">
            <span class="camp-glyph is-small" aria-hidden="true"><Icon :name="typeInfo(row.record.type).icon" :size="13" /></span>
            <button type="button" class="party-name" @click="open(row.record)">{{ row.record.name }}</button>
            <span class="party-role">{{ row.where }}</span>
            <button type="button" class="ui-btn party-board" :disabled="readOnly" :title="'Put ' + row.record.name + ' aboard ' + (vessel ? vessel.name : '')" @click="board(row.record)">
              <Icon name="shuttle-space" :size="12" />Put aboard
            </button>
            <button type="button" class="ui-btn is-icon party-remove" :disabled="readOnly" :aria-label="'Remove ' + row.record.name + ' from the party'" title="Remove from the party" @click="remove(row.record)">
              <Icon name="xmark" :size="12" />
            </button>
          </li>
        </ul>
      </section>
    </template>
  </section>
</template>

<style>
.party {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-width: 760px;
}

.party-head {
  position: relative;
}

.party-head .where > .ui-heading:first-child {
  margin-top: 0;
}

.party-save {
  position: absolute;
  top: 0;
  right: 0;
  margin: 0;
}

.party-pick {
  margin-bottom: 12px;
}

/* The ship: one card. */
.party-card {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--line-1);
  border-radius: var(--r-3);
  background: var(--panel-raised);
}

.party-card-text {
  display: flex;
  flex: 1 1 160px;
  flex-direction: column;
  min-width: 0;
}

.party-card-text b {
  color: var(--text-0);
  font: 700 14.5px/1.35 var(--font-text);
}

.party-card-sum {
  overflow: hidden;
  color: var(--text-muted);
  font-size: 12.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.party-none {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
  padding: 14px 16px;
  border: 1px dashed var(--line-2);
  border-radius: var(--r-3);
}

.party-none p,
.party-none-line {
  margin: 0;
  color: var(--text-muted);
  font: 400 13px/1.5 var(--font-text);
}

.party-people-head {
  display: flex;
  align-items: center;
  gap: 10px;
}

.party-people-head .ui-heading {
  flex: 1 1 auto;
  gap: 8px;
}

.ui-btn.party-add-people {
  height: 28px;
  padding: 0 9px;
  font-size: 12.5px;
}

.party-people .party-people-head .ui-heading .ui-count,
.party-people > .ui-heading .ui-count {
  margin-left: 0;
}

.party-rows {
  margin: 0;
  padding: 0;
  list-style: none;
  border: 1px solid var(--line-1);
  border-radius: var(--r-3);
  overflow: hidden;
  background: var(--panel-raised);
}

.party-rows li {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 8px 6px 10px;
}

.party-rows li + li {
  border-top: 1px solid var(--line-soft);
}

.party-rows .camp-glyph.is-small {
  width: 28px;
  height: 28px;
}

.party-name {
  flex: 1 1 auto;
  min-width: 0;
  margin: 0;
  padding: 2px 0;
  border: 0;
  background: transparent;
  color: var(--text-0);
  font: 600 13.5px/1.4 var(--font-text);
  text-align: left;
  cursor: pointer;
}

.party-name:hover {
  color: var(--signal);
}

.party-role {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  color: var(--text-muted);
  font: 400 12px/1.4 var(--font-text);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ui-btn.party-board {
  height: 28px;
  padding: 0 9px;
  font-size: 12.5px;
}

.ui-btn.party-remove {
  width: 28px;
  height: 28px;
}
</style>
