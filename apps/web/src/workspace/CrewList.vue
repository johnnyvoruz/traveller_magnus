<script setup lang="ts">
/**
 * The Crew list on a vessel's page (DS2; findings/ship_crew_plan.md §3 (1); Johnny 131, 134, 135): the party's
 * characters aboard and what each does, under Passengers. The referee adds a party character with a role
 * (Captain preset for the first row, the roles already typed on the party's ships as suggestions), changes a
 * role in place, and removes a row. A character crews one ship at a time: adding one who crews another party
 * ship moves them, in one commit, with the toast saying so. The ship sheet's Crew box stays the sheet's.
 */
import { computed, reactive, ref } from 'vue';
import type { CampaignRecord, CrewRole, CrewRow } from '@voyage/shared';
import { commit } from '../campaign/commit.ts';
import { campaign } from '../campaign/store.ts';
import { showToast } from '../shell/toast.ts';
import { ALL_ON, NO_CREW, REFEREE_ALONE, SWITCHES, SWITCH_WORDS, crewOf, crewWith, crewWithout, movedWords, partyPersons, partyShips, presetRole, roleSuggestions, rolesInUse, rolesOf, shipHolding, withSwitch, type Switch } from './crew.ts';
import { statusWithTrade } from './vessel_trade.ts';

const props = defineProps<{
    id: string;
    /** Changes cannot be made just now (offline). */
    readOnly: boolean;
}>();

const record = computed(() => {
    void campaign.seq;
    const found = campaign.records[props.id];
    return found && !found.deleted && found.type === 'vessel' ? found : null;
});
const party = computed(() => (campaign.settings ? campaign.settings.party : null));
const rows = computed(() => crewOf(record.value));
const ships = computed(() => partyShips(campaign.records, party.value));
const persons = computed(() => partyPersons(campaign.records, party.value));
/** The party's characters not yet on this crew. */
const offered = computed(() => persons.value.filter((person) => !rows.value.some((row) => row.personId === person.id)));
const suggestions = computed(() => roleSuggestions(ships.value));
const add = reactive({ personId: '', role: presetRole(crewOf(record.value)) });
// ---- The switches (DS3): one row per role in use, three ticks, all on until flipped ----
const roles = computed(() => rolesOf(record.value));
const inUse = computed(() => rolesInUse(rows.value, roles.value));
const switchesOpen = ref(false);
/** "All on", or how many switches are off, for the fold's head. */
const switchesWords = computed(() => {
    const off = inUse.value.reduce((n, row) => n + SWITCHES.filter((key) => !row[key]).length, 0);
    return off === 0 ? 'all on' : off + (off === 1 ? ' switch off' : ' switches off');
});

function nameOf(personId: string): string {
    const found = campaign.records[personId];
    return found && !found.deleted ? found.name : 'Someone no longer in the campaign';
}

/** The other party ship this character crews now (the one-ship rule), or null. */
function holdingOf(personId: string): CampaignRecord | null {
    return shipHolding(ships.value, personId, props.id);
}

function withCrew(target: CampaignRecord, crew: CrewRow[]) {
    return { ...target, status: statusWithTrade(target, { crew }) as CampaignRecord['status'], baseRev: target.rev };
}

function addRow(): void {
    const now = record.value;
    if (!now || props.readOnly || !add.personId) return;
    const personId = add.personId;
    const other = holdingOf(personId);
    const next = crewWith(rows.value, personId, add.role);
    const records = [withCrew(now, next)];
    if (other) records.push(withCrew(other, crewWithout(crewOf(other), personId)));
    commit({ records });
    if (other) showToast(movedWords(nameOf(personId), other.name));
    add.personId = '';
    add.role = presetRole(next);
}

function setRole(personId: string, event: Event): void {
    const now = record.value;
    const box = event.target;
    if (!now || props.readOnly || !(box instanceof HTMLInputElement)) return;
    commit({ records: [withCrew(now, crewWith(rows.value, personId, box.value))] });
}

function flip(role: CrewRole, key: Switch, event: Event): void {
    const now = record.value;
    const box = event.target;
    if (!now || props.readOnly || !(box instanceof HTMLInputElement)) return;
    commit({ records: [{ ...now, status: statusWithTrade(now, { roles: withSwitch(roles.value, role.name, key, box.checked) }) as CampaignRecord['status'], baseRev: now.rev }] });
}

function remove(personId: string): void {
    const now = record.value;
    if (!now || props.readOnly) return;
    commit({ records: [withCrew(now, crewWithout(rows.value, personId))] });
}
</script>

