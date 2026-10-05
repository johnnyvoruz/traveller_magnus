// Node oracle for the legacy diamond sheet. Loads unmodified js/planet_renderer.js
// in an isolated vm. The canvas stand-in allocates ImageData and records drawing
// commands. It does not rasterize paths. Private helpers are exposed by an
// in-memory insertion; js/ is never written.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { stable } from '../../packages/shared/src/stable.ts';
import { loadLegacy } from './legacy.js';
import { TSV, settings, seed as generationSeed } from '../golden/cases.js';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const RENDERER = path.join(ROOT, 'js', 'planet_renderer.js');
const CORE = path.join(ROOT, 'js', 'core.js');
const HEX_EDITOR = path.join(ROOT, 'js', 'hex_editor.js');

const RETURN_ANCHOR = '    return { renderPlanetHemispheres, renderFlatMap, renderDiamondBlank, renderApproachFrame, imageSeed, tempBandFromKelvin, test, testMolten, testFlatMap };';

const FLAT_CAPTURE = [
    '        const ms         = (typeof masterSeed !== \'undefined\') ? masterSeed : \'default\';',
    '        const baseSeed      = hashString(ms + \'-\' + (hexId || \'0000\') + \'-ph\');',
    '        const heightGrid    = _buildGrid3D(mulberry32(baseSeed));',
    '        const continentSeed = hashString(ms + \'-\' + (hexId || \'0000\') + \'-cn\');',
    '        const seeds         = _buildContinentSeeds(mulberry32(continentSeed));',
    '        const heightCDF     = _buildCDF(heightGrid, seeds, 2048);',
    '        const oceanSeed     = hashString(ms + \'-\' + (hexId || \'0000\') + \'-oc\');',
    '        const oceanRng   = mulberry32(oceanSeed)();',
    '        const palette    = _buildPalette(worldData, oceanRng);',
].join('\n');

const GRID_PROBE_INDICES = [0, 1, 31, 32, 1024, 4095, 32767];
const TRACE_HEAD = 40;
const TRACE_TAIL = 10;
const CDF_SAMPLES = 16;

/** sha256 of the stable JSON of the ordered command list. */
export function surfaceTraceSha256(commands) {
    return sha256(stable(commands));
}

/** sha256 of the raw little-endian Float32 bytes. A number array is narrowed first. */
export function surfaceCdfSha256(cdf) {
    const raw = cdf instanceof Float32Array ? cdf : Float32Array.from(cdf);
    return sha256(Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength));
}

function cdfSamplesOf(cdf) {
    const samples = [];
    for (let s = 0; s < CDF_SAMPLES; s++) {
        const i = Math.round(s * (cdf.length - 1) / (CDF_SAMPLES - 1));
        samples.push({ i, v: cdf[i] });
    }
    return samples;
}

function summarizeMap(full) {
    const commands = full.commands;
    const cdf = full.cdf;
    return {
        width: full.width,
        height: full.height,
        rgbaBytes: full.rgbaBytes,
        rgbaDigest: full.rgbaDigest,
        probes: full.probes,
        projection: full.projection,
        commandsCount: commands.length,
        commandsSha256: surfaceTraceSha256(commands),
        commandsHead: commands.slice(0, TRACE_HEAD),
        commandsTail: commands.slice(-TRACE_TAIL),
        ops: full.ops,
        grid: full.grid,
        seeds: full.seeds,
        cdfSha256: surfaceCdfSha256(cdf),
        cdfSamples: cdfSamplesOf(cdf),
        palette: full.palette,
        input: full.input,
    };
}

const DEFAULTS = {
    masterSeed: 'TravellerMagnus',
    continental: 0.55,
    coastline: 0.45,
    printMode: false,
    projection: 'diamond',
};

function sha256(bytes) {
    return crypto.createHash('sha256').update(bytes).digest('hex');
}

function once(src, anchor, id) {
    const at = src.indexOf(anchor);
    if (at < 0) throw new Error('surface oracle anchor missing: ' + id);
    if (src.indexOf(anchor, at + anchor.length) !== -1) throw new Error('surface oracle anchor duplicated: ' + id);
    return at;
}

