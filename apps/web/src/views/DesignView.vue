<script setup lang="ts">
/**
 * The design-system page (design_reference.md §8): tokens, primitives and every shell and
 * dossier component in its states, on the dark field. Copy from here; do not invent.
 * Hover and focus states are live: point at a control, or press Tab.
 */
import { ref } from 'vue';
import Icon from '../design/Icon.vue';
import { FA_ICONS, type FaIconName } from '../design/icons.ts';
import * as sample from '../design/samples.ts';
import BodyGlyph from '../dossier/BodyGlyph.vue';
import BodyRow from '../dossier/BodyRow.vue';
import DossierBody from '../dossier/DossierBody.vue';
import DossierOverview from '../dossier/DossierOverview.vue';
import FactTiles from '../dossier/FactTiles.vue';
import SocioBlock from '../dossier/SocioBlock.vue';
import StatRows from '../dossier/StatRows.vue';
import StellarLines from '../dossier/StellarLines.vue';
import SurfaceStage from '../dossier/SurfaceStage.vue';
import SystemTree from '../dossier/SystemTree.vue';
import UwpRibbon from '../dossier/UwpRibbon.vue';
import OmniBox from '../components/OmniBox.vue';
import BodyCard from '../orbit/BodyCard.vue';
import BodyChips from '../orbit/BodyChips.vue';
import type { BodyCardModel } from '../orbit/card.ts';
import { bodyChips } from '../orbit/bodies.ts';
import { REAL_TIME, skipHours, totalDays } from '../orbit/clock.ts';
import OrbitHeader from '../orbit/OrbitHeader.vue';
import TimeControls from '../orbit/TimeControls.vue';
import Panel from '../shell/Panel.vue';
import Rail from '../shell/Rail.vue';
import type { BodyGlyphData } from '../dossier/model.ts';
import type { PanelSpan } from '../shell/panel_state.ts';

const COLOURS: { group: string; names: string[] }[] = [
    { group: 'Field', names: ['--bg-0', '--bg-1', '--bg-2', '--surface-1', '--surface-2', '--panel-raised', '--chrome-bg', '--chrome-glass', '--row-active', '--scroll-track', '--rail-glass', '--rail-hover'] },
    { group: 'Lines', names: ['--line-1', '--line-2', '--line-soft', '--control-line', '--row-active-line', '--signal-line', '--signal-edge'] },
    { group: 'Signal', names: ['--signal', '--signal-dim', '--signal-bright', '--signal-active', '--wash', '--wash-faint', '--attention', '--danger', '--focus-ring'] },
    { group: 'Text', names: ['--text-0', '--text-1', '--text-2', '--text-muted', '--text-faint', '--on-signal', '--rail-text', '--rail-icon'] },
    { group: 'Travel zones', names: ['--zone-green', '--zone-amber', '--zone-red'] },
    { group: 'Stars', names: ['--star-o', '--star-b', '--star-a', '--star-f', '--star-g', '--star-k', '--star-m', '--star-d', '--star-bd'] },
];

const SCALES: { name: string; values: string }[] = [
    { name: 'Space', values: '--sp-1 4 · --sp-2 8 · --sp-3 12 · --sp-4 16 · --sp-6 24 · --sp-8 32' },
    { name: 'Radius', values: '--r-1 4 (hex chip) · --r-2 6 (buttons, badges, cells) · --r-3 8 (cards, tiles) · --r-4 12 (floating chrome) · --r-pill' },
    { name: 'Motion', values: '--t-fast hover · --t-base panel dissolve · --t-slow short camera hop · --t-long long flight · --t-scan scanner pass · --t-rail rail expand' },
    { name: 'Chrome layout', values: '--rail-width 68 · --rail-width-open 196 · --chrome-inset 10 · --chrome-top 14 · --chrome-height 48 · --panel-top 76 · --panel-column 520' },
    { name: 'Contrast', values: 'WCAG 2.1 AA, enforced by tests/web/contrast.test.js: text 4.5:1; large text, icons, focus ring and control borders 3:1; text under 12 px is held to 7:1. Muted text on a selected row takes --text-1.' },
    { name: 'Elevation', values: '--shadow-chrome (search field, status) · --shadow-pop (popup) · --shadow-panel (panel card)' },
];

