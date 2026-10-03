export const hexStates = new Map();
export let gridWidth = 7;
export let gridHeight = 5;
export let baseHexSize = 50;

export function legacySectorLetterToIndex(letter) {
    if (!letter || letter.length === 0) return 0;
    if (letter.length === 1) return letter.toUpperCase().charCodeAt(0) - 65;
    // Old scheme: same letter doubled (AA, BB, CC...)
    return (letter.toUpperCase().charCodeAt(0) - 65) + 26;
}

/**
 * Converts a sector slot label (letter OR numeric string) to a sector number (1-based).
 * Letters use the legacy index mapping; numeric strings are parsed directly.
 */
export function sectorSlotToNumber(slot) {
    if (!slot) return 1;
    const n = parseInt(slot, 10);
    if (!isNaN(n)) return n;
    return legacySectorLetterToIndex(slot) + 1;
}

export function getHexId(q, r) {
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

export function pixelToHex(x, y, size) {
    const q_frac = (2.0 / 3.0 * x) / size;
    const r_frac = (-1.0 / 3.0 * x + Math.sqrt(3) / 3.0 * y) / size;
    let q = Math.round(q_frac), r = Math.round(r_frac), s = Math.round(-q_frac - r_frac);
    const q_diff = Math.abs(q - q_frac), r_diff = Math.abs(r - r_frac), s_diff = Math.abs(s - (-q_frac - r_frac));
    if (q_diff > r_diff && q_diff > s_diff) q = -r - s; else if (r_diff > s_diff) r = -q - s;
    return { q: q, r: r + (q - (q & 1)) / 2 };
}

export function getHexCoords(hexId) {
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
export function isVacantHex(hexId) {
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
export const HEX_VIEW_STATE_KEYS = ['isHiddenByFilter'];

export function stripHexViewState(state) {
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

export function getHexDistance(q1, r1, q2, r2) {
    const x1 = q1;
    const z1 = r1 - (q1 - (q1 & 1)) / 2;
    const y1 = -x1 - z1;
    const x2 = q2;
    const z2 = r2 - (q2 - (q2 & 1)) / 2;
    const y2 = -x2 - z2;
    return Math.max(Math.abs(x1 - x2), Math.abs(y1 - y2), Math.abs(z1 - z2));
}

export function getHexPixel(q, r) {
    const size = baseHexSize;
    const widthStep = (3 / 2) * size;
    const heightStep = Math.sqrt(3) * size;
    const offset = (q & 1) ? 0.5 : 0;
    return { x: widthStep * q, y: heightStep * (r + offset) };
}

