// The hex world map builder, DW2: the model honours a referee's edits, the painter paints them
// across the whole hex, the sheet cache tells edited sheets apart, and the pure Paint helpers.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { ACCENT_CODES, FEATURE_CODES, TERRAIN_CODES } from '../../apps/web/src/surface/hybrid/codes.ts';
import { SHEET_LAYOUT, fieldOf } from '../../apps/web/src/surface/hybrid/field.ts';
import { gridOf } from '../../apps/web/src/surface/hybrid/grid.ts';
import { HYBRID_SURFACE_VERSION, hybridWorld, worldDigest } from '../../apps/web/src/surface/hybrid/inputs.ts';
import { buildHybridModel } from '../../apps/web/src/surface/hybrid/model.ts';
import { paintHybrid } from '../../apps/web/src/surface/hybrid/paint.ts';
import { applyEdits, parseEdits, serializeEdits } from '../../apps/web/src/surface/hybrid/serialize.ts';
import { cachedHybridModel, hybridModel, hybridModelWith, renderHybridPixels } from '../../apps/web/src/surface/hybrid/index.ts';
import {
    OTHER_SIZE_WORDS, STALE_WORDS, clearAll, editedModel, editsDigest, editsStatus, editsText, emptyEdits, paintHex, paintedCount,
    paintedSea, paintedWords, paletteGroups, runBetween, seaLine, swatchKey, swatchOf, tidyEdits,
} from '../../apps/web/src/surface/paint_edits.ts';
import { SURFACE_MESSAGE_VERSION } from '../../apps/web/src/surface/contracts.ts';
import { SURFACE_CHANGED, SurfaceStoreError, createSurfaceStore, surfacePath } from '../../apps/web/src/platform/surface_store.ts';
import { editsHeld, resetSurfaceEdits, saveSurfaceEdits, surfaceEdits, surfaceEditsLoaded, useSurfaceStore } from '../../apps/web/src/surface/edits.ts';
import { globeRecipe } from '../../apps/web/src/surface/soft/link.ts';
import { configureSurfaceRuntime, disposeSurfaces, hybridInputsFor, requestMap } from '../../apps/web/src/surface/service.ts';
import { latOf, lonOf } from '../../apps/web/src/surface/hybrid/grid.ts';
import { seaColoursOf } from '../../apps/web/src/surface/hybrid/paint.ts';
import { terrainRgb } from '../../apps/web/src/surface/hybrid/codes.ts';
import { discShadeRequest } from '../../apps/web/src/surface/disc_shade.ts';
import { ENHANCED_DRAW_FRAG } from '../../apps/web/src/surface/enhanced/draw.ts';
import { DRAW_FRAG } from '../../apps/web/src/surface/vanilla/gl_shade.ts';
import { discPaintHeld, discPaintTexture, hexPaintRgb, paintDiscTexture, paintKeyOf, resetDiscPaint, startPaintTexture } from '../../apps/web/src/surface/paint_disc.ts';
import { texelLat, texelLon } from '../../apps/web/src/surface/soft/globe.ts';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (file) => fs.readFileSync(path.join(ROOT, 'apps', 'web', 'src', file), 'utf8');
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

function earth(extra = {}) {
    return {
        type: 'Planet', name: 'Terra', size: 4, atmCode: 6, hydroCode: 7, hydroPercent: 72, popCode: 9,
        starport: 'A', uwp: 'A467977-C', meanTempK: 288, lowTempK: 250, highTempK: 310, axialTilt: 23.4,
        liquidType: 'Water', diamKm: 6400, tradeCodes: 'Hi In', navalBase: true,
        ...extra,
    };
}
const worldOf = (body = earth()) => hybridWorld('Spinward_Marches/1910', 'w0', body);

/** A land hex whose neighbours are all land, and a sea hex whose neighbours are all sea. */
function interior(model) {
    const land = model.hexes.find((h) => !h.water && model.grid.nb[h.id].every((k) => !model.hexes[k].water));
    const sea = model.hexes.find((h) => h.water && model.grid.nb[h.id].every((k) => model.hexes[k].water));
    assert.ok(land && sea, 'a size-4 earth has an interior land hex and an open sea hex');
    return { land, sea };
}

