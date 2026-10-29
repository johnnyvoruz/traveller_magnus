/**
 * CP2 (streams/C.md): the system map as a print-quality image. The pure parts run here: the papers'
 * pixels at 300 dpi, the fitted system inside the image, and a zoomed view keeping its zoom when the
 * paper is a different size. Source checks hold the shape: one new renderer, flat discs, its own
 * canvas at the paper's pixels, and the live canvas never written. The pixels themselves are checked
 * in a browser (findings/ui_design_shots/sc_CP2_save.mjs).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { paperPixels, PRINT_DPR } from '../../apps/web/src/capture/paper.ts';
import { fitCamera, startCamera, viewOf } from '../../apps/web/src/orbit/camera.ts';
import { CAPTURE_FOOT, captureSize, fittedCamera, fittedOrientation, framedCamera } from '../../apps/web/src/orbit/capture.ts';
import { sceneBounds, planSystem } from '../../apps/web/src/orbit/layout.ts';
import { DEFAULT_LAYERS } from '../../apps/web/src/orbit/picture.ts';
import { HEX_KEY, testSystem } from './orbit_fixture.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => fs.readFileSync(path.join(root, 'apps/web/src', rel), 'utf8');

const DAYS = 1000;

test('A4 portrait is 2480 by 3508, and the capture size is that over 300/96 minus the foot', () => {
    const px = paperPixels('A4', 'portrait');
    assert.deepEqual([px.deviceWidth, px.deviceHeight], [2480, 3508]);
    assert.equal(px.dpr, PRINT_DPR);
    assert.equal(Math.round(px.width * px.dpr), 2480);
    assert.equal(Math.round(px.height * px.dpr), 3508);
    const size = captureSize(px);
    assert.equal(size.w, px.width);
    assert.equal(size.h, px.height - CAPTURE_FOOT);
    assert.ok(size.h > 20);
});

test('a fitted system sits inside the image, and a zoomed view keeps its zoom on the paper', () => {
    const plan = planSystem(testSystem(), HEX_KEY);
    const px = paperPixels('A4', fittedOrientation(plan, DAYS, DEFAULT_LAYERS, 'orbits'));
    const size = captureSize(px);
    const fitted = fittedCamera(plan, size, DAYS, DEFAULT_LAYERS, 'orbits');
    const view = viewOf(fitted, size, DEFAULT_LAYERS.linear, DEFAULT_LAYERS.moons, DEFAULT_LAYERS.jump);
    const bounds = sceneBounds(plan, view, DAYS);
    assert.ok(bounds.left >= -1 && bounds.top >= -1, 'inside the top left');
    assert.ok(bounds.right <= size.w + 1 && bounds.bottom <= size.h + 1, 'inside the bottom right');
    assert.equal(fitted.atFit, true);

    const screen = { w: 900, h: 600 };
    const live = fitCamera(plan, screen, DAYS, startCamera(), false, false, true, true);
    const zoomed = { ...live, zoom: live.fitZoom * 4, offX: live.fitOffX + 30, offY: live.fitOffY - 12, atFit: false };
    const framed = framedCamera(plan, size, DAYS, zoomed, DEFAULT_LAYERS, 'orbits');
    assert.ok(Math.abs(framed.zoom / framed.fitZoom - 4) < 0.02, 'four times the fit, on the paper too');
    assert.equal(framed.atFit, false);
});

test('a row is landscape paper and a column is portrait', () => {
    const plan = planSystem(testSystem(), HEX_KEY);
    assert.equal(fittedOrientation(plan, DAYS, DEFAULT_LAYERS, 'row'), 'landscape');
    assert.equal(fittedOrientation(plan, DAYS, DEFAULT_LAYERS, 'column'), 'portrait');
});

test('the capture draws one frame on its own canvas, with flat discs, and does not write the live canvas', () => {
    const capture = read('orbit/capture.ts');
    assert.match(capture, /const canvas = createCanvas\(px\.deviceWidth, px\.deviceHeight\)/);
    assert.match(capture, /renderer\.resize\(px\.width, px\.height, px\.dpr\)/);
    assert.match(capture, /new OrbitRenderer\(ctx, input\.theme,/);
    assert.match(capture, /discs: null/);
    assert.match(capture, /makeCanvas: input\.look === 'screen' \? createCanvas : null/);
    assert.match(capture, /motion: false/);
    assert.match(capture, /selected: input\.look === 'screen' \? input\.shot\.selected : null/);
    assert.match(capture, /drawKey\(ctx, legendFor\(/);
    assert.match(capture, /saveBlob\(blob, input\.fileName\)/);
    assert.equal(/TOO_LARGE = 'This browser can\\'t make an image that large\. Try a smaller paper\.'/.test(capture), true);
    assert.doesNotMatch(capture, /\bwindow\.|\bdocument\.|\bgetComputedStyle\(/);
    const shot = read('orbit/OrbitCanvas.vue');
    const body = shot.slice(shot.indexOf('function shot('), shot.indexOf('defineExpose'));
    assert.match(body, /cam: \{ \.\.\.stage\.cam \}/);
    assert.doesNotMatch(body, /canvas\.width|canvas\.height|getContext|renderer\.draw/);
    const view = read('views/OrbitView.vue');
    assert.match(view, /<SaveImageButton v-if="version && state === 'ready'" title="Save an image of this system" @click="openSaveSheet" \/>/);
    assert.match(view, /<SaveImageSheet v-if="saveSheet" :areas="saveAreas" :busy="saving" @save="saveImage" @cancel="closeSaveSheet" \/>/);
    assert.match(view, /label: 'What\\'s on screen'/);
    assert.match(view, /label: 'The whole system'/);
    assert.match(view, /choice\.look === 'screen' \? readOrbitTheme\(el\) : printOrbitTheme\(el\)/);
    assert.match(view, /showToast\(TOO_LARGE\)/);
    const theme = read('orbit/theme.ts');
    assert.match(theme, /export function printOrbitTheme\(el: HTMLElement\): OrbitTheme/);
    assert.match(theme, /space: paper/);
    assert.match(theme, /tLock: 0/);
    assert.doesNotMatch(theme, /#[0-9a-fA-F]{3,8}\b/);
});
