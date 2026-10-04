/**
 * The enhanced surface map (apps/web/src/surface/enhanced/map.ts): the vanilla continents
 * with seas and sea ice from enhanced/seas.ts (questions_for_johnny.md E10). The sea covers
 * the share of the sphere the body says, in its substance's colour from surface/profile.ts;
 * ice is on the sea only; the land is the vanilla palette's, with no polar whitening.
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { sheetCaption } from '../../apps/web/src/surface/caption.ts';
import { SURFACE_MESSAGE_VERSION } from '../../apps/web/src/surface/contracts.ts';
import { EXOTIC_LIQUIDS } from '../../apps/web/src/surface/enhanced/liquids.ts';
import {
    CAP_BLEND_DEG, ICE_COLOURS, SEA_SAMPLES, capShare, colourlessLiquids, createEnhancedMap, landStops,
    renderEnhancedMapPixels, rowLatitude, seaColours, seaPlan, seaRank, seaSamples, sheetPlan,
} from '../../apps/web/src/surface/enhanced/map.ts';
import { LIQUIDS } from '../../apps/web/src/surface/profile.ts';
import { attachSurfaceWorker } from '../../apps/web/src/surface/surface.worker.ts';
import {
    buildContinentSeeds, buildGrid3D, continentHeight, remapHeight, writeContinentSamples,
} from '../../apps/web/src/surface/vanilla/map_fields.ts';
import { MAP_HEIGHT, MAP_WIDTH, hashString, mulberry32, renderFlatMapPixels } from '../../apps/web/src/surface/vanilla/map.ts';
import { buildPalette } from '../../apps/web/src/surface/vanilla/map_palette.ts';
import { renderDiamond } from '../../apps/web/src/surface/vanilla/map_projection.ts';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'surface');
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const fixture = (id) => JSON.parse(fs.readFileSync(path.join(DIR, id + '.json'), 'utf8'));

/** A garden world of the vanilla fixtures: temperate, with a sea in the vanilla palette. */
const WET = fixture('class-wet').input;

function inputs(sea, world = WET.worldData, seed = WET.hexId) {
    return {
        worldData: world,
        imageSeed: seed,
        masterSeed: 'TravellerMagnus',
        continentalDefinition: 0.55,
        coastlineComplexity: 0.45,
        printMode: false,
        sea,
    };
}

const NONE = { kind: 'none' };
const sea = (coverage, liquid, ice = NONE) => ({ coverage, liquid, ice });

/** Each sheet is painted once. */
const painted = new Map();
function sheet(name, make) {
    if (!painted.has(name)) painted.set(name, renderEnhancedMapPixels(make()));
    return painted.get(name);
}
const OPEN = () => sheet('open', () => inputs(sea(0.35, 'Water')));
const FROZEN = () => sheet('frozen', () => inputs(sea(0.35, 'Water', { kind: 'all' })));
const DRY = () => sheet('dry', () => inputs(sea(0, 'Water')));

const at = (pixels, i) => [pixels[i], pixels[i + 1], pixels[i + 2], pixels[i + 3]];
const sameAt = (a, b, i) => a[i] === b[i] && a[i + 1] === b[i + 1] && a[i + 2] === b[i + 2] && a[i + 3] === b[i + 3];

/** True when a colour lies on the line from the frozen sea's deeps to its shallows, to the rounding. */
function isIce(r, g, b) {
    const { deep, shallow } = ICE_COLOURS;
    const t = (r - deep[0]) / (shallow[0] - deep[0]);
    if (t < -0.03 || t > 1.03) return false;
    return Math.abs(deep[1] + (shallow[1] - deep[1]) * t - g) <= 1.5 && Math.abs(deep[2] + (shallow[2] - deep[2]) * t - b) <= 1.5;
}

