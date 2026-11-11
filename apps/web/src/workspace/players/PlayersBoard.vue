<script setup lang="ts">
/**
 * The referee's players, as drawn (players_build_plan.md P5): the invite link, then the players in
 * Playing and Archived with Which one, Archive and Bring back. It only draws what it is given and
 * says what was pressed; PlayersSection.vue makes the calls.
 *
 * BM2c (Johnny 141): Which one takes several. Each party character is a tick box; ticking or clearing one
 * sends the member's whole list. Under the handle, one line per character the member plays, with their
 * crew line; "No character yet" with none. A sentence beside the row says when a character moved from
 * another player.
 */
import type { PlayerList } from '@voyage/shared';
import Icon from '../../design/Icon.vue';
import { ref } from 'vue';
import { inviteLine, isFull, memberLine, NO_CHARACTER, PLAYERS_FULL, tiedIds, toggledIds, type InviteShown, type MemberRow } from './players_words.ts';
import { isDefaultName, stillCalledWords } from '../campaign_name.ts';
import CampaignName from '../CampaignName.vue';

const props = defineProps<{
    readOnly: boolean;
    invite: InviteShown | null;
    inviteBusy: boolean;
    /** The campaign's name: while it is still "My map", the box offers to rename it (DU44). Absent, nothing is said. */
    campaignName?: string;
    list: PlayerList | null;
    listState: 'loading' | 'ready' | 'failed';
    listWords: string;
    /** The player a call is running for. */
    busyUser: string | null;
    /** A refusal to say beside one player; `said` is news rather than a refusal (a character moved). */
    rowWords: { userId: string; text: string; said?: boolean } | null;
    /** Who a player can be: the party's people as players see them. */
    people: { id: string; name: string }[];
    /** A person's crew line ("Captain of Kestrel Dawn"), by person id (DS2). */
    roles?: Record<string, string>;
}>();

const emit = defineEmits<{
    link: [];
    copy: [];
    revoke: [];
    archive: [member: MemberRow];
    back: [member: MemberRow];
    people: [member: MemberRow, personIds: string[]];
}>();

/** Rename pressed: the name box in place of the line (DU44). */
const renaming = ref(false);
const personName = (id: string | null): string => (id ? props.people.find((item) => item.id === id)?.name ?? '' : '');

/** The member's characters as lines: the name, and the crew line when they crew a party ship. */
function tiedLines(member: MemberRow): { id: string; text: string }[] {
    return tiedIds(member).map((id) => {
        const name = personName(id) || 'Someone no longer in the party';
        const line = (props.roles ?? {})[id];
        return { id, text: line ? name + ' · ' + line : name };
    });
}

/** Characters the member plays who are no longer in the party: still listed, so they can be cleared. */
function gone(member: MemberRow): string[] {
    return tiedIds(member).filter((id) => !personName(id));
}

function tick(member: MemberRow, personId: string, event: Event): void {
    emit('people', member, toggledIds(tiedIds(member), personId, (event.target as HTMLInputElement).checked));
}
</script>

