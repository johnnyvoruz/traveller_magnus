import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { BAKE_FRAG, FIELDS, NOISE, STATS_FRAG, VERT } from '../../apps/web/src/surface/vanilla/gl_shaders.ts';
import { cubeBytes, cubeSizeFor, evictIds, MEMORY_BUDGET, SIZES } from '../../apps/web/src/surface/vanilla/gl_bake.ts';
import { gasStats, percentile, seaShare, thresholdsFromStats } from '../../apps/web/src/surface/vanilla/gl_stats.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fixturePath = path.join(root, 'tests', 'web', 'fixtures', 'surface_gl.json');

function sha256(bytes) {
    return crypto.createHash('sha256').update(bytes).digest('hex');
}

function grab(text, name) {
    const token = 'const ' + name + ' = `';
    const start = text.indexOf(token);
    assert.notEqual(start, -1, name);
    const from = start + token.length;
    const end = text.indexOf('`;', from);
    assert.notEqual(end, -1, name);
    return text.slice(from, end);
}

test('orbit disc shaders match js/planet_gl.js', () => {
    const text = fs.readFileSync(path.join(root, 'js', 'planet_gl.js'), 'utf8').replace(/\r\n/g, '\n');
    const noise = grab(text, 'NOISE');
    const fields = grab(text, 'FIELDS');
    assert.equal(VERT, grab(text, 'VERT'));
    assert.equal(NOISE, noise);
    assert.equal(FIELDS, fields);
    const stats = grab(text, 'STATS_FRAG')
        .replaceAll('${NOISE}', noise)
        .replaceAll('${FIELDS}', fields)
        .replaceAll('${STATS_H}', '64')
        .replaceAll('${STATS_W}', '128');
    assert.equal(STATS_FRAG, stats);
    const bake = grab(text, 'BAKE_FRAG').replaceAll('${NOISE}', noise).replaceAll('${FIELDS}', fields);
    assert.equal(BAKE_FRAG, bake);
    for (const call of [
        'smoothstep(0.35, 0.0, pc.x)',
        'smoothstep(uStorm.w, uStorm.w * 0.35, r)',
        'smoothstep(-6.0, -14.0, localC)',
        'smoothstep(-8.0, -16.0, localC)',
        'smoothstep(uSea, uSea - 0.05, h)',
        'smoothstep(0.05, 0.0, hs.x)',
        'smoothstep(0.08, 0.0, e)',
        'smoothstep(0.35, 0.0, w.x)',
    ]) assert.ok(BAKE_FRAG.includes(call), call);
});

test('cube size and cube memory', () => {
    assert.deepEqual([...SIZES], [32, 64, 128, 256, 512, 1024]);
    assert.equal(cubeSizeFor(0), 32);
    assert.equal(cubeSizeFor(25.6), 32);
    assert.equal(cubeSizeFor(25.6001), 64);
    assert.equal(cubeSizeFor(80), 128);
    assert.equal(cubeSizeFor(400), 512);
    assert.equal(cubeSizeFor(409.6), 512);
    assert.equal(cubeSizeFor(409.6001), 1024);
    assert.equal(cubeSizeFor(10000), 1024);
    assert.equal(MEMORY_BUDGET, 320 * 1024 * 1024);
    assert.equal(cubeBytes(32), 65536);
    assert.equal(cubeBytes(64), 262144);
    assert.equal(cubeBytes(128), 1048576);
    assert.equal(cubeBytes(256), 4194304);
    assert.equal(cubeBytes(512), 16777216);
    assert.equal(cubeBytes(1024), 67108864);
    assert.equal(cubeBytes(1024) * 5, MEMORY_BUDGET);

    const big = cubeBytes(1024);
    const frame = 6;
    const worlds = [1, 2, 3, 4, 5].map((lastFrame) => ({
        id: 'w' + lastFrame,
        lastFrame,
        bytes: big,
        jobBytes: 0,
    }));
    worlds.push({ id: 'live', lastFrame: frame, bytes: big, jobBytes: 0 });
    assert.deepEqual(evictIds(big * 6, frame, worlds), ['w1']);
    assert.deepEqual(evictIds(big * 7, frame, worlds), ['w1', 'w2']);
    assert.deepEqual(evictIds(big * 6, 1, [{ id: 'live', lastFrame: 1, bytes: big * 6, jobBytes: 0 }]), []);
    assert.deepEqual(evictIds(big * 7, 2, [
        { id: 'old', lastFrame: 1, bytes: big * 4, jobBytes: big * 2 },
        { id: 'live', lastFrame: 2, bytes: big, jobBytes: 0 },
    ]), ['old']);
    assert.deepEqual(evictIds(MEMORY_BUDGET, frame, worlds), []);
});

test('statistics decode matches the legacy capture', () => {
    const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    const seen = new Set();
    for (const row of fixture.worlds) {
        seen.add(row.id);
        if (row.id === 'Gas') {
            assert.equal(row.statsBase64, null);
            assert.equal(row.statsSha256, null);
            assert.deepEqual(row.thresholds, gasStats());
            assert.deepEqual(gasStats(), { sea: 0, cloudEdge: 1 });
            continue;
        }
        const pixels = new Uint8Array(Buffer.from(row.statsBase64, 'base64'));
        assert.equal(pixels.length, 128 * 64 * 4, row.id);
        assert.equal(sha256(pixels), row.statsSha256, row.id);
        const decoded = thresholdsFromStats(row.profile, pixels);
        assert.equal(decoded.sea, row.thresholds.sea, row.id);
        assert.equal(decoded.cloudEdge, row.thresholds.cloudEdge, row.id);
        assert.equal(decoded.urbanEdge, row.thresholds.urbanEdge, row.id);
        assert.deepEqual(decoded.port, row.thresholds.port, row.id);

        const per = 128 * 64;
        const heights = new Float32Array(per);
        const clouds = new Float32Array(per);
        for (let k = 0; k < per; k++) {
            heights[k] = (pixels[k * 4] / 255 - 0.1) / 0.8;
            clouds[k] = pixels[k * 4 + 1] / 255;
        }
        const byHeight = Float32Array.from(heights).sort();
        clouds.sort();
        assert.equal(percentile(byHeight, seaShare(row.profile)), row.thresholds.sea, row.id + ' sea');
        assert.equal(percentile(clouds, 1 - row.profile.clouds.cover), row.thresholds.cloudEdge, row.id + ' cloud');
    }
    assert.deepEqual([...seen], ['Ocean', 'Dry', 'Ice', 'Gas', 'Ringed']);
    assert.equal(percentile(new Float32Array(), 0.25), 0.5);
    const sample = Float32Array.from([1, 2, 3, 4]);
    assert.equal(percentile(sample, 0), 1);
    assert.equal(percentile(sample, 1), 4);
    assert.equal(percentile(sample, 0.5), 2);
});