test('sea colours come from profile.ts, and from nowhere else', () => {
    assert.deepEqual(seaColours('Ethane'), { shallow: LIQUIDS['Ethane'].shallow, deep: LIQUIDS['Ethane'].deep });
    assert.deepEqual(seaColours('Water'), { shallow: [52, 142, 164], deep: [10, 34, 86] });
    assert.deepEqual(ICE_COLOURS, { shallow: LIQUIDS['Ice'].shallow, deep: LIQUIDS['Ice'].deep });
    // A name outside the rules table has no sea colour, even where profile.ts has a fallback for it.
    assert.equal(seaColours('Unknown Exotic Liquid'), null);
    assert.equal(seaColours('Ice'), null);
    assert.equal(seaColours(''), null);
    // Every liquid of the table either has profile.ts's colours or is on the list of those without.
    const without = colourlessLiquids();
    for (const liquid of EXOTIC_LIQUIDS) {
        const colours = seaColours(liquid.name);
        if (colours) assert.deepEqual(colours, { shallow: LIQUIDS[liquid.name].shallow, deep: LIQUIDS[liquid.name].deep }, liquid.name);
        else assert.ok(without.includes(liquid.name), liquid.name);
    }
    // Reported to Johnny, 2026-10-04: three liquids of the rules table have no colour in
    // profile.ts. Their seas are not drawn until a colour is supplied. This pins the list.
    assert.deepEqual(without, ['Fluorine', 'Hydrofluoric Acid', 'Hydrochloric Acid']);
});

test('the sea covers the share of the sphere the body says, within one sample step', () => {
    const n = SEA_SAMPLES;
    const grid = buildGrid3D(mulberry32(hashString('TravellerMagnus-' + WET.hexId + '-ph')));
    const seeds = buildContinentSeeds(mulberry32(hashString('TravellerMagnus-' + WET.hexId + '-cn')));
    const samples = new Float32Array(n);
    writeContinentSamples(samples, 0, n, grid, seeds, n, 0.55, 0.45);
    const sorted = Float32Array.from(samples).sort();
    // A second, finer equal-area set of points the level was not measured on.
    const fine = 20000;
    const golden = Math.PI * (Math.sqrt(5) - 1);
    const ranks = new Float32Array(fine);
    for (let i = 0; i < fine; i++) {
        const y = 1 - (2 * (i + 0.5)) / fine;
        const s = Math.sqrt(1 - y * y);
        const phi = golden * i + 0.37;
        ranks[i] = remapHeight(continentHeight(grid, seeds, s * Math.cos(phi), y, s * Math.sin(phi), 0.55, 0.45), sorted);
    }
    for (const cover of [0, 0.03, 0.35, 0.6, 1]) {
        const k = seaSamples(cover, n);
        const rank = seaRank(k, n);
        let under = 0;
        for (let i = 0; i < n; i++) if (rank > 0 && remapHeight(samples[i], sorted) <= rank) under += 1;
        assert.equal(under, k, 'cover ' + cover);
        assert.ok(Math.abs(under / n - cover) <= 1 / n, 'cover ' + cover + ' gave ' + under / n);
        let fineUnder = 0;
        for (let i = 0; i < fine; i++) if (rank > 0 && ranks[i] <= rank) fineUnder += 1;
        assert.ok(Math.abs(fineUnder / fine - cover) < 0.02, 'cover ' + cover + ' on other points gave ' + fineUnder / fine);
        // The painter plans the same count.
        assert.equal(sheetPlan(sea(cover, 'Water'), WET.worldData, 0.5).seaCount, k);
    }
    // No minimum sea: vanilla floors its sea at 5%, this does not.
    assert.equal(seaSamples(0, n), 0);
    assert.equal(seaSamples(null, n), 0);
    assert.equal(seaRank(0, n), 0);
    assert.equal(seaSamples(0.03, n), Math.round(0.03 * n));
    assert.equal(seaSamples(1, n), n);
});

