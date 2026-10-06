<script setup lang="ts">
/**
 * The orbit view, /s/:sector/:hex/orbit (slice 1 part C; findings/orbit_view_design.md).
 * The route, the system's dossier at the left, the nav bar with its clock and its three
 * control drawers (follow-up 6; findings/orbit_drawers_design.md), the orbit picture and
 * the body chips. All clock arithmetic is orbit/clock.ts and the picture is
 * orbit/OrbitCanvas.vue; this file holds the clock's number, the frame loop and the wiring.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { SectorHex, SectorIndex, TreeEnvelope } from '@voyage/shared';
import Icon from '../design/Icon.vue';
import { formatDisplayNumber } from '../dossier/labels.ts';
import { overviewModel, pickSystem, type AllegianceName, type TreeRow } from '../dossier/model.ts';
import { TruthClient } from '../map/truth_client.ts';
import BodyChips from '../orbit/BodyChips.vue';
import { LAYERS, LAYOUTS, ORBIT_COMMANDS, toggled, type DrawerId } from '../orbit/commands.ts';
import { jumpReturnPath, jumpTarget } from '../orbit/jump_state.ts';
import {
    bodyAnchor, earliestDeparture, flightLeg, jumpLeg, legStart, shipsHere, shipTrack, statusWords, vesselPosition,
} from '../orbit/ship_list.ts';
import ShipStrip from '../orbit/ShipStrip.vue';
import type { ShipTrack } from '../orbit/ships.ts';
import { appendLeg, removeLastLeg, trackOf } from '../campaign/track.ts';
import type { CampaignAnchor } from '@voyage/shared';
import { rollJumpHours } from '../campaign/travel.ts';
import { formatDistance } from '../design/units.ts';
import { realDistanceKm } from '../orbit/distance.ts';
import { fieldHours, flightFuelWords, flightHours, hoursWords, jumpEstimateWords, rollWords, type JumpRoll } from '../orbit/estimates.ts';
import { beginPick, endPick, type PickedSystem } from '../workspace/pick.ts';
import { placeSource, setPlaceSource, type SystemInfo } from '../workspace/place_source.ts';
import Drawer from '../orbit/Drawer.vue';
import { escapeStep, pressCloses, toggleDrawer, type DrawerState } from '../orbit/drawers.ts';
import DrawerTabs from '../orbit/DrawerTabs.vue';
import HeaderClock from '../orbit/HeaderClock.vue';
import LayerKey from '../orbit/LayerKey.vue';
import { AU_KM, planSystem } from '../orbit/layout.ts';
import LineupSearch from '../orbit/LineupSearch.vue';
import OrbitPopover from '../orbit/OrbitPopover.vue';
import { DEFAULT_LAYERS, type Layers, type Mode } from '../orbit/picture.ts';
import { bodyChips, dossierPath, findChip, orbitPath, subsectorLetter } from '../orbit/bodies.ts';
import {
    advance, DAY_SECONDS, formatLinkDate, scrubbed, skipWeeks, startDays, tickRate, timeFieldValue, REAL_TIME,
} from '../orbit/clock.ts';
import OrbitCanvas from '../orbit/OrbitCanvas.vue';
import OrbitHeader from '../orbit/OrbitHeader.vue';
import { detectSystem, normalizeSystem } from '../orbit/system.ts';
import TimeControls from '../orbit/TimeControls.vue';
import { cancelFrame, nextFrame, now, observeSize, pageOrigin } from '../platform/browser.ts';
import { nextTick } from 'vue';
import { askPaneEscape, setFrame } from '../shell/frame.ts';
import { addressPane, atPane, withQuery } from '../shell/pane.ts';
import Rail from '../shell/Rail.vue';
import { loadSession, session } from '../account/session.ts';
import { campaign, setCampaignDate } from '../campaign/store.ts';
import { showToast } from '../shell/toast.ts';
import { ensureCampaign } from '../workspace/opening.ts';
import { sameDay, stardate } from '../workspace/stardate.ts';
import AccountMenu from '../workspace/AccountMenu.vue';
import ToastStrip from '../shell/ToastStrip.vue';
import { commands, handleKey, registerCommand } from '../shell/registry.ts';

const route = useRoute();
const router = useRouter();
const rootEl = ref<HTMLElement | null>(null);
const stageEl = ref<InstanceType<typeof OrbitCanvas> | null>(null);
const flightEl = ref<HTMLElement | null>(null);
/** The strip's height, so toasts stack under it. */
const flightHeight = ref(0);
let stopFlightSize: (() => void) | null = null;
const timeEl = ref<{ focusScrub: () => void; focusSpeed: () => void; focusDate: () => void } | null>(null);
const tabsEl = ref<{ focusTab: (id: DrawerId) => void } | null>(null);
const stageBox = ref<HTMLElement | null>(null);
/** The stage is narrow (a small window beside the dossier): the header keeps the name alone. */
const narrow = ref(false);
/** The stage is under the width the full header needs: the tabs are icons, the readout the date alone. */
const compact = ref(false);
let stopStageSize: (() => void) | null = null;
const NARROW_BELOW = 620;
const COMPACT_BELOW = 1180;

const client = new TruthClient({
    cdnBase: import.meta.env.VITE_CDN_BASE || 'https://cdn.traveller.voyage',
    apiBase: pageOrigin(),
    fetch,
});

function param(value: unknown): string {
    const raw = Array.isArray(value) ? value[0] : value;
    return typeof raw === 'string' ? raw : '';
}

const slug = computed(() => param(route.params.sector));
const hex = computed(() => param(route.params.hex));
const bodyParam = computed(() => param(route.params.body));

// ---- The system document -------------------------------------------------

const version = ref('');
const arrivals = ref(0);
const tree = ref<TreeEnvelope | null>(null);
const treeError = ref(false);
const versionError = ref(false);
let treeTicket = 0;

const index = computed((): SectorIndex | null => {
    void arrivals.value;
    return version.value ? client.index(version.value, slug.value) : null;
});

const entry = computed((): SectorHex | null => (index.value ? index.value.hexes[hex.value] ?? null : null));
const missing = computed(() => index.value !== null && entry.value === null);

const subsectorName = computed(() => {
    const letter = subsectorLetter(hex.value);
    if (!index.value || !letter) return '';
    const names = index.value.metadata?.names;
    const found = names ? names[letter] : undefined;
    return found ? found : 'Subsector ' + letter;
});

const allegiances = computed((): AllegianceName[] => {
    const table = (index.value?.metadata as { allegiances?: { code: string; name: string }[] } | undefined)?.allegiances ?? [];
    return table.map((row) => ({ code: row.code, name: row.name }));
});