const FA_NAMES = Object.keys(FA_ICONS) as FaIconName[];
const DRAWN = ['search', 'retry'] as const;

const GLYPHS: { glyph: BodyGlyphData; caption: string; mainworld: boolean }[] = [
    { glyph: { kind: 'star', star: 'O' }, caption: 'Star O', mainworld: false },
    { glyph: { kind: 'star', star: 'B' }, caption: 'Star B', mainworld: false },
    { glyph: { kind: 'star', star: 'A' }, caption: 'Star A', mainworld: false },
    { glyph: { kind: 'star', star: 'F' }, caption: 'Star F', mainworld: false },
    { glyph: { kind: 'star', star: 'G' }, caption: 'Star G', mainworld: false },
    { glyph: { kind: 'star', star: 'K' }, caption: 'Star K', mainworld: false },
    { glyph: { kind: 'star', star: 'M' }, caption: 'Star M', mainworld: false },
    { glyph: { kind: 'star', star: 'D' }, caption: 'Star D', mainworld: false },
    { glyph: { kind: 'star', star: 'BD' }, caption: 'Star BD', mainworld: false },
    { glyph: { kind: 'gasGiant', star: '' }, caption: 'Gas giant', mainworld: false },
    { glyph: { kind: 'belt', star: '' }, caption: 'Belt', mainworld: false },
    { glyph: { kind: 'world', star: '' }, caption: 'World', mainworld: false },
    { glyph: { kind: 'moon', star: '' }, caption: 'Mainworld', mainworld: true },
];

const span = ref<PanelSpan>('column');
const showBody = ref(false);
const scanRun = ref(0);
const opened = ref('');
const railPanel = ref(true);

// The orbit shell specimens hold a little state of their own so the controls respond.
const orbitChips = bodyChips(sample.treeRows, 'Regina');
const orbitDays = ref(totalDays(1105, 203) + 0.5);
const orbitPaused = ref(true);
const orbitSpeed = ref(REAL_TIME);
const orbitShuttle = ref(0);
const orbitPop = ref('');
const orbitBody = ref<string | null>('w2m0');
const orbitMoons = ref<string | null>(null);
// The docked body card, with sample values in the shapes orbit/card.ts produces.
const orbitCard: BodyCardModel = {
    title: 'Regina',
    sub: 'Mainworld Satellite',
    lines: [
        { label: 'Orbit', value: '10.66 PD from parent' },
        { label: 'UWP', value: 'A788899-C', strong: true, gap: true },
        { label: 'Diameter', value: '11,169 km', gap: true },
        { label: 'Rotation', value: 'tidally locked' },
        { label: 'Temperature', value: 'Frozen \u00B7 \u221284\u00B0C (\u2212118\u00B0F)', hint: 'Mean 190 K' },
    ],
    season: {
        text: 'Northern autumn, marked \u00B7 southern spring \u00B7 by Regina A-IV\u2019s year (1,984 days)',
        orbit: '',
        inputs: 'tilt 25\u00B0 \u00B7 e 0 \u00B7 orbit angle 241\u00B0',
    },
    seasonHelp: 'Seasons are measured from a fixed reference: the northern spring equinox occurs when the world (or its parent planet, for a moon) is at orbit angle 0\u00B0 in the system view. This is a display convention, not canon data.',
};

function open(key: string): void {
    opened.value = key;
}
</script>