test('a row of the sheet is the latitude the vanilla projection gives it', () => {
    // The vanilla painter whitens by latitude; a palette of black with a white pole makes it say each row's.
    const probe = {
        ...buildPalette(WET.worldData, 0.5),
        stops: [{ t: 0, c: [0, 0, 0] }, { t: 1, c: [0, 0, 0] }],
        polarColor: [255, 255, 255], polarAngle: Math.PI / 2, polarFade: Math.PI / 2,
    };
    const data = new Uint8ClampedArray(MAP_WIDTH * MAP_HEIGHT * 4);
    const grid = buildGrid3D(mulberry32(1));
    const seeds = buildContinentSeeds(mulberry32(2));
    renderDiamond({ data, width: MAP_WIDTH, height: MAP_HEIGHT }, grid, seeds, new Float32Array([0, 1]), probe, 0.55, 0.45);
    for (let py = 0; py < MAP_HEIGHT; py++) {
        let found = -1;
        for (let px = 0; px < MAP_WIDTH && found < 0; px++) if (data[(py * MAP_WIDTH + px) * 4 + 3] === 255) found = px;
        if (found < 0) continue;
        const lat = rowLatitude(py);
        const said = data[(py * MAP_WIDTH + found) * 4];
        assert.equal(said, Math.trunc(255 * Math.min(1, Math.abs(lat) / (Math.PI / 2))), 'row ' + py);
        assert.equal(lat > 0, py < MAP_HEIGHT / 2, 'row ' + py + ' is in the right hemisphere');
    }
    assert.equal(rowLatitude(0), Math.PI / 2);
});

test('the land is the vanilla palette’s for the class, with no polar whitening', () => {
    // A wet class: the vanilla stops from the coast up, at their own spacing.
    const wet = landStops(WET.worldData, 0.5);
    assert.deepEqual(wet.map((stop) => stop.c), buildPalette(WET.worldData, 0.5).stops.slice(4).map((stop) => stop.c));
    assert.deepEqual(wet.map((stop) => Number(stop.u.toFixed(6))), [0, 0.06, 0.28, 0.52, 0.7, 0.84, 1]);
    // A dry class: every vanilla stop, as it stands.
    const dryWorld = fixture('hydro-0').input.worldData;
    assert.deepEqual(landStops(dryWorld, 0.5), buildPalette(dryWorld, 0.5).stops.map((stop) => ({ u: stop.t, c: stop.c })));
    // An exotic wet class keeps the land of the variant vanilla picked, from its shore up.
    const exotic = fixture('exotic-A').input.worldData;
    assert.deepEqual(landStops(exotic, 0.3).map((stop) => stop.c), buildPalette(exotic, 0.3).stops.slice(3).map((stop) => stop.c));

    // The temperature band moves vanilla's white poles. It moves nothing on the enhanced sheet.
    const cold = { ...WET.worldData, temperature: 'Cold' };
    const hot = { ...WET.worldData, temperature: 'Hot' };
    const vanilla = (world) => renderFlatMapPixels({ ...inputs(sea(0.35, 'Water'), world) });
    assert.notEqual(sha256(vanilla(cold)), sha256(vanilla(hot)));
    assert.equal(
        sha256(renderEnhancedMapPixels(inputs(sea(0.35, 'Water'), cold))),
        sha256(renderEnhancedMapPixels(inputs(sea(0.35, 'Water'), hot))),
    );
    // And the top row of the sheet, at the pole, is not vanilla's polar white.
    const open = OPEN();
    const pole = buildPalette(WET.worldData, 0.5).polarColor;
    for (let px = 0; px < MAP_WIDTH; px++) {
        const i = px * 4;
        if (open[i + 3] === 255) assert.notDeepEqual([open[i], open[i + 1], open[i + 2]], pole);
    }
});

