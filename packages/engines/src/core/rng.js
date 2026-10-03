import { usedNames } from './names.js';
import { settings } from './settings.js';
import { writeLogLine } from './trace.js';

export let masterSeed = 'TravellerMagnus';
export let rng = mulberry32(hashString(masterSeed));

export function hashString(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
        h = Math.imul(h ^ str.charCodeAt(i), 16777619);
    }
    return h >>> 0;
}

export function mulberry32(a) {
    return function () {
        let t = a += 0x6D2B79F5;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
}

export function setRandomSeed(seedString) {
    masterSeed = seedString || "TravellerMagnus";
    rng = mulberry32(hashString(masterSeed));
    usedNames.clear(); // Important: reset used names on seed change
    writeLogLine(`Master Seed set to: "${masterSeed}" (RNG and Names Reset)`);
}

export function reseedForHex(hexId) {
    const hexSeed = hashString(masterSeed + "-" + (hexId || "0000"));
    rng = mulberry32(hexSeed);
}

export function shouldGeneratePopulation(hexId) {
    const freq = (settings.generationPopCheckFrequency !== undefined)
        ? Number(settings.generationPopCheckFrequency) : 100;
    if (freq >= 100) return true;
    if (freq <= 0) return false;
    const hash = hashString(masterSeed + '-popcheck-' + (hexId || ''));
    return (hash % 100) < freq;
}

export function clampUWP(val, min, max) {
    if (typeof val === 'string' && (val === 'S' || val === 'R' || val === 'GG')) return val;
    const v = Number(val);
    if (isNaN(v)) return min;
    return Math.max(min, Math.min(max, v));
}

export function roll1D() { return Math.floor(rng() * 6) + 1; }
export function roll2D() { return roll1D() + roll1D(); }
export function rollFlux() { return roll1D() - roll1D(); }
export function rollD3() { return Math.floor(rng() * 3) + 1; }
export function rollND(n) {
    let total = 0;
    for (let i = 0; i < n; i++) total += roll1D();
    return total;
}

export function roll3D() {
    return roll1D() + roll1D() + roll1D();
}

export function roll4D() {
    return rollND(4);
}

// --- Traveller Extended Hexadecimal (eHex: skips I and O) ---
const EHEX_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

export function toEHex(val) {
    if (val === undefined || val === null) return '0';
    if (typeof val === 'string' && (val === 'S' || val === 'R' || val === 'GG')) return val;
    const v = Math.floor(Number(val));
    if (isNaN(v) || v < 0) return '0';
    if (v < 10) return v.toString();
    return EHEX_CHARS[v - 10] || 'Z';
}

export function fromEHex(char) {
    if (char === undefined || char === null || char === '') return 0;
    const c = String(char).trim().toUpperCase();
    if (c === 'R') return 0.1;  // CT Ring — sub-integer, distinct from 0 for filter purposes
    if (c === 'S') return 0.5;  // CT Small moon — sub-integer, distinct from 0 for filter purposes
    const ch = c.charAt(0);
    if (ch >= '0' && ch <= '9') return parseInt(ch, 10);
    const idx = EHEX_CHARS.indexOf(ch);
    return idx >= 0 ? idx + 10 : 0;
}