<template>
  <section class="party-people players" data-players aria-labelledby="players-h">
    <div class="party-people-head">
      <h3 id="players-h" class="ui-heading ui-kicker">Players <span v-if="list" class="ui-count">{{ list.playing.length }}</span></h3>
    </div>

    <div class="players-invite" data-players-invite>
      <template v-if="campaignName && isDefaultName(campaignName)">
        <p v-if="!renaming" class="players-fine players-named" data-players-still-named>
          {{ stillCalledWords(campaignName) }}
          <button type="button" class="ui-btn" :disabled="readOnly" data-players-rename @click="renaming = true">Rename</button>
        </p>
        <CampaignName v-else :read-only="readOnly" label="Campaign name" @saved="renaming = false" />
      </template>
      <template v-if="invite">
        <label class="players-link">
          <span class="rec-sr">Invite link</span>
          <input type="text" readonly :value="invite.url" data-players-url @focus="($event.target as HTMLInputElement).select()" />
        </label>
        <div class="players-acts">
          <button type="button" class="ui-btn is-primary" @click="emit('copy')"><Icon name="file-export" :size="12" />Copy</button>
          <button type="button" class="ui-btn" :disabled="readOnly || inviteBusy" data-players-revoke @click="emit('revoke')">Revoke</button>
        </div>
        <p class="players-fine">{{ inviteLine(invite) }}. Anyone with the link can join as a player.</p>
      </template>
      <template v-else>
        <p class="players-fine">Players join with an invite link. They see what you share, and they can add notes to the journal.</p>
        <button type="button" class="ui-btn is-primary" :disabled="readOnly || inviteBusy" data-players-link @click="emit('link')">
          <Icon name="plus" :size="12" />Get the invite link
        </button>
      </template>
    </div>

    <p v-if="listState === 'loading'" class="party-none-line" role="status">Loading the players.</p>
    <p v-else-if="listState === 'failed'" class="party-none-line" role="status">{{ listWords }}</p>
    <template v-else-if="list">
      <p v-if="isFull(list.playing.length)" class="players-fine is-full" role="status">{{ PLAYERS_FULL }}</p>
      <h4 class="players-group">Playing <span class="ui-count">{{ list.playing.length }}</span></h4>
      <p v-if="!list.playing.length" class="party-none-line">Nobody yet. Send the invite link to your players.</p>
      <ul v-else class="party-rows players-rows" data-players-playing>
        <li v-for="member in list.playing" :key="member.userId">
          <span class="players-who">
            <b>{{ member.handle }}</b>
            <small>{{ memberLine(member) }}</small>
            <small v-for="line in tiedLines(member)" :key="line.id" class="players-role" :data-players-role="member.userId">{{ line.text }}</small>
            <small v-if="!tiedLines(member).length" class="players-role" :data-players-none="member.userId">{{ NO_CHARACTER }}</small>
          </span>
          <fieldset class="players-which" :data-players-which="member.userId" :disabled="readOnly || busyUser !== null">
            <legend>Which one</legend>
            <span v-if="!people.length && !gone(member).length" class="players-fine">Nobody in the party yet.</span>
            <label v-for="person in people" :key="person.id" class="players-tick">
              <input type="checkbox" :checked="tiedIds(member).includes(person.id)" :aria-label="person.name + ', played by ' + member.handle" @change="tick(member, person.id, $event)" />
              {{ person.name }}
            </label>
            <label v-for="id in gone(member)" :key="id" class="players-tick">
              <input type="checkbox" checked :aria-label="'Someone no longer in the party, played by ' + member.handle" @change="tick(member, id, $event)" />
              Someone no longer in the party
            </label>
          </fieldset>
          <button type="button" class="ui-btn" :disabled="readOnly || busyUser !== null" :data-players-archive="member.userId" @click="emit('archive', member)">Archive</button>
          <p v-if="rowWords && rowWords.userId === member.userId" class="players-row-words" :class="{ 'is-said': rowWords.said }" role="status" :data-players-said="rowWords.said ? member.userId : undefined">{{ rowWords.text }}</p>
        </li>
      </ul>
      <template v-if="list.archived.length">
        <h4 class="players-group">Archived <span class="ui-count">{{ list.archived.length }}</span></h4>
        <ul class="party-rows players-rows" data-players-archived>
          <li v-for="member in list.archived" :key="member.userId">
            <span class="players-who">
              <b>{{ member.handle }}</b>
              <small>{{ memberLine(member) }}</small>
            </span>
            <button type="button" class="ui-btn" :disabled="readOnly || busyUser !== null" :data-players-back="member.userId" @click="emit('back', member)">Bring back</button>
            <p v-if="rowWords && rowWords.userId === member.userId" class="players-row-words" role="status">{{ rowWords.text }}</p>
          </li>
        </ul>
      </template>
    </template>
  </section>
</template>

<style>
.players-invite {
  display: grid;
  gap: 8px;
  margin: 4px 0 12px;
  padding: 10px 12px;
  border: 1px solid var(--line-1);
  border-radius: var(--r-3);
  background: var(--panel-raised);
}

.players-invite > .ui-btn {
  justify-self: start;
}

.players-named {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.players-link input {
  box-sizing: border-box;
  width: 100%;
  height: 32px;
  padding: 0 10px;
  border: 1px solid var(--line-2);
  border-radius: var(--r-2);
  background: var(--bg-0);
  color: var(--text-0);
  font: 400 12px/1 var(--font-data);
}

.players-acts {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.players-fine {
  margin: 0;
  color: var(--text-muted);
  font: 400 12px/1.5 var(--font-text);
}

.players-fine.is-full {
  margin: 0 0 8px;
  color: var(--attention);
}

.players-group {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 12px 0 6px;
  color: var(--text-1);
  font: 600 12px/1.3 var(--font-text);
}

.players-rows li {
  flex-wrap: wrap;
}

.players-who {
  display: flex;
  flex: 1 1 140px;
  flex-direction: column;
  min-width: 0;
}

.players-who b {
  overflow: hidden;
  color: var(--text-0);
  font: 600 13px/1.3 var(--font-text);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.players-who small {
  color: var(--text-muted);
  font: 400 11.5px/1.3 var(--font-text);
}

.players-which {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 12px;
  min-width: 0;
  max-width: 280px;
  margin: 0;
  padding: 0;
  border: 0;
  color: var(--text-muted);
  font: 600 11px/1 var(--font-text);
}

.players-which legend {
  float: left;
  margin-right: 4px;
  padding: 0;
}

.players-tick {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--text-1);
  font: 400 12.5px/1.3 var(--font-text);
  cursor: pointer;
}

.players-which:disabled .players-tick {
  cursor: default;
  opacity: 0.6;
}

.players-row-words {
  flex: 1 0 100%;
  margin: 0;
  color: var(--attention);
  font: 400 12px/1.4 var(--font-text);
}

.players-row-words.is-said {
  color: var(--text-1);
}

@media (max-width: 680px) {
  .players-which {
    flex: 1 0 100%;
    flex-direction: column;
    align-items: flex-start;
    gap: 0;
    max-width: none;
  }

  .players-which legend {
    float: none;
    margin: 0 0 2px;
  }

  .players-tick {
    min-height: 44px;
  }
}

/* The invite field is a tap target. On a phone it meets the same 44 px as the buttons beside it. */
@media (max-width: 599px) {
  .players-link input {
    height: 44px;
    min-height: 44px;
  }
}
</style>
