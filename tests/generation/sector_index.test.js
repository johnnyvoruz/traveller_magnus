import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { buildSector } from '@voyage/generation';
import { SectorIndex, stable } from '@voyage/shared';
import { TRUTH_SEED, TRUTH_SETTINGS } from '../../tools/truth/settings.js';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const engineVersion = require('../../packages/engines/package.json').version;

test('Spinward Marches index matches SectorIndex and stores each chart row once', async () => {
    const tsv = fs.readFileSync(path.join(ROOT, 'universe/raw/Spinward_Marches.tsv'), 'utf8');
    const metadataXml = fs.readFileSync(path.join(ROOT, 'universe/raw/Spinward_Marches.xml'), 'utf8');
    const listed = JSON.parse(fs.readFileSync(path.join(ROOT, 'universe/raw/sectors.json'), 'utf8'))
        .sectors.find(sector => sector.slug === 'Spinward_Marches');
    const catalogue = {
        name: listed.name, x: listed.x, y: listed.y, tags: listed.tags, canonical: listed.canonical,
    };
    const started = Date.now();
    const built = await buildSector({
        slug: 'Spinward_Marches', tsv, metadataXml, pinned: { seed: TRUTH_SEED, settings: TRUTH_SETTINGS, engineVersion },
        version: 'v2', catalogue,
    });
    const elapsed = Date.now() - started;
    const parsed = SectorIndex.parse(built.index);
    assert.equal(parsed.slug, 'Spinward_Marches');
    assert.equal(parsed.truthVersion, 'v2');
    assert.deepEqual(parsed.tags, catalogue.tags);
    assert.equal(parsed.canonical, true);
    assert.equal(parsed.systems, 439);
    assert.equal(parsed.built, 439);
    assert.equal(parsed.partial, 0);
    let treeBytes = 0;
    let largest = 0;
    for (const [hex, entry] of Object.entries(built.index.hexes)) {
        assert.equal(Object.hasOwn(entry, 'summary'), false, hex);
        if (entry.tree) {
            const bytes = Buffer.byteLength(built.objects.get(entry.tree));
            treeBytes += bytes;
            if (bytes > largest) largest = bytes;
        }
    }
    const indexBytes = Buffer.byteLength(stable(built.index));
    console.log(JSON.stringify({
        indexBytes,
        trees: built.objects.size,
        treeBytes,
        avg: Math.round(treeBytes / built.objects.size),
        largest,
        elapsed,
    }));
});
