// Software orbit discs for a browser without WebGL (apps/web/src/surface/soft).
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { SHEET_LAYOUT, fieldOf } from '../../apps/web/src/surface/hybrid/field.ts';
import { hybridWorld } from '../../apps/web/src/surface/hybrid/inputs.ts';
import { buildHybridModel, LOCKED_NIGHT_CENTRED_LON } from '../../apps/web/src/surface/hybrid/model.ts';
import { paintHybrid } from '../../apps/web/src/surface/hybrid/paint.ts';
import { CONTINENTAL_DEFINITION, COASTLINE_COMPLEXITY, VANILLA_MASTER_SEED, diamondMapSpec } from '../../apps/web/src/surface/identity.ts';
import { surfaceProfile } from '../../apps/web/src/surface/profile.ts';
import { renderFlatMapPixels, MAP_HEIGHT, MAP_WIDTH } from '../../apps/web/src/surface/vanilla/map.ts';
import { diamondLatLon } from '../../apps/web/src/surface/vanilla/map_projection.ts';
import { discShadeRequest } from '../../apps/web/src/surface/disc_shade.ts';
import { hybridSheetFor, netPixel, readSheet, startGlobe, texelLat, texelLon, vanillaFields, vanillaPoint } from '../../apps/web/src/surface/soft/globe.ts';
import { discGeometry, globeRowSums, paintSoftDisc, softTileSide } from '../../apps/web/src/surface/soft/disc_paint.ts';
import { attachSoftDiscWorker, rowsFor } from '../../apps/web/src/surface/soft/disc.worker.ts';
import { globeRecipe, softDisc } from '../../apps/web/src/surface/soft/link.ts';
import { SOFT_DISC_VERSION, SOFT_MAX_RADIUS } from '../../apps/web/src/surface/soft/messages.ts';
import { SURFACE_WEBGL_NOTICE, SURFACE_WEBGL_NOTICE_SHORT, configureWebglProbe, onWebglState, webglMissing, webglState } from '../../apps/web/src/surface/webgl_notice.ts';

const WET = {
    type: 'Planet', name: 'Softwater', size: 7, atmCode: 6, hydroCode: 6, hydroPercent: 60, popCode: 0,
    starport: 'C', uwp: 'C766000-7', meanTempK: 288, lowTempK: 250, highTempK: 310,
    liquidType: 'Water', diamKm: 11200, axialTilt: 20,
};
const HEX = '0101-soft';

function vanillaInputs(body, hexKey = HEX) {
    const spec = diamondMapSpec(body, hexKey);
    assert.ok(spec);
    return {
        worldData: spec.worldData, imageSeed: spec.seed, masterSeed: VANILLA_MASTER_SEED,
        continentalDefinition: CONTINENTAL_DEFINITION, coastlineComplexity: COASTLINE_COMPLEXITY, printMode: false,
    };
}

function finish(build) {
    while (!build.step()) { /* to the end */ }
    return build.globe;
}

function spec(over = {}) {
    return {
        key: 'w', radiusPx: 40, spin: 0, sweep: 0, tiltDeg: 0, axisAzimuth: 0, lonOffset: 0,
        light: [1, 0], sun: [1, 1, 1], casters: [], lightMode: false, air: 0.85, gas: false, ring: null, ...over,
    };
}

/** A globe whose colour is its longitude in red and its latitude in green, for geometry checks. */
function coordinateGlobe(rows) {
    const W = rows * 2;
    const pixels = new Uint8ClampedArray(W * rows * 4);
    for (let i = 0; i < rows; i += 1) {
        for (let j = 0; j < W; j += 1) {
            const k = (i * W + j) * 4;
            pixels[k] = Math.round((j / (W - 1)) * 255);
            pixels[k + 1] = Math.round((i / (rows - 1)) * 255);
            pixels[k + 2] = 128;
            pixels[k + 3] = 255;
        }
    }
    return { width: W, height: rows, pixels };
}

function pixelAt(tile, x, y) {
    const k = (y * tile.side + x) * 4;
    return [tile.pixels[k], tile.pixels[k + 1], tile.pixels[k + 2], tile.pixels[k + 3]];
}

