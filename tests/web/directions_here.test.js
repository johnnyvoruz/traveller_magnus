/**
 * DN2 (streams/D.md): Directions from here and to here, beside the system panel. The state the system panel and
 * the panel share (an ask fills one box, the focus goes to the other; Full shows the system panel at Column),
 * the boxes' system suggestions (the top search's route, systems only, a pick fills with that system), the
 * pinned ends the planner reads, the replan on any change, the menu and the two buttons, "Use <name>" for the
 * open system, and the fold on a phone.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { bothEnds, blankForm, boxEnd, directions } from '../../apps/web/src/map/directions.ts';
import { closeDirections, directionsHere, directionsState, emptyBox, openDirections, otherBox, toggleDirections } from '../../apps/web/src/map/directions_state.ts';
import { suggestEnds, SUGGESTION_CAP } from '../../apps/web/src/map/directions_search.ts';
import { holdSpan, readSpan, releaseSpan } from '../../apps/web/src/shell/panel_state.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const webRoot = path.join(root, 'apps', 'web');
const read = (rel) => fs.readFileSync(path.join(webRoot, 'src', rel), 'utf8');

function sector(slug, name, x, y, rows) {
    const hexes = {};
    for (const row of rows) hexes[row.hex] = { name: row.name ?? '', uwp: row.uwp, zone: row.zone ?? '', pbg: row.pbg ?? '000' };
    return { slug, name, x, y, hexes };
}

// Two systems called Twin: typed, the name finds neither; pinned, each is itself.
const reach = sector('West_Reach', 'West Reach', 0, 0, [
    { hex: '0205', name: 'Alpha', uwp: 'B555555-8' },
    { hex: '0105', name: 'Twin', uwp: 'B555555-8' },
    { hex: '0305', name: 'Twin', uwp: 'C555555-8' },
]);

afterEach(() => closeDirections());

describe('the state the system panel and the panel share', () => {
    test('From here opens Directions with an ask for that box; each ask is new; closing clears the ask and the route', () => {
        assert.equal(directionsState.open, false);
        directionsHere('from', { sector: 'West_Reach', hex: '0205' });
        assert.equal(directionsState.open, true);
        assert.deepEqual({ box: directionsState.ask.box, end: directionsState.ask.end }, { box: 'from', end: { sector: 'West_Reach', hex: '0205' } });
        const first = directionsState.ask.seq;
        directionsHere('to', { sector: 'West_Reach', hex: '0105' });
        assert.equal(directionsState.ask.box, 'to');
        assert.ok(directionsState.ask.seq > first);
        directionsState.stops = [{ sector: 'West_Reach', hex: '0205' }, { sector: 'West_Reach', hex: '0105' }];
        closeDirections();
        assert.equal(directionsState.open, false);
        assert.equal(directionsState.ask, null);
        assert.equal(directionsState.stops, null);
    });

    test('the focus goes to the other box; "Use <name>" fills From while empty, then To', () => {
        assert.equal(otherBox('from'), 'to');
        assert.equal(otherBox('to'), 'from');
        assert.equal(emptyBox({ from: '', to: '' }), 'from');
        assert.equal(emptyBox({ from: 'Alpha', to: ' ' }), 'to');
        assert.equal(emptyBox({ from: 'Alpha', to: 'Twin' }), null);
    });

    test('at Full, Directions shows the system panel at Column until it shuts; the toggle opens and shuts', () => {
        holdSpan('full');
        assert.equal(readSpan(), 'full');
        openDirections();
        assert.equal(readSpan(), 'column');
        toggleDirections();
        assert.equal(directionsState.open, false);
        assert.notEqual(readSpan(), 'full', 'the held Column is let go; the remembered span shows');
        releaseSpan();
        toggleDirections();
        assert.equal(directionsState.open, true);
    });
});

describe('the ends the planner reads', () => {
    test('a pinned box is its system while it says the pinned words; typed again, the words are read', () => {
        const pin = { label: 'Twin', end: { sector: 'West_Reach', hex: '0305' } };
        assert.deepEqual(boxEnd([reach], 'Twin', 'To').end, { sector: 'West_Reach', hex: '0105' }, 'typed, the first Twin');
        assert.deepEqual(boxEnd([reach], ' Twin ', 'To', pin), { ok: true, end: pin.end, label: 'Twin' });
        assert.deepEqual(boxEnd([reach], 'Twin ', 'To', pin).end, pin.end);
        assert.equal(boxEnd([reach], 'Twi', 'To', pin).ok, false, 'edited: the pin no longer holds, and two start so');
    });

    test('both ends set plans at once; a miss in either says nothing until both find one', () => {
        const form = { ...blankForm(), from: 'Alpha', to: 'Tw', jump: 1 };
        assert.equal(bothEnds([reach], form), false, 'two systems start with Tw');
        const pinned = { to: { label: 'Tw', end: { sector: 'West_Reach', hex: '0105' } } };
        assert.equal(bothEnds([reach], form, pinned), true);
        assert.equal(bothEnds([reach], { ...form, from: 'Alph', to: 'Twin' }), false, 'the start of a name still typed: not yet');
        assert.equal(bothEnds([reach], { ...form, from: 'alpha', to: 'West Reach 0305' }), true, 'a whole name, a sector and hex');
        const result = directions([reach], form, pinned);
        assert.equal(result.ok, true, result.message);
        assert.deepEqual(result.stops, [{ sector: 'West_Reach', hex: '0205' }, { sector: 'West_Reach', hex: '0105' }]);
        assert.deepEqual(directions([reach], { ...form, to: 'Alpha' }, {}), { ok: false, message: 'From and To are the same system.' });
    });

    test('the panel replans on any change of an end, the jump or the fuel, once both ends are set', () => {
        const panel = read('map/DirectionsPanel.vue');
        assert.match(panel, /watch\(\s+\(\) => \[form\.from, form\.to, form\.jump, form\.fuel, form\.scoops, form\.processors, form\.allowRed, pinned\.from, pinned\.to\],\s+\(\) => \{\s+if \(bothSettled\(props\.indexes\(\), props\.grid \? props\.grid\(\) : \[\], form, pinned\)\) void plan\(\);/, 'a plan by itself keeps the suggestions open');
        assert.match(panel, /fill\(ask\.box, ask\.end, endWords\(props\.indexes\(\), ask\.end\)\);\s+focusBox\(otherBox\(ask\.box\)\);/, 'an ask fills its box and the focus goes to the other');
        assert.doesNotMatch(panel, /data-directions-(from|to)-selected/, 'Use selected goes');
    });
});

describe('the boxes suggest systems', () => {
    const manifest = { sectors: [{ slug: 'Vland', name: 'Vland', canonical: true }, { slug: 'Fan', name: 'Fan Reach', canonical: false }] };
    const items = [
        { sectorSlug: 'Vland', hex: '0534', name: 'Khakkakum', uwp: 'C657768-8' },
        { sectorSlug: 'Fan', hex: '0101', name: 'Khakkar', uwp: 'X000000-0' },
        { sectorSlug: 'Vland', hex: '0431', name: 'Answerin', uwp: 'B584A85-E' },
    ];
    const stub = (body, seen = []) => ({
        chart: async () => ({ version: 'v10', manifest }),
        fetch: async (url) => { seen.push(url); return { ok: true, json: async () => body }; },
    });

    test('the top search\'s route on the released chart; systems only, best first, each with its system', async () => {
        const seen = [];
        const found = await suggestEnds('khak', undefined, stub({ ok: true, data: { items } }, seen));
        assert.deepEqual(seen, ['/api/truth/search?q=khak&version=v10']);
        assert.deepEqual(found.map((one) => one.label), ['Khakkakum', 'Khakkar', 'Answerin'].filter((name) => found.some((f) => f.label === name)));
        assert.deepEqual(found[0], { label: 'Khakkakum', detail: 'Vland 0534 · C657768-8', end: { sector: 'Vland', hex: '0534' } });
        assert.ok(found.every((one) => one.end && /^\d{4}$/.test(one.end.hex)), 'systems only');
    });

    test('a letter asks nothing; a failed search is no suggestions; never more than the cap', async () => {
        const seen = [];
        assert.deepEqual(await suggestEnds('k', undefined, stub({ ok: true, data: { items } }, seen)), []);
        assert.deepEqual(seen, []);
        assert.deepEqual(await suggestEnds('khak', undefined, stub({ ok: false })), []);
        assert.deepEqual(await suggestEnds('khak', undefined, { chart: async () => ({ version: 'v10', manifest }), fetch: async () => { throw new Error('offline'); } }), []);
        const many = Array.from({ length: 12 }, (_, i) => ({ sectorSlug: 'Vland', hex: String(1001 + i), name: 'Khak ' + i, uwp: 'C657768-8' }));
        assert.equal((await suggestEnds('khak', undefined, stub({ ok: true, data: { items: many } }))).length, SUGGESTION_CAP);
    });
});

describe('rendered', { concurrency: 1 }, () => {
    let server = null;
    let cacheDir = '';

    test.before(async () => {
        cacheDir = fs.mkdtempSync(path.join(tmpdir(), 'd-dirhere-'));
        const { createServer } = await import('vite');
        server = await createServer({ root: webRoot, cacheDir, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'silent' });
    });

    test.after(async () => {
        if (server) await server.close();
        if (cacheDir) fs.rmSync(cacheDir, { recursive: true, force: true, maxRetries: 5 });
    });

    async function render(file, props, url = '/') {
        const component = (await server.ssrLoadModule(file)).default;
        const { createSSRApp, h } = await import('vue');
        const { renderToString } = await import('vue/server-renderer');
        const { createMemoryHistory, createRouter } = await import('vue-router');
        const blank = { render: () => null };
        const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: blank }, { path: '/s/:sector/:hex', name: 'hex', component: blank }] });
        await router.push(url);
        await router.isReady();
        return (await renderToString(createSSRApp({ render: () => h(component, props) }).use(router))).replace(/<!--[\s\S]*?-->/g, '');
    }

    async function state() {
        return server.ssrLoadModule('/src/map/directions_state.ts');
    }

    test('the system panel: one Directions button with a menu while shut; From here and To here while open', async () => {
        const shared = await state();
        shared.closeDirections();
        const shut = await render('/src/map/DirectionsHere.vue', { hexKey: 'Vland/0534' });
        assert.match(shut, /aria-haspopup="menu" aria-expanded="false"[^>]*data-directions-here-menu/);
        assert.match(shut, />Directions\s*<\/button>/);
        assert.doesNotMatch(shut, /From here|To here/, 'the menu is shut');
        shared.openDirections();
        const open = await render('/src/map/DirectionsHere.vue', { hexKey: 'Vland/0534' });
        assert.match(open, /data-directions-here-from[^>]*>[\s\S]*?From here\s*<\/button>/);
        assert.match(open, /data-directions-here-to[^>]*>[\s\S]*?To here\s*<\/button>/);
        assert.doesNotMatch(open, /data-directions-here-menu/, 'no menu while open');
        shared.closeDirections();
        assert.equal(await render('/src/map/DirectionsHere.vue', { hexKey: 'not a hex' }), '');
    });

    test('the panel: "Use <name>" for the open system by the first empty box; none without one; folds on a phone', async () => {
        const indexes = () => [reach];
        const opened = await render('/src/map/DirectionsPanel.vue', { indexes }, '/s/West_Reach/0205');
        assert.match(opened, /data-directions-use="from"[^>]*>Use Alpha<\/button>/);
        assert.doesNotMatch(opened, /data-directions-use="to"/);
        assert.match(opened, /class="dir ui-frame is-tucked"/, 'a system open: the phone folds it');
        assert.match(opened, /data-directions-brief[\s\S]*?From → To/);
        const shared = await state();
        shared.directionsHere('from', { sector: 'West_Reach', hex: '0305' });
        const asked = await render('/src/map/DirectionsPanel.vue', { indexes }, '/s/West_Reach/0205');
        assert.match(asked, /value="West Reach 0305"[^>]*data-directions-from|data-directions-from[^>]*value="West Reach 0305"/, 'a shared name: the sector and hex');
        assert.match(asked, /data-directions-use="to"[^>]*>Use Alpha<\/button>/, 'From is filled: the offer moves to To');
        shared.closeDirections();
        const none = await render('/src/map/DirectionsPanel.vue', { indexes });
        assert.doesNotMatch(none, /data-directions-use/);
        assert.doesNotMatch(none, /is-tucked/);
    });

    test('pins: the system panel\'s rows carry it; the panel sits right of the system panel under the top bar', () => {
        const overview = read('dossier/DossierOverview.vue');
        assert.equal((overview.match(/<DirectionsHere v-if="[^"]*hexKey" :hex-key="hexKey" \/>/g) || []).length, 2, 'both action rows');
        const panel = read('map/DirectionsPanel.vue');
        assert.match(panel, /\.ui-frame\.dir \{[^}]*top: calc\(var\(--chrome-top\) \+ var\(--chrome-height\) \+ 8px\);[^}]*left: calc\(var\(--rail-width\) \+ max\(var\(--chrome-inset\), calc\(var\(--panel-width, 0px\) \+ 8px\)\)\);/);
        const phone = panel.slice(panel.indexOf('@media (max-width: 599px)'));
        assert.match(phone, /\.ui-frame\.dir\.is-tucked \{\s+top: auto;\s+bottom: calc\(var\(--chrome-inset\) \+ max\(var\(--sheet-cover, 0px\), env\(safe-area-inset-bottom, 0px\)\)\);/);
        assert.match(phone, /\.dir\.is-tucked \.dir-form,\s+\.dir\.is-tucked \.dir-said,\s+\.dir\.is-tucked \.dir-result \{\s+display: none;/);
        const view = read('views/MapView.vue');
        assert.match(view, /const directionsOpen = computed\(\(\) => directionsState\.open\);/, 'one open state for the chart and the system panel');
        assert.match(view, /watch\(\(\) => directionsState\.stops, \(stops\) => \{\s+directionsPoints = stops \? stopPoints\(stops, sectorOf\) : null;/);
        assert.equal((view.match(/directionsPoints = null;/g) || []).length, 1, 'the route drawn is cleared by closing alone: opening or closing systems never clears it');
        assert.doesNotMatch(view, /:selected="selectedEnd"/, 'Use selected goes');
        for (const rel of ['map/DirectionsHere.vue', 'map/directions_state.ts', 'map/directions_search.ts']) {
            const text = read(rel);
            assert.doesNotMatch(text, /#[0-9a-f]{3,6}\b/i, rel + ': tokens only');
            assert.doesNotMatch(text, /\bwindow\.|\bdocument\.|alert\(|confirm\(/, rel);
        }
    });
});
