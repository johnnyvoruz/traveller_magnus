# Slice 0 — Foundation (recipe)

**Status:** READY 2026-10-02 (rewritten the same day for platform-owned compute). Written for
a lower-effort implementer in the format decided in `campaign_manager_plan.md`: numbered steps;
file, function, exact code or exact signature, one-line check.
**Governed by:** `manifesto.md` → `plan.md` → `architecture.md` → `data_model.md` → `api.md`.
Read them first, then `feature_inventory.md` section B.
**Ships:** nothing a user sees. It ships the test oracle over the legacy engines, golden
fixtures, the monorepo, rules as ESM without touching `rules/`, the core modules, every engine
converted with byte-equal parity, real parsers for TravellerMap data, the generation package,
the Worker (Hono, D1, Durable Object schema, Queues, auth, generation preview, truth-build job),
truth v1 built by the platform and served from the CDN, CI, and the design tokens.
**Touches no existing file.** Everything is new under `tests/`, `tools/`, `apps/`, `packages/`,
`scripts/`, `.github/` or the repo root. Do not edit `js/`, `rules/`, `hex_map.html` or
`style.css`; if a step seems to need it, stop and report.

Line numbers are from 2026-10-02 and may drift; confirm with `grep` before relying on one.
Tooling present: Node 24.19, npm 11.17, wrangler 4.140 (global).

**Parallelism.** Track A: §1–§3, then §5–§7 (engines). Track B: §4, then §10–§11 (Worker).
Both tracks need §4 first. §8–§9 need §7. §12 needs §9 and §10. §13–§14 last.

---

## 0. Layout and conventions

Per `architecture.md` §3. The repository is **ESM everywhere**: the root `package.json` has
`"type": "module"`; every package has it too; test files are `*.test.js`.

```
package.json                 workspaces ["packages/*", "apps/*"]; scripts in §4.1
tests/
  oracle/legacy.js           loads the legacy generation layer into a Node vm context (test oracle; deleted at M2)
  golden/                    cases.js, legacy.test.js, esm.test.js, fixtures/, volatile.js
  shared/                    parser parity and schema tests
  generation/                Node-vs-oracle and Node-vs-Worker parity
  api/                       black-box Worker tests
packages/
  engines/                   src/core/, src/generated/rules/ (gitignored), src/<engine files>, src/index.js
  shared/                    src/stable.ts, src/schemas/*.ts, src/parsers/t5tab.ts, src/parsers/metadata_xml.ts
  generation/                src/index.ts: generateHex, generateSector, buildTruthSector (pure; runs in Node and the Worker)
apps/
  web/                       Vue 3 + Vite + TS; holding page; src/design/tokens.css
  api/                       the Worker (§10)
tools/truth/                 settings.js, build.js (Node runner of packages/generation for local verification)
scripts/                     gen_rules_esm.js, check_manifesto.js, check_allowlist.json
.github/workflows/ci.yml
```

`.gitignore` additions: `node_modules/`, `apps/web/dist/`, `packages/engines/src/generated/`,
`apps/api/.wrangler/`, `.dev.vars`, `truth-local/`.

`utilities/package.json` is `{ "type": "commonjs" }` so the legacy CommonJS scripts there
(`fetch.js`, the converters) keep running under the ESM root without being edited.

---

## 1. Legacy oracle — `tests/oracle/legacy.js`

Purpose: produce the golden fixtures that prove the converted engines and the new parsers
behave exactly like the legacy app. It is a test oracle and nothing else: no production code
imports it, and it is deleted with the legacy tree at M2.

Why a `vm` context: `rules/ct_data.js` and `rules/aow_data.js` are bare top-level `const`
declarations with no exports, `rules/` is read-only, and the legacy engines find each other
through globals in load order. A `vm` context reproduces the browser's global scope.

**Gotcha:** top-level `let`/`const` in a script (`let masterSeed`, `let rng` at `core.js:180-181`)
are not properties of the context object. Read or set them with
`ctx.$eval('masterSeed = "x"; rng = mulberry32(hashString(masterSeed));')`. Plain assignments
without a keyword (`hexStates = new Map()`, `namePool = []`) and `function` declarations are
context properties and work as `ctx.hexStates`.

