// The hybrid surface map (apps/web/src/surface/hybrid): grid, model, people, overlays, icon sets.
// See assets/HybridSurfaceMap_Design.md.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { MgT2EData } from '../../packages/engines/src/generated/rules/mgt2e_data.js';
import { gridOf, hexCount, rowLength, addressOf, hexAt, nearestHex, sphere } from '../../apps/web/src/surface/hybrid/grid.ts';
import { SHEET_LAYOUT, fieldOf, halfLayout, sheetPoint } from '../../apps/web/src/surface/hybrid/field.ts';
import { hybridWorld, worldDigest, HYBRID_SURFACE_VERSION } from '../../apps/web/src/surface/hybrid/inputs.ts';
import { buildHybridModel, BAKED_K, LOCKED_NIGHT_CENTRED_LON } from '../../apps/web/src/surface/hybrid/model.ts';
import { paintHybrid } from '../../apps/web/src/surface/hybrid/paint.ts';
import { paintShadow, sunVector } from '../../apps/web/src/surface/hybrid/overlay.ts';
import { mapSun } from '../../apps/web/src/surface/hybrid/stage.ts';
import { BOILING_K } from '../../apps/web/src/surface/hybrid/liquids.ts';
import { SURFACE_CODES, CODE_TABLE, TERRAIN_CODES } from '../../apps/web/src/surface/hybrid/codes.ts';
import {
    parseManifest, missingCodes, loadIconSet, clearIconSets, builtinGlyph, drawCode,
} from '../../apps/web/src/surface/hybrid/icons.ts';
import {
    packHexes, unpackHexes, serializeEdits, parseEdits, applyEdits, memoryEditStore,
} from '../../apps/web/src/surface/hybrid/serialize.ts';
import { subsolarOn } from '../../apps/web/src/orbit/sun.ts';
import { lonOf, latOf } from '../../apps/web/src/surface/hybrid/grid.ts';
import {
    easeInOutCubic, wrapLon, lonDelta, lerpPose, angleBetween, createSunMotion, createFade, frameDue,
    clockStepDeg, JUMP_TWEEN_MS, AVERAGE_FADE_MS, REDUCED_STEP_MS,
} from '../../apps/web/src/surface/hybrid/motion.ts';
import { NIGHT_PEAK, NIGHT_PEAK_STEPS, NIGHT_TINT, paintDayNight, nightShare, shadowAlpha } from '../../apps/web/src/surface/hybrid/overlay.ts';
import { cityLights, drawMarks, drawSymbols, legendBlocks, legendGroups, weakestLegendRow } from '../../apps/web/src/surface/hybrid/symbols.ts';
import { TERMINUS_ALPHA, TERMINUS_ALPHA_STEPS, terminusSegments } from '../../apps/web/src/surface/hybrid/chrome.ts';
import { clampView, hexCssPx, maxZoom, panBy, zoomAbout, HEX_READ_PX } from '../../apps/web/src/surface/hybrid/view.ts';
import { createDayNightLayer } from '../../apps/web/src/surface/hybrid/daynight_layer.ts';
import {
    dayNightOverlay, setDayNightOverlay, onDayNightOverlay, mapStyle, setMapStyle,
} from '../../apps/web/src/surface/preferences.ts';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ICONS = path.join(ROOT, 'apps', 'web', 'public', 'surface-icons');
const TOKENS = fs.readFileSync(path.join(ROOT, 'apps', 'web', 'src', 'design', 'tokens.css'), 'utf8');

const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

function earth(extra = {}) {
    return {
        type: 'Planet', name: 'Terra', size: 8, atmCode: 6, hydroCode: 7, hydroPercent: 72, popCode: 9,
        starport: 'A', uwp: 'A867977-C', meanTempK: 288, lowTempK: 250, highTempK: 310, axialTilt: 23.4,
        liquidType: 'Water', diamKm: 12742, tradeCodes: 'Hi In', navalBase: true, scoutBase: true,
        ...extra,
    };
}
const worldOf = (body, hexKey = '0101', dossierKey = 'w0') => hybridWorld(hexKey, dossierKey, body);
const modelOf = (body, hexKey, dossierKey) => buildHybridModel(worldOf(body, hexKey, dossierKey));

describe('icosahedral hex grid', () => {
    test('10n²+2 hexes, 12 pentagons, symmetric neighbours, addresses round-trip', () => {
        for (let n = 1; n <= 10; n += 1) {
            const grid = gridOf(n);
            assert.equal(grid.count, 10 * n * n + 2, 'count n=' + n);
            assert.equal(hexCount(n), grid.count);
            let rows = 0;
            for (let r = 0; r <= 3 * n; r += 1) rows += rowLength(n, r);
            assert.equal(rows, grid.count, 'rows n=' + n);
            let five = 0;
            for (let id = 0; id < grid.count; id += 1) {
                const nb = grid.nb[id];
                assert.ok(nb.length === 5 || nb.length === 6, 'degree ' + nb.length);
                if (nb.length === 5) five += 1;
                assert.equal(new Set(nb).size, nb.length);
                for (const other of nb) {
                    assert.notEqual(other, id);
                    assert.ok(grid.nb[other].includes(id), 'symmetric ' + id + '–' + other);
                }
                const address = addressOf(grid, id);
                assert.ok(address);
                assert.equal(hexAt(grid, address), id);
            }
            assert.equal(five, 12, 'pentagons n=' + n);
            assert.equal(addressOf(grid, grid.count), null);
            assert.equal(hexAt(grid, { row: 3 * n + 1, col: 0 }), null);
        }
    });

    test('hex areas are near equal and the nearest hex of a centre is itself', () => {
        const grid = gridOf(8);
        let total = 0;
        let min = Infinity;
        let max = 0;
        for (let id = 0; id < grid.count; id += 1) {
            total += grid.area[id];
            min = Math.min(min, grid.area[id]);
            max = Math.max(max, grid.area[id]);
            const p = grid.P[id];
            assert.equal(nearestHex(grid, p), id);
        }
        assert.ok(Math.abs(total - 1) < 1e-6, 'areas sum to 1: ' + total);
        assert.ok(max / min < 2.2, 'area spread ' + (max / min));
    });

    test('a hex centre lands inside the sheet and the field maps it back to that hex', () => {
        const grid = gridOf(8);
        const field = fieldOf(SHEET_LAYOUT, 8);
        let hits = 0;
        for (let id = 0; id < grid.count; id += 1) {
            const p = grid.P[id];
            const [x, y] = sheetPoint(SHEET_LAYOUT, p);
            assert.ok(x >= 0 && x <= SHEET_LAYOUT.width && y >= 0 && y <= SHEET_LAYOUT.height, 'on the sheet');
            const k = Math.min(SHEET_LAYOUT.height - 1, Math.floor(y)) * SHEET_LAYOUT.width + Math.min(SHEET_LAYOUT.width - 1, Math.floor(x));
            if (field.hex[k] === id) hits += 1;
        }
        assert.ok(hits / grid.count > 0.9, 'hits ' + hits + '/' + grid.count);
    });
});

