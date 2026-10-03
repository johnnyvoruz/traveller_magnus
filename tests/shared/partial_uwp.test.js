import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { parseT5Tab } from '@voyage/shared';
import { buildSector, generateHex } from '@voyage/generation';
import { TRUTH_SEED, TRUTH_SETTINGS } from '../../tools/truth/settings.js';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const engineVersion = require('../../packages/engines/package.json').version;
const pinned = { seed: TRUTH_SEED, settings: TRUTH_SETTINGS, engineVersion };

function loadSector(slug) {
    const tsv = fs.readFileSync(path.join(ROOT, 'universe/raw', `${slug}.tsv`), 'utf8');
    const metadataXml = fs.readFileSync(path.join(ROOT, 'universe/raw', `${slug}.xml`), 'utf8');
    return { tsv, metadataXml, rows: parseT5Tab(tsv) };
}

test('Caesillian C8858??-4 is a partial survey: size 8, government and law unknown', async () => {
    const { tsv, metadataXml, rows } = loadSector('Caesillian');
    const row = rows.get('0914');
    assert.equal(row.uwp, 'C8858??-4');
    assert.equal(row.partial, 'partial');
    assert.equal(row.t5Data.starport, 'C');
    assert.equal(row.t5Data.size, 8);
    assert.equal(row.t5Data.atm, 8);
    assert.equal(row.t5Data.hydro, 5);
    // Digits are C 8 8 5 8 ? ? - 4. Population is 8. The unknown digits are government and law.
    assert.equal(row.t5Data.pop, 8);
    assert.equal(row.t5Data.gov, null);
    assert.equal(row.t5Data.law, null);
    assert.equal(row.t5Data.tl, 4);
    assert.deepEqual(row.tradeCodes, ['Ga', 'Ph']);

    const built = await buildSector({ slug: 'Caesillian', tsv, metadataXml, pinned, version: 'v2' });
    assert.equal(built.objects.size, 0);
    assert.deepEqual(built.counts, { systems: 1, built: 0, partial: 1 });
    const hex = built.index.hexes['0914'];
    assert.equal(hex.tree, null);
    assert.equal(hex.uwp, 'C8858??-4');
    assert.equal(hex.partial, 'partial');
    assert.equal(Object.hasOwn(hex, 'summary'), false);
    assert.throws(
        () => generateHex({ hexKey: 'Caesillian/0914', edition: 'MgT2E', mode: 'flesh', summary: row, pinned }),
        /refusing partial UWP C8858\?\?-4 \(partial\)/,
    );
});

test('Just Empty ???????-? is fully unknown and builds no tree', async () => {
    const { tsv, metadataXml, rows } = loadSector('Just_Empty');
    const row = rows.get('1702');
    assert.equal(row.uwp, '???????-?');
    assert.equal(row.partial, 'full');
    // Starport stays the raw digit string. Every numeric UWP field is null.
    assert.equal(row.t5Data.starport, '?');
    for (const key of ['size', 'atm', 'hydro', 'pop', 'gov', 'law', 'tl']) {
        assert.equal(row.t5Data[key], null, key);
    }
    assert.equal(row.pbg, '???');
    assert.equal(row.beltCount, null);
    assert.equal(row.gasGiantCount, null);
    assert.equal(row.t5Data.popDigit, null);
    assert.equal(row.t5Data.planetoidBelts, null);
    assert.equal(row.t5Data.gasGiantsCount, null);
    assert.equal(row.t5Socio.popMultiplier, null);
    assert.equal(row.t5Socio.belts, null);
    assert.equal(row.t5Socio.gasGiants, null);

    const built = await buildSector({ slug: 'Just_Empty', tsv, metadataXml, pinned, version: 'v2' });
    assert.equal(built.objects.size, 0);
    assert.deepEqual(built.counts, { systems: 1, built: 0, partial: 1 });
    const hex = built.index.hexes['1702'];
    assert.equal(hex.tree, null);
    assert.equal(hex.uwp, '???????-?');
    assert.equal(hex.pbg, '???');
    assert.equal(hex.partial, 'full');
    assert.throws(
        () => generateHex({ hexKey: 'Just_Empty/1702', edition: 'MgT2E', mode: 'flesh', summary: row, pinned }),
        /refusing partial UWP \?\?\?\?\?\?\?-\? \(full\)/,
    );
});