```js
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
    // Name pool exactly as hex_map.html:3232-3242 fills it. Open those lines and make this block match them.
    ctx.$eval(`
        if (window.SYSTEM_NAMES && Array.isArray(window.SYSTEM_NAMES)) {
            window.SYSTEM_NAMES.forEach(name => { const cleaned = String(name).trim(); if (cleaned) namePool.push(cleaned); });
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
```

**Check:** `node -e "import('./tests/oracle/legacy.js').then(m=>{const c=m.loadLegacy();console.log(typeof c.generateMgT2ESystemTopDown, typeof c.parseT5Tab, c.namePool.length)})"`
prints `function function <over 1000>`. If a file throws at load, the error names it: add the
smallest stub to `sandbox()`, re-run, and list every stub added in your report.

---

## 2. Golden fixtures — `tests/golden/`

### 2.1 `packages/shared/src/stable.ts` (used by tests, the Worker and the generation package)

```ts
/** Deterministic JSON: sorted keys, non-finite numbers explicit so they never become null. */
export function stable(value: unknown): string {
    return JSON.stringify(value, (_k, v) => {
        if (typeof v === 'number' && !Number.isFinite(v)) return { $num: String(v) };
        if (v && typeof v === 'object' && !Array.isArray(v)) {
            return Object.keys(v as object).sort().reduce((o: Record<string, unknown>, key) => { o[key] = (v as any)[key]; return o; }, {});
        }
        return v;
    }, 2);
}
export async function sha256Hex(text: string): Promise<string> {
    const bytes = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}
```

Tests import it through the package (`@voyage/shared`); until `packages/shared` builds, they
may import the file path directly with `tsx` **not** added; keep `stable.ts` free of TypeScript
syntax that Node 24 cannot strip (`node --experimental-strip-types` is on by default in 24 for
`.ts` imports). If Node refuses the import, report the exact error.

### 2.2 `tests/golden/volatile.js` — starts empty

```js
// Paths allowed to differ between two runs. Empty on purpose. Add an entry only after reporting what differed and why (§2.5).
export default [];
```

### 2.3 `tests/golden/cases.js`

```js
import { TRUTH_SETTINGS } from '../../tools/truth/settings.js';

export const TSV = [
    'Hex\tName\tUWP\tBases\tRemarks\tZone\tPBG\tAllegiance\tStars\t{Ix}\t(Ex)\t[Cx]\tNobility\tW\tRU',
    '1910\tRegina\tA788899-C\tNS\tRi Pa Ph An Cp (Amindii)2 Varg0 Asla0 Sa\t\t703\tImDd\tF7 V BD M3 V\t{ 4 }\t(D7E+5)\t[9C6D]\tBcCeF\t8\t7000',
    '1912\tTannous\tC663A98-9\tN\tHi In Pa Cs\tA\t824\tImDd\tG3 V\t{ 2 }\t(B9C+1)\t[6B4A]\tBcCF\t5\t1000',
].join('\n');

export const settings = TRUTH_SETTINGS;
export const seed = 'TravellerMagnus';

// Each case returns a plain object. Legacy hex ids are "<sectorNum>-<subsectorLetter>-<hhhh>"
// (core.js:348-360, io_manager.js:2025); parseT5Tab takes the slot as a STRING ('1', io_manager.js:1974).
// Regina 1910 is subsector C of sector 1: column 19 → floor(18/8) = 2, row 10 → floor(9/10) = 0 → 'C'.
export const cases = {
    mgt2e_topdown_bare:   (ctx) => ctx.generateMgT2ESystemTopDown('1-A-0101', null),
    mgt2e_bottomup:       (ctx) => ctx.generateMgT2ESystemBottomUp('1-A-0102', null),
    mgt2e_flesh_from_tsv: (ctx) => {                           // the truth path: macro_orchestrator.js:340-351
        const rows = ctx.parseT5Tab(TSV, '1');
        for (const [id, state] of rows) ctx.hexStates.set(id, state);
        if (!ctx._buildOneMgtHex('1-C-1910')) throw new Error('_buildOneMgtHex returned false for 1-C-1910');
        return ctx.stripHexViewState(ctx.hexStates.get('1-C-1910'));
    },
    mgt2e_society_expand: (ctx) => {
        const sys = ctx.generateMgT2ESystemTopDown('1-A-0103', null);
        const state = { type: 'SYSTEM_PRESENT' };
        ctx._storeMgtBuild(state, sys);
        delete state.mgtSocio;
        return ctx.expandLoadedSocioeconomicsMgT2E('1-A-0103', state);
    },
    ct_bottomup:          (ctx) => ctx.System_Driver.generateSystem({ edition: 'CT', mode: 'bottom-up', hexId: '1-A-0104' }),
    ct_topdown:           (ctx) => {                           // macro_orchestrator.js:1059-1073
        const hexId = '1-A-0108';
        const mwData = ctx.CT_World_Engine.generateModularMainworld ? ctx.CT_World_Engine.generateModularMainworld(hexId) : ctx.generateCTMainworld(hexId);
        const sys = ctx.CT_Generator.generateSystem({ mode: 'top-down', mainworldUWP: mwData, hexId });
        return { mwData, sys };
    },
    t5_topdown:           (ctx) => {                           // macro_orchestrator.js:1578-1588
        const hexId = '1-A-0105';
        const mw = ctx.T5_World_Engine.generateT5Mainworld(hexId);
        const sys = ctx.System_Driver.generateSystem({ edition: 'T5', mode: 'top-down', mainworldUWP: mw, hexId });
        const socio = ctx.T5_Socio_Engine.generateT5Socioeconomics(sys.mainworld, hexId);
        return { sys, socio, name: ctx.getNextSystemName(hexId) };
    },
    rtt_bottomup:         (ctx) => {                           // macro_orchestrator.js:1335 and the steps runRTTMacro calls after it
        const sys = ctx.generateRTTSectorStep1('1-A-0106');
        return { sys, mainworld: ctx.extractRTTMainworld(sys) };
    },
    aow_bottomup:         (ctx) => ctx.AoWBottomUpGenerator.generateAoWSystemBottomUp('1-A-0107'),
    parse_t5tab:          (ctx) => Object.fromEntries(ctx.parseT5Tab(TSV, '1'))
};

// Not a case: the legacy metadata XML parser (io_manager.js:2279 parseXmlRouteGroups) needs a browser
// DOMParser, which Node does not have. The new parser (§8) is verified against TravellerMap's documented
// schema and hand-counted values from universe/raw/Spinward_Marches.xml instead.
export const skipped = ['parse_metadata_xml'];
```

Every case must return a defined value; `legacy.test.js` fails a case that returns
`undefined` instead of writing an empty fixture.

### 2.4 `tests/golden/legacy.test.js`

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLegacy } from '../oracle/legacy.js';
import { stable } from '../../packages/shared/src/stable.ts';
import { cases, settings, seed } from './cases.js';

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const UPDATE = process.env.UPDATE_GOLDEN === '1';
function run(name) {
    const value = cases[name](loadLegacy({ seed, settings }));
    assert.notEqual(value, undefined, `${name} returned undefined`);
    const out = stable(value);
    assert.ok(out && out !== '{}' && out !== '[]', `${name} produced an empty result`);
    return out;
}

for (const name of Object.keys(cases)) {
    test(`legacy ${name} is deterministic`, () => assert.equal(run(name), run(name)));
    test(`legacy ${name} matches fixture`, () => {
        const file = path.join(FIX, name + '.json');
        const out = run(name);
        if (UPDATE || !fs.existsSync(file)) { fs.mkdirSync(FIX, { recursive: true }); fs.writeFileSync(file, out); return; }
        assert.equal(out, fs.readFileSync(file, 'utf8'));
    });
}
```

`UPDATE_GOLDEN=1 npm test` rewrites every fixture. It is run once, when the cases file is
settled, and never again without the orchestrator asking for it.

**Check:** `npm test` (after §4.1) passes with fixtures written on the first run and matched on
the second. Fixtures are committed (Johnny stages; list them in the report).

### 2.5 If a determinism test fails

Do not touch `volatile.js`. Report the case, the first differing path and both values.

---

## 3. Pinned generation inputs — `tools/truth/settings.js`

The engines read twelve `generation*` keys. The legacy `collectMapSettings()`
(`io_manager.js:196-225`) pins ten. `generationNoTravelZones` (read in `mgt2e_socio_engine.js`,
`t5_world_engine.js`) and `generationPopCheckFrequency` (`core.js:213-220`) are set only by the
Settings UI (`ui_menus.js:4533`, `:4627`).

```js
// Every generation key an engine reads. Values 1-10 copy utilities/build_universe_snapshot/pack.js.
// Values 11-12 decided 2026-10-02: rules as written. Travel zones are rolled (false) and population is
// always generated (100). These equal a fresh browser's defaults (ui_menus.js:4533, :4627), so truth v1
// reproduces what the legacy app has always produced.
export const TRUTH_SETTINGS = Object.freeze({
    generationPopMax: 20, generationPopMod: 0, generationTlMax: 20, generationTlMod: 0,
    generationUseRealisticStellar: false, generationUseTlFloor: false,
    generationRttSettlement: 2, generationRttTL: 15, generationStarportMax: 'A', generationStarportMod: 0,
    generationNoTravelZones: false,
    generationPopCheckFrequency: 100
});
export const TRUTH_SEED = 'TravellerMagnus';
export const TRUTH_MILIEU = 'M1105';
```

**Check:** `grep -ohE 'window\.generation[A-Za-z]+' js/*.js | sort -u` lists exactly these
twelve keys. If more, add them and report.

---

## 4. Monorepo skeleton and the manifesto checker

### 4.1 Root and packages

Root `package.json`:

```json
{
  "name": "traveller-voyage", "private": true, "type": "module",
  "workspaces": ["packages/*", "apps/*"],
  "scripts": {
    "test": "node --test \"tests/**/*.test.js\"",
    "check": "node scripts/check_manifesto.js",
    "rules:gen": "node scripts/gen_rules_esm.js",
    "truth:local": "node tools/truth/build.js",
    "dev:web": "npm --workspace apps/web run dev",
    "dev:api": "npm --workspace apps/api run dev",
    "build": "npm run rules:gen && npm --workspace packages/shared run build && npm --workspace apps/web run build",
    "deploy": "npm run build && npm --workspace apps/api run deploy"
  }
}
```

`packages/engines/package.json`: `{ "name": "@voyage/engines", "version": "1.0.0", "type": "module", "exports": { ".": "./src/index.js", "./core/*": "./src/core/*.js" } }`, `src/index.js` empty until §7.
`packages/shared/package.json`: `{ "name": "@voyage/shared", "version": "1.0.0", "type": "module", "exports": { ".": "./src/index.ts" }, "dependencies": { "zod": "^3" } }`.
`packages/generation/package.json`: `{ "name": "@voyage/generation", "version": "1.0.0", "type": "module", "exports": { ".": "./src/index.ts" }, "dependencies": { "@voyage/engines": "*", "@voyage/shared": "*" } }`.

`npm install` at the root. **Check:** `npm ls --workspaces` lists the three packages.

### 4.2 `apps/web` — holding page

`npm create vite@latest apps/web -- --template vue-ts`; then `npm install vue-router pinia`
in it. Delete the demo. `src/App.vue` renders "Traveller.voyage", one line "A mapping engine
and orbit engine for Traveller. Opening soon.", and `APP_VERSION` from `src/version.ts`, styled
only with tokens from `src/design/tokens.css` (copy `design_reference.md` §1 verbatim).
Self-host Orbitron and Inter under `public/fonts/` with `@font-face` in `tokens.css`.
`vite.config.ts`: `server.proxy = { '/api': 'http://127.0.0.1:8787' }`.

**Check:** `npm run dev:web` serves the page; `npm run build` writes `apps/web/dist/index.html`.

### 4.3 `scripts/check_manifesto.js`

```js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC_DIRS = ['apps/web/src', 'apps/api/src', 'packages/engines/src', 'packages/shared/src', 'packages/generation/src'].map(p => path.join(ROOT, p));
const allowPath = path.join(ROOT, 'scripts', 'check_allowlist.json');
const ALLOW = fs.existsSync(allowPath) ? JSON.parse(fs.readFileSync(allowPath, 'utf8')) : {};   // { "<rel file>": { "<pattern>": "<reason>" } }

const SCRIPT_PATTERNS = {
    'window.': /\bwindow\./, 'alert(': /\balert\(/, 'confirm(': /\bconfirm\(/, 'prompt(': /\bprompt\(/,
    'innerHTML': /\binnerHTML\b/, 'getElementById': /\bgetElementById\b/
};
const STYLE_PATTERNS = { 'hex colour': /#[0-9a-fA-F]{3,8}\b/, 'ms literal': /\b\d+ms\b/ };
// architecture.md §3 boundaries
const BOUNDARIES = [
    { from: /packages[\\/](engines|shared|generation)[\\/]/, mayNotImport: /(^|[\\/])apps[\\/]|@voyage\/(web|api)/ },
    { from: /packages[\\/]shared[\\/]/, mayNotImport: /^(?!zod$|\.{1,2}[\\/]|node:).*/ },
    { from: /apps[\\/]api[\\/]/, mayNotImport: /apps[\\/]web|@voyage\/web/ },
    { from: /apps[\\/]web[\\/]/, mayNotImport: /apps[\\/]api|@voyage\/(api|engines|generation)/ }   // the browser never imports engines
];

let failures = 0;
const fail = (rel, what) => { console.error(`${rel}: ${what}`); failures++; };
function check(rel, file, text) {
    const isVue = file.endsWith('.vue'), isCss = file.endsWith('.css');
    const styleText = isCss ? text : isVue ? (text.split(/<style[^>]*>/)[1] || '').split('</style>')[0] : '';
    const scriptText = isCss ? '' : isVue ? text.replace(/<style[\s\S]*?<\/style>/g, '') : text;
    for (const [name, re] of Object.entries(SCRIPT_PATTERNS)) if (re.test(scriptText) && !ALLOW[rel]?.[name]) fail(rel, name);
    if (!/tokens\.css$/.test(rel)) for (const [name, re] of Object.entries(STYLE_PATTERNS)) if (re.test(styleText) && !ALLOW[rel]?.[name]) fail(rel, name);
    for (const b of BOUNDARIES) if (b.from.test(file))
        for (const m of scriptText.matchAll(/from\s+['"]([^'"]+)['"]/g)) if (b.mayNotImport.test(m[1])) fail(rel, `forbidden import ${m[1]}`);
}
function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const file = path.join(dir, e.name);
        if (e.isDirectory()) { if (e.name !== 'generated') walk(file); continue; }
        if (!/\.(ts|js|mjs|vue|css)$/.test(e.name)) continue;
        check(path.relative(ROOT, file).replace(/\\/g, '/'), file, fs.readFileSync(file, 'utf8'));
    }
}
SRC_DIRS.forEach(walk);
if (failures) { console.error(`${failures} manifesto violation(s)`); process.exit(1); }
console.log('manifesto: clean');
```

**Check:** `npm run check` prints `manifesto: clean`. Add `alert(1)` to `apps/web/src/main.ts`,
see it fail, remove. Add `color: #fff` to a `.vue` style, see it fail, remove.

---

## 5. Rules as ESM without touching `rules/` — `scripts/gen_rules_esm.js`

Three shapes exist in `rules/`: bare `const` tables (`ct_data.js`, `aow_data.js`,
`expectations_data.js`), `const MgT2EData` with a `module.exports`/`window` tail
(`mgt2e_data.js`), and a UMD returning `root.T5_Data` (`t5_data.js`). The generator evaluates
each file once in a `vm` sandbox to learn its exported names, then writes
`packages/engines/src/generated/rules/<basename>.js` that re-evaluates the **original text**
inside a function scope and exports each name. No JSON round trip (AoW tables hold `Infinity`).

```js
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'packages', 'engines', 'src', 'generated', 'rules');
fs.mkdirSync(OUT, { recursive: true });

for (const file of fs.readdirSync(path.join(ROOT, 'rules')).filter(f => f.endsWith('.js'))) {
    const text = fs.readFileSync(path.join(ROOT, 'rules', file), 'utf8');
    const topConsts = [...text.matchAll(/^(?:const|let|var)\s+([A-Za-z_$][\w$]*)/gm)].map(m => m[1]);
    // No `module` and no `define` in the sandbox: a UMD wrapper must take its browser branch (root.X = factory()).
    const sb = { console }; sb.window = sb; sb.self = sb; sb.globalThis = sb;
    vm.runInContext(`var __root = this;\n${text}\n${topConsts.map(n => `__root.${n} = ${n};`).join('\n')}`, vm.createContext(sb), { filename: file });
    const names = new Set(topConsts);
    for (const k of Object.keys(sb)) if (!['console', 'window', 'self', 'globalThis', '__root'].includes(k)) names.add(k);
    const body = [
        `// GENERATED from rules/${file} by scripts/gen_rules_esm.js — do not edit; rules/ is the source.`,
        '// An ES module has no `module` or `define` binding, so a UMD wrapper takes its browser branch here too.',
        'const __root = {}; const window = __root; const self = __root;',
        '(function () {', text, topConsts.map(n => `__root.${n} = ${n};`).join('\n'), '}).call(__root);',
        ...[...names].map(n => `export const ${n} = __root.${n};`),
        'export default __root;'
    ].join('\n');
    fs.writeFileSync(path.join(OUT, file), body);
    console.log(`${file}: ${[...names].join(', ')}`);
}
```

**Check:** `npm run rules:gen` prints at least `ct_data.js: CT_CONSTANTS`,
`mgt2e_data.js: MgT2EData`, `t5_data.js: T5_Data`, `expectations_data.js: ExpectationTables`,
and the AoW table list. `node -e "import('./packages/engines/src/generated/rules/mgt2e_data.js').then(m=>console.log(Object.keys(m.MgT2EData).length))"` prints a number.

---

## 6. Core modules — `packages/engines/src/core/`

Straight copies of the named `core.js` line ranges into ESM files, with the substitutions below.

| File | From `core.js` | Exports |
|---|---|---|
| `rng.js` | 183-220, 747-797 | `export let masterSeed`, `export let rng`, `hashString`, `mulberry32`, `setRandomSeed`, `reseedForHex`, `shouldGeneratePopulation`, `roll1D`…`rollND`, `roll3D`, `roll4D`, `toEHex`, `fromEHex` |
| `trace.js` | 798-937 | `export const trace = { enabled: false, lines: [], indent: 0 }`, `writeLogLine`, `startTrace`, `tSection`, `tResult`, `tDM`, `tSkip`, `tTrade`, `tRoll*`, `tClamp`, `tOverride`, `endTrace`, `logIndentIn/Out` |
| `hex.js` | 330-454 | `HEX_VIEW_STATE_KEYS`, `legacySectorLetterToIndex`, `sectorSlotToNumber`, `getHexId`, `pixelToHex`, `getHexCoords`, `isVacantHex`, `stripHexViewState`, `getHexDistance`, `getHexPixel` |
| `names.js` | 1073-1286 | `export const namePool = []`, `usedNames`, `setNamePool(list)`, `getNextSystemName`, `applyMgT2EOrbitalNames`, `applyCTOrbitalNames`, `applyT5OrbitalNames`, `applyRTTOrbitalNames` |
| `manual.js` | 938-1072 | `markManual`, `isManual`, `clearManual`, `count*ManualBodies` |
| `settings.js` | new | `export const settings = { …TRUTH_SETTINGS defaults }`, `configure(partial)`, `export const genState = { currentSystemHasPop: false }` |
| `audit.js` | new | `export const auditBacklog = []`, `resetAuditBacklog()` (`auditBacklog.length = 0`), `replaceAuditBacklog(items)` (`splice` in place) |
| `constants.js` | `js/constants.js` | every top-level `const` as a named export |
| `names_data.js` | `names.js` | `export const SYSTEM_NAMES = [...]` (generated by a sibling of `gen_rules_esm.js`, gitignored) |

| Legacy | ESM |
|---|---|
| `window.isLoggingEnabled` / `window.batchLogData` / `window.logIndentLevel` | `trace.enabled` / `trace.lines` / `trace.indent` |
| `window.generationX` | `settings.generationX` |
| `window._currentSystemHasPop` | `genState.currentSystemHasPop` |
| `window.auditBacklog` (reads, `push`) | `auditBacklog` |
| `window.auditBacklog = []` or `= <array>` (nine reassignment sites) | `resetAuditBacklog()` or `replaceAuditBacklog(items)`; an imported binding is read-only and bundlers reject assignment to it (found by wrangler on 2026-10-03) |
| `localStorage.getItem('traveller_gen_seed')` (`core.js:180`) | removed; `masterSeed` starts as `'TravellerMagnus'` |

`rng` is reassigned by `reseedForHex`; ESM live bindings keep importers current. Keep
`export let rng`; never re-export it through an object.

**Check:** `tests/golden/esm.test.js` (§7.1) asserts `hashString('TravellerMagnus-1-A-0101')`
equals the oracle's value.

---

## 7. Engines, one file at a time, parity after each

### 7.1 `tests/golden/esm.test.js`

Imports cases from `tests/golden/cases_esm.js` (which imports `@voyage/engines`) and compares
each to the **same fixture** the legacy run wrote. Cases not yet converted are listed in
`pending` and reported as skipped, never failing.

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stable } from '../../packages/shared/src/stable.ts';
import { cases, pending } from './cases_esm.js';
const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
for (const name of pending) test(`esm ${name}`, { skip: 'pending conversion' }, () => {});
for (const [name, fn] of Object.entries(cases))
    test(`esm ${name} matches legacy fixture`, async () => assert.equal(stable(await fn()), fs.readFileSync(path.join(FIX, name + '.json'), 'utf8')));
```