describe('globes match the dossier sheets', () => {
    test('vanilla: at every sampled sheet pixel the globe function paints the same colour', () => {
        const inputs = vanillaInputs(WET);
        const sheet = renderFlatMapPixels(inputs);
        const fields = vanillaFields(inputs);
        const out = new Uint8ClampedArray(4);
        let checked = 0;
        for (let py = 0; py < MAP_HEIGHT; py += 3) {
            for (let px = 0; px < MAP_WIDTH; px += 3) {
                const at = diamondLatLon(px, py, MAP_WIDTH, MAP_HEIGHT);
                const k = (py * MAP_WIDTH + px) * 4;
                if (!at || sheet[k + 3] === 0) continue;
                vanillaPoint(fields, at.lat, at.lon, out, 0);
                assert.deepEqual([...out], [sheet[k], sheet[k + 1], sheet[k + 2], 255], `pixel ${px},${py}`);
                checked += 1;
            }
        }
        assert.ok(checked > 8000, 'checked ' + checked);
    });

    test('vanilla: the globe is painted in steps under the budget and agrees with the point function', () => {
        const inputs = vanillaInputs(WET);
        let t = 0;
        // Every read of this clock is one unit, so a 5-unit budget stops a step after a few rows.
        const build = startGlobe({ kind: 'vanilla', inputs }, 64, () => t++, 5);
        let steps = 1;
        while (!build.step()) steps += 1;
        assert.ok(steps > 8, 'steps ' + steps);
        const fields = vanillaFields(inputs);
        const g = build.globe;
        assert.equal(g.width, 128);
        assert.equal(g.height, 64);
        const out = new Uint8ClampedArray(4);
        for (const [i, j] of [[0, 0], [10, 77], [32, 64], [63, 127]]) {
            vanillaPoint(fields, texelLat(i, 64), texelLon(j, 128), out, 0);
            const k = (i * 128 + j) * 4;
            assert.deepEqual([...g.pixels.subarray(k, k + 4)], [...out]);
        }
    });

    test('hybrid: the net lookup lands every sheet pixel back on itself', () => {
        const field = fieldOf(SHEET_LAYOUT, 4);
        let checked = 0;
        for (let k = 0; k < field.face.length; k += 97) {
            if (field.face[k] < 0) continue;
            const x = k % SHEET_LAYOUT.width;
            const y = Math.floor(k / SHEET_LAYOUT.width);
            const p = [field.P[k * 3], field.P[k * 3 + 1], field.P[k * 3 + 2]];
            const [sx, sy] = netPixel(SHEET_LAYOUT, p);
            const back = Math.floor(sy) * SHEET_LAYOUT.width + Math.floor(sx);
            if (back === k) {
                checked += 1;
                continue;
            }
            // On a seam the same point may sit on the neighbouring face's copy: same place on the sphere.
            const q = [field.P[back * 3], field.P[back * 3 + 1], field.P[back * 3 + 2]];
            assert.ok(field.face[back] >= 0, `seam pixel ${x},${y} lands on the net`);
            assert.ok(Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) < 0.02, `pixel ${x},${y}`);
            checked += 1;
        }
        assert.ok(checked > 1000);
    });

    test('hybrid: from 256 rows the globe reads the dossier sheet itself', () => {
        assert.equal(hybridSheetFor(256), SHEET_LAYOUT);
        assert.equal(hybridSheetFor(512), SHEET_LAYOUT);
        assert.ok(hybridSheetFor(64).side < SHEET_LAYOUT.side);
    });

    test('hybrid: a globe texel is the sheet colour at its place on the net', () => {
        const world = hybridWorld(HEX, 'w0', WET);
        const layout = hybridSheetFor(64);
        const sheet = paintHybrid(buildHybridModel(world), layout);
        const globe = finish(startGlobe({ kind: 'hybrid', world }, 64, () => 0, Number.POSITIVE_INFINITY));
        const out = new Uint8ClampedArray(4);
        for (const [i, j] of [[5, 3], [20, 40], [32, 64], [50, 100], [60, 127]]) {
            const lat = texelLat(i, 64);
            const lon = texelLon(j, 128);
            const [sx, sy] = netPixel(layout, [Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon)]);
            readSheet(sheet, layout, sx, sy, out, 0);
            const k = (i * 128 + j) * 4;
            assert.deepEqual([...globe.pixels.subarray(k, k + 4)], [...out]);
        }
    });

    test('gas: bands by latitude only, in the profile colours', () => {
        const gas = { zone: [242, 230, 204], belt: [174, 106, 64], pole: [112, 102, 108], bands: 10 };
        const globe = finish(startGlobe({ kind: 'gas', gas, offsets: [1, 2, 3] }, 64, () => 0, 10));
        for (let i = 0; i < 64; i += 7) {
            const a = globe.pixels.subarray(i * 128 * 4, i * 128 * 4 + 4);
            const b = globe.pixels.subarray((i * 128 + 90) * 4, (i * 128 + 90) * 4 + 4);
            assert.deepEqual([...a], [...b]);
        }
        const red = new Set();
        for (let i = 0; i < 64; i += 1) red.add(globe.pixels[i * 128 * 4]);
        assert.ok(red.size > 8, 'bands vary with latitude');
    });
});