const overview = computed(() => {
    if (!index.value || !entry.value) return null;
    return overviewModel({
        sectorName: index.value.name,
        subsectorName: subsectorName.value,
        hex: hex.value,
        entry: entry.value,
        tree: treeError.value ? null : tree.value,
        allegiances: allegiances.value,
    });
});

const chips = computed(() => (overview.value && overview.value.tree
    ? bodyChips(overview.value.tree.rows, overview.value.header.title)
    : []));

const selectedKey = computed(() => (findChip(chips.value, bodyParam.value || null) ? bodyParam.value : null));

/** The rules edition the system was generated under (orbit/system.ts detectSystem), or empty. */
const edition = computed(() => {
    const found = tree.value && !treeError.value ? detectSystem(tree.value.body) : null;
    return found ? found.edition : '';
});

/** The normalised orbit model. Null for an edition the model does not read yet. */
const system = computed(() => (tree.value && !treeError.value ? normalizeSystem(tree.value.body) : null));

/** The hex key comes from the route; the model does not carry it. */
const hexKey = computed(() => slug.value + '/' + hex.value);

/** The system as the line-up search reads it: the same start angles and periods the picture draws with. */
const searchPlan = computed(() => (system.value ? planSystem(system.value, hexKey.value) : null));

/**
 * loading, ready, nodata (no document, or one with no bodies), unsupported (an edition the
 * orbit model does not read yet), missing (no such world), failed.
 */
const state = computed(() => {
    if (versionError.value || treeError.value) return 'failed';
    if (!index.value) return 'loading';
    if (!entry.value) return 'missing';
    if (entry.value.tree === null) return 'nodata';
    if (!tree.value) return 'loading';
    if (!chips.value.length) return 'nodata';
    return system.value ? 'ready' : 'unsupported';
});

const title = computed(() => (overview.value ? overview.value.header.title : hex.value));
const hexChip = computed(() => (overview.value ? overview.value.header.hexChip : ''));
const place = computed(() => (overview.value ? overview.value.header.place : slug.value.replace(/_/g, ' ')));

const age = computed(() => {
    if (!tree.value) return '';
    const system = pickSystem(tree.value.body);
    // js/system_viewer.js:1672: the age in Gyr at two decimals, 0 when the system has none.
    return system ? formatDisplayNumber(system.age || 0, 2) + ' Gyr' : '';
});

function loadTree(): void {
    const found = entry.value;
    if (!found || found.tree === null) {
        treeTicket += 1;
        tree.value = null;
        return;
    }
    const cached = client.treeNow(found.tree);
    if (cached) {
        treeTicket += 1;
        tree.value = cached;
        treeError.value = false;
        return;
    }
    const ticket = ++treeTicket;
    void client.tree(found.tree).then(
        (doc) => { if (ticket === treeTicket) { tree.value = doc; treeError.value = false; } },
        () => { if (ticket === treeTicket) { tree.value = null; treeError.value = true; } },
    );
}

async function load(): Promise<void> {
    versionError.value = false;
    treeError.value = false;
    try {
        if (!version.value) version.value = await client.currentVersion();
    } catch {
        versionError.value = true;
        return;
    }
    if (!client.index(version.value, slug.value)) client.want(version.value, [slug.value]);
    loadTree();
}

function retry(): void {
    void load();
}

// ---- The clock -------------------------------------------------------------

let days = startDays(route.query.date, route.query.time);
let shownSecond = Math.floor(days * DAY_SECONDS);
const shownDays = ref(days);
const paused = ref(false);
const speed = ref(REAL_TIME);
const shuttle = ref(0);
const localTime = ref('');
let scrubStart: number | null = null;
let raf = 0;
let lastFrame = 0;
let wallSecond = -1;

/** The fields redraw when the second on screen changes, not on every frame. */
function show(): void {
    const second = Math.floor(days * DAY_SECONDS);
    if (second === shownSecond && shownDays.value === days) return;
    shownSecond = second;
    shownDays.value = days;
}

function frame(): void {
    raf = nextFrame(frame);
    const time = now();
    const rate = tickRate(paused.value, speed.value, shuttle.value);
    if (rate) {
        const before = Math.floor(days * DAY_SECONDS);
        days = advance(days, time - lastFrame, rate);
        if (Math.floor(days * DAY_SECONDS) !== before) show();
    }
    lastFrame = time;
    if (stageEl.value) stageEl.value.paint(days, time);
    sampleShip();
    const wall = Math.floor(Date.now() / 1000);
    if (wall !== wallSecond) {
        wallSecond = wall;
        localTime.value = new Date().toLocaleTimeString();
    }
}

/** The link carries the date whenever the visitor has set it; a running clock does not rewrite the link. */
function writeLink(): void {
    const link = formatLinkDate(days);
    void router.replace({ path: route.path, query: withQuery(route.query, { date: link.date, time: link.time ?? null }) });
}

function setDays(next: number): void {
    if (!Number.isFinite(next)) return;
    days = next;
    show();
}

function togglePlay(): void {
    shuttle.value = 0;
    paused.value = !paused.value;
    if (paused.value) writeLink();
}

// ---- The campaign date (K6c): looking is not advancing -----------------------------

/** Signed in with a campaign open: the time row shows the campaign date and can write it. */
const canSetDate = computed(() => session.user !== null && campaign.status === 'ready');
const campaignDate = computed(() => {
    if (!canSetDate.value || !campaign.clock) return null;
    const said = stardate(campaign.clock.days);
    return { date: said.date, weekday: said.weekday, days: campaign.clock.days };
});
const onCampaignDate = computed(() => !!campaignDate.value && sameDay(shownDays.value, campaignDate.value.days));
/** The view has been moved by hand this visit: it no longer follows the campaign date when that arrives. */
let moved = false;
let openedOnCampaign = false;

/** With no date in the link, the view opens on the campaign date, once it is known and before the clock is touched. */
watch(campaignDate, (now) => {
    if (!now || moved || openedOnCampaign || route.query.date !== undefined) return;
    openedOnCampaign = true;
    shuttle.value = 0;
    paused.value = true;
    setDays(now.days);
}, { immediate: true });

function goCampaign(): void {
    const now = campaignDate.value;
    if (!now) return;
    shuttle.value = 0;
    paused.value = true;
    setDays(now.days);
    writeLink();
}

/** "Set as campaign date": the view's date becomes the campaign's, with undo by toast. */
function setAsCampaignDate(): void {
    if (!canSetDate.value) return;
    const before = campaign.clock ? campaign.clock.days : null;
    const next = days;
    setCampaignDate(next);
    showToast('Campaign date set to ' + stardate(next).date + '.', before === null ? {} : {
        action: { label: 'Undo', run: () => { setCampaignDate(before); } },
    });
}