<template>
  <main class="design">
    <header class="design-head">
      <h1>Design system</h1>
      <p>
        Traveller.voyage shell and dossier, in the legacy inspector's look. Every colour and duration is a token in
        <code>design/tokens.css</code>; shared primitives are the <code>ui-*</code> classes in <code>design/base.css</code>.
      </p>
    </header>

    <section class="design-section">
      <h2 class="ui-heading">Colour tokens</h2>
      <div v-for="set in COLOURS" :key="set.group" class="design-swatches">
        <h3>{{ set.group }}</h3>
        <div class="design-swatch-row">
          <figure v-for="name in set.names" :key="name" class="design-swatch">
            <span :style="{ background: 'var(' + name + ')' }"></span>
            <figcaption>{{ name }}</figcaption>
          </figure>
        </div>
      </div>
      <dl class="design-scales">
        <div v-for="scale in SCALES" :key="scale.name">
          <dt>{{ scale.name }}</dt>
          <dd>{{ scale.values }}</dd>
        </div>
      </dl>
    </section>

    <section class="design-section">
      <h2 class="ui-heading">Type</h2>
      <div class="design-type">
        <p class="design-type-title">Panel title · Inter 700 21/1.2 <small>--text-0</small></p>
        <p class="design-type-body">Body · Inter 400 14/1.55 · the quick survey of a mainworld and its companions <small>--text-1</small></p>
        <p class="design-type-name">Row name · Inter 400 13.5/1.4 <small>--text-1</small></p>
        <p class="design-type-label">Row label · Inter 500 12/1.3 <small>--text-muted</small></p>
        <p class="ui-heading design-flat">Section heading · Inter 700 12 uppercase <span class="ui-count">15</span></p>
        <p class="design-type-detail">Detail line · Inter 400 11.5, tabular · Orbit 1.22 · 0.47 AU · 6,149 km</p>
        <p class="design-type-code">A788899-C <small>--font-code 700, codes and UWP digits</small></p>
        <p class="design-type-display">Sector names on the map <small>--font-display, map only</small></p>
      </div>
    </section>

    <section class="design-section">
      <h2 class="ui-heading">Primitives</h2>
      <div class="design-grid">
        <div class="design-card">
          <h3>Buttons <code>.ui-btn</code></h3>
          <div class="design-row">
            <button type="button" class="ui-btn"><Icon name="earth-americas" :size="13" />Default</button>
            <button type="button" class="ui-btn is-primary"><Icon name="earth-americas" :size="13" />Primary</button>
            <button type="button" class="ui-btn" disabled><Icon name="retry" :size="13" />Disabled</button>
          </div>
          <div class="design-row">
            <button type="button" class="ui-btn is-icon" aria-label="Previous"><Icon name="chevron-left" :size="13" /></button>
            <button type="button" class="ui-btn is-icon" aria-label="Next"><Icon name="chevron-right" :size="13" /></button>
            <button type="button" class="ui-btn is-icon" aria-label="Next, disabled" disabled><Icon name="chevron-right" :size="13" /></button>
            <button type="button" class="ui-btn design-focus">Focus ring</button>
          </div>
          <p class="design-note">Hover moves the border to teal. Focus is a 2 px amber ring at 3 px, everywhere.</p>
        </div>
        <div class="design-card">
          <h3>Segmented <code>.ui-seg</code></h3>
          <div class="design-row">
            <div class="ui-seg" role="group" aria-label="Sample width">
              <button type="button" aria-pressed="true">Column</button>
              <button type="button" aria-pressed="false">Half</button>
              <button type="button" aria-pressed="false">Full</button>
            </div>
          </div>
          <h3>Chips, tags, badges</h3>
          <div class="design-row">
            <span class="ui-chip"><b>Ht</b>High Technology</span>
            <span class="ui-chip">No code</span>
            <span class="ui-tag">Mainworld</span>
            <p class="ui-badge"><Icon name="star" :size="10.5" /><span>Mainworld · moon of Regina A-IV</span></p>
            <span class="ui-count">15</span>
          </div>
          <h3>Code badge <code>.ui-code</code></h3>
          <div class="design-row">
            <span class="ui-code">A</span>
            <span class="ui-code">7</span>
            <span class="ui-code">ImDd</span>
          </div>
        </div>
        <div class="design-card">
          <h3>Status pill <code>.ui-status</code></h3>
          <div class="design-row">
            <p class="ui-status">Regina · Spinward Marches 1910 · A788899-C</p>
            <p class="ui-status">Loading 3 sector indexes.</p>
          </div>
          <h3>Scrollbar</h3>
          <div class="design-scroll ui-scroll">
            <p v-for="n in 12" :key="n">Scrolling pane, line {{ n }}. The bar keeps a stable gutter clear of the text.</p>
          </div>
          <h3>Empty and muted</h3>
          <p class="doss-muted design-flat">This hex has no world in the sector index.</p>
        </div>
        <div class="design-card">
          <h3>Icons <code>design/Icon.vue</code>: the legacy Font Awesome glyphs (Pro-only ones marked)</h3>
          <div class="design-row design-icons">
            <figure v-for="name in FA_NAMES" :key="name" class="design-icon">
              <Icon :name="name" :size="20" />
              <figcaption>{{ name }}<b v-if="FA_ICONS[name].pro"> Pro</b></figcaption>
            </figure>
          </div>
          <h3>Drawn here (no legacy Font Awesome source)</h3>
          <div class="design-row design-icons">
            <figure v-for="name in DRAWN" :key="name" class="design-icon">
              <Icon :name="name" :size="20" />
              <figcaption>{{ name }}</figcaption>
            </figure>
          </div>
          <h3>Body glyphs <code>dossier/BodyGlyph.vue</code></h3>
          <div class="design-row">
            <figure v-for="glyph in GLYPHS" :key="glyph.caption" class="design-icon">
              <BodyGlyph :glyph="glyph.glyph" :mainworld="glyph.mainworld" :size="22" />
              <figcaption>{{ glyph.caption }}</figcaption>
            </figure>
          </div>
        </div>
      </div>
    </section>

    <section class="design-section">
      <h2 class="ui-heading">Dossier parts</h2>
      <div class="design-grid">
        <div class="design-card">
          <h3>UWP ribbon</h3>
          <UwpRibbon :ribbon="sample.ribbon" />
          <h3>UWP that does not parse</h3>
          <UwpRibbon :ribbon="sample.ribbonPlain" />
          <h3>Fact tiles</h3>
          <FactTiles :facts="sample.facts" />
          <h3>Surface stage (placeholder)</h3>
          <SurfaceStage :key="scanRun" badge="Mainworld · moon of Regina A-IV" />
          <div class="design-row">
            <button type="button" class="ui-btn" @click="scanRun += 1"><Icon name="retry" :size="13" />Replay scanner</button>
          </div>
        </div>
        <div class="design-card">
          <h3>Stat rows: code and name, code alone, chips, plain value</h3>
          <StatRows :rows="sample.identityRows" />
          <h3>Travel zones</h3>
          <StatRows :rows="sample.zoneRows" />
        </div>
        <div class="design-card">
          <h3>Socioeconomics: closed, open, not built</h3>
          <SocioBlock :headline="sample.socioHeadline" :rows="sample.socioRows" :empty="null" span="column" />
          <SocioBlock :headline="sample.socioHeadline" :rows="sample.socioRows" :empty="null" span="full" />
          <SocioBlock headline="" :rows="null" :empty="sample.socioEmpty" span="full" />
          <StellarLines :lines="sample.stellarLines" />
        </div>
        <div class="design-card">
          <SystemTree :count="7" :rows="sample.treeRows" @open="open" />
          <p class="design-note">Last opened: {{ opened || 'none' }}</p>
          <h3>Row without detail</h3>
          <BodyRow body-key="w9" name="Unnamed body" :facts="[]" :glyph="{ kind: 'world', star: '' }" />
        </div>
      </div>
    </section>

    <section class="design-section">
      <h2 class="ui-heading">Rail</h2>
      <div class="design-row">
        <button type="button" class="ui-btn" :class="{ 'is-primary': railPanel }" @click="railPanel = !railPanel">System panel {{ railPanel ? 'open' : 'closed' }}</button>
        <span class="design-note">The first button expands the rail to labels. An open panel marks System active; with no panel it is unavailable. Items run commands from the registry, which this page does not register.</span>
      </div>
      <div class="design-rail">
        <Rail :panel-open="railPanel" :search-open="false" />
      </div>
    </section>

    <section class="design-section">
      <h2 class="ui-heading">Orbit view shell</h2>
      <p class="design-note">
        The nav bar with the edition badge, the time row, the docked body card and the body chips of
        <code>/s/:sector/:hex/orbit</code>. Buttons are <code>.orbit-btn</code> (base.css); the clock arithmetic is
        <code>orbit/clock.ts</code>; the card's contents are <code>orbit/card.ts</code> (temperatures through
        <code>design/units.ts</code>, the season line through <code>orbit/seasons.ts</code>). The picture's colours are the
        <code>--orbit-*</code>, <code>--port-*</code> and <code>--nebula-*</code> tokens. One popover is open at a time.
      </p>
      <div class="design-orbit">
        <OrbitHeader
          title="Regina"
          chip="1910"
          place="Spinward Marches - Regina"
          age="3.95 Gyr"
          edition="MgT2E"
          :keys-open="orbitPop === 'keys'"
          @back="orbitPop = ''"
          @keys="orbitPop = $event ? 'keys' : ''"
        />
        <TimeControls
          :days="orbitDays"
          :paused="orbitPaused"
          :speed="orbitSpeed"
          :shuttle="orbitShuttle"
          local-time="14:03:22"
          :scrub-open="orbitPop === 'scrub'"
          @toggle="orbitPaused = !orbitPaused"
          @skip="orbitDays = skipHours(orbitDays, $event)"
          @days="orbitDays = $event"
          @speed="orbitSpeed = $event"
          @scrub="() => {}"
          @shuttle="orbitShuttle = $event"
          @pop="orbitPop = $event ? 'scrub' : ''"
        />
        <div class="design-orbit-stage">
          <BodyCard :model="orbitCard" body-key="sample" />
          <BodyChips
            :chips="orbitChips"
            :selected="orbitBody"
            :moons-open="orbitMoons"
            @select="orbitBody = orbitBody === $event ? null : $event; orbitMoons = null"
            @moons="orbitMoons = $event"
          />
        </div>
      </div>
    </section>

    <section class="design-section">
      <h2 class="ui-heading">Panel</h2>
      <div class="design-row">
        <button type="button" class="ui-btn" :class="{ 'is-primary': !showBody }" @click="showBody = false">System overview</button>
        <button type="button" class="ui-btn" :class="{ 'is-primary': showBody }" @click="showBody = true">Body profile</button>
        <span class="design-note">The width control in the header is live: column, half, full.</span>
      </div>
      <div class="design-frame">
        <Panel
          :open="true"
          :title="showBody ? sample.body.title : sample.overview.header.title"
          :meta="showBody ? sample.body.place : sample.overview.header.place"
          :chip="showBody ? '' : sample.overview.header.hexChip"
          :span="span"
          @span="span = $event"
          @close="showBody = false"
        >
          <template v-if="showBody" #eyebrow>
            <button type="button" class="doss-crumb" @click="showBody = false"><Icon name="arrow-left" :size="10" />{{ sample.body.crumbSystem }}</button>
            <span class="doss-crumb-sep">/</span>
            <button type="button" class="doss-crumb">A-IV</button>
          </template>
          <template v-if="showBody" #glyph>
            <BodyGlyph :glyph="sample.body.glyph" mainworld :size="26" />
          </template>
          <template v-if="showBody" #actions>
            <button type="button" class="ui-btn is-icon" aria-label="Previous body" title="Previous"><Icon name="chevron-left" :size="13" /></button>
            <span class="doss-position">{{ sample.body.index }} / {{ sample.body.total }}</span>
            <button type="button" class="ui-btn is-icon" aria-label="Next body" title="Next"><Icon name="chevron-right" :size="13" /></button>
          </template>
          <DossierBody v-if="showBody" :model="sample.body" :span="span" @open="open" />
          <DossierOverview v-else :model="sample.overview" :span="span" :error="false" @open="showBody = true" />
        </Panel>
      </div>
      <h3 class="design-sub">States inside the panel</h3>
      <div class="design-grid">
        <div class="design-card">
          <h3>System could not be loaded</h3>
          <p class="doss-muted design-flat">This world's system could not be loaded.</p>
          <div class="doss-actions">
            <button type="button" class="ui-btn"><Icon name="retry" :size="13" />Retry</button>
          </div>
        </div>
        <div class="design-card">
          <h3>Sector still loading</h3>
          <p class="doss-muted design-flat">Loading this sector.</p>
        </div>
      </div>
    </section>

    <section class="design-section">
      <h2 class="ui-heading">Omnibox</h2>
      <div class="design-grid">
        <div class="design-card">
          <h3>Field (live: focus turns the border teal)</h3>
          <div class="design-omni">
            <OmniBox version="" :manifest="null" />
          </div>
        </div>
        <div class="design-card">
          <h3>Results: default, selected, with a status line</h3>
          <div class="omni design-omni-static">
            <div class="omni-popup">
              <p class="omni-note">Search is unavailable.</p>
              <div role="listbox" aria-label="Sample results">
                <div
                  v-for="(result, index) in sample.omniResults"
                  :key="result.name"
                  role="option"
                  :aria-selected="index === 0 ? 'true' : 'false'"
                >
                  <span class="omni-line">
                    <strong>{{ result.name }}</strong>
                    <span class="omni-kind">{{ result.kind }}</span>
                  </span>
                  <span class="omni-detail">{{ result.detail }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  </main>
</template>

<style>
.design {
  box-sizing: border-box;
  min-height: 100vh;
  margin: 0;
  padding: var(--sp-6) var(--sp-6) var(--sp-8);
  background: var(--bg-0);
  color: var(--text-1);
  font: 400 14px/1.55 var(--font-text);
}

.design *,
.design *::before,
.design *::after {
  box-sizing: border-box;
}

.design-head h1 {
  margin: 0;
  color: var(--text-0);
  font: 700 21px/1.2 var(--font-text);
  letter-spacing: -0.2px;
}

.design-head p {
  max-width: 70ch;
  margin: var(--sp-1) 0 0;
  color: var(--text-muted);
  font-size: 13px;
}

.design code {
  color: var(--signal);
  font: 400 12px/1 var(--font-code);
}

.design-section {
  margin-top: var(--sp-6);
  padding-top: var(--sp-2);
  border-top: 1px solid var(--line-1);
}

.design-section h3,
.design-sub {
  margin: var(--sp-4) 0 var(--sp-2);
  color: var(--text-muted);
  font: 500 12px/1.3 var(--font-text);
}

.design-card > h3:first-child {
  margin-top: 0;
}

.design-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 420px), 1fr));
  gap: var(--sp-4);
  align-items: start;
}