### 7.2 Conversion rules (mechanical; apply all, in order, to a copied file)

1. Copy `js/<file>.js` to `packages/engines/src/<file>.js`.
2. Delete the UMD wrapper head and tail; remove `'use strict'`.
3. For each factory parameter and each `root.X`/`window.X` read of a sibling engine, add an import.
4. Replace `root.Name = factory(...)` / `window.Name = …` with `export` on the definitions.
5. Apply the §6 substitutions. `typeof X === 'function' ? X : fallback` guards become a direct
   import; the fallback is deleted (`universal_math.js:156-157`, the four `t5_*` `_rng`
   fallbacks, every `_log = typeof writeLogLine === 'function' ? … : console.log`).
6. Rules tables: `import { MgT2EData } from './generated/rules/mgt2e_data.js'` and so on.
7. The two map-state couplings: `mgt2e_socio_engine.js:523` reads `hexStates.get(sys.hexId).t5Socio`
   → add parameter `priorT5Socio = null` to `generateExtendedSocioeconomics` and thread it through
   **every** caller that has a hex state: `expandLoadedSocioeconomics(hexKey, state)` passes
   `state.t5Socio`; `generateMgT2ESystemTopDown(hexKey, profile, priorT5Socio = null)` gains the
   parameter and passes it on; `mgt2e_build.buildOne(state, hexKey)` passes `state.t5Socio` on the
   flesh path. Bare generation passes nothing, which equals the legacy case of no hex state.
   `rtt_engine.js:2164` `expandRTTBiographerOnly(hexId)` → `expandRTTBiographerOnly(sys)`.
