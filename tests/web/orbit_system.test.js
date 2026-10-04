import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildSector } from '@voyage/generation';
import { TRUTH_SEED, TRUTH_SETTINGS } from '../../tools/truth/settings.js';
import { normalizeSystem } from '../../apps/web/src/orbit/system.ts';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const engineVersion = require('../../packages/engines/package.json').version;

function catalogue(slug) {
    const listed = JSON.parse(fs.readFileSync(path.join(ROOT, 'universe/raw/sectors.json'), 'utf8'))
        .sectors.find((sector) => sector.slug === slug);
    return { name: listed.name, x: listed.x, y: listed.y, tags: listed.tags, canonical: listed.canonical };
}

test('Regina normalises as MgT2E and a body with no mgtSystem is null', async () => {
    const marches = await buildSector({
        slug: 'Spinward_Marches',
        tsv: fs.readFileSync(path.join(ROOT, 'universe/raw/Spinward_Marches.tsv'), 'utf8'),
        metadataXml: fs.readFileSync(path.join(ROOT, 'universe/raw/Spinward_Marches.xml'), 'utf8'),
        pinned: { seed: TRUTH_SEED, settings: TRUTH_SETTINGS, engineVersion },
        version: 'v2',
        catalogue: catalogue('Spinward_Marches'),
    });
    const regina = marches.index.hexes['1910'];
    assert.ok(regina.tree);
    const tree = JSON.parse(marches.objects.get(regina.tree));
    const sys = normalizeSystem(tree.body);
    assert.ok(sys);
    assert.equal(sys.edition, 'MgT2E');
    const mainworld = (sys.worlds || []).some((world) => world.type === 'Mainworld'
        || (world.moons || []).some((moon) => moon.type === 'Mainworld'));
    assert.equal(mainworld, true);
    assert.equal(Number.isFinite(sys.hzAU), true);

    assert.equal(normalizeSystem({}), null);
    assert.equal(normalizeSystem({ ctSystem: { stars: [{ name: 'Sol' }] } }), null);
});
