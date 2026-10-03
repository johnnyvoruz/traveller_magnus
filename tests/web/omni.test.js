import assert from 'node:assert/strict';
import { test } from 'node:test';
import { rankResults, sectorMatches } from '../../apps/web/src/search/omni.ts';

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
