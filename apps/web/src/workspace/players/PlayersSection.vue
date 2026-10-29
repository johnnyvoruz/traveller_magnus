<script setup lang="ts">
/**
 * The referee's players (players_build_plan.md P5; contracts/b_players.md): on the Party tab, under
 * the party. The invite link (get it, copy it, revoke it; when it stops working, how often it was
 * used). The players in two groups, Playing and Archived: each with their handle, which person in
 * the party they are ("Which one"), and Archive or Bring back. Shown to the referee only.
 */
import { computed, onMounted, ref, watch } from 'vue';
import { PlayerList, type PlayerInvite } from '@voyage/shared';
import { createInvite, revokeInvite } from '../../campaign/membership.ts';
import { noteInvited } from '../onboarding.ts';
import { campaign, transport } from '../../campaign/store.ts';
import { apiFetch } from '../../platform/http.ts';
import { parseRead } from '../../campaign/read.ts';
import { showToast } from '../../shell/toast.ts';
import { archiveMember, bringBack, failWords, setMemberPerson } from './referee_calls.ts';
import PlayersBoard from './PlayersBoard.vue';
import { partyPeople, type MemberRow } from './players_words.ts';

const props = defineProps<{ readOnly: boolean }>();

const invite = ref<PlayerInvite | null>(null);
const inviteBusy = ref(false);
const list = ref<PlayerList | null>(null);
/** The list's state: loading, ready, or a sentence to show in its place. */
const listState = ref<'loading' | 'ready' | 'failed'>('loading');
const listWords = ref('');
/** The player a call is running for, and a refusal to say beside them. */
const busyUser = ref<string | null>(null);
const rowWords = ref<{ userId: string; text: string } | null>(null);

const people = computed(() => partyPeople({
    records: Object.values(campaign.records),
    links: Object.values(campaign.links),
    journal: Object.values(campaign.journal),
    settings: campaign.settings,
    clock: campaign.clock,
}));

/** The list, read again: after every change, so the groups say what the server holds. */
async function loadList(): Promise<void> {
    const id = campaign.universeId;
    if (!id) return;
    if (!list.value) listState.value = 'loading';
    let res: Response;
    try {
        res = await apiFetch(transport.fetch, `/api/universes/${encodeURIComponent(id)}/players`);
    } catch {
        listState.value = 'failed';
        listWords.value = 'The players could not be loaded. You are offline.';
        return;
    }
    if (id !== campaign.universeId) return;
    if (!res.ok) {
        listState.value = 'failed';
        listWords.value = await failWords(res);
        return;
    }
    const body = await res.json() as { data?: unknown };
    list.value = parseRead(PlayerList, body.data);
    listState.value = 'ready';
    noteSeen();
}

/** The onboarding checklist (DU9): players are invited once a link is out or a member is in. */
function noteSeen(): void {
    const members = list.value ? list.value.playing.length + list.value.archived.length : 0;
    noteInvited(campaign.universeId, { invite: invite.value !== null, members });
}

async function getLink(): Promise<void> {
    if (props.readOnly || inviteBusy.value) return;
    inviteBusy.value = true;
    const made = await createInvite();
    inviteBusy.value = false;
    if (!made) {
        showToast('The invite link could not be made. Try again.');
        return;
    }
    invite.value = made;
    noteSeen();
}

async function copyLink(): Promise<void> {
    if (!invite.value) return;
    try {
        await navigator.clipboard.writeText(invite.value.url);
        showToast('Link copied.');
    } catch {
        showToast('Select the link and copy it.');
    }
}

async function revoke(): Promise<void> {
    if (props.readOnly || inviteBusy.value) return;
    inviteBusy.value = true;
    const done = await revokeInvite();
    inviteBusy.value = false;
    if (!done) {
        showToast('The link could not be revoked. Try again.');
        return;
    }
    invite.value = null;
    noteSeen();
    showToast('Link revoked. Nobody new can join with it.');
}

async function run(userId: string, work: () => Promise<{ ok: boolean; message?: string }>): Promise<void> {
    if (props.readOnly || busyUser.value) return;
    busyUser.value = userId;
    rowWords.value = null;
    const result = await work();
    busyUser.value = null;
    if (!result.ok) rowWords.value = { userId, text: result.message ?? 'That did not work. Try again.' };
    await loadList();
}

function archive(member: MemberRow): void {
    void run(member.userId, async () => {
        const result = await archiveMember(member.userId);
        return result.ok ? { ok: true } : { ok: false, message: result.message };
    });
}

function restore(member: MemberRow): void {
    void run(member.userId, async () => {
        const result = await bringBack(member.userId);
        return result.ok ? { ok: true } : { ok: false, message: result.message };
    });
}

function choosePerson(member: MemberRow, personId: string | null): void {
    void run(member.userId, async () => {
        const result = await setMemberPerson(member.userId, personId);
        return result.ok ? { ok: true } : { ok: false, message: result.message };
    });
}

onMounted(() => { void loadList(); });
watch(() => campaign.universeId, () => {
    invite.value = null;
    list.value = null;
    void loadList();
});
</script>

<template>
  <PlayersBoard
    :read-only="readOnly"
    :invite="invite"
    :invite-busy="inviteBusy"
    :list="list"
    :list-state="listState"
    :list-words="listWords"
    :busy-user="busyUser"
    :row-words="rowWords"
    :people="people"
    @link="getLink"
    @copy="copyLink"
    @revoke="revoke"
    @archive="archive"
    @back="restore"
    @person="choosePerson"
  />
</template>