.design-card {
  min-width: 0;
  padding: 14px 16px 18px;
  border: 1px solid var(--line-1);
  border-radius: var(--r-4);
  background: var(--bg-1);
}

.design-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-2);
  margin: var(--sp-2) 0;
}

.design-note {
  margin: var(--sp-2) 0 0;
  color: var(--text-muted);
  font-size: 12px;
}

.design-flat {
  margin: 0;
}

.design-focus {
  outline: 2px solid var(--focus-ring);
  outline-offset: 3px;
}

.design-swatch-row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-3);
}

.design-swatch {
  width: 112px;
  margin: 0;
}

.design-swatch span {
  display: block;
  height: 40px;
  border: 1px solid var(--line-2);
  border-radius: var(--r-2);
}

.design-swatch figcaption,
.design-icon figcaption {
  margin-top: var(--sp-1);
  color: var(--text-muted);
  font: 400 11px/1.3 var(--font-code);
}

.design-scales {
  margin: var(--sp-4) 0 0;
}

.design-scales > div {
  display: grid;
  grid-template-columns: 120px minmax(0, 1fr);
  gap: var(--sp-3);
  padding: 7px 0 8px;
  border-bottom: 1px solid var(--line-soft);
}

.design-scales dt {
  color: var(--text-muted);
  font-size: 12px;
}

