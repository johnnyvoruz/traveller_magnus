import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildSector, buildSectorSlice } from '@voyage/generation';
import { stable } from '@voyage/shared';
import { TRUTH_SEED, TRUTH_SETTINGS } from '../../tools/truth/settings.js';

const require = createRequire(import.meta.url);
const engineVersion = require('../../packages/engines/package.json').version;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function firstDiff(a, b, at) {
    if (Object.is(a, b)) return null;
    if (Array.isArray(a) || Array.isArray(b)) {
        if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return { path: at, buildSector: a, slices: b };
        for (let i = 0; i < a.length; i++) {
            const diff = firstDiff(a[i], b[i], `${at}[${i}]`);
            if (diff) return diff;
        }
        return null;
    }
    if (a && b && typeof a === 'object' && typeof b === 'object') {
        const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
        for (const key of keys) {
            if (!Object.prototype.hasOwnProperty.call(a, key) || !Object.prototype.hasOwnProperty.call(b, key)) {
                return { path: `${at}.${key}`, buildSector: a[key], slices: b[key] };
            }
            const diff = firstDiff(a[key], b[key], `${at}.${key}`);
            if (diff) return diff;
        }
        return null;
    }
    return { path: at, buildSector: a, slices: b };
}

test('Spinward Marches slices of 200 match buildSector', { timeout: 600000 }, async () => {
    const tsv = readFileSync(path.join(root, 'universe/raw/Spinward_Marches.tsv'), 'utf8');
    const xml = readFileSync(path.join(root, 'universe/raw/Spinward_Marches.xml'), 'utf8');
    const pinned = { seed: TRUTH_SEED, settings: { ...TRUTH_SETTINGS }, engineVersion };
    const full = await buildSector({ slug: 'Spinward_Marches', tsv, metadataXml: xml, pinned, version: 'v2' });
    const hexes = {};
    const chainRows = [];
    const objects = new Map();
    let offset = 0;
    let total = null;
    for (;;) {
        const slice = await buildSectorSlice({
            slug: 'Spinward_Marches', tsv, pinned, offset, limit: 200,
        });
        if (total == null) total = slice.total;
        else assert.equal(slice.total, total);
        chainRows.push(...slice.rows);
        for (const row of slice.rows) {
            assert.equal(Object.hasOwn(hexes, row.hex), false, row.hex);
            hexes[row.hex] = row.indexEntry;
        }
        for (const [hash, json] of slice.objects) {
            if (objects.has(hash)) assert.equal(objects.get(hash), json);
            objects.set(hash, json);
        }
        if (slice.nextOffset == null) {
            assert.equal(offset + slice.rows.length, slice.total);
            break;
        }
        assert.equal(slice.nextOffset, offset + 200);
        offset = slice.nextOffset;
    }
    assert.equal(Object.keys(hexes).length, Object.keys(full.index.hexes).length);
    const diff = firstDiff(full.index.hexes, hexes, 'hexes');
    assert.equal(diff, null, JSON.stringify(diff));
    assert.equal(stable(hexes), stable(full.index.hexes));
    assert.equal(objects.size, full.objects.size);
    for (const [hash, json] of full.objects) assert.equal(objects.get(hash), json, hash);

    const wide = await buildSectorSlice({
        slug: 'Spinward_Marches', tsv, pinned, offset: 0, limit: 1000000,
    });
    assert.equal(wide.nextOffset, null);
    assert.equal(wide.rows.length, chainRows.length);
    for (let i = 0; i < chainRows.length; i++) {
        assert.equal(wide.rows[i].hex, chainRows[i].hex, wide.rows[i].hex);
        const rowDiff = firstDiff(chainRows[i].indexEntry, wide.rows[i].indexEntry, chainRows[i].hex);
        assert.equal(rowDiff, null, JSON.stringify(rowDiff));
    }
    assert.equal(wide.objects.size, objects.size);
    for (const [hash, json] of objects) assert.equal(wide.objects.get(hash), json, hash);

    const alone = await buildSectorSlice({
        slug: 'Spinward_Marches', tsv, pinned, offset, limit: 200,
    });
    const tail = wide.rows.slice(offset);
    assert.equal(alone.rows.length, tail.length);
    for (let i = 0; i < tail.length; i++) {
        assert.equal(alone.rows[i].hex, tail[i].hex, alone.rows[i].hex);
        const rowDiff = firstDiff(tail[i].indexEntry, alone.rows[i].indexEntry, tail[i].hex);
        assert.equal(rowDiff, null, JSON.stringify(rowDiff));
    }
});