describe('hybrid model', () => {
    test('deterministic, and the same after a rename', () => {
        const a = modelOf(earth());
        const b = modelOf(earth());
        const renamed = modelOf(earth({ name: 'Somewhere Else' }));
        const terrain = (m) => m.hexes.map((h) => h.terrain + h.features.join(',') + h.accents.join(',')).join('|');
        assert.equal(terrain(a), terrain(b));
        assert.equal(terrain(a), terrain(renamed));
        assert.deepEqual(worldOf(earth()), worldOf(earth({ name: 'Somewhere Else' })));
        assert.equal(sha(paintHybrid(a, SHEET_LAYOUT)), sha(paintHybrid(renamed, SHEET_LAYOUT)));
        // Another place is another map.
        assert.notEqual(terrain(a), terrain(modelOf(earth(), '0202')));
        assert.notEqual(worldDigest(worldOf(earth())), worldDigest(worldOf(earth({ hydroPercent: 40 }))));
        assert.match(HYBRID_SURFACE_VERSION, /^hybrid-surface-\d+$/);
    });

    test('the sea covers the hydrographic percentage', () => {
        for (const percent of [10, 30, 50, 72, 90]) {
            for (const hexKey of ['0101', '1710', '3240']) {
                const model = modelOf(earth({ hydroPercent: percent, hydroCode: Math.round(percent / 10) }), hexKey);
                assert.ok(Math.abs(model.seaShare - percent / 100) <= 0.04, hexKey + ' ' + percent + '%: ' + model.seaShare.toFixed(3));
            }
        }
        assert.equal(modelOf(earth({ hydroPercent: 0, hydroCode: 0, liquidType: '' })).seaShare, 0);
    });

    test('no cities or arcologies on ice, and domes on an ice world', () => {
        const cases = [
            earth(),
            earth({ meanTempK: 240, lowTempK: 200, highTempK: 262, tradeCodes: 'Hi Ic' }),
            earth({ meanTempK: 205, lowTempK: 170, highTempK: 230, atmCode: 1, hydroPercent: 95, hydroCode: 10, popCode: 8, uwp: 'B1A8000-C', tradeCodes: 'Ic' }),
            earth({ meanTempK: 300, lowTempK: 260, highTempK: 330, tidallyLocked: true, popCode: 9 }),
        ];
        for (const [index, body] of cases.entries()) {
            for (const hexKey of ['0101', '0505', '2718']) {
                const model = modelOf(body, hexKey);
                for (const hex of model.hexes) {
                    const big = hex.features.includes('city') || hex.features.includes('arcology');
                    if (big) {
                        assert.equal(hex.ice, 'none', 'case ' + index + ' hex ' + hex.id + ' is ' + hex.terrain);
                        assert.equal(hex.water, false);
                    }
                    if (hex.features.length && hex.ice !== 'none') assert.equal(hex.domed, true, 'a settlement on ice is domed');
                }
            }
        }
        const iceWorld = modelOf(cases[2]);
        assert.ok(iceWorld.hexes.some((h) => h.features.includes('starport')), 'the ice world still has its starport');
    });

    test('bases stand next to the starport, estates and penal only from T5 data', () => {
        const model = modelOf(earth());
        const port = model.hexes.find((h) => h.features.includes('starport'));
        assert.ok(port);
        assert.equal(port.port, 'A');
        for (const base of ['naval', 'scout']) {
            const at = model.hexes.find((h) => h.features.includes(base));
            assert.ok(at, base);
            const near = at.id === port.id || model.grid.nb[port.id].includes(at.id)
                || model.grid.nb[port.id].some((n) => model.grid.nb[n].includes(at.id));
            assert.ok(near, base + ' near the starport');
        }
        assert.equal(model.hexes.some((h) => h.features.includes('estate') || h.features.includes('penal')), false);
        const t5 = modelOf(earth({ nobleCodes: 'BcD', tradeCodes: 'Hi In Pe' }));
        assert.ok(t5.hexes.some((h) => h.features.includes('estate')));
        assert.ok(t5.hexes.some((h) => h.features.includes('penal')));
    });

    test('engine temperatures decide the climate: baked lands, ice caps on land and sea', () => {
        const hot = modelOf(earth({ meanTempK: 380, lowTempK: 350, highTempK: 420, hydroPercent: 0, hydroCode: 0, liquidType: '', atmCode: 8 }));
        assert.ok(hot.hexes.some((h) => h.terrain === 'BK'), 'baked lands above ' + BAKED_K + ' K');
        const cold = modelOf(earth({ meanTempK: 255, lowTempK: 215, highTempK: 280 }));
        assert.ok(cold.hexes.some((h) => h.water && h.ice !== 'none'), 'sea ice');
        assert.ok(cold.hexes.some((h) => !h.water && h.ice !== 'none'), 'land ice');
        // An unresolved water sea is water, never the unknown liquid.
        const world = worldOf(earth({ liquidType: 'Water', liquidStatus: { status: 'unresolved' } }));
        assert.equal(world.liquid, 'Water');
        const unnamed = worldOf(earth({ liquidType: '' }));
        assert.equal(unnamed.liquid, 'Water');
        assert.equal(unnamed.liquidAssumed, true);
        // Mountains are grey, not the snow white of an ice cap.
        assert.deepEqual([...CODE_TABLE.MT.rgb].every((v, i, a) => Math.abs(v - a[0]) < 20), true);
    });

    test('a locked world is centred on its night side with a substellar point', () => {
        const model = modelOf(earth({ tidallyLocked: true, meanTempK: 290, lowTempK: 180, highTempK: 360 }));
        assert.ok(model.sub);
        assert.equal(model.layout, 'locked');
        assert.ok(Math.abs(lonOf(model.sub) - LOCKED_NIGHT_CENTRED_LON) < 1e-6, 'sub lon ' + lonOf(model.sub));
        assert.ok(Math.abs(latOf(model.sub)) < 1e-6);
        const day = model.hexes.reduce((m, h) => (h.theta < 30 ? Math.max(m, h.tempK) : m), 0);
        const night = model.hexes.reduce((m, h) => (h.theta > 150 ? Math.min(m, h.tempK) : m), Infinity);
        assert.ok(day > night + 60, 'day ' + day + ' night ' + night);
    });

    test('a locked water world keeps its ice on the night side', () => {
        const model = modelOf(earth({ tidallyLocked: true, meanTempK: 280, lowTempK: 200, highTempK: 360, hydroPercent: 70, hydroCode: 7 }));
        const iced = model.hexes.filter((h) => h.ice !== 'none');
        const open = model.hexes.filter((h) => h.water && h.ice === 'none');
        assert.ok(iced.length > 10, 'night ice ' + iced.length);
        assert.ok(open.length > 10, 'open sea ' + open.length);
        const mean = (rows) => rows.reduce((sum, hex) => sum + hex.theta, 0) / rows.length;
        assert.ok(mean(iced) > mean(open) + 20, 'ice at ' + mean(iced).toFixed(1) + '°, open sea at ' + mean(open).toFixed(1) + '°');
    });

    test('ice edges are ragged, and a cold airless world is not cut at 55°', () => {
        const wet = modelOf(earth({ meanTempK: 288, lowTempK: 250, highTempK: 320, axialTilt: 23, hydroPercent: 70 }));
        const edge = [];
        const icy = new Set(wet.hexes.filter((h) => h.ice !== 'none').map((h) => h.id));
        for (const hex of wet.hexes) {
            if (hex.lat < 25 || !icy.has(hex.id)) continue;
            if (wet.grid.nb[hex.id].some((id) => !icy.has(id))) edge.push(hex.lat);
        }
        assert.ok(edge.length > 4, 'northern ice edge');
        const spread = Math.max(...edge) - Math.min(...edge);
        assert.ok(spread > 6, 'northern edge spans ' + spread.toFixed(1) + '°');

        const bare = modelOf(earth({
            atmCode: 0, pressureBar: 0, hydroPercent: 20, hydroCode: 2, liquidType: 'Ice',
            meanTempK: 180, lowTempK: 160, highTempK: 200, popCode: 0, uwp: 'X310000-0', tradeCodes: 'Va',
        }));
        const frost = bare.hexes.filter((h) => h.terrain === 'FR');
        assert.ok(frost.some((h) => Math.abs(h.lat) < 30), 'frost inside 30° of the equator');
    });

    test('a tilt past 63° puts the cold belt on the equator', () => {
        const model = modelOf(earth({
            axialTilt: 85, meanTempK: 260, lowTempK: 200, highTempK: 320, hydroPercent: 50, hydroCode: 5,
        }));
        const band = (from, to) => model.hexes.filter((h) => Math.abs(h.lat) >= from && Math.abs(h.lat) < to);
        const iceShare = (rows) => rows.filter((h) => h.ice !== 'none').length / rows.length;
        const equator = iceShare(band(0, 20));
        const poles = iceShare(band(70, 91));
        assert.ok(equator > poles + 0.25, 'equator ice ' + equator.toFixed(2) + ', poles ' + poles.toFixed(2));
    });
});

