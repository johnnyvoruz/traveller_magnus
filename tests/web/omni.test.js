import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { entryResults, groupOf, packageResults, rankResults, sectorMatches, systemResults } from '../../apps/web/src/search/omni.ts';
import { clearRecent, recentResults, rememberRecent } from '../../apps/web/src/search/recent.ts';
import { forgetCatalogue, keep, keptPackages } from '../../apps/web/src/workspace/market/catalogue_memory.ts';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const omniBox = fs.readFileSync(path.join(root, 'apps/web/src/components/OmniBox.vue'), 'utf8');

function systems(names) {
    return names.map((name) => ({ kind: 'system', name, detail: '', sector: 'Spinward_Marches', hex: '1910' }));
}

test('omnibox ranking matches the legacy order and ignores accents', () => {
    const rows = systems(['Regina', 'Regis', 'New Regina']);
    assert.deepEqual(rankResults('regina', rows).map((row) => row.name), ['Regina', 'New Regina']);
    assert.deepEqual(rankResults('reg', rows).map((row) => row.name), ['Regina', 'Regis', 'New Regina']);
    assert.deepEqual(rankResults('new regina', rows).map((row) => row.name), ['New Regina']);
    assert.deepEqual(rankResults('regina march', rows).map((row) => row.name), []);
    assert.deepEqual(rankResults('regina', systems(['Régina'])).map((row) => row.name), ['Régina']);

    const many = systems(Array.from({ length: 41 }, (_item, index) => 'Regina ' + String(index).padStart(2, '0')));
    assert.equal(rankResults('regina', many).length, 40);
});

test('exact name, then a prefix, then the rest; the Spinward Marches leads a tie', () => {
    const manifest = {
        sectors: [
            { slug: 'Spinward_Marches', name: 'Spinward Marches', canonical: true },
            { slug: 'Daibei', name: 'Daibei', canonical: true },
            { slug: 'Mora', name: 'Mora', canonical: true },
        ],
    };
    const items = [
        { sectorSlug: 'Daibei', hex: '1230', name: 'Regiimaa', uwp: 'A123456-7' },
        { sectorSlug: 'Spinward_Marches', hex: '1911', name: 'New Regina', uwp: 'A123456-7' },
        { sectorSlug: 'Spinward_Marches', hex: '1910', name: 'Regina', uwp: 'A788899-C' },
        { sectorSlug: 'Spinward_Marches', hex: '3124', name: 'Mora', uwp: 'A788899-C' },
        { sectorSlug: 'Daibei', hex: '0101', name: 'Morann', uwp: 'A123456-7' },
    ];
    const worlds = systemResults(items, manifest, 'canonical');
    const sectors = sectorMatches('spinward', manifest, 'canonical');
    const rows = [...worlds, ...sectors];

    assert.deepEqual(rankResults('Regina', rows).map((row) => row.name), ['Regina', 'New Regina']);
    assert.deepEqual(rankResults('reg', rows).map((row) => row.name), ['Regina', 'Regiimaa', 'New Regina']);
    assert.deepEqual(rankResults('mora', rows).map((row) => row.name), ['Mora', 'Morann']);
    assert.deepEqual(rankResults('1910', rows).map((row) => row.name), ['Regina']);
    assert.deepEqual(sectorMatches('Spinward Marches', manifest, 'canonical').map((row) => row.name), ['Spinward Marches']);
    assert.match(omniBox, /Try a world, a sector, or a subsector\./);
    assert.match(omniBox, /x: null, y: null, z: null/);
});

test('sectorMatches finds Spinward Marches and skips non-canonical sectors on that layer', () => {
    const manifest = {
        sectors: [
            { slug: 'Spinward_Marches', name: 'Spinward Marches', canonical: true },
            { slug: 'Spinward_Reach', name: 'Spinward Reach', canonical: false },
            { slug: 'Deneb', name: 'Deneb', canonical: true },
        ],
    };
    const canonical = sectorMatches('spin', manifest, 'canonical').map((row) => row.sector);
    assert.deepEqual(canonical, ['Spinward_Marches']);
    const all = sectorMatches('spin', manifest, 'all').map((row) => row.sector);
    assert.deepEqual(all, ['Spinward Marches', 'Spinward Reach'].map((_name, index) => manifest.sectors[index].slug));
});