8. Do **not** reformat, rename, reorder or clean up anything else. Any rule-level change is a
   Halt & Challenge.

### 7.3 Order (one line per step; `npm test` after each; stop at the first failure)

1. `universal_math.js`, `mgt2e_math.js`, `ct_constants.js`, `ct_physical_library.js`, `seed_restoration.js`
2. `mgt2e_stellar_engine.js` → `mgt2e_world_engine.js` → `mgt2e_socio_engine.js` → `mgt2e_uwp_auditor.js`
3. `mgt2e_topdown_generator.js` → `mgt2e_bottomup_generator.js`; plus `mgt2e_build.js` from
   `macro_orchestrator.js:10-48, 195-258` (`computeSystemCounts`, `profileOf`, `systemReady`,
   `buildStage`, `storeBuild`, and `buildOne(state, hexKey)` = `_buildOneMgtHex` without `hexStates`)
   — enable the `mgt2e_*` cases
4. `ct_*` in load order → `ct_system_driver.js` — enable `ct_*`
5. `t5_*` in load order → `system_driver.js` — enable `t5_topdown`
6. `rtt_engine.js` — enable `rtt_bottomup`
7. `aow_*` in load order — enable `aow_bottomup`
8. `statistical_auditor.js`; then `src/index.js` re-exports everything.