describe('the sun over the map', () => {
    test('subsolar point of a turning world', () => {
        const body = { axialTilt: 23.4, siderealHours: 24, solarDayHours: 24 };
        const a = subsolarOn(body, false, 0, 0);
        const b = subsolarOn(body, false, 0.25, 0);
        const c = subsolarOn(body, false, 1, 0);
        assert.equal(a.locked, false);
        assert.ok(Math.abs(a.latDeg) <= 23.4 + 1e-9);
        const turn = ((a.lonFromPortDeg - b.lonFromPortDeg) % 360 + 360) % 360;
        assert.ok(Math.abs(turn - 90) < 1e-6, 'a quarter day turns the sun 90°: ' + turn);
        assert.ok(Math.abs(a.lonFromPortDeg - c.lonFromPortDeg) < 1e-6);
        // The season: a quarter orbit apart the declination moves.
        const summer = subsolarOn(body, false, 0, Math.PI / 2);
        const winter = subsolarOn(body, false, 0, -Math.PI / 2);
        assert.ok(Math.abs(Math.abs(summer.latDeg) - 23.4) < 0.5, 'solstice ' + summer.latDeg);
        assert.ok(Math.abs(summer.latDeg + winter.latDeg) < 1e-6);
    });

    test('a locked world has a still sun from its own substellar point', () => {
        const body = earth({ tidallyLocked: true });
        const s1 = subsolarOn(body, false, 0, 1);
        const s2 = subsolarOn(body, false, 123.4, 1);
        assert.equal(s1.locked, true);
        assert.equal(s1.latDeg, 0);
        assert.equal(s1.lonFromPortDeg, s2.lonFromPortDeg);
        const model = modelOf(body);
        const sun = mapSun(model, s2, true, 1000);
        assert.equal(sun.still, true);
        assert.equal(sun.averaged, false);
        assert.deepEqual(sun.sun, model.sub);
    });

    test('fast clocks show the day-averaged shadow', () => {
        const model = modelOf(earth());
        const sub = subsolarOn({ axialTilt: 23.4, siderealHours: 24, solarDayHours: 24 }, false, 10, 0.3);
        assert.equal(mapSun(model, sub, true, 0.5).averaged, false);
        assert.equal(mapSun(model, sub, true, 5).averaged, true);
        assert.equal(mapSun(model, sub, false, 5).averaged, false);
    });

    test('overlay frames never change the terrain, and a shadow frame is cheap', () => {
        const model = modelOf(earth());
        const before = sha(paintHybrid(model, SHEET_LAYOUT));
        const hexes = JSON.stringify(model.hexes);
        const field = fieldOf(halfLayout(SHEET_LAYOUT), model.grid.n);
        const out = new Uint8ClampedArray(field.layout.width * field.layout.height * 4);
        const times = [];
        for (let frame = 0; frame < 60; frame += 1) {
            const t0 = performance.now();
            paintShadow(field, { kind: 'instant', sun: sunVector(10 * Math.sin(frame), frame * 6 - 180) }, false, out);
            times.push(performance.now() - t0);
        }
        paintShadow(field, { kind: 'averaged', declinationDeg: 20 }, false, out);
        paintShadow(field, { kind: 'instant', sun: sunVector(0, 0) }, true, out);
        times.sort((x, y) => x - y);
        const median = times[times.length >> 1];
        assert.ok(median < 2, 'median shadow frame ' + median.toFixed(2) + ' ms');
        assert.equal(JSON.stringify(model.hexes), hexes);
        assert.equal(sha(paintHybrid(model, SHEET_LAYOUT)), before);
    });

    test('the airless terminator is hard, an atmosphere softens it', () => {
        const field = fieldOf(halfLayout(SHEET_LAYOUT), 4);
        const sun = sunVector(0, 0);
        const soft = paintShadow(field, { kind: 'instant', sun }, false);
        const hard = paintShadow(field, { kind: 'instant', sun }, true);
        const partial = (px) => {
            let top = 0;
            for (let i = 3; i < px.length; i += 4) top = Math.max(top, px[i]);
            let c = 0;
            for (let i = 3; i < px.length; i += 4) if (px[i] > 0 && px[i] < top - 2) c += 1;
            return c;
        };
        assert.ok(partial(soft) > partial(hard) * 2, 'soft ' + partial(soft) + ' hard ' + partial(hard));
    });
});

