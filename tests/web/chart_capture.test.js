/**
 * DP1 (streams/D.md): the chart as a print-quality image. The pure parts run here: the papers' pixels
 * at 300 dpi both ways, the fit that puts a subsector inside the image at the 92% fill, the caption and
 * the file name. Source checks hold the shape: the renderer's one-frame draw restores in a finally, the
 * button, the menu entry and the sheet exist, and the capture reaches the browser only through
 * platform/browser.ts. The pixels themselves are checked in a browser (findings/storefront/sd_dp1.mjs).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
    areaWords, asciiName, captionText, captionY, captureName, chartVersionWords, FILL, isPaper, orientationFor, PAPERS, paperPixels, PRINT_DPR, sizeWords,
} from '../../apps/web/src/capture/paper.ts';
import { captureCamera, paperFor } from '../../apps/web/src/map/capture.ts';
import { toScreen } from '../../apps/web/src/map/camera.ts';
import { hexCentre, hexCorners, toGlobal } from '../../apps/web/src/map/geometry.ts';
import { subsectorHexes } from '../../apps/web/src/builder/address.ts';
import { PPP_NAMES } from '../../apps/web/src/map/tiers.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => fs.readFileSync(path.join(root, 'apps/web/src', rel), 'utf8');

test('the four papers at 300 dpi, both ways: A4 portrait is 2480 by 3508, and the CSS size lands on it', () => {
    const want = { A4: [2480, 3508], Letter: [2550, 3300], A3: [3508, 4961], Tabloid: [3300, 5100] };
    assert.deepEqual([...PAPERS], ['A4', 'Letter', 'A3', 'Tabloid']);
    for (const paper of PAPERS) {
        const portrait = paperPixels(paper, 'portrait');
        assert.deepEqual([portrait.deviceWidth, portrait.deviceHeight], want[paper], paper);
        const landscape = paperPixels(paper, 'landscape');
        assert.deepEqual([landscape.deviceWidth, landscape.deviceHeight], [want[paper][1], want[paper][0]], paper + ' landscape');
        // What the renderer's resize does with the CSS size: width times dpr, rounded, is the device size again.
        assert.equal(Math.round(portrait.width * portrait.dpr), portrait.deviceWidth);
        assert.equal(Math.round(portrait.height * portrait.dpr), portrait.deviceHeight);
        assert.equal(portrait.dpr, PRINT_DPR);
    }
    assert.equal(PRINT_DPR, 3.125);
    assert.equal(sizeWords(paperPixels('A4', 'portrait')), '2480 × 3508 px');
    assert.equal(isPaper('A3'), true);
    assert.equal(isPaper('A2'), false);
    assert.equal(isPaper(null), false);
});

test('the orientation follows the area: a subsector and a sector are portrait, a wide screen is landscape', () => {
    assert.equal(orientationFor(8, 9), 'portrait');
    assert.equal(orientationFor(32, 34.6), 'portrait');
    assert.equal(orientationFor(1600, 900), 'landscape');
    assert.equal(orientationFor(10, 10), 'portrait');
});

/** The box round every hex of a subsector, in parsecs, as the map's keysWorldBox does it. */
function subsectorBox(sx, sy, letter) {
    const box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    for (const hhhh of subsectorHexes(letter)) {
        const global = toGlobal(sx, sy, Number(hhhh.slice(0, 2)), Number(hhhh.slice(2)));
        const centre = hexCentre(global.q, global.r);
        const corners = hexCorners(centre.x, centre.y);
        for (let i = 0; i < corners.length; i += 2) {
            box.x0 = Math.min(box.x0, corners[i]);
            box.x1 = Math.max(box.x1, corners[i]);
            box.y0 = Math.min(box.y0, corners[i + 1]);
            box.y1 = Math.max(box.y1, corners[i + 1]);
        }
    }
    return box;
}

