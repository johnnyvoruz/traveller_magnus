// Dev-server instrumentation for the legacy GL parity page.
// js/planet_gl.js and js/planet_profile.js are read from disk and never written.
// Anchors are applied to an in-memory copy. The sha256 is of the original bytes.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PLANET_GL = path.join(repoRoot, 'js', 'planet_gl.js');
const PLANET_PROFILE = path.join(repoRoot, 'js', 'planet_profile.js');

const STATS_ANCHOR = '        gl.readPixels(0, 0, STATS_W, STATS_H * pending.length, gl.RGBA, gl.UNSIGNED_BYTE, pixels);\n';
const TIME_ANCHOR = '            gl.uniform1f(u.uTime, (performance.now() / 1000) % 1000);\n';
const RETURN_ANCHOR = '    return { available, render, tile, clear, inspect, paintBackdrop, axisBasis, HALO, ids: () => [...worlds.keys()],\n';

const INSERTIONS = [
    { id: 'stats-readback', count: 1 as const },
    { id: 'frozen-time', count: 1 as const },
    { id: 'capture-export', count: 1 as const },
];

export type GlSourceManifest = {
    planetGlSha256: string;
    planetProfileSha256: string;
    insertions: { id: string; count: 1 }[];
};

function sha256(bytes: Buffer | string): string {
    return crypto.createHash('sha256').update(bytes).digest('hex');
}

function once(src: string, anchor: string, id: string): number {
    const at = src.indexOf(anchor);
    if (at < 0) throw new Error('surface GL anchor missing: ' + id);
    if (src.indexOf(anchor, at + anchor.length) !== -1) throw new Error('surface GL anchor duplicated: ' + id);
    return at;
}

function readText(file: string): { raw: Buffer; text: string } {
    const raw = fs.readFileSync(file);
    let text = raw.toString('utf8');
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    text = text.replace(/\r\n/g, '\n');
    return { raw, text };
}

function insertAfter(src: string, anchor: string, id: string, extra: string): string {
    const at = once(src, anchor, id);
    const cut = at + anchor.length;
    return src.slice(0, cut) + extra + src.slice(cut);
}

function replaceOnce(src: string, anchor: string, id: string, next: string): string {
    const at = once(src, anchor, id);
    return src.slice(0, at) + next + src.slice(at + anchor.length);
}

const STATS_INSERT = [
    '        /* voyage-gl-insert:stats-readback */',
    '        if (globalThis.__voyageGlStats) {',
    '            const __voyagePer = STATS_W * STATS_H * 4;',
    '            for (let __voyageI = 0; __voyageI < pending.length; __voyageI++) {',
    '                globalThis.__voyageGlStats.set(pending[__voyageI].profile.id, pixels.slice(__voyageI * __voyagePer, (__voyageI + 1) * __voyagePer));',
    '            }',
    '        }',
    '',
].join('\n');

const TIME_INSERT = [
    '            /* voyage-gl-insert:frozen-time */',
    '            const __voyageTime = (typeof globalThis.__voyageGlTime === \'number\') ? globalThis.__voyageGlTime : ((performance.now() / 1000) % 1000);',
    '            globalThis.__voyageGlTimeUsed = __voyageTime;',
    '            gl.uniform1f(u.uTime, __voyageTime);',
    '',
].join('\n');

