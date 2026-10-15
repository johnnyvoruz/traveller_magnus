<script setup lang="ts">
/**
 * The Party tab (design §5): "Where are we" first, then the ship, then who is aboard, then
 * members who are not. The party is the settings document's `party` (slice §0.6), written
 * as one change; the party's place is the ship's at the campaign date, from its track when it
 * has one (party_where.ts), or the party's own anchor when there is no ship.
 */
import { computed, nextTick, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { CAMPAIGN_LIMITS, type CampaignAnchor, type CampaignRecord } from '@voyage/shared';
import { lastError, pending } from '../campaign/commit.ts';
import { campaign } from '../campaign/store.ts';
import { trackOf } from '../campaign/track.ts';
import Icon from '../design/Icon.vue';
import { atPane } from '../shell/pane.ts';
import { saveParty, saveRecord } from './actions.ts';
import { connectionsOf } from './links.ts';
import { EMPTY_PARTY, memberVessel, partyMembers, partyVessel, partyVessels, resolveAnchor, withAboard, withAnchor, withLeadVessel, withMember, withoutMember, withVesselAdded, withVesselRemoved } from './party.ts';
import { campaignDays, partyWhere } from './party_where.ts';
import { placeWords } from './places.ts';
import RecordPicker from './RecordPicker.vue';
import RecordAvatar from './RecordAvatar.vue';
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
const ships = computed(() => partyVessels(party.value, campaign.records));
const members = computed(() => partyMembers(party.value, campaign.records));
const empty = computed(() => !ships.value.length && !members.value.length && !party.value.anchor);
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

type Row = { record: CampaignRecord; role: string; shipId: string };

/** Where the party stands, for a member who is aboard no ship. */
const standing = computed(() => {
    if (where.value.underway) return where.value.underway.text;
    const place = resolveAnchor(where.value.anchor, campaign.records);
    if (!place) return 'Nowhere in particular';
    return placeWords(place).join(' · ');
});

/** A member's row: their crew role on the lead ship, and which party ship they are aboard. */
const rows = computed((): Row[] => {
    void Object.keys(campaign.links).length;
    void campaign.seq;
    return members.value.map((record) => {
        const shipId = memberVessel(party.value, record.id) ?? '';
        let role = '';
        if (shipId) {
            const link = connectionsOf(record.id, campaign.records, campaign.links)
                .find((item) => item.other.id === shipId && (item.link.kind === 'crew' || item.link.kind === 'commands'));
            role = link ? (link.link.role || link.label) : '';
        }
        return { record, role, shipId };
    });
});

/** The ship whose removal is waiting for a yes. Null when nothing is waiting. */
const dropId = ref<string | null>(null);

function namesLeftAshore(id: string): string[] {
    return members.value.filter((record) => memberVessel(party.value, record.id) === id).map((record) => record.name);
}

function whoLeft(names: string[]): string {
    if (names.length === 1) return names[0];
    if (names.length === 2) return names[0] + ' and ' + names[1];
    return names.slice(0, -1).join(', ') + ', and ' + names[names.length - 1];
}

const dropNote = computed(() => {
    if (!dropId.value) return '';
    const names = namesLeftAshore(dropId.value);
    if (!names.length) return '';
    return whoLeft(names) + ' will be left aboard no ship.';
});

function open(record: CampaignRecord): void {
    void router.push(atPane(route.path, route.query, { kind: 'campaign', record: record.id }));
}

// ---- Choosing the ship and the people ---------------------------------------------

const choosing = ref<'' | 'ship' | 'people'>('');
const returnTo = ref<string>('');
const shipNote = ref('');

function choose(what: 'ship' | 'people', from: string): void {
    if (props.readOnly) return;
    shipNote.value = '';
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
    if (choosing.value === 'ship') {
        const added = withVesselAdded(party.value, record.id);
        if (!added.ok) {
            shipNote.value = added.message;
            return;
        }
        saveParty(added.party);
    } else if (choosing.value === 'people') saveParty(withMember(party.value, record.id));
    done();
}

/** At the ship cap the add shows the refusal and saves nothing. */
function addShip(from: string): void {
    if (props.readOnly) return;
    shipNote.value = '';
    dropId.value = null;
    if (party.value.vesselIds.length >= CAMPAIGN_LIMITS.partyShips) {
        const refused = withVesselAdded(party.value, 'cr_00000000-0000-4000-8000-000000000099');
        shipNote.value = refused.ok ? '' : refused.message;
        return;
    }
    choose('ship', from);
}

function makeLead(id: string): void {
    if (props.readOnly) return;
    saveParty(withLeadVessel(party.value, id));
}

/** A ship with people aboard waits until the referee confirms. A plain delete, with no undo. */
function askRemoveShip(id: string): void {
    if (props.readOnly) return;
    if (namesLeftAshore(id).length === 0) {
        dropId.value = null;
        saveParty(withVesselRemoved(party.value, id));
        return;
    }
    dropId.value = id;
}

function confirmRemoveShip(): void {
    if (props.readOnly || !dropId.value) return;
    const id = dropId.value;
    dropId.value = null;
    saveParty(withVesselRemoved(party.value, id));
}

function remove(record: CampaignRecord): void {
    if (props.readOnly) return;
    saveParty(withoutMember(party.value, record.id));
}

function setAboard(record: CampaignRecord, event: Event): void {
    if (props.readOnly) return;
    const value = (event.target as HTMLSelectElement).value;
    saveParty(withAboard(party.value, record.id, value ? value : null));
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
        <p v-if="shipNote" class="party-none-line" role="status">{{ shipNote }}</p>
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
        <div class="party-people-head">
          <h3 class="ui-heading">Ships <span class="ui-count">{{ ships.length }}</span></h3>
          <button type="button" class="ui-btn party-add-ship" :disabled="readOnly" @click="addShip('.party-add-ship')">
            <Icon name="plus" :size="12" />Add a ship
          </button>
        </div>
        <p v-if="shipNote" class="party-none-line" role="status">{{ shipNote }}</p>
        <p v-if="!ships.length" class="party-none-line">No ship. The party is wherever it was put.</p>
        <ul v-else class="party-rows">
          <li v-for="(ship, index) in ships" :key="ship.id">
            <RecordAvatar :record="ship" :universe-id="campaign.universeId" size="chip" />
            <button type="button" class="party-name" @click="open(ship)">{{ ship.name }}</button>
            <span v-if="index === 0" class="ui-chip party-lead">Lead</span>
            <button v-else type="button" class="ui-btn party-lead-set" :disabled="readOnly" @click="makeLead(ship.id)">Make lead</button>
            <button type="button" class="ui-btn is-icon party-remove" :disabled="readOnly" :aria-label="'Remove ' + ship.name" title="Remove this ship" @click="askRemoveShip(ship.id)">
              <Icon name="xmark" :size="12" />
            </button>
          </li>
        </ul>
        <p v-if="dropNote" class="party-drop" role="status">
          <span>{{ dropNote }}</span>
          <button type="button" class="ui-btn" :disabled="readOnly" @click="confirmRemoveShip">Remove</button>
          <button type="button" class="ui-btn" @click="dropId = null">Keep it</button>
        </p>
      </section>

      <section class="party-people">
        <div class="party-people-head">
          <h3 class="ui-heading">The party <span class="ui-count">{{ rows.length }}</span></h3>
          <button type="button" class="ui-btn party-add-people" :disabled="readOnly" @click="choose('people', '.party-add-people')">
            <Icon name="plus" :size="12" />Add someone
          </button>
        </div>
        <p v-if="!rows.length" class="party-none-line">Nobody yet.</p>
        <ul v-else class="party-rows">
          <li v-for="row in rows" :key="row.record.id">
            <RecordAvatar :record="row.record" :universe-id="campaign.universeId" size="chip" />
            <button type="button" class="party-name" @click="open(row.record)">{{ row.record.name }}</button>
            <span v-if="row.role" class="party-role">{{ row.role }}</span>
            <span v-if="!row.shipId" class="party-role">{{ standing }}</span>
            <label class="party-aboard">
              <span class="rec-sr">Aboard</span>
              <select :aria-label="'Aboard for ' + row.record.name" :value="row.shipId" :disabled="readOnly" @change="setAboard(row.record, $event)">
                <option value="">No ship</option>
                <option v-for="ship in ships" :key="ship.id" :value="ship.id">{{ ship.name }}</option>
              </select>
            </label>
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

.ui-btn.party-add-people,
.ui-btn.party-add-ship {
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

.party-lead {
  flex: 0 0 auto;
}

.ui-btn.party-lead-set {
  height: 28px;
  padding: 0 9px;
  font-size: 12.5px;
}

.party-aboard {
  flex: 0 1 180px;
  min-width: 0;
}

.party-aboard select {
  width: 100%;
  height: 28px;
  border: 1px solid var(--control-line);
  border-radius: var(--r-3);
  background: var(--panel);
  color: var(--text-0);
  font: 600 12.5px/1.2 var(--font-text);
}

.party-drop {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin: 8px 0 0;
  color: var(--text-1);
  font: 400 13px/1.45 var(--font-text);
}

@media (max-width: 599px) {
  .party {
    max-width: none;
  }

  .party-rows li {
    flex-wrap: wrap;
  }

  .party-aboard {
    flex: 1 1 100%;
  }
}
</style>
