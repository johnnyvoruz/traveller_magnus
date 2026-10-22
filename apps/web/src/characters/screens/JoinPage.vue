<script setup lang="ts">
/**
 * The page an invite link opens. The token is read once, then taken out of the address bar.
 * Signed out, sign-in returns here and the token stays in this browser.
 * Signed in, Join enters the campaign, then you choose who you are, or Not yet.
 */
import { JoinClaim, JoinPreview, type CampaignRead } from '@voyage/shared';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { loadSession, session, signIn } from '../../account/session.ts';
import { loadPlaying, setPerson } from '../../campaign/membership.ts';
import { campaign, loadPlayerPages, pinTruthVersion, transport } from '../../campaign/store.ts';
import { pagePath, replaceUrl, sessionGet, sessionRemove, sessionSet } from '../../platform/browser.ts';
import { apiFetch } from '../../platform/http.ts';
import { registerCommand } from '../../shell/registry.ts';
import { partyPeople } from '../../workspace/players/players_words.ts';
import { JOIN_BAR, JOIN_TOKEN_KEY, heldJoinToken, joinFace, joinRefusal } from './join_model.ts';

const route = useRoute();
const router = useRouter();
const checked = ref(false);
const busy = ref(false);
const refused = ref(false);
const chosen = ref(false);
const name = ref('');
const handle = ref('');
const refusal = ref('');
const trouble = ref('');
const held = ref('');
const people = ref<{ id: string; name: string }[]>([]);
let stopCommands: (() => void) | null = null;

const signedIn = computed(() => session.user !== null);
const face = computed(() => joinFace({
    signedIn: signedIn.value,
    refused: refused.value,
    chosen: chosen.value,
    name: name.value,
    ownerHandle: handle.value,
    refusal: refusal.value,
    people: people.value,
}));

function storedToken(): string {
    return sessionGet(JOIN_TOKEN_KEY) ?? '';
}

function keepToken(token: string): void {
    // A sign-in that leaves the page reads this back. A blocked store keeps the token on this page only.
    sessionSet(JOIN_TOKEN_KEY, token);
}

function clearToken(): void {
    sessionRemove(JOIN_TOKEN_KEY);
}

function leaveTokenOutOfTheBar(): void {
    if (pagePath() === JOIN_BAR) return;
    replaceUrl(JOIN_BAR);
}

function paramToken(): string {
    const raw = route.params.token;
    const value = Array.isArray(raw) ? raw[0] : raw;
    return typeof value === 'string' ? value : '';
}

async function errorOf(res: Response): Promise<{ code: string; message: string }> {
    try {
        const body = await res.json() as { error?: { code?: string; message?: string } };
        return { code: body.error?.code ?? '', message: body.error?.message ?? '' };
    } catch {
        return { code: '', message: '' };
    }
}

function refuse(code: string, message: string, drop: boolean): void {
    refused.value = true;
    refusal.value = joinRefusal(code, message);
    if (drop) clearToken();
}

async function loadPreview(token: string): Promise<void> {
    try {
        const res = await apiFetch(fetch, '/api/join/' + encodeURIComponent(token));
        if (!res.ok) {
            const err = await errorOf(res);
            refuse(err.code, err.message, true);
            return;
        }
        const body = await res.json() as { data?: unknown };
        const parsed = JoinPreview.safeParse(body.data);
        if (!parsed.success) {
            refuse('not_found', '', true);
            return;
        }
        name.value = parsed.data.name;
        handle.value = parsed.data.ownerHandle;
    } catch {
        refuse('', 'This page could not reach the server.', false);
    }
}

async function startSignIn(): Promise<void> {
    if (busy.value) return;
    busy.value = true;
    try {
        await signIn(fetch, JOIN_BAR);
    } finally {
        if (session.error) busy.value = false;
    }
}

function peopleHere(): { id: string; name: string }[] {
    const read: CampaignRead = {
        records: Object.values(campaign.records),
        links: Object.values(campaign.links),
        journal: [],
        settings: campaign.settings,
        clock: campaign.clock,
    };
    return partyPeople(read);
}

async function enter(): Promise<void> {
    if (busy.value || !signedIn.value || refused.value || chosen.value) return;
    const token = held.value;
    if (!token) {
        refuse('missing', '', true);
        return;
    }
    busy.value = true;
    try {
        const res = await apiFetch(fetch, '/api/join', {
            method: 'POST',
            body: JSON.stringify({ token }),
        });
        if (!res.ok) {
            const err = await errorOf(res);
            refuse(err.code, err.message, true);
            return;
        }
        const body = await res.json() as { data?: unknown };
        const parsed = JoinClaim.safeParse(body.data);
        if (!parsed.success) {
            refuse('not_found', '', true);
            return;
        }
        transport.fetch = fetch;
        try {
            await loadPlaying();
            const playing = campaign.playing.find((row) => row.id === parsed.data.universeId);
            if (playing) pinTruthVersion(playing.truthVersion);
            await loadPlayerPages(parsed.data.universeId);
        } catch {
            // The membership stands. The party list can be empty, and Not yet still continues.
        }
        people.value = peopleHere();
        chosen.value = true;
    } catch {
        refuse('', 'This page could not reach the server.', false);
    } finally {
        busy.value = false;
    }
}