test('systemResults on the canonical layer keeps the canonical hit for one query', () => {
    const manifest = {
        sectors: [
            { slug: 'Spinward_Marches', name: 'Spinward Marches', canonical: true },
            { slug: 'Rigel', name: 'Rigel', canonical: false },
        ],
    };
    const items = [
        { sectorSlug: 'Spinward_Marches', hex: '2204', name: 'Rigel', uwp: 'A123456-7' },
        { sectorSlug: 'Rigel', hex: '3103', name: 'Rigel', uwp: 'A123456-7' },
        { sectorSlug: 'Missing', hex: '0101', name: 'Rigel', uwp: 'X000000-0' },
    ];
    assert.deepEqual(systemResults(items, manifest, 'canonical').map((row) => row.sector), ['Spinward_Marches']);
    assert.deepEqual(systemResults(items, manifest, 'all').map((row) => row.sector), ['Spinward_Marches', 'Rigel', 'Missing']);
});

test('a fuzzy name ranks after a contained word, and a missing word still matches nothing', () => {
    const rows = systems(['Regina', 'Regis', 'New Regina']);
    assert.deepEqual(rankResults('rgna', rows).map((row) => row.name), ['New Regina', 'Regina']);
    assert.deepEqual(rankResults('regina march', rows).map((row) => row.name), []);
    const contained = rankResults('reg', rows).map((row) => row.name);
    const fuzzy = rankResults('rgn', rows).map((row) => row.name);
    assert.deepEqual(contained, ['Regina', 'Regis', 'New Regina']);
    assert.ok(fuzzy.includes('Regina'));
    assert.equal(fuzzy.includes('Regis'), false);
});

test('palette groups are Worlds, Records, Entries, Commands, Packages', () => {
    assert.equal(groupOf({ kind: 'system', name: 'Regina', detail: '', sector: 'Spinward_Marches', hex: '1910' }), 'Worlds');
    assert.equal(groupOf({ kind: 'sector', name: 'Spinward Marches', detail: 'Sector', sector: 'Spinward_Marches' }), 'Worlds');
    assert.equal(groupOf({ kind: 'record', name: 'A', detail: '', id: 'cr_1', thumb: null }), 'Records');
    assert.equal(groupOf({ kind: 'more', name: 'All 6 matches', detail: '', query: 'a' }), 'Records');
    assert.equal(groupOf({ kind: 'entry', name: 'Landfall', detail: 'Journal entry', id: 'cj_1' }), 'Entries');
    assert.equal(groupOf({ kind: 'command', name: 'Roll dice', detail: 'Command', id: 'roll-dice' }), 'Commands');
    assert.equal(groupOf({ kind: 'package', name: 'Regina Pack', detail: 'Package', id: 'pk_1' }), 'Packages');
    assert.equal(groupOf({ kind: 'example', name: 'Regina', detail: 'A world' }), 'Try');
});

test('journal titles match, deleted entries do not, and a hex id still matches the detail', () => {
    const entries = entryResults([
        { id: 'cj_1', title: 'Landfall on Regina', deleted: false },
        { id: 'cj_2', title: 'Empty port', deleted: true },
        { id: 'cj_3', title: '  ', deleted: false },
    ]);
    assert.deepEqual(rankResults('landfall', entries).map((row) => row.id), ['cj_1']);
    assert.deepEqual(rankResults('rgna', entries).map((row) => row.name), ['Landfall on Regina']);
    assert.equal(entries.find((row) => row.id === 'cj_3').name, 'Untitled');
    const world = { kind: 'system', name: 'Regina', detail: 'Spinward Marches 1910 · A788899-C', sector: 'Spinward_Marches', hex: '1910' };
    assert.deepEqual(rankResults('1910', [world]).map((row) => row.hex), ['1910']);
});

test('recent rows are newest first and stay in this session only', () => {
    clearRecent();
    const regina = { kind: 'system', name: 'Regina', detail: '', sector: 'Spinward_Marches', hex: '1910' };
    const mora = { kind: 'system', name: 'Mora', detail: '', sector: 'Spinward_Marches', hex: '3124' };
    rememberRecent(regina);
    rememberRecent(mora);
    rememberRecent(regina);
    rememberRecent({ kind: 'example', name: 'Regina', detail: 'A world' });
    assert.deepEqual(recentResults().map((row) => row.name), ['Regina', 'Mora']);
    clearRecent();
    assert.deepEqual(recentResults(), []);
});

test('packages in the palette are the ones this session already loaded', () => {
    forgetCatalogue();
    keep(
        { q: '', sort: 'new', mine: false, hidden: false, user: '' },
        { items: [{ id: 'pk_1', title: 'Regina Pack' }], nextCursor: null },
    );
    assert.deepEqual(packageResults(keptPackages()).map((row) => row.name), ['Regina Pack']);
    forgetCatalogue();
    assert.deepEqual(keptPackages(), []);
});
