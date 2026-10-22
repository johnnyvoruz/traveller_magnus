<script setup lang="ts">
/**
 * Welcome, in the app's one modal frame. Escape, Close, the scrim, and Just explore leave it.
 * Create an account shows the sign-in card. The three panes go to Regina, an example ship, and the marketplace.
 * Run also opens the example campaign in the Campaign panel (DL8) when one is published: the entry
 * shows only once the route has answered, so a 404 or a 503 leaves no dead button.
 */
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import Icon from '../design/Icon.vue';
import { APP_VERSION } from '../version.ts';
import SignInCard from './SignInCard.vue';
import { checkExample, enterExample, example, EXAMPLE_ENTRY } from './example_campaign.ts';
import { fetchShipCard, type ShipCardBody } from './public_card.ts';
import {
    loadExampleShip,
    markWelcomeShown,
    WELCOME_CREDIT,
    WELCOME_LINE,
    WELCOME_PANES,
    type ExampleShip,
} from './welcome.ts';

const emit = defineEmits<{ close: [] }>();
const router = useRouter();

const signing = ref(false);
const ship = ref<ExampleShip | null>(null);
const card = ref<ShipCardBody | null>(null);
const shipNote = ref('');
const shipBusy = ref(false);

function onKey(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    emit('close');
}

onMounted(() => {
    document.addEventListener('keydown', onKey);
    void checkExample();
});

const entering = ref(false);

async function lookAround(): Promise<void> {
    if (entering.value) return;
    entering.value = true;
    markWelcomeShown();
    // Going in leaves /welcome for the Campaign panel; closing here would replace that address with /.
    await enterExample(router);
    entering.value = false;
}
onBeforeUnmount(() => {
    document.removeEventListener('keydown', onKey);
});

function leaveTo(path: string, query?: Record<string, string>): void {
    markWelcomeShown();
    void router.push(query ? { path, query } : path);
}

function fly(): void {
    leaveTo('/s/Spinward_Marches/1910');
}

function share(): void {
    leaveTo('/packages');
}

function showShip(): void {
    if (!ship.value) return;
    leaveTo('/s/' + ship.value.sector + '/' + ship.value.hex, { panel: 'closed' });
}

async function run(): Promise<void> {
    if (shipBusy.value) return;
    shipBusy.value = true;
    shipNote.value = '';
    ship.value = null;
    card.value = null;
    const found = await loadExampleShip(fetch);
    shipBusy.value = false;
    if (!found) {
        shipNote.value = 'No example ship is public right now.';
        return;
    }
    ship.value = found;
    const answer = await fetchShipCard(fetch, found.mark);
    if (answer.kind === 'card') card.value = answer.card;
}

</script>

<template>
  <Teleport to="body">
    <div class="ui-modal welcome" role="dialog" aria-modal="true" aria-labelledby="welcome-h" @keydown="onKey">
      <div class="ui-modal-scrim" @click="emit('close')"></div>
      <div class="ui-modal-card welcome-card">
        <div class="ui-modal-bar">
          <h2 id="welcome-h" class="ui-modal-title">
            <span class="ui-brand">Traveller<span class="ui-brand-dot">.</span>voyage</span>
          </h2>
          <button type="button" class="ui-btn is-icon welcome-close" aria-label="Close" title="Close (Esc)" @click="emit('close')">
            <Icon name="xmark" :size="14" />
          </button>
        </div>
        <p class="welcome-line">{{ WELCOME_LINE }}</p>
        <SignInCard v-if="signing" heading />
        <ol v-else class="ui-steps welcome-panes">
          <li v-for="pane in WELCOME_PANES" :key="pane.id" class="ui-step">
            <p class="ui-kicker is-signal">{{ pane.kicker }}</p>
            <h3 class="welcome-title">{{ pane.title }}</h3>
            <img class="welcome-shot" :src="'/landing/' + pane.id + '.webp'" :alt="pane.picture" width="640" height="400">
            <p>{{ pane.text }}</p>
            <button v-if="pane.id === 'fly'" type="button" class="ui-btn" @click="fly">{{ pane.button }}</button>
            <div v-else-if="pane.id === 'run'" class="welcome-run">
              <button v-if="example.available" type="button" class="ui-btn is-primary" :disabled="entering" data-example-enter @click="lookAround">{{ entering ? 'Opening…' : EXAMPLE_ENTRY }}</button>
              <button type="button" class="ui-btn" :disabled="shipBusy" @click="run">{{ pane.button }}</button>
            </div>
            <button v-else type="button" class="ui-btn" @click="share">{{ pane.button }}</button>
          </li>
        </ol>
        <section v-if="ship" class="welcome-ship" aria-label="Example ship">
          <h3>{{ ship.ship }}</h3>
          <p v-if="ship.aboard.length">Aboard: {{ ship.aboard.join(', ') }}</p>
          <p v-if="card">{{ card.game }}</p>
          <p class="welcome-example">Example game</p>
          <button type="button" class="ui-btn" @click="showShip">Show {{ ship.ship }} on the map</button>
        </section>
        <p v-if="shipNote" class="welcome-note" role="status">{{ shipNote }}</p>
        <div class="welcome-actions">
          <button type="button" class="ui-btn is-primary" @click="signing = true">Create an account</button>
          <button type="button" class="ui-btn" @click="emit('close')">Just explore</button>
        </div>
        <footer class="welcome-foot">
          <p>{{ WELCOME_CREDIT }}</p>
          <p><a href="/changes">Version {{ APP_VERSION }}</a></p>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style>
.ui-modal-card.welcome-card {
  box-sizing: border-box;
  width: min(880px, 100%);
  max-height: calc(100vh - 48px);
  overflow: auto;
}

.welcome-close {
  margin-left: auto;
}

.welcome-run {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.welcome-line {
  margin: 0;
}

.welcome-panes {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}

.welcome-panes .ui-step {
  padding: 0;
}

.welcome-panes .ui-step::before,
.welcome-panes .ui-step::after {
  content: none;
}

.welcome-title {
  margin: 4px 0 8px;
  color: var(--text-0);
  font: 600 16px/1.3 var(--font-text);
}

.welcome-shot {
  display: block;
  width: 100%;
  height: auto;
  aspect-ratio: 16 / 10;
  margin: 0 0 8px;
  border: 1px solid var(--line-1);
  border-radius: var(--r-2);
  object-fit: cover;
  background: var(--bg-0);
}

.welcome-ship {
  margin: 0;
  padding: 10px 12px;
  border: 1px solid var(--line-1);
  border-radius: var(--r-2);
  background: var(--panel-raised);
}

.welcome-ship h3,
.welcome-ship p {
  margin: 0 0 6px;
}

.welcome-example {
  color: var(--text-muted);
}

.welcome-note {
  margin: 0;
  color: var(--text-muted);
}

.welcome-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.welcome-foot {
  color: var(--text-muted);
  font-size: 12.5px;
}

.welcome-foot p {
  margin: 0;
}

.welcome-foot a {
  color: var(--signal);
}

@media (max-width: 800px) {
  .welcome-panes {
    grid-template-columns: 1fr;
  }
}
</style>