test('a subsector fits inside the image at the 92% fill, every one of its 8 by 10 hexes, at the names zoom', () => {
    const rect = subsectorBox(-4, -1, 'C');
    const px = paperFor(rect, 'A4');
    assert.equal(px.deviceWidth, 2480, 'a subsector is portrait');
    const cam = captureCamera(rect, px.width, px.height);
    const vp = { width: px.width, height: px.height };
    const marginX = (px.width * (1 - FILL)) / 2;
    const marginY = (px.height * (1 - FILL)) / 2;
    let tight = 0;
    for (const hhhh of subsectorHexes('C')) {
        const global = toGlobal(-4, -1, Number(hhhh.slice(0, 2)), Number(hhhh.slice(2)));
        const centre = hexCentre(global.q, global.r);
        const corners = hexCorners(centre.x, centre.y);
        for (let i = 0; i < corners.length; i += 2) {
            const at = toScreen(cam, vp, corners[i], corners[i + 1]);
            assert.ok(at.sx >= marginX - 1e-6 && at.sx <= px.width - marginX + 1e-6, hhhh + ' x ' + at.sx);
            assert.ok(at.sy >= marginY - 1e-6 && at.sy <= px.height - marginY + 1e-6, hhhh + ' y ' + at.sy);
            if (Math.abs(at.sx - marginX) < 1e-6 || Math.abs(at.sx - (px.width - marginX)) < 1e-6) tight += 1;
            if (Math.abs(at.sy - marginY) < 1e-6 || Math.abs(at.sy - (px.height - marginY)) < 1e-6) tight += 1;
        }
    }
    assert.ok(tight > 0, 'the tighter side touches the 92% edge');
    assert.ok(cam.ppp >= PPP_NAMES, 'names, the UWP line and bases draw: ppp ' + cam.ppp);
    // The caption sits in the lower margin, under the chart.
    assert.ok(captionY(px.height) > px.height - marginY);
    assert.ok(captionY(px.height) < px.height);
});

test('a camera for a wide screen area is centred and clamped to the chart\'s zoom range', () => {
    const cam = captureCamera({ x0: 10, y0: 20, x1: 10.001, y1: 20.001 }, 1000, 800);
    assert.ok(Math.abs(cam.x - 10.0005) < 1e-9 && Math.abs(cam.y - 20.0005) < 1e-9, 'centred on the area');
    assert.equal(cam.ppp, 160, 'never past the chart\'s closest zoom');
    const wide = captureCamera({ x0: 0, y0: 0, x1: 100, y1: 10 }, 1000, 800);
    assert.ok(Math.abs(wide.ppp - 9.2) < 1e-9, 'the width is the tighter side: 1000 × 0.92 / 100');
});

test('the caption and the file name', () => {
    const regina = { kind: 'subsector', name: 'Regina', sector: 'Spinward Marches' };
    assert.equal(areaWords(regina), 'Regina subsector, Spinward Marches');
    assert.equal(areaWords({ kind: 'subsector', name: 'Subsector C', sector: 'Hollow Verge' }), 'Subsector C, Hollow Verge');
    assert.equal(areaWords({ kind: 'sector', sector: 'Spinward Marches' }), 'Spinward Marches sector');
    assert.equal(areaWords({ kind: 'screen', sector: 'Spinward Marches' }), 'Spinward Marches chart');
    assert.equal(areaWords({ kind: 'screen', sector: '' }), 'Chart');
    assert.equal(areaWords({ kind: 'system', name: 'Regina', sector: 'Spinward Marches', hex: '1910' }), 'Regina system, Spinward Marches 1910');
    assert.equal(areaWords({ kind: 'world', name: 'Regina', sector: 'Spinward Marches', hex: '1910' }), 'Regina surface, Spinward Marches 1910');
    assert.equal(captionText(regina, '100-1105', '10'), 'Regina subsector, Spinward Marches · 100-1105 · traveller.voyage · chart v10');
    assert.equal(captionText(regina, null, 'v10'), 'Regina subsector, Spinward Marches · traveller.voyage · chart v10');
    assert.equal(captionText(regina, null, null), 'Regina subsector, Spinward Marches · traveller.voyage');
    assert.equal(chartVersionWords('10'), 'chart v10');
    assert.equal(captureName(regina, 'A4'), 'Regina subsector, Spinward Marches (A4, 300 dpi).png');
    assert.equal(captureName({ kind: 'screen', sector: 'Spinward Marches' }, 'Letter'), 'Spinward Marches chart (Letter, 300 dpi).png');
    assert.equal(captureName({ kind: 'sector', sector: 'Spinward Marches' }, 'A3'), 'Spinward Marches sector (A3, 300 dpi).png');
    // ASCII only, no slashes, nothing a file system refuses.
    assert.equal(asciiName('Zhodani Consulate / Ürsa: "Core"?'), 'Zhodani Consulate - Ursa- -Core--');
    assert.equal(asciiName('·'), 'Chart');
    assert.match(captureName({ kind: 'sector', sector: 'Dağ' }, 'A4'), /^Dag sector \(A4, 300 dpi\)\.png$/);
});

