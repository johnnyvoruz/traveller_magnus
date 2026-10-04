import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildSector } from '@voyage/generation';
import { TRUTH_SEED, TRUTH_SETTINGS } from '../../tools/truth/settings.js';
import { loadLegacy } from '../oracle/legacy.js';
import { commands } from '../../apps/web/src/shell/registry.ts';
import {
    canMapWorld, diamondMapSpec, enhancedSeedKey, imageSeed, legacyDiscId, mapSeedStrings,
    productionDiscId, productionMapSeeds, surfaceCacheKey, VANILLA_MASTER_SEED, worldMapData,
} from '../../apps/web/src/surface/identity.ts';
import {
    enhancedFlags, setEnhancedFlags, setSurfaceMode, SURFACE_COMMAND_ID, surfaceMode,
} from '../../apps/web/src/surface/preferences.ts';
import {
    cancelSurface, disposeSurfaces, drawDisc, prepareDiscs, requestMap, surfaceAvailable,
} from '../../apps/web/src/surface/service.ts';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const engineVersion = require('../../packages/engines/package.json').version;
const FULL_KEY = 'Spinward_Marches/1910';

function catalogue(slug) {
    const listed = JSON.parse(fs.readFileSync(path.join(ROOT, 'universe/raw/sectors.json'), 'utf8'))
        .sectors.find((sector) => sector.slug === slug);
    return { name: listed.name, x: listed.x, y: listed.y, tags: listed.tags, canonical: listed.canonical };
}

function installLegacy(ctx) {
    const editor = fs.readFileSync(path.join(ROOT, 'js/hex_editor.js'), 'utf8');
    const mapStart = editor.indexOf('function worldMapData(body)');
    const mapEnd = editor.indexOf('function openDiamondWorldMap');
    if (mapStart < 0 || mapEnd < 0) throw new Error('hex editor map functions were not found');
    ctx.$eval(editor.slice(mapStart, mapEnd));

    const viewer = fs.readFileSync(path.join(ROOT, 'js/system_viewer.js'), 'utf8');
    const idStart = viewer.indexOf('function _surfaceId(body, kind)');
    const idEnd = viewer.indexOf('const _disc', idStart);
    if (idStart < 0 || idEnd < 0) throw new Error('_surfaceId was not found');
    ctx.$eval(
        'function legacySurfaceId(hexId, body, kind) {\n'
        + 'const _hexId = hexId;\n'
        + viewer.slice(idStart, idEnd)
        + '\nreturn _surfaceId(body, kind);\n}'
    );

    const renderer = fs.readFileSync(path.join(ROOT, 'js/planet_renderer.js'), 'utf8');
    const piece = (suffix) => {
        const needle = "ms + '-' + (hexId || '0000') + '-" + suffix + "'";
        if (!renderer.includes(needle)) throw new Error('missing seed expression ' + suffix);
        return needle;
    };
    ctx.$eval(
        'function legacySeedInputs(ms, hexId) { return { ph: '
        + piece('ph') + ', cn: ' + piece('cn') + ', oc: ' + piece('oc') + ' }; }'
    );
}

function same(actual, expected) {
    assert.deepEqual(JSON.parse(JSON.stringify(actual)), JSON.parse(JSON.stringify(expected)));
}

function eachBody(sys, visit) {
    let count = 0;
    for (const star of sys.stars || []) { visit(star); count++; }
    for (const world of sys.worlds || []) {
        visit(world);
        count++;
        for (const moon of world.moons || []) { visit(moon); count++; }
    }
    return count;
}

