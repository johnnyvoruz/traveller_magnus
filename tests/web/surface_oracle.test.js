import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stable } from '../../packages/shared/src/stable.ts';
import {
    createSurfaceOracle, diagnoseSurfaceCase, loadSurfaceCases, runSurfaceCase, sourceManifest,
    surfaceCdfSha256, surfaceTraceSha256,
} from '../oracle/surface_map.js';

const DETACHED = ['regina-w0', 'regina-w5', 'exotic-A'];

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'surface');
const UPDATE = process.env.UPDATE_SURFACE === '1';

function assertText(a, b, id) {
    if (a === b) return;
    let i = 0;
    const n = Math.min(a.length, b.length);
    while (i < n && a.charCodeAt(i) === b.charCodeAt(i)) i++;
    assert.fail(id + ' differs at ' + i + ' (' + a.length + ' vs ' + b.length + '): '
        + JSON.stringify(a.slice(Math.max(0, i - 40), i + 80)));
}

function byId(rows) {
    const map = new Map();
    for (const row of rows) {
        if (map.has(row.id)) throw new Error('duplicate surface case ' + row.id);
        map.set(row.id, row);
    }
    return map;
}

function assertSphere(row) {
    const opaque = row.probes.filter((p) => p.a === 255).map((p) => p.x + ',' + p.y).sort();
    const got = row.projection.map((p) => p.px + ',' + p.py).sort();
    assert.deepEqual(got, opaque, row.id + ' projection keys');
    for (const p of row.projection) {
        const r2 = p.wx * p.wx + p.wy * p.wy + p.wz * p.wz;
        assert.ok(Math.abs(r2 - 1) < 1e-8, row.id + ' sphere ' + p.px + ',' + p.py);
    }
    for (const p of row.projection) {
        if (p.py === 0) assert.ok(p.lat > 1.4, row.id + ' north lat');
        if (p.py === 399) assert.ok(p.lat < -1.4, row.id + ' south lat');
    }
}

