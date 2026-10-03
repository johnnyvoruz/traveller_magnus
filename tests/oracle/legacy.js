// tests/oracle/legacy.js
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// Legacy generation layer in hex_map.html order (lines 16-72, 98, 102, 117 on 2026-10-02).
// io_manager.js is loaded only for parseT5Tab/parseXmlRouteGroups parity; macro_orchestrator.js only for
// mgtBuildStage/_storeMgtBuild/_buildOneMgtHex parity. No renderer, no persistence, no UI files.
export const FILES = [
    'js/constants.js', 'js/core.js', 'js/seed_restoration.js',
    'rules/ct_data.js', 'js/ct_constants.js', 'js/ct_stellar_engine.js', 'js/ct_physical_library.js',
    'js/ct_world_engine.js', 'js/ct_social_engine.js', 'js/ct_bottomup_generator.js',
    'js/ct_topdown_generator.js', 'js/ct_uwp_auditor.js', 'js/ct_system_driver.js',
    'rules/mgt2e_data.js', 'js/mgt2e_math.js', 'js/mgt2e_stellar_engine.js', 'js/mgt2e_world_engine.js',
    'js/mgt2e_socio_engine.js', 'js/mgt2e_uwp_auditor.js', 'js/mgt2e_topdown_generator.js',
    'js/mgt2e_bottomup_generator.js', 'js/universal_math.js',
    'rules/t5_data.js', 'js/t5_stellar_engine.js', 'js/t5_world_engine.js', 'js/t5_socio_engine.js',
    'js/t5_uwp_auditor.js', 'js/t5_topdown_generator.js', 'js/system_driver.js',
    'js/rtt_engine.js',
    'rules/aow_data.js', 'js/aow_stellar_engine.js', 'js/aow_world_engine.js', 'js/aow_uwp_auditor.js',
    'js/aow_seed_bridge.js', 'js/aow_bottomup_generator.js',
    'rules/expectations_data.js', 'js/statistical_auditor.js',
    'js/macro_orchestrator.js', 'js/io_manager.js', 'names.js'
];

function element() {
    return {
        style: {}, dataset: {}, value: '', textContent: '', innerHTML: '', checked: false, disabled: false,
        children: [], childNodes: [], parentNode: null,
        classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
        addEventListener() {}, removeEventListener() {}, appendChild(c) { return c; }, removeChild(c) { return c; },
        remove() {}, setAttribute() {}, getAttribute() { return null; }, removeAttribute() {},
        querySelector() { return null; }, querySelectorAll() { return []; },
        getBoundingClientRect() { return { width: 0, height: 0, left: 0, top: 0, right: 0, bottom: 0 }; },
        focus() {}, blur() {}, click() {}, getContext() { return null; }
    };
}

function sandbox() {
    const document = {
        getElementById: () => element(), querySelector: () => null, querySelectorAll: () => [],
        createElement: () => element(), createElementNS: () => element(),
        body: element(), documentElement: element(), head: element(),
        addEventListener() {}, removeEventListener() {}, readyState: 'complete'
    };
    const s = {
        console, setTimeout, clearTimeout, setInterval, clearInterval, queueMicrotask,
        TextEncoder, TextDecoder, URL, structuredClone, performance,
        localStorage: { getItem: () => null, setItem() {}, removeItem() {}, clear() {} },
        sessionStorage: { getItem: () => null, setItem() {}, removeItem() {}, clear() {} },
        innerWidth: 1920, innerHeight: 1080, devicePixelRatio: 1,
        document, navigator: { userAgent: 'node', storage: {} },
        location: { protocol: 'file:', href: 'file:///', search: '', hash: '' },
        requestAnimationFrame: () => 0, cancelAnimationFrame() {}, requestIdleCallback: () => 0, cancelIdleCallback() {},
        addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
        getComputedStyle: () => ({ getPropertyValue: () => '' }),
        alert(m) { throw new Error('legacy alert(): ' + m); }, confirm() { return true; }, prompt() { return null; },
        indexedDB: undefined
    };
    s.window = s; s.self = s; s.globalThis = s;
    return s;
}

/** Load the legacy layer. opts: { seed, settings, logging }. Returns the vm context ("window"). */
export function loadLegacy(opts = {}) {
    const ctx = vm.createContext(sandbox());
    ctx.$eval = (code) => vm.runInContext(code, ctx);
    for (const rel of FILES) {
        const file = path.join(ROOT, rel);
        if (!fs.existsSync(file)) { if (rel === 'names.js') continue; throw new Error('missing ' + rel); }
        let src = fs.readFileSync(file, 'utf8');
        if (src.charCodeAt(0) === 0xFEFF) src = src.slice(1);
        try { vm.runInContext(src, ctx, { filename: rel }); }
        catch (err) { throw new Error(`legacy oracle: ${rel} failed at load: ${err.message}`); }
    }
    // Name pool exactly as hex_map.html:3232-3242 fills it.
    ctx.$eval(`
        if (window.SYSTEM_NAMES && Array.isArray(window.SYSTEM_NAMES)) {
            window.SYSTEM_NAMES.forEach(name => {
                const cleaned = name ? name.trim() : '';
                if (cleaned && typeof usedNames !== 'undefined' && !usedNames.has(cleaned)) {
                    namePool.push(cleaned);
                } else if (cleaned && typeof usedNames === 'undefined') {
                    if (typeof namePool !== 'undefined') namePool.push(cleaned);
                }
            });
            if (typeof namePool !== 'undefined') {
                namePool.sort();
            }
        }
    `);
    ctx.isLoggingEnabled = !!opts.logging;
    ctx.batchLogData = [];
    ctx.logIndentLevel = 0;
    applyGeneration(ctx, opts.seed || 'TravellerMagnus', opts.settings || {});
    return ctx;
}

/** Mirror of universe_snapshot.js _withSnapshotGeneration: set the seed and every generation* key. */
export function applyGeneration(ctx, seed, settings) {
    ctx.$eval(`masterSeed = ${JSON.stringify(seed)}; rng = mulberry32(hashString(masterSeed));`);
    for (const [key, value] of Object.entries(settings)) ctx[key] = value;
}