describe('the disc geometry is the WebGL disc\'s', () => {
    test('upright: the north pole is the centre and longitude runs counter-clockwise on screen', () => {
        const globe = coordinateGlobe(256);
        const geo = discGeometry(60, 0, 0, null);
        const tile = paintSoftDisc(globe, spec({ radiusPx: 60, lightMode: true, air: 0, light: [0, 0] }), geo, null);
        const c = Math.floor(tile.side / 2);
        // Green is latitude from the north: near zero at the centre, near half at the limb.
        assert.ok(pixelAt(tile, c, c)[1] < 0.05 * 255 * 0.6);
        // Red is longitude. With spin 0, screen right (+x) is longitude 0 (red about half).
        const right = pixelAt(tile, c + 50, c);
        const up = pixelAt(tile, c, c - 50);
        const left = pixelAt(tile, c - 50, c);
        // Up the screen is 90 degrees east of right: counter-clockwise, as seen from above the north pole.
        assert.ok(up[0] > right[0] && right[0] > 0, 'east is counter-clockwise');
        assert.ok(left[0] > up[0] || left[0] < right[0], 'left is 180 degrees round');
    });

    test('spin turns the surface; a locked world shows its sheet star side toward the light', () => {
        const globe = coordinateGlobe(256);
        const geo = discGeometry(60, 0, 0, null);
        const base = paintSoftDisc(globe, spec({ radiusPx: 60, lightMode: true, light: [0, 0] }), geo, null);
        const turned = paintSoftDisc(globe, spec({ radiusPx: 60, lightMode: true, light: [0, 0], spin: 0.5 }), geo, null);
        const c = Math.floor(base.side / 2);
        assert.notDeepEqual(pixelAt(base, c + 40, c), pixelAt(turned, c + 40, c));
        // Locked: spin is the star angle (disc_batch.ts turnOf). Star straight down the screen.
        const star = Math.PI / 2;
        const offset = LOCKED_NIGHT_CENTRED_LON * Math.PI / 180;
        const locked = paintSoftDisc(globe, spec({ radiusPx: 60, lightMode: true, light: [0, 1], spin: star, lonOffset: offset }), geo, null);
        const towardStar = pixelAt(locked, c, c + 45)[0] / 255;
        const lonRead = -Math.PI + towardStar * 2 * Math.PI;
        let diff = Math.abs(lonRead - offset) % (2 * Math.PI);
        if (diff > Math.PI) diff = 2 * Math.PI - diff;
        assert.ok(diff < 0.1, 'sheet longitude toward the star ' + lonRead + ' vs ' + offset);
    });

    test('the lit side is bright and the night side near the ambient floor', () => {
        const pixels = new Uint8ClampedArray(64 * 32 * 4).fill(200);
        const globe = { width: 64, height: 32, pixels };
        const geo = discGeometry(40, 0, 0, null);
        const tile = paintSoftDisc(globe, spec({ light: [1, 0] }), geo, null);
        const c = Math.floor(tile.side / 2);
        assert.ok(pixelAt(tile, c + 30, c)[0] > 150);
        assert.ok(pixelAt(tile, c - 30, c)[0] < 12);
        assert.equal(pixelAt(tile, c, c)[3], 255);
        assert.equal(pixelAt(tile, 0, 0)[3], 0);
    });

    test('a caster eclipses the disc', () => {
        const pixels = new Uint8ClampedArray(64 * 32 * 4).fill(200);
        const globe = { width: 64, height: 32, pixels };
        const geo = discGeometry(40, 0, 0, null);
        const clear = paintSoftDisc(globe, spec(), geo, null);
        const shaded = paintSoftDisc(globe, spec({ casters: [[3, 0, 1.5]] }), geo, null);
        const c = Math.floor(clear.side / 2);
        assert.ok(pixelAt(shaded, c + 10, c)[0] < pixelAt(clear, c + 10, c)[0] * 0.3);
    });

    test('rings: in front of the planet on the near side, behind it on the far side', () => {
        const pixels = new Uint8ClampedArray(64 * 32 * 4).fill(40);
        const globe = { width: 64, height: 32, pixels };
        const ring = { inner: 1.22, outer: 2, opacity: 0.9, gaps: [0.5, 0.85], seed: 3, inside: [238, 228, 206], outside: [208, 192, 162] };
        const geo = discGeometry(30, 60, 0, ring);
        assert.equal(geo.side, softTileSide(30, 2));
        assert.ok(geo.ringCount > 0);
        const tile = paintSoftDisc(globe, spec({ radiusPx: 30, tiltDeg: 60, ring, lightMode: true }), geo, null);
        let front = 0;
        let behind = 0;
        for (let q = 0; q < geo.ringCount; q += 1) {
            const k = geo.ringIndex[q];
            // Inside the limb only: at the edge the planet is part-covering and the ring shows through.
            if (geo.depth[k] < 0.3) continue;
            const r = tile.pixels[k * 4];
            if (geo.ringP[q * 3 + 2] > geo.depth[k]) front += r > 60 ? 1 : 0;
            else behind += r > 60 ? 1 : 0;
        }
        assert.ok(front > 0, 'ring drawn over the planet in front');
        assert.equal(behind, 0, 'planet hides the ring behind it');
    });

    test('a fast spin is blurred along the latitude, not strobed', () => {
        const rows = 128;
        const W = rows * 2;
        const pixels = new Uint8ClampedArray(W * rows * 4);
        for (let k = 0; k < W * rows; k += 1) {
            const stripe = (k % W) % 8 < 4 ? 255 : 0;
            pixels.set([stripe, stripe, stripe, 255], k * 4);
        }
        const globe = { width: W, height: rows, pixels };
        const sums = globeRowSums(globe);
        const geo = discGeometry(40, 0, 0, null);
        const sharp = paintSoftDisc(globe, spec({ lightMode: true }), geo, sums);
        const blurred = paintSoftDisc(globe, spec({ lightMode: true, sweep: 1 }), geo, sums);
        const c = Math.floor(sharp.side / 2);
        const spread = (tile) => {
            const values = [];
            for (let y = c - 10; y <= c + 10; y += 1) values.push(pixelAt(tile, c + 30, y)[0]);
            return Math.max(...values) - Math.min(...values);
        };
        assert.ok(spread(sharp) > 100, 'sharp stripes ' + spread(sharp));
        assert.ok(spread(blurred) < spread(sharp) * 0.3, 'blurred ' + spread(blurred));
    });
});