const CAPTURE_FN = [
    '    /* voyage-gl-insert:capture-export */',
    '    function capture(id, key) {',
    '        const world = worlds.get(id);',
    '        if (!world) throw new Error(\'capture: missing world \' + id);',
    '        if (!gl) throw new Error(\'capture: no context\');',
    '        const placed = tiles.get(key);',
    '        if (!placed) throw new Error(\'capture: missing tile \' + key);',
    '        const fbo = gl.createFramebuffer();',
    '        const pack = gl.getParameter(gl.PACK_ALIGNMENT);',
    '        const cubes = {};',
    '        function readFaces(texture, size, level) {',
    '            const faces = [];',
    '            for (let face = 0; face < 6; face++) {',
    '                gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_CUBE_MAP_POSITIVE_X + face, texture, level);',
    '                gl.drawBuffers([gl.COLOR_ATTACHMENT0]);',
    '                gl.readBuffer(gl.COLOR_ATTACHMENT0);',
    '                const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);',
    '                if (status !== gl.FRAMEBUFFER_COMPLETE) throw new Error(\'capture: incomplete framebuffer \' + size + \' \' + level + \' \' + face + \' \' + status);',
    '                const facePx = new Uint8Array(size * size * 4);',
    '                gl.readPixels(0, 0, size, size, gl.RGBA, gl.UNSIGNED_BYTE, facePx);',
    '                faces.push(facePx);',
    '            }',
    '            return faces;',
    '        }',
    '        function readPair(cube, level) {',
    '            const size = cube.size >> level;',
    '            return { a: readFaces(cube.a, size, level), b: readFaces(cube.b, size, level) };',
    '        }',
    '        try {',
    '            gl.pixelStorei(gl.PACK_ALIGNMENT, 1);',
    '            gl.finish();',
    '            gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);',
    '            for (const size of [32, 128, 512]) {',
    '                const cube = world.cubes.get(size);',
    '                if (!cube) {',
    '                    if (size === 512) continue;',
    '                    throw new Error(\'capture: missing cube \' + size);',
    '                }',
    '                cubes[size] = readPair(cube, 0);',
    '            }',
    '            const cube128 = world.cubes.get(128);',
    '            const mip128 = readPair(cube128, 1);',
    '            gl.bindFramebuffer(gl.FRAMEBUFFER, null);',
    '            gl.finish();',
    '            const glY = canvas.height - placed.sy - placed.size;',
    '            const tilePx = new Uint8Array(placed.size * placed.size * 4);',
    '            gl.readPixels(placed.sx, glY, placed.size, placed.size, gl.RGBA, gl.UNSIGNED_BYTE, tilePx);',
    '            const statsMap = globalThis.__voyageGlStats;',
    '            const stats = statsMap && statsMap.has(id) ? statsMap.get(id) : null;',
    '            const statsObj = world.stats;',
    '            let thresholds = null;',
    '            if (statsObj) {',
    '                thresholds = { sea: statsObj.sea, cloudEdge: statsObj.cloudEdge };',
    '                if (statsObj.urbanEdge !== undefined) thresholds.urbanEdge = statsObj.urbanEdge;',
    '                if (statsObj.port) thresholds.port = [statsObj.port[0], statsObj.port[1], statsObj.port[2]];',
    '            }',
    '            const debug = gl.getExtension(\'WEBGL_debug_renderer_info\');',
    '            return {',
    '                stats, cubes, mip128, thresholds, tile: tilePx, tileSize: placed.size,',
    '                timeUsed: globalThis.__voyageGlTimeUsed,',
    '                kind: world.profile.kind,',
    '                gpu: {',
    '                    vendor: String(gl.getParameter(gl.VENDOR) || \'\'),',
    '                    renderer: String(gl.getParameter(gl.RENDERER) || \'\'),',
    '                    version: String(gl.getParameter(gl.VERSION) || \'\'),',
    '                    unmaskedVendor: debug ? String(gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) || \'\') : \'\',',
    '                    unmaskedRenderer: debug ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) || \'\') : \'\'',
    '                }',
    '            };',
    '        } finally {',
    '            gl.bindFramebuffer(gl.FRAMEBUFFER, null);',
    '            gl.deleteFramebuffer(fbo);',
    '            gl.pixelStorei(gl.PACK_ALIGNMENT, pack);',
    '        }',
    '    }',
    '',
].join('\n');

