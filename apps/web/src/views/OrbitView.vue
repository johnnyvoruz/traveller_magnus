<script setup lang="ts">
/**
 * The orbit view, /s/:sector/:hex/orbit (slice 1 part C; findings/orbit_view_design.md).
 * The route, the system's dossier at the left, the nav bar with its clock and its three
 * control drawers (follow-up 6; findings/orbit_drawers_design.md), the orbit picture and
 * the body chips. All clock arithmetic is orbit/clock.ts and the picture is
 * orbit/OrbitCanvas.vue; this file holds the clock's number, the frame loop and the wiring.
 */
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { SectorHex, SectorIndex, TreeEnvelope, TruthOverview } from '@voyage/shared';
import Icon from '../design/Icon.vue';
import { formatDisplayNumber } from '../dossier/labels.ts';
import { overviewModel, pickSystem, type AllegianceName, type TreeRow } from '../dossier/model.ts';
import { parsecsBetween } from '../map/geometry.ts';
import { TruthClient } from '../map/truth_client.ts';
import BodyChips from '../orbit/BodyChips.vue';
import { LAYERS, LAYOUTS, LINEUP_SHOWN, ORBIT_COMMANDS, PARKED_COMMANDS, toggled, type DrawerId } from '../orbit/commands.ts';
import { jumpReturnPath, jumpTarget } from '../orbit/jump_state.ts';
import {
    bodyAnchor, earliestDeparture, jumpLeg, jumpStanding, legAt, legStart, pointAnchor, shipsHere, shipTrack, statusWords, vesselPosition, whenWords,
} from '../orbit/ship_list.ts';
import NavConsole from '../orbit/NavConsole.vue';
import type { PlotHover } from '../orbit/ship_marks.ts';
import ShipStrip from '../orbit/ShipStrip.vue';
import type { ShipTrack } from '../orbit/ships.ts';
import { appendLeg, removeLastLeg, replaceLegsFrom, trackOf } from '../campaign/track.ts';
import type { CampaignAnchor } from '@voyage/shared';
import { rollJumpHours } from '../campaign/travel.ts';
import { formatDistance } from '../design/units.ts';
import { pointWords, realDistanceKmBetween, type PlaceEnd } from '../orbit/distance.ts';
import {
    appendedTail, courseLegs, coursePreview, courseReady, courseTotals, editedTail, lastThrust, movedWaypoint, planCourse, routeFixed, routePreview, samePlace,
    storedRoute, tagWords, toGoWords, underwayWords, type EditedTail, type PlannedLeg, type Waypoint,
} from '../orbit/course.ts';
import { flightFuelWords, hoursWords, jumpEstimateWords, rollWords, type JumpRoll } from '../orbit/estimates.ts';
import { stepSpeed } from '../orbit/time_row.ts';
import { beginPick, endPick, type PickedSystem } from '../workspace/pick.ts';
import { placeSource, setPlaceSource, type SystemInfo } from '../workspace/place_source.ts';
import Drawer from '../orbit/Drawer.vue';
import { escapeStep, toggleDrawer, type DrawerState } from '../orbit/drawers.ts';
import DrawerTabs from '../orbit/DrawerTabs.vue';
import HeaderClock from '../orbit/HeaderClock.vue';
import LayerKey from '../orbit/LayerKey.vue';
import { AU_KM, planSystem } from '../orbit/layout.ts';
import LineupSearch from '../orbit/LineupSearch.vue';
import OrbitPopover from '../orbit/OrbitPopover.vue';
import { DEFAULT_LAYERS, type Layers, type Mode } from '../orbit/picture.ts';
import { bodyChips, dossierPath, findChip, orbitPath, shortLabel, subsectorLetter } from '../orbit/bodies.ts';
import {
    advance, DAY_SECONDS, formatLinkDate, scrubbed, speedText, skipWeeks, startDays, tickRate, timeFieldValue, REAL_TIME,
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
import { dismissToast, showToast } from '../shell/toast.ts';
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
const consoleEl = ref<{ focusThrottle: () => void; removeFocused: () => boolean } | null>(null);
/** The strip's height, so toasts stack under it. */
const flightHeight = ref(0);
let stopFlightSize: (() => void) | null = null;
// The stack stands on the picture, which is drawn once the system is ready: it is measured whenever it arrives.
watch(flightEl, (strip) => {
    if (stopFlightSize) stopFlightSize();
    stopFlightSize = null;
    flightHeight.value = 0;
    if (!strip) return;
    const measureStrip = (): void => { flightHeight.value = strip.offsetHeight; };
    measureStrip();
    stopFlightSize = observeSize(strip, measureStrip);
});
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
    stepWeek(1);
}

/** "Back 1 week": the mirror, so back undoes forward; it writes the campaign date by the same rule. Never before day zero. */
function backWeek(): void {
    if (skipWeeks(days, -1) < 0) return;
    stepWeek(-1);
}

