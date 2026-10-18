<script setup lang="ts">
/**
 * A record as a player reads it (players_build_plan.md P6): read-only, with "For players" as its body,
 * then what else the projection carries (findings F13: from P6 on, every string the projection holds
 * is on a player's screen, so the referee can check it with View as players). Where it is, with
 * Locate; its tags; its connections, each opening that record. No sheet: a sheet opens only through
 * the character's own access. Nothing here can be changed.
 */
import { computed, ref } from 'vue';
import { campaign } from '../../campaign/store.ts';
import Icon from '../../design/Icon.vue';
import { connectionsOf } from '../links.ts';
import { locating, startLocate, stopLocate } from '../locate.ts';
import { resolveAnchor } from '../party.ts';
import { placeNow } from '../place_now.ts';
import RecordAvatar from '../RecordAvatar.vue';
import { typeInfo } from '../records.ts';

const props = defineProps<{ id: string; beside: boolean }>();
const emit = defineEmits<{ back: []; open: [id: string]; map: [] }>();

const record = computed(() => {
    const row = campaign.records[props.id];
    return row && !row.deleted ? row : null;
});
const place = computed(() => (record.value ? resolveAnchor(record.value.anchor, campaign.records) : null));
const connections = computed(() => (record.value ? connectionsOf(record.value.id, campaign.records, campaign.links) : []));
const locateBtn = ref<HTMLElement | null>(null);

function locate(): void {
    const now = record.value;
    const at = place.value;
    if (!now || !at) return;
    if (locating.recordId === now.id) {
        stopLocate();
        return;
    }
    emit('map');
    startLocate(now.id, at.hexKey, () => {
        const el = locateBtn.value;
        if (!el) return null;
        const box = el.getBoundingClientRect();
        return box.height > 0 ? box.top + box.height / 2 : null;
    });
}
</script>

<template>
  <article v-if="record" class="prec" data-player-record>
    <button v-if="!beside" type="button" class="ui-btn prec-back" @click="emit('back')"><Icon name="arrow-left" :size="12" />Records</button>
    <header class="prec-head">
      <RecordAvatar :record="record" :universe-id="campaign.universeId" size="head" />
      <div class="prec-names">
        <h2 class="prec-name">{{ record.name }}</h2>
        <p class="prec-meta">{{ typeInfo(record.type).one }}<template v-if="record.kind"> · {{ record.kind }}</template> · {{ placeNow(record) }}</p>
      </div>
    </header>

    <section class="prec-part" aria-labelledby="prec-for">
      <h3 id="prec-for" class="ui-heading ui-kicker">For players</h3>
      <p v-if="record.playerNotes && record.playerNotes.trim()" class="prec-text">{{ record.playerNotes }}</p>
      <p v-else class="prec-none">Nothing written for players yet.</p>
    </section>

    <section v-if="place" class="prec-part" aria-labelledby="prec-where">
      <h3 id="prec-where" class="ui-heading ui-kicker">Where</h3>
      <p class="prec-where">
        <span><Icon name="location-dot" :size="13" />{{ placeNow(record) }}</span>
        <button ref="locateBtn" type="button" class="ui-btn" :aria-pressed="locating.recordId === record.id ? 'true' : 'false'" @click="locate">
          <Icon name="location-crosshairs" :size="13" />{{ locating.recordId === record.id ? 'Locating' : 'Locate' }}
        </button>
      </p>
    </section>

    <section v-if="record.summary.trim()" class="prec-part" aria-labelledby="prec-summary">
      <h3 id="prec-summary" class="ui-heading ui-kicker">Summary</h3>
      <p class="prec-text">{{ record.summary }}</p>
    </section>

    <section v-if="record.details.trim()" class="prec-part" aria-labelledby="prec-details">
      <h3 id="prec-details" class="ui-heading ui-kicker">Details</h3>
      <p class="prec-text">{{ record.details }}</p>
    </section>

    <section v-if="record.tags.length" class="prec-part" aria-labelledby="prec-tags">
      <h3 id="prec-tags" class="ui-heading ui-kicker">Tags</h3>
      <p class="prec-chips"><span v-for="tag in record.tags" :key="tag" class="ui-chip">{{ tag }}</span></p>
    </section>

    <section v-if="connections.length" class="prec-part" aria-labelledby="prec-links">
      <h3 id="prec-links" class="ui-heading ui-kicker">Connections <span class="ui-count">{{ connections.length }}</span></h3>
      <ul class="prec-links">
        <li v-for="item in connections" :key="item.link.id">
          <span class="prec-label">{{ item.label }}</span>
          <button type="button" class="prec-other" @click="emit('open', item.other.id)">
            <Icon :name="typeInfo(item.other.type).icon" :size="11" />{{ item.other.name }}
          </button>
          <span v-if="item.link.role" class="prec-role">{{ item.link.role }}</span>
        </li>
      </ul>
    </section>
  </article>
  <div v-else class="prec-gone">
    <p>This record is not here.</p>
    <button type="button" class="ui-btn" @click="emit('back')">Back to the records</button>
  </div>
</template>

<style>
.prec {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.prec-back {
  align-self: flex-start;
  margin-bottom: 8px;
}

.prec-head {
  display: flex;
  align-items: flex-start;
  gap: 14px;
}

.prec-names {
  flex: 1 1 auto;
  min-width: 0;
}

.prec-name {
  margin: 0;
  color: var(--text-0);
  font: 700 22px/1.25 var(--font-text);
  overflow-wrap: anywhere;
}

.prec-meta {
  margin: 2px 0 0;
  color: var(--text-muted);
  font: 400 12.5px/1.4 var(--font-text);
}

.prec-part > .ui-heading {
  margin: 16px 0 8px;
}

.prec-text {
  margin: 0;
  color: var(--text-1);
  font: 400 14px/1.55 var(--font-text);
  white-space: pre-line;
}

.prec-none {
  margin: 0;
  color: var(--text-muted);
  font: 400 13px/1.4 var(--font-text);
}

.prec-where {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  margin: 0;
  color: var(--text-0);
  font: 600 14px/1.4 var(--font-text);
}

.prec-where > span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.prec-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0;
}

.prec-links {
  display: grid;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.prec-links li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.prec-label {
  min-width: 96px;
  color: var(--text-muted);
  font: 600 11.5px/1.3 var(--font-text);
}

.prec-other {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 28px;
  padding: 0 10px;
  border: 1px solid var(--line-2);
  border-radius: var(--r-pill);
  background: transparent;
  color: var(--text-0);
  font: 600 12.5px/1 var(--font-text);
  cursor: pointer;
}

.prec-other:hover {
  border-color: var(--signal);
}

.prec-other:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}

.prec-role {
  color: var(--text-muted);
  font: 400 12px/1.3 var(--font-text);
}

.prec-gone {
  display: grid;
  justify-items: start;
  gap: 10px;
  color: var(--text-muted);
  font: 400 13px/1.5 var(--font-text);
}

@media (max-width: 680px) {
  .prec-other {
    min-height: 44px;
  }
}
</style>