describe('the model honours edits', () => {
    test('a painted terrain sets terrain, landTerrain, water, ice and edited; the neighbour and the base are untouched', () => {
        const world = worldOf();
        const base = buildHybridModel(world);
        const { land, sea } = interior(base);
        const nb = base.hexes[base.grid.nb[land.id][0]];
        let edits = emptyEdits(world);
        edits = paintHex(edits, land, { kind: 'terrain', code: 'OC' }, land);
        edits = paintHex(edits, sea, { kind: 'terrain', code: 'IC' }, sea);
        const hexes = applyEdits(base, edits);
        assert.equal(hexes[land.id].terrain, 'OC');
        assert.equal(hexes[land.id].landTerrain, 'OC');
        assert.equal(hexes[land.id].water, true);
        assert.equal(hexes[land.id].ice, 'none');
        assert.equal(hexes[land.id].edited, true);
        assert.equal(hexes[sea.id].terrain, 'IC');
        assert.equal(hexes[sea.id].water, false);
        assert.equal(hexes[sea.id].ice, 'iceCap');
        assert.equal(hexes[sea.id].edited, true);
        assert.deepEqual(hexes[nb.id], nb, 'the neighbour is as generated');
        assert.equal(hexes[nb.id].edited, false);
        assert.equal(base.hexes[land.id].edited, false, 'the base model is not changed');
        assert.notEqual(base.hexes[land.id].terrain, 'OC');
        for (const [code, ice, water] of [['SI', 'seaIce', true], ['IF', 'iceField', true], ['FR', 'frost', false], ['SH', 'none', true], ['DE', 'none', false]]) {
            const one = applyEdits(base, paintHex(emptyEdits(world), land, { kind: 'terrain', code }, land))[land.id];
            assert.equal(one.ice, ice, code);
            assert.equal(one.water, water, code);
        }
    });

    test('an accent or a feature is added to the generated ones; Clear hex puts the hex back; the count is of hexes', () => {
        const world = worldOf();
        const base = buildHybridModel(world);
        const { land } = interior(base);
        let edits = paintHex(emptyEdits(world), land, { kind: 'accent', code: 'VO' }, land);
        assert.deepEqual(applyEdits(base, edits)[land.id].accents, [...land.accents, 'VO']);
        edits = paintHex(edits, land, { kind: 'accent', code: 'VO' }, land);
        assert.equal(paintedCount(edits), 1, 'the same swatch twice is one edit');
        edits = paintHex(edits, land, { kind: 'feature', code: 'city' }, land);
        edits = paintHex(edits, land, { kind: 'terrain', code: 'DE' }, land);
        const painted = applyEdits(base, edits)[land.id];
        assert.equal(painted.terrain, 'DE');
        assert.deepEqual(painted.features, [...land.features, 'city']);
        assert.deepEqual(painted.accents, [...land.accents, 'VO']);
        assert.equal(paintedCount(edits), 1);
        edits = paintHex(edits, land, { kind: 'clear' }, land);
        assert.equal(paintedCount(edits), 0);
        assert.deepEqual(applyEdits(base, edits)[land.id], land);
        assert.equal(paintedCount(clearAll(paintHex(emptyEdits(world), land, { kind: 'terrain', code: 'OC' }, land))), 0);
        assert.equal(paintedCount(tidyEdits({ ...emptyEdits(world), edits: [{ row: land.row, col: land.col }] })), 0);
        assert.equal(paintedWords(1), '1 hex painted');
        assert.equal(paintedWords(14), '14 hexes painted');
    });

    test('the digest and the grid side guard the edits; the stamp survives the saved text', () => {
        const world = worldOf();
        const base = buildHybridModel(world);
        const { land } = interior(base);
        const fresh = emptyEdits(world);
        assert.equal(fresh.n, world.size);
        assert.equal(fresh.digest, worldDigest(world));
        assert.equal(fresh.surface, HYBRID_SURFACE_VERSION);
        assert.equal(editsStatus(null, world), 'none');
        assert.equal(editsStatus(fresh, world), 'none');
        const edits = paintHex(fresh, land, { kind: 'terrain', code: 'OC' }, land);
        assert.equal(editsStatus(edits, world), 'fit');
        const changed = worldOf(earth({ atmCode: 9 }));
        assert.equal(editsStatus(edits, changed), 'stale');
        assert.equal(editedModel(buildHybridModel(changed), edits).hexes[land.id].terrain, 'OC', 'stale edits are still shown, over the new map');
        const bigger = worldOf(earth({ size: 5 }));
        assert.equal(editsStatus(edits, bigger), 'other-size');
        const big = buildHybridModel(bigger);
        assert.equal(editedModel(big, edits), big, 'edits for another side are not applied');
        assert.equal(editedModel(base, null), base);
        assert.ok(STALE_WORDS.endsWith('.') && OTHER_SIZE_WORDS.endsWith('.'));

        const text = editsText(edits);
        const back = parseEdits(text);
        assert.equal(back.digest, edits.digest);
        assert.equal(back.surface, HYBRID_SURFACE_VERSION);
        assert.deepEqual(back.edits, edits.edits);
        assert.equal(editsText(back), text, 'the same edits give the same text');
        assert.equal(editsDigest(back), editsDigest(edits));
        assert.equal(editsDigest(null), '');
        assert.equal(editsDigest(fresh), '');
        const old = parseEdits(JSON.stringify({ format: 1, n: 4, edits: [{ row: 1, col: 0, terrain: 'OC' }] }));
        assert.equal(old.digest, '', 'older data without a stamp still reads');
        assert.equal(old.surface, '');
        assert.equal(editsStatus(old, world), 'fit', 'no digest means nothing to compare');
        assert.match(serializeEdits(4, [], { digest: 'd', surface: 's' }), /"digest":"d","surface":"s"/);
    });

    test('the memo: the same world and edits give the same model object; the base is the generated one', () => {
        const world = worldOf();
        const base = hybridModel(world);
        const { land } = interior(base);
        const edits = paintHex(emptyEdits(world), land, { kind: 'terrain', code: 'OC' }, land);
        const a = hybridModel(world, edits);
        const b = hybridModel(world, JSON.parse(JSON.stringify(edits)));
        assert.equal(a, b);
        assert.notEqual(a, base);
        assert.equal(a.generated, base.hexes);
        assert.equal(a.edits, edits);
        assert.equal(a.hexes[land.id].edited, true);
        assert.equal(hybridModel(world), base, 'no edits: the generated model, unchanged');
        assert.equal(base.hexes[land.id].edited, false);
        assert.equal(base.generated, base.hexes);
        assert.equal(base.edits, null);
        assert.equal(hybridModelWith(base, null), base);
        assert.equal(hybridModelWith(base, emptyEdits(world)), base);
        assert.equal(cachedHybridModel(world, edits), a);
        assert.equal(seaLine(a).startsWith('Painted sea '), true);
        assert.match(seaLine(a), /^Painted sea \d+% · UWP 72%$/);
        assert.ok(paintedSea(a.hexes) > paintedSea(base.hexes), 'a land hex painted ocean raises the painted sea');
    });
});