/**
 * "1 week": the date moves seven days on and the clock stops there, as a skip does. It moves
 * the view only, except with a campaign open and the view on the campaign date: then the
 * campaign date advances a week too, with undo by toast (slice §K6, the orchestrator's
 * proposal), since a week is the step a jump takes.
 */
function advanceWeek(): void {
    moved = true;
    shuttle.value = 0;
    paused.value = true;
    const writes = onCampaignDate.value && campaignDate.value !== null;
    const before = campaignDate.value ? campaignDate.value.days : null;
    const from = days;
    setDays(skipWeeks(days, 1));
    writeLink();
    if (!writes || before === null) return;
    const next = skipWeeks(before, 1);
    setCampaignDate(next);
    showToast('Campaign date advanced a week, to ' + stardate(next).date + '.', {
        action: {
            label: 'Undo',
            run: () => {
                setCampaignDate(before);
                setDays(from);
                writeLink();
            },
        },
    });
}

function typedDays(next: number): void {
    moved = true;
    setDays(next);
    writeLink();
}

function scrub(offset: number | null): void {
    if (offset === null) {
        if (scrubStart === null) return;
        scrubStart = null;
        writeLink();
        return;
    }
    if (scrubStart === null) scrubStart = days;
    moved = true;
    shuttle.value = 0;
    paused.value = true;
    setDays(scrubbed(scrubStart, offset));
}

/** js/system_viewer.js:1451-1457: a line-up found: stop the clock there and show it on the fitted orbits layout. */
function showLineup(at: number): void {
    shuttle.value = 0;
    paused.value = true;
    setDays(at);
    writeLink();
    if (mode.value !== 'orbits') mode.value = 'orbits';
    else if (stageEl.value) stageEl.value.fit();
}

function shuttleTo(rate: number): void {
    if (rate) moved = true;
    const was = shuttle.value;
    if (rate) paused.value = true;
    shuttle.value = rate;
    if (!rate && was) writeLink();
}

// ---- The ships (K12 points 1, 2, 2b, 5; K6d): the list, the strip, the plot, the jump ----

const partyVesselId = computed(() => (campaign.settings ? campaign.settings.party.vesselId : null));
/** The campaign's vessels in this system at the view's date, the party's first. Signed out: none. */
const ships = computed(() => (canSetDate.value ? shipsHere(campaign.records, partyVesselId.value, hexKey.value, shownDays.value) : []));
/** Their tracks, for the picture to place (orbit/ships.ts placeShips inside the canvas). Null signed out, so the dev stand-in can still show. */
const tracks = computed((): ShipTrack[] | null => {
    if (!canSetDate.value) return null;
    const out: ShipTrack[] = [];
    for (const ship of ships.value) {
        const track = shipTrack(ship, partyVesselId.value);
        if (track) out.push(track);
    }
    return out;
});
const selectedShip = ref<string | null>(null);
watch(ships, (list) => {
    if (!list.some((ship) => ship.id === selectedShip.value)) selectedShip.value = list.length ? list[0].id : null;
}, { immediate: true });
const shipRecord = computed(() => (selectedShip.value ? campaign.records[selectedShip.value] ?? null : null));
const shipPosition = computed(() => (shipRecord.value ? vesselPosition(shipRecord.value, shownDays.value) : null));

/** An anchor's name for the strip: its label, its body's chip name, this system's name, or the hex. */
function anchorName(anchor: CampaignAnchor): string {
    if (!anchor) return 'nowhere';
    if (anchor.kind === 'record') {
        const found = campaign.records[anchor.id];
        return found ? found.name : 'a record';
    }
    if (anchor.locationLabel) return anchor.locationLabel;
    if (anchor.bodyKey) {
        const chip = anchor.hexKey === hexKey.value ? findChip(chips.value, anchor.bodyKey) : null;
        if (chip) return chip.name;
    }
    return anchor.hexKey === hexKey.value ? title.value : anchor.hexKey.split('/')[1] ?? anchor.hexKey;
}

const shipStatus = computed(() => (shipRecord.value ? statusWords(shipRecord.value, shownDays.value, anchorName) : null));
/** Whether the selected ship's mark lies outside every 100D circle, and where it is, asked of the canvas every few frames. */
const shipOutside = ref<boolean | null>(null);
const shipAt = ref('');
let sampleAt = 0;

function sampleShip(): void {
    sampleAt += 1;
    if (sampleAt % 12 !== 0) return;
    const id = selectedShip.value;
    const standing = id && stageEl.value ? stageEl.value.shipStatus(id) : null;
    const next = standing ? standing.outside : null;
    if (next !== shipOutside.value) shipOutside.value = next;
    const within = standing && standing.within ? (standing.within === 'body' ? ' on a body' : ' in ' + Math.round(standing.within.cx) + ',' + Math.round(standing.within.cy) + ' r' + Math.round(standing.within.r) + (standing.within.label ? ' ' + standing.within.label : '')) : '';
    const at = standing ? Math.round(standing.x) + ',' + Math.round(standing.y) + within : '';
    if (at !== shipAt.value) shipAt.value = at;
}

// Plotting a flight (2b): the mode, the destination pressed on the picture, the leg previewed, then written.
const plotting = ref(false);
const destinationKey = ref<string | null>(null);
/** The hours the referee typed over the estimate; null while the field follows the estimate. */
const plotTyped = ref<number | null>(null);
/** The hours field holds the referee's own entry (it may be empty), not the estimate. */
const plotOwn = ref(false);
const plotAccel = ref(2);
const canPlot = computed(() => canSetDate.value && ships.value.length > 0 && state.value === 'ready');

/**
 * The flight's real distance at its departure (orbit/distance.ts; never measured on the
 * picture), in kilometres: null where a place is not known, or the ship starts elsewhere.
 */
const plotKm = computed((): number | null => {
    const plan = searchPlan.value;
    const from = legStart(shipPosition.value);
    if (!plotting.value || !destinationKey.value || !plan || !from || from.kind !== 'system' || from.hexKey !== hexKey.value || !from.bodyKey) return null;
    return realDistanceKm(plan, from.bodyKey, destinationKey.value, earliestDeparture(shipPosition.value, shownDays.value));
});
/** The estimated hours at the chosen G (campaign/travel.ts), or null with no distance to cross. */
const plotEstimate = computed(() => flightHours(plotKm.value, plotAccel.value));
/** What the hours field holds: the referee's entry once typed, else the estimate. */
const plotHours = computed((): number | null => {
    if (plotOwn.value) return plotTyped.value;
    return plotEstimate.value === null ? null : fieldHours(plotEstimate.value);
});
const plotWords = computed(() => {
    if (!plotting.value || !destinationKey.value) return null;
    return {
        distance: plotKm.value === null ? '' : formatDistance(plotKm.value, AU_KM),
        time: plotEstimate.value === null ? '' : hoursWords(plotEstimate.value),
        fuel: flightFuelWords(plotAccel.value, plotHours.value),
    };
});

