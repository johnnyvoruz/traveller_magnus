/**
 * CS11 (streams/C.md): the world surface as a print-quality image. The pure parts run here:
 * the projection keeps its shape on the paper and leaves a band for the key and the caption.
 * Source checks hold the shape: a canvas at the paper's device pixels, the renderer's own
 * size, no hover, and the live sheet never written. The pixels are checked in a browser
 * (findings/ui_design_shots/sc_CS11_save.mjs).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { areaWords, paperPixels, PRINT_DPR } from '../../apps/web/src/capture/paper.ts';
import { NET_HEIGHT, NET_WIDTH } from '../../apps/web/src/surface/hybrid/grid.ts';
import { SURFACE_BAND, projectionAspect, projectionFrame } from '../../apps/web/src/surface/capture.ts';
import { SHEET_LAYOUT } from '../../apps/web/src/surface/hybrid/field.ts';
import { drawSymbols, symbolOf } from '../../apps/web/src/surface/hybrid/symbols.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => fs.readFileSync(path.join(root, 'apps/web/src', rel), 'utf8');

test('a world caption carries the UWP when the body has one', () => {
    assert.equal(
        areaWords({ kind: 'world', name: 'Regina', uwp: 'A788899-C', sector: 'Spinward Marches', hex: '1910' }),
        'Regina A788899-C surface, Spinward Marches 1910',
    );
    assert.equal(
        areaWords({ kind: 'world', name: 'Regina', sector: 'Spinward Marches', hex: '1910' }),
        'Regina surface, Spinward Marches 1910',
    );
});

test('the projection keeps its aspect and leaves the key band on A4 landscape', () => {
    const px = paperPixels('A4', 'landscape');
    assert.deepEqual([px.deviceWidth, px.deviceHeight], [3508, 2480]);
    assert.equal(px.dpr, PRINT_DPR);
    const aspect = projectionAspect('enhanced');
    assert.ok(Math.abs(aspect - NET_WIDTH / NET_HEIGHT) < 1e-9);
    assert.equal(projectionAspect('vanilla'), 2);
    const frame = projectionFrame(px.width, px.height, aspect);
    assert.ok(Math.abs(frame.w / frame.h - aspect) < 1e-6);
    assert.ok(frame.x >= 0 && frame.y >= 0);
    assert.ok(frame.x + frame.w <= px.width + 0.01);
    assert.ok(frame.y + frame.h <= px.height - SURFACE_BAND + 0.01);
    assert.ok(frame.w > 100 && frame.h > 100);
});

test('the capture draws at the paper pixels through the renderer size path and leaves the live sheet alone', () => {
    const capture = read('surface/capture.ts');
    const stage = read('dossier/SurfaceStage.vue');
    const chunks = read('surface/map_chunks.ts');
    assert.match(capture, /createCanvas\(px\.deviceWidth, px\.deviceHeight\)/);
    assert.match(capture, /createHybridPaint\(/);
    assert.match(capture, /cacheField: false/);
    assert.match(capture, /createChunkedMap\(/);
    assert.match(capture, /layoutFor\(/);
    assert.match(capture, /outlines: false/);
    assert.match(capture, /outlines: true/);
    assert.match(capture, /icons: true/);
    assert.match(capture, /ink: ink\.text/);
    assert.match(capture, /outlineInk: ink\.grid/);
    assert.match(capture, /iconRadius: cell \* 0\.4/);
    assert.match(capture, /plain: false/);
    assert.match(capture, /ink\.wash/);
    assert.doesNotMatch(capture, /fillStyle = terrainInk/);
    assert.match(capture, /input\.ink\.grid, 1\.4/);
    assert.match(capture, /input\.ink\.coast, 1\.8/);
    assert.equal(/TOO_LARGE = 'This browser can\\'t make an image that large\. Try a smaller paper\.'/.test(capture), true);
    assert.doesNotMatch(capture, /window|document|getComputedStyle|sheetEl|canvas\.width/);
    assert.match(chunks, /size: \{ width: number; height: number \}/);
    assert.match(chunks, /width: MAP_WIDTH, height: MAP_HEIGHT/);
    assert.match(stage, /SaveImageButton/);
    assert.match(stage, /SaveImageSheet/);
    assert.match(stage, /The whole surface/);
    assert.match(stage, /showToast\(TOO_LARGE\)/);
    assert.match(stage, /printSurfaceInk/);
    assert.match(stage, /ground: ink\.paper/);
    assert.doesNotMatch(stage.slice(stage.indexOf('async function saveImage')), /screenGround|screenText/);
    assert.match(capture, /ctx\.fillStyle = input\.look === 'paper' \? input\.ink\.paper : input\.ground/);
    assert.match(capture, /drawCaption\(ctx, input\.caption, px\.width, px\.height, input\.font, input\.ink\.muted\)/);
    assert.doesNotMatch(capture, /screenText/);
    assert.match(stage, /rememberedVersion\(\)/);
    assert.doesNotMatch(stage.slice(stage.indexOf('async function saveImage')), /canvas\.width|sheetEl\.value\.width/);
});

function cell(terrain, features = []) {
    return { terrain, features, accents: [] };
}

test('on paper nothing is stroked in the coast ink and nothing is filled in a wash ink', () => {
    const capture = read('surface/capture.ts');
    const start = capture.indexOf('function drawPaperNet');
    const end = capture.indexOf('function drawLegend');
    const paper = capture.slice(start, end);
    assert.ok(start > 0 && end > start);
    assert.doesNotMatch(paper, /ink\.coast/);
    assert.doesNotMatch(paper, /wash/);
    assert.match(paper, /ink\.grid/);
    assert.match(paper, /plain: false/);
    assert.match(capture, /drawDiamondSeparators\(/);
    assert.match(capture, /input\.ink\.coast, 1\.8/);
});

function glyphStrokes(terrain, plain) {
    const hex = cell(terrain);
    let strokes = 0;
    const ctx = {
        strokeStyle: '', fillStyle: '', lineWidth: 1, lineCap: '', lineJoin: '',
        beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, clip() {},
        save() {}, restore() {}, arc() {}, rect() {}, fill() {},
        stroke() { strokes += 1; },
    };
    drawSymbols(ctx, {
        grid: { n: 1, faces: [{ a: [0, 0], b: [1, 0], c: [0.5, 0.866] }], vid: [Int32Array.from([0, 1, 2])] },
        hexes: [hex, hex, hex],
    }, SHEET_LAYOUT, { set: null, outlines: false, icons: true, plain, ink: '#111' });
    return strokes;
}

test('an ocean cell and a shallows cell each carry a glyph on paper, and stay plain on the screen', () => {
    for (const terrain of ['OC', 'SH', 'GR', 'RK']) {
        assert.equal(symbolOf(cell(terrain)), null);
        assert.equal(symbolOf(cell(terrain), false), terrain);
        assert.equal(glyphStrokes(terrain, true), 0);
        assert.ok(glyphStrokes(terrain, false) > 0, terrain);
    }
    assert.equal(symbolOf(cell('OC', ['town']), false), 'town');
    assert.equal(symbolOf(cell('FO')), 'FO');
});
