// Locks the in-memory PlanetGL readback. js/ is not written.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { glRealmHtml, glSourceManifest, instrumentedPlanetGl, planetProfileBytes } from '../../apps/web/surface-parity-gl.ts';
import { backendOf, compareBytes, rgbaVaried, uniformZero } from '../../apps/web/src/dev/surface-parity/gl_bytes.ts';
import { GL_CASES, NEGATIVE_CASE, OCEAN_ALT_ID } from '../../apps/web/src/dev/surface-parity/gl_worlds.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function sha256(bytes) {
    return crypto.createHash('sha256').update(bytes).digest('hex');
}

test('GL harness anchors the unmodified legacy sources once', () => {
    const glRaw = fs.readFileSync(path.join(root, 'js', 'planet_gl.js'));
    const profileRaw = fs.readFileSync(path.join(root, 'js', 'planet_profile.js'));
    const manifest = glSourceManifest();
    assert.equal(manifest.planetGlSha256, sha256(glRaw));
    assert.equal(manifest.planetProfileSha256, sha256(profileRaw));
    assert.deepEqual(planetProfileBytes(), profileRaw);
    assert.deepEqual(manifest.insertions, [
        { id: 'stats-readback', count: 1 },
        { id: 'frozen-time', count: 1 },
        { id: 'capture-export', count: 1 },
    ]);
    const raw = glRaw.toString('utf8');
    assert.equal(raw.includes('__voyageGl'), false);
    assert.equal(raw.includes('voyage-gl-insert'), false);
    const served = instrumentedPlanetGl();
    for (const id of ['stats-readback', 'frozen-time', 'capture-export']) {
        const marker = 'voyage-gl-insert:' + id;
        assert.equal(served.split(marker).length, 2, marker);
    }
    assert.equal(served.split('gl.readPixels(0, 0, STATS_W, STATS_H * pending.length, gl.RGBA, gl.UNSIGNED_BYTE, pixels);').length, 2);
    assert.equal(served.split('(performance.now() / 1000) % 1000').length, 2);
    assert.equal(served.split('img.data[i * 4 + 3] = 255').length, 2);
    assert.equal(served.includes('capture,'), true);
    assert.equal(served.includes('function capture(id, key)'), true);
    const realm = glRealmHtml();
    assert.equal(realm.includes('.inspect('), false);
    assert.equal(realm.includes('planet_profile.js'), true);
    assert.equal(realm.includes('__voyageGlTime'), true);
});

test('GL byte compare matches the map harness mean', () => {
    const cmp = compareBytes([0, 0, 0, 0], [0, 2, 0, 0]);
    assert.equal(cmp.mismatches, 1);
    assert.equal(cmp.maxChannelError, 2);
    assert.equal(cmp.meanChannelError, 0.5);
    assert.equal(rgbaVaried([1, 2, 3, 4, 1, 2, 3, 4]), false);
    assert.equal(rgbaVaried([0, 0, 0, 0, 0, 0, 0, 0]), false);
    assert.equal(rgbaVaried([1, 0, 0, 255, 0, 1, 0, 255]), true);
    assert.equal(uniformZero([0, 0, 0, 0]), true);
    assert.equal(uniformZero([0, 0, 0, 1]), false);
    assert.equal(backendOf('ANGLE (NVIDIA, NVIDIA GeForce RTX 3080 Direct3D11 vs_5_0 ps_5_0, D3D11)'), 'd3d11');
    assert.equal(backendOf('ANGLE (NVIDIA, D3D12)'), 'd3d12');
    assert.equal(backendOf('Google SwiftShader'), 'swiftshader');
    assert.equal(backendOf('llvmpipe'), 'llvmpipe');
    assert.equal(backendOf('Vulkan'), 'vulkan');
    assert.equal(backendOf('Apple Metal'), 'metal');
    assert.equal(backendOf('WebKit WebGL'), 'unlisted');
});

test('GL parity worlds cover the five families and a different surface id', () => {
    assert.deepEqual(GL_CASES.map((item) => item.expectedKind), ['ocean', 'desert', 'ice', 'gas', 'temperate']);
    assert.deepEqual(GL_CASES.map((item) => item.id), ['Ocean', 'Dry', 'Ice', 'Gas', 'Ringed']);
    assert.equal(GL_CASES.filter((item) => item.request.ring).length, 1);
    assert.equal(GL_CASES[4].request.ring.phase, 0.75);
    assert.equal(GL_CASES[4].request.frozenTime, 12.5);
    assert.equal(GL_CASES[4].request.sweep, 0);
    assert.equal(GL_CASES[4].request.samples, 1);
    assert.notEqual(OCEAN_ALT_ID, GL_CASES[0].surfaceId);
    assert.equal(OCEAN_ALT_ID.startsWith(GL_CASES[0].surfaceId), true);
    assert.equal(NEGATIVE_CASE.surfaceId, OCEAN_ALT_ID);
    assert.equal(NEGATIVE_CASE.body, GL_CASES[0].body);
});