test('no ice when seaIce is none; every sea pixel is ice when it is all', () => {
    const open = OPEN();
    const frozen = FROZEN();
    assert.equal(open.length, MAP_WIDTH * MAP_HEIGHT * 4);
    let inside = 0;
    let seaPixels = 0;
    for (let i = 0; i < open.length; i += 4) {
        assert.equal(open[i + 3], frozen[i + 3]);
        if (open[i + 3] === 0) continue;
        inside += 1;
        // 'none': nothing on the sheet is ice, sea or land.
        assert.equal(isIce(open[i], open[i + 1], open[i + 2]), false, 'ice at ' + i / 4 + ' ' + at(open, i));
        if (sameAt(open, frozen, i)) continue;
        // Where the two sheets differ is the sea, and all of it is ice on the frozen one.
        seaPixels += 1;
        assert.equal(isIce(frozen[i], frozen[i + 1], frozen[i + 2]), true, 'not ice at ' + i / 4 + ' ' + at(frozen, i));
    }
    // The land is the same on both, so no land pixel is ice on the frozen sheet either.
    for (let i = 0; i < open.length; i += 4) {
        if (open[i + 3] === 255 && sameAt(open, frozen, i)) assert.equal(isIce(frozen[i], frozen[i + 1], frozen[i + 2]), false);
    }
    const share = seaPixels / inside;
    assert.ok(share > 0.25 && share < 0.45, 'sea share of the sheet ' + share);
    // 'locked' is drawn as 'none' until its own design exists.
    assert.equal(sha256(renderEnhancedMapPixels(inputs(sea(0.35, 'Water', { kind: 'locked' })))), sha256(open));
});

test('a cap freezes the sea poleward of its latitude, over a narrow blend', () => {
    const from = 50;
    const open = OPEN();
    const frozen = FROZEN();
    const capped = renderEnhancedMapPixels(inputs(sea(0.35, 'Water', { kind: 'caps', fromLatDeg: from })));
    const rows = { open: 0, frozen: 0, edge: 0 };
    for (let py = 0; py < MAP_HEIGHT; py++) {
        const lat = Math.abs(rowLatitude(py)) * 180 / Math.PI;
        const row = (pixels) => pixels.subarray(py * MAP_WIDTH * 4, (py + 1) * MAP_WIDTH * 4);
        if (lat <= from - CAP_BLEND_DEG / 2) {
            assert.deepEqual(row(capped), row(open), 'row ' + py + ' at ' + lat + '° is open sea');
            rows.open += 1;
        } else if (lat >= from + CAP_BLEND_DEG / 2) {
            assert.deepEqual(row(capped), row(frozen), 'row ' + py + ' at ' + lat + '° is frozen');
            rows.frozen += 1;
        } else {
            // In the blend the land is untouched and the sea lies between the two.
            for (let px = 0; px < MAP_WIDTH; px++) {
                const i = (py * MAP_WIDTH + px) * 4;
                if (open[i + 3] === 0) continue;
                if (sameAt(open, frozen, i)) {
                    assert.deepEqual(at(capped, i), at(open, i));
                    continue;
                }
                for (let k = 0; k < 3; k++) {
                    const lo = Math.min(open[i + k], frozen[i + k]) - 1;
                    const hi = Math.max(open[i + k], frozen[i + k]) + 1;
                    assert.ok(capped[i + k] >= lo && capped[i + k] <= hi, 'row ' + py + ' channel ' + k);
                }
            }
            rows.edge += 1;
        }
    }
    assert.ok(rows.open > 150 && rows.frozen > 100 && rows.edge >= 4 && rows.edge <= 40, JSON.stringify(rows));
    // The blend itself: open below, half at the edge, ice above.
    const rad = (deg) => deg * Math.PI / 180;
    assert.equal(capShare(rad(from - CAP_BLEND_DEG / 2), from), 0);
    assert.equal(capShare(rad(-(from + CAP_BLEND_DEG / 2)), from), 1);
    assert.ok(Math.abs(capShare(rad(from), from) - 0.5) < 1e-9);
});