describe('codes and icon sets', () => {
    test('the boiling points match the engine table', () => {
        for (const row of MgT2EData.atmosphereExtended.exoticLiquids) {
            if (typeof row.bp !== 'number') continue;
            assert.equal(BOILING_K[row.name], row.bp, row.name);
        }
    });

    test('one code table', () => {
        assert.equal(new Set(SURFACE_CODES).size, SURFACE_CODES.length);
        for (const code of SURFACE_CODES) assert.ok(CODE_TABLE[code], code);
        assert.ok(TERRAIN_CODES.includes('EV'));
    });

    test('the default set covers every code with files that exist', () => {
        const json = JSON.parse(fs.readFileSync(path.join(ICONS, 'default', 'manifest.json'), 'utf8'));
        const manifest = parseManifest(json, 'default');
        assert.deepEqual(manifest.problems, []);
        assert.deepEqual(missingCodes(manifest), []);
        for (const entry of manifest.entries.values()) {
            const svg = fs.readFileSync(path.join(ICONS, 'default', entry.file), 'utf8');
            assert.match(svg, /<svg[^>]*viewBox="0 0 64 64"/, entry.file);
        }
        assert.ok(fs.existsSync(path.join(ICONS, 'README.md')));
    });

    test('built-in glyphs name tokens, not hex colours', () => {
        const icons = fs.readFileSync(path.join(ROOT, 'apps', 'web', 'src', 'surface', 'hybrid', 'icons.ts'), 'utf8');
        const symbols = fs.readFileSync(path.join(ROOT, 'apps', 'web', 'src', 'surface', 'hybrid', 'symbols.ts'), 'utf8');
        assert.doesNotMatch(icons, /#[0-9a-fA-F]{3,8}\b/);
        assert.doesNotMatch(symbols, /#[0-9a-fA-F]{3,8}\b/);
        for (const name of ['--icon-port-letter', '--icon-volcano', '--icon-mark', '--icon-farm-line', '--icon-city']) {
            assert.match(TOKENS, new RegExp(name + ':'));
        }
    });

    test('the default set’s own colours are the icon tokens', () => {
        const full = (hex) => {
            const digits = hex.slice(1).toLowerCase();
            const six = digits.length === 3 ? [...digits].map((d) => d + d).join('') : digits.slice(0, 6);
            return '#' + six;
        };
        const token = (name) => {
            const found = TOKENS.match(new RegExp(name + ':\\s*(#[0-9a-fA-F]{3,8})'));
            assert.ok(found, name);
            return full(found[1]);
        };
        const expect = {
            city: ['--icon-city'],
            town: ['--icon-city'],
            rural: ['--icon-city'],
            arcology: ['--icon-arcology'],
            outpost: ['--icon-outpost'],
            farm: ['--icon-farm'],
            resource: ['--icon-resource', '--icon-resource-ink'],
            naval: ['--icon-naval'],
            scout: ['--icon-scout'],
            military: ['--icon-military'],
            estate: ['--icon-estate'],
            penal: ['--icon-penal'],
            dome: ['--icon-dome'],
            starport: ['--icon-port', '--icon-port-ink'],
        };
        for (const [code, names] of Object.entries(expect)) {
            const svg = fs.readFileSync(path.join(ICONS, 'default', code + '.svg'), 'utf8').toLowerCase();
            const paints = [...svg.matchAll(/#([0-9a-f]{3,8})\b/g)].map((hit) => full('#' + hit[1]));
            for (const name of names) assert.ok(paints.includes(token(name)), code + ' ' + name + ' ' + token(name));
        }
    });

    test('a bad manifest is read as far as it goes, and a missing icon falls back to the glyph', async () => {
        const manifest = parseManifest({ version: 1, icons: { MT: 'mt.svg', XX: 'x.svg', city: { file: '../evil.svg' }, town: { file: 't.svg', scale: 99 } } }, 'test');
        assert.equal(manifest.entries.size, 2);
        assert.equal(manifest.entries.get('town').scale, 4);
        assert.equal(manifest.problems.length, 2);
        clearIconSets();
        const set = await loadIconSet('test-set', {
            fetchJson: async () => ({ version: 1, icons: { MT: 'mt.svg', city: 'city.svg' } }),
            loadImage: async (url) => (url.endsWith('mt.svg') ? { width: 64, height: 64 } : null),
        }, '/icons/');
        assert.ok(set.images.has('MT'));
        assert.ok(set.fallback.includes('city'));
        assert.equal(set.fallback.length, SURFACE_CODES.length - 1);
        const broken = await loadIconSet('gone', { fetchJson: async () => { throw new Error('404'); }, loadImage: async () => null }, '/icons/');
        assert.equal(broken.fallback.length, SURFACE_CODES.length);
        const invalid = await loadIconSet('../x', { fetchJson: async (url) => { assert.ok(url.includes('/default/')); return {}; }, loadImage: async () => null }, '/icons/');
        assert.equal(invalid.name, 'default');
        clearIconSets();
    });

    test('every code draws, from a set or a glyph', () => {
        const calls = [];
        const ctx = new Proxy({}, {
            get: (target, key) => (key in target ? target[key] : (...args) => { calls.push(key); }),
            set: (target, key, value) => { target[key] = value; return true; },
        });
        for (const code of SURFACE_CODES) {
            const n = calls.length;
            builtinGlyph(ctx, code, 10, 10, 8, '#000000', 'A');
            assert.ok(calls.length > n + 2, code);
        }
        const set = { name: 's', manifest: parseManifest({ version: 1, icons: { MT: 'mt.svg' } }, 's'), images: new Map([['MT', { width: 1, height: 1 }]]), fallback: [] };
        drawCode(ctx, set, 'MT', 0, 0, 8, '#000000');
        assert.equal(calls[calls.length - 1], 'drawImage');
    });
});

describe('hex data', () => {
    test('packed hexes and edits round-trip', async () => {
        const model = modelOf(earth());
        const packed = JSON.parse(JSON.stringify(packHexes(model)));
        const back = unpackHexes(packed);
        assert.equal(back.n, model.grid.n);
        assert.equal(back.hexes.length, model.grid.count);
        for (const [i, h] of back.hexes.entries()) {
            assert.equal(h.terrain, model.hexes[i].terrain);
            assert.deepEqual(h.features, model.hexes[i].features);
            assert.equal(h.row, model.hexes[i].row);
        }
        assert.throws(() => unpackHexes({ format: 99, hexes: [] }));

        const target = model.hexes[5];
        const text = serializeEdits(model.grid.n, [
            { row: target.row, col: target.col, terrain: 'LV', features: ['city', 'MT', 'bogus'], note: 'the old forge' },
            { row: 999, col: 0, terrain: 'OC' },
        ]);
        const edits = parseEdits(text);
        assert.deepEqual(edits.edits[0].features, ['city', 'MT']);
        const edited = applyEdits(model, edits);
        assert.equal(edited[5].terrain, 'LV');
        assert.deepEqual(edited[5].features, ['city']);
        assert.notEqual(model.hexes[5].terrain === 'LV' && model.hexes[5].features.join() === 'city', true, 'the model is not changed');
        assert.deepEqual(applyEdits(model, { ...edits, n: model.grid.n + 1 }).map((h) => h.terrain), model.hexes.map((h) => h.terrain));
        const store = memoryEditStore();
        await store.save('0101', 'w0', edits);
        assert.deepEqual(await store.load('0101', 'w0'), edits);
        await store.clear('0101', 'w0');
        assert.equal(await store.load('0101', 'w0'), null);
    });
});

describe('the animated day and night layer', () => {
    const PREFS = '../../apps/web/src/surface/preferences.ts';

    function memoryStorage() {
        const memory = new Map();
        const store = {
            getItem: (key) => (memory.has(key) ? memory.get(key) : null),
            setItem: (key, value) => { memory.set(key, String(value)); },
            removeItem: (key) => { memory.delete(key); },
            clear: () => { memory.clear(); },
        };
        return { memory, store };
    }

    test('the Day/Night and Symbols toggles persist and notify', async () => {
        const saved = globalThis.localStorage;
        const { memory, store } = memoryStorage();
        globalThis.localStorage = store;
        try {
            // A fresh module (no session value): on by default.
            const fresh = await import(PREFS + '?daynight=default');
            assert.equal(fresh.dayNightOverlay(), true);

            const heard = [];
            const stop = onDayNightOverlay((on) => heard.push(on));
            setDayNightOverlay(false);
            assert.equal(memory.get('voyage_surface_daynight'), 'off');
            assert.equal(dayNightOverlay(), false);
            setDayNightOverlay(true);
            assert.equal(memory.get('voyage_surface_daynight'), 'on');
            stop();
            setDayNightOverlay(false);
            assert.deepEqual(heard, [false, true], 'listeners fire until unsubscribed');

            // A new page load reads the stored choice.
            const reloaded = await import(PREFS + '?daynight=reload');
            assert.equal(reloaded.dayNightOverlay(), false);
            memory.set('voyage_surface_daynight', 'on');
            const again = await import(PREFS + '?daynight=reload2');
            assert.equal(again.dayNightOverlay(), true);

            setMapStyle('symbols');
            assert.equal(memory.get('voyage_surface_style'), 'symbols');
            assert.equal(mapStyle(), 'symbols');
            const styled = await import(PREFS + '?style=reload');
            assert.equal(styled.mapStyle(), 'symbols');
            setMapStyle('painted');
            assert.equal(memory.get('voyage_surface_style'), 'painted');
        } finally {
            globalThis.localStorage = saved;
        }
    });

    test('easing is monotonic, bounded and hits its ends', () => {
        assert.equal(easeInOutCubic(0), 0);
        assert.equal(easeInOutCubic(1), 1);
        assert.equal(easeInOutCubic(-3), 0);
        assert.equal(easeInOutCubic(7), 1);
        let last = -1;
        for (let i = 0; i <= 1000; i += 1) {
            const v = easeInOutCubic(i / 1000);
            assert.ok(v >= last, 'monotonic at ' + i);
            assert.ok(v >= 0 && v <= 1, 'bounded at ' + i);
            last = v;
        }
        assert.ok(Math.abs(easeInOutCubic(0.5) - 0.5) < 1e-12);
    });

    test('longitudes wrap across ±180° and travel the short way', () => {
        assert.equal(wrapLon(180), 180);
        assert.equal(wrapLon(-180), 180);
        assert.ok(Math.abs(wrapLon(190) + 170) < 1e-9);
        assert.ok(Math.abs(wrapLon(-540.5) - 179.5) < 1e-9);
        assert.ok(Math.abs(lonDelta(170, -170) - 20) < 1e-9);
        assert.ok(Math.abs(lonDelta(-170, 170) + 20) < 1e-9);
        const a = { lat: 10, lon: 170 };
        const b = { lat: -10, lon: -170 };
        for (let i = 0; i <= 100; i += 1) {
            const p = lerpPose(a, b, i / 100);
            // Through the antimeridian, never across Greenwich.
            assert.ok(Math.abs(p.lon) >= 170 - 1e-9, 'lon ' + p.lon + ' at ' + i);
            assert.ok(p.lat <= 10 + 1e-9 && p.lat >= -10 - 1e-9);
        }
        assert.deepEqual(lerpPose(a, b, 2), lerpPose(a, b, 1), 'no overshoot past t = 1');
        assert.deepEqual(lerpPose(a, b, 1), b, 'ends exactly on the target');
    });

    test('a jump travels eased to its target, never overshooting, and ends exactly there', () => {
        const motion = createSunMotion({ reducedMotion: false });
        const start = { lat: 5, lon: 160 };
        const target = { lat: -15, lon: -120 };
        assert.deepEqual(motion.step(start, 0, 0, false), start, 'the first frame shows its target');
        const total = angleBetween(start, target);
        let lastDist = total;
        let lastFromStart = 0;
        const steps = [];
        for (let t = 0; t <= JUMP_TWEEN_MS + 32; t += 16) {
            const p = motion.step(target, 1000 + t, 0, t === 0);
            const dist = angleBetween(p, target);
            const fromStart = angleBetween(start, p);
            assert.ok(dist <= lastDist + 1e-9, 'closes in monotonically at ' + t);
            assert.ok(fromStart >= lastFromStart - 1e-9 && fromStart <= total + 1e-9, 'never past the target at ' + t);
            // Short way across the antimeridian.
            assert.ok(Math.abs(p.lon) >= 120 - 1e-9, 'lon ' + p.lon);
            steps.push(dist);
            lastDist = dist;
            lastFromStart = fromStart;
        }
        assert.ok(steps[1] > 0 && steps[1] < total, 'travels rather than popping');
        assert.equal(motion.tweening, false);
        assert.deepEqual(motion.step(target, 5000, 0, false), target);
        // Eased: the first and last frames move less than the middle ones.
        const moves = steps.slice(1).map((d, i) => steps[i] - d);
        const mid = moves[moves.length >> 1];
        assert.ok(moves[0] < mid / 3 && moves[moves.length - 3] < mid, 'eased ' + moves.map((m) => m.toFixed(2)).join(' '));
    });

    test('a running clock is followed exactly; a discontinuity is travelled', () => {
        const motion = createSunMotion({ reducedMotion: false });
        let lon = 0;
        motion.step({ lat: 0, lon }, 0, 0, false);
        for (let i = 1; i <= 30; i += 1) {
            lon = wrapLon(lon + 15);
            const expected = clockStepDeg(1, 24, true, 16);
            assert.ok(Math.abs(expected - 5.76) < 1e-9);
            const p = motion.step({ lat: 0, lon }, i * 16, expected, false);
            assert.equal(p.lon, lon, 'playing frames are not lagged');
        }
        // A drag on the orbit timeline (no jump signal) moves the sun 120° in one frame.
        const p = motion.step({ lat: 0, lon: wrapLon(lon + 120) }, 1000, 0, false);
        assert.ok(motion.tweening && angleBetween(p, { lat: 0, lon }) < 1, 'the discontinuity starts a travel');
    });

    test('reduced motion: no travel, no fades, a stepped clock', () => {
        const motion = createSunMotion({ reducedMotion: true });
        motion.step({ lat: 0, lon: 0 }, 0, 0, false);
        const target = { lat: 20, lon: 150 };
        assert.deepEqual(motion.step(target, 16, 0, true), target);
        assert.equal(motion.tweening, false);
        const fade = createFade(0, AVERAGE_FADE_MS, true);
        fade.set(1, 100);
        assert.equal(fade.value(100), 1);
        assert.equal(fade.moving(100), false);
        assert.equal(frameDue(null, 0, true), true);
        assert.equal(frameDue(0, REDUCED_STEP_MS - 1, true), false);
        assert.equal(frameDue(0, REDUCED_STEP_MS, true), true);
        assert.equal(frameDue(0, 1, false), true);
    });

    test('the averaged crossfade is eased both ways and turns back mid-way without a jump', () => {
        const fade = createFade(0, AVERAGE_FADE_MS, false);
        fade.set(1, 0);
        let last = 0;
        for (let t = 0; t <= AVERAGE_FADE_MS; t += 10) {
            const v = fade.value(t);
            assert.ok(v >= last - 1e-12 && v <= 1, 'rising at ' + t);
            last = v;
        }
        assert.equal(fade.value(AVERAGE_FADE_MS), 1);
        assert.equal(fade.moving(AVERAGE_FADE_MS + 1), false);
        // Reverse half-way: continues from where it was shown.
        const f2 = createFade(0, AVERAGE_FADE_MS, false);
        f2.set(1, 0);
        const half = f2.value(AVERAGE_FADE_MS / 2);
        f2.set(0, AVERAGE_FADE_MS / 2);
        assert.ok(Math.abs(f2.value(AVERAGE_FADE_MS / 2) - half) < 1e-12, 'no snap on reversal');
        assert.equal(f2.value(AVERAGE_FADE_MS * 2), 0);
    });

    function fakeCtx() {
        const calls = { putImageData: 0, drawImage: 0, arc: 0 };
        const ctx = {
            calls,
            globalAlpha: 1, imageSmoothingEnabled: true, lineWidth: 1, strokeStyle: '', fillStyle: '',
            clearRect() {}, save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, fill() {}, fillRect() {},
            putImageData() { calls.putImageData += 1; },
            drawImage() { calls.drawImage += 1; },
            arc() { calls.arc += 1; },
            createRadialGradient() { return { addColorStop() {} }; },
        };
        return ctx;
    }
    const fakeHost = (reducedMotion = false) => ({
        reducedMotion,
        canvas: () => ({ canvas: {}, ctx: fakeCtx() }),
        imageData: (px) => px,
    });
    const turning = { axialTilt: 23.4, siderealHours: 24, solarDayHours: 24 };

    test('day and night frames: terrain untouched, glow on the line, cheap per frame', () => {
        const model = modelOf(earth());
        const before = sha(paintHybrid(model, SHEET_LAYOUT));
        const hexes = JSON.stringify(model.hexes);
        const field = fieldOf(halfLayout(SHEET_LAYOUT), model.grid.n);
        let images;
        const times = [];
        for (let frame = 0; frame < 60; frame += 1) {
            const t0 = performance.now();
            const sun = sunVector(20 * Math.sin(frame / 9), frame * 6 - 180);
            images = paintDayNight(field, { sun, declinationDeg: 20, mix: frame % 2 ? 0.4 : 0, airless: false, sheenPhase: frame }, images);
            cityLights(model, SHEET_LAYOUT, sun, frame % 2 ? (s) => nightShare(s, 20) : null, frame % 2 ? 0.4 : 0, frame);
            times.push(performance.now() - t0);
        }
        times.sort((x, y) => x - y);
        const median = times[times.length >> 1];
        assert.ok(median < 4, 'median day/night frame ' + median.toFixed(2) + ' ms');

        const sum = (px, k) => { let s = 0; for (let i = k; i < px.length; i += 4) s += px[i]; return s; };
        const oneInk = (px) => {
            for (let i = 0; i < px.length; i += 4) {
                if (px[i + 3] === 0) continue;
                if (px[i] !== NIGHT_TINT[0] || px[i + 1] !== NIGHT_TINT[1] || px[i + 2] !== NIGHT_TINT[2]) return false;
            }
            return true;
        };
        const day = paintDayNight(field, { sun: sunVector(0, 0), declinationDeg: 0, mix: 0, airless: false, sheenPhase: 0 });
        assert.ok(sum(day.shadow, 3) > 0 && sum(day.glow, 3) === 0, 'a shadow and no terminator line');
        assert.ok(oneInk(day.shadow), 'the shadow is one dark colour');
        // Fully averaged: still a shadow, still no line.
        const avg = paintDayNight(field, { sun: sunVector(0, 0), declinationDeg: 0, mix: 1, airless: false, sheenPhase: 0 });
        assert.ok(sum(avg.shadow, 3) > 0 && sum(avg.glow, 3) === 0, 'averaged shadow ' + sum(avg.shadow, 3));
        // Airless: a hard edge, no line, no second colour.
        const bare = paintDayNight(field, { sun: sunVector(0, 0), declinationDeg: 0, mix: 0, airless: true, sheenPhase: 0 });
        assert.ok(sum(bare.shadow, 3) > 0 && sum(bare.glow, 3) === 0 && oneInk(bare.shadow), 'airless shadow stays one colour');

        // The layer itself, against a fake canvas.
        const layer = createDayNightLayer(fakeHost());
        const shadow = fakeCtx();
        const glow = fakeCtx();
        const layerTimes = [];
        for (let i = 0; i < 40; i += 1) {
            const sub = subsolarOn(turning, false, 10 + i / 240, 0.3);
            const t0 = performance.now();
            const out = layer.draw({ model, sub, playing: true, rate: 1 / 24, jumped: false, nowMs: i * 16 }, shadow, glow, SHEET_LAYOUT);
            layerTimes.push(performance.now() - t0);
            assert.equal(out.drawn, true);
            assert.equal(out.busy, true);
        }
        layerTimes.sort((x, y) => x - y);
        assert.ok(layerTimes[layerTimes.length >> 1] < 4, 'median layer frame ' + layerTimes[layerTimes.length >> 1].toFixed(2) + ' ms');
        assert.equal(glow.calls.arc, 0, 'no terminator outline');
        assert.ok(glow.calls.drawImage > 0, 'settlement lights stay');
        assert.equal(JSON.stringify(model.hexes), hexes);
        assert.equal(sha(paintHybrid(model, SHEET_LAYOUT)), before);
    });

    test('the layer: a jump travels, fast play crossfades in and out, a locked world stands still', () => {
        const model = modelOf(earth());
        const layer = createDayNightLayer(fakeHost());
        const ctx = () => fakeCtx();
        const draw = (days, nowMs, extra = {}) => layer.draw({
            model, sub: subsolarOn(turning, false, days, 0.3), playing: false, rate: 1 / 24, jumped: false, nowMs, ...extra,
        }, ctx(), ctx(), SHEET_LAYOUT);
        const a = draw(10, 0);
        assert.equal(a.busy, false, 'a stopped clock rests');
        const b = draw(10.5, 16, { jumped: true });
        const goal = subsolarOn(turning, false, 10.5, 0.3);
        assert.ok(b.busy && angleBetween(b.pose, a.pose) < 5, 'the jump starts travelling');
        const c = draw(10.5, 16 + JUMP_TWEEN_MS + 1);
        assert.ok(Math.abs(lonDelta(c.pose.lon, wrapLon((model.starportLon ?? 0) + goal.lonFromPortDeg))) < 1e-9, 'arrives');
        assert.equal(c.busy, false);

        // 7 days a second: averaged, faded in over AVERAGE_FADE_MS.
        const fast = (nowMs) => draw(11, nowMs, { playing: true, rate: 7 });
        const f0 = fast(1000);
        assert.equal(f0.averaged, true);
        assert.ok(f0.mix < 0.05, 'fades rather than snapping in: ' + f0.mix);
        const f1 = fast(1000 + AVERAGE_FADE_MS / 2);
        assert.ok(f1.mix > 0.2 && f1.mix < 0.8, 'half-way ' + f1.mix);
        assert.equal(fast(1000 + AVERAGE_FADE_MS + 1).mix, 1);
        // Back to slow play: fades out.
        const s0 = draw(11, 3000, { playing: true, rate: 1 / 24 });
        assert.ok(s0.mix > 0.95 && s0.averaged === false, 'fades rather than snapping out: ' + s0.mix);
        assert.equal(draw(11, 3000 + AVERAGE_FADE_MS + 1, { playing: true, rate: 1 / 24 }).mix, 0);

        // Locked: still, never averaged, never busy with a running clock.
        const locked = modelOf(earth({ tidallyLocked: true }));
        const still = createDayNightLayer(fakeHost());
        const glow = fakeCtx();
        for (let i = 0; i < 5; i += 1) {
            const out = still.draw({ model: locked, sub: subsolarOn(earth({ tidallyLocked: true }), false, i * 30, 1), playing: true, rate: 7, jumped: i === 2, nowMs: i * 16 }, fakeCtx(), glow, SHEET_LAYOUT);
            assert.equal(out.still, true);
            assert.equal(out.averaged, false);
            assert.equal(out.busy, false);
            assert.equal(out.mix, 0);
        }
        assert.equal(glow.calls.arc, 0, 'no moving reticle on a locked world');

        // Reduced motion: a jump lands at once.
        const calm = createDayNightLayer(fakeHost(true));
        calm.draw({ model, sub: subsolarOn(turning, false, 10, 0.3), playing: false, rate: 1, jumped: false, nowMs: 0 }, fakeCtx(), fakeCtx(), SHEET_LAYOUT);
        const landed = calm.draw({ model, sub: goal, playing: false, rate: 1, jumped: true, nowMs: 16 }, fakeCtx(), fakeCtx(), SHEET_LAYOUT);
        assert.equal(landed.busy, false);
        assert.ok(Math.abs(lonDelta(landed.pose.lon, wrapLon((model.starportLon ?? 0) + goal.lonFromPortDeg))) < 1e-9);
    });
});

describe('symbol key and the always-on grid', () => {
    test('the key lists this world first, in the drawing table order', () => {
        const model = modelOf(earth());
        const groups = legendGroups(model);
        const present = new Set(groups.here);
        assert.deepEqual(groups.here, SURFACE_CODES.filter((code) => present.has(code)));
        assert.deepEqual(groups.absent, SURFACE_CODES.filter((code) => !present.has(code)));
        assert.ok(groups.here.length > 0 && groups.absent.length > 0);
        for (const code of [...groups.here, ...groups.absent]) assert.ok(CODE_TABLE[code].name);
    });

    test('outlines draw with the symbols off, and crowded latitude labels drop', () => {
        const model = modelOf(earth());
        const calls = { stroke: 0 };
        const ctx = {
            strokeStyle: '', lineWidth: 1,
            beginPath() {}, moveTo() {}, lineTo() {},
            stroke() { calls.stroke += 1; },
            save() {}, restore() {}, clip() {}, closePath() {},
            drawImage() { throw new Error('icons are off'); },
        };
        drawSymbols(ctx, model, SHEET_LAYOUT, { set: null, icons: false, outlineWidth: 0.8 });
        assert.equal(calls.stroke, 1);
        assert.equal(ctx.lineWidth, 0.8);
        const labels = [];
        drawMarks({
            strokeStyle: '', fillStyle: '', font: '', lineWidth: 1, textAlign: '', textBaseline: '',
            beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
            fillText(text) { labels.push(text); },
        }, model, SHEET_LAYOUT, { graticule: false, ring: false, scale: false, labelGap: 1e9 });
        assert.deepEqual(labels, ['0°']);
        const wide = [];
        drawMarks({
            strokeStyle: '', fillStyle: '', font: '', lineWidth: 1, textAlign: '', textBaseline: '',
            beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
            fillText(text) { wide.push(text); },
        }, model, SHEET_LAYOUT, { graticule: false, ring: false, scale: false, font: '18px sans-serif' });
        assert.ok(wide.includes('0°') && !wide.includes('90°N'), 'a label that does not fit is dropped: ' + wide.join(','));
    });

    test('legend blocks follow the table kinds, and the weakest row stays readable', () => {
        const blocks = legendBlocks(SURFACE_CODES);
        assert.deepEqual(blocks.map((block) => block.heading), ['Sea', 'Ice', 'Land', 'Accents', 'Features']);
        const flat = blocks.flatMap((block) => block.codes);
        assert.deepEqual(flat, [...SURFACE_CODES]);
        const weak = weakestLegendRow();
        assert.ok(weak.ratio >= 3, weak.name + ' ' + weak.ratio.toFixed(2));
    });
});

describe('large map zoom and the night tune', () => {
    test('zoom stays inside the stage and a hex reaches the readable size', () => {
        const fit = clampView({ zoom: 1, x: 40, y: -20 }, 800, 400);
        assert.deepEqual(fit, { zoom: 1, x: 0, y: 0 });
        const zoomed = zoomAbout({ zoom: 1, x: 0, y: 0 }, 800, 400, 200, 100, 2, 4);
        assert.ok(Math.abs(200 - (zoomed.x + 200 * zoomed.zoom)) < 1e-6);
        const pushed = panBy(zoomed, 800, 400, 5000, 5000);
        assert.ok(pushed.x <= 0 && pushed.x >= 800 - 800 * pushed.zoom);
        assert.equal(maxZoom(800, 1600, 264, 8), HEX_READ_PX / hexCssPx(800, 1600, 264, 8, 1));
        assert.equal(hexCssPx(800, 1600, 264, 8, maxZoom(800, 1600, 264, 8)), HEX_READ_PX);
    });

    test('the built night and the terminator are the middle step', () => {
        assert.equal(NIGHT_PEAK, NIGHT_PEAK_STEPS[1]);
        assert.ok(NIGHT_PEAK > NIGHT_PEAK_STEPS[0] && NIGHT_PEAK < NIGHT_PEAK_STEPS[2]);
        assert.equal(TERMINUS_ALPHA, TERMINUS_ALPHA_STEPS[1]);
        assert.ok(shadowAlpha(-90, false) > 0.7 && shadowAlpha(-90, false) < 0.74);
        const model = modelOf(earth());
        const lines = terminusSegments(model.grid, SHEET_LAYOUT, sunVector(0, 0));
        assert.ok(lines.length > 10);
        for (const line of lines) assert.ok(line.every((n) => Number.isFinite(n)));
    });
});