function stepWeek(weeks: 1 | -1): void {
    moved = true;
    shuttle.value = 0;
    paused.value = true;
    const before = campaignDate.value ? campaignDate.value.days : null;
    const writes = onCampaignDate.value && before !== null && skipWeeks(before, weeks) >= 0;
    const from = days;
    setDays(skipWeeks(days, weeks));
    writeLink();
    if (!writes || before === null) return;
    const next = skipWeeks(before, weeks);
    setCampaignDate(next);
    showToast((weeks > 0 ? 'Campaign date advanced a week, to ' : 'Campaign date moved back a week, to ') + stardate(next).date + '.', {
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
    if (anchor.point && !anchor.bodyKey) {
        const plan = anchor.hexKey === hexKey.value ? searchPlan.value : null;
        return (plan ? pointWords(plan, anchor.point, shownDays.value) : '') || 'a point in open space';
    }
    if (anchor.bodyKey) {
        const chip = anchor.hexKey === hexKey.value ? findChip(chips.value, anchor.bodyKey) : null;
        if (chip) return chip.name;
    }
    return anchor.hexKey === hexKey.value ? title.value : anchor.hexKey.split('/')[1] ?? anchor.hexKey;
}

const shipStatus = computed(() => {
    const record = shipRecord.value;
    if (!record) return null;
    const said = statusWords(record, shownDays.value, anchorName);
    if (said.state !== 'flight') return said;
    // Under way the strip names the next waypoint and counts down to it.
    const legs = trackOf(record);
    const leg = legs ? legAt(legs, shownDays.value) : null;
    return leg ? { state: said.state, text: underwayWords(leg, shownDays.value, anchorName) } : said;
});
/** Each ship's state in short words, for its tag on the picture (the names shortened as the body list shortens them). */
const shipNotes = computed((): Record<string, string> => {
    const out: Record<string, string> = {};
    const plan = searchPlan.value;
    const short = (anchor: CampaignAnchor): string => shortLabel(anchorName(anchor), plan ? plan.name : '');
    for (const ship of ships.value) {
        const said = statusWords(ship, shownDays.value, anchorName);
        const legs = trackOf(ship);
        out[ship.id] = tagWords(said.state, legs ? legAt(legs, shownDays.value) : null, shownDays.value, short);
    }
    return out;
});

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

// The ship in hand (follow-up 29): selecting a ship opens its nav console; with a thrust set the plotter is live.
/** A ship is in hand: its nav console is open. */
const plotting = ref(false);
/** The course being plotted: the waypoints in the order they were pressed (orbit/course.ts). */
const waypoints = ref<Waypoint[]>([]);
/** One thrust for the course, in G; null until it is set. None is assumed. */
const plotAccel = ref<number | null>(null);
/** The thrust last set for each ship this visit; before that, its last flight leg's (course.ts lastThrust). */
const thrustSet = new Map<string, number>();
const canPlot = computed(() => canSetDate.value && ships.value.length > 0 && state.value === 'ready');
/** The plotter is live: a press on the picture lays a waypoint. Until a thrust is set, a press is an ordinary selection. */
const live = computed(() => plotting.value && plotAccel.value !== null);

/** An anchor of this system as an end of the distance sum: its body, or its point; null for anywhere else. */
function endOf(anchor: CampaignAnchor): PlaceEnd | null {
    if (!anchor || anchor.kind !== 'system' || anchor.hexKey !== hexKey.value) return null;
    if (anchor.bodyKey) return anchor.bodyKey;
    return anchor.point ? { x: anchor.point.x, y: anchor.point.y } : null;
}

function distanceBetween(a: PlaceEnd, aDays: number, b: PlaceEnd, bDays: number): number | null {
    const plan = searchPlan.value;
    return plan ? realDistanceKmBetween(plan, a, aDays, b, bDays) : null;
}

/**
 * The selected ship's stored route on this picture, from the view's date on (course.ts
 * storedRoute): the leg under way, which is history, then those to come.
 */
const shipRoute = computed(() => storedRoute(shipRecord.value ? trackOf(shipRecord.value) : null, shownDays.value, endOf));
/** The route as the picture takes it; null with none. It is drawn whenever a ship is selected, in hand or not. */
const routeTold = computed(() => {
    const plan = searchPlan.value;
    const legs = routePreview(shipRoute.value, endOf, (leg) => shortLabel(anchorName(leg.to), plan ? plan.name : '') + ' \u00B7 ' + whenWords(leg.arrives));
    return legs.length ? legs : null;
});
/** A course being plotted runs on from the route's end: this many waypoints of the preview are the route's own. */
const lead = computed(() => shipRoute.value.legs.length);

/** Where the course starts: the end of the stored route, or the ship; and the earliest it may leave. */
const courseStart = computed((): { anchor: CampaignAnchor; end: PlaceEnd | null; departs: number | null } => {
    if (lead.value) {
        const last = shipRoute.value.legs[lead.value - 1];
        return { anchor: last.to, end: endOf(last.to), departs: last.arrives };
    }
    const from = legStart(shipPosition.value);
    return { anchor: from, end: endOf(from), departs: earliestDeparture(shipPosition.value, shownDays.value) };
});

/**
 * The course as legs: each leaves when the one before arrives and is measured to where its
 * destination will be at its own arrival (orbit/course.ts planCourse, over
 * orbit/distance.ts realDistanceKmBetween; never measured on the picture). The pointer's
 * leg is not in here, so a sweeping pointer never settles these again.
 */
const planned = computed(() => {
    const g = plotAccel.value;
    const start = courseStart.value;
    const d = drag.value;
    const list = d && d.which === 'course' ? d.waypoints : waypoints.value;
    if (!plotting.value || g === null || start.departs === null || !shipRecord.value || !list.length) return [];
    return planCourse({ anchor: start.anchor, end: start.end, departs: start.departs }, list, g, distanceBetween);
});

/** Where the next leg would start: the last waypoint and its arrival, or the ship. */
const courseTail = computed((): { anchor: CampaignAnchor; end: PlaceEnd | null; departs: number | null } => {
    const legs = planned.value;
    if (!legs.length) return courseStart.value;
    const last = legs[legs.length - 1];
    return { anchor: last.waypoint.anchor, end: last.waypoint.to, departs: last.arrives };
});

// ---- The live plotter: the place under the pointer, or stepped to from the keyboard ----

/** What the picture has under the pointer (OrbitCanvas plotHover: at most once a painted frame). */
const hover = shallowRef<PlotHover | null>(null);
/** The body stepped to from the keyboard; the pointer takes over again when it next moves to another place. */
const stepped = ref<string | null>(null);

function onPlotHover(under: PlotHover | null): void {
    hover.value = under;
    if (under) stepped.value = null;
}

function bodyWaypoint(key: string): Waypoint | null {
    const chip = findChip(chips.value, key);
    return chip ? { to: key, name: chip.name, anchor: bodyAnchor(hexKey.value, key, chip.name), typed: null, own: false } : null;
}

function pointWaypoint(point: { x: number; y: number }): Waypoint {
    const plan = searchPlan.value;
    const name = (plan ? pointWords(plan, point, shownDays.value) : '') || 'A point in open space';
    return { to: { x: point.x, y: point.y }, name, anchor: pointAnchor(hexKey.value, point, name), typed: null, own: false };
}

/** The place the plotter is on, as a waypoint; or the words for why there is none. */
const aimPlace = computed((): { waypoint: Waypoint } | { note: string } => {
    if (!live.value) return { note: '' };
    const under = hover.value;
    let waypoint: Waypoint | null = null;
    if (stepped.value) waypoint = bodyWaypoint(stepped.value);
    else if (!under) return { note: 'Pointer off the picture' };
    else if ('blank' in under) return { note: 'No reading here' };
    else if ('ship' in under) {
        const found = campaign.records[under.ship];
        return { note: (found ? found.name : 'A ship') + (under.ship === selectedShip.value ? ': press to release' : ': press to take it') };
    } else waypoint = 'key' in under ? bodyWaypoint(under.key) : pointWaypoint(under.point);
    return waypoint ? { waypoint } : { note: 'No reading here' };
});

/** The same as the next waypoint a press would lay: the body the course already stands on is not a leg. */
const aim = computed((): { waypoint: Waypoint } | { note: string } => {
    const at = aimPlace.value;
    if ('waypoint' in at && typeof at.waypoint.to === 'string' && courseTail.value.end === at.waypoint.to) return { note: at.waypoint.name + ': the course is here' };
    return at;
});

// ---- A waypoint in hand (section 0c): picked up on the picture, dropped on a body or a point ----

/** The waypoint being dragged: its place in the stored route, or in the course being plotted. */
const held = ref<{ which: 'route'; track: number } | { which: 'course'; index: number } | null>(null);
/**
 * The same as a place in the route as it stands now. A stored waypoint is held by its leg's
 * place on the track, because the route shortens under a running clock as legs arrive.
 */
const grab = computed((): { which: 'route' | 'course'; index: number } | null => {
    const h = held.value;
    if (!h) return null;
    return h.which === 'route' ? { which: 'route', index: h.track - shipRoute.value.first } : h;
});
/** The clock ran on and the leg into the waypoint in hand departed: it is history, and the waypoint goes back. */
watch(() => {
    const g = grab.value;
    return g !== null && g.which === 'route' && g.index < routeFixed(shipRoute.value);
}, (departed) => {
    if (!departed) return;
    held.value = null;
    showToast('That leg has already departed.');
});

function onWayGrab(from: 'route' | 'preview', index: number): void {
    held.value = from === 'route' || index < lead.value ? { which: 'route', track: shipRoute.value.first + index } : { which: 'course', index: index - lead.value };
}

/**
 * The course, or the route's tail, as it would be with the waypoint in hand put where the
 * plotter is. Null while there is no such place (off the picture, on a ship, on the place
 * the leg starts from or the next one ends at).
 */
const drag = computed((): { which: 'course'; waypoints: Waypoint[] } | { which: 'route'; tail: EditedTail } | null => {
    const g = grab.value;
    const at = aimPlace.value;
    const accel = plotAccel.value;
    if (!g || accel === null || !('waypoint' in at)) return null;
    if (g.which === 'course') {
        const list = waypoints.value;
        if (!list[g.index]) return null;
        const before = g.index === 0 ? courseStart.value.end : list[g.index - 1].to;
        const after = list[g.index + 1] ? list[g.index + 1].to : null;
        if (samePlace(before, at.waypoint.to) || samePlace(after, at.waypoint.to)) return null;
        return { which: 'course', waypoints: movedWaypoint(list, g.index, at.waypoint) };
    }
    const legs = shipRoute.value.legs;
    if (!legs[g.index] || samePlace(endOf(legs[g.index].from), at.waypoint.to)) return null;
    if (legs[g.index + 1] && samePlace(endOf(legs[g.index + 1].to), at.waypoint.to)) return null;
    const tail = editedTail(shipRoute.value, g.index, { move: at.waypoint }, accel, distanceBetween, endOf, anchorName);
    return tail ? { which: 'route', tail } : null;
});

/** The leg into the waypoint in hand, as it would be. */
const dragLeg = computed((): PlannedLeg | null => {
    const g = grab.value;
    const d = drag.value;
    if (!g || !d) return null;
    return d.which === 'course' ? planned.value[g.index] ?? null : d.tail.planned[0] ?? null;
});

/** One change to the stored route, written at once with one Undo (campaign/track.ts replaceLegsFrom); its refusals are shown as they are. */
function writeTail(tail: EditedTail | null, said: string): void {
    const id = selectedShip.value;
    const track = shipRecord.value ? trackOf(shipRecord.value) : null;
    if (!id || !track || !tail) return;
    if (!tail.all) {
        showToast('A leg of that route has no distance known here: the route is as it was.');
        return;
    }
    const before = track.slice(tail.index);
    const index = tail.index;
    // The route's legs from the change on, then the jump and whatever follows it, moved in time: one write.
    const result = replaceLegsFrom(id, index, tail.all, shownDays.value);
    if (!result.ok) {
        showToast(result.message);
        return;
    }
    showToast(said, {
        action: {
            label: 'Undo',
            run: () => {
                const back = replaceLegsFrom(id, index, before, shownDays.value);
                if (!back.ok) showToast(back.message);
            },
        },
    });
}

/** The waypoint in hand is let go: where the plotter is, or back where it was. */
function onWayDrop(moved: boolean): void {
    const g = grab.value;
    const d = drag.value;
    held.value = null;
    if (!moved || !g || !d) return;
    if (d.which === 'course') {
        waypoints.value = d.waypoints;
        return;
    }
    const leg = d.tail.planned[0];
    writeTail(d.tail, 'Waypoint ' + (g.index + 1) + ' moved to ' + (leg ? leg.waypoint.name : 'a new place') + '.');
}

/** A stored waypoint removed from the console: the legs either side are joined. */
function removeRouteWaypoint(index: number): void {
    const accel = plotAccel.value;
    const leg = shipRoute.value.legs[index];
    if (accel === null || !leg) return;
    writeTail(editedTail(shipRoute.value, index, { remove: true }, accel, distanceBetween, endOf, anchorName), 'Waypoint ' + (index + 1) + ' removed: ' + anchorName(leg.to) + '.');
}

/** A stored waypoint sent to another body from the console. */
function retargetRoute(index: number, key: string): void {
    const accel = plotAccel.value;
    const next = bodyWaypoint(key);
    const leg = shipRoute.value.legs[index];
    if (accel === null || !next || !leg || samePlace(endOf(leg.to), key) || samePlace(endOf(leg.from), key)) return;
    writeTail(editedTail(shipRoute.value, index, { move: next }, accel, distanceBetween, endOf, anchorName), 'Waypoint ' + (index + 1) + ' moved to ' + next.name + '.');
}

/** A plotted waypoint removed: one left standing on the place before it goes with it. */
function removeWaypointAt(index: number): void {
    const out: Waypoint[] = [];
    let before = courseStart.value.end;
    waypoints.value.forEach((item, at) => {
        if (at === index || samePlace(before, item.to)) return;
        out.push(item);
        before = item.to;
    });
    waypoints.value = out;
}

/** A plotted waypoint sent to another body from the console. */
function retargetWaypoint(index: number, key: string): void {
    const next = bodyWaypoint(key);
    const list = waypoints.value;
    if (!next || !list[index]) return;
    const before = index === 0 ? courseStart.value.end : list[index - 1].to;
    const after = list[index + 1] ? list[index + 1].to : null;
    if (samePlace(before, key) || samePlace(after, key)) return;
    waypoints.value = movedWaypoint(list, index, next);
}

/** The stored route in the console's words; while one of its waypoints is in hand, the legs from there on as they would be. */
const routeRows = computed(() => {
    const stored = shipRoute.value;
    if (!stored.legs.length) return null;
    const d = drag.value;
    const tail = d && d.which === 'route' ? d.tail : null;
    const fixed = routeFixed(stored);
    const live = plotAccel.value !== null;
    const rows = stored.legs.slice(0, tail ? tail.at : stored.legs.length).map((leg, index) => {
        const to = endOf(leg.to);
        return {
            n: index + 1,
            to: typeof to === 'string' ? to : '',
            name: anchorName(leg.to),
            estimate: (leg.accelG ? leg.accelG + ' G \u00B7 ' : '') + toGoWords(leg.arrives - leg.departs),
            arrives: whenWords(leg.arrives),
            state: (index === 0 && stored.underway ? 'underway' : 'planned') as 'underway' | 'planned' | 'moving',
            editable: live && index >= fixed,
        };
    });
    for (const leg of tail ? tail.planned : []) {
        rows.push({
            n: leg.n,
            to: typeof leg.waypoint.to === 'string' ? leg.waypoint.to : '',
            name: leg.waypoint.name,
            estimate: leg.settled ? formatDistance(leg.settled.km, AU_KM) + ' \u00B7 ' + hoursWords(leg.settled.hours, leg.settled.settled) : 'Distance unknown',
            arrives: leg.arrives === null ? '' : whenWords(leg.arrives),
            state: 'moving',
            editable: false,
        });
    }
    return { rows, note: '' };
});

/**
 * What follows the route on the track (a jump and every leg after it), as rows that are
 * not picked up. Their dates are shown as they would be: after the waypoint in hand, or
 * after the course being plotted (course.ts onwardLegs).
 */
const onward = computed(() => {
    const stored = shipRoute.value;
    if (!stored.after.length) return null;
    const d = drag.value;
    const g = plotAccel.value;
    let legs = stored.after;
    if (d && d.which === 'route') legs = d.tail.after;
    else {
        const staged = g === null ? null : courseLegs(planned.value, g);
        if (staged && staged.length) legs = appendedTail(stored, staged).after;
    }
    const base = stored.legs.length + waypoints.value.length;
    const rows = legs.map((leg, index) => ({
        n: base + index + 1,
        name: (leg.mode === 'jump' ? 'Jump to ' : '') + anchorName(leg.to),
        estimate: (leg.mode === 'jump' ? Math.round((leg.arrives - leg.departs) * 24) + ' h' : toGoWords(leg.arrives - leg.departs)) + ' \u00B7 departs ' + whenWords(leg.departs),
        arrives: whenWords(leg.arrives),
        moved: !stored.after[index] || stored.after[index].departs !== leg.departs,
    }));
    return { rows, note: 'These follow the course: each keeps its own duration and moves in time with it.' };
});

const bodyOptions = computed(() => chips.value.flatMap((chip) => [{ key: chip.key, name: chip.name }, ...chip.moons.map((moon) => ({ key: moon.key, name: moon.name }))]));

/** The leg to the place under the plotter: one settle, from the ship or the last waypoint. Null where there is no place or no start. */
const aimLeg = computed((): PlannedLeg | null => {
    const at = aim.value;
    const g = plotAccel.value;
    const tail = courseTail.value;
    if (grab.value || !('waypoint' in at) || g === null || tail.departs === null) return null;
    return planCourse({ anchor: tail.anchor, end: tail.end, departs: tail.departs }, [at.waypoint], g, distanceBetween)[0] ?? null;
});

/** The console's live figures. */
const here = computed(() => {
    const leg = grab.value ? dragLeg.value : aimLeg.value;
    if (!leg || !leg.settled || leg.arrives === null) return null;
    return {
        name: leg.waypoint.name,
        distance: formatDistance(leg.settled.km, AU_KM),
        time: hoursWords(leg.settled.hours, leg.settled.settled),
        arrives: whenWords(leg.arrives),
    };
});
const hereNote = computed(() => {
    if (grab.value) {
        const place = aimPlace.value;
        return 'note' in place ? place.note : place.waypoint.name + ': not a place for this waypoint';
    }
    const at = aim.value;
    if ('note' in at) return at.note;
    if (courseTail.value.departs === null) return 'Waiting on the hours of the leg before';
    return at.waypoint.name + ': no distance known';
});

/** The course in the console's words. */
const course = computed(() => {
    const legs = planned.value;
    const g = plotAccel.value;
    if (!legs.length || g === null) return null;
    const rows = legs.map((leg) => {
        let estimate = '';
        if (leg.departs === null) estimate = 'Waiting on the hours of the leg before';
        else if (leg.settled) estimate = formatDistance(leg.settled.km, AU_KM) + ' · ' + hoursWords(leg.settled.hours, leg.settled.settled);
        else estimate = 'Distance unknown: type the hours';
        const body = typeof leg.waypoint.to === 'string';
        return {
            n: lead.value + leg.n,
            to: body ? leg.waypoint.to as string : '',
            name: leg.waypoint.name,
            hours: leg.shown,
            typed: leg.waypoint.own,
            estimate,
            arrives: leg.arrives === null ? '' : whenWords(leg.arrives),
            title: leg.settled && body ? 'Measured to where ' + leg.waypoint.name + ' will be at ' + whenWords(leg.settled.arrives) + '.' : '',
        };
    });
    const totals = courseTotals(legs);
    const words = [
        totals.km === null ? '' : formatDistance(totals.km, AU_KM),
        totals.hours === null ? '' : hoursWords(totals.hours, totals.settled),
    ].filter(Boolean).join(' · ');
    const count = legs.length === 1 ? '1 leg' : legs.length + ' legs';
    return {
        rows,
        total: count + (totals.hours === null ? ' · some legs still need their hours' : ' · ' + words),
        arrives: totals.arrives === null ? '' : whenWords(totals.arrives),
        fuel: flightFuelWords(g, totals.hours),
        ready: courseReady(legs),
        typed: waypoints.value.some((item) => item.own),
    };
});

/**
 * What the picture is told of the course (the renderer places everything from dates and a
 * key or a point): every dated leg and then the leg to the place under the plotter, the last
 * carrying the arrival tag. So the ghosts move as the pointer moves, and rest at the last
 * waypoint's arrival where the plotter has no place. Null with nothing to show.
 */
const flightPreview = computed(() => {
    const plan = searchPlan.value;
    const tag = (leg: PlannedLeg): string => shortLabel(leg.waypoint.name, plan ? plan.name : '') + (leg.arrives === null ? '' : ' \u00B7 ' + whenWords(leg.arrives));
    // The picture draws a preview over the route from the first waypoint that differs, so the preview starts with the route's own legs.
    const kept = (routeTold.value ?? []).map((leg) => ({ ...leg, tag: undefined }));
    const d = drag.value;
    if (d && d.which === 'route') return [...kept.slice(0, d.tail.at), ...coursePreview(d.tail.planned, tag)];
    const legs = planned.value;
    const next = aimLeg.value;
    const dated = legs.every((leg) => leg.arrives !== null);
    const all = next && dated ? [...legs, { ...next, n: legs.length + 1 }] : legs;
    const shown = coursePreview(all, tag);
    if (!shown.length) return null;
    return lead.value ? [...kept.slice(0, lead.value), ...shown] : shown;
});

/** Takes the selected ship in hand, or lets it go. The thrust offered is the one last used for that ship; the first time there is none. */
function setPlotting(on: boolean): void {
    if (on && !canPlot.value) return;
    plotting.value = on;
    waypoints.value = [];
    stepped.value = null;
    held.value = null;
    const id = selectedShip.value;
    const record = shipRecord.value;
    plotAccel.value = on && id ? thrustSet.get(id) ?? (record ? lastThrust(trackOf(record)) : null) : null;
    if (on && plotAccel.value === null) void nextTick(() => { if (consoleEl.value) consoleEl.value.focusThrottle(); });
}

/**
 * A ship pressed: its chip, its tag or its mark on the picture. It is selected and taken in
 * hand; the ship already in hand, pressed again, is released (it stays selected).
 */
function takeShip(id: string): void {
    if (plotting.value && id === selectedShip.value) {
        setPlotting(false);
        return;
    }
    selectedShip.value = id;
    setPlotting(true);
}

function setThrust(g: number): void {
    plotAccel.value = g;
    if (selectedShip.value) thrustSet.set(selectedShip.value, g);
}

/** Every body as a destination, in the body list's order, each world's moons after it. */
const stepKeys = computed(() => chips.value.flatMap((chip) => [chip.key, ...chip.moons.map((moon) => moon.key)]));

/** The keyboard's plotter: the next body, or the one before, round and round; the body the course stands on is passed over. */
function stepBody(by: 1 | -1): void {
    const keys = stepKeys.value;
    if (!live.value || !keys.length) return;
    const at = aim.value;
    const on = 'waypoint' in at && typeof at.waypoint.to === 'string' ? at.waypoint.to : stepped.value;
    let index = on ? keys.indexOf(on) : (by > 0 ? -1 : 0);
    for (let i = 0; i < keys.length; i += 1) {
        index = (index + by + keys.length) % keys.length;
        if (keys[index] !== courseTail.value.end) break;
    }
    stepped.value = keys[index];
}

/** The place under the plotter becomes the next waypoint, as a press on the picture there does. */
function commitAim(): void {
    const at = aim.value;
    if ('waypoint' in at) addWaypoint(at.waypoint);
}

function typeLegHours(index: number, hours: number | null): void {
    waypoints.value = waypoints.value.map((item, at) => (at === index ? { ...item, own: true, typed: hours } : item));
}

/** Every leg's hours go back to following its estimate. */
function useEstimate(): void {
    waypoints.value = waypoints.value.map((item) => ({ ...item, own: false, typed: null }));
}

function addWaypoint(next: Waypoint): void {
    waypoints.value = [...waypoints.value, next];
    stepped.value = null;
}

/** A body pressed while plotting: the next waypoint. The body the course already stands on is not a leg. */
function setDestination(key: string): void {
    const next = live.value ? bodyWaypoint(key) : null;
    if (!next || courseTail.value.end === key) return;
    addWaypoint(next);
}

/** A press on empty picture while plotting: that point is the next waypoint. */
function setDestinationPoint(point: { x: number; y: number }): void {
    if (live.value) addWaypoint(pointWaypoint(point));
}

function removeLastWaypoint(): void {
    if (waypoints.value.length) waypoints.value = waypoints.value.slice(0, -1);
}

function clearCourse(): void {
    waypoints.value = [];
}

/** A speed step's toast is a glance, not a notice. */
const SPEED_TOAST_MS = 1500;
let speedToast: number | null = null;

/** The speed, a step at a time from the keyboard; the toast says where it is, since the slider may be out of sight. */
function nudgeSpeed(direction: 1 | -1): void {
    const next = stepSpeed(speed.value, direction);
    if (next === speed.value) return;
    speed.value = next;
    // One speed toast at a time: a run of steps must not push a toast with an Undo off the strip.
    if (speedToast !== null) dismissToast(speedToast);
    speedToast = showToast('Speed: ' + speedText(next) + '.', { ms: SPEED_TOAST_MS });
}

/** The next ship in this system, round and round: the keyboard's way to what a tag or a mark selects. */
function nextShip(): void {
    const list = ships.value;
    if (!list.length) return;
    const at = list.findIndex((ship) => ship.id === selectedShip.value);
    selectedShip.value = list[(at + 1) % list.length].id;
    setPlotting(true);
}

/**
 * "Add course": the legs are written in order, each departing when the one before arrives;
 * one toast, and its Undo takes them all back. Then the view is ready to play: plotting is
 * off, the clock stands on the course's departure, and Play is one press.
 */
function addCourse(): void {
    const g = plotAccel.value;
    const legs = g === null ? null : courseLegs(planned.value, g);
    const id = selectedShip.value;
    if (!legs || !id) return;
    const count = legs.length;
    const stored = shipRoute.value;
    const track = shipRecord.value ? trackOf(shipRecord.value) : null;
    let undo: () => void;
    if (stored.after.length && track) {
        // A jump follows: the new legs go in before it, and it and what is after it move in time. One write, one Undo.
        const tail = appendedTail(stored, legs);
        const before = track.slice(tail.index);
        const result = replaceLegsFrom(id, tail.index, tail.all, shownDays.value);
        if (!result.ok) {
            showToast(result.message);
            return;
        }
        undo = () => {
            const back = replaceLegsFrom(id, tail.index, before, shownDays.value);
            if (!back.ok) showToast(back.message);
        };
    } else {
        let written = 0;
        for (const leg of legs) {
            const result = appendLeg(id, leg);
            if (!result.ok) {
                for (let i = 0; i < written; i += 1) removeLastLeg(id);
                showToast(result.message);
                return;
            }
            written += 1;
        }
        undo = () => {
            for (let i = 0; i < count; i += 1) {
                const back = removeLastLeg(id);
                if (!back.ok) {
                    showToast(back.message);
                    return;
                }
            }
        };
    }
    const first = legs[0];
    const last = legs[legs.length - 1];
    showToast((count === 1 ? 'Leg added: ' : 'Course added, ' + count + ' legs: ') + anchorName(first.from) + ' \u2192 ' + anchorName(last.to) + ', arriving ' + whenWords(last.arrives) + '.', {
        action: { label: 'Undo', run: undo },
    });
    setPlotting(false);
    moved = true;
    shuttle.value = 0;
    paused.value = true;
    setDays(first.departs);
    writeLink();
    void nextTick(() => {
        const play = rootEl.value ? rootEl.value.querySelector<HTMLElement>('[data-command="orbit-play"]') : null;
        if (play) play.focus();
    });
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

/** The chart's sectors and their places on the grid (the truth overview), for the hexes between two systems. */
const sectorGrid = shallowRef<TruthOverview | null>(null);
watch(version, (now) => {
    if (!now) return;
    void client.overview(now).then((found) => { if (version.value === now) sectorGrid.value = found; }, () => { /* the estimate line stays hidden */ });
}, { immediate: true });

/** The hexes between this system and the destination (map/geometry.ts parsecsBetween), for the parsecs and the fuel; null until the chart's overview is in. */
const jumpParsecs = computed((): number | null => {
    const target = jumpTarget.value;
    const grid = sectorGrid.value;
    if (!target || !grid) return null;
    return parsecsBetween(hexKey.value, target.slug + '/' + target.hex, (name) => {
        const sector = grid.sectors.find((item) => item.slug === name);
        return sector ? { sx: sector.x, sy: sector.y } : null;
    });
});
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

/** Whether the selected ship may jump from where it is: at rest at a point outside every 100D circle (ship_list.ts jumpStanding). */
const standing = computed(() => jumpStanding(shipPosition.value, shipOutside.value));

/**
 * Jump, from where the ship is: it holds at a point outside every 100D circle, and the jump
 * leg's `from` is that point. (The part 1 interim, which cut a flight short and stepped to
 * its destination body, is gone; a track that already has a cut flight keeps it as written.)
 */
function jump(): void {
    const target = jumpTarget.value;
    const id = selectedShip.value;
    const position = shipPosition.value;
    if (!target || !id || !position || 'fraction' in position || !standing.value.can || jumpHours.value === null) return;
    const now = shownDays.value;
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

/** Back to the map on the same system and body. The pane is kept exactly as it is: the campaign, a record, the party, the dossier, or shut. */
function backToMap(): void {
    void router.push({
        path: dossierPath(slug.value, hex.value, selectedKey.value),
        query: withQuery(route.query, {}),
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

/** Escape: the drawer first, then a popover, then the ship in hand (its last waypoint, then the ship), then the selected body, then back to the map. */
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
    // A ship in hand: the last waypoint goes, one press at a time; with none left, the ship is released.
    if (plotting.value) {
        if (waypoints.value.length) removeLastWaypoint();
        else setPlotting(false);
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
        orbitCommand('orbit-week-back', backWeek, () => skipWeeks(shownDays.value, -1) >= 0),
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
        orbitCommand('orbit-release', () => { setPlotting(false); }, () => plotting.value),
        orbitCommand('orbit-thrust', () => { if (!plotting.value) setPlotting(true); void nextTick(() => { if (consoleEl.value) consoleEl.value.focusThrottle(); }); }, () => canPlot.value),
        orbitCommand('orbit-plot-next-body', () => { stepBody(1); }, () => live.value && stepKeys.value.length > 0),
        orbitCommand('orbit-plot-prev-body', () => { stepBody(-1); }, () => live.value && stepKeys.value.length > 0),
        orbitCommand('orbit-plot-commit', commitAim, () => live.value && 'waypoint' in aim.value),
        orbitCommand('orbit-add-leg', addCourse, () => !!course.value && course.value.ready),
        orbitCommand('orbit-waypoint-remove', () => { if (consoleEl.value) consoleEl.value.removeFocused(); }, () => live.value && (waypoints.value.length > 0 || shipRoute.value.legs.length > routeFixed(shipRoute.value))),
        orbitCommand('orbit-course-undo', removeLastWaypoint, () => plotting.value && waypoints.value.length > 0),
        orbitCommand('orbit-course-clear', clearCourse, () => plotting.value && waypoints.value.length > 0),
        orbitCommand('orbit-ship-next', nextShip, () => ships.value.length > 1),
        orbitCommand('orbit-slower', () => { nudgeSpeed(-1); }),
        orbitCommand('orbit-faster', () => { nudgeSpeed(1); }),
        orbitCommand('orbit-plot-estimate', useEstimate, () => plotting.value && waypoints.value.some((item) => item.own)),
        orbitCommand('orbit-jump-roll', rollJump, () => jumpTarget.value !== null),
        orbitCommand('orbit-jump', jump, () => standing.value.can && jumpTarget.value !== null && jumpHours.value !== null),
        ...(LINEUP_SHOWN ? [registerCommand({ ...PARKED_COMMANDS[0], keys: [], run: () => { openDrawer('time', () => { setPop('lineup', true); }); }, runnable: () => searchPlan.value !== null })] : []),
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
            @go-campaign="goCampaign"
            @date="drawer === 'time' ? closeDrawer() : openDrawer('time', () => { if (timeEl) timeEl.focusDate(); })"
          />
        </template>
        <template #tools>
          <DrawerTabs ref="tabsEl" :open="drawer" :narrow="compact" @toggle="toggleTab" />
        </template>
      </OrbitHeader>
      <div ref="stageBox" class="orbit-stage" :class="{ 'is-narrow': narrow, 'is-plotting': live, 'has-drawer': drawer !== '' }" :style="{ '--drawer-height': drawerHeight + 'px', '--flight-strip-height': (flightHeight ? flightHeight + 8 : 0) + 'px' }" :data-state="state" :data-ship="shipOutside === null ? 'off' : (shipOutside ? 'outside' : 'inside')" :data-ship-at="shipAt">
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
            @set-campaign="setAsCampaignDate"
            @week="advanceWeek"
            @week-back="backWeek"
            @days="typedDays"
            @speed="speed = $event"
            @scrub="scrub"
            @shuttle="shuttleTo"
          >
            <template #lineup>
              <div v-if="LINEUP_SHOWN && searchPlan" class="orbit-lineup-pop" data-command="orbit-lineup">
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
            :title="canPlot ? 'The selected ship’s nav console: set the thrust, then press the picture to lay waypoints (P)' : 'Plotting needs a ship in this system'"
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
          :plotting="live"
          :plot-from="selectedShip"
          :survey-elsewhere="dossierOpen && selectedKey !== null"
          :ship-tags="tracks !== null"
          :ship-notes="shipNotes"
          @ship="takeShip"
          @plot-hover="onPlotHover"
          @way-grab="onWayGrab"
          @way-drop="onWayDrop"
          :route="routeTold"
          :way-fixed="routeFixed(shipRoute)"
          :preview-fixed="lead ? routeFixed(shipRoute) : 0"
          :preview-laid="lead + waypoints.length"
          @pick="pickBody"
          :preview="flightPreview"
          @plot="setDestination"
          @plot-point="setDestinationPoint"
        >
          <template #overlay>
            <!-- The K12 place, on the picture: the status strip with Jump, the ship list, the jump destination and the ship's nav console. Signed in with a campaign only. -->
            <div ref="flightEl" class="orbit-flight">
              <ShipStrip
                v-if="canSetDate && state === 'ready'"
                :ships="ships"
                :selected="selectedShip"
                :party-vessel-id="partyVesselId"
                :status="shipStatus"
                :standing="standing"
                :jump-target="jumpTarget"
                :last-opened="lastOpened"
                :jump-hours="jumpHours"
                :jump-roll="jumpRoll && !jumpOwn ? rollWords(jumpRoll) : ''"
                :jump-estimate="jumpEstimate"
                :narrow="narrow"
                @select="takeShip"
                @jump-hours="typeJumpHours"
                @roll-again="rollJump"
                @pick-on-map="pickOnMap"
                @use-last="jumpTarget = lastOpened"
                @clear-target="jumpTarget = null"
                @jump="jump"
              >
                <template #console>
                  <NavConsole
                    v-if="plotting && shipRecord"
                    ref="consoleEl"
                    :ship="shipRecord.name"
                    :party="selectedShip === partyVesselId"
                    :accel-g="plotAccel"
                    :here="here"
                    :here-note="hereNote"
                    :here-label="grab ? 'Moving waypoint ' + String((grab.which === 'route' ? 0 : lead) + grab.index + 1).padStart(2, '0') : stepped ? 'Stepped to' : 'Under the pointer'"
                :bodies="bodyOptions"
                :route="routeRows"
                :onward="onward"
                    :can-step="stepKeys.length > 0"
                    :course="course"
                    @accel="setThrust"
                    @leg-hours="typeLegHours"
                    @use-estimate="useEstimate"
                    @add-course="addCourse"
                    @remove-last="removeLastWaypoint"
                    @clear-course="clearCourse"
                    @leg-remove="removeWaypointAt"
                @leg-target="retargetWaypoint"
                @route-remove="removeRouteWaypoint"
                @route-target="retargetRoute"
                @commit="commitAim"
                    @step="stepBody"
                    @release="setPlotting(false)"
                  />
                </template>
              </ShipStrip>
            </div>
          </template>
        </OrbitCanvas>
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
  --toast-top: min(calc(18px + var(--flight-strip-height) + var(--drawer-height, 0px)), calc(100% - 200px));
  --toast-right: 18px;
  --toast-bottom: auto;
  --toast-left: auto;
  --toast-max: min(460px, calc(100% - 36px));
}

/* The right-hand stack (the strip, the ship list, the destination row, the nav console, then
   the toasts): one right edge, the picture's 18px gutter, and 18px under the top of the
   picture or under an open drawer, moving with the drawer as the info card at the left does. */
.orbit-flight {
  position: absolute;
  top: calc(18px + var(--drawer-height, 0px));
  right: 18px;
  z-index: 3;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  max-width: calc(100% - 36px);
  /* It never leaves the picture: 18px under the top or the drawer, and clear of Fit at the foot. The console's legs give way first. */
  max-height: calc(100% - 18px - var(--drawer-height, 0px) - 60px);
  pointer-events: none;
  transition: top var(--t-base) var(--ease-out);
}

.orbit-stage > .toasts {
  transition: top var(--t-base) var(--ease-out);
}

/* A drawer closes faster than it opens; the stack follows it. */
.orbit-stage:not(.has-drawer) .orbit-flight,
.orbit-stage:not(.has-drawer) > .toasts {
  transition-duration: var(--t-fast);
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
  .orbit-card,
  .orbit-stage .orbit-flight,
  .orbit-stage:not(.has-drawer) .orbit-flight,
  .orbit-stage > .toasts,
  .orbit-stage:not(.has-drawer) > .toasts {
    transition: none;
  }
}
</style>