test('surface oracle is deterministic and matches fixtures', { timeout: 600000 }, () => {
    const t0 = performance.now();
    const session = loadSurfaceCases();
    const oracle = createSurfaceOracle();
    const liveManifest = sourceManifest();
    for (const row of liveManifest.insertions) assert.equal(row.count, 1, row.id);
    assert.equal(liveManifest.floatByteOrder, 'little');
    assert.equal(liveManifest.probeSites.length > 20, true);

    const results = [];
    let renders = 0;
    for (const c of session.cases) {
        const first = runSurfaceCase(session, oracle, c);
        results.push(first);
        if (first.kind === 'map') renders++;
    }
    const fresh = createSurfaceOracle();
    for (const id of DETACHED) {
        const diag = diagnoseSurfaceCase(session, fresh, id);
        assertText(stable(diag.summary), stable(results.find((row) => row.id === id)), id + ' fresh vm');
        assert.equal(diag.commands.length, diag.summary.commandsCount, id);
        assert.equal(surfaceTraceSha256(diag.commands), diag.summary.commandsSha256, id);
        assert.equal(diag.cdf.length, 2048, id);
        assert.equal(surfaceCdfSha256(diag.cdf), diag.summary.cdfSha256, id);
        assert.equal(diag.summary.commandsHead.length, 40, id);
        assert.equal(diag.summary.commandsTail.length, 10, id);
        assert.equal(diag.summary.cdfSamples.length, 16, id);
        assert.equal(diag.summary.cdfSamples[0].i, 0, id);
        assert.equal(diag.summary.cdfSamples[15].i, 2047, id);
    }
    const got = byId(results);
    const reginaMaps = results.filter((r) => r.id.startsWith('regina-') && r.kind === 'map' && !r.id.startsWith('regina-fullkey'));
    const reginaSkips = results.filter((r) => r.id.startsWith('regina-') && r.kind === 'exclusion');
    assert.ok(reginaMaps.length > 0, 'Regina eligible bodies');
    assert.ok(reginaSkips.length > 0, 'Regina exclusions');

    const wet = got.get('class-wet');
    const size0 = got.get('render-size-0');
    const key = session.variantKey;
    const regina = got.get('regina-' + key);
    for (const row of [wet, size0, regina, got.get('regina-fullkey-' + key)]) {
        assert.equal(row.kind, 'map');
        assert.equal(row.width, 800);
        assert.equal(row.height, 400);
        assert.equal(row.rgbaBytes, 800 * 400 * 4);
        assert.equal(row.grid.length, 32768);
        assert.equal(row.cdfSamples.length, 16);
        assert.equal(row.cdfSamples[0].i, 0);
        assert.equal(row.cdfSamples[15].i, 2047);
        assert.ok(row.seeds.length >= 3 && row.seeds.length <= 7);
        assert.equal(row.ops.putImageData, 1);
        assert.equal(row.commandsHead[0][0], 'clearRect');
        assert.equal(row.commandsHead.length, 40);
        assert.equal(row.commandsTail.length, 10);
        assert.ok(row.commandsCount > 40);
        assertSphere(row);
    }
    for (const tag of ['north-pole-0', 'north-pole-4', 'south-pole-0', 'south-pole-4', 'equator-centre', 'band-west', 'band-east']) {
        const probe = wet.probes.find((p) => p.tag === tag);
        assert.ok(probe, tag);
        assert.equal(probe.a, 255, tag);
    }
    for (const tag of ['north-gap', 'south-gap', 'north-join-gap']) {
        const probe = wet.probes.find((p) => p.tag === tag);
        assert.ok(probe, tag);
        assert.equal(probe.a, 0, tag);
    }
    assert.equal(wet.ops.clip, 1);
    assert.equal(wet.ops.save, 1);
    assert.equal(wet.ops.restore, 1);
    assert.ok(wet.ops.stroke > 11);
    assert.equal(size0.ops.stroke, 11);
    assert.equal(size0.ops.clip, undefined);
    assert.equal(size0.ops.save, undefined);
    assert.equal(wet.ops.fillRect, undefined);

    const printed = got.get('draw-print-' + key);
    assert.equal(printed.ops.fillRect, 1);
    assert.equal(printed.commandsCount, regina.commandsCount + 2);
    assert.ok(printed.commandsHead.some((cmd) => cmd[0] === 'fillStyle' && cmd[1] === '#ffffff'));
    assert.equal(printed.grid.digest, regina.grid.digest);
    assert.notEqual(got.get('draw-alt-seed-' + key).grid.digest, regina.grid.digest);
    assert.notEqual(got.get('draw-alt-seed-' + key).rgbaDigest, regina.rgbaDigest);
    assert.equal(got.get('draw-alt-sliders-' + key).grid.digest, regina.grid.digest);
    assert.notEqual(got.get('draw-alt-sliders-' + key).rgbaDigest, regina.rgbaDigest);
    assert.notEqual(got.get('regina-fullkey-' + key).rgbaDigest, regina.rgbaDigest);
    assert.notEqual(got.get('regina-fullkey-' + key).input.hexId, regina.input.hexId);

    assert.equal(got.get('hydro-0').grid.digest, got.get('hydro-10').grid.digest);
    assert.notEqual(got.get('hydro-0').rgbaDigest, got.get('hydro-10').rgbaDigest);
    assert.notEqual(got.get('hydro-F').rgbaDigest, got.get('hydro-10').rgbaDigest);
    assert.notEqual(got.get('exotic-A').rgbaDigest, got.get('ordinary-D').rgbaDigest);
    assert.notEqual(got.get('exotic-A').rgbaDigest, got.get('exotic-B').rgbaDigest);
    assert.notEqual(got.get('exotic-A').rgbaDigest, got.get('exotic-C').rgbaDigest);
    // At this seed B and C select the same chartreuse variant, so their sheets match.
    assert.equal(got.get('exotic-A').grid.digest, got.get('ordinary-F').grid.digest);
    assert.equal(got.get('digits-num').rgbaDigest, got.get('digits-str').rgbaDigest);
    assert.equal(got.get('digits-a-num').rgbaDigest, got.get('digits-a-str').rgbaDigest);
    assert.equal(got.get('name-unnamed').input.hexId, got.get('name-whitespace').input.hexId);
    assert.equal(got.get('name-unnamed').rgbaDigest, got.get('name-whitespace').rgbaDigest);
    assert.equal(got.get('name-twin-a').rgbaDigest, got.get('name-twin-b').rgbaDigest);
    assert.equal(got.get('name-twin-a').rgbaDigest, got.get('name-twin-ws').rgbaDigest);
    assert.notEqual(got.get('class-rock').rgbaDigest, got.get('class-wet').rgbaDigest);
    assert.notEqual(got.get('class-ice-vacuum').rgbaDigest, got.get('class-rock').rgbaDigest);
    assert.notEqual(got.get('class-molten-heat').rgbaDigest, got.get('class-rock').rgbaDigest);

    for (const row of results) {
        if (!row.id.startsWith('exclude-')) continue;
        assert.equal(row.kind, 'exclusion', row.id);
        assert.equal(row.eligible, false, row.id);
        assert.equal(row.seed, null, row.id);
    }

    fs.mkdirSync(DIR, { recursive: true });
    const manifest = {
        ...liveManifest,
        caseIds: results.map((r) => r.id),
        renders,
        exclusions: results.length - renders,
    };
    const manifestPath = path.join(DIR, 'manifest.json');
    if (UPDATE) fs.writeFileSync(manifestPath, stable(manifest));
    assertText(stable(manifest), fs.readFileSync(manifestPath, 'utf8'), 'manifest');
    let bytes = fs.statSync(manifestPath).size;
    for (const row of results) {
        const file = path.join(DIR, row.id + '.json');
        const text = stable(row);
        if (UPDATE) fs.writeFileSync(file, text);
        assertText(text, fs.readFileSync(file, 'utf8'), row.id);
        bytes += fs.statSync(file).size;
    }
    console.log('surface oracle cases=' + results.length
        + ' renders=' + renders
        + ' exclusions=' + (results.length - renders)
        + ' fixtureBytes=' + bytes
        + ' ms=' + (performance.now() - t0).toFixed(1));
});