const preview = computed(() => {
    if (!plotting.value || !destinationKey.value || !shipRecord.value) return null;
    const chip = findChip(chips.value, destinationKey.value);
    const to = bodyAnchor(hexKey.value, destinationKey.value, chip ? chip.name : undefined);
    const departs = earliestDeparture(shipPosition.value, shownDays.value);
    return { toName: chip ? chip.name : destinationKey.value, leg: flightLeg(legStart(shipPosition.value), to, departs, plotHours.value ?? Number.NaN, plotAccel.value) };
});

function setPlotting(on: boolean): void {
    if (on && !canPlot.value) return;
    plotting.value = on;
    if (!on) {
        destinationKey.value = null;
        useEstimate();
    }
}

function typeHours(hours: number | null): void {
    plotOwn.value = true;
    plotTyped.value = hours;
}

/** The hours field goes back to following the estimate. */
function useEstimate(): void {
    plotOwn.value = false;
    plotTyped.value = null;
}

function setDestination(key: string): void {
    if (!plotting.value || !findChip(chips.value, key)) return;
    destinationKey.value = key;
}

function addLeg(): void {
    const leg = preview.value ? preview.value.leg : null;
    const id = selectedShip.value;
    if (!leg || !id) return;
    const result = appendLeg(id, leg);
    if (!result.ok) {
        showToast(result.message);
        return;
    }
    showToast('Leg added: ' + anchorName(leg.from) + ' → ' + anchorName(leg.to) + '.');
    setPlotting(false);
}

// Jumping (5): a destination system marked on the map, then Jump from outside every limit.
const lastOpened = computed((): PickedSystem | null => {
    const source = placeSource();
    const current = source ? source.current() : null;
    if (!current || (current.slug === slug.value && current.hex === hex.value)) return null;
    return { slug: current.slug, hex: current.hex, name: current.name };
});

/**
 * The jump's duration (K12 ruling 2): rolled when a destination is marked, shown with its
 * dice, rolled again on request; the referee may type over it, and then it is theirs.
 */
const jumpRoll = ref<JumpRoll | null>(null);
const jumpTyped = ref<number | null>(null);
const jumpOwn = ref(false);
const jumpHours = computed((): number | null => (jumpOwn.value ? jumpTyped.value : jumpRoll.value ? jumpRoll.value.hours : null));

function rollJump(): void {
    if (!jumpTarget.value) return;
    jumpRoll.value = rollJumpHours();
    jumpOwn.value = false;
    jumpTyped.value = null;
}

function typeJumpHours(hours: number | null): void {
    jumpOwn.value = true;
    jumpTyped.value = hours;
}

watch(jumpTarget, (target) => {
    if (target) rollJump();
    else jumpRoll.value = null;
}, { immediate: true });

/**
 * The hexes between this system and the destination, for the parsecs and the fuel. Null
 * until the map's owner supplies a hex distance between two hex keys: the web app has none
 * (the engines' getHexDistance may not reach the browser), and a second is not written here.
 */
const jumpParsecs = computed((): number | null => null);
const jumpEstimate = computed(() => (jumpTarget.value && jumpParsecs.value !== null ? jumpEstimateWords(jumpParsecs.value) : ''));

function pickOnMap(): void {
    jumpReturnPath.value = route.fullPath;
    beginPick((system) => {
        jumpTarget.value = system;
        endPick();
        const back = jumpReturnPath.value;
        jumpReturnPath.value = null;
        if (back) void router.push(back);
    }, () => { jumpReturnPath.value = null; });
    void router.push({ path: dossierPath(slug.value, hex.value), query: withQuery(route.query, {}) });
}

/**
 * Jump. A ship is outside every 100D circle only under way between bodies, since a leg ends
 * on a body: so a jump from mid-flight cuts that flight at the jump's moment (the leg is
 * rewritten to arrive now, noted), and the jump departs from the flight's destination
 * anchor, the nearest a body-anchored leg can say. A later-planned leg blocks the cut.
 */
function jump(): void {
    const target = jumpTarget.value;
    const id = selectedShip.value;
    const position = shipPosition.value;
    if (!target || !id || !position || shipOutside.value !== true || !shipRecord.value || jumpHours.value === null) return;
    const now = shownDays.value;
    if ('fraction' in position) {
        if (position.leg.mode !== 'flight') return;
        const track = trackOf(shipRecord.value) ?? [];
        const last = track[track.length - 1];
        if (!last || last.departs !== position.leg.departs || last.arrives !== position.leg.arrives) {
            showToast('The ship has a later leg planned; remove it before jumping.');
            return;
        }
        const cut = { ...position.leg, arrives: now, note: (position.leg.note ? position.leg.note + ' ' : '') + 'Cut short to jump.' };
        const removed = removeLastLeg(id);
        if (!removed.ok) {
            showToast(removed.message);
            return;
        }
        const shortened = appendLeg(id, cut);
        if (!shortened.ok) {
            showToast(shortened.message);
            return;
        }
    }
    const to: CampaignAnchor = { kind: 'system', hexKey: target.slug + '/' + target.hex, locationLabel: target.name };
    const leg = jumpLeg(legStart(position), to, now, jumpHours.value ?? Number.NaN);
    if (!leg) return;
    const result = appendLeg(id, leg);
    if (!result.ok) {
        showToast(result.message);
        return;
    }
    showToast('Jump to ' + target.name + ': arrives ' + stardate(leg.arrives).date + '.');
    jumpTarget.value = null;
}

// ---- Selection, popovers, leaving --------------------------------------------

/** The pane the address names. Absent panel on an orbit path is the dossier. */
const shownPane = computed(() => addressPane(route.path, route.query).pane);
const dossierOpen = computed(() => shownPane.value.kind === 'dossier');
const campaignOpen = computed(() => shownPane.value.kind === 'campaign' || shownPane.value.kind === 'party');
/** The account pop-up at the rail's foot, as on the map. */
const accountOpen = ref(false);
const railEl = ref<{ focusAccount: () => void; focusCampaign: () => void; focusSystem: () => void } | null>(null);

function closeAccount(): void {
    if (!accountOpen.value) return;
    accountOpen.value = false;
    if (railEl.value) railEl.value.focusAccount();
}
/** The layout and the layer switches: this visit's, as legacy (1183-1186 resets them on open). */
const mode = ref<Mode>('orbits');
const layers = ref<Layers>({ ...DEFAULT_LAYERS });
const openPop = ref('');
const moonsOpen = ref<string | null>(null);