**Check after every step:** `npm test` green, `npm run check` clean. **If an ESM case differs:**
stop; report the file, the first differing path and both values. Do not adjust either side.

---

## 8. `packages/shared` — wire shapes and parsers

`src/index.ts` re-exports:

- `stable.ts` (§2.1).
- `schemas/envelope.ts`: `Ok<T>`, `Fail`, `ErrorCode` (the `api.md` table), zod.
- `schemas/user.ts`: `User` with `role`.
- `schemas/hex.ts`: `HexSummary` (the indexed columns: `type, name, uwp, allegiance, zone,
  bases, tradeCodes, pbg, ix` plus `summary` record) and `TreeEnvelope`
  (`{ kind: 'tree', engineVersion, derivation: { edition, mode, seed, settings, inputs }, hexKey, body }`).
  The `body` is the engine-owned document validated by hash and size (`data_model.md` §1);
  `HexState` is `TreeEnvelope['body']` typed from `@voyage/engines` output types as they gain them.
- `schemas/overlay.ts`: `OverlayDoc` per `data_model.md` §6.
- `schemas/truth.ts`: `TruthManifest`, `SectorIndex`.
- `schemas/package.ts`: `PackageManifest`.
- `schemas/generate.ts`: `GeneratePreview`, `GenerateRequest`, `GenerateSector`, `TruthBuild`.
- `parsers/t5tab.ts`: `parseT5Tab(text): Map<hhhh, HexSummaryRow>` written from TravellerMap's
  documented tab-delimited "Second Survey" columns (`Hex, Name, UWP, Bases, Remarks, Zone, PBG,
  Allegiance, Stars, {Ix}, (Ex), [Cx], Nobility, W, RU` and the optional `SS`, `Sector`). Output
  shape equals the legacy parser's state per hex **minus** the legacy slot prefix, with one
  deliberate difference decided 2026-10-03: **a parser never rolls dice.** The legacy importer
  called `parseT5HomestarString`, which rolls `1D` for each companion star's orbit against the
  session RNG stream (`js/t5_topdown_generator.js`), so imported star orbits depended on what had
  been generated earlier in the browser session. The new parser emits the parsed star tokens with
  `orbitID: null` for companions and contains no RNG at all. Orbit placement is generation:
  `packages/engines/src/core/stars.js` exports `placeCompanionOrbits(stars, hexKey)` using the
  same dice (`Close: 1D-1`, `Near: 5+1D`, `Far: 11+1D`) drawn from a local
  `mulberry32(hashString(masterSeed + '-' + hexKey + '-stars'))`, so the main stream and every
  engine fixture are untouched; `packages/generation.generateHex` calls it before building. The
  ESM `parse_t5tab` case compares against the legacy fixture with companion `orbitID` masked and
  says why in a comment; `tests/shared/stars.test.js` asserts the parser emits null orbits and
  that placement is deterministic per hex key and independent of row order.
- `parsers/metadata_xml.ts`: `parseMetadataXml(text): { routes, borders, names, allegiances }`
  from TravellerMap's metadata XML using a dependency-free XML tokenizer (`fast-xml-parser` is
  acceptable if the tokenizer exceeds 200 lines; record the choice).

`tests/shared/t5tab.test.js`: parses `cases.TSV` and compares to `fixtures/parse_t5tab.json`
after stripping the `1-` prefix from the legacy keys. `tests/shared/metadata_xml.test.js`:
parses `universe/raw/Spinward_Marches.xml` and asserts counts of routes and borders equal the
legacy case if it exists, otherwise asserts against hand-counted values from the file (state
them in the test).

**Check:** `npm test` green including both parser tests; `npm run check` clean on
`packages/shared/src`.

---

## 9. `packages/generation` — the one generation code path

Pure functions, no I/O, used by the Worker (inline and Queue consumers) and by the Node runner.

```ts
export type Pinned = { seed: string; settings: Settings; engineVersion: string };
export function generateHex(input: { hexKey: string; edition: Edition; mode: Mode; stage?: Stage; summary: HexSummary; pinned: Pinned; priorBody?: HexBody }): TreeEnvelope;
export function buildSector(input: { slug: string; tsv: string; metadataXml?: string; pinned: Pinned }): { index: SectorIndex; objects: Map<string /*hash*/, string /*stable json*/> };
```

- `generateHex` sets `settings` and the seed through `@voyage/engines` core (`configure`,
  `setRandomSeed`, `reseedForHex(hexKey)`), runs the edition's path (Mongoose via
  `mgt2e_build.buildOne`, CT and T5 via `system_driver`, RTT and AoW via their generators),
  strips view state, and returns the envelope. The legacy hex id passed to the engines is the
  `hexKey` string itself; seeds therefore differ from the legacy app for the same hex, which is
  expected and recorded in the report.
- `buildSector` parses the TSV with `@voyage/shared`, runs `generateHex` for every
  `SYSTEM_PRESENT` row in the Mongoose staged path, hashes each envelope with `stable` +
  `sha256Hex`, and returns the index (`data_model.md` §5) and the object map.