test('seed strings and disc ids match the oracle for Regina and the map exclusions', async () => {
    const marches = await buildSector({
        slug: 'Spinward_Marches',
        tsv: fs.readFileSync(path.join(ROOT, 'universe/raw/Spinward_Marches.tsv'), 'utf8'),
        metadataXml: fs.readFileSync(path.join(ROOT, 'universe/raw/Spinward_Marches.xml'), 'utf8'),
        pinned: { seed: TRUTH_SEED, settings: TRUTH_SETTINGS, engineVersion },
        version: 'v2',
        catalogue: catalogue('Spinward_Marches'),
    });
    const regina = marches.index.hexes['1910'];
    const tree = JSON.parse(marches.objects.get(regina.tree));
    const ctx = loadLegacy();
    installLegacy(ctx);
    const sys = ctx.SystemViewer.normalizeSystem(tree.body);
    assert.ok(sys);

    let mapped = null;
    const count = eachBody(sys, (body) => {
        for (const hexId of ['1910', FULL_KEY]) {
            assert.equal(imageSeed(hexId, body), ctx.PlanetRenderer.imageSeed(hexId, body));
            const seed = ctx.PlanetRenderer.imageSeed(hexId, body);
            same(mapSeedStrings('device-seed', seed), ctx.legacySeedInputs('device-seed', seed));
            same(mapSeedStrings(VANILLA_MASTER_SEED, seed), ctx.legacySeedInputs(VANILLA_MASTER_SEED, seed));
            const kind = ctx.PlanetProfile.kind(body);
            assert.equal(legacyDiscId(hexId, body, kind), ctx.legacySurfaceId(hexId, body, kind));
            assert.equal(canMapWorld(body), ctx.canMapWorld(body));
            same(worldMapData(body), ctx.worldMapData(body));
            same(diamondMapSpec(body, hexId), ctx.diamondMapSpec(body, hexId));
        }
        if (!mapped && canMapWorld(body)) mapped = body;
    });
    assert.ok(count > 1);
    assert.ok(mapped);

    const produced = productionMapSeeds(FULL_KEY, mapped);
    const spec = ctx.diamondMapSpec(mapped, FULL_KEY);
    same(produced, {
        imageSeed: spec.seed,
        ...ctx.legacySeedInputs(VANILLA_MASTER_SEED, spec.seed),
    });
    assert.equal(produced.ph.startsWith(VANILLA_MASTER_SEED + '-'), true);
    assert.equal(produced.imageSeed.startsWith(FULL_KEY + '-'), true);
    assert.notEqual(imageSeed(FULL_KEY, mapped), imageSeed('1910', mapped));
    const kind = ctx.PlanetProfile.kind(mapped);
    assert.equal(productionDiscId(FULL_KEY, mapped, kind), ctx.legacySurfaceId(FULL_KEY, mapped, kind));

    same(mapSeedStrings(VANILLA_MASTER_SEED, ''), ctx.legacySeedInputs(VANILLA_MASTER_SEED, ''));

    const unnamed = { type: 'Terrestrial Planet', size: 6, uwp: 'A666666-6', orbitId: '4', au: 0.4, pd: 10 };
    assert.equal(imageSeed('1910', unnamed), ctx.PlanetRenderer.imageSeed('1910', unnamed));
    same(diamondMapSpec(unnamed, '1910'), ctx.diamondMapSpec(unnamed, '1910'));
    assert.notEqual(diamondMapSpec(unnamed, '1910').seed, imageSeed('1910', unnamed));

    const whitespace = { name: '   ', type: 'Terrestrial Planet', size: 8, uwp: 'A788899-C', orbitId: '2', au: 1.2, pd: 3 };
    assert.equal(worldMapData(whitespace).name, '');
    assert.equal(ctx.worldMapData(whitespace).name, '');
    same(diamondMapSpec(whitespace, '1910'), ctx.diamondMapSpec(whitespace, '1910'));
    assert.equal(diamondMapSpec(whitespace, '1910').seed, ctx.PlanetRenderer.imageSeed('1910', ctx.worldMapData(whitespace), 'Terrestrial Planet-2-1.2-3-A788899-C-8'));

    for (const body of [
        { name: 'Zero', type: 'Terrestrial Planet', size: 0, uwp: 'A000000-0' },
        { name: 'ZeroDigit', type: 'Terrestrial Planet', size: '0', uwp: 'A000000-0' },
        { name: 'Ring', type: 'Terrestrial Planet', size: 'R', uwp: 'A000000-0' },
    ]) {
        assert.equal(canMapWorld(body), false);
        assert.equal(ctx.canMapWorld(body), false);
        assert.equal(diamondMapSpec(body, '1910'), null);
        assert.equal(ctx.diamondMapSpec(body, '1910'), null);
        assert.equal(productionMapSeeds('1910', body), null);
    }

    const odd = { name: 0, type: 0, uwp: 0, diamKm: 0, diam: 4000, au: 0, pd: null };
    assert.equal(legacyDiscId('1910', odd, 'rock'), ctx.legacySurfaceId('1910', odd, 'rock'));
    assert.equal(legacyDiscId('1910', odd, 'rock'), '1910||||4000|0||rock');
    const missing = { name: 'N', type: 'T', uwp: 'A', diam: 9 };
    assert.equal(legacyDiscId('', missing, 'k'), ctx.legacySurfaceId('', missing, 'k'));
    assert.equal(legacyDiscId('', missing, 'k'), '|N|T|A|9|||k');

    const cache = surfaceCacheKey({
        hexKey: FULL_KEY,
        dossierKey: 'w0',
        revision: 'rev',
        mode: 'vanilla',
        algorithm: 'legacy',
        palette: 'legacy',
        options: '0.55,0.45,0,0,0,0',
        resolution: '800x400',
    });
    assert.equal(cache.includes('Regina'), false);
    assert.equal(produced.ph.includes(cache), false);
    assert.equal(enhancedSeedKey(FULL_KEY, 'w0').includes('Regina'), false);
    assert.equal(enhancedSeedKey('ab', 'w0'), '2:ab|2:w0');
});

