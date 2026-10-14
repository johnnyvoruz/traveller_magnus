<script setup lang="ts">
/**
 * Import a package into one of your campaigns (contracts/b_marketplace.md F4, F5, F12, F14):
 * pick the campaign, In place or Place on the map, then the preview lists every hex by
 * outcome with theirs or mine on each conflict. Import writes it and opens the map at the
 * piece. An update (`installId`) is the same preview, its placement kept. Refusals are the
 * server's sentences.
 */
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { campaign, listCampaigns, switchCampaign } from '../../campaign/store.ts';
import { session } from '../../account/session.ts';
import { marketWire, type InstallPreview, type PackagePublicPage } from '../../marketplace/catalogue.ts';
import { byOutcome, placing, previewLine, startPlacing, stopPlacing, hexWords } from './place.ts';

const props = defineProps<{
    page: PackagePublicPage;
    /** The piece's hex keys, when the page could read them. */
    keys: string[] | null;
    /** From the address: a campaign chosen before, a placement just made, an import to update. */
    universeId?: string;
    placed?: boolean;
    updateId?: string;
}>();

const router = useRouter();
const wire = marketWire();

const universeId = ref(props.universeId ?? campaign.universeId ?? '');
const mode = ref<'place' | 'in'>(props.placed ? 'place' : 'in');
const busy = ref(false);
const error = ref('');
const preview = ref<InstallPreview | null>(null);
const choices = ref<Record<string, 'theirs' | 'mine'>>({});
const recordChoices = ref<Record<string, 'theirs' | 'mine'>>({});

const mine = computed(() => campaign.universes.filter((item) => session.user && item.ownerId === session.user.id));
const latest = computed(() => props.page.latestVersion);
const groups = computed(() => (preview.value ? byOutcome(preview.value) : []));
const unanswered = computed(() => {
    const p = preview.value;
    if (!p) return 0;
    return p.hexes.filter((hex) => hex.outcome === 'conflict' && !choices.value[hex.to]).length
        + p.records.conflicts.filter((id) => !recordChoices.value[id]).length;
});

function placement(): { anchor: string; to: string } | null {
    if (props.updateId || mode.value !== 'place') return null;
    return placing.chosen && placing.packageId === props.page.id ? placing.chosen : null;
}

function fail(err: unknown): void {
    error.value = err instanceof Error && err.message ? err.message : 'The import could not be read. Try again.';
}

async function runPreview(): Promise<void> {
    if (!universeId.value || busy.value) return;
    busy.value = true;
    error.value = '';
    preview.value = null;
    choices.value = {};
    recordChoices.value = {};
    try {
        preview.value = await wire.preview(universeId.value, { packageId: props.page.id, version: latest.value, placement: placement(), installId: props.updateId || null });
    } catch (err) {
        fail(err);
    } finally {
        busy.value = false;
    }
}

/** Place on the map: open the campaign on the map with the piece's outline to drag. */
async function place(): Promise<void> {
    if (!universeId.value || !props.keys || !props.keys.length) return;
    if (campaign.universeId !== universeId.value) await switchCampaign(universeId.value);
    startPlacing({ packageId: props.page.id, version: latest.value, title: props.page.title, universeId: universeId.value, keys: props.keys });
    void router.push('/');
}

function next(): void {
    if (mode.value === 'place' && !props.updateId && !placement()) void place();
    else void runPreview();
}

async function confirmImport(): Promise<void> {
    const p = preview.value;
    if (!p || busy.value || unanswered.value) return;
    busy.value = true;
    error.value = '';
    try {
        await wire.install(universeId.value, {
            packageId: p.packageId,
            version: p.version,
            placement: placement(),
            installId: props.updateId || null,
            resolutions: choices.value,
            recordResolutions: recordChoices.value,
            conflicts: p.conflicts,
        });
        stopPlacing();
        placing.chosen = null;
        if (campaign.universeId !== universeId.value) await switchCampaign(universeId.value);
        const first = p.hexes.find((hex) => !hex.removes) ?? p.hexes[0];
        const at = first ? first.to : '';
        const cut = at.lastIndexOf('/');
        void router.push(cut > 0 ? '/s/' + encodeURIComponent(at.slice(0, cut)) + '/' + at.slice(cut + 1) : '/');
    } catch (err) {
        fail(err);
    } finally {
        busy.value = false;
    }
}

function setAll(which: 'theirs' | 'mine'): void {
    const p = preview.value;
    if (!p) return;
    const next: Record<string, 'theirs' | 'mine'> = {};
    for (const hex of p.hexes) if (hex.outcome === 'conflict') next[hex.to] = which;
    choices.value = next;
    const rec: Record<string, 'theirs' | 'mine'> = {};
    for (const id of p.records.conflicts) rec[id] = which;
    recordChoices.value = rec;
}

watch([universeId, mode], () => { preview.value = null; error.value = ''; });

onMounted(async () => {
    if (!campaign.universes.length) await listCampaigns();
    if (!universeId.value && mine.value.length) universeId.value = mine.value[0]!.id;
    if (props.updateId || (props.placed && placement())) void runPreview();
});
</script>