`tools/truth/build.js` (Node runner, local verification only): for each `universe/raw/*.tsv`
call `buildSector` and write `truth-local/<version>/...` and `truth-local/objects/<hash>.json`.
`tests/generation/parity.test.js`: for the fixture TSV, `buildSector` in Node produces a tree
for `1910` whose stable JSON equals the oracle's `mgt2e_flesh_from_tsv` fixture **body** once
both are keyed the same way (the oracle used hex id `1-1910`; run the oracle case again with the
hex id set to `Spinward_Marches/1910` for this comparison so seeds match).

**Check:** `npm run truth:local` runs twice with identical hash output (`tools/truth/hash.js`
over `truth-local/`) and `failed: []`; the parity test passes; sizes reported (objects, bytes,
largest, elapsed).

---

## 10. The Worker — `apps/api`

### 10.1 Files

```
apps/api/package.json       { "name": "@voyage/api", "private": true, "type": "module",
                              "scripts": { "dev": "wrangler dev", "deploy": "wrangler deploy",
                                           "db:generate": "drizzle-kit generate",
                                           "db:migrate:local": "wrangler d1 migrations apply voyage --local",
                                           "db:migrate": "wrangler d1 migrations apply voyage --remote" },
                              "dependencies": { "hono": "^4", "drizzle-orm": "^0.45.3", "better-auth": "^1", "@better-auth/drizzle-adapter": "^1", "zod": "^3",
                                                "@voyage/shared": "*", "@voyage/engines": "*", "@voyage/generation": "*" },
                              "devDependencies": { "drizzle-kit": "^0.31.11", "wrangler": "^4", "typescript": "^5", "@cloudflare/workers-types": "^4" } }
                            Drizzle is pre-1.0: a caret on 0.x moves only the patch digit, so the minor is pinned here on purpose.
                            zod stays ^3 to match packages/shared; zod 4 is a different API and is not adopted in slice 0.
apps/api/wrangler.toml      copy architecture.md §6 verbatim; database_id filled in by Johnny
apps/api/drizzle.config.ts  { schema: './src/db/schema.ts', out: './src/db/migrations', dialect: 'sqlite' }
apps/api/tsconfig.json      ES2022, ESNext, Bundler, types ["@cloudflare/workers-types"], strict
apps/api/src/index.ts       Hono app; exports default { fetch, queue, scheduled }; exports UniverseDO
apps/api/src/env.ts         Env type: DB, ASSETS, UNIVERSE, PRIVATE_BUCKET, PUBLIC_BUCKET, GENERATE_QUEUE, PUBLISH_QUEUE, TRUTH_QUEUE, METRICS, vars, secrets
apps/api/src/http.ts        ok(c, data, status?), fail(c, status, code, message, details?), requestId middleware, JSON log line per request
apps/api/src/db/schema.ts   data_model.md §2: users, oauth_accounts, sessions, truth_versions, truth_systems (+ FTS5 via raw SQL migration), audit_log
apps/api/src/db/migrations/ generated; plus one hand-written migration for the FTS5 table and triggers
apps/api/src/auth/auth.ts      createAuth(env): betterAuth({ database: drizzleAdapter(db, { provider: 'sqlite', schema }), baseURL: env.BETTER_AUTH_URL,
                               secret: env.BETTER_AUTH_SECRET, socialProviders: { twitter?, discord?, google? } (each present only when its two secrets exist; X is `twitter` in better-auth and is the first one configured),
                               plugins: [admin()], session: { expiresIn: 30 days, updateAge: 1 day } }). Built per request because bindings arrive per request.
apps/api/src/auth/session.ts   requireUser, requireRole(role): call auth.api.getSession({ headers: c.req.raw.headers }) and attach user (id, email, role)
apps/api/src/auth/options.ts   `export const authOptions = (env) => ({ ...everything except database })`: baseURL, secret, socialProviders built from env, plugins [admin()], session { expiresIn, updateAge }
apps/api/src/auth/auth.cli.ts  CLI-only: `export const auth = betterAuth({ ...authOptions(process.env), database: drizzleAdapter(drizzle({} as any), { provider: 'sqlite' }) })`. Never imported by the Worker; exists so the schema generator can read the plugins.
apps/api/src/db/auth-schema.ts generated by `npx auth@<installed better-auth version> generate --config apps/api/src/auth/auth.cli.ts --output apps/api/src/db/auth-schema.ts`
                               (the `auth` package is better-auth's CLI for 1.7+; `@better-auth/cli` is deprecated). Tables: user (+ admin plugin columns), session, account, verification. Imported into schema.ts.
                               Adapter import is `@better-auth/drizzle-adapter` (the documented package for the installed version); add it to dependencies.
apps/api/src/routes/health.ts  GET /health
apps/api/src/routes/auth.ts    start, callback, signout, me
apps/api/src/routes/generate.ts POST /generate/preview
apps/api/src/routes/truth.ts   GET /truth/versions, GET /truth/search
apps/api/src/routes/admin.ts   POST /admin/truth/build, GET /admin/truth/builds/:version, POST /admin/truth/release/:version
apps/api/src/jobs/truth_build.ts  queue consumer for voyage-truth-build
apps/api/src/universe/UniverseDO.ts  class with schema migration on construct; fetch() returns 501 until slice 2
apps/api/src/universe/schema.ts      data_model.md §3 tables (Drizzle durable-sqlite); campaign tables arrive in slice 3
apps/api/.dev.vars                   local secrets (gitignored)
```

If a version range does not resolve, report the exact npm error and the latest version npm
shows; do not pick a different library.

### 10.2 `src/index.ts`

```ts
import { Hono } from 'hono';
import type { Env } from './env';
import { requestContext } from './http';
import { health } from './routes/health';
import { auth } from './routes/auth';
import { generate } from './routes/generate';
import { truth } from './routes/truth';
import { admin } from './routes/admin';
import { truthBuildConsumer } from './jobs/truth_build';
import { fail } from './http';
export { UniverseDO } from './universe/UniverseDO';

const app = new Hono<{ Bindings: Env }>();
app.use('*', requestContext);                 // request id + one JSON log line per request
app.route('/api', health);
app.route('/api/auth', auth);
app.route('/api', generate);
app.route('/api/truth', truth);
app.route('/api/admin', admin);
app.onError((err, c) => { console.error(JSON.stringify({ requestId: c.get('requestId'), err: String(err), stack: (err as Error).stack })); return fail(c, 500, 'internal', 'Something went wrong.', { requestId: c.get('requestId') }); });
app.notFound((c) => c.req.path.startsWith('/api/') ? fail(c, 404, 'not_found', 'No such route.') : c.env.ASSETS.fetch(c.req.raw));

export default {
    fetch: app.fetch,
    async queue(batch: MessageBatch, env: Env) { if (batch.queue === 'voyage-truth-build') await truthBuildConsumer(batch, env); else batch.ackAll(); },
    async scheduled() { /* slice 2: snapshots and GC */ }
};
```

### 10.3 Health, auth, truth, admin