describe('the worker paints tiles for the page', () => {
    function host() {
        const posted = [];
        let listener = null;
        const jobs = [];
        attachSoftDiscWorker({
            postMessage(data) { posted.push(data); },
            addEventListener(_type, fn) { listener = fn; },
        }, {
            clock: () => 0,
            schedule: (fn) => jobs.push(fn),
            toImage: async (tile) => ({ side: tile.side, pixels: tile.pixels }),
        });
        const drain = async () => {
            for (let n = 0; n < 200 && jobs.length; n += 1) jobs.shift()();
            await new Promise((resolve) => setTimeout(resolve, 0));
        };
        return { posted, send: (data) => listener({ data }), drain };
    }

    function watchOf(discs, generation = 1) {
        return { op: 'watch', discs, mode: 'vanilla', version: SOFT_DISC_VERSION, generation };
    }

    function discFor(key, radiusPx, over = {}) {
        return { ...spec({ key, radiusPx, ...over }), globe: { key: 'v|' + key, recipe: { kind: 'vanilla', inputs: vanillaInputs(WET, key) } } };
    }

    test('says it is ready, then answers a watch with one tile per disc in the WebGL tile shape', async () => {
        const h = host();
        assert.deepEqual(h.posted[0], { op: 'state', ready: true, lost: false, failed: false });
        h.send(watchOf([discFor('a', 20), discFor('b', 50)]));
        await h.drain();
        const tiles = h.posted.filter((m) => m.op === 'tiles').flatMap((m) => m.tiles);
        const keys = new Set(tiles.map((t) => t.key));
        assert.deepEqual([...keys].sort(), ['a', 'b']);
        const last = h.posted.filter((m) => m.op === 'tiles').at(-1);
        assert.equal(last.version, SOFT_DISC_VERSION);
        assert.equal(last.generation, 1);
        assert.equal(last.delivery, 'tiles');
        const b = tiles.filter((t) => t.key === 'b').at(-1);
        assert.equal(b.radiusPx, 50);
        assert.equal(b.size, softTileSide(50, null));
    });

    test('an unchanged frame paints nothing; a turned one paints again', async () => {
        const h = host();
        h.send(watchOf([discFor('a', 20)]));
        await h.drain();
        const before = h.posted.length;
        h.send(watchOf([discFor('a', 20)]));
        await h.drain();
        assert.equal(h.posted.length, before);
        h.send(watchOf([discFor('a', 20, { spin: 0.4 })]));
        await h.drain();
        assert.equal(h.posted.length, before + 1);
    });

    test('a large disc gets a sharper globe after its first one', async () => {
        const h = host();
        h.send(watchOf([discFor('big', 200)]));
        await h.drain();
        const tiles = h.posted.filter((m) => m.op === 'tiles');
        assert.ok(tiles.length >= 2, 'a first tile, then a sharper one');
        assert.equal(rowsFor(200), 512);
        assert.equal(rowsFor(SOFT_MAX_RADIUS), 512);
        assert.equal(rowsFor(10), 64);
    });
});

