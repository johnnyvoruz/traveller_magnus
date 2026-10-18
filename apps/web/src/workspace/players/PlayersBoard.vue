<script setup lang="ts">
/**
 * The referee's players, as drawn (players_build_plan.md P5): the invite link, then the players in
 * Playing and Archived with Which one, Archive and Bring back. It only draws what it is given and
 * says what was pressed; PlayersSection.vue makes the calls.
 */
import type { PlayerInvite, PlayerList } from '@voyage/shared';
import Icon from '../../design/Icon.vue';
import { inviteLine, isFull, memberLine, PLAYERS_FULL, type MemberRow } from './players_words.ts';

const props = defineProps<{
    readOnly: boolean;
    invite: PlayerInvite | null;
    inviteBusy: boolean;
    list: PlayerList | null;
    listState: 'loading' | 'ready' | 'failed';
    listWords: string;
    /** The player a call is running for. */
    busyUser: string | null;
    /** A refusal to say beside one player. */
    rowWords: { userId: string; text: string } | null;
    /** Who a player can be: the party's people as players see them. */
    people: { id: string; name: string }[];
}>();

const emit = defineEmits<{
    link: [];
    copy: [];
    revoke: [];
    archive: [member: MemberRow];
    back: [member: MemberRow];
    person: [member: MemberRow, personId: string | null];
}>();

const personName = (id: string | null): string => (id ? props.people.find((item) => item.id === id)?.name ?? '' : '');
</script>

<template>
  <section class="party-people players" data-players aria-labelledby="players-h">
    <div class="party-people-head">
      <h3 id="players-h" class="ui-heading ui-kicker">Players <span v-if="list" class="ui-count">{{ list.playing.length }}</span></h3>
    </div>

    <div class="players-invite" data-players-invite>
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
        <p class="players-fine">Players join with an invite link. They see what you share with players, and can add notes to the journal.</p>
        <button type="button" class="ui-btn is-primary" :disabled="readOnly || inviteBusy" data-players-link @click="emit('link')">
          <Icon name="plus" :size="12" />Get the invite link
        </button>
      </template>
    </div>

    <p v-if="listState === 'loading'" class="party-none-line" role="status">Loading the players…</p>
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
          </span>
          <label class="players-which">
            <span>Which one</span>
            <select :value="member.personId ?? ''" :disabled="readOnly || busyUser !== null" :aria-label="'Which person ' + member.handle + ' plays'" @change="emit('person', member, ($event.target as HTMLSelectElement).value || null)">
              <option value="">Not chosen yet</option>
              <option v-for="person in people" :key="person.id" :value="person.id">{{ person.name }}</option>
              <option v-if="member.personId && !personName(member.personId)" :value="member.personId">Someone no longer in the party</option>
            </select>
          </label>
          <button type="button" class="ui-btn" :disabled="readOnly || busyUser !== null" :data-players-archive="member.userId" @click="emit('archive', member)">Archive</button>
          <p v-if="rowWords && rowWords.userId === member.userId" class="players-row-words" role="status">{{ rowWords.text }}</p>
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
  align-items: center;
  gap: 6px;
  color: var(--text-muted);
  font: 600 11px/1 var(--font-text);
}

.players-which select {
  max-width: 180px;
}

.players-row-words {
  flex: 1 0 100%;
  margin: 0;
  color: var(--attention);
  font: 400 12px/1.4 var(--font-text);
}

@media (max-width: 680px) {
  .players-which {
    flex: 1 0 100%;
  }

  .players-which select {
    flex: 1 1 auto;
    max-width: none;
    min-height: 44px;
  }
}
</style>