/** The view's date in the campaign's form, and its time of day, for the readout. */
const viewDate = computed(() => stardate(shownDays.value));
const viewTime = computed(() => timeFieldValue(shownDays.value));

function setLinear(event: Event): void {
    layers.value = { ...layers.value, linear: (event.target as HTMLInputElement).checked };
}

function setStrength(event: Event): void {
    const value = Number.parseFloat((event.target as HTMLInputElement).value);
    if (Number.isFinite(value)) layers.value = { ...layers.value, pathStrength: value };
}

/** Every control on the view is a command first (orbit/commands.ts); the keys are the table's. */
function orbitCommand(id: string, run: () => void, runnable?: () => boolean): () => void {
    const spec = ORBIT_COMMANDS.find((item) => item.id === id);
    if (!spec) throw new Error('orbit: no command ' + id);
    return registerCommand({ id, name: spec.name, keys: [...spec.keys], run, ...(runnable ? { runnable } : {}) });
}

function select(key: string): void {
    moonsOpen.value = null;
    const next = selectedKey.value === key ? null : key;
    void router.push({ path: orbitPath(slug.value, hex.value, next), query: withQuery(route.query, {}) });
}

/** A body clicked on the picture: selected, never toggled off. */
function pickBody(key: string): void {
    moonsOpen.value = null;
    if (selectedKey.value === key || !findChip(chips.value, key)) return;
    void router.push({ path: orbitPath(slug.value, hex.value, key), query: withQuery(route.query, {}) });
}

function backToMap(): void {
    void router.push({
        path: dossierPath(slug.value, hex.value, selectedKey.value),
        query: withQuery(route.query, { panel: null, record: null }),
    });
}

/** Campaign over this orbit; pressed again, the pane shuts. */
function toggleCampaign(): void {
    accountOpen.value = false;
    const next = campaignOpen.value ? { kind: 'shut' as const } : { kind: 'campaign' as const, record: null };
    void router.push(atPane(route.path, route.query, next));
}

/** System swaps to the dossier, or shuts it, and stays on this orbit. */
function toggleSystem(): void {
    const next = dossierOpen.value ? { kind: 'shut' as const } : { kind: 'dossier' as const };
    void router.push(atPane(route.path, route.query, next));
}



// ---- The control drawers (follow-up 6) ------------------------------------------

/** Which drawer is open: one at a time, none at first. */
const drawer = ref<DrawerState>('');
const drawerEls = { time: ref<{ height: () => number } | null>(null), view: ref<{ height: () => number } | null>(null), layers: ref<{ height: () => number } | null>(null) };
/** The open drawer's height: a toast sits under it, not on it. */
const drawerHeight = ref(0);

function measureDrawer(): void {
    const open = drawer.value ? drawerEls[drawer.value].value : null;
    drawerHeight.value = open ? open.height() : 0;
}
watch(drawer, () => { void nextTick(measureDrawer); });

function toggleTab(id: DrawerId): void {
    drawer.value = toggleDrawer(drawer.value, id);
    if (drawer.value !== 'time') openPop.value = openPop.value === 'lineup' ? '' : openPop.value;
}

/** Opens a drawer (leaving it open when it is), then runs what wants a control inside it. */
function openDrawer(id: DrawerId, then?: () => void): void {
    drawer.value = id;
    if (then) void nextTick(then);
}

/** Esc from inside a drawer: it closes and focus returns to its tab. */
function closeDrawer(): void {
    const was = drawer.value;
    if (!was) return;
    drawer.value = '';
    if (openPop.value === 'lineup') openPop.value = '';
    void nextTick(() => { if (tabsEl.value) tabsEl.value.focusTab(was); });
}

/** A press on the picture closes the drawer; one on the drawer or the header does not. */
function onStagePress(event: Event): void {
    if (!drawer.value) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (pressCloses({ inDrawer: !!target.closest('.orbit-drawer'), inHeader: !!target.closest('.orbit-nav') })) {
        drawer.value = '';
        if (openPop.value === 'lineup') openPop.value = '';
    }
}

/** Escape: the drawer first, then a popover, then the selected body, then back to the map. */
function escape(): void {
    if (accountOpen.value) {
        closeAccount();
        return;
    }
    const step = escapeStep({ drawer: drawer.value, popover: !!openPop.value || moonsOpen.value !== null, body: selectedKey.value !== null });
    if (step === 'drawer') {
        closeDrawer();
        return;
    }
    if (step === 'popover') {
        openPop.value = '';
        moonsOpen.value = null;
        return;
    }
    if (askPaneEscape()) return;
    if (step === 'body') {
        void router.push({ path: orbitPath(slug.value, hex.value), query: withQuery(route.query, {}) });
        return;
    }
    backToMap();
}

function setPop(name: string, open: boolean): void {
    moonsOpen.value = null;
    openPop.value = open ? name : '';
}

function setMoons(key: string | null): void {
    openPop.value = '';
    moonsOpen.value = key;
}

function onKey(event: KeyboardEvent): void {
    // Space on a focused control is that control's own key (legacy 4900-4906).
    if (event.key === ' ') {
        const target = event.target;
        if (target instanceof HTMLElement && target.closest('button, a, summary, select, input, textarea')) return;
    }
    // A slider is not a text field: a letter or digit pressed on it is still the view's key.
    const target = event.target;
    if (target instanceof HTMLInputElement && target.type === 'range' && event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey) {
        const command = ORBIT_COMMANDS.find((item) => item.keys.includes(event.key));
        if (command) {
            const registered = commands().find((item) => item.id === command.id);
            if (registered && (!registered.runnable || registered.runnable())) {
                event.preventDefault();
                registered.run();
            }
            return;
        }
    }
    handleKey(event);
}

const unregister: (() => void)[] = [];
let stopArrive: (() => void) | null = null;

watch([slug, hex], () => {
    tree.value = null;
    void load();
});
watch(entry, loadTree);
// Signed in, the dossier beside the picture shows the campaign's records here: the campaign is
// asked for once the session and the truth version are known, never before the first frame.
watch(() => [session.user, version.value] as const, () => { void ensureCampaign(version.value); });