describe('the painter honours edits', () => {
    test('a painted ocean hex is water in every pixel of its hex; every other pixel is as the generated sheet', () => {
        const world = worldOf();
        const base = buildHybridModel(world);
        const { land, sea } = interior(base);
        let edits = paintHex(emptyEdits(world), land, { kind: 'terrain', code: 'OC' }, land);
        edits = paintHex(edits, sea, { kind: 'terrain', code: 'DE' }, sea);
        const model = editedModel(base, edits);
        const before = paintHybrid(base, SHEET_LAYOUT);
        const after = paintHybrid(model, SHEET_LAYOUT);
        assert.equal(sha(renderHybridPixels({ world, edits })), sha(after), 'the worker path paints the same sheet');
        assert.equal(sha(renderHybridPixels({ world })), sha(before));
        const field = fieldOf(SHEET_LAYOUT, world.size);
        let inLand = 0;
        let blue = 0;
        let inSea = 0;
        let sandy = 0;
        let changedOutside = 0;
        for (let k = 0; k < field.hex.length; k += 1) {
            if (field.face[k] < 0) continue;
            const i = k * 4;
            const same = before[i] === after[i] && before[i + 1] === after[i + 1] && before[i + 2] === after[i + 2];
            if (field.hex[k] === land.id) {
                inLand += 1;
                if (after[i + 2] > after[i] && after[i + 2] > after[i + 1]) blue += 1;
            } else if (field.hex[k] === sea.id) {
                inSea += 1;
                if (after[i] > after[i + 2]) sandy += 1;
            } else if (!same) {
                changedOutside += 1;
            }
        }
        assert.ok(inLand > 50 && inSea > 50, 'both hexes cover pixels');
        assert.equal(blue, inLand, 'the whole painted ocean hex is sea blue');
        assert.equal(sandy, inSea, 'the whole painted desert hex is desert, no sea left in it');
        assert.equal(changedOutside, 0, 'no pixel outside the painted hexes changed');
    });

    test('the painter reads the generated records for unedited pixels and skips the coast and the ice fringe on edited ones', () => {
        const paint = read('surface/hybrid/paint.ts');
        assert.match(paint, /const hexes = model\.generated;/);
        assert.match(paint, /const painted = model\.edits \? model\.hexes : null;/);
        assert.match(paint, /distK < 18 && !isEdited/);
        assert.match(paint, /if \(painted && painted\[field\.hex\[k\]\]\.edited\) continue;/);
        assert.match(read('surface/contracts.ts'), /readonly edits\?: HexEdits \| null/);
        assert.match(read('surface/service.ts'), /editsDigest\(hybrid\.edits\)/);
    });
});

describe('the sheet cache and the worker message', () => {
    test('the cache key changes with the edits, and the edits ride to the worker', async () => {
        const sent = [];
        const listeners = [];
        configureSurfaceRuntime({
            spawn: () => ({
                postMessage(message) { sent.push(message); },
                addEventListener(_type, fn) { listeners.push(fn); },
                terminate() {},
            }),
        });
        try {
            const body = Object.freeze(earth());
            const request = Object.freeze({
                mode: 'enhanced',
                hexKey: 'Spinward_Marches/1910',
                dossierKey: 'w0',
                body,
                resolution: { width: 800, height: 400 },
                options: { continentalDefinition: 0.55, coastlineComplexity: 0.45, flags: { seasonalIce: false, paletteVariants: false, movingClouds: false, lightning: false } },
            });
            const world = hybridInputsFor(request);
            const base = buildHybridModel(world);
            const { land } = interior(base);
            const edits = paintHex(emptyEdits(world), land, { kind: 'terrain', code: 'OC' }, land);
            const answer = (ticket) => {
                const pixels = new Uint8ClampedArray([1, 2, 3, 255]);
                for (const fn of listeners) fn({ data: { version: SURFACE_MESSAGE_VERSION, op: 'map', requestId: ticket.requestId, generation: ticket.generation, mode: 'enhanced', width: 1, height: 1, pixels } });
                return ticket.done;
            };
            const plain = await answer(requestMap(request));
            assert.ok(plain);
            assert.equal(sent[sent.length - 1].hybrid.edits, undefined, 'no edits: the message is as before');
            const painted = requestMap({ ...request, edits });
            assert.equal(painted.status, 'pending', 'an edited sheet is not the generated one from the cache');
            assert.deepEqual(sent[sent.length - 1].hybrid.edits, edits);
            const sheet = await answer(painted);
            assert.ok(sheet);
            assert.notEqual(sheet.key, plain.key);
            assert.match(sheet.key, /;edits=/);
            assert.equal(requestMap(request).status, 'sheet', 'the generated sheet is still in the cache');
            assert.equal(requestMap({ ...request, edits }).status, 'sheet', 'and so is the edited one');
            assert.equal(requestMap({ ...request, edits: emptyEdits(world) }).key, plain.key, 'no edits yet is the generated sheet');
        } finally {
            disposeSurfaces();
        }
    });
});

