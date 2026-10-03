// =============================================================================
// CORE.JS - Application State & Coordinate Math
// =============================================================================

// -----------------------------------------------------------------------------
// Global Constants
// -----------------------------------------------------------------------------
const APP_VERSION = "v0.18.0";
const APP_BANNER = "v0.18.0: Campaign Atlas and system inspection";
window.campaignAtlas = { schemaVersion: 1, records: {}, assets: {} };

// -----------------------------------------------------------------------------
// Application State
// -----------------------------------------------------------------------------

// Camera state (Centered on Sector R by default for fresh instances)
cameraX = 8400 - (window.innerWidth / 2);
cameraY = 8660 - (window.innerHeight / 2);
zoom = 1.0;

/**
 * Re-centers the camera on the middle of the current grid at 1:1 zoom.
 * Call this whenever gridWidth or gridHeight changes (e.g. Universe importer).
 */
function centerCameraOnGrid() {
    const centerQ = Math.floor(gridWidth * 32 / 2);
    const centerR = Math.floor(gridHeight * 40 / 2);
    const size = baseHexSize;
    const widthStep = (3 / 2) * size;
    const heightStep = Math.sqrt(3) * size;
    const offset = (centerQ & 1) ? 0.5 : 0;
    const px = widthStep * centerQ;
    const py = heightStep * (centerR + offset);
    cameraX = px - window.innerWidth / 2;
    cameraY = py - window.innerHeight / 2;
    zoom = 1.0;
}

// Mouse tracking
currentMouseX = 0;
currentMouseY = 0;

// Alt+Drag Route Creation State
isAltDragging = false;
altDragStartId = null;
altDragType = 'Trade';
altDragRouteId = null;

// Key state tracking
keysDown = new Set();

// Selection state
selectedHexes = new Set();

// Orange paint-select, or the teal inspected system if nothing is painted.
function currentActionHexes() {
    if (selectedHexes.size) return [...selectedHexes];
    const id = window.SystemInspector?.inspectedHexId?.();
    return id ? [id] : [];
}

// UI Display state
showSubsectorBorders = true;
devView = false;
hideNoPlanetSystems = true;
showSectorNames = true;
window.borderFillEnabled = true;
window.borderNamesEnabled = false;
window.regionNamesEnabled = false;

// Sector name store — keyed by integer sector number
window.sectorNames = {};
window.sectorReview = {};

// Subsector name store — keyed "sectorNum-letter", e.g. "37-C" → "Regina".
// Filled from TravellerMap metadata <Subsector Index="A">…</Subsector> on OTU
// / XML import. Absent keys fall back to "Subsector C".
window.subsectorNames = {};

function subsectorNameKey(sectorNum, letter) {
    const L = String(letter || '').toUpperCase();
    if (!/^[A-P]$/.test(L)) return null;
    const n = parseInt(sectorNum, 10);
    if (!Number.isFinite(n) || n < 1) return null;
    return n + '-' + L;
}

function getSubsectorName(sectorNum, letter) {
    const key = subsectorNameKey(sectorNum, letter);
    const n = key && window.subsectorNames && window.subsectorNames[key];
    const trimmed = n && String(n).trim();
    const L = String(letter || '').toUpperCase();
    return trimmed || (`Subsector ${L}`);
}

function getSubsectorLabel(sectorNum, letter) {
    const key = subsectorNameKey(sectorNum, letter);
    const n = key && window.subsectorNames && window.subsectorNames[key];
    const trimmed = n && String(n).trim();
    const L = String(letter || '').toUpperCase();
    return trimmed ? `${trimmed} (${L})` : `Subsector ${L}`;
}

function setSubsectorName(sectorNum, letter, name) {
    const key = subsectorNameKey(sectorNum, letter);
    if (!key) return;
    if (!window.subsectorNames) window.subsectorNames = {};
    const trimmed = (name || '').trim();
    if (trimmed) window.subsectorNames[key] = trimmed;
    else delete window.subsectorNames[key];
}

function clearSubsectorNamesForSector(sectorNum) {
    if (!window.subsectorNames) return;
    const n = parseInt(sectorNum, 10);
    if (!Number.isFinite(n)) return;
    const re = new RegExp('^' + n + '-[A-P]$');
    Object.keys(window.subsectorNames).forEach(k => {
        if (re.test(k)) delete window.subsectorNames[k];
    });
}

// Hex state (Map of hexId -> STATE)
hexStates = new Map();

// Route state (Global array of route segment objects)
window.sectorRoutes = [];
window.autoRouteCounter = 0; // Persistent sequential counter for Auto Route group names

// Route definitions (ordered list of named/coloured route lanes)
window.routeDefinitions = [];

/**
 * Colours handed to new routes, in order. A fresh map uses the first two.
 * Further routes from Add route take the next colour not already in use.
 */
function getRouteColorPalette() {
    return ['#016a01', '#ff0000', '#ffff00', '#ff8800', '#00ddff', '#ff44aa', '#aa66ff', '#66aaff', '#aaff44'];
}

/**
 * Routes present on a fresh map. Saved maps keep whatever the Route Manager
 * already has; this list is only the starting pair.
 */
function getDefaultRouteDefinitions() {
    const [xboat, trade] = getRouteColorPalette();
    return [
        { id: 1, name: "XBoat Route",   color: xboat, shortcut: null, visible: true, automationRef: null },
        { id: 2, name: "Trading Route", color: trade, shortcut: null, visible: true, automationRef: null }
    ];
}

// System Naming State
namePool = [];
usedNames = new Set(); // Reset every load for machine-agnostic determinism

// Hex properties - Renderer needs this immediately
baseHexSize = 50;

// Filter bypass (Shift+F). Session-only and deliberately NOT part of hexStates:
// it is a way of looking at the map, not a property of it, so it must never be
// saved, undone, or restored with a sector. The filter itself keeps running —
// state.isHiddenByFilter stays truthful and route generation keeps honouring it
// — only the renderer looks the other way. See toggleFilterSuspension().
window.filterSuspended = false;

// Grid dimensions — default 7×5 (35 sectors).
// These are runtime variables; the Universe importer will change them.
gridWidth  = 7;
gridHeight = 5;

// Generation Trace State
const MAX_GEN_TRACES = 5;
let genTraces = [];
let currentTrace = null;
let genTraceCount = 0;
let activeTrace = null;

// Seeded Random Generation
let masterSeed = localStorage.getItem('traveller_gen_seed') || "TravellerMagnus";
let rng = mulberry32(hashString(masterSeed));

function hashString(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
        h = Math.imul(h ^ str.charCodeAt(i), 16777619);
    }
    return h >>> 0;
}