onMounted(() => {
    // A visit that starts in the orbit view still learns who is signed in, after its first frame.
    nextFrame(() => { void loadSession(); });
    stopArrive = client.onArrive(() => { arrivals.value += 1; });
    const ready = () => state.value === 'ready' && system.value !== null;
    unregister.push(
        orbitCommand('orbit-escape', escape),
        orbitCommand('orbit-play', togglePlay),
        orbitCommand('orbit-week', advanceWeek),
        orbitCommand('orbit-scrub', () => { openDrawer('time', () => { if (timeEl.value) timeEl.value.focusScrub(); }); }),
        orbitCommand('orbit-speed', () => { openDrawer('time', () => { if (timeEl.value) timeEl.value.focusSpeed(); }); }),
        orbitCommand('orbit-date', () => {
            if (drawer.value === 'time') closeDrawer();
            else openDrawer('time', () => { if (timeEl.value) timeEl.value.focusDate(); });
        }),
        orbitCommand('orbit-drawer-view', () => { toggleTab('view'); if (drawer.value === 'view') void nextTick(() => { if (tabsEl.value) tabsEl.value.focusTab('view'); }); }),
        orbitCommand('orbit-drawer-layers', () => { toggleTab('layers'); if (drawer.value === 'layers') void nextTick(() => { if (tabsEl.value) tabsEl.value.focusTab('layers'); }); }),
        orbitCommand('orbit-go-campaign', goCampaign, () => campaignDate.value !== null),
        orbitCommand('orbit-set-campaign', setAsCampaignDate, () => canSetDate.value),
        ...LAYOUTS.map((item) => orbitCommand(item.id, () => { mode.value = item.mode; }, ready)),
        ...LAYERS.map((item) => orbitCommand(item.id, () => { layers.value = toggled(layers.value, item.key); }, ready)),
        orbitCommand('orbit-fit', () => { if (stageEl.value) stageEl.value.fit(); }, ready),
        orbitCommand('orbit-plot', () => { setPlotting(!plotting.value); }, () => canPlot.value),
        orbitCommand('orbit-add-leg', addLeg, () => preview.value !== null && preview.value.leg !== null),
        orbitCommand('orbit-plot-estimate', useEstimate, () => plotting.value && plotOwn.value && plotEstimate.value !== null),
        orbitCommand('orbit-jump-roll', rollJump, () => jumpTarget.value !== null),
        orbitCommand('orbit-jump', jump, () => shipOutside.value === true && jumpTarget.value !== null && jumpHours.value !== null && !!shipStatus.value && shipStatus.value.state !== 'jump'),
        orbitCommand('orbit-lineup', () => { openDrawer('time', () => { setPop('lineup', true); }); }, () => searchPlan.value !== null),
        orbitCommand('orbit-picture', () => { openDrawer('view'); }),
        registerCommand({ id: 'home', name: 'Return to map', run: backToMap }),
        registerCommand({ id: 'system-panel', name: 'System panel', run: toggleSystem }),
        registerCommand({ id: 'account', name: 'Account', run: () => { accountOpen.value = !accountOpen.value; } }),
        registerCommand({ id: 'campaign', name: 'Campaign', run: toggleCampaign }),
    );
    lastFrame = now();
    raf = nextFrame(frame);
    if (rootEl.value) rootEl.value.focus();
    setPlaceSource({ current: currentSystem, system: systemInfo, bodies: systemBodies });
    if (flightEl.value) {
        const strip = flightEl.value;
        const measureStrip = (): void => { flightHeight.value = strip.offsetHeight; };
        measureStrip();
        stopFlightSize = observeSize(strip, measureStrip);
    }
    if (stageBox.value) {
        const box = stageBox.value;
        const measure = (): void => { narrow.value = box.clientWidth < NARROW_BELOW; compact.value = box.clientWidth < COMPACT_BELOW; void nextTick(measureDrawer); };
        measure();
        stopStageSize = observeSize(box, measure);
    }
    void load();
});

function publishFrame(): void {
    setFrame({
        kind: 'orbit',
        panelTop: 'var(--chrome-inset)',
        truthVersion: version.value,
        setWidth: () => {},
        retry,
        focusCampaign: () => { if (railEl.value) railEl.value.focusCampaign(); },
        focusSystem: () => { if (railEl.value) railEl.value.focusSystem(); },
        key: onKey,
        dossier: {
            slug: slug.value,
            hex: hex.value,
            sectorName: index.value ? index.value.name : '',
            subsectorName: subsectorName.value,
            entry: entry.value,
            tree: tree.value,
            bodyKey: selectedKey.value,
            error: treeError.value,
            pending: index.value === null,
            missing: missing.value,
            allegiances: allegiances.value,
            orbit: true,
        },
    });
}

watch(
    () => [
        slug.value,
        hex.value,
        version.value,
        index.value,
        entry.value,
        tree.value,
        treeError.value,
        selectedKey.value,
        subsectorName.value,
        missing.value,
        allegiances.value,
    ] as const,
    () => { publishFrame(); },
    { immediate: true },
);

onBeforeUnmount(() => {
    if (raf) cancelFrame(raf);
    if (stopArrive) stopArrive();
    if (stopStageSize) stopStageSize();
    if (stopFlightSize) stopFlightSize();
    for (const off of unregister) off();
    setPlaceSource(null);
    setFrame(null);
});

/** The system on screen, for a campaign pane asked from this orbit. */
function currentSystem(): SystemInfo | null {
    return {
        slug: slug.value,
        hex: hex.value,
        name: entry.value ? entry.value.name : '',
        sectorName: index.value ? index.value.name : slug.value.replace(/_/g, ' '),
    };
}

async function systemInfo(nextSlug: string, nextHex: string): Promise<SystemInfo | null> {
    if (nextSlug !== slug.value || nextHex !== hex.value || !index.value) return null;
    const row = index.value.hexes[nextHex];
    if (!row) return null;
    return { slug: nextSlug, hex: nextHex, name: row.name || nextHex, sectorName: index.value.name };
}

async function systemBodies(nextSlug: string, nextHex: string): Promise<TreeRow[] | null> {
    if (nextSlug !== slug.value || nextHex !== hex.value || !overview.value || !overview.value.tree) return null;
    return overview.value.tree.rows;
}
</script>