function extractFunction(src, name) {
    const anchor = 'function ' + name + '(';
    const start = once(src, anchor, name);
    let depth = 0;
    for (let i = src.indexOf('{', start); i < src.length; i++) {
        const ch = src[i];
        if (ch === '{') depth++;
        else if (ch === '}') {
            depth--;
            if (depth === 0) return src.slice(start, i + 1);
        }
    }
    throw new Error('surface oracle unclosed function: ' + name);
}

function readText(file) {
    let src = fs.readFileSync(file, 'utf8');
    if (src.charCodeAt(0) === 0xFEFF) src = src.slice(1);
    // The checkout has CRLF on Windows and LF on CI; digests are taken over LF text.
    return src.replace(/\r\n/g, '\n');
}

// Sample sites only. Colours and inverse coordinates come from the real loop.
export function diamondProbeSites() {
    const W = 800, H = 400, N = 5;
    const hw = W / (2 * N);
    const bandTop = Math.round(H / 3);
    const bandBot = H - bandTop;
    const sites = [];
    const seen = new Set();
    const add = (x, y, tag) => {
        if (!Number.isInteger(x) || !Number.isInteger(y)) throw new Error('non-integer probe ' + tag + ' ' + x + ',' + y);
        if (x < 0 || y < 0 || x >= W || y >= H) return;
        const key = x + ',' + y;
        if (seen.has(key)) return;
        seen.add(key);
        sites.push({ x, y, tag });
    };
    for (let li = 0; li <= N; li++) add(li * W / N, 0, 'north-pole-' + li);
    for (let li = 0; li < N; li++) add((li + 0.5) * W / N, H - 1, 'south-pole-' + li);
    const rows = [
        ['north-base', bandTop - 1, true],
        ['north-mid', Math.floor(bandTop / 2), true],
        ['south-base', bandBot, false],
        ['south-mid', bandBot + Math.floor((H - bandBot) / 2), false],
    ];
    for (const [label, py, north] of rows) {
        const maxOff = north ? hw * py / bandTop : hw * (H - py) / (H - bandBot);
        const lobes = north ? N + 1 : N;
        for (let li = 0; li < lobes; li++) {
            const cx = north ? li * W / N : (li + 0.5) * W / N;
            const pxStart = Math.max(0, Math.ceil(cx - maxOff));
            const pxEnd = Math.min(W - 1, Math.floor(cx + maxOff));
            if (pxStart <= pxEnd) {
                add(pxStart, py, label + '-l-' + li);
                add(pxEnd, py, label + '-r-' + li);
            }
        }
    }
    for (let k = 0; k <= N; k++) add(k * W / N, 200, 'equator-meridian-' + k);
    add(0, bandTop, 'band-west');
    add(W - 1, bandTop, 'band-east');
    add(0, bandBot - 1, 'band-west-bot');
    add(W - 1, bandBot - 1, 'band-east-bot');
    add(400, 200, 'equator-centre');
    add(400, 0, 'north-gap');
    add(80, bandTop - 1, 'north-join-gap');
    add(0, H - 1, 'south-gap');
    return sites;
}