/** In-memory PlanetGL with readback. The legacy inspect helper is left in place and is not called. */
export function instrumentedPlanetGl(): string {
    const { text } = readText(PLANET_GL);
    let src = insertAfter(text, STATS_ANCHOR, 'stats-readback', STATS_INSERT);
    src = replaceOnce(src, TIME_ANCHOR, 'frozen-time', TIME_INSERT);
    const at = once(src, RETURN_ANCHOR, 'capture-export');
    src = src.slice(0, at) + CAPTURE_FN + src.slice(at);
    src = replaceOnce(
        src,
        RETURN_ANCHOR,
        'capture-return',
        '    return { available, render, tile, clear, inspect, paintBackdrop, axisBasis, HALO, capture, ids: () => [...worlds.keys()],\n',
    );
    return src;
}

export function planetProfileBytes(): Buffer {
    return fs.readFileSync(PLANET_PROFILE);
}

export function glSourceManifest(): GlSourceManifest {
    const gl = fs.readFileSync(PLANET_GL);
    const profile = planetProfileBytes();
    instrumentedPlanetGl();
    return {
        planetGlSha256: sha256(gl),
        planetProfileSha256: sha256(profile),
        insertions: INSERTIONS.map((item) => ({ id: item.id, count: item.count })),
    };
}

export function glRealmHtml(): string {
    return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"></head>
<body>
<script src="/dev/surface-parity/gl/planet_profile.js"></script>
<script src="/dev/surface-parity/gl/planet_gl.js"></script>
<script>
var session = null;
function glRequest(profile, request) {
    return {
        key: request.key,
        profile: profile,
        radius: request.radius,
        spin: request.spin,
        cloudSpin: request.cloudSpin,
        sweep: request.sweep,
        samples: request.samples,
        ring: request.ring,
        tilt: request.tilt,
        light: request.light,
        sun: request.sun,
        casters: request.casters,
        lightMode: request.lightMode,
        scale: request.scale
    };
}
window.beginGl = function (body, id, request) {
    if (typeof request.frozenTime === 'number') globalThis.__voyageGlTime = request.frozenTime;
    globalThis.__voyageGlStats = new Map();
    if (!window.PlanetGL || !window.PlanetGL.available()) return { error: 'WebGL2 is not available' };
    window.PlanetGL.clear();
    var profile = window.PlanetProfile.of(body, id);
    session = { id: id, key: request.key, req: glRequest(profile, request), profile: profile };
    return { profileJson: JSON.stringify(profile), kind: profile.kind };
};
window.stepGl = function (radius) {
    if (!session) throw new Error('GL session was not started');
    session.req.radius = radius;
    window.PlanetGL.render([session.req]);
    var world = window.PlanetGL.world(session.id);
    return { pending: !!(world && world.job) };
};
window.readGl = function () {
    if (!session) throw new Error('GL session was not started');
    var world = window.PlanetGL.world(session.id);
    if (!world || world.job || !world.cubes.has(32) || !world.cubes.has(128)) {
        throw new Error('cube maps 32 and 128 were not finished');
    }
    var shot = window.PlanetGL.capture(session.id, session.key);
    function bytes(view) { return view ? Array.from(view) : null; }
    function cubeOf(size) {
        var cube = shot.cubes[size];
        if (!cube) return null;
        return { a: cube.a.map(bytes), b: cube.b.map(bytes) };
    }
    return {
        profileJson: JSON.stringify(session.profile),
        kind: shot.kind,
        timeUsed: shot.timeUsed,
        stats: bytes(shot.stats),
        thresholds: shot.thresholds,
        cube32: cubeOf(32),
        cube128: cubeOf(128),
        cube512: cubeOf(512),
        mip128: { a: shot.mip128.a.map(bytes), b: shot.mip128.b.map(bytes) },
        tile: bytes(shot.tile),
        tileSize: shot.tileSize,
        gpu: shot.gpu
    };
};
</script>
</body>
</html>
`;
}