- `GET /api/health`: `SELECT 1`; returns `{ version, engineVersion, truthVersion, db: 'ok' }`.
  `engineVersion` is `@voyage/engines` `package.json` version imported as JSON.
- Auth per `api.md` slice 0 with better-auth. `src/index.ts` mounts
  `app.on(['GET', 'POST'], '/api/auth/*', (c) => createAuth(c.env).handler(c.req.raw))` before
  the other routes. `GET /api/me` uses `requireUser` and returns the session user joined with
  our `profile` row (created on first sight with `handle` derived from the provider name, made
  unique with a numeric suffix). `requireRole('admin')` reads `user.role`. A provider is
  registered only when both of its secrets exist in `env`; with none, `/api/auth/sign-in/social`
  returns better-auth's own error and `/api/me` still returns 401. Follow the better-auth
  Cloudflare Workers and Drizzle documentation for the exact adapter and CLI invocation; if the
  installed version's API differs from this description, stop and report the difference rather
  than improvising.
- `truth_versions` carries the build inputs as columns (`milieu`, `seed`, `settings`, `sectors`,
  `sectors_failed`; `data_model.md` §2). Nothing is stashed in `notes`.
- `GET /api/truth/versions`: rows of `truth_versions` with `state = 'released'`.
- `GET /api/truth/search?q=&version=`: FTS5 `MATCH` on `truth_systems_fts`, limit 50.
- `POST /api/admin/truth/build` (admin): validates `TruthBuild`, inserts `truth_versions`
  (`state = 'building'`), reads sector inputs from the private bucket at
  `inputs/<version>/<slug>.tsv|.xml` (uploaded by Johnny with `wrangler r2 object put`; the
  fetch script in `utilities/build_universe_snapshot/fetch.js` produces them), and sends one
  message per sector to `TRUTH_QUEUE`. Returns 202 `{ version, sectors }`.
- `POST /api/admin/truth/release/:version` (admin): refuses unless `sectors_done ===
  sectors_total`; writes `truth/<version>/manifest.json`; sets `released`; audit logged.

### 10.4 `POST /api/generate/preview`

Validates `GeneratePreview`, calls `generateHex` from `@voyage/generation`, returns the
`TreeEnvelope` and its hash. Stateless. Rate limited per user (60/minute).

**Check:** with the fixture inputs from `tests/golden/cases.js`, the returned hash equals the
hash of the Node `generateHex` output for the same input (`tests/api/parity.test.js`, §11).

### 10.5 `src/jobs/truth_build.ts`

For each message `{ version, slug, pinned }`: read `inputs/<version>/<slug>.tsv` and `.xml`;
`buildSector`; for each object, `PUBLIC_BUCKET.head('objects/' + hash)` and `put` only when
absent, with `httpMetadata.cacheControl = 'public, max-age=31536000, immutable'` and
`contentType = 'application/json'`; put `truth/<version>/sectors/<slug>/index.json`; insert
`truth_systems` rows for the sector in one D1 batch; increment `sectors_done`. Write one
`METRICS` data point `{ job: 'truth-build', slug, systems, newObjects, ms }`. Throw on any
failure so Queues retries; after `max_retries` the message lands in `voyage-dlq` and the build
record shows the sector as failed.

### 10.6 Durable Object stub

`UniverseDO` extends `DurableObject<Env>`; the constructor runs
`ctx.blockConcurrencyWhile(() => migrate(ctx.storage))` where `migrate` creates the §3 tables
and FTS5 virtual tables if missing and sets `meta.schemaVersion = 1`. `fetch()` returns 501
until slice 2. This exists in slice 0 so the `[[migrations]]` tag ships and the schema is real.

**Checks:** `npm run dev:api`; `curl http://127.0.0.1:8787/api/health` → health envelope;
`/api/nope` → 404 envelope; `/api/me` → 401; `/api/auth/discord/start` without secrets → 503
`provider_unconfigured`; with Johnny's `.dev.vars`, sign-in works and `/api/me` returns the user
with `role: 'user'`. `/api/generate/preview` with a fixture input returns a tree and hash.

---

## 11. Tests for the Worker — `tests/api/`

Black box against `wrangler dev` on port 8799 spawned by the test (skipped with a clear
message if `wrangler` is absent):

- `health.test.js`: the four envelopes above.
- `parity.test.js`: for `mgt2e_topdown_bare`, `ct_bottomup`, `t5_topdown`, `rtt_bottomup`,
  `aow_bottomup`: Node `generateHex(input)` hash equals `POST /api/generate/preview` hash for
  the same input. This is the production determinism proof (same V8 runtime family; any
  difference is a Halt & Challenge).
- `truth_build.test.js`: against local R2 and D1, upload the fixture TSV as
  `inputs/vtest/Fixture.tsv`, call the admin build with a seeded admin user (a local-only
  `scripts/dev_make_admin.js` sets `role = 'admin'` on a user in the local D1), wait for the
  sector to finish, assert the index and at least one object exist in local R2 and that
  `truth_systems` has two rows.

**Check:** `npm test` runs all three green locally.

---

## 12. Truth v1 on the platform (Johnny runs; the implementer prepares)

0. wrangler 4 runs `r2 object put` and `get` against **local** emulation unless `--remote` is
   passed. Every script and command that touches a real bucket passes `--remote`; a missing
   flag put 1,025 files into `.wrangler/state` on 2026-10-03 before anyone noticed.
1. Inputs: `node tools/truth/fetch_inputs.js` pulls every sector with data from
   TravellerMap (512 on 2026-10-03, 399 canonical) into `universe/raw/` plus `sectors.json`; then
   `node tools/truth/upload_inputs.js v1` sends them to the private bucket under `inputs/v1/`.
   The legacy `utilities/build_universe_snapshot/fetch.js` and its 128-sector list are retired.
2. Johnny calls `POST /api/admin/truth/build` with `{ version: 'v1', milieu: 'M1105', engineVersion, seed, settings, sectors: [...every slug from sectors.json] }`, the values from `tools/truth/settings.js`. The job reads `inputs/v1/sectors.json` for each sector's name, coordinates and tags.
3. `GET /api/admin/truth/builds/v1` reaches `sectors_done === sectors_total`; Johnny calls release.

**Check:** `https://cdn.traveller.voyage/truth/v1/manifest.json` loads with the immutable
header; one `objects/<hash>.json` named in a sector index loads; `GET /api/truth/search?q=Regina`
returns Regina. Local verification: the object hash for `Spinward_Marches/1910` in the platform
index equals the one `npm run truth:local` produced.

---

## 13. CI and deploys — Workers Builds plus a test workflow

Decided 2026-10-03: deploys are done by **Cloudflare Workers Builds** connected to the git
repository, not by GitHub Actions with an API token. GitHub Actions runs only tests and the
manifesto check, which need no Cloudflare credentials.

### 13.1 Workers Builds (Johnny, dashboard)

