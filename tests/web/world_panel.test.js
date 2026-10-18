/**
 * CW1: world-panel presentation. No rules change. Figures are display strings
 * the dossier already formats (formatTempFull) or StatRow shapes.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { formatTempFull } from '../../apps/web/src/design/units.ts';
import {
    SECTION_KEY,
    fieldSummary,
    foldId,
    hasTwilight,
    lightingOf,
    loadFolds,
    openFolds,
    presentRows,
    readFolds,
    recordsSummary,
    saveFolds,
    statCells,
    timePopoverCloses,
} from '../../apps/web/src/dossier/world_panel.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const webRoot = path.join(root, 'apps', 'web');

test('presentRows moves units into values and drops the three orbit fields', () => {
    const rows = presentRows([
        { label: 'Distance (AU)', text: '0.670' },
        { label: 'Tidally locked', text: 'Yes' },
        { label: 'Twilight zone', text: 'Yes' },
        { label: 'Orbital period (days)', text: '365.2' },
        { label: 'Axial tilt (°)', text: '0.5' },
        { label: 'Mass (M⊕)', text: '1.000' },
        { label: 'Atmospheric pressure (bar)', text: '1.00' },
        { label: 'High temperature', text: formatTempFull(304) },
        { label: 'Low temperature', text: formatTempFull(270) },
        { label: 'Trade codes', text: 'Ag (Agricultural)', chips: [{ code: 'Ag', name: 'Agricultural' }] },
    ]);
    assert.deepEqual(rows.map((row) => row.label + '\t' + row.text), [
        'Distance\t0.670 AU',
        'Axial tilt\t0.5°',
        'Mass\t1.000 M⊕',
        'Atmospheric pressure\t1.00 bar',
        'High temperature\t' + formatTempFull(304).split(' · ').slice(0, 2).join(' · '),
        'Low temperature\t' + formatTempFull(270).split(' · ').slice(0, 2).join(' · '),
        'Trade codes\tAg (Agricultural)',
    ]);
    assert.equal(rows.some((row) => row.text.endsWith(' K')), false);
});

test('statCells is the 3+2 world panel, with no kelvin', () => {
    const facts = [
        { label: 'Diameter', value: '8,000 km', note: '' },
        { label: 'Gravity', value: '1.00 G', note: '' },
        { label: 'Mean temp.', value: formatTempFull(288), note: '' },
        { label: 'Rotation', value: 'Tidally locked', note: '' },
        { label: 'Year', value: '365.2 d', note: '' },
        { label: 'Moons', value: '2', note: '' },
    ];
    const locked = statCells(facts, '365.2', true);
    assert.ok(locked);
    assert.deepEqual(locked.map((cell) => cell.label), ['Diameter', 'Gravity', 'Mean temp.', 'Rotation', 'Year']);
    assert.equal(locked[2].value.endsWith('°C'), true);
    assert.equal(locked[2].aside.endsWith('°F'), true);
    assert.equal(locked[2].value.includes(' K'), false);
    assert.equal(locked[3].aside, 'twilight band');
    assert.deepEqual(locked[4], { label: 'Year', value: '365.2', aside: 'std days' });
    const turning = statCells(facts.map((fact) => fact.label === 'Rotation' ? { ...fact, value: '24.0 h' } : fact), null, false);
    assert.ok(turning);
    assert.equal(turning[3].aside, '');
    assert.equal(turning[4].value, '365.2');
    assert.equal(turning[4].aside, 'std days');
    const years = statCells(facts.map((fact) => fact.label === 'Year' ? { ...fact, value: '2.1 yr' } : fact), null, false);
    assert.ok(years);
    assert.equal(years[4].aside, '');
    assert.equal(years[4].value, '2.1 yr');
    assert.equal(statCells(facts.slice(0, 2), null, false), null);
});

test('section memory, summaries, and the date popover', () => {
    assert.deepEqual(readFolds(null), openFolds());
    assert.deepEqual(readFolds('not json'), openFolds());
    assert.equal(readFolds('{"orbit":false,"life":true,"nope":false}').orbit, false);
    assert.equal(readFolds('{"orbit":false}').records, true);
    assert.equal(fieldSummary(1), '1 field');
    assert.equal(fieldSummary(7), '7 fields');
    assert.equal(recordsSummary(0), 'None yet');
    assert.equal(recordsSummary(1), '1 record');
    assert.equal(recordsSummary(3), '3 records');
    assert.equal(foldId('Life & resources'), 'life');
    assert.equal(foldId('World profile'), null);
    assert.equal(hasTwilight([{ label: 'Twilight zone', text: 'Yes' }]), true);
    assert.equal(timePopoverCloses({ go: true, key: '', inside: true }), true);
    assert.equal(timePopoverCloses({ go: false, key: 'Escape', inside: true }), true);
    assert.equal(timePopoverCloses({ go: false, key: '', inside: false }), true);
    assert.equal(timePopoverCloses({ go: false, key: 'Enter', inside: true }), false);
    const light = lightingOf('Enhanced · Water · locked, night side centred');
    assert.deepEqual(light, { info: 'Enhanced · Water', light: 'Night side centred' });
    assert.deepEqual(lightingOf('Enhanced · Water'), { info: 'Enhanced · Water', light: '' });

    const mem = new Map();
    const previous = globalThis.localStorage;
    globalThis.localStorage = {
        getItem(key) { return mem.has(key) ? mem.get(key) : null; },
        setItem(key, value) { mem.set(key, String(value)); },
        removeItem(key) { mem.delete(key); },
        clear() { mem.clear(); },
        key() { return null; },
        get length() { return mem.size; },
    };
    try {
        saveFolds({ records: true, orbit: false, physical: true, life: false });
        assert.equal(mem.has(SECTION_KEY), true);
        const again = loadFolds();
        assert.equal(again.orbit, false);
        assert.equal(again.life, false);
        assert.equal(again.physical, true);
        globalThis.localStorage.setItem = () => { throw new Error('blocked'); };
        saveFolds(openFolds());
        assert.equal(loadFolds().orbit, false);
    } finally {
        if (previous === undefined) delete globalThis.localStorage;
        else globalThis.localStorage = previous;
    }
});

function world(locked) {
    return {
        title: locked ? 'Youghal' : 'Jewell',
        crumbSystem: 'System',
        crumbParent: null,
        place: 'System · Hex 0000',
        ribbon: null,
        mapBadge: locked ? 'Mainworld' : '',
        facts: [
            { label: 'Diameter', value: '8,000 km', note: '' },
            { label: 'Gravity', value: '1.00 G', note: '' },
            { label: 'Mean temp.', value: formatTempFull(288), note: '' },
            { label: 'Rotation', value: locked ? 'Tidally locked' : '24.0 h', note: '' },
            { label: 'Year', value: '365.2 d', note: '' },
            { label: 'Moons', value: '1', note: '' },
        ],
        journey: [{ g: 1, hours: '1h' }],
        mainSections: [{ heading: 'World profile', rows: [{ label: 'Starport', text: 'A' }] }],
        sideSections: [
            {
                heading: 'Orbit',
                rows: [
                    { label: 'Distance (AU)', text: '0.670' },
                    { label: 'Tidally locked', text: 'Yes' },
                    { label: 'Twilight zone', text: 'Yes' },
                    { label: 'Orbital period (days)', text: '365.2' },
                    { label: 'Axial tilt (°)', text: '0.5' },
                ],
            },
            {
                heading: 'Physical',
                rows: [
                    { label: 'Mass (M⊕)', text: '1.000' },
                    { label: 'High temperature', text: formatTempFull(304) },
                    { label: 'Low temperature', text: formatTempFull(270) },
                ],
            },
            { heading: 'Life & resources', rows: [{ label: 'Habitability', text: 'Known' }] },
        ],
        moons: [],
        worlds: [],
        socio: null,
        glyph: { kind: 'world', star: '' },
        index: 12,
        total: 22,
        prev: null,
        next: null,
    };
}

describe('world panel render', { concurrency: 1 }, () => {
    let server = null;
    let cacheDir = '';

    before(async () => {
        cacheDir = fs.mkdtempSync(path.join(tmpdir(), 'c-cw1-ssr-'));
        const { createServer } = await import('vite');
        server = await createServer({
            root: webRoot,
            cacheDir,
            server: { middlewareMode: true, hmr: false, ws: false },
            appType: 'custom',
            logLevel: 'silent',
        });
    });

    after(async () => {
        if (server) await server.close();
        if (cacheDir) fs.rmSync(cacheDir, { recursive: true, force: true });
    });

    async function htmlOf(file, props) {
        const component = (await server.ssrLoadModule(file)).default;
        const { createSSRApp } = await import('vue');
        const { renderToString } = await import('vue/server-renderer');
        return renderToString(createSSRApp(component, props));
    }

    test('a locked world and a rotating world at column, half, and full', async () => {
        for (const span of ['column', 'half', 'full']) {
            for (const locked of [true, false]) {
                const html = await htmlOf('/src/dossier/DossierBody.vue', {
                    model: world(locked),
                    span,
                    restated: { Year: [{ value: '365.2', notes: ['standard days (24 h)'] }] },
                    surface: null,
                });
                assert.match(html, new RegExp('data-span="' + span + '"'));
                assert.match(html, /class="doss-figurepanel"/);
                assert.match(html, /aria-expanded="true"/);
                assert.match(html, /id="doss-fold-orbit"/);
                assert.match(html, /0\.5°/);
                assert.match(html, /0\.670 AU/);
                assert.equal(html.includes('doss-daynight'), false);
                assert.equal(html.includes('Scout survey'), false);
                assert.equal(html.includes('Twilight zone'), false);
                assert.equal(html.includes('Orbital period'), false);
                assert.equal(html.includes('>Moons<'), false);
                assert.equal(/\d[\d,]* K/.test(html), false, span + ' ' + locked);
                assert.equal(html.includes('doss-timebar'), false);
                if (locked) assert.match(html, /twilight band/);
                else assert.equal(html.includes('Tidally locked'), false);
            }
        }
    });

    test('the time row is one control when the world rotates, and absent when it is locked', async () => {
        const locked = await htmlOf('/src/dossier/SurfaceTimeBar.vue', {
            nowDays: 0, localTime: null, locked: true, averaged: false,
        });
        assert.equal(locked.includes('doss-timebar'), false);
        assert.equal(locked.includes('aria-haspopup'), false);
        const turning = await htmlOf('/src/dossier/SurfaceTimeBar.vue', {
            nowDays: 0, localTime: '06:14', locked: false, averaged: true,
        });
        assert.match(turning, /aria-haspopup="dialog"/);
        assert.match(turning, /aria-expanded="false"/);
        assert.match(turning, /aria-label="Surface map time"/);
        assert.equal(turning.includes('class="doss-timebar-read"'), false);
        assert.equal(turning.includes('day-averaged'), false);
        assert.equal(turning.includes('locked to its star'), false);
        assert.match(turning, /06:14/);
    });

    test('a closed section keeps aria-expanded false and hides its body', async () => {
        const html = await htmlOf('/src/dossier/WorldSection.vue', {
            title: 'Orbit', open: false, bodyId: 'doss-fold-orbit', summary: '7 fields',
        });
        assert.match(html, /aria-expanded="false"/);
        assert.match(html, /aria-controls="doss-fold-orbit"/);
        assert.match(html, /7 fields/);
        assert.equal(html.includes('id="doss-fold-orbit"'), false);
        const open = await htmlOf('/src/dossier/WorldSection.vue', {
            title: 'Orbit', open: true, bodyId: 'doss-fold-orbit', summary: '7 fields',
        });
        assert.match(open, /aria-expanded="true"/);
        assert.match(open, /id="doss-fold-orbit"/);
        assert.equal(open.includes('7 fields'), false);
    });

    test('the pager slot sits in the header', async () => {
        const Panel = (await server.ssrLoadModule('/src/shell/Panel.vue')).default;
        const { createSSRApp, h } = await import('vue');
        const { renderToString } = await import('vue/server-renderer');
        const { createMemoryHistory, createRouter } = await import('vue-router');
        const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div></div>' } }] });
        await router.push('/');
        await router.isReady();
        for (const span of ['column', 'half', 'full']) {
            const app = createSSRApp({
                render() {
                    return h(Panel, { open: true, title: 'Youghal', meta: 'Youghal system · Hex 3039', chip: '', span }, {
                        pager: () => h('span', { class: 'doss-position' }, '12 / 22'),
                        title: () => ['Youghal ', h('span', { class: 'ui-badge' }, [h('span', 'Mainworld')])],
                        actions: () => h('button', { type: 'button' }, 'Orbits'),
                    });
                },
            });
            app.use(router);
            const html = await renderToString(app);
            assert.match(html, /class="panel-pager"/);
            assert.match(html, /12 \/ 22/);
            assert.match(html, /ui-badge/);
            const head = html.slice(html.indexOf('panel-head'), html.indexOf('panel-body'));
            assert.equal(head.includes('panel-pager'), true);
            assert.equal(head.indexOf('panel-pager') < head.indexOf('panel-bar') || !head.includes('panel-bar'), true);
            assert.equal(html.slice(html.indexOf('panel-bar')).includes('12 / 22'), false);
        }
    });
});