describe('the Paint rail helpers', () => {
    test('the palette lists the 19 terrains in the table order, then the accents, the features and Clear hex', () => {
        const groups = paletteGroups();
        assert.deepEqual(groups.map((g) => g.name), ['Terrain', 'Accents', 'Features', '']);
        assert.deepEqual(groups[0].rows.map((r) => r.swatch.code), [...TERRAIN_CODES]);
        assert.equal(groups[0].rows.length, 19);
        assert.deepEqual(groups[1].rows.map((r) => r.swatch.code), [...ACCENT_CODES]);
        assert.deepEqual(groups[2].rows.map((r) => r.swatch.code), [...FEATURE_CODES]);
        assert.deepEqual(groups[3].rows.map((r) => r.name), ['Clear hex']);
        for (const group of groups) {
            for (const row of group.rows) {
                assert.deepEqual(swatchOf(swatchKey(row.swatch)), row.swatch);
                if (row.row) assert.equal(row.name, row.row.name);
            }
        }
        assert.equal(swatchOf('terrain:ZZ'), null);
    });

    test('a Shift run walks from one hex to another through neighbours, each once', () => {
        const grid = gridOf(4);
        const from = grid.rowStart[6];
        const to = grid.rowStart[6] + 9;
        const run = runBetween(grid, from, to);
        assert.equal(run[0], from);
        assert.equal(run[run.length - 1], to);
        assert.equal(new Set(run).size, run.length);
        for (let i = 1; i < run.length; i += 1) assert.ok(grid.nb[run[i - 1]].includes(run[i]), 'step ' + i + ' is a neighbour');
        assert.ok(run.length >= 10, 'a run of ten columns is at least ten hexes');
        assert.deepEqual(runBetween(grid, from, from), [from]);
        const pole = runBetween(grid, 0, grid.count - 1);
        assert.equal(pole[0], 0);
        assert.equal(pole[pole.length - 1], grid.count - 1);
        for (let i = 1; i < pole.length; i += 1) assert.ok(grid.nb[pole[i - 1]].includes(pole[i]));
    });
});