function instrument(src) {
    const insertions = [];
    let out = src.replace(/\r\n/g, '\n');
    out = insertSample(out, insertions, 'diamond-north',
        '// Tips at y=0 (north pole), bases at y=bandTop.',
        '// ── Equatorial band: full-width equirectangular strip');
    out = insertSample(out, insertions, 'diamond-equator',
        '// ── Equatorial band: full-width equirectangular strip',
        '// ── Southern lobes: N downward triangles');
    out = insertSample(out, insertions, 'diamond-south',
        '// ── Southern lobes: N downward triangles',
        '// ── Hex grid helpers');
    const capAt = once(out, FLAT_CAPTURE, 'flat-map-capture');
    insertions.push({ id: 'flat-map-capture', count: 1 });
    const capEnd = capAt + FLAT_CAPTURE.length;
    const cap = [
        '',
        '        if (globalThis.__voyageCapture) {',
        '            const __cap = globalThis.__voyageCapture;',
        '            __cap.grid = heightGrid;',
        '            __cap.seeds = seeds;',
        '            __cap.cdf = heightCDF;',
        '            __cap.palette = palette;',
        '        }',
    ].join('\n');
    out = out.slice(0, capEnd) + cap + out.slice(capEnd);
    const retAt = once(out, RETURN_ANCHOR, 'iife-return');
    insertions.push({ id: 'iife-return', count: 1 });
    const exposed = [
        '    function __voyageDiamondSample(px, py, lat, lon, wx, wy, wz) {',
        '        const sink = globalThis.__voyageDiamond;',
        '        if (!sink || !sink.want) return;',
        '        const key = px + \',\' + py;',
        '        if (sink.want[key] !== 1 || sink.seen[key]) return;',
        '        sink.seen[key] = 1;',
        '        sink.rows.push({ px: px, py: py, lat: lat, lon: lon, wx: wx, wy: wy, wz: wz });',
        '    }',
        '',
        '    return { renderPlanetHemispheres, renderFlatMap, renderDiamondBlank, renderApproachFrame, imageSeed, tempBandFromKelvin, test, testMolten, testFlatMap, _buildGrid3D, _buildContinentSeeds, _buildCDF, _buildPalette };',
    ].join('\n');
    out = out.slice(0, retAt) + exposed + out.slice(retAt + RETURN_ANCHOR.length);
    for (const row of insertions) if (row.count !== 1) throw new Error('surface oracle insertion count: ' + row.id);
    return { source: out, insertions };
}

function insertSample(src, insertions, id, comment, nextComment) {
    const at = once(src, comment, id);
    const limit = src.indexOf(nextComment, at + comment.length);
    if (limit < 0) throw new Error('surface oracle sample bound missing: ' + id);
    const needle = 'data[idx + 3] = 255;';
    const writeAt = src.indexOf(needle, at);
    if (writeAt < 0 || writeAt > limit) throw new Error('surface oracle sample write missing: ' + id);
    const lineEnd = src.indexOf('\n', writeAt);
    const lineStart = src.lastIndexOf('\n', writeAt) + 1;
    const indent = /^\s*/.exec(src.slice(lineStart, writeAt))[0];
    const line = indent + '__voyageDiamondSample(px, py, lat, lon, wx, sinLat, wz);';
    insertions.push({ id, count: 1 });
    return src.slice(0, lineEnd) + '\n' + line + src.slice(lineEnd);
}

export function sourceManifest() {
    const rendererBytes = Buffer.from(readText(RENDERER), 'utf8');
    const coreSrc = readText(CORE);
    const prng = extractFunction(coreSrc, 'hashString') + '\n' + extractFunction(coreSrc, 'mulberry32');
    const editor = readText(HEX_EDITOR);
    const mapStart = once(editor, 'function worldMapData(body) {', 'worldMapData');
    const mapEnd = once(editor, 'function openDiamondWorldMap(body, hexId) {', 'openDiamondWorldMap');
    const mapInputs = editor.slice(mapStart, mapEnd);
    const { insertions } = instrument(readText(RENDERER));
    const endian = new Uint32Array(new Uint8Array([1, 0, 0, 0]).buffer)[0] === 1 ? 'little' : 'big';
    return {
        sourceFile: 'js/planet_renderer.js',
        sourceSha256: sha256(rendererBytes),
        coreFile: 'js/core.js',
        corePrngSha256: sha256(prng),
        mapInputFile: 'js/hex_editor.js',
        mapInputSha256: sha256(mapInputs),
        insertions,
        probeSites: diamondProbeSites(),
        gridProbeIndices: GRID_PROBE_INDICES,
        floatByteOrder: endian,
        node: process.version,
        preOverlay: 'putImageData buffer before path strokes; strokes are commands only',
        projectionWy: 'sinLat passed to _continentHeight by the diamond loop',
    };
}