<template>
  <div
    ref="rootEl"
    class="orbit"
    tabindex="-1"
    @keydown="onKey"
  >
    <Rail ref="railEl" :panel-open="dossierOpen" :search-open="false" :campaign-open="campaignOpen" :account-open="accountOpen" />
    <AccountMenu :open="accountOpen" @close="closeAccount" @campaign="toggleCampaign" />
    <section class="orbit-card" aria-label="Orbit view">
      <OrbitHeader
        :title="title"
        :chip="hexChip"
        :place="place"
        :age="age"
        :edition="edition"
        :keys-open="openPop === 'keys'"
        :narrow="narrow"
        @back="backToMap"
        @keys="setPop('keys', $event)"
      >
        <template #clock>
          <HeaderClock
            :paused="paused"
            :said="viewDate"
            :time="viewTime"
            :time-open="drawer === 'time'"
            :campaign-date="campaignDate"
            :on-campaign-date="onCampaignDate"
            :narrow="compact"
            @toggle="togglePlay"
            @date="drawer === 'time' ? closeDrawer() : openDrawer('time', () => { if (timeEl) timeEl.focusDate(); })"
          />
        </template>
        <template #tools>
          <DrawerTabs ref="tabsEl" :open="drawer" :narrow="compact" @toggle="toggleTab" />
        </template>
      </OrbitHeader>
      <div ref="stageBox" class="orbit-stage" :class="{ 'is-narrow': narrow, 'is-plotting': plotting }" :style="{ '--drawer-height': drawerHeight + 'px', '--flight-strip-height': (flightHeight ? flightHeight + 8 : 0) + 'px' }" :data-state="state" :data-ship="shipOutside === null ? 'off' : (shipOutside ? 'outside' : 'inside')" :data-ship-at="shipAt" @pointerdown.capture="onStagePress">
        <!-- The three control drawers hang from the header over the picture; one open at a time. -->
        <Drawer id="time" :ref="drawerEls.time" :open="drawer === 'time'" @close="closeDrawer">
          <TimeControls
            ref="timeEl"
            :days="shownDays"
            :paused="paused"
            :speed="speed"
            :shuttle="shuttle"
            :local-time="localTime"
            :campaign-date="campaignDate"
            :on-campaign-date="onCampaignDate"
            :can-set-date="canSetDate"
            @go-campaign="goCampaign"
            @set-campaign="setAsCampaignDate"
            @week="advanceWeek"
            @days="typedDays"
            @speed="speed = $event"
            @scrub="scrub"
            @shuttle="shuttleTo"
          >
            <template #lineup>
              <div v-if="searchPlan" class="orbit-lineup-pop" data-command="orbit-lineup">
                <OrbitPopover
                  id="orbit-lineup"
                  :open="openPop === 'lineup'"
                  icon="arrows-to-dot"
                  label="Line up"
                  title="The next time the planets sit on one line"
                  start
                  @toggle="setPop('lineup', openPop !== 'lineup')"
                  @close="setPop('lineup', false)"
                >
                  <LineupSearch :plan="searchPlan" :now="() => days" @show="showLineup" />
                </OrbitPopover>
              </div>
            </template>
          </TimeControls>
        </Drawer>
        <Drawer id="view" :ref="drawerEls.view" :open="drawer === 'view'" @close="closeDrawer">
          <div class="orbit-layouts orbit-drawer-group" style="--i: 0" role="radiogroup" aria-label="Layout">
            <button
              v-for="item in LAYOUTS"
              :key="item.id"
              type="button"
              class="orbit-btn orbit-layout"
              :class="{ 'is-on': mode === item.mode }"
              :data-command="item.id"
              role="radio"
              :aria-checked="mode === item.mode ? 'true' : 'false'"
              :title="item.label + ' layout (' + item.key + ')'"
              @click="mode = item.mode"
            >
              <Icon :name="item.mode === 'orbits' ? 'bullseye' : item.mode === 'row' ? 'grip-lines-vertical' : 'grip-lines'" :size="12" />{{ item.label }}<kbd aria-hidden="true">{{ item.key }}</kbd>
            </button>
          </div>
          <button type="button" class="orbit-btn orbit-drawer-group orbit-fit-btn" style="--i: 1" data-command="orbit-fit" title="Fit the whole system (F)" @click="stageEl && stageEl.fit()">
            <Icon name="expand" :size="12" />Fit<kbd aria-hidden="true">F</kbd>
          </button>
          <button
            v-if="canSetDate"
            type="button"
            class="orbit-btn orbit-drawer-group orbit-plot-btn"
            style="--i: 3"
            :class="{ 'is-on': plotting }"
            data-command="orbit-plot"
            :aria-pressed="plotting ? 'true' : 'false'"
            :disabled="!canPlot"
            :title="canPlot ? 'Plotting mode: press a body to set the selected ship’s destination (P)' : 'Plotting needs a ship in this system'"
            @click="setPlotting(!plotting)"
          >
            <Icon name="arrows-to-dot" :size="12" />Plotting<kbd aria-hidden="true">P</kbd>
          </button>
          <div class="orbit-picture-group orbit-drawer-group" style="--i: 2" role="group" aria-label="Picture" data-command="orbit-picture">
            <label class="orbit-pop-check" title="Space orbits in proportion to their AU. The star’s drawn size still holds the innermost orbit outside the disc.">
              <input type="checkbox" :checked="layers.linear" @change="setLinear">
              <span>Linear scale</span>
            </label>
            <label class="orbit-pop-range orbit-strength">
              <span>Ring strength</span>
              <input class="orbit-jog" type="range" min="0.1" max="1" step="0.05" :value="layers.pathStrength" @input="setStrength">
            </label>
          </div>
        </Drawer>
        <Drawer id="layers" :ref="drawerEls.layers" :open="drawer === 'layers'" @close="closeDrawer">
          <LayerKey :layers="layers" @layers="layers = $event" />
        </Drawer>
        <!-- The K12 place: the status strip with Jump, the ship list under it, the plot card and the jump destination. Signed in with a campaign only. -->
        <div ref="flightEl" class="orbit-flight">
          <ShipStrip
            v-if="canSetDate && state === 'ready'"
            :ships="ships"
            :selected="selectedShip"
            :party-vessel-id="partyVesselId"
            :status="shipStatus"
            :outside="shipOutside"
            :plotting="plotting"
            :preview="preview"
            :hours="plotHours"
            :hours-typed="plotOwn"
            :estimate="plotWords"
            :accel-g="plotAccel"
            :jump-target="jumpTarget"
            :last-opened="lastOpened"
            :jump-hours="jumpHours"
            :jump-roll="jumpRoll && !jumpOwn ? rollWords(jumpRoll) : ''"
            :jump-estimate="jumpEstimate"
            :narrow="narrow"
            @select="selectedShip = $event"
            @plot="setPlotting"
            @hours="typeHours"
            @use-estimate="useEstimate"
            @jump-hours="typeJumpHours"
            @roll-again="rollJump"
            @accel="plotAccel = $event"
            @add-leg="addLeg"
            @cancel-preview="destinationKey = null"
            @pick-on-map="pickOnMap"
            @use-last="jumpTarget = lastOpened"
            @clear-target="jumpTarget = null"
            @jump="jump"
          />
        </div>
        <ToastStrip />
        <OrbitCanvas
          v-if="state === 'ready' && system"
          ref="stageEl"
          :system="system"
          :hex-key="hexKey"
          :selected="selectedKey"
          :mode="mode"
          :layers="layers"
          :tracks="tracks"
          :plotting="plotting"
          :plot-from="selectedShip"
          @pick="pickBody"
          @plot="setDestination"
        />
        <svg v-if="state !== 'ready'" class="orbit-blank" viewBox="0 0 800 800" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
          <circle v-for="r in [70, 130, 200, 280, 370]" :key="r" class="orbit-blank-ring" cx="400" cy="400" :r="r" />
        </svg>
        <div v-if="state !== 'ready'" class="orbit-note" role="status">
          <template v-if="state === 'loading'">
            <p>Loading this system.</p>
          </template>
          <template v-else-if="state === 'unsupported'">
            <p>No orbit picture for this system yet.</p>
            <p class="orbit-note-sub">It was generated under {{ edition || 'another edition' }}; the picture reads Mongoose 2nd edition systems for now. Its bodies and their dossier are below.</p>
          </template>
          <template v-else-if="state === 'nodata'">
            <p>No orbit data for this world.</p>
            <p class="orbit-note-sub">Its survey is incomplete, so no system has been generated.</p>
            <button type="button" class="orbit-btn" @click="backToMap"><Icon name="arrow-left" :size="13" />Back to the map</button>
          </template>
          <template v-else-if="state === 'missing'">
            <p>This hex has no world in the sector index.</p>
            <button type="button" class="orbit-btn" @click="backToMap"><Icon name="arrow-left" :size="13" />Back to the map</button>
          </template>
          <template v-else>
            <p>This system could not be loaded.</p>
            <div class="orbit-note-actions">
              <button type="button" class="orbit-btn" @click="retry"><Icon name="retry" :size="13" />Retry</button>
              <button type="button" class="orbit-btn" @click="backToMap"><Icon name="arrow-left" :size="13" />Back to the map</button>
            </div>
          </template>
        </div>
        <BodyChips
          v-if="chips.length"
          class="orbit-stage-chips"
          :chips="chips"
          :selected="selectedKey"
          :moons-open="moonsOpen"
          @select="select"
          @moons="setMoons"
        />
      </div>
    </section>
  </div>
