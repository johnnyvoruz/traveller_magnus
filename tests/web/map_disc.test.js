// The hex map on the orbit view's disc (apps/web/src/surface/map_disc.ts; Johnny, 2026-11-14: "texture the
// globe from the hex map"): the texture built from the world's own sheet, its alpha as open liquid, the
// two sizes and their queue, and the wiring to the enhanced disc program.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { hybridWorld } from '../../apps/web/src/surface/hybrid/inputs.ts';
import { buildHybridModel } from '../../apps/web/src/surface/hybrid/model.ts';
import { rememberHybridModel } from '../../apps/web/src/surface/hybrid/index.ts';
import { discMapState, discMapTexture, mapDiscTexture, mapKeyOf, mapSheet, MAP_DISC_FULL, MAP_DISC_MIN, MAP_STAGES, resetDiscMaps } from '../../apps/web/src/surface/map_disc.ts';
import { ENHANCED_DRAW_FRAG } from '../../apps/web/src/surface/enhanced/draw.ts';
import { DRAW_FRAG } from '../../apps/web/src/surface/vanilla/gl_shade.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => fs.readFileSync(path.join(root, 'apps/web/src', rel), 'utf8');

const world = (slug, uwp, kelvin) => hybridWorld('map-disc-test/' + slug, 'w0', {
    type: 'Planet', name: slug, uwp, size: parseInt(uwp[1], 36), atmCode: parseInt(uwp[2], 36), hydroCode: parseInt(uwp[3], 36), meanTempK: kelvin,
}, { continental: 0.55, coastline: 0.45 });

afterEach(() => resetDiscMaps());

describe('the texture', () => {
    const garden = world('garden', 'B867974-C', 291);
    const model = buildHybridModel(garden);
    const texture = mapDiscTexture(model, 'quick', 'k');

    test('two by one, every texel painted from the map, and the sheet is the net alone', () => {
        assert.equal(texture.width, MAP_STAGES.quick.rows * 2);
        assert.equal(texture.height, MAP_STAGES.quick.rows);
        assert.equal(texture.pixels.length, texture.width * texture.height * 4);
        let empty = 0;
        for (let k = 0; k < texture.pixels.length; k += 4) if (texture.pixels[k] + texture.pixels[k + 1] + texture.pixels[k + 2] === 0) empty += 1;
        assert.equal(empty, 0, 'no texel is left unread, at a cut, a face edge or a pole');
        const sheet = mapSheet('quick');
        assert.equal(sheet.width, 5 * MAP_STAGES.quick.side);
        assert.equal(sheet.ox, 0, 'edge to edge: the cut is straight');
        assert.equal(MAP_STAGES.full.rows, 1024);
    });

    test('alpha is open liquid: about the share of the world its open sea hexes cover, and none on a dry world', () => {
        let wet = 0;
        let total = 0;
        // Equal-area weights: a row's texels cover cos(latitude).
        for (let i = 0; i < texture.height; i += 1) {
            const w = Math.cos(Math.PI / 2 - ((i + 0.5) / texture.height) * Math.PI);
            for (let j = 0; j < texture.width; j += 1) {
                wet += (texture.pixels[(i * texture.width + j) * 4 + 3] / 255) * w;
                total += w;
            }
        }
        let open = 0;
        for (const hex of model.hexes) if (hex.water && hex.terrain !== 'SI' && hex.terrain !== 'IF') open += hex.area;
        assert.ok(open > 0.3, 'the fixture has seas');
        assert.ok(Math.abs(wet / total - open) < 0.08, 'liquid ' + (wet / total).toFixed(3) + ' against open sea ' + open.toFixed(3));
        const dry = mapDiscTexture(buildHybridModel(world('desert', 'C560757-A', 310)), 'quick', 'd');
        let any = 0;
        for (let k = 3; k < dry.pixels.length; k += 4) if (dry.pixels[k]) any += 1;
        assert.equal(any, 0, 'no water, no glint');
    });
});

describe('the queue', () => {
    test('quick first, then full for a large disc; the best ready one is handed over; a rebuilt texture has a new key', () => {
        const w = world('queue', 'C76A656-9', 289);
        rememberHybridModel(w, buildHybridModel(w));
        const jobs = [];
        const schedule = (fn) => { jobs.push(fn); return () => {}; };
        const drain = () => { for (let i = 0; i < 20000 && jobs.length; i += 1) jobs.shift()(); };
        assert.equal(discMapTexture(w, null, true, 0, schedule), null, 'nothing yet');
        assert.equal(discMapState().building, true);
        // One build at a time: the quick one, and the full one waits.
        assert.equal(discMapState().waiting, 1);
        drain();
        const state = discMapState();
        assert.deepEqual(state.held.map((item) => item.stage).sort(), ['full', 'quick']);
        const full = discMapTexture(w, null, true, 0, schedule);
        const quick = discMapTexture(w, null, false, 0, schedule);
        assert.equal(full.width, 2048);
        assert.equal(quick.width, 512);
        assert.ok(full.key.startsWith(mapKeyOf(w, null, 'full') + '#'), 'the key carries a serial');
        resetDiscMaps();
        discMapTexture(w, null, false, 0, schedule);
        drain();
        const again = discMapTexture(w, null, false, 0, schedule);
        assert.notEqual(again.key, quick.key, 'built again, it crosses to the worker again');
    });
});

