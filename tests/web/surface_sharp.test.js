// Sharp window over the baked surface sheet: the cap, the layout, the memory cap.
import assert from 'node:assert/strict';
import test from 'node:test';
import { LARGE_SHEET } from '../../apps/web/src/surface/hybrid/field.ts';
import { HEX_READ_PX, hexCssPx, hexGridCss, maxZoom } from '../../apps/web/src/surface/hybrid/view.ts';
import { devicePerBake, panStrips, sharpFrame, SHARP_PIXEL_CAP } from '../../apps/web/src/surface/sharp.ts';
import { buildCDF, buildContinentSeeds, buildGrid3D } from '../../apps/web/src/surface/vanilla/map_fields.ts';
import { hashString, mulberry32, MAP_HEIGHT, MAP_WIDTH, renderFlatMapPixels } from '../../apps/web/src/surface/vanilla/map.ts';
import { buildPalette } from '../../apps/web/src/surface/vanilla/map_palette.ts';
import { paintDiamondPoint } from '../../apps/web/src/surface/vanilla/map_projection.ts';

test('the zoom cap is one hex at 320 CSS px', () => {
    assert.equal(HEX_READ_PX, 320);
    const fit = hexCssPx(800, 1600, 264, 8, 1);
    assert.equal(hexCssPx(800, 1600, 264, 8, maxZoom(800, 1600, 264, 8)), 320);
    assert.ok(Math.abs(maxZoom(800, 1600, 264, 8) / (48 / fit) - 320 / 48) < 1e-9);
    assert.equal(hexGridCss(48), 1);
    assert.equal(hexGridCss(320), 2);
    assert.equal(hexGridCss(184), 1.5);
});

test('the sharp window is one device pixel per stage pixel and stays under four times that', () => {
    assert.equal(sharpFrame(LARGE_SHEET, { zoom: 1, x: 0, y: 0 }, 800, 400, 1), null);
    assert.equal(devicePerBake(800, 1600, 1, 1), 0.5);
    const frame = sharpFrame(LARGE_SHEET, { zoom: 1, x: 0, y: 0 }, 1600, 800, 2);
    assert.ok(frame);
    assert.equal(frame.width, 3200);
    assert.equal(frame.height, 1600);
    assert.equal(frame.pixels, 3200 * 1600);
    assert.equal(frame.cap, SHARP_PIXEL_CAP * frame.pixels);
    assert.ok(frame.pixels <= frame.cap);
    assert.equal(frame.pixels * 4, 20480000);
});

test('a sharp pixel is the same net point as the bake pixel under it', () => {
    const frame = sharpFrame(LARGE_SHEET, { zoom: 4, x: -40, y: 12 }, 800, 400, 1);
    assert.ok(frame);
    const i = 10;
    const j = 25;
    const s = frame.bakeX + (i + 0.5) * (frame.bakeW / frame.width);
    const t = frame.bakeY + (j + 0.5) * (frame.bakeH / frame.height);
    const nx = (i + 0.5 - frame.layout.ox) / frame.layout.side;
    const ny = (j + 0.5 - frame.layout.oy) / frame.layout.side;
    assert.ok(Math.abs(nx - (s - LARGE_SHEET.ox) / LARGE_SHEET.side) < 1e-9);
    assert.ok(Math.abs(ny - (t - LARGE_SHEET.oy) / LARGE_SHEET.side) < 1e-9);
});

test('a pan uncovers the new edge and leaves the overlap', () => {
    assert.deepEqual(panStrips(10, 8, 2, 0), [[0, 0, 2, 8]]);
    assert.deepEqual(panStrips(10, 8, -3, 0), [[7, 0, 10, 8]]);
    assert.deepEqual(panStrips(10, 8, 2, -3), [[0, 0, 2, 8], [2, 5, 10, 8]]);
    assert.deepEqual(panStrips(10, 8, 0, 0), []);
});

test('an integer diamond sample matches the baked sheet', () => {
    const inputs = {
        worldData: { name: 'Probe', size: 8, atmosphere: 5, hydrographics: 5, temperature: 'Temperate', temperatureK: 288 },
        imageSeed: 'probe',
        masterSeed: 'TravellerMagnus',
        continentalDefinition: 0.55,
        coastlineComplexity: 0.45,
        printMode: false,
    };
    const sheet = renderFlatMapPixels(inputs);
    const mask = 0.55;
    const warp = 0.45;
    const grid = buildGrid3D(mulberry32(hashString(inputs.masterSeed + '-' + inputs.imageSeed + '-ph')));
    const seeds = buildContinentSeeds(mulberry32(hashString(inputs.masterSeed + '-' + inputs.imageSeed + '-cn')));
    const cdf = buildCDF(grid, seeds, 2048, mask, warp);
    const palette = buildPalette(inputs.worldData, mulberry32(hashString(inputs.masterSeed + '-' + inputs.imageSeed + '-oc'))());
    const cap = hashString(inputs.masterSeed + '-' + inputs.imageSeed + '-cap');
    for (const [px, py] of [[0, 0], [400, 200], [100, 40], [700, 350]]) {
        const got = new Uint8ClampedArray(4);
        paintDiamondPoint(got, 0, px, py, MAP_WIDTH, MAP_HEIGHT, grid, seeds, cdf, palette, mask, warp, cap);
        const index = (py * MAP_WIDTH + px) * 4;
        assert.deepEqual([...got], [sheet[index], sheet[index + 1], sheet[index + 2], sheet[index + 3]], px + ',' + py);
    }
});
