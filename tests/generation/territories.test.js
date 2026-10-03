import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseMetadataXml, stable } from '@voyage/shared';
import { assembleSectorIndex, sectorTerritories } from '@voyage/generation';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const RAW = path.join(ROOT, 'universe/raw');
const FIX = path.join(ROOT, 'tests/golden/fixtures');
const SLUGS = ['Spinward_Marches', 'Empty_Quarter', 'Solomani_Rim', 'Riftspan_Reaches', 'Verge', 'Gvurrdon'];

function inputOf(slug) {
    const meta = parseMetadataXml(fs.readFileSync(path.join(RAW, `${slug}.xml`), 'utf8'));
    return { borders: meta.borders, allegiances: meta.allegiances, stylesheet: meta.stylesheet };
}

function firstDifference(actual, expected) {
    const n = Math.max(actual.length, expected.length);
    for (let i = 0; i < n; i++) {
        const a = actual[i];
        const e = expected[i];
        if (!a || !e) {
            const name = (a || e).name;
            return { territory: name, hex: null, detail: `territory count ${actual.length} vs ${expected.length} at ${name}` };
        }
        const aHex = new Set(a.hexes);
        const eHex = new Set(e.hexes);
        let hex = null;
        for (const h of a.hexes) if (!eHex.has(h)) { hex = h; break; }
        if (hex === null) for (const h of e.hexes) if (!aHex.has(h)) { hex = h; break; }
        const sameMeta = a.id === e.id && a.name === e.name && a.color === e.color
            && stable(a.allegianceCodes) === stable(e.allegianceCodes);
        if (!sameMeta || hex !== null) return { territory: a.name, hex, detail: `port ${a.name} (${a.hexes.length}) vs fixture ${e.name} (${e.hexes.length})` };
    }
    return null;
}

for (const slug of SLUGS) {
    test(`borders_${slug} matches the legacy fixture, territory then hex`, () => {
        const actual = sectorTerritories(inputOf(slug));
        const expected = JSON.parse(fs.readFileSync(path.join(FIX, `borders_${slug}.json`), 'utf8')).territories;
        const diff = firstDifference(actual, expected);
        assert.equal(diff, null, diff ? `${slug}: territory ${diff.territory} hex ${diff.hex} (${diff.detail})` : '');
        assert.equal(stable({ territories: actual }), fs.readFileSync(path.join(FIX, `borders_${slug}.json`), 'utf8'));
    });
}

test('Spinward Marches hexes are in-sector and belong to one territory', () => {
    const territories = sectorTerritories(inputOf('Spinward_Marches'));
    const seen = new Set();
    for (const territory of territories) {
        for (const hex of territory.hexes) {
            assert.match(hex, /^(0[1-9]|[12][0-9]|3[0-2])(0[1-9]|[1-3][0-9]|40)$/);
            assert.equal(seen.has(hex), false, hex);
            seen.add(hex);
        }
    }
});

test('Empty Quarter weak umbrella keeps fewer hexes than the polities that reclaimed it', () => {
    const input = inputOf('Empty_Quarter');
    const byCode = new Map();
    for (const border of input.borders) {
        const code = (border.Allegiance || '').trim();
        if (!byCode.has(code)) byCode.set(code, []);
        byCode.get(code).push((border.ShowLabel || '').toLowerCase() === 'false');
    }
    const weakOnly = [...byCode].filter(([, flags]) => flags.length > 0 && flags.every(Boolean)).map(([code]) => code);
    assert.deepEqual(weakOnly, ['JuPr']);
    const territories = sectorTerritories(input);
    const fixture = JSON.parse(fs.readFileSync(path.join(FIX, 'borders_Empty_Quarter.json'), 'utf8')).territories;
    const count = (list, code) => list.find(t => t.allegianceCodes.includes(code)).hexes.length;
    assert.equal(count(territories, 'JuPr'), count(fixture, 'JuPr'));
    assert.equal(count(territories, 'JuPr'), 0);
    assert.equal(count(territories, 'JuRu'), 183);
    assert.equal(count(territories, 'JuHl'), 210);
    assert.ok(count(territories, 'JuPr') < count(territories, 'JuRu'));
    assert.ok(count(territories, 'JuPr') < count(territories, 'JuHl'));
});

test('Empty Quarter index drops the zero-hex umbrella the port still returns', () => {
    const xml = fs.readFileSync(path.join(RAW, 'Empty_Quarter.xml'), 'utf8');
    const input = inputOf('Empty_Quarter');
    const fromPort = sectorTerritories(input);
    assert.ok(fromPort.some(territory => territory.name === 'Julian Protectorate' && territory.hexes.length === 0));
    const index = assembleSectorIndex({ slug: 'Empty_Quarter', version: 'v3', metadataXml: xml, hexes: {} });
    assert.equal(index.territories.some(territory => territory.name === 'Julian Protectorate' && territory.hexes.length === 0), false);
    assert.equal(index.territories.some(territory => territory.allegianceCodes.includes('JuPr')), false);
});

test('no borders returns an empty list', () => {
    assert.deepEqual(sectorTerritories({ borders: [], allegiances: [], stylesheet: '' }), []);
});

test('sectorTerritories is pure', () => {
    const input = inputOf('Spinward_Marches');
    const snapshot = structuredClone(input);
    const first = sectorTerritories(input);
    const second = sectorTerritories(input);
    assert.deepEqual(first, second);
    assert.deepEqual(input, snapshot);
});
