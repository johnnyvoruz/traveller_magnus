import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseMetadataXml, SectorIndex, stable } from '@voyage/shared';
import { assembleSectorIndex, sectorRegions } from '@voyage/generation';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const RAW = path.join(ROOT, 'universe/raw');
const FIX = path.join(ROOT, 'tests/golden/fixtures');
const SLUGS = ['Riftspan_Reaches', 'Kalash', 'Afawahisa'];
const HEX = /^(0[1-9]|[12][0-9]|3[0-2])(0[1-9]|[1-3][0-9]|40)$/;

function regionsOf(slug) {
    const meta = parseMetadataXml(fs.readFileSync(path.join(RAW, `${slug}.xml`), 'utf8'));
    return sectorRegions({ regions: meta.regions });
}

function firstDifference(actual, expected) {
    const n = Math.max(actual.length, expected.length);
    for (let i = 0; i < n; i++) {
        const a = actual[i];
        const e = expected[i];
        if (!a || !e) {
            const name = (a || e).name;
            return { region: name, hex: null, detail: `region count ${actual.length} vs ${expected.length} at ${name}` };
        }
        const eHex = new Set(e.hexes);
        const aHex = new Set(a.hexes);
        let hex = null;
        for (const h of a.hexes) if (!eHex.has(h)) { hex = h; break; }
        if (hex === null) for (const h of e.hexes) if (!aHex.has(h)) { hex = h; break; }
        const sameMeta = a.name === e.name && a.color === e.color;
        if (!sameMeta || hex !== null) return { region: a.name, hex, detail: `port ${a.name} (${a.hexes.length}) vs fixture ${e.name} (${e.hexes.length})` };
    }
    return null;
}

for (const slug of SLUGS) {
    test(`regions_${slug} matches the legacy fixture, region then hex`, () => {
        const actual = regionsOf(slug);
        const expected = JSON.parse(fs.readFileSync(path.join(FIX, `regions_${slug}.json`), 'utf8')).regions;
        const diff = firstDifference(actual, expected);
        assert.equal(diff, null, diff ? `${slug}: region ${diff.region} hex ${diff.hex} (${diff.detail})` : '');
        assert.equal(stable({ regions: actual }), fs.readFileSync(path.join(FIX, `regions_${slug}.json`), 'utf8'));
    });

    test(`regions_${slug} hexes are in-sector`, () => {
        for (const region of regionsOf(slug)) {
            for (const hex of region.hexes) assert.match(hex, HEX, `${region.name} ${hex}`);
        }
    });

    test(`regions_${slug} index drops empty regions and parses`, () => {
        const xml = fs.readFileSync(path.join(RAW, `${slug}.xml`), 'utf8');
        const index = assembleSectorIndex({ slug, version: 'v3', metadataXml: xml, hexes: {} });
        const parsed = SectorIndex.parse(index);
        const fromPort = regionsOf(slug);
        assert.deepEqual(parsed.regions, fromPort.filter(region => region.hexes.length > 0));
    });
}

test('no regions returns an empty list', () => {
    assert.deepEqual(sectorRegions({ regions: [] }), []);
});

test('sectorRegions is pure', () => {
    const meta = parseMetadataXml(fs.readFileSync(path.join(RAW, 'Kalash.xml'), 'utf8'));
    const input = { regions: meta.regions };
    const snapshot = structuredClone(input);
    const first = sectorRegions(input);
    const second = sectorRegions(input);
    assert.deepEqual(first, second);
    assert.deepEqual(input, snapshot);
});

test('assembleSectorIndex drops a region left with no hexes', () => {
    const xml = '<Sector><Name>T</Name><X>0</X><Y>0</Y><Regions>'
        + '<Region Label="First" Color="red">1507</Region>'
        + '<Region Label="Second" Color="red">1507</Region>'
        + '</Regions></Sector>';
    const fromPort = sectorRegions({ regions: parseMetadataXml(xml).regions });
    assert.deepEqual(fromPort.map(region => region.name), ['Second']);
    assert.deepEqual(fromPort[0].hexes, ['1507']);
    const index = assembleSectorIndex({ slug: 'T', version: 'v3', metadataXml: xml, hexes: {} });
    assert.deepEqual(SectorIndex.parse(index).regions, fromPort);
});
