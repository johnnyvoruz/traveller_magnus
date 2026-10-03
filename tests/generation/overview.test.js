import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { buildSector, sectorOverview } from '@voyage/generation';
import { TruthOverview, stable } from '@voyage/shared';
import { TRUTH_SEED, TRUTH_SETTINGS } from '../../tools/truth/settings.js';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const engineVersion = require('../../packages/engines/package.json').version;
const pinned = { seed: TRUTH_SEED, settings: TRUTH_SETTINGS, engineVersion };

function catalogueOf(slug) {
    const listed = JSON.parse(fs.readFileSync(path.join(ROOT, 'universe/raw/sectors.json'), 'utf8'))
        .sectors.find(sector => sector.slug === slug);
    return { name: listed.name, x: listed.x, y: listed.y, tags: listed.tags, canonical: listed.canonical };
}

async function builtIndex(slug) {
    const tsv = fs.readFileSync(path.join(ROOT, 'universe/raw', `${slug}.tsv`), 'utf8');
    const metadataXml = fs.readFileSync(path.join(ROOT, 'universe/raw', `${slug}.xml`), 'utf8');
    const built = await buildSector({
        slug, tsv, metadataXml, pinned, version: 'v2', catalogue: catalogueOf(slug),
    });
    return built.index;
}

test('overview cells, a ? UWP, and stable bytes', async () => {
    const spinwardIndex = await builtIndex('Spinward_Marches');
    const emptyIndex = await builtIndex('Just_Empty');
    const spinward = sectorOverview(spinwardIndex);
    const empty = sectorOverview(emptyIndex);
    assert.equal(spinward.cells.length, 1280);
    let marked = 0;
    for (const ch of spinward.cells) if (ch !== '.') marked += 1;
    assert.equal(marked, 439);
    assert.equal(spinward.cells[729], 'A');
    assert.equal(empty.cells[(17 - 1) * 40 + (2 - 1)], '?');
    const first = stable({ truthVersion: 'v2', sectors: [spinward, empty] });
    const second = stable({ truthVersion: 'v2', sectors: [sectorOverview(spinwardIndex), sectorOverview(emptyIndex)] });
    assert.equal(first, second);
    const parsed = TruthOverview.parse(JSON.parse(first));
    assert.equal(parsed.sectors.length, 2);
    assert.equal(parsed.sectors[1].cells[641], '?');
});