.design-scales dd {
  margin: 0;
  font-size: 13px;
}

.design-type p {
  margin: 0 0 var(--sp-2);
}

.design-type small {
  margin-left: var(--sp-2);
  color: var(--text-faint);
  font: 400 11px/1 var(--font-code);
  letter-spacing: 0;
  text-transform: none;
}

.design-type-title {
  color: var(--text-0);
  font: 700 21px/1.2 var(--font-text);
  letter-spacing: -0.2px;
}

.design-type-name {
  font-size: 13.5px;
  line-height: 1.4;
}

.design-type-label {
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 500;
  line-height: 1.3;
}

.design-type-detail {
  color: var(--text-muted);
  font-size: 11.5px;
  font-variant-numeric: var(--tabular);
}

.design-type-code {
  color: var(--signal);
  font: 700 19px/1.2 var(--font-code);
  letter-spacing: 0.04em;
}

.design-type-display {
  color: var(--text-muted);
  font: 400 16px/1.3 var(--font-display);
}

.design-icon {
  display: grid;
  justify-items: center;
  min-width: 64px;
  margin: 0;
  color: var(--text-1);
}

.design-scroll {
  height: 96px;
  border: 1px solid var(--line-1);
  border-radius: var(--r-3);
  padding: var(--sp-2) var(--sp-3);
}