Workers & Pages → `voyage` → Settings → Builds → Connect to Git → the repository and the
production branch. Build configuration:

The connect form has no root-directory field, so commands run at the repository root and
point wrangler at the config (connected 2026-10-03, production branch `campaign`):

| Setting | Value |
|---|---|
| Build command | `npm ci && npm run build` |
| Deploy command | `npm run deploy:ci` (the root script runs the migrations then `wrangler deploy`, both with `--config apps/api/wrangler.toml`; the dashboard field wraps long commands into real line breaks, so it holds only the script name) |
| Preview command | `npm run preview:ci` |

Wrangler resolves `main`, the assets directory and `migrations_dir` relative to the config
file, so nothing in `wrangler.toml` changes. `npm run build` at the root runs `rules:gen`, the
shared build and the web build, so `apps/web/dist` exists when `wrangler deploy` reads it.
Migrations run before the deploy so a new Worker never runs ahead of its schema. Secrets stay
on the Worker; the build needs none.

### 13.2 `.github/workflows/test.yml` (implementer)

On pull request and on push to the production branch: checkout, Node 24, `npm ci`,
`npm run rules:gen`, `npm test`, `npm run check`. No deploy step, no secrets. `npm test`
skips the `tests/api` black-box suite unless `RUN_API_TESTS=1`; running `wrangler dev` in
CI is slice 1's job.

**Check:** a push to the production branch shows a green test workflow on GitHub and a
successful build in Workers & Pages → `voyage` → Deployments, and `/api/health` reports the
new version. A pull request shows the test workflow and a preview deployment URL.

---

## 14. Deploy to traveller.voyage (Johnny)

`wrangler login`; `wrangler d1 create voyage` → `database_id`; `wrangler r2 bucket create voyage-public`
and `voyage-private`; `wrangler queues create voyage-generate`, `voyage-publish`,
`voyage-truth-build`, `voyage-dlq`; `wrangler secret put` × 5 (`BETTER_AUTH_SECRET` and the four provider values); custom domains
`traveller.voyage` (Worker) and `cdn.traveller.voyage` (public bucket) in the dashboard;
`npm run build`; `npm --workspace apps/api run db:migrate`; `npm run deploy`; sign in once, then set the first
admin with `wrangler d1 execute voyage --remote --command "UPDATE user SET role='admin' WHERE email='…'"`
(the one manual SQL in the product's life; every later role change goes through the better-auth
admin plugin or `/api/admin/users/:id/role`).

**Check:** `https://traveller.voyage/` shows the holding page; `/api/health` answers with
`db: 'ok'`; `/api/me` returns 401; `wrangler tail` shows request log lines with request ids.

---

## Deviations from legacy behaviour (recorded 2026-10-03 at the end of Track A)

The one place to look when a system built by the platform differs from the legacy app.
Every engine golden fixture is byte-equal; these are the only intentional differences.

| Where | Legacy | Now | Why |
|---|---|---|---|
| `rtt_engine.js` | two `getEHex` declarations; the browser hoisted the later one | only the later one exists | ESM rejects duplicate declarations; behaviour unchanged |
| `aow_bottomup_generator.js` | `require('./aow_socio_engine')` (file never existed); browser bound `MgT2ESocioEngine` | imports `mgt2e_socio_engine.js` | what the browser actually ran |
| every engine | `window.X = …` export blocks | ESM `export` | manifesto; `aow_seed_bridge.js` still reads a data property named `window` (allowlisted) |
| `packages/engines/src/index.js` | global names, some colliding | colliding names aliased: `generateSystem` (universal) vs `generateCTSystem`; `runAndLog{CT,MgT2E,T5,AoW}`; `generatePhysicals{CT,MgT2E,AoW}`; `finalizeSubordinateSocial{CT,MgT2E}`; `rollFlux` (core, 1D−1D) vs `rollFluxUniversal` (2D−7) | one barrel cannot export two names |
| TSV parser | rolled companion star orbits on the session RNG while importing | parser emits `orbitID: null`; `core/stars.js placeCompanionOrbits` rolls the same dice from a per-hex seed in generation | a parser never rolls dice; legacy orbits depended on session history |
| `setRandomSeed` | `console.log` | `trace.writeLogLine` | logging goes through the trace sink |
| hex ids as seeds | `1-C-1910` | `Spinward_Marches/1910` | identity is sector slug plus hex; truth v1 systems therefore differ from the legacy snapshot's rolls for the same world |

---

## Verification list (all must be true before slice 0 is done)

- [ ] `npm test`: every legacy case deterministic and matching its committed fixture
- [ ] `npm test`: every ESM case byte-equal to the legacy fixture; none pending at the end of §7
- [ ] `npm test`: parser parity, generation parity (Node vs oracle), Worker parity (Node vs Worker) green
- [ ] `npm run check`: clean on every `apps/*/src` and `packages/*/src`
- [ ] `npm run rules:gen`: all five rules files export their names; `git status rules/` empty
- [ ] `npm run truth:local` twice: identical hash; `failed: []`; sizes reported
- [ ] `npm run build` writes `apps/web/dist`; the holding page uses only tokens
- [ ] `npm run dev:api` answers health against local D1; Durable Object migration applied (`wrangler tail` or local log)
- [ ] CI green on a pull request; preview deploy answers `/api/health`
- [ ] `git status js/ hex_map.html style.css rules/` shows nothing changed by this slice
- [ ] Johnny: production `/api/health` answers; truth v1 released; `cdn.traveller.voyage/truth/v1/manifest.json` loads; search finds Regina
- [ ] Report lists: oracle stubs added, the TODO cases resolved or skipped with reasons, the two settings defaults as decided by Johnny, any dependency or wrangler key that had to be reported, every Halt & Challenge item

## Tuning knobs

- Fixture hex ids and TSV rows in `cases.js`
- `cpu_ms`, queue batch sizes, inline generation cap (64)
- Which sectors are in `universe/raw/` and therefore in `inputs/v1/`
- The allowlist for `check_manifesto.js`, as long as each entry names a reason

## Halt & Challenge items this recipe already raises

1. (closed 2026-10-02) `generationNoTravelZones = false`, `generationPopCheckFrequency = 100`: rules as written, equal to the legacy defaults (§3)
2. Any non-determinism (§2.5), any ESM/legacy difference (§7.3), any Node/Worker difference (§11)
3. Any `wrangler.toml` key or dependency version the installed tooling rejects (§10)
4. (closed 2026-10-02) `parseXmlRouteGroups` needs a browser DOM; the new XML parser is verified against the documented schema instead (§2.3, §8)

## Needed from Johnny before §10.3, §12 and §14 can finish

- X (Twitter) OAuth 2.0 app credentials with redirect URI `https://traveller.voyage/api/auth/callback/twitter` registered; Discord and Google later
- `wrangler login`; D1 id; two buckets; four queues; two custom domains; the repository connected to Workers Builds
- The first admin handle