test('no cover, no liquid or no colour for it: the basin is dry lowland', () => {
    const dry = DRY();
    // Coverage 0 or null: no sea at all, not vanilla's 5% floor.
    assert.equal(sha256(renderEnhancedMapPixels(inputs(sea(null, 'Water')))), sha256(dry));
    // An unknown or absent liquid, and one profile.ts has no colour for, are not drawn.
    assert.equal(sha256(renderEnhancedMapPixels(inputs(sea(0.35, null)))), sha256(dry));
    assert.equal(sha256(renderEnhancedMapPixels(inputs(sea(0.35, 'Fluorine', { kind: 'all' })))), sha256(dry));
    // The dry sheet has no sea colour and no ice anywhere.
    const water = seaColours('Water');
    for (let i = 0; i < dry.length; i += 4) {
        if (dry[i + 3] === 0) continue;
        assert.equal(isIce(dry[i], dry[i + 1], dry[i + 2]), false);
        assert.notDeepEqual([dry[i], dry[i + 1], dry[i + 2]], water.deep);
    }
    assert.notEqual(sha256(dry), sha256(OPEN()));
    // A substance's own colour reaches the sheet: an ethane sea is not a water sea.
    const ethane = renderEnhancedMapPixels(inputs(sea(0.35, 'Ethane')));
    assert.notEqual(sha256(ethane), sha256(OPEN()));
    const deepest = seaColours('Ethane').deep;
    const shallowest = seaColours('Ethane').shallow;
    let seen = false;
    for (let i = 0; i < ethane.length && !seen; i += 4) {
        seen = ethane[i + 3] === 255 && ethane[i] >= deepest[0] && ethane[i] <= shallowest[0]
            && ethane[i + 1] >= deepest[1] && ethane[i + 1] <= shallowest[1] && ethane[i + 2] >= deepest[2] && ethane[i + 2] <= shallowest[2];
    }
    assert.equal(seen, true);
});

test('the same inputs give the same sheet: at once, in steps, and in the worker', () => {
    const given = inputs(sea(0.35, 'Water', { kind: 'caps', fromLatDeg: 62 }));
    Object.freeze(given.sea);
    Object.freeze(given);
    const first = renderEnhancedMapPixels(given);
    assert.equal(sha256(renderEnhancedMapPixels(given)), sha256(first));
    // In steps, as the page paints it without a worker: a clock that jumps makes every step yield.
    let clock = 0;
    const stepped = createEnhancedMap(given, () => { clock += 20; return clock; }, 50);
    let guard = 0;
    while (!stepped.step() && guard < 100000) guard += 1;
    assert.ok(stepped.tasks > 100);
    assert.equal(sha256(stepped.pixels), sha256(first));
    // In the worker: an enhanced request is painted by the enhanced painter, a vanilla one by the vanilla.
    const replies = [];
    const tasks = [];
    let listener = null;
    attachSurfaceWorker({
        postMessage(data) { replies.push(data); },
        addEventListener(_type, fn) { listener = fn; },
    }, { schedule: (fn) => { tasks.push(fn); } });
    const { sea: _sea, ...vanillaInputs } = given;
    listener({ data: { version: SURFACE_MESSAGE_VERSION, op: 'map', requestId: 'e', generation: 1, mode: 'enhanced', inputs: vanillaInputs, enhanced: given } });
    while (tasks.length) tasks.shift()();
    listener({ data: { version: SURFACE_MESSAGE_VERSION, op: 'map', requestId: 'v', generation: 2, mode: 'vanilla', inputs: vanillaInputs } });
    while (tasks.length) tasks.shift()();
    // A vanilla request that carries enhanced inputs by mistake is still the vanilla sheet.
    listener({ data: { version: SURFACE_MESSAGE_VERSION, op: 'map', requestId: 'v2', generation: 3, mode: 'vanilla', inputs: vanillaInputs, enhanced: given } });
    while (tasks.length) tasks.shift()();
    const reply = (id) => replies.find((item) => item.op === 'map' && item.requestId === id);
    assert.equal(sha256(reply('e').pixels), sha256(first));
    assert.equal(reply('e').mode, 'enhanced');
    assert.equal(sha256(reply('v').pixels), sha256(renderFlatMapPixels(vanillaInputs)));
    assert.equal(sha256(reply('v2').pixels), sha256(reply('v').pixels));
    assert.notEqual(sha256(reply('v').pixels), sha256(first));
});