function rendererContext(instrumented, prng) {
    const s = { console };
    s.window = s;
    s.globalThis = s;
    s.self = s;
    const ctx = vm.createContext(s);
    ctx.masterSeed = DEFAULTS.masterSeed;
    ctx.planetContinentalDefinition = DEFAULTS.continental;
    ctx.planetCoastlineComplexity = DEFAULTS.coastline;
    ctx.printMode = false;
    vm.runInContext(prng, ctx, { filename: 'js/core.js#prng' });
    vm.runInContext(instrumented, ctx, { filename: 'js/planet_renderer.js#oracle' });
    if (!ctx.PlanetRenderer || typeof ctx.PlanetRenderer.renderFlatMap !== 'function') {
        throw new Error('surface oracle: PlanetRenderer.renderFlatMap missing');
    }
    if (typeof ctx.PlanetRenderer._buildGrid3D !== 'function') {
        throw new Error('surface oracle: private helpers were not exposed');
    }
    return ctx;
}

// Records the call order. fill, stroke and clip do not write pixels.
export function createStandIn() {
    const commands = [];
    const style = { strokeStyle: '#000', fillStyle: '#000', lineWidth: 1 };
    const stack = [];
    let image = null;
    let puts = 0;
    const ctx = {
        get strokeStyle() { return style.strokeStyle; },
        set strokeStyle(v) { style.strokeStyle = v; commands.push(['strokeStyle', v]); },
        get fillStyle() { return style.fillStyle; },
        set fillStyle(v) { style.fillStyle = v; commands.push(['fillStyle', v]); },
        get lineWidth() { return style.lineWidth; },
        set lineWidth(v) { style.lineWidth = v; commands.push(['lineWidth', v]); },
        clearRect(x, y, w, h) { commands.push(['clearRect', x, y, w, h]); },
        fillRect(x, y, w, h) { commands.push(['fillRect', x, y, w, h, style.fillStyle]); },
        beginPath() { commands.push(['beginPath']); },
        moveTo(x, y) { commands.push(['moveTo', x, y]); },
        lineTo(x, y) { commands.push(['lineTo', x, y]); },
        closePath() { commands.push(['closePath']); },
        rect(x, y, w, h) { commands.push(['rect', x, y, w, h]); },
        clip() { commands.push(['clip']); },
        stroke() { commands.push(['stroke']); },
        fill() { commands.push(['fill']); },
        save() { stack.push({ ...style }); commands.push(['save']); },
        restore() {
            const prev = stack.pop();
            if (prev) Object.assign(style, prev);
            commands.push(['restore']);
        },
        createImageData(w, h) {
            return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
        },
        putImageData(imageData, dx, dy) {
            puts += 1;
            if (!image) {
                image = {
                    width: imageData.width,
                    height: imageData.height,
                    data: new Uint8ClampedArray(imageData.data),
                    dx, dy,
                };
            }
            commands.push(['putImageData', dx, dy, imageData.width, imageData.height]);
        },
    };
    const canvas = {
        width: 0,
        height: 0,
        getContext(kind) { return kind === '2d' ? ctx : null; },
    };
    return {
        canvas,
        commands,
        take() {
            if (puts !== 1 || !image) throw new Error('surface oracle: expected one putImageData, got ' + puts);
            return image;
        },
    };
}

function pixelAt(data, width, x, y) {
    const i = (y * width + x) * 4;
    return [data[i], data[i + 1], data[i + 2], data[i + 3]];
}

function opsOf(commands) {
    const ops = {};
    for (const cmd of commands) ops[cmd[0]] = (ops[cmd[0]] || 0) + 1;
    return ops;
}

function drawOf(c) {
    return {
        masterSeed: c.masterSeed ?? DEFAULTS.masterSeed,
        continental: c.continental ?? DEFAULTS.continental,
        coastline: c.coastline ?? DEFAULTS.coastline,
        printMode: c.printMode ?? DEFAULTS.printMode,
        projection: c.projection ?? DEFAULTS.projection,
    };
}

