import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { renderFlatMapPixels } from '../../apps/web/src/surface/vanilla/map.ts';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'surface');

function sha256(bytes) {
    return crypto.createHash('sha256').update(bytes).digest('hex');
}

/** Pre-overlay 800×400 RGBA against Agent B's committed oracle fixtures. */
test('vanilla flat map matches oracle pixel fixtures', { timeout: 180000 }, () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(DIR, 'manifest.json'), 'utf8'));
    const seen = new Set();
    let maps = 0;
    for (const id of manifest.caseIds) {
        const row = JSON.parse(fs.readFileSync(path.join(DIR, id + '.json'), 'utf8'));
        assert.equal(row.id, id);
        seen.add(id);
        if (row.kind !== 'map') {
            assert.equal(row.kind, 'exclusion', id);
            continue;
        }
        maps += 1;
        assert.equal(row.input.projection, 'diamond', id);
        assert.equal(row.width, 800, id);
        assert.equal(row.height, 400, id);
        const pixels = renderFlatMapPixels({
            worldData: row.input.worldData,
            imageSeed: row.input.hexId || '0000',
            masterSeed: row.input.masterSeed,
            continentalDefinition: row.input.continental,
            coastlineComplexity: row.input.coastline,
            printMode: row.input.printMode === true,
        });
        assert.equal(pixels.length, row.rgbaBytes, id);
        assert.equal(sha256(pixels), row.rgbaDigest, id);
        for (const probe of row.probes) {
            const index = (probe.y * row.width + probe.x) * 4;
            assert.deepEqual(
                [pixels[index], pixels[index + 1], pixels[index + 2], pixels[index + 3]],
                [probe.r, probe.g, probe.b, probe.a],
                id + ' ' + probe.tag,
            );
        }
    }
    for (const id of ['regina-w0', 'hydro-0', 'hydro-10', 'class-molten-heat', 'class-ice-vacuum', 'class-rock', 'exotic-A', 'draw-print-w0', 'draw-alt-sliders-w0', 'draw-alt-seed-w0']) {
        assert.equal(seen.has(id), true, id);
    }
    assert.equal(maps, manifest.renders);
});