function mulberry32(a) {
    return function () {
        let t = a += 0x6D2B79F5;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
}

function setRandomSeed(seedString) {
    masterSeed = seedString || "TravellerMagnus";
    localStorage.setItem('traveller_gen_seed', masterSeed);
    rng = mulberry32(hashString(masterSeed));
    usedNames.clear(); // Important: reset used names on seed change
    console.log(`Master Seed set to: "${masterSeed}" (RNG and Names Reset)`);
}

function reseedForHex(hexId) {
    const hexSeed = hashString(masterSeed + "-" + (hexId || "0000"));
    rng = mulberry32(hexSeed);
}

function shouldGeneratePopulation(hexId) {
    const freq = (typeof window !== 'undefined' && window.generationPopCheckFrequency !== undefined)
        ? Number(window.generationPopCheckFrequency) : 100;
    if (freq >= 100) return true;
    if (freq <= 0) return false;
    const hash = hashString(masterSeed + '-popcheck-' + (hexId || ''));
    return (hash % 100) < freq;
}

function clampUWP(val, min, max) {
    if (typeof val === 'string' && (val === 'S' || val === 'R' || val === 'GG')) return val;
    const v = Number(val);
    if (isNaN(v)) return min;
    return Math.max(min, Math.min(max, v));
}

// History state
window.undoStack = [];
window.redoStack = [];

/**
 * Undo records the records an action is about to change, not the campaign.
 *
 * @param {string} actionName - label shown by "Undid: …"
 * @param {Object} [opts]
 * @param {string[]} [opts.hexIds] - hexes this action will replace or delete.
 *        Captured before the edit. A missing hex is stored as null.
 * @param {boolean} [opts.routes] - copy window.sectorRoutes (the leg list).
 * @param {boolean} [opts.includeRouteDefinitions] - copy window.routeDefinitions.
 * @param {boolean} [opts.campaignAtlas] - copy the campaign atlas.
 * @param {boolean} [opts.borders] - copy border definitions, assignments, and paths.
 * @param {boolean} [opts.allegiances] - copy allegiance definitions and assignments.
 * @param {boolean} [opts.regions] - copy region definitions and paths.
 */
function _historyClone(value) {
    if (value == null) return null;
    return JSON.parse(JSON.stringify(value));
}

function _historyMapEntries(map) {
    if (!map || typeof map.forEach !== 'function') return [];
    const out = [];
    map.forEach((value, key) => out.push([key, _historyClone(value)]));
    return out;
}

function saveHistoryState(actionName, opts = {}) {
    const hexIds = Array.isArray(opts.hexIds) ? opts.hexIds : null;
    const hasScope = !!(hexIds || opts.routes || opts.includeRouteDefinitions || opts.campaignAtlas
        || opts.borders || opts.allegiances || opts.regions);
    if (!hasScope) {
        console.warn(`[History] "${actionName}" was not recorded. Name the hexes or lists this edit changes.`);
        if (window.dbManager) window.dbManager.scheduleSyncAll();
        return false;
    }
    let stateSnapshot;
    try {
        stateSnapshot = { action: actionName, hexes: [] };
        if (hexIds) {
            for (const id of hexIds) {
                const cur = hexStates.get(id);
                stateSnapshot.hexes.push({ id, before: cur === undefined ? null : _historyClone(cur) });
            }
        }
        // Route names and colours are not on the hex. Copy them only for the
        // action that adds or removes slots, or an undo of a later hex edit
        // would put a renamed route back.
        if (opts.routes) stateSnapshot.routes = _historyClone(window.sectorRoutes || []);
        if (opts.includeRouteDefinitions) stateSnapshot.routeDefinitions = _historyClone(window.routeDefinitions || []);
        if (opts.campaignAtlas) stateSnapshot.campaignAtlas = _historyClone(window.campaignAtlas);
        if (opts.borders) {
            stateSnapshot.borderDefinitions = _historyClone(window.borderDefinitions || []);
            stateSnapshot.borderAssignments = _historyMapEntries(window.hexBorderAssignments);
            stateSnapshot.borderPaths = _historyMapEntries(window.borderPaths);
        }
        if (opts.allegiances) {
            stateSnapshot.allegianceDefinitions = _historyClone(window.allegianceDefinitions || []);
            stateSnapshot.allegianceAssignments = _historyMapEntries(window.hexAllegianceAssignments);
        }
        if (opts.regions) {
            stateSnapshot.regionDefinitions = _historyClone(window.regionDefinitions || []);
            stateSnapshot.regionPaths = _historyMapEntries(window.regionPaths);
        }
    } catch (err) {
        console.warn(`[History] "${actionName}" was not recorded. Its patch was too large to copy for undo.`, err);
        if (window.dbManager) window.dbManager.scheduleSyncAll();
        return false;
    }
    const undoLimit = (gridWidth * gridHeight) > 35 ? 5 : 50;
    window.undoStack.push(stateSnapshot);
    if (window.undoStack.length > undoLimit) window.undoStack.shift();
    window.redoStack = [];

    if (window.dbManager) window.dbManager.scheduleSyncAll();
    return true;
}

function _historyReplaceMap(map, entries) {
    if (!map) return;
    map.clear();
    for (const [key, value] of entries) map.set(key, _historyClone(value));
}

/** Write a patch (or a legacy full-map snapshot) back onto the live stores. */
function applyHistoryPatch(snap) {
    if (!snap) return;
    if (Array.isArray(snap.hexes)) {
        for (const entry of snap.hexes) {
            if (entry.before == null) hexStates.delete(entry.id);
            else hexStates.set(entry.id, _historyClone(entry.before));
        }
    } else if (Array.isArray(snap.hexStates)) {
        hexStates.clear();
        for (const [id, state] of snap.hexStates) hexStates.set(id, _historyClone(state));
    }
    if (snap.routes) window.sectorRoutes = _historyClone(snap.routes);
    if (snap.campaignAtlas) window.campaignAtlas = _historyClone(snap.campaignAtlas);
    if (snap.borderDefinitions) window.borderDefinitions = _historyClone(snap.borderDefinitions);
    if (snap.borderAssignments && window.hexBorderAssignments) _historyReplaceMap(window.hexBorderAssignments, snap.borderAssignments);
    if (snap.borderPaths && window.borderPaths) _historyReplaceMap(window.borderPaths, snap.borderPaths);
    if (snap.allegianceDefinitions) window.allegianceDefinitions = _historyClone(snap.allegianceDefinitions);
    if (snap.allegianceAssignments && window.hexAllegianceAssignments) _historyReplaceMap(window.hexAllegianceAssignments, snap.allegianceAssignments);
    if (snap.regionDefinitions) window.regionDefinitions = _historyClone(snap.regionDefinitions);
    if (snap.regionPaths && window.regionPaths) _historyReplaceMap(window.regionPaths, snap.regionPaths);
}

/** The same shape as snap, filled with the live values, so redo can reverse an undo. */
function captureHistoryInverse(snap) {
    const current = { action: snap.action };
    if (Array.isArray(snap.hexes)) {
        current.hexes = snap.hexes.map(entry => {
            const cur = hexStates.get(entry.id);
            return { id: entry.id, before: cur === undefined ? null : _historyClone(cur) };
        });
    } else if (Array.isArray(snap.hexStates)) {
        current.hexStates = Array.from(hexStates.entries()).map(([id, state]) => [id, _historyClone(state)]);
    }
    if (snap.routes) current.routes = _historyClone(window.sectorRoutes || []);
    if (snap.routeDefinitions) current.routeDefinitions = _historyClone(window.routeDefinitions || []);
    if (snap.campaignAtlas) current.campaignAtlas = _historyClone(window.campaignAtlas);
    if (snap.borderDefinitions) current.borderDefinitions = _historyClone(window.borderDefinitions || []);
    if (snap.borderAssignments) current.borderAssignments = _historyMapEntries(window.hexBorderAssignments);
    if (snap.borderPaths) current.borderPaths = _historyMapEntries(window.borderPaths);
    if (snap.allegianceDefinitions) current.allegianceDefinitions = _historyClone(window.allegianceDefinitions || []);
    if (snap.allegianceAssignments) current.allegianceAssignments = _historyMapEntries(window.hexAllegianceAssignments);
    if (snap.regionDefinitions) current.regionDefinitions = _historyClone(window.regionDefinitions || []);
    if (snap.regionPaths) current.regionPaths = _historyMapEntries(window.regionPaths);
    return current;
}

// -----------------------------------------------------------------------------
// Coordinate Math Functions
// -----------------------------------------------------------------------------

/**
 * Converts a legacy letter-based sector identifier to a zero-based index.
 * Supports the old doubled scheme (AA=26, BB=27 ... ZZ=51).
 * Used only during migration of pre-numeric JSON save files.
 */
function legacySectorLetterToIndex(letter) {
    if (!letter || letter.length === 0) return 0;
    if (letter.length === 1) return letter.toUpperCase().charCodeAt(0) - 65;
    // Old scheme: same letter doubled (AA, BB, CC...)
    return (letter.toUpperCase().charCodeAt(0) - 65) + 26;
}

/**
 * Converts a sector slot label (letter OR numeric string) to a sector number (1-based).
 * Letters use the legacy index mapping; numeric strings are parsed directly.
 */
function sectorSlotToNumber(slot) {
    if (!slot) return 1;
    const n = parseInt(slot, 10);
    if (!isNaN(n)) return n;
    return legacySectorLetterToIndex(slot) + 1;
}

function getHexId(q, r) {
    if (q < 0 || r < 0) return null;
    if (q >= gridWidth * 32 || r >= gridHeight * 40) return null;
    const sectorX  = Math.floor(q / 32);
    const sectorY  = Math.floor(r / 40);
    const sectorNum = sectorY * gridWidth + sectorX + 1;
    const subsectorX = Math.floor((q % 32) / 8);
    const subsectorY = Math.floor((r % 40) / 10);
    const subsectorChar = String.fromCharCode(65 + (subsectorY * 4 + subsectorX));
    const localQ = (q % 32) + 1;
    const localR = (r % 40) + 1;
    return `${sectorNum}-${subsectorChar}-${localQ.toString().padStart(2, '0')}${localR.toString().padStart(2, '0')}`;
}

function pixelToHex(x, y, size) {
    const q_frac = (2.0 / 3.0 * x) / size;
    const r_frac = (-1.0 / 3.0 * x + Math.sqrt(3) / 3.0 * y) / size;
    let q = Math.round(q_frac), r = Math.round(r_frac), s = Math.round(-q_frac - r_frac);
    const q_diff = Math.abs(q - q_frac), r_diff = Math.abs(r - r_frac), s_diff = Math.abs(s - (-q_frac - r_frac));
    if (q_diff > r_diff && q_diff > s_diff) q = -r - s; else if (r_diff > s_diff) r = -q - s;
    return { q: q, r: r + (q - (q & 1)) / 2 };
}

function getHexCoords(hexId) {
    if (!hexId) return null;
    const parts = hexId.split('-');
    if (parts.length < 3) return null;
    const sectorNum = parseInt(parts[0], 10);
    if (isNaN(sectorNum) || sectorNum < 1) return null;
    const sectorX = (sectorNum - 1) % gridWidth;
    const sectorY = Math.floor((sectorNum - 1) / gridWidth);
    const localQ = parseInt(parts[2].substring(0, 2)) - 1;
    const localR = parseInt(parts[2].substring(2, 4)) - 1;
    return { q: sectorX * 32 + localQ, r: sectorY * 40 + localR };
}

// ── Hex vacancy ─────────────────────────────────────────────────────────────
// "Blank" is three different things in hexStates, and code that checks only one
// of them silently disagrees with what the map shows:
//   • no entry at all — a hex nothing has ever touched. The renderer already
//     treats a missing entry as 'BLANK' (see renderer.js).
//   • { type: 'BLANK' } — materialized when a vacant hex is tagged with a
//     region, allegiance, or disclosure level.
//   • { type: 'EMPTY' } — explicitly marked empty by hand, by a generation pass
//     that rolled no system, or by the TSV importer back-filling a sector.
// All three are vacant space. Route code must treat them alike; checking only
// one made whether a feature worked depend on how the sector happened to be
// built (an imported sector gets EMPTY everywhere, a hand-drawn one does not).
//
// Returns false for a malformed id or anything off the grid, so this doubles as
// a validator for typed input.
function isVacantHex(hexId) {
    if (!hexId) return false;
    const coords = getHexCoords(hexId);
    if (!coords || !Number.isFinite(coords.q) || !Number.isFinite(coords.r)) return false;
    // getHexCoords is lenient about malformed ids; the round trip is the guard.
    if (getHexId(coords.q, coords.r) !== hexId) return false;
    const state = hexStates.get(hexId);
    return !state || state.type === 'BLANK' || state.type === 'EMPTY';
}

// Keys on a hex state that are DERIVED VIEW STATE, not map data.
//
// state.isHiddenByFilter is recomputed from the filter form every time
// applyActiveFilters() runs and is meaningless without it. It was nonetheless
// being written to IndexedDB and into saved .json files, because both persist
// hex states whole — so a filter outlived the fields that produced it and the
// map reopened filtered with an empty form (see input_init.js startup).
//
// Startup now recomputes, which fixes the symptom; stripping here stops the
// pollution at source, so a saved map file carries map data only and cannot
// hand someone else a filter they never set.
//
// Returns the ORIGINAL object when there is nothing to strip, so the common
// case allocates nothing.
const HEX_VIEW_STATE_KEYS = ['isHiddenByFilter'];

function stripHexViewState(state) {
    if (!state || typeof state !== 'object') return state;
    let copy = null;
    for (const key of HEX_VIEW_STATE_KEYS) {
        if (key in state) {
            if (!copy) copy = { ...state };
            delete copy[key];
        }
    }
    return copy || state;
}

function getHexDistance(q1, r1, q2, r2) {
    const x1 = q1;
    const z1 = r1 - (q1 - (q1 & 1)) / 2;
    const y1 = -x1 - z1;
    const x2 = q2;
    const z2 = r2 - (q2 - (q2 & 1)) / 2;
    const y2 = -x2 - z2;
    return Math.max(Math.abs(x1 - x2), Math.abs(y1 - y2), Math.abs(z1 - z2));
}

function getHexPixel(q, r) {
    const size = baseHexSize;
    const widthStep = (3 / 2) * size;
    const heightStep = Math.sqrt(3) * size;
    const offset = (q & 1) ? 0.5 : 0;
    return { x: widthStep * q, y: heightStep * (r + offset) };
}

function centerHexInView(hexId) {
    if (!hexId || window.SystemViewer?.isOpen()) return;
    const coords = getHexCoords(hexId);
    if (!coords) return;
    const pixel = getHexPixel(coords.q, coords.r);
    const left = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--workspace-left')) || 68;
    zoom = Math.max(2, Math.min(zoom, 10));
    cameraX = pixel.x - (left + (innerWidth - left) / 2) / zoom;
    cameraY = pixel.y - (70 + (innerHeight - 70) / 2) / zoom;
}

function fitHexesInView(hexIds) {
    if (window.SystemViewer?.isOpen()) return;
    const pixels = [];
    (hexIds || []).forEach(id => {
        const coords = getHexCoords(id);
        if (coords) pixels.push(getHexPixel(coords.q, coords.r));
    });
    if (!pixels.length) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    pixels.forEach(p => {
        minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    });
    const pad = baseHexSize * 2.2;
    minX -= pad; minY -= pad; maxX += pad; maxY += pad;
    const nav = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--workspace-left')) || 68;
    const route = document.getElementById('route-window');
    const routeOpen = route && route.classList.contains('visible');
    let left = routeOpen ? route.getBoundingClientRect().right + 16 : nav + 16;
    const trade = document.getElementById('trade-match');
    let bottom = 16;
    if (trade && !trade.hidden) {
        const rect = trade.getBoundingClientRect();
        const sheet = rect.bottom > window.innerHeight - 24 && rect.top > 120 && rect.width > window.innerWidth * 0.6;
        if (sheet) bottom = Math.max(bottom, window.innerHeight - rect.top + 16);
        else if (rect.right > left) left = rect.right + 16;
    }
    const top = 76;
    const viewW = Math.max(120, window.innerWidth - left - 16);
    const viewH = Math.max(120, window.innerHeight - top - bottom);
    const boxW = Math.max(maxX - minX, baseHexSize);
    const boxH = Math.max(maxY - minY, baseHexSize);
    zoom = Math.max(0.03, Math.min(viewW / boxW, viewH / boxH, 10));
    cameraX = (minX + maxX) / 2 - (left + viewW / 2) / zoom;
    cameraY = (minY + maxY) / 2 - (top + viewH / 2) / zoom;
    requestAnimationFrame(draw);
}

function centerSectorInView(sectorNum) {
    if (window.SystemViewer?.isOpen()) return;
    const n = parseInt(sectorNum, 10);
    if (!Number.isFinite(n) || n < 1) return;
    const sX = (n - 1) % gridWidth;
    const sY = Math.floor((n - 1) / gridWidth);
    const pixel = getHexPixel(sX * 32 + 15, sY * 40 + 19);
    const left = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--workspace-left')) || 68;
    cameraX = pixel.x - (left + (innerWidth - left) / 2) / zoom;
    cameraY = pixel.y - (70 + (innerHeight - 70) / 2) / zoom;
}

const MAX_GRID_WIDTH = 16;
const MAX_GRID_HEIGHT = 8;

function _rewriteHexIdSlot(hexId, oldW, newW) {
    if (!hexId || oldW === newW) return hexId;
    const parts = String(hexId).split('-');
    const oldSlot = parseInt(parts[0], 10);
    if (!Number.isFinite(oldSlot) || oldSlot < 1) return hexId;
    const sX = (oldSlot - 1) % oldW;
    const sY = Math.floor((oldSlot - 1) / oldW);
    const newSlot = sY * newW + sX + 1;
    if (newSlot === oldSlot) return hexId;
    parts[0] = String(newSlot);
    return parts.join('-');
}

function _remapKeyedMap(map, fn) {
    if (!map) return map;
    const next = new Map();
    map.forEach((v, k) => {
        const nk = fn(k);
        if (nk != null) next.set(nk, v);
    });
    return next;
}

function remapAllHexIds(oldW, newW) {
    if (oldW === newW) return;
    remapSectorSlots(oldW, oldSlot => {
        const sX = (oldSlot - 1) % oldW;
        const sY = Math.floor((oldSlot - 1) / oldW);
        return sY * newW + sX + 1;
    });
}

// mapSlot(oldSlot) returns the new slot number, or null to drop the key.
// Used when a column or row is inserted or removed anywhere in the sheet.
function remapSectorSlots(oldW, mapSlot) {
    const fn = hexId => {
        if (hexId == null) return hexId;
        const parts = String(hexId).split('-');
        const oldSlot = parseInt(parts[0], 10);
        if (!Number.isFinite(oldSlot) || oldSlot < 1) return hexId;
        const newSlot = mapSlot(oldSlot);
        if (newSlot == null) return null;
        if (newSlot === oldSlot) return hexId;
        parts[0] = String(newSlot);
        return parts.join('-');
    };
    const mapKey = key => {
        const n = parseInt(key, 10);
        if (!Number.isFinite(n) || n < 1) return key;
        const mapped = mapSlot(n);
        return mapped == null ? null : mapped;
    };
    hexStates = _remapKeyedMap(hexStates, fn);
    selectedHexes = new Set([...selectedHexes].map(fn).filter(Boolean));
    if (window.hexBorderAssignments) window.hexBorderAssignments = _remapKeyedMap(window.hexBorderAssignments, fn);
    if (window.hexAllegianceAssignments) window.hexAllegianceAssignments = _remapKeyedMap(window.hexAllegianceAssignments, fn);
    if (window.sectorRoutes) {
        window.sectorRoutes.forEach(r => {
            if (r.startId) r.startId = fn(r.startId);
            if (r.endId) r.endId = fn(r.endId);
        });
        window.sectorRoutes = window.sectorRoutes.filter(r => r.startId && r.endId);
    }
    if (window.campaignAtlas && window.campaignAtlas.records) {
        Object.values(window.campaignAtlas.records).forEach(rec => {
            if (rec.anchor && rec.anchor.hexId) {
                const next = fn(rec.anchor.hexId);
                if (next) rec.anchor.hexId = next;
            }
        });
    }
    if (window.sectorNames) {
        const next = {};
        Object.keys(window.sectorNames).forEach(k => {
            const mapped = mapKey(k);
            if (mapped != null) next[mapped] = window.sectorNames[k];
        });
        window.sectorNames = next;
    }
    if (window.sectorReview) {
        const next = {};
        Object.keys(window.sectorReview).forEach(k => {
            const mapped = mapKey(k);
            if (mapped != null) next[mapped] = window.sectorReview[k];
        });
        window.sectorReview = next;
    }
    if (window.subsectorNames) {
        const next = {};
        Object.keys(window.subsectorNames).forEach(k => {
            const m = /^(\d+)-([A-P])$/.exec(k);
            if (!m) { next[k] = window.subsectorNames[k]; return; }
            const mapped = mapSlot(parseInt(m[1], 10));
            if (mapped != null) next[mapped + '-' + m[2]] = window.subsectorNames[k];
        });
        window.subsectorNames = next;
    }
    if (window.regionPaths) {
        const next = new Map();
        window.regionPaths.forEach((v, k) => {
            const key = String(k);
            const idx = key.indexOf(':');
            if (idx === -1) { next.set(k, v); return; }
            const n = parseInt(key.slice(0, idx), 10);
            if (!Number.isFinite(n)) { next.set(k, v); return; }
            const mapped = mapSlot(n);
            if (mapped != null) next.set(mapped + key.slice(idx), v);
        });
        window.regionPaths = next;
    }
    window.SystemInspector?.remapHexId?.(fn);
    window.SystemViewer?.remapHexId?.(fn);
    window.invalidateMapDrawCaches?.();
    window.invalidateBorderNamesCache?.();
    window.invalidateBorderGeomCache?.();
    window.invalidateRegionFillCache?.();
}

function slotsInColumn(sX) {
    const out = [];
    for (let sY = 0; sY < gridHeight; sY++) out.push(sY * gridWidth + sX + 1);
    return out;
}

function slotsInRow(sY) {
    const out = [];
    for (let sX = 0; sX < gridWidth; sX++) out.push(sY * gridWidth + sX + 1);
    return out;
}

function countSystemsInSlots(slots) {
    const set = new Set(slots);
    let n = 0;
    hexStates.forEach((state, hexId) => {
        if (state && state.type === 'SYSTEM_PRESENT' && set.has(parseInt(hexId.split('-')[0], 10))) n++;
    });
    return n;
}

function countHexesInSlots(slots) {
    const set = new Set(slots);
    let n = 0;
    hexStates.forEach((_, hexId) => {
        if (set.has(parseInt(hexId.split('-')[0], 10))) n++;
    });
    return n;
}

function purgeSectorSlots(slots) {
    const set = new Set(slots);
    const inSlots = hexId => set.has(parseInt(String(hexId).split('-')[0], 10));
    [...hexStates.keys()].filter(inSlots).forEach(hexId => {
        hexStates.delete(hexId);
        selectedHexes.delete(hexId);
        window.hexBorderAssignments?.delete(hexId);
        window.hexAllegianceAssignments?.delete(hexId);
    });
    if (window.sectorRoutes) {
        window.sectorRoutes = window.sectorRoutes.filter(r => !inSlots(r.startId) && !inSlots(r.endId));
    }
    if (window.campaignAtlas && window.campaignAtlas.records) {
        Object.keys(window.campaignAtlas.records).forEach(id => {
            const rec = window.campaignAtlas.records[id];
            if (rec.anchor && inSlots(rec.anchor.hexId)) delete window.campaignAtlas.records[id];
        });
    }
    slots.forEach(n => {
        delete window.sectorNames[n];
        if (window.sectorReview) delete window.sectorReview[n];
        if (typeof clearSubsectorNamesForSector === 'function') clearSubsectorNamesForSector(n);
        if (window.regionPaths) {
            [...window.regionPaths.keys()].forEach(k => {
                if (String(k).startsWith(n + ':')) window.regionPaths.delete(k);
            });
        }
    });
    window.invalidateMapDrawCaches?.();
    window.invalidateBorderNamesCache?.();
    window.invalidateBorderGeomCache?.();
    window.invalidateRegionFillCache?.();
}

function persistGridChange() {
    window.undoStack = [];
    window.redoStack = [];
    if (!window.dbManager) return;
    window.dbManager.saveGridDimensions?.();
    window.dbManager.saveSectorNames?.();
    window.dbManager.saveSectorReview?.();
    window.dbManager.saveSubsectorNames?.();
    window.dbManager.saveBorderAssignments?.();
    window.dbManager.saveRegionPaths?.();
    window.dbManager.saveRoutes?.();
    window.dbManager.scheduleSyncAll?.();
}

function getMouseWorldCoords(e) {
    return { x: cameraX + e.clientX / zoom, y: cameraY + e.clientY / zoom };
}

// ============================================================================
// AUDITED UTILITIES & LOGGING (FINAL VERSION)
// ============================================================================

// --- Core Math & Dice ---
async function ensureNamesLoaded() { return true; }
function roll1D() { return Math.floor(rng() * 6) + 1; }
function roll2D() { return roll1D() + roll1D(); }
function rollFlux() { return roll1D() - roll1D(); }
function rollD3() { return Math.floor(rng() * 3) + 1; }
function rollND(n) {
    let total = 0;
    for (let i = 0; i < n; i++) total += roll1D();
    return total;
}

function roll3D() {
    return roll1D() + roll1D() + roll1D();
}

function roll4D() {
    return rollND(4);
}

// --- Traveller Extended Hexadecimal (eHex: skips I and O) ---
const EHEX_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

function toEHex(val) {
    if (val === undefined || val === null) return '0';
    if (typeof val === 'string' && (val === 'S' || val === 'R' || val === 'GG')) return val;
    const v = Math.floor(Number(val));
    if (isNaN(v) || v < 0) return '0';
    if (v < 10) return v.toString();
    return EHEX_CHARS[v - 10] || 'Z';
}

function fromEHex(char) {
    if (char === undefined || char === null || char === '') return 0;
    const c = String(char).trim().toUpperCase();
    if (c === 'R') return 0.1;  // CT Ring — sub-integer, distinct from 0 for filter purposes
    if (c === 'S') return 0.5;  // CT Small moon — sub-integer, distinct from 0 for filter purposes
    const ch = c.charAt(0);
    if (ch >= '0' && ch <= '9') return parseInt(ch, 10);
    const idx = EHEX_CHARS.indexOf(ch);
    return idx >= 0 ? idx + 10 : 0;
}

// =====================================================================
// BATCH LOGGING ARCHITECTURE
// =====================================================================

// --- Batch Logging State ---
window.isLoggingEnabled = false;
window.batchLogData = [];
window.logIndentLevel = 0;
let pendingRoll = null; // Deferred roll for math display

function logIndentIn() { window.logIndentLevel++; }
function logIndentOut() { window.logIndentLevel = Math.max(0, window.logIndentLevel - 1); }

function _writeRawLogLine(text) {
    if (!window.isLoggingEnabled) return;
    const indent = "    ".repeat(window.logIndentLevel);
    window.batchLogData.push(indent + text);
}

function flushPendingRoll() {
    if (!pendingRoll) return;
    const p = pendingRoll;
    pendingRoll = null; // Clear to prevent recursion

    if (!window.isLoggingEnabled) return;

    const totalDM = p.dms.reduce((acc, d) => acc + d.val, 0);
    const final = p.val + totalDM;

    if (totalDM !== 0) {
        const sign = totalDM >= 0 ? '+' : '-';
        _writeRawLogLine(`${p.label}: Rolled ${p.type} for ${p.val} ${sign} ${Math.abs(totalDM)} = ${final}`);
    } else {
        _writeRawLogLine(`${p.label}: Rolled ${p.type} for ${p.val}`);
    }

    p.dms.forEach(d => {
        _writeRawLogLine(`  DM (${d.label}): ${d.val >= 0 ? '+' : ''}${d.val}`);
    });
}

function writeLogLine(text) {
    flushPendingRoll();
    if (!window.isLoggingEnabled) return;
    _writeRawLogLine(text);
}

function startTrace(hexId, ruleset, name = null) {
    if (!window.isLoggingEnabled) return;
    writeLogLine(`========================================================`);
    writeLogLine(`SYSTEM: ${hexId}${name ? ' - ' + name : ''} (${ruleset})`);
    writeLogLine(`Master Seed: ${masterSeed} | Hex Hash: ${hashString(masterSeed + "-" + hexId)}`);
    writeLogLine(`========================================================`);
}

function tSection(title) { writeLogLine(`\n--- ${title.toUpperCase()} ---`); }
function tResult(label, value) { writeLogLine(`${label}: ${value}`); }

function tDM(label, value) {
    if (pendingRoll) {
        pendingRoll.dms.push({ label, val: value });
    } else {
        if (window.isLoggingEnabled) _writeRawLogLine(`  DM (${label}): ${value >= 0 ? '+' : ''}${value}`);
    }
}

function tSkip(reason) { writeLogLine(`  Skipped: ${reason}`); }
function tTrade(code, reason) { writeLogLine(`  Trade Code [${code}]: ${reason}`); }

function tRoll1D(label) {
    const roll = roll1D();
    flushPendingRoll();
    pendingRoll = { label, val: roll, dms: [], type: '1D' };
    return roll;
}

function tRoll2D(label) {
    const roll = roll2D();
    flushPendingRoll();
    pendingRoll = { label, val: roll, dms: [], type: '2D6' };
    return roll;
}

function tRoll1D3(label) {
    const roll = rollD3();
    flushPendingRoll();
    pendingRoll = { label, val: roll, dms: [], type: '1D3' };
    return roll;
}

function tRoll2D3(label) {
    const roll = rollD3() + rollD3();
    flushPendingRoll();
    pendingRoll = { label, val: roll, dms: [], type: '2D3' };
    return roll;
}

function tRoll3D(label) {
    const roll = rollND(3);
    flushPendingRoll();
    pendingRoll = { label, val: roll, dms: [], type: '3D6' };
    return roll;
}

function tRoll4D(label) {
    const roll = rollND(4);
    flushPendingRoll();
    pendingRoll = { label, val: roll, dms: [], type: '4D6' };
    return roll;
}

function tRollFlux(label) {
    const roll = rollFlux();
    flushPendingRoll();
    pendingRoll = { label, val: roll, dms: [], type: 'Flux' };
    return roll;
}

function tRollND(n, label) {
    const roll = rollND(n);
    flushPendingRoll();
    pendingRoll = { label, val: roll, dms: [], type: `${n}D` };
    return roll;
}

function tClamp(label, rolled, clamped) {
    if (window.isLoggingEnabled) writeLogLine(`  ${label} Rolled: ${rolled} -> Clamped to ${clamped}`);
}

function tOverride(label, original, newValue, reason) {
    if (window.isLoggingEnabled) writeLogLine(`  ${label} Override: ${original} -> ${newValue} (${reason})`);
}

function endTrace() {
    if (window.isLoggingEnabled) {
        flushPendingRoll();
        writeLogLine(`\n`);
    }
}

// =====================================================================
// MANUAL OVERRIDE HELPERS
// =====================================================================

/**
 * Marks a field on a body/star object as manually set by the user.
 * Engines check this before writing to a field during re-expansion.
 * @param {Object} obj - The body or star object.
 * @param {string} field - The field name to mark as manual.
 */
function markManual(obj, field) {
    if (!obj) return;
    if (!Array.isArray(obj._manualFields)) obj._manualFields = [];
    if (!obj._manualFields.includes(field)) obj._manualFields.push(field);
}

/**
 * Returns true if a field on a body/star object has been manually set.
 * @param {Object} obj - The body or star object.
 * @param {string} field - The field name to check.
 * @returns {boolean}
 */
function isManual(obj, field) {
    if (!obj || !Array.isArray(obj._manualFields)) return false;
    return obj._manualFields.includes(field);
}

/**
 * Clears the manual flag for a specific field, or all fields if none specified.
 * @param {Object} obj - The body or star object.
 * @param {string} [field] - The field to clear. Omit to clear all manual flags.
 */
function clearManual(obj, field) {
    if (!obj || !Array.isArray(obj._manualFields)) return;
    if (field === undefined) {
        obj._manualFields = [];
    } else {
        obj._manualFields = obj._manualFields.filter(f => f !== field);
    }
}

/**
 * Counts all manually-overridden bodies/stars across a CT system.
 * Used by the re-expansion warning dialog.
 * @param {Object} ctSystem - The sys object from stateObj.ctSystem.
 * @returns {number} Total count of stars/bodies with at least one manual field.
 */
function countManualCTBodies(ctSystem) {
    let count = 0;
    if (!ctSystem) return 0;
    (ctSystem.stars || []).forEach(star => {
        if (Array.isArray(star._manualFields) && star._manualFields.length > 0) count++;
    });
    (ctSystem.orbits || []).forEach(slot => {
        const body = slot.contents;
        if (!body) return;
        if (Array.isArray(body._manualFields) && body._manualFields.length > 0) count++;
        (body.satellites || []).forEach(sat => {
            if (Array.isArray(sat._manualFields) && sat._manualFields.length > 0) count++;
        });
    });
    (ctSystem.capturedPlanets || []).forEach(cp => {
        if (Array.isArray(cp._manualFields) && cp._manualFields.length > 0) count++;
    });
    return count;
}

/**
 * Counts all manually-overridden bodies across a T5 system.
 * Used by the re-expansion warning dialog.
 * @param {Object} t5System - The sys object from stateObj.t5System.
 * @returns {number} Total count of bodies with at least one manual field.
 */
function countT5ManualBodies(t5System) {
    let count = 0;
    if (!t5System || !t5System.stars) return 0;
    t5System.stars.forEach(star => {
        if (Array.isArray(star._manualFields) && star._manualFields.length > 0) count++;
        if (!star.orbits) return;
        star.orbits.forEach(o => {
            const body = o.contents;
            if (!body || body.type === 'Empty') return;
            if (Array.isArray(body._manualFields) && body._manualFields.length > 0) count++;
            (body.satellites || []).forEach(sat => {
                if (Array.isArray(sat._manualFields) && sat._manualFields.length > 0) count++;
            });
        });
    });
    return count;
}

/**
 * Counts all manually-overridden bodies across an RTT system.
 * Used by the re-expansion warning dialog.
 * @param {Object} rttSystem - The sys object from stateObj.rttSystem.
 * @returns {number} Total count of bodies with at least one manual field.
 */
function countManualBodies(rttSystem) {
    let count = 0;
    if (!rttSystem || !rttSystem.stars) return 0;
    rttSystem.stars.forEach(star => {
        if (!star.planetarySystem) return;
        star.planetarySystem.orbits.forEach(body => {
            if (Array.isArray(body._manualFields) && body._manualFields.length > 0) count++;
            (body.satellites || []).forEach(sat => {
                if (Array.isArray(sat._manualFields) && sat._manualFields.length > 0) count++;
            });
        });
    });
    return count;
}

/**
 * Counts all manually-overridden bodies across a MgT2E system.
 * Used by the re-expansion warning dialog.
 * @param {Object} mgtSystem - The sys object from stateObj.mgtSystem.
 * @returns {number} Total count of bodies with at least one manual field.
 */
function countManualMgt2eBodies(mgtSystem) {
    let count = 0;
    if (!mgtSystem) return 0;
    (mgtSystem.stars || []).forEach(star => {
        if (Array.isArray(star._manualFields) && star._manualFields.length > 0) count++;
    });
    (mgtSystem.worlds || []).forEach(world => {
        if (Array.isArray(world._manualFields) && world._manualFields.length > 0) count++;
        (world.moons || []).forEach(m => {
            if (Array.isArray(m._manualFields) && m._manualFields.length > 0) count++;
        });
        (world.significantBodies || []).forEach(sb => {
            if (Array.isArray(sb._manualFields) && sb._manualFields.length > 0) count++;
        });
    });
    return count;
}

// =====================================================================
// NAME GENERATION UTILITIES
// =====================================================================

/**
 * Grabs a name from the pool.
 * If hexId is provided, it uses a deterministic hash to pick the name,
 * ensuring the same hex always gets the same name for a given Master Seed.
 */
function getNextSystemName(hexId) {
    if (namePool.length === 0) return "Unnamed System";

    let index;
    if (hexId) {
        // Deterministic pick based on location - absolute determinism
        const nameSeed = hashString(masterSeed + "-" + hexId + "-name");
        index = nameSeed % namePool.length;
        const name = namePool[index];
        usedNames.add(name);
        if (window.isLoggingEnabled) {
            writeLogLine(`System Name Selected: ${name}`);
        }
        return name;
    } else {
        // Fallback to current RNG stream
        index = Math.floor(rng() * namePool.length);
        const name = namePool[index];
        // DO NOT splice here; it breaks determinism based on generation order across the session
        usedNames.add(name);
        if (window.isLoggingEnabled) {
            writeLogLine(`System Name Selected: ${name}`);
        }
        return name;
    }
}

/**
 * Assigns systematic orbital names to all bodies in a fully-generated MgT2E system.
 * Must be called after all generation phases are complete (world tree fully assembled).
 * - Mainworld keeps the plain system name.
 * - Other primary bodies (sorted by orbitId): "SystemName I", "SystemName II", …
 * - Moons of primaries: "SystemName I-a", "SystemName I-b", …
 * - Moons of the mainworld (rare): "SystemName-a", "SystemName-b", …
 */
function _toRoman(n) {
    const vals = [1000,900,500,400,100,90,50,40,10,9,5,4,1];
    const syms = ['M','CM','D','CD','C','XC','L','XL','X','IX','V','IV','I'];
    let r = '';
    for (let i = 0; i < vals.length; i++) {
        while (n >= vals[i]) { r += syms[i]; n -= vals[i]; }
    }
    return r;
}

function _assignMoonNames(moons, parentName) {
    if (!moons || moons.length === 0) return;
    let idx = 0;
    moons.forEach(m => {
        if (m.isLunarMainworld || m.type === 'Mainworld' || m.isMainworld) return;
        if (!m.name) m.name = `${parentName}-${String.fromCharCode(97 + idx)}`;
        idx++;
    });
}

function applyMgT2EOrbitalNames(sys) {
    const _mw = (sys.mainworld) ||
                sys.worlds.find(w => w.type === 'Mainworld' || w.isLunarMainworld) ||
                sys.worlds[0];

    if (_mw && !_mw.name) {
        _mw.name = (typeof getNextSystemName === 'function') ? getNextSystemName(sys.hexId) : 'Unnamed';
    }
    const _sysName = (_mw && _mw.name) ||
                     ((typeof getNextSystemName === 'function') ? getNextSystemName(sys.hexId) : 'Unknown');

    const isMultiStar = sys.stars && sys.stars.length > 1;

    // Group non-mainworld bodies by parentStarIdx for multi-star prefix support
    const starGroups = {};
    sys.worlds
        .filter(w => w.type !== 'Empty' && w.type !== 'Mainworld' && !w.isLunarMainworld)
        .forEach(w => {
            const idx = (w.parentStarIdx !== undefined) ? w.parentStarIdx : 0;
            if (!starGroups[idx]) starGroups[idx] = [];
            starGroups[idx].push(w);
        });

    Object.keys(starGroups).sort((a, b) => Number(a) - Number(b)).forEach(idxStr => {
        const idx = Number(idxStr);
        const namePrefix = isMultiStar
            ? `${_sysName} ${String.fromCharCode(65 + idx)}-`
            : `${_sysName} `;

        const group = starGroups[idx].sort((a, b) => (a.orbitId || 0) - (b.orbitId || 0));
        let _ordinal = 1;
        group.forEach(w => {
            const _roman = _toRoman(_ordinal++);
            if (!w.name) w.name = `${namePrefix}${_roman}`;
            _assignMoonNames(w.moons, `${namePrefix}${_roman}`);
        });
    });

    _assignMoonNames(_mw && _mw.moons, _sysName);
    sys.name = _sysName;
}

function applyCTOrbitalNames(sys) {
    if (!sys || !sys.orbits) return;

    let _mw = null;
    for (const slot of sys.orbits) {
        if (slot.contents && slot.contents.type === 'Mainworld') { _mw = slot.contents; break; }
    }
    if (!_mw && sys.capturedPlanets) {
        _mw = sys.capturedPlanets.find(p => p.type === 'Mainworld') || null;
    }

    const _sysName = (_mw && _mw.name) ||
                     sys.name ||
                     ((typeof getNextSystemName === 'function') ? getNextSystemName(sys.hexId || '') : 'Unknown');
    if (_mw && !_mw.name) _mw.name = _sysName;

    // CT has a flat orbit pool with no per-star attribution — use a single ordinal sequence.
    // Captured Planets (RAW Book 6 anomalies that sit outside the normal discrete orbit-slot
    // sequence, sys.capturedPlanets — see ct_bottomup_generator.js) are merged in here, sorted
    // by real distance (distAU) rather than orbit-slot number so they interleave at their true
    // position — same order hex_editor.js's accordion already renders them in. Without this, a
    // captured planet's `.name` was never set at all; the accordion's input `placeholder`
    // (computed from that same ordinal position) made it merely *look* named, while the real
    // field stayed permanently blank — visible the moment System Editor read `w.name` directly.
    const orbitBodies = sys.orbits
        .filter(slot => slot.contents && slot.contents.type !== 'Empty' && slot.contents.type !== 'Mainworld')
        .map(slot => ({ body: slot.contents, sortAU: slot.contents.distAU ?? slot.orbit ?? 0 }));
    const capturedBodies = (sys.capturedPlanets || [])
        .filter(p => p.type !== 'Mainworld')
        .map(p => ({ body: p, sortAU: p.distAU ?? p.orbit ?? 0 }));
    const bodies = [...orbitBodies, ...capturedBodies]
        .sort((a, b) => a.sortAU - b.sortAU)
        .map(e => e.body);

    let _ordinal = 1;
    bodies.forEach(w => {
        const _roman = _toRoman(_ordinal++);
        if (!w.name) w.name = `${_sysName} ${_roman}`;
        if (w.satellites && w.satellites.length > 0) {
            // Sort by pd (periapsis distance) to match hex_editor display order
            const sortedSats = [...w.satellites].sort((a, b) => (a.pd || 0) - (b.pd || 0));
            _assignMoonNames(sortedSats, `${_sysName} ${_roman}`);
        }
    });

    _assignMoonNames(_mw && _mw.satellites, _sysName);
    sys.name = _sysName;
}

function applyT5OrbitalNames(sys) {
    if (!sys || !sys.stars) return;

    const _mw = sys.mainworld;
    const _hexId = (_mw && _mw.hexId) || sys.hexId || '';
    if (_mw && !_mw.name) {
        _mw.name = (typeof getNextSystemName === 'function') ? getNextSystemName(_hexId) : 'Unnamed';
    }
    const _sysName = (_mw && _mw.name) ||
                     ((typeof getNextSystemName === 'function') ? getNextSystemName(_hexId) : 'Unknown');

    const isMultiStar = sys.stars.length > 1;

    sys.stars.forEach((star, starIdx) => {
        if (!star.orbits) return;
        const namePrefix = isMultiStar
            ? `${_sysName} ${String.fromCharCode(65 + starIdx)}-`
            : `${_sysName} `;

        const bodies = star.orbits
            .filter(slot => slot.contents && slot.contents !== _mw)
            .sort((a, b) => (a.orbit || 0) - (b.orbit || 0))
            .map(slot => slot.contents);

        let _ordinal = 1;
        bodies.forEach(w => {
            const _roman = _toRoman(_ordinal++);
            if (!w.name) w.name = `${namePrefix}${_roman}`;
            _assignMoonNames(w.satellites, `${namePrefix}${_roman}`);
        });
    });

    _assignMoonNames(_mw && _mw.satellites, _sysName);
    sys.name = _sysName;
}

function applyRTTOrbitalNames(sys) {
    if (!sys || !sys.stars) return;

    const _sysName = sys.name ||
                     ((typeof getNextSystemName === 'function') ? getNextSystemName(sys.hexId || '') : 'Unknown');
    sys.name = _sysName;

    const isMultiStar = sys.stars.length > 1;

    sys.stars.forEach((star, starIdx) => {
        if (!star.planetarySystem || !star.planetarySystem.orbits) return;
        const namePrefix = isMultiStar
            ? `${_sysName} ${String.fromCharCode(65 + starIdx)}-`
            : `${_sysName} `;

        const allOrbits = [...star.planetarySystem.orbits]
            .sort((a, b) => (a.orbitNumber || 0) - (b.orbitNumber || 0));

        let _ordinal = 1;
        allOrbits.forEach(b => {
            if (b.isMainworld) {
                _assignMoonNames(b.satellites, _sysName);
                return;
            }
            const _roman = _toRoman(_ordinal++);
            if (!isManual(b, 'name')) b.name = `${namePrefix}${_roman}`;
            _assignMoonNames(b.satellites, `${namePrefix}${_roman}`);
        });
    });
}

// calculateT5Ix(), generateXboatRoutes(), and addRoute() live in js/routes.js