<template>
  <section class="mk-imp" aria-label="Import">
    <h2 class="ui-heading">{{ updateId ? 'Update' : 'Import' }}</h2>
    <p v-if="!mine.length" class="build-fine">You have no campaign to import into. Make one from the Campaign panel first.</p>
    <template v-else>
      <div class="mk-imp-row">
        <label class="mk-fld">
          <span>Campaign</span>
          <select v-model="universeId" class="mk-box" aria-label="Campaign" :disabled="busy || !!updateId">
            <option v-for="item in mine" :key="item.id" :value="item.id">{{ item.name }}</option>
          </select>
        </label>
        <div v-if="!updateId" class="ui-seg" role="group" aria-label="Where it goes">
          <button type="button" :aria-pressed="mode === 'in' ? 'true' : 'false'" @click="mode = 'in'">In place</button>
          <button type="button" :aria-pressed="mode === 'place' ? 'true' : 'false'" :disabled="!keys || !keys.length" @click="mode = 'place'">Place on the map</button>
        </div>
      </div>
      <p v-if="mode === 'place' && placement()" class="build-fine">Placed, starting at {{ hexWords(placement()!.to) }}. <button type="button" class="build-link" @click="place()">Move it</button></p>
      <p v-else-if="mode === 'place'" class="build-fine">The map opens with the piece's outline. Drag it where it goes, then select Preview.</p>
      <p v-else-if="!updateId" class="build-fine">Every hex goes where it is in the package.</p>
      <p v-if="error" class="mk-err" role="alert">{{ error }}</p>
      <div v-if="!preview" class="mk-acts">
        <button type="button" class="ui-btn is-primary" :disabled="busy || !universeId" @click="next()">{{ mode === 'place' && !updateId && !placement() ? 'Place on the map' : 'Preview' }}</button>
      </div>

      <div v-if="preview" class="mk-prev" aria-live="polite">
        <p class="mk-sum"><b>{{ previewLine(preview) }}</b></p>
        <p v-for="plan in preview.sectorsCreated" :key="plan.id" class="build-fine">A new sector is made at slot {{ plan.slot.x }}, {{ plan.slot.y }}.</p>
        <div v-if="preview.conflicts" class="mk-acts is-start">
          <span class="build-fine">For every conflict:</span>
          <button type="button" class="ui-btn" @click="setAll('theirs')">Take theirs</button>
          <button type="button" class="ui-btn" @click="setAll('mine')">Keep mine</button>
        </div>
        <details v-for="group in groups" :key="group.outcome" class="mk-grp" :open="group.outcome === 'conflict' || groups.length === 1">
          <summary><span class="mk-st" :data-state="group.outcome === 'conflict' ? 'failed' : 'done'">{{ group.words }}</span> {{ group.hexes.length }}</summary>
          <ul class="mk-hexes">
            <li v-for="hex in group.hexes" :key="hex.to">
              <code>{{ hex.to.replace(/_/g, ' ') }}</code>
              <small v-if="hex.from !== hex.to">from {{ hex.from.replace(/_/g, ' ') }}</small>
              <small v-if="hex.removes">removes the system</small>
              <small v-if="hex.current">now: {{ hex.current.name || 'unnamed' }} {{ hex.current.uwp }}</small>
              <span v-if="hex.outcome === 'conflict'" class="ui-seg is-small" role="group" :aria-label="'Choose for ' + hex.to">
                <button type="button" :aria-pressed="choices[hex.to] === 'theirs' ? 'true' : 'false'" @click="choices = { ...choices, [hex.to]: 'theirs' }">Theirs</button>
                <button type="button" :aria-pressed="choices[hex.to] === 'mine' ? 'true' : 'false'" @click="choices = { ...choices, [hex.to]: 'mine' }">Mine</button>
              </span>
            </li>
          </ul>
        </details>
        <ul v-if="preview.records.conflicts.length" class="mk-hexes">
          <li v-for="id in preview.records.conflicts" :key="id">
            <span>Record already in your campaign</span>
            <span class="ui-seg is-small" role="group" aria-label="Choose for this record">
              <button type="button" :aria-pressed="recordChoices[id] === 'theirs' ? 'true' : 'false'" @click="recordChoices = { ...recordChoices, [id]: 'theirs' }">Theirs</button>
              <button type="button" :aria-pressed="recordChoices[id] === 'mine' ? 'true' : 'false'" @click="recordChoices = { ...recordChoices, [id]: 'mine' }">Mine</button>
            </span>
          </li>
        </ul>
        <div class="mk-acts">
          <button type="button" class="ui-btn" :disabled="busy" @click="preview = null">Back</button>
          <button type="button" class="ui-btn is-primary" :disabled="busy || unanswered > 0" @click="confirmImport()">{{ updateId ? 'Update' : 'Import' }}</button>
        </div>
        <p v-if="unanswered" class="build-fine">Choose theirs or mine for {{ unanswered }} more.</p>
      </div>
    </template>
  </section>
</template>

<style>
.mk-imp {
  margin-top: 18px;
  padding: 12px 14px;
  border: 1px solid var(--line-1);
  border-radius: var(--r-3);
  background: var(--panel-raised);
}

.mk-imp-row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 12px;
}

.mk-imp .mk-fld {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 200px;
  color: var(--text-muted);
  font-size: 12.5px;
}

.mk-imp .mk-acts {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
}

.mk-imp .mk-acts.is-start {
  justify-content: flex-start;
}

.mk-grp {
  margin-top: 8px;
  border-top: 1px solid var(--line-soft);
  padding-top: 6px;
}

.mk-grp summary {
  cursor: pointer;
  color: var(--text-1);
}

.mk-hexes {
  margin: 6px 0 0;
  padding: 0;
  list-style: none;
}

.mk-hexes li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 10px;
  padding: 5px 0;
  border-bottom: 1px solid var(--line-soft);
}

.mk-hexes small {
  color: var(--text-muted);
}

.mk-hexes .ui-seg {
  margin-left: auto;
}
</style>