export function createSurfaceOracle() {
    const manifest = sourceManifest();
    const coreSrc = readText(CORE);
    const prng = extractFunction(coreSrc, 'hashString') + '\n' + extractFunction(coreSrc, 'mulberry32');
    const { source } = instrument(readText(RENDERER));
    const ctx = rendererContext(source, prng);
    const sites = diamondProbeSites();
    const want = Object.create(null);
    for (const site of sites) want[site.x + ',' + site.y] = 1;
    return {
        manifest,
        run(hexId, worldData, draw) {
            const opts = drawOf(draw || {});
            ctx.masterSeed = opts.masterSeed;
            ctx.planetContinentalDefinition = opts.continental;
            ctx.planetCoastlineComplexity = opts.coastline;
            ctx.printMode = opts.printMode === true;
            const seen = Object.create(null);
            const rows = [];
            ctx.__voyageDiamond = { want, seen, rows };
            const cap = {};
            ctx.__voyageCapture = cap;
            const stand = createStandIn();
            ctx.PlanetRenderer.renderFlatMap(stand.canvas, { ...worldData }, hexId, { projection: opts.projection });
            const image = stand.take();
            if (image.width !== 800 || image.height !== 400) {
                throw new Error('surface oracle: expected 800x400, got ' + image.width + 'x' + image.height);
            }
            if (!cap.grid || !cap.cdf || !cap.seeds || !cap.palette) {
                throw new Error('surface oracle: render did not capture intermediates');
            }
            const probes = sites.map((site) => {
                const [r, g, b, a] = pixelAt(image.data, image.width, site.x, site.y);
                return { tag: site.tag, x: site.x, y: site.y, r, g, b, a };
            });
            const grid = cap.grid;
            const result = {
                width: image.width,
                height: image.height,
                rgbaBytes: image.data.byteLength,
                rgbaDigest: sha256(image.data),
                probes,
                projection: rows.map((row) => ({
                    px: row.px, py: row.py, lat: row.lat, lon: row.lon, wx: row.wx, wy: row.wy, wz: row.wz,
                })),
                commands: stand.commands,
                ops: opsOf(stand.commands),
                grid: {
                    length: grid.length,
                    digest: sha256(Buffer.from(grid.buffer, grid.byteOffset, grid.byteLength)),
                    probes: GRID_PROBE_INDICES.map((i) => ({ i, v: grid[i] })),
                },
                seeds: cap.seeds.map((s) => ({
                    sx: s.sx, sy: s.sy, sz: s.sz, cosR: s.cosR, strength: s.strength,
                })),
                cdf: cap.cdf,
                palette: {
                    seaLevel: cap.palette.seaLevel,
                    stops: cap.palette.stops,
                    polarColor: cap.palette.polarColor,
                    polarAngle: cap.palette.polarAngle,
                    polarFade: cap.palette.polarFade,
                    cloudColor: cap.palette.cloudColor,
                    hasSpecular: cap.palette.hasSpecular,
                    limbColor: cap.palette.limbColor,
                    limbStrength: cap.palette.limbStrength,
                    isAirless: cap.palette.isAirless,
                },
                input: { ...opts, hexId: hexId ?? null, worldData: { ...worldData } },
            };
            ctx.__voyageCapture = null;
            ctx.__voyageDiamond = null;
            return result;
        },
    };
}

function installMapInputs(ctx) {
    const editor = readText(HEX_EDITOR);
    const mapStart = once(editor, 'function worldMapData(body) {', 'worldMapData');
    const mapEnd = once(editor, 'function openDiamondWorldMap(body, hexId) {', 'openDiamondWorldMap');
    vm.runInContext(editor.slice(mapStart, mapEnd), ctx, { filename: 'js/hex_editor.js#map-inputs' });
    if (typeof ctx.canMapWorld !== 'function' || typeof ctx.diamondMapSpec !== 'function') {
        throw new Error('surface oracle: map input functions missing');
    }
}

function reginaSystem(ctx) {
    const rows = ctx.parseT5Tab(TSV, '1');
    for (const [hexId, state] of rows) ctx.hexStates.set(hexId, state);
    if (!ctx._buildOneMgtHex('1-C-1910')) throw new Error('surface oracle: Regina build failed');
    return ctx.SystemViewer.normalizeSystem(ctx.stripHexViewState(ctx.hexStates.get('1-C-1910')));
}

function eachBody(sys, fn) {
    (sys.stars || []).forEach((star, i) => fn(star, 's' + i));
    (sys.worlds || []).forEach((world, i) => {
        if (!world || world.type === 'Empty') return;
        fn(world, 'w' + i);
        (world.moons || []).forEach((moon, j) => {
            if (!moon || moon.type === 'Empty') return;
            fn(moon, 'w' + i + 'm' + j);
        });
    });
}