test('the renderer draws one frame elsewhere and restores in a finally; the capture reaches the browser only through platform/browser.ts', () => {
    const renderer = read('map/MapRenderer.ts');
    assert.match(renderer, /drawInto\(\s*canvas: HTMLCanvasElement,\s*cam: Camera,\s*width: number,\s*height: number,\s*dpr: number,\s*theme: MapTheme,/);
    const body = renderer.slice(renderer.indexOf('    drawInto('), renderer.indexOf('    /** `animating` is true while a title fade'));
    assert.match(body, /try \{[\s\S]*this\.canvas = canvas;[\s\S]*this\.resize\(width, height, dpr\);[\s\S]*const drawn = this\.draw\(cam\);[\s\S]*\} finally \{[\s\S]*this\.canvas = live\.canvas;[\s\S]*this\.theme = live\.theme;[\s\S]*this\.selected = live\.selected;[\s\S]*this\.titleStates\.clear\(\);[\s\S]*this\.dotTiles\.clear\(\);/);
    assert.match(body, /opts: \{ titleTop: number; workspaceLeft: number; selection: Selection \| null; only\?: readonly \{ q: number; r: number \}\[\] \}/);
    assert.match(renderer, /ctx\.globalAlpha = alpha \* this\.fillScale\(\);/, 'polity fills at the theme\'s share');
    assert.match(renderer, /ctx\.globalAlpha = REGION_FILL_ALPHA \* this\.fillScale\(\);/, 'region fills too');
    const capture = read('map/capture.ts');
    assert.doesNotMatch(capture, /\bwindow\.|\bdocument\.|\bgetComputedStyle\(/);
    assert.match(capture, /from '\.\.\/platform\/browser\.ts'/);
    assert.match(capture, /createCanvas\(px\.deviceWidth, px\.deviceHeight\)/, 'the image is drawn at its pixels, never scaled afterwards');
    assert.match(capture, /drawRing\(ctx, cam, vp, input\.ring, input\.inks\.ring\)/);
    assert.match(capture, /drawRipple\(ctx, cam, vp, input\.ripple, input\.inks\.news\)/);
    assert.match(capture, /drawTracks\(ctx, frame\.tracks, \{ alpha: 1, scale: 1 \}, input\.inks\.traffic\)/);
    assert.match(capture, /paintMargins\(ctx, cam, vp, \{ rect: input\.rect, hexes: input\.hexes \}, input\.theme\.bg0\);\s+drawCaption\(/, 'the rest is paper, before the caption');
    assert.match(capture, /ctx\.fill\(outside, 'evenodd'\)/, 'a subsector ends along its hexes');
    assert.match(capture, /saveBlob\(blob, input\.fileName\)/);
    assert.equal(/TOO_LARGE = 'This browser can\\'t make an image that large\. Try a smaller paper\.'/.test(capture), true);
    const paper = read('capture/paper.ts');
    assert.doesNotMatch(paper, /\bwindow\.|\bdocument\.|from '\.\.\/platform/, 'pure');
    assert.doesNotMatch(read('platform/browser.ts').split('export function canvasToBlob')[1] ?? '', /toDataURL/, 'a blob, not a data URL');
});

test('the print chart theme: tokens for every colour the chart draws, read by printTheme, fills at a lower alpha', () => {
    const tokens = read('design/tokens.css');
    for (const name of ['line-1', 'line-2', 'grid', 'text', 'text-muted', 'signal', 'signal-dim', 'world', 'water', 'zone-amber', 'zone-red', 'selected', 'title-text', 'title-pill', 'tag', 'public', 'traffic', 'news', 'route-xboat', 'route-other', 'route-im', 'route-core-route']) {
        assert.match(tokens, new RegExp('--print-chart-' + name + ': #[0-9a-f]{6};'), name);
    }
    assert.match(tokens, /--print-chart-fill: 0\.\d+;/);
    const theme = read('map/theme.ts');
    assert.match(theme, /export function printTheme\(el: HTMLElement\): MapTheme/);
    assert.match(theme, /bg0: token\(style, '--print-paper'\)/);
    assert.match(theme, /tFast: 0,/, 'titles at full: a saved image is one frame');
    assert.match(theme, /fillScale\?: number;/);
    assert.doesNotMatch(theme, /#[0-9a-fA-F]{3,8}\b/, 'no colour literal');
});

test('the button, the sheet, the command and the menu entry', () => {
    const view = read('views/MapView.vue');
    assert.match(view, /<SaveImageButton v-if="!shipSheet && versionRef" title="Save an image of the chart" @click="openSaveSheet" \/>/);
    assert.match(view, /<SaveImageSheet v-if="saveSheet" :areas="saveAreas" :busy="saving" @save="saveImage" @cancel="closeSaveSheet" \/>/);
    assert.match(view, /id: 'save-image',\s+name: 'Save image',/);
    assert.match(view, /if \(id === 'save-image'\) \{\s+openSaveSheet\(\);\s+return;\s+\}/, 'the menu\'s entry is the map\'s act');
    assert.match(view, /label: 'What\\'s on screen'/);
    assert.match(view, /showToast\(TOO_LARGE\)/);
    assert.match(view, /\{ \.\.\.readTheme\(el\), tFast: 0 \} : printTheme\(el\)/, 'the screen look keeps its colours, with no title fade');
    const commands = read('workspace/build/commands.ts');
    assert.match(commands, /items\.push\(\{ id: 'save-image', label: 'Save image…', icon: 'file-export', rule: true \}\);/);
    assert.match(commands, /if \(id === 'save-image'\) return;\s+if \(!canBuild\(id, keys\)\) return;/, 'never Build\'s last branch (remove)');
    const sheet = read('capture/SaveImageSheet.vue');
    assert.match(sheet, /class="ui-modal save-img" role="dialog" aria-modal="true"/);
    assert.match(sheet, /<legend class="save-img-lbl">Area<\/legend>/);
    assert.match(sheet, /aria-labelledby="save-img-paper"/);
    assert.match(sheet, />On paper<\/button>/);
    assert.match(sheet, />Full colour<\/button>/);
    assert.match(sheet, /storageSet\(PAPER_KEY, paper\.value\)/, 'the last paper is kept per device');
    assert.doesNotMatch(sheet, /\bwindow\.|alert\(|confirm\(/);
    const button = read('capture/SaveImageButton.vue');
    assert.match(button, /aria-label="Save image"/);
    assert.match(button, /<Icon name="file-export" :size="16" \/>/);
    assert.match(button, /@media \(prefers-reduced-motion: reduce\)/);
});

test('DF20: a capture with an area draws only its own worlds; the screen and a capture without an area draw them all', async () => {
    const { MapRenderer } = await import('../../apps/web/src/map/MapRenderer.ts');
    const { hexCentre, toGlobal } = await import('../../apps/web/src/map/geometry.ts');
    if (typeof globalThis.Path2D !== 'function') globalThis.Path2D = class Path2D { moveTo() {} lineTo() {} closePath() {} rect() {} };
    const recorder = () => {
        const calls = [];
        const ctx = new Proxy({}, {
            get(_t, prop) {
                if (prop === 'measureText') return (text) => ({ width: 7 * String(text).length });
                return (...args) => { calls.push([String(prop), ...args]); };
            },
            set(_t, prop, value) { calls.push(['set', String(prop), value]); return true; },
        });
        return { calls, ctx, canvas: { width: 0, height: 0, getContext: () => ctx } };
    };
    const theme = {
        bg0: 'bg', line1: 'l1', line2: 'l2', signal: 'sig', signalDim: 'sigdim', text1: 't1', textMuted: 'muted',
        fontDisplay: 'display', fontData: 'data', fontText: 'text',
        chart: { world: 'world', water: 'water', zoneAmber: 'amber', zoneRed: 'red', grid: 'grid', selected: 'selected', routeXboat: 'xboat', routeOther: 'other', titleText: 'title', titlePill: 'pill' },
        routeColours: {},
    };
    const live = recorder();
    const renderer = new MapRenderer(live.canvas, theme);
    renderer.setChart({ sectors: [{ slug: 'Spinward_Marches', name: 'Spinward Marches', x: -4, y: -1, canonical: true }] }, { truthVersion: 'v', sectors: [] }, 'canonical');
    renderer.setIndexSource(() => ({ hexes: { '1910': { name: 'Regina', uwp: 'A788899-C' }, '2040': { name: 'Ougzdaelzoerrgh', uwp: 'A899335-B' } } }));
    renderer.resize(800, 600, 1);
    const regina = toGlobal(-4, -1, 19, 10);
    const above = toGlobal(-4, -1, 20, 40);
    // A camera over both worlds at the names zoom. 2040 is the row above subsector C's 2001 in the next sector down; here it stands in for any world outside the area.
    const mid = hexCentre(regina.q, regina.r);
    const cam = { x: mid.x, y: mid.y + 10, ppp: 64 };
    const names = (calls) => calls.filter((call) => call[0] === 'fillText').map((call) => call[1]).filter((text) => text === 'Regina' || text === 'Ougzdaelzoerrgh');

    const off = recorder();
    renderer.drawInto(off.canvas, cam, 800, 600, 1, theme, { titleTop: 0, workspaceLeft: 0, selection: null, only: [regina] });
    assert.deepEqual(names(off.calls), ['Regina'], "only the area's world is drawn");

    const all = recorder();
    renderer.drawInto(all.canvas, cam, 800, 600, 1, theme, { titleTop: 0, workspaceLeft: 0, selection: null });
    assert.deepEqual(names(all.calls).sort(), ['Ougzdaelzoerrgh', 'Regina'], 'no area: every world');

    live.calls.length = 0;
    renderer.draw(cam);
    assert.deepEqual(names(live.calls).sort(), ['Ougzdaelzoerrgh', 'Regina'], 'the screen after a capture: every world');
    const source = read('map/MapRenderer.ts');
    assert.match(source, /onlyHexes: this\.onlyHexes,/);
    assert.match(source, /this\.onlyHexes = live\.onlyHexes;/);
    assert.match(read('map/capture.ts'), /only: input\.hexes/);
});