describe('the store seam (platform/surface_store.ts)', () => {
    const world = worldOf();
    const base = buildHybridModel(world);
    const { land } = interior(base);
    const edits = paintHex(emptyEdits(world), land, { kind: 'terrain', code: 'OC' }, land);

    test('the route path, and the memory store without a universe', async () => {
        assert.equal(surfacePath('uni_1', 'Spinward_Marches/1910', 'w0'), '/api/universes/uni_1/builder/hexes/Spinward_Marches/1910/surface/w0');
        assert.equal(surfacePath('uni_1', 'Spinward_Marches/1910', 'w3m1'), '/api/universes/uni_1/builder/hexes/Spinward_Marches/1910/surface/w3m1');
        assert.equal(surfacePath('uni_1', 'nohex', 'w0'), null);
        assert.equal(surfacePath('uni_1', 'Spinward_Marches/1910', 'x9'), null);
        let calls = 0;
        const store = createSurfaceStore({ fetch: async () => { calls += 1; return new Response('{}'); }, universeId: () => null });
        assert.equal(await store.load('Spinward_Marches/1910', 'w0'), null);
        await store.save('Spinward_Marches/1910', 'w0', edits);
        assert.deepEqual(await store.load('Spinward_Marches/1910', 'w0'), edits);
        await store.clear('Spinward_Marches/1910', 'w0');
        assert.equal(await store.load('Spinward_Marches/1910', 'w0'), null);
        assert.equal(calls, 0, 'no universe: the server is never asked');
    });

    test('with a universe: GET reads rev and edits, PUT carries baseRev, a conflict throws the server sentence, a clear is edits null', async () => {
        const seen = [];
        let rev = 2;
        let stored = JSON.parse(editsText(edits));
        const fetchImpl = async (url, init) => {
            seen.push({ url: String(url), method: init.method, body: init.body ? JSON.parse(init.body) : null });
            if (init.method === 'GET') return new Response(JSON.stringify({ ok: true, data: { rev, edits: stored } }), { status: 200 });
            const body = JSON.parse(init.body);
            if (body.baseRev !== rev) return new Response(JSON.stringify({ ok: false, error: { code: 'conflict', message: SURFACE_CHANGED, details: { code: 'surface_changed', current: { rev, edits: stored } } } }), { status: 409 });
            rev += 1;
            stored = body.edits;
            return new Response(JSON.stringify({ ok: true, data: { rev: stored ? rev : 0, edits: stored } }), { status: 200 });
        };
        const store = createSurfaceStore({ fetch: fetchImpl, universeId: () => 'uni_9' });
        const read = await store.load('Spinward_Marches/1910', 'w0');
        assert.deepEqual(read, edits);
        assert.equal(store.revOf('Spinward_Marches/1910', 'w0'), 2);
        assert.match(seen[0].url, /\/api\/universes\/uni_9\/builder\/hexes\/Spinward_Marches\/1910\/surface\/w0$/);
        const more = paintHex(edits, base.hexes[base.grid.nb[land.id][0]], { kind: 'terrain', code: 'OC' }, base.hexes[base.grid.nb[land.id][0]]);
        await store.save('Spinward_Marches/1910', 'w0', more);
        assert.equal(seen[1].method, 'PUT');
        assert.equal(seen[1].body.baseRev, 2);
        assert.equal(seen[1].body.edits.edits.length, 2);
        assert.equal(seen[1].body.edits.digest, edits.digest);
        assert.equal(store.revOf('Spinward_Marches/1910', 'w0'), 3);
        // Another referee saved in between: the next save is refused, and the current rev is learned.
        rev = 7;
        await assert.rejects(() => store.save('Spinward_Marches/1910', 'w0', edits), (err) => err instanceof SurfaceStoreError && err.status === 409 && err.message === SURFACE_CHANGED && err.code === 'surface_changed');
        assert.equal(store.revOf('Spinward_Marches/1910', 'w0'), 7);
        await store.save('Spinward_Marches/1910', 'w0', edits);
        assert.equal(seen[seen.length - 1].body.baseRev, 7);
        await store.clear('Spinward_Marches/1910', 'w0');
        assert.equal(seen[seen.length - 1].body.edits, null);
        assert.equal(store.revOf('Spinward_Marches/1910', 'w0'), 0);
    });

    test('a server without the route (404) falls back to the memory store for that body', async () => {
        let calls = 0;
        const store = createSurfaceStore({ fetch: async () => { calls += 1; return new Response(JSON.stringify({ ok: false, error: { code: 'not_found', message: 'No such universe.' } }), { status: 404 }); }, universeId: () => 'uni_old' });
        assert.equal(await store.load('Spinward_Marches/1910', 'w0'), null);
        await store.save('Spinward_Marches/1910', 'w0', edits);
        assert.deepEqual(await store.load('Spinward_Marches/1910', 'w0'), edits);
        assert.equal(calls, 1, 'asked once; memory after');
        const down = createSurfaceStore({ fetch: async () => { throw new Error('offline'); }, universeId: () => 'uni_9' });
        await assert.rejects(() => down.load('Spinward_Marches/1910', 'w0'), (err) => err instanceof SurfaceStoreError && err.status === 0);
    });
});

