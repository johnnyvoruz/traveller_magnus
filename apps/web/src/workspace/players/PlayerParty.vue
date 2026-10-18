<script setup lang="ts">
/**
 * The Party tab as a player reads it (players_build_plan.md P6): read-only. "Where are we", where the
 * lead ship's track puts the party at the campaign date (or the party's own place), with Locate; then
 * "Your ship", the lead ship, which opens its record; then the party's people. Nothing can be changed.
 */
import { computed, ref } from 'vue';
import { campaign } from '../../campaign/store.ts';
import Icon from '../../design/Icon.vue';
import { locating, startLocate, stopLocate } from '../locate.ts';
import { EMPTY_PARTY, partyMembers, partyVessel, resolveAnchor } from '../party.ts';
import { campaignDays, partyWhere } from '../party_where.ts';
import { placeWords } from '../places.ts';
import RecordAvatar from '../RecordAvatar.vue';

const emit = defineEmits<{ open: [id: string]; map: [] }>();

const party = computed(() => (campaign.settings ? campaign.settings.party : EMPTY_PARTY));
const where = computed(() => {
    void campaign.seq;
    return partyWhere(party.value, campaign.records, campaignDays(campaign.clock));
});
const place = computed(() => resolveAnchor(where.value.anchor, campaign.records));
const words = computed(() => (place.value ? placeWords(place.value) : []));
const ship = computed(() => partyVessel(party.value, campaign.records));
const people = computed(() => partyMembers(party.value, campaign.records));
const locateBtn = ref<HTMLElement | null>(null);

function locate(): void {
    const at = place.value;
    if (!at) return;
    if (locating.recordId === 'party') {
        stopLocate();
        return;
    }
    emit('map');
    startLocate('party', at.hexKey, () => {
        const el = locateBtn.value;
        if (!el) return null;
        const box = el.getBoundingClientRect();
        return box.height > 0 ? box.top + box.height / 2 : null;
    });
}
</script>

<template>
  <section class="pparty" data-player-party>
    <section aria-labelledby="pparty-where">
      <h3 id="pparty-where" class="ui-heading ui-kicker">Where are we</h3>
      <p v-if="where.underway" class="pparty-place"><Icon name="shuttle-space" :size="14" />{{ where.underway.text }}</p>
      <p v-else-if="place" class="pparty-place"><Icon name="location-dot" :size="14" />{{ words[0] }} <small v-if="words[1]">{{ words[1] }}</small></p>
      <p v-else class="pparty-none">Nowhere in particular yet.</p>
      <button v-if="place" ref="locateBtn" type="button" class="ui-btn" :aria-pressed="locating.recordId === 'party' ? 'true' : 'false'" @click="locate">
        <Icon name="location-crosshairs" :size="13" />{{ locating.recordId === 'party' ? 'Locating' : 'Locate' }}
      </button>
    </section>

    <section aria-labelledby="pparty-ship">
      <h3 id="pparty-ship" class="ui-heading ui-kicker">Your ship</h3>
      <button v-if="ship" type="button" class="pparty-row" @click="emit('open', ship.id)">
        <RecordAvatar :record="ship" :universe-id="campaign.universeId" size="row" />
        <span>{{ ship.name }}</span>
      </button>
      <p v-else class="pparty-none">No ship yet.</p>
    </section>

    <section v-if="people.length" aria-labelledby="pparty-people">
      <h3 id="pparty-people" class="ui-heading ui-kicker">The party <span class="ui-count">{{ people.length }}</span></h3>
      <ul class="pparty-people">
        <li v-for="person in people" :key="person.id">
          <button type="button" class="pparty-row" @click="emit('open', person.id)">
            <RecordAvatar :record="person" :universe-id="campaign.universeId" size="chip" />
            <span>{{ person.name }}</span>
          </button>
        </li>
      </ul>
    </section>
  </section>
</template>

<style>
.pparty {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-width: 760px;
}

.pparty .ui-heading {
  margin: 16px 0 8px;
}

.pparty > section:first-child .ui-heading {
  margin-top: 0;
}

.pparty-place {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 8px;
  margin: 0 0 8px;
  color: var(--text-0);
  font: 700 20px/1.3 var(--font-text);
}

.pparty-place small {
  color: var(--text-muted);
  font: 400 13px/1.3 var(--font-text);
}

.pparty-none {
  margin: 0;
  color: var(--text-muted);
  font: 400 13px/1.4 var(--font-text);
}

.pparty-people {
  display: grid;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.pparty-row {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-height: 36px;
  padding: 4px 12px 4px 4px;
  border: 1px solid var(--line-2);
  border-radius: var(--r-3);
  background: var(--panel-raised);
  color: var(--text-0);
  font: 600 13.5px/1.2 var(--font-text);
  cursor: pointer;
}

.pparty-row:hover {
  border-color: var(--signal);
}

.pparty-row:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}

@media (max-width: 680px) {
  .pparty-row {
    min-height: 44px;
  }
}
</style>