function specCase(id, body, columnHex, draw) {
    return { kind: 'spec', id, body, columnHex, ...DEFAULTS, ...draw };
}

function renderCase(id, worldData, hexId, draw) {
    return { kind: 'render', id, worldData, hexId, ...DEFAULTS, ...draw };
}

const SHARED = {
    type: 'Planet', size: 4, atmCode: 6, hydroCode: 4, meanTempK: 290, tempBand: 'Temperate',
    orbitId: '2', au: 0.7, uwp: 'A464000-8',
};

function bodyOf(name, extra) {
    return { ...SHARED, ...extra, name };
}

export function loadSurfaceCases() {
    const legacy = loadLegacy({ seed: generationSeed, settings });
    installMapInputs(legacy);
    const sys = reginaSystem(legacy);
    const cases = [];
    let variant = null;
    eachBody(sys, (body, key) => {
        cases.push(specCase('regina-' + key, body, '1910'));
        if (!variant && legacy.canMapWorld(body)) variant = { body, key };
    });
    if (!variant) throw new Error('surface oracle: Regina has no mappable body');
    cases.push(specCase('regina-fullkey-' + variant.key, variant.body, 'Spinward_Marches/1910'));

    cases.push(specCase('name-named', bodyOf('Named'), '1910'));
    cases.push(specCase('name-unnamed', bodyOf(undefined), '1910'));
    cases.push(specCase('name-whitespace', bodyOf('   '), '1910'));
    cases.push(specCase('name-twin-a', bodyOf('Twin'), '1910'));
    cases.push(specCase('name-twin-b', bodyOf('Twin'), '1910'));
    cases.push(specCase('name-twin-ws', bodyOf('  Twin  '), '1910'));
    cases.push(specCase('digits-num', bodyOf('Digits', { size: 8, atmCode: 6, hydroCode: 5 }), '1910'));
    cases.push(specCase('digits-str', bodyOf('Digits', { size: '8', atmCode: '6', hydroCode: '5' }), '1910'));
    cases.push(specCase('digits-a-num', bodyOf('ExoticA', { atmCode: 10, hydroCode: 5 }), '1910'));
    cases.push(specCase('digits-a-str', bodyOf('ExoticA', { atmCode: 'A', hydroCode: '5' }), '1910'));

    for (const hydro of [0, 10, 11, 'F']) {
        cases.push(specCase('hydro-' + hydro, bodyOf('Hydro', { atmCode: 5, hydroCode: hydro, meanTempK: 300 }), '1910'));
    }
    cases.push(specCase('class-molten-heat', bodyOf('MoltenHeat', { atmCode: 1, hydroCode: 0, meanTempK: 1500, tempBand: 'Hot' }), '1910'));
    cases.push(specCase('class-rock', bodyOf('Rock', { atmCode: 0, hydroCode: 0, meanTempK: 280, tempBand: 'Cool' }), '1910'));
    cases.push(specCase('class-ice-vacuum', bodyOf('IceVac', { atmCode: 0, hydroCode: 6, meanTempK: 100, tempBand: 'Frozen' }), '1910'));
    cases.push(specCase('class-ice-cold', bodyOf('IceCold', { atmCode: 4, hydroCode: 6, meanTempK: 210, tempBand: 'Frozen' }), '1910'));
    cases.push(specCase('class-wet', bodyOf('Wet', { atmCode: 6, hydroCode: 5, meanTempK: 290, tempBand: 'Temperate' }), '1910'));
    for (const atm of ['A', 'B', 'C', 'D', 'E', 'F']) {
        const group = atm < 'D' ? 'exotic' : 'ordinary';
        cases.push(specCase(group + '-' + atm, bodyOf('AtmMix', { atmCode: atm, hydroCode: 5, meanTempK: 300, tempBand: 'Temperate' }), '1910'));
    }

    cases.push(specCase('exclude-size-0', { type: 'Planet', name: 'Dot', size: 0, atmCode: 1, hydroCode: 0, uwp: 'A100000-8' }, '1910'));
    cases.push(specCase('exclude-size-str-0', { type: 'Planet', name: 'Dot0', size: '0', uwp: 'A100000-8' }, '1910'));
    cases.push(specCase('exclude-size-R', { type: 'Ring', name: 'Hoop', size: 'R' }, '1910'));
    cases.push(specCase('exclude-gas', { type: 'Gas Giant', name: 'Gas', size: 10, uwp: 'A9A0000-0' }, '1910'));
    cases.push(specCase('exclude-belt', { type: 'Planetoid Belt', name: 'Belt' }, '1910'));
    cases.push(specCase('exclude-asteroids', { type: 'Asteroid Belt', name: 'Rocks' }, '1910'));
    cases.push(specCase('exclude-star', { type: 'Star', name: 'Primary', sType: 'F7 V' }, '1910'));
    cases.push(specCase('exclude-stype', { type: 'Planet', name: 'Bare', sType: 'M3 V' }, '1910'));
    cases.push(specCase('exclude-empty', {}, '1910'));

    cases.push(renderCase('render-size-0', {
        name: 'Size0', size: 0, atmosphere: 6, hydrographics: 5, temperature: 'Temperate', temperatureK: 290, uwp: 'A060000-8',
    }, '1910-Size0'));
    cases.push(renderCase('render-missing', { size: 3 }, ''));

    const spec = legacy.diamondMapSpec(variant.body, '1910');
    const worldData = structuredClone(spec.worldData);
    const hexId = spec.seed;
    cases.push(renderCase('draw-alt-seed-' + variant.key, worldData, hexId, { masterSeed: 'SurfaceAlt' }));
    cases.push(renderCase('draw-alt-sliders-' + variant.key, worldData, hexId, { continental: 0.2, coastline: 0.9 }));
    cases.push(renderCase('draw-print-' + variant.key, worldData, hexId, { printMode: true }));
    return { legacy, cases, variantKey: variant.key };
}