describe('the painted hexes held for the page (surface/edits.ts)', () => {
    test.afterEach(() => useSurfaceStore(null));

    test('read once per body, kept after a save, and the soft globe keys on them', async () => {
        const world = worldOf();
        const base = buildHybridModel(world);
        const { land } = interior(base);
        const edits = paintHex(emptyEdits(world), land, { kind: 'terrain', code: 'OC' }, land);
        const held = new Map();
        let loads = 0;
        useSurfaceStore({
            async load(hexKey, dossierKey) { loads += 1; return held.get(hexKey + '|' + dossierKey) ?? null; },
            async save(hexKey, dossierKey, next) { held.set(hexKey + '|' + dossierKey, next); },
            async clear(hexKey, dossierKey) { held.delete(hexKey + '|' + dossierKey); },
        });
        assert.equal(editsHeld('Spinward_Marches/1910', 'w0'), undefined, 'nothing asked yet');
        const handle = surfaceEdits('Spinward_Marches/1910', 'w0');
        assert.equal(handle.busy, true);
        await surfaceEditsLoaded('Spinward_Marches/1910', 'w0');
        assert.equal(handle.loaded, true);
        assert.equal(handle.edits, null);
        assert.equal(editsHeld('Spinward_Marches/1910', 'w0'), null);
        assert.equal(surfaceEdits('Spinward_Marches/1910', 'w0'), handle, 'the same handle');
        assert.equal(loads, 1);
        await saveSurfaceEdits('Spinward_Marches/1910', 'w0', edits);
        assert.equal(handle.edits, edits);
        assert.equal(editsHeld('Spinward_Marches/1910', 'w0'), edits);
        assert.equal(held.get('Spinward_Marches/1910|w0'), edits);
        await saveSurfaceEdits('Spinward_Marches/1910', 'w0', emptyEdits(world));
        assert.equal(handle.edits, null, 'no hexes painted is a clear');
        assert.equal(held.has('Spinward_Marches/1910|w0'), false);

        // The soft globe's recipe carries the held edits and keys on them, so a kept map repaints the globe.
        await saveSurfaceEdits('Spinward_Marches/1910', 'w0', edits);
        const disc = { key: 'w0', hexKey: 'Spinward_Marches/1910', dossierKey: 'w0', body: earth(), radiusPx: 64 };
        const profile = { kind: 'world' };
        const painted = globeRecipe('enhanced', disc, profile);
        assert.ok(painted);
        assert.equal(painted.recipe.kind, 'hybrid');
        assert.deepEqual(painted.recipe.edits, edits);
        assert.match(painted.key, new RegExp(editsDigest(edits).replace(/[:]/g, '\\$&') + '$'));
        await saveSurfaceEdits('Spinward_Marches/1910', 'w0', null);
        const plain = globeRecipe('enhanced', disc, profile);
        assert.ok(plain);
        assert.equal(plain.recipe.edits, undefined);
        assert.notEqual(plain.key, painted.key);
        assert.equal(plain.key.includes(editsDigest(edits)), false);
    });

    test('a refusal is kept on the handle and thrown; the handle is not changed', async () => {
        const world = worldOf();
        const base = buildHybridModel(world);
        const { land } = interior(base);
        const edits = paintHex(emptyEdits(world), land, { kind: 'terrain', code: 'OC' }, land);
        useSurfaceStore({
            async load() { return null; },
            async save() { throw new SurfaceStoreError(409, SURFACE_CHANGED, 'surface_changed'); },
            async clear() {},
        });
        const handle = surfaceEdits('Spinward_Marches/1910', 'w0');
        await surfaceEditsLoaded('Spinward_Marches/1910', 'w0');
        await assert.rejects(() => saveSurfaceEdits('Spinward_Marches/1910', 'w0', edits), /This map changed/);
        assert.equal(handle.edits, null);
        assert.equal(handle.error, SURFACE_CHANGED);
        assert.equal(handle.busy, false);
        resetSurfaceEdits();
        assert.equal(editsHeld('Spinward_Marches/1910', 'w0'), undefined);
    });
});