</template>

<style>
.orbit {
  position: fixed;
  inset: 0;
  background: var(--bg-0);
  outline: none;
}

.orbit-card {
  position: absolute;
  top: var(--chrome-inset);
  right: var(--chrome-inset);
  bottom: var(--chrome-inset);
  left: calc(var(--rail-width) + max(var(--chrome-inset), var(--panel-width, 0px)));
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--signal-dim);
  border-radius: var(--r-4);
  background: var(--bg-0);
  box-shadow: var(--shadow-panel);
  color: var(--text-1);
  font: 400 14px/1.5 var(--font-text);
  transition: left var(--t-rail) ease;
}

.orbit-card *,
.orbit-card *::before,
.orbit-card *::after {
  box-sizing: border-box;
}

/* The View drawer's groups: the layout radios, Fit, the picture's two controls. */
.orbit-layouts {
  display: flex;
  gap: 6px;
}

.orbit-btn.orbit-layout,
.orbit-btn.orbit-fit-btn {
  height: 32px;
  gap: 7px;
}

.orbit-btn.orbit-layout:not(.is-on) {
  border-color: var(--control-line);
  background: transparent;
  color: var(--text-1);
}

.orbit-btn.orbit-layout.is-on {
  border-color: var(--signal);
  background: var(--row-active);
}

.orbit-layout kbd,
.orbit-fit-btn kbd {
  padding: 0 4px;
  border: 1px solid var(--line-2);
  border-radius: var(--r-1);
  color: var(--text-muted);
  font: 500 10px/1.3 var(--font-code);
}

.orbit-picture-group {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 16px;
}

/* A checkbox with its words, a slider with its label. */
.orbit-pop-check,
.orbit-pop-range {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  color: var(--text-1);
  font: 400 13px/1.4 var(--font-text);
  white-space: nowrap;
}

.orbit-pop-check input {
  margin: 0;
  accent-color: var(--signal);
}

.orbit-pop-range .orbit-jog {
  flex: 1 1 auto;
  width: 120px;
}

.orbit-lineup-pop {
  display: inline-flex;
}

.orbit-stage {
  position: relative;
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  /* The space K12 will take at the picture's upper right (the flight strip, then the ship list): empty until K6d. */
  --flight-strip-height: 0px;
  /* A toast sits at the picture's upper right under the flight strip: the body card, the key, Fit and the body chips are elsewhere. */
  --toast-top: calc(14px + var(--flight-strip-height) + var(--drawer-height, 0px));
  --toast-right: 14px;
  --toast-bottom: auto;
  --toast-left: auto;
  --toast-max: min(460px, calc(100% - 28px));
}

.orbit-flight {
  position: absolute;
  right: 14px;
  top: 14px;
  z-index: 3;
  max-width: calc(100% - 28px);
  pointer-events: none;
}

.orbit-btn.orbit-plot-btn {
  height: 32px;
  gap: 7px;
}

.orbit-btn.orbit-plot-btn.is-on {
  border-color: var(--attention);
  color: var(--attention);
}

.orbit-plot-btn kbd {
  padding: 0 4px;
  border: 1px solid var(--line-2);
  border-radius: var(--r-1);
  color: var(--text-muted);
  font: 500 10px/1.3 var(--font-code);
}

/* Plotting: the pointer is a crosshair over the picture. */
.orbit-stage.is-plotting .orbit-canvas {
  cursor: crosshair;
}

/* The body card docks under the layout control at the upper left. */
.orbit-stage .orbit-body-card {
  top: 56px;
}

.orbit-blank {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.orbit-blank-ring {
  fill: none;
  stroke: var(--signal-dim);
  stroke-width: 1;
  stroke-dasharray: 4 6;
  opacity: 0.3;
}

.orbit-note {
  position: relative;
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: var(--sp-6);
  text-align: center;
}

.orbit-note p {
  margin: 0;
  color: var(--text-1);
  font-size: 14px;
}

.orbit-note .orbit-note-sub {
  max-width: 44ch;
  color: var(--text-muted);
  font-size: 13px;
}

.orbit-note .orbit-btn,
.orbit-note-actions {
  margin-top: 6px;
}

.orbit-note-actions {
  display: flex;
  gap: 8px;
}

.orbit-note-actions .orbit-btn {
  margin-top: 0;
}

.orbit-stage-chips {
  position: relative;
  flex: 0 0 auto;
}

@media (prefers-reduced-motion: reduce) {
  .orbit-card {
    transition: none;
  }
}
</style>