.design-scroll p {
  margin: 0 0 var(--sp-1);
  font-size: 13px;
}

/* The real panel, held inside a frame instead of over the map. */
.design-frame {
  position: relative;
  height: 640px;
  margin-top: var(--sp-3);
  overflow: hidden;
  border: 1px dashed var(--line-1);
  border-radius: var(--r-4);
  --panel-top: var(--chrome-inset);
  --rail-width: 0px;
}

.design-frame .panel {
  right: 0;
}

.design-frame .panel-card {
  max-width: 100%;
}

.design-rail {
  position: relative;
  height: 300px;
  margin-top: var(--sp-3);
  overflow: hidden;
  border: 1px dashed var(--line-1);
  border-radius: var(--r-4);
}

.design-icons {
  align-items: flex-start;
  gap: var(--sp-3) var(--sp-2);
}

.design-icon b {
  color: var(--attention);
  font-weight: 700;
}

.design-orbit {
  margin-top: var(--sp-3);
  border: 1px solid var(--signal-dim);
  border-radius: var(--r-4);
  background: var(--bg-0);
}

.design-orbit > .orbit-nav {
  border-radius: var(--r-4) var(--r-4) 0 0;
}

.design-orbit-stage {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  min-height: 330px;
  background: var(--orbit-space);
}

.design-omni {
  --rail-width: 0px;
  position: relative;
  height: calc(var(--chrome-height) + var(--chrome-top) + var(--sp-2));
}

.design-omni .omni {
  left: 0;
  top: var(--sp-2);
}

.design-omni-static {
  position: static;
  width: min(440px, 100%);
}

.design-omni-static .omni-popup {
  margin-top: 0;
}
</style>