test('the surface preference round-trips and falls back when storage throws', () => {
    const memory = new Map();
    globalThis.localStorage = {
        getItem: (key) => (memory.has(key) ? memory.get(key) : null),
        setItem: (key, value) => { memory.set(key, String(value)); },
        removeItem: (key) => { memory.delete(key); },
        clear: () => { memory.clear(); },
    };

    setSurfaceMode('vanilla');
    assert.equal(surfaceMode(), 'vanilla');
    assert.equal(memory.get('voyage_surfaces'), 'vanilla');
    assert.deepEqual(enhancedFlags(), {
        seasonalIce: false, paletteVariants: false, movingClouds: false, lightning: false,
    });
    setSurfaceMode('enhanced');
    assert.equal(surfaceMode(), 'enhanced');
    assert.equal(memory.get('voyage_surfaces'), 'enhanced');

    const command = commands().find((item) => item.id === SURFACE_COMMAND_ID);
    assert.ok(command);
    assert.equal(command.name, 'Surfaces: Enhanced');
    command.run();
    assert.equal(surfaceMode(), 'vanilla');
    assert.equal(command.name, 'Surfaces: Vanilla');
    assert.equal(memory.get('voyage_surfaces'), 'vanilla');

    memory.set('voyage_surfaces', 'nope');
    assert.equal(surfaceMode(), 'vanilla');

    globalThis.localStorage = {
        getItem() { throw new Error('blocked'); },
        setItem() { throw new Error('blocked'); },
    };
    assert.equal(surfaceMode(), 'vanilla');
    assert.doesNotThrow(() => setSurfaceMode('enhanced'));
    assert.equal(surfaceMode(), 'enhanced');
    assert.equal(commands().find((item) => item.id === SURFACE_COMMAND_ID).name, 'Surfaces: Enhanced');
    assert.doesNotThrow(() => setEnhancedFlags({ seasonalIce: true }));
    assert.equal(enhancedFlags().seasonalIce, true);
    assert.equal(enhancedFlags().lightning, false);
});

test('the surface service is unavailable for both modes', () => {
    const body = Object.freeze({ name: 'Regina' });
    const options = {
        continentalDefinition: 0.55,
        coastlineComplexity: 0.45,
        flags: { seasonalIce: false, paletteVariants: false, movingClouds: false, lightning: false },
    };
    const map = requestMap({
        mode: 'vanilla', hexKey: FULL_KEY, dossierKey: 'w0', body,
        resolution: { width: 800, height: 400 }, options,
    });
    assert.equal(map.status, 'unavailable');
    assert.equal(map.mode, 'vanilla');
    const batch = prepareDiscs({ mode: 'enhanced', discs: [] });
    assert.equal(batch.status, 'unavailable');
    assert.equal(batch.mode, 'enhanced');
    const disc = drawDisc({
        mode: 'vanilla', hexKey: FULL_KEY, dossierKey: 'w0', body, kind: 'rock', pixels: 32,
    });
    assert.equal(disc.status, 'unavailable');
    assert.equal(surfaceAvailable('vanilla'), true);
    assert.equal(surfaceAvailable('enhanced'), true);
    cancelSurface(map.requestId);
    disposeSurfaces();
});