async function pick(personId: string | null): Promise<void> {
    if (busy.value) return;
    busy.value = true;
    trouble.value = '';
    try {
        const saved = await setPerson(personId);
        if (personId !== null && !saved) {
            trouble.value = 'This page could not save that choice.';
            return;
        }
        clearToken();
        await router.push({ path: '/', query: { panel: 'campaign' } });
    } finally {
        busy.value = false;
    }
}

function bindCommands(): void {
    if (stopCommands) stopCommands();
    stopCommands = null;
    if (!checked.value || refused.value) return;
    if (!signedIn.value) {
        stopCommands = registerCommand({ id: 'join-sign-in', name: 'Sign in to join', run: () => { void startSignIn(); } });
        return;
    }
    if (!chosen.value) {
        stopCommands = registerCommand({ id: 'join-campaign', name: 'Join this campaign', run: () => { void enter(); } });
        return;
    }
    stopCommands = registerCommand({ id: 'join-not-yet', name: 'Not yet', run: () => { void pick(null); } });
}

watch([checked, signedIn, refused, chosen], bindCommands);

onMounted(() => {
    const param = paramToken();
    held.value = heldJoinToken(param, storedToken());
    if (param) keepToken(param);
    leaveTokenOutOfTheBar();
    void loadSession().then(() => {
        checked.value = true;
        if (!held.value) {
            refuse('missing', '', false);
            return;
        }
        bindCommands();
        return loadPreview(held.value);
    });
});

onBeforeUnmount(() => {
    if (stopCommands) stopCommands();
});
</script>

<template>
  <main class="join-page ui-ground">
    <span class="ui-brand join-brand">Traveller<span class="ui-brand-dot">.</span>voyage</span>
    <section class="join-card" :aria-label="face.title" :data-join-state="checked ? face.state : 'checking'">
      <h1>{{ face.title }}</h1>
      <p v-if="!checked">Checking your session.</p>
      <p v-else>{{ face.line }}</p>
      <p v-if="session.error || trouble" class="join-trouble" role="alert">{{ session.error || trouble }}</p>
      <button
        v-if="checked && face.state === 'signed-out'"
        type="button"
        class="ui-btn is-primary"
        data-command="join-sign-in"
        :disabled="busy"
        @click="startSignIn"
      >{{ busy ? 'Signing in…' : 'Sign in' }}</button>
      <button
        v-else-if="checked && face.state === 'ready'"
        type="button"
        class="ui-btn is-primary"
        data-command="join-campaign"
        :disabled="busy"
        @click="enter"
      >{{ busy ? 'Joining…' : 'Join' }}</button>
      <template v-else-if="checked && face.state === 'choose'">
        <ul v-if="people.length" class="join-people">
          <li v-for="person in people" :key="person.id">
            <button type="button" class="ui-btn" :disabled="busy" @click="pick(person.id)">{{ person.name }}</button>
          </li>
        </ul>
        <button
          type="button"
          class="ui-btn is-primary"
          data-command="join-not-yet"
          :disabled="busy"
          @click="pick(null)"
        >Not yet</button>
      </template>
      <a v-else-if="checked && face.state === 'refused'" class="ui-btn" href="/">Back to the map</a>
    </section>
  </main>
</template>

<style>
.join-page {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  flex-direction: column;
  gap: 20px;
  justify-content: center;
  padding: 24px;
  color: var(--text-1);
}

.join-card {
  box-sizing: border-box;
  width: min(420px, 100%);
  padding: 24px;
  border: 1px solid var(--line-2);
  border-radius: var(--r-4);
  background: var(--bg-0);
  box-shadow: 0 0 24px var(--frame-glow);
}

.join-page.ui-ground {
  position: absolute;
}

.join-card h1 {
  margin: 0 0 8px;
  color: var(--text-0);
  font: 700 22px/1.3 var(--font-display);
  letter-spacing: 0.02em;
}

.join-card p {
  margin: 0 0 16px;
  color: var(--text-1);
  font: 400 14px/1.5 var(--font-text);
}

.join-people {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0 0 16px;
  padding: 0;
  list-style: none;
}

.join-people .ui-btn {
  width: 100%;
}

.join-trouble {
  color: var(--danger);
}
</style>