describe('the wiring', () => {
    test('the service draws a disc from its map when it is large enough to show one, and from the painted hexes alone otherwise', () => {
        const service = read('surface/service.ts');
        assert.match(service, /const surface = request\.mode !== 'enhanced' \? null : webglState\(\) === 'missing' \? discPaintFor\(disc\) : discSurfaceFor\(disc\);/);
        assert.match(service, /if \(surface === DISC_WAITS\) \{\s+waiting \+= 1;\s+continue;\s+\}/, 'a disc whose map is on the way asks for no tile: it never wears another geography');
        assert.match(service, /if \(texture\) return \{[^}]*map: true \};\s+\/\/ [^\n]*\s+return DISC_WAITS;/);
        assert.match(service, /if \(disc\.radiusPx >= MAP_DISC_MIN\) \{[\s\S]*?discMapTexture\(world, kept, disc\.radiusPx >= MAP_DISC_FULL, disc\.near \?\? 0\);[\s\S]*?map: true \};[\s\S]*?return discPaintFor\(disc\);/);
        assert.match(service, /resetDiscPaint\(\);\s+resetDiscMaps\(\);/);
        assert.ok(MAP_DISC_MIN < MAP_DISC_FULL);
        assert.match(read('surface/disc_shade.ts'), /if \(paint\.map\) request\.paintMap = true;/);
        assert.match(read('surface/vanilla/gl_shade.ts'), /gl\.uniform1f\(u\.uHasPaint \?\? null, req\.paint \? \(req\.paintMap \? 2 : 1\) : 0\);/);
        assert.match(read('surface/vanilla/gl.ts'), /paintMap: item\.req\.paintMap === true,/);
    });

    test('the enhanced program takes the map for the ground and its alpha for open liquid; the vanilla program knows nothing of it', () => {
        for (const mark of [
            'if (uHasPaint > 1.5) {',
            'albedo = paint.rgb;',
            'props.r = mapSea;',
            'props.b = (1.0 - smoothstep(0.035, 0.1, abs(paint.a - 0.3765)))',
            'cityRaw *= mapLand;',
            '* uBump * 2.4 * (1.0 - mapMode) * (1.0 - props.r)',
            '* fine * (uHasPaint > 1.5 ? 0.0 : 1.0);',
        ]) assert.ok(ENHANCED_DRAW_FRAG.includes(mark), mark);
        assert.ok(ENHANCED_DRAW_FRAG.includes('albedo = albedo * (1.0 - paint.a) + paint.rgb;'), 'the painted hexes alone are laid over as before');
        const map = ENHANCED_DRAW_FRAG.slice(ENHANCED_DRAW_FRAG.indexOf('if (uHasPaint > 1.5) {'), ENHANCED_DRAW_FRAG.indexOf('} else {', ENHANCED_DRAW_FRAG.indexOf('if (uHasPaint > 1.5) {')));
        assert.doesNotMatch(map, /glowTight \*=|glowBroad \*=|cloud/, 'the glow still spills over the water, and the clouds are untouched');
        assert.equal(DRAW_FRAG.includes('uHasPaint'), false);
    });
});

// The HUD layer (Johnny, 2026-11-14): a plain mark on every world too small to make out, on by default.
describe('the orbit view\'s HUD layer', () => {
    test('on by default, its own key and chip, never on the selected world, gone by the time a surface shows', async () => {
        const { DEFAULT_LAYERS } = await import('../../apps/web/src/orbit/picture.ts');
        const { LAYERS, toggled } = await import('../../apps/web/src/orbit/commands.ts');
        assert.equal(DEFAULT_LAYERS.hud, true);
        const row = LAYERS.find((item) => item.key === 'hud');
        assert.deepEqual([row.id, row.label, row.hotkey], ['orbit-layer-hud', 'HUD', 'h']);
        assert.equal(new Set(LAYERS.map((item) => item.hotkey)).size, LAYERS.length, 'no two layers share a key');
        assert.equal(toggled(DEFAULT_LAYERS, 'hud').hud, false);
        const renderer = read('orbit/OrbitRenderer.ts');
        assert.match(renderer, /if \(layers\.hud && state\.selected !== w\.key\) this\.hudMark\(at\);/, 'the selection\'s own mark stands alone');
        assert.match(renderer, /const HUD_FADE_FROM = 9;\s+const HUD_FADE_TO = 24;/);
        assert.match(renderer, /const fade = 1 - Math\.max\(0, Math\.min\(1, \(at\.r - HUD_FADE_FROM\) \/ \(HUD_FADE_TO - HUD_FADE_FROM\)\)\);\s+if \(fade <= 0\.01\) return;/);
        assert.match(read('orbit/LayerKey.vue'), /\.orbit-key-mark\.is-hud::before \{/);
    });
});

// The per-world variety (Johnny, 2026-11-14): kin, not copies.
describe('worlds of one kind are kin, not copies', () => {
    test('two gas giants of one type from two seeds differ in bands and colour; the same seed is the same giant', async () => {
        const { enhancedProfile } = await import('../../apps/web/src/surface/enhanced/climate.ts');
        const giant = () => ({ type: 'Gas Giant', name: 'G', ggType: 'GL', meanTempK: 130, siderealHours: 10 });
        const a = enhancedProfile(giant(), 'kin-a');
        const b = enhancedProfile(giant(), 'kin-b');
        const again = enhancedProfile(giant(), 'kin-a');
        assert.deepEqual(again.gas, a.gas);
        assert.notDeepEqual(a.gas.zone, b.gas.zone);
        assert.ok(a.gas.bands >= 5 && a.gas.bands <= 18);
        const rock = () => ({ type: 'Planet', name: 'R', uwp: 'E300000-0', size: 3, atmCode: 0, hydroCode: 0, meanTempK: 230 });
        assert.notDeepEqual(enhancedProfile(rock(), 'kin-a').rock.low, enhancedProfile(rock(), 'kin-b').rock.low);
        assert.ok(ENHANCED_DRAW_FRAG.includes('vec3 lean = 0.92 + 0.16 * fract(uOffset * vec3(0.137, 0.219, 0.311));'));
    });
});