describe('the page side', () => {
    test('vanilla recipe is the dossier sheet\'s inputs; enhanced is its hybrid world; gas is the profile bands', () => {
        const disc = { key: 'w', hexKey: HEX, dossierKey: 'w', body: WET, radiusPx: 20 };
        const v = globeRecipe('vanilla', disc, surfaceProfile(WET, 'x'));
        assert.equal(v.recipe.kind, 'vanilla');
        assert.deepEqual(v.recipe.inputs, vanillaInputs(WET));
        const e = globeRecipe('enhanced', disc, surfaceProfile(WET, 'x'));
        assert.equal(e.recipe.kind, 'hybrid');
        assert.deepEqual(e.recipe.world, hybridWorld(HEX, 'w', WET, { continental: CONTINENTAL_DEFINITION, coastline: COASTLINE_COMPLEXITY }));
        assert.equal(e.lonOffset, 0);
        const locked = { ...WET, name: 'Locked', tidallyLocked: true };
        const l = globeRecipe('enhanced', { ...disc, body: locked }, surfaceProfile(locked, 'y'));
        assert.equal(l.lonOffset, LOCKED_NIGHT_CENTRED_LON * Math.PI / 180);
        const giant = { type: 'Gas Giant', name: 'Big', ggType: 'GL', size: 'GL', diamKm: 120000 };
        const g = globeRecipe('vanilla', { ...disc, body: giant }, surfaceProfile(giant, 'z'));
        assert.equal(g.recipe.kind, 'gas');
        const belt = { type: 'Planetoid Belt', name: 'Rocks', size: 0 };
        assert.equal(globeRecipe('vanilla', { ...disc, body: belt }, { kind: 'barren' }), null);
    });

    test('a soft disc carries the shade request\'s geometry and the profile\'s ring', () => {
        const disc = {
            key: 'w', hexKey: HEX, dossierKey: 'w', body: WET, radiusPx: 900, spin: 1, cloudSpin: 0, sweep: 0, samples: 1,
            tiltDeg: 20, light: [0.6, 0.8], sun: [1, 0.9, 0.8], ring: { inner: 1.22, outer: 1.8, fill: 0.5, phase: 0, detail: 1 },
            casters: [[2, 0, 0.3]], lightMode: false,
        };
        const shade = discShadeRequest(0, disc, 'vanilla', 1);
        const soft = softDisc('vanilla', disc, shade);
        assert.equal(soft.radiusPx, SOFT_MAX_RADIUS);
        assert.equal(soft.axisAzimuth, shade.profile.axisAzimuth);
        assert.equal(soft.tiltDeg, 20);
        assert.equal(soft.ring.opacity, shade.profile.rings.opacity * 0.5);
        assert.deepEqual(soft.casters, [[2, 0, 0.3]]);
    });

    test('the notice says what is plainer, in Google style', () => {
        assert.match(SURFACE_WEBGL_NOTICE, /^Planet surfaces are simpler because WebGL is turned off in this browser/);
        assert.match(SURFACE_WEBGL_NOTICE, /clouds, city lights, sun glint, or haze/);
        assert.match(SURFACE_WEBGL_NOTICE, /turn on hardware acceleration/);
        assert.doesNotMatch(SURFACE_WEBGL_NOTICE, /please|simply|just /i);
    });
});