function snapshotBody(body) {
    const keys = ['type', 'name', 'size', 'sType', 'uwp', 'atmCode', 'atm', 'atmosphere', 'hydroCode', 'hydro', 'hydrographics', 'hydrosphere', 'hydroPercent', 'meanTempK', 'avgSurfaceTemp', 'temperatureK', 'tempBand', 'orbitId', 'au', 'pd'];
    const out = {};
    for (const key of keys) if (body && Object.prototype.hasOwnProperty.call(body, key)) out[key] = body[key];
    return out;
}

function executeSurfaceCase(session, oracle, c) {
    if (c.kind === 'render') {
        return { id: c.id, kind: 'map', full: oracle.run(c.hexId, c.worldData, c) };
    }
    const eligible = session.legacy.canMapWorld(c.body);
    const worldData = session.legacy.worldMapData(c.body);
    const spec = session.legacy.diamondMapSpec(c.body, c.columnHex);
    if (!eligible || !spec) {
        return {
            id: c.id,
            kind: 'exclusion',
            eligible: false,
            columnHex: c.columnHex,
            body: snapshotBody(c.body),
            worldData,
            seed: spec ? spec.seed : null,
        };
    }
    return { id: c.id, kind: 'map', columnHex: c.columnHex, full: oracle.run(spec.seed, spec.worldData, c) };
}

function fixtureOf(executed) {
    if (executed.kind !== 'map') return executed;
    const summary = summarizeMap(executed.full);
    return executed.columnHex === undefined
        ? { id: executed.id, kind: 'map', ...summary }
        : { id: executed.id, kind: 'map', columnHex: executed.columnHex, ...summary };
}

export function runSurfaceCase(session, oracle, c) {
    return fixtureOf(executeSurfaceCase(session, oracle, c));
}

/** Full command trace and CDF for one case. Renders that case; nothing is stored. */
export function diagnoseSurfaceCase(session, oracle, id) {
    const c = session.cases.find((item) => item.id === id);
    if (!c) throw new Error('surface oracle: unknown case ' + id);
    const executed = executeSurfaceCase(session, oracle, c);
    if (executed.kind !== 'map') throw new Error('surface oracle: ' + id + ' has no trace');
    return {
        id,
        commands: executed.full.commands,
        cdf: Array.from(executed.full.cdf),
        summary: fixtureOf(executed),
    };
}