<template>
  <section class="vt-sec ui-frame" data-vessel-crew aria-labelledby="vt-crew-h">
    <div class="vt-head">
      <h3 id="vt-crew-h" class="ui-frame-label">Crew <span v-if="rows.length" class="ui-frame-count">{{ rows.length }}</span></h3>
    </div>
    <ul v-if="rows.length" class="vt-rows">
      <li v-for="row in rows" :key="row.personId" class="vt-row is-line crew-row" :data-crew-row="row.personId">
        <b class="crew-name">{{ nameOf(row.personId) }}</b>
        <label class="vt-fld crew-role">
          <span>Role</span>
          <input :value="row.role" class="vt-box" list="crew-roles" :disabled="readOnly" :data-crew-role="row.personId" @change="setRole(row.personId, $event)" />
        </label>
        <button type="button" class="ui-btn" :disabled="readOnly" :data-crew-remove="row.personId" @click="remove(row.personId)">Remove</button>
      </li>
    </ul>
    <p v-else class="vt-none">{{ NO_CREW }}</p>
    <div v-if="rows.length" class="crew-switches" data-crew-switches>
      <button type="button" class="vt-more crew-switches-head" :aria-expanded="switchesOpen ? 'true' : 'false'" data-crew-switches-toggle @click="switchesOpen = !switchesOpen">
        Permissions · {{ switchesWords }}
      </button>
      <div v-if="switchesOpen" class="crew-switch-rows">
        <p class="vt-fine">{{ ALL_ON }} A role with every switch on needs no row.</p>
        <table class="crew-switch-table">
          <thead>
            <tr>
              <th scope="col">Role</th>
              <th v-for="key in SWITCHES" :key="key" scope="col">{{ SWITCH_WORDS[key] }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="role in inUse" :key="role.name" :data-crew-switch-row="role.name">
              <th scope="row">{{ role.name }}</th>
              <td v-for="key in SWITCHES" :key="key">
                <input type="checkbox" :checked="role[key]" :disabled="readOnly" :aria-label="SWITCH_WORDS[key] + ', ' + role.name" :data-crew-switch="role.name + ':' + key" @change="flip(role, key, $event)" />
              </td>
            </tr>
          </tbody>
        </table>
        <p class="vt-fine" data-crew-referee-alone>{{ REFEREE_ALONE }}</p>
      </div>
    </div>
    <form v-if="offered.length" class="crew-add" data-crew-add @submit.prevent="addRow">
      <label class="vt-fld crew-pick">
        <span>Character</span>
        <select v-model="add.personId" class="vt-box" :disabled="readOnly" data-crew-person>
          <option value="">Choose</option>
          <option v-for="person in offered" :key="person.id" :value="person.id">{{ person.name }}{{ holdingOf(person.id) ? ' · crews ' + holdingOf(person.id)!.name : '' }}</option>
        </select>
      </label>
      <label class="vt-fld crew-role">
        <span>Role</span>
        <input v-model="add.role" class="vt-box" list="crew-roles" :disabled="readOnly" data-crew-role-new />
      </label>
      <button type="submit" class="ui-btn is-primary" :disabled="readOnly || !add.personId" data-crew-post>Add to the crew</button>
    </form>
    <p v-else-if="!persons.length" class="vt-fine">The party has no characters yet. The Party tab adds them.</p>
    <datalist id="crew-roles">
      <option v-for="role in suggestions" :key="role" :value="role" />
    </datalist>
  </section>
</template>

<style>
.crew-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-2) var(--sp-3);
}

.crew-row .crew-name {
  flex: 1 1 160px;
}

.crew-row .crew-role {
  flex: 0 1 220px;
}

.crew-add {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: var(--sp-2) var(--sp-3);
  margin-top: var(--sp-3);
}

.crew-add .crew-pick {
  flex: 1 1 200px;
}

.crew-add .crew-role {
  flex: 1 1 160px;
}

/* The switches (DS3): a fold under the list; a small table, one row per role. */
.crew-switches {
  margin-top: var(--sp-2);
}

.crew-switch-rows {
  margin-top: var(--sp-2);
}

.crew-switch-table {
  border-collapse: collapse;
  margin: var(--sp-2) 0;
  font: 400 13px/1.4 var(--font-text);
}

.crew-switch-table th,
.crew-switch-table td {
  padding: 4px 12px 4px 0;
  text-align: left;
}

.crew-switch-table thead th {
  color: var(--text-muted);
  font: 500 12px/1.4 var(--font-text);
}

.crew-switch-table tbody th {
  font-weight: 600;
}

.crew-switch-table input {
  width: 18px;
  height: 18px;
  margin: 0;
  accent-color: var(--signal);
}
</style>