describe('the WebGL probe runs off the page', () => {
    function fakeProbe() {
        const handlers = {};
        let ended = false;
        return {
            probe: {
                addEventListener(type, fn) { handlers[type] = fn; },
                terminate() { ended = true; },
            },
            answer(webgl) { handlers.message({ data: { webgl } }); },
            fail() { handlers.error(); },
            ended: () => ended,
        };
    }

    function withDocument(contexts, fn) {
        const previous = globalThis.document;
        globalThis.document = { createElement: () => ({ getContext: () => (contexts ? {} : null) }) };
        try {
            fn();
        } finally {
            if (previous === undefined) delete globalThis.document;
            else globalThis.document = previous;
            configureWebglProbe(null);
        }
    }

    test('unknown until the worker answers, then missing or ok, and the listener hears it once', () => {
        for (const [webgl, expected] of [[false, 'missing'], [true, 'ok']]) {
            withDocument(true, () => {
                const fake = fakeProbe();
                configureWebglProbe(() => fake.probe);
                const heard = [];
                const stop = onWebglState((next) => heard.push(next));
                assert.equal(webglState(), 'unknown');
                assert.equal(webglMissing(), false, 'not missing while asking');
                fake.answer(webgl);
                assert.equal(webglState(), expected);
                assert.equal(webglMissing(), expected === 'missing');
                assert.deepEqual(heard, [expected]);
                assert.ok(fake.ended(), 'the probe worker is ended');
                stop();
            });
        }
    });

    test('no OffscreenCanvas in the worker, or a worker that fails: the page answers', () => {
        withDocument(false, () => {
            const fake = fakeProbe();
            configureWebglProbe(() => fake.probe);
            webglState();
            fake.answer(null);
            assert.equal(webglState(), 'missing');
        });
        withDocument(true, () => {
            const fake = fakeProbe();
            configureWebglProbe(() => fake.probe);
            webglState();
            fake.fail();
            assert.equal(webglState(), 'ok');
        });
    });

    test('no document: ok, and no probe is started', () => {
        configureWebglProbe(() => { throw new Error('should not start'); });
        assert.equal(webglState(), 'ok');
        configureWebglProbe(null);
    });

    test('the short notice for a narrow picture is one sentence', () => {
        assert.equal(SURFACE_WEBGL_NOTICE_SHORT, 'Planet surfaces are simpler because WebGL is turned off.');
    });
});