test('the sea of a body is decided by seas.ts, and the caption says what was drawn', () => {
    // Regina's mainworld as released: an ethane sea, liquid at every latitude.
    const regina = {
        type: 'Mainworld', name: 'Regina', uwp: 'A788899-C', isMoon: true, tidallyLocked: true, liquidType: 'Ethane', hydroPercent: 60,
        hydroCode: 6, meanTempK: 189.60630776703493, lowTempK: 147.43623604258838, highTempK: 214.384010187577,
    };
    const plan = seaPlan(regina);
    assert.deepEqual(plan.sea, { coverage: 0.6, liquid: 'Ethane', ice: { kind: 'none' } });
    assert.equal(plan.drawn, true);
    assert.match(plan.why, /lowTempK 147\.4\d+ >= meltingK 90 \(Ethane\)/);
    const caption = sheetCaption('enhanced', regina);
    assert.equal(caption.text, 'Enhanced · Ethane');
    assert.match(caption.title, /^Sea: 60% cover of Ethane\. Sea ice: none \(lowTempK/);
    assert.deepEqual(sheetCaption('vanilla', regina), { text: 'Vanilla', title: 'The surface as the original painter draws it.' });

    // Frozen water, a cap, a liquid outside the table, one without a colour, and no sea.
    const water = { liquidType: 'Water', hydroPercent: 100, meanTempK: 102, lowTempK: 98, highTempK: 107 };
    assert.equal(seaPlan(water).sea.ice.kind, 'all');
    assert.equal(sheetCaption('enhanced', water).text, 'Enhanced · Water, frozen');
    const capped = seaPlan({ liquidType: 'Water', hydroPercent: 50, meanTempK: 280, lowTempK: 250, highTempK: 300 });
    assert.equal(capped.sea.ice.kind, 'caps');
    assert.ok(capped.sea.ice.fromLatDeg > 0 && capped.sea.ice.fromLatDeg < 90);
    assert.match(sheetCaption('enhanced', { liquidType: 'Water', hydroPercent: 50, meanTempK: 280, lowTempK: 250, highTempK: 300 }).text, /^Enhanced · Water, ice from \d+°$/);
    const unknown = { liquidType: 'Unknown Exotic Liquid', hydroPercent: 26, meanTempK: 208, lowTempK: 174, highTempK: 265 };
    assert.deepEqual(seaPlan(unknown).sea, { coverage: 0.26, liquid: null, ice: { kind: 'none' } });
    assert.equal(seaPlan(unknown).drawn, false);
    assert.equal(sheetCaption('enhanced', unknown).text, 'Enhanced · Unknown Exotic Liquid, not drawn');
    const fluorine = { liquidType: 'Fluorine', hydroPercent: 40, meanTempK: 70, lowTempK: 60, highTempK: 80 };
    assert.equal(seaPlan(fluorine).sea.liquid, 'Fluorine');
    assert.equal(seaPlan(fluorine).drawn, false);
    assert.equal(sheetCaption('enhanced', fluorine).text, 'Enhanced · Fluorine, not drawn');
    assert.equal(sheetCaption('enhanced', { liquidType: 'Ice', hydroPercent: 0 }).text, 'Enhanced · no seas');
    assert.equal(sheetCaption('enhanced', null).text, 'Enhanced · no seas');
});