describe('Paint on the large map (source)', () => {
    test('the stage: the toggle with Build on, the rail, the ask, the draft on the model and the sheet; the dossier passes Build', () => {
        const stage = read('dossier/SurfaceStage.vue');
        assert.match(stage, /paintable\?: boolean;/);
        assert.match(stage, /const canPaint = computed\(\(\) => props\.paintable === true && large\.value && hybrid\.value\);/);
        assert.match(stage, /data-paint-toggle/);
        assert.match(stage, /<PaintRail v-if="canPaint && painting"/);
        assert.match(stage, /<AskModal v-if="paintAsk" title="Discard the painted hexes\?"[^>]*confirm="Discard" cancel-label="Keep painting" danger/);
        assert.match(stage, /hybridModel\(world, shownEdits\.value\)/g);
        assert.equal((stage.match(/edits: shownEdits\.value,/g) || []).length, 2, 'the first sheet and every repaint carry the edits');
        assert.match(stage, /paintRun\(event\.shiftKey \? lastPainted : null, hit\.id\)/, 'Shift paints a run from the last hex');
        assert.match(stage, /if \(!stroke\) repaintSheet\(\);/, 'the sheet is painted again when a stroke ends, not per hex');
        assert.match(stage, /data-paint-sea/);
        assert.match(stage, /action: \{ label: 'Undo', run: \(\) => \{ draft\.value = before; \} \}/, 'Clear map offers Undo');
        assert.match(stage, /saveSurfaceEdits\(hexKey, dossierKey, tidy\)/);
        assert.match(stage, /if \(!hex\.edited\) continue;[\s\S]*ringOf\(hex\.id\)/, 'painted hexes are outlined while Paint is on');
        assert.doesNotMatch(stage, /window\.|document\.body/);
        assert.match(read('dossier/DossierBody.vue'), /:paintable="paintable === true"/);
        assert.match(read('dossier/DossierPanel.vue'), /:paintable="building"/);
        assert.doesNotMatch(read('surface/paint_edits.ts'), /#[0-9a-f]{3,8}\b/i, 'no hex colours');
        assert.doesNotMatch(read('surface/PaintRail.vue'), /#[0-9a-f]{3,8}\b/i);
        assert.doesNotMatch(read('platform/surface_store.ts'), /window\.|document\./);
        assert.match(read('surface/soft/globe.ts'), /hybridModelWith\(base, edits\)/);
    });
});

describe('the Paint rail (rendered)', { concurrency: 1 }, () => {
    let server = null;
    let cacheDir = '';
    test.before(async () => {
        const { tmpdir } = await import('node:os');
        cacheDir = fs.mkdtempSync(path.join(tmpdir(), 'd-paint-'));
        const { createServer } = await import('vite');
        server = await createServer({ root: path.join(ROOT, 'apps', 'web'), cacheDir, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'silent' });
    });
    test.after(async () => {
        if (server) await server.close();
        if (cacheDir) fs.rmSync(cacheDir, { recursive: true, force: true, maxRetries: 5 });
    });

    test('19 terrains in the table order with their colours, the accents, the features, Clear hex; the count, Clear map, Discard and Keep', async () => {
        const view = (await server.ssrLoadModule('/src/surface/PaintRail.vue')).default;
        const { createSSRApp, h } = await import('vue');
        const { renderToString } = await import('vue/server-renderer');
        const html = await renderToString(createSSRApp({ render: () => h(view, { swatch: { kind: 'terrain', code: 'OC' }, count: 14, dirty: true, busy: false, note: '' }) }));
        const keys = [...html.matchAll(/data-swatch="([^"]+)"/g)].map((m) => m[1]);
        assert.deepEqual(keys, [...TERRAIN_CODES.map((c) => 'terrain:' + c), ...ACCENT_CODES.map((c) => 'accent:' + c), ...FEATURE_CODES.map((c) => 'feature:' + c), 'clear']);
        assert.match(html, /data-swatch="terrain:OC"[^>]*>[\s\S]*?background:\s*rgb\(10,\s*34,\s*86\)/);
        assert.match(html, /class="(?:is-current paint-swatch|paint-swatch is-current)" role="radio" aria-checked="true" data-swatch="terrain:OC"/);
        assert.match(html, /Grass and steppe/);
        assert.match(html, /Clear hex/);
        assert.match(html, /data-paint-count[^>]*>14 hexes painted</);
        assert.match(html, /data-paint-clear-map/);
        assert.match(html, /data-paint-discard/);
        assert.match(html, /data-paint-keep[^>]*>[\s\S]*Keep</);
        const busy = await renderToString(createSSRApp({ render: () => h(view, { swatch: { kind: 'clear' }, count: 0, dirty: false, busy: true, note: 'The world changed since this map was painted. The paint is shown over the new map.' }) }));
        assert.match(busy, /data-paint-count[^>]*>0 hexes painted</);
        assert.match(busy, /data-paint-note[^>]*>The world changed since this map was painted\./);
        assert.match(busy, /Keeping…/);
        assert.match(busy, /data-paint-clear-map disabled/);
    });
});

describe('the orbit disc shows the painted hexes (DW2c)', () => {
    /** The texel under a point on the sphere, on the texture's grid (soft/globe.ts texelLat, texelLon). */
    function texelAt(texture, p) {
        const lat = latOf(p) * Math.PI / 180;
        const lon = lonOf(p) * Math.PI / 180;
        const rows = texture.height;
        const W = texture.width;
        let i = 0;
        for (let r = 0; r < rows; r += 1) if (Math.abs(texelLat(r, rows) - lat) < Math.abs(texelLat(i, rows) - lat)) i = r;
        let j = 0;
        for (let c = 0; c < W; c += 1) if (Math.abs(texelLon(c, W) - lon) < Math.abs(texelLon(j, W) - lon)) j = c;
        const k = (i * W + j) * 4;
        return [texture.pixels[k], texture.pixels[k + 1], texture.pixels[k + 2], texture.pixels[k + 3]];
    }

    test('a painted hex is its colour on the texture at its centre, clear everywhere else; no paint is no texture', () => {
        const world = worldOf();
        const base = buildHybridModel(world);
        const { land, sea } = interior(base);
        assert.equal(paintDiscTexture(base), null, 'the generated world sends nothing');
        assert.equal(paintKeyOf(world, null), '');
        const edits = paintHex(emptyEdits(world), land, { kind: 'terrain', code: 'OC' }, land);
        const model = hybridModelWith(base, edits);
        const texture = paintDiscTexture(model, 128);
        assert.ok(texture);
        assert.equal(texture.width, 256);
        assert.equal(texture.height, 128);
        assert.equal(texture.key, paintKeyOf(world, edits));
        assert.match(texture.key, /\|/);
        const colours = seaColoursOf(world.liquid);
        assert.deepEqual(texelAt(texture, base.grid.P[land.id]), [...colours.deep.map(Math.round), 255], 'a painted ocean reads the deep sea colour');
        assert.deepEqual(texelAt(texture, base.grid.P[sea.id]), [0, 0, 0, 0], 'an unpainted hex is clear');
        // Premultiplied: a clear texel is black, so the disc's blend never darkens an edge.
        let painted = 0;
        for (let k = 3; k < texture.pixels.length; k += 4) if (texture.pixels[k]) painted += 1;
        assert.ok(painted > 0 && painted < texture.pixels.length / 4 / 20, 'one hex of 162 covers a small part of the texture: ' + painted);
        const desert = paintHex(emptyEdits(world), sea, { kind: 'terrain', code: 'DE' }, sea);
        const land2 = paintDiscTexture(hybridModelWith(base, desert), 128);
        assert.deepEqual(texelAt(land2, base.grid.P[sea.id]), [...terrainRgb('DE'), 255], 'painted land reads the palette');
        assert.notEqual(land2.key, texture.key);
        assert.deepEqual(hexPaintRgb({ water: true, terrain: 'SH' }, colours), colours.shallow);
        assert.deepEqual(hexPaintRgb({ water: true, terrain: 'SI' }, colours), colours.iceShallow);
        assert.deepEqual(hexPaintRgb({ water: true, terrain: 'IF' }, colours), colours.iceDeep);
        assert.deepEqual(hexPaintRgb({ water: false, terrain: 'JU' }, colours), terrainRgb('JU'));
        // In slices: the same texture as in one call.
        const sliced = startPaintTexture(model, 128, 7);
        let steps = 0;
        while (!sliced.step()) steps += 1;
        assert.ok(steps >= 18, 'rows in slices of seven: ' + steps);
        assert.deepEqual(sliced.texture().pixels, texture.pixels);
    });

    test('the page holds one texture per key, built in steps; the same key is the same object; reset forgets', () => {
        resetDiscPaint();
        const world = worldOf();
        const base = buildHybridModel(world);
        const { land } = interior(base);
        const edits = paintHex(emptyEdits(world), land, { kind: 'terrain', code: 'OC' }, land);
        const queue = [];
        const schedule = (fn) => { queue.push(fn); return () => { const at = queue.indexOf(fn); if (at >= 0) queue.splice(at, 1); }; };
        try {
            assert.equal(discPaintTexture(world, null, schedule), null, 'no edits: nothing to build');
            assert.equal(queue.length, 0);
            assert.equal(discPaintTexture(world, edits, schedule), null, 'not yet: the build is on its way');
            assert.equal(discPaintHeld(paintKeyOf(world, edits)), undefined);
            let turns = 0;
            while (queue.length) {
                queue.shift()();
                turns += 1;
            }
            assert.ok(turns > 1, 'more than one slice: ' + turns);
            const texture = discPaintTexture(world, edits, schedule);
            assert.ok(texture);
            assert.equal(texture.key, paintKeyOf(world, edits));
            assert.equal(discPaintTexture(world, edits, schedule), texture, 'held: the same object');
            assert.equal(discPaintHeld(texture.key), texture);
            assert.equal(queue.length, 0);
            resetDiscPaint();
            assert.equal(discPaintHeld(texture.key), undefined);
        } finally {
            resetDiscPaint();
        }
    });

    test('the request names the texture and its longitude; the enhanced program alone samples it; vanilla is untouched', () => {
        const disc = {
            key: 'd1', hexKey: 'Spinward_Marches/1910', dossierKey: 'w0', body: earth(), radiusPx: 80, spin: 0.2, cloudSpin: 0.1, sweep: 0, samples: 1,
            tiltDeg: 20, light: [1, 0], sun: [1, 1, 1], casters: [], lightMode: false, ring: null,
        };
        const plain = discShadeRequest(0, disc, 'enhanced', 1);
        assert.ok(plain);
        assert.equal('paintKey' in plain, false);
        const painted = discShadeRequest(0, disc, 'enhanced', 1, { key: 'k1', lon: 0.5 });
        assert.equal(painted.paintKey, 'k1');
        assert.equal(painted.paintLon, 0.5);
        const vanilla = discShadeRequest(0, disc, 'vanilla', 1, { key: 'k1', lon: 0.5 });
        assert.equal('paintKey' in vanilla, false, 'vanilla has no edits');
        assert.match(ENHANCED_DRAW_FRAG, /uniform sampler2D uPaint;/);
        assert.match(ENHANCED_DRAW_FRAG, /float plon = uPaintLon - atan\(qc\.y, qc\.x\);/);
        assert.match(ENHANCED_DRAW_FRAG, /albedo = albedo \* \(1\.0 - paint\.a\) \+ paint\.rgb;/);
        assert.doesNotMatch(DRAW_FRAG, /uPaint/);
        // The wiring: the service keys the epoch on the paint, sends the texture before the watch, and the worker keeps it by key.
        const service = read('surface/service.ts');
        assert.match(service, /const paint = request\.mode === 'enhanced' \? discPaintFor\(disc\) : null;/);
        assert.match(service, /for \(const paint of paints\.values\(\)\) link\.paint\(paint\.key, paint\.texture\);\s+link\.submit\(shades\);/);
        assert.match(service, /paints\.has\(disc\.key\) \? ':' \+ \(paints\.get\(disc\.key\) as DiscPaint\)\.key : ''/);
        assert.match(service, /resetDiscPaint\(\);/);
        assert.match(read('surface/vanilla/gl.worker.ts'), /if \(data\.op === 'paint' && !\('id' in data\)\) \{\s+const paint = data as PaintMessage;\s+session\(\)\.setPaint\(paint\.key, paint\.image\);/);
        const gl = read('surface/vanilla/gl.ts');
        assert.match(gl, /paint: paintTexture\(item\.req\.paintKey\),/);
        assert.match(gl, /for \(const paint of paints\.values\(\)\) paint\.texture = null;\s+hooks\?\.onLost\?\.\(\);/, 'a lost context drops the uploads, not the pixels');
        const shade = read('surface/vanilla/gl_shade.ts');
        assert.match(shade, /if \(u\.uPaint\) \{\s+gl\.activeTexture\(gl\.TEXTURE3\);/);
        const link = read('surface/disc_link.ts');
        assert.match(link, /if \(paints\.has\(key\)\) return;\s+paints\.add\(key\);/, 'once per key per worker');
    });
});
