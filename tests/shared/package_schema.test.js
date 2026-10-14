import test from 'node:test';
import assert from 'node:assert/strict';
import {
    InstallPreview,
    InstallRequest,
    InstallRow,
    PackageCard,
    PackageCatalogueQuery,
    PackageManifest,
    PackageReport,
} from '@voyage/shared';

const MANIFEST = {
    format: 'voyage-package',
    schemaVersion: 1,
    packageId: 'pk_X',
    version: 1,
    kind: 'subsector',
    title: 'T',
    author: { id: 'u', handle: 'h' },
    edition: 'MgT2E',
    engineVersion: '1.2.0',
    truthVersion: 'v10',
    hexes: { 'Demo/0101': { baseHash: null, treeHash: 'a'.repeat(64) } },
    lists: { routes: 'r', borderPaths: 'b' },
    records: { contentHash: 'c', count: 0, imageHashes: [] },
    publishedAt: '2026-10-14T00:00:00.000Z',
};

test('an own-map manifest has a null truth version; a string still parses', () => {
    assert.equal(PackageManifest.parse({ ...MANIFEST, truthVersion: null }).truthVersion, null);
    assert.equal(PackageManifest.parse(MANIFEST).truthVersion, 'v10');
    assert.equal(PackageManifest.safeParse({ ...MANIFEST, truthVersion: undefined }).success, false);
});

test('the catalogue query trims, caps and knows three sorts', () => {
    assert.deepEqual(PackageCatalogueQuery.parse({ q: ' belt ', sort: 'installs' }), { q: 'belt', sort: 'installs' });
    assert.equal(PackageCatalogueQuery.safeParse({ sort: 'random' }).success, false);
    assert.equal(PackageCatalogueQuery.safeParse({ q: 'x'.repeat(101) }).success, false);
    assert.equal(PackageCatalogueQuery.safeParse({ mine: '0' }).success, false);
    assert.equal(PackageCatalogueQuery.safeParse({ page: '2' }).success, false);
});

test('a card adds installs, updatedAt and hidden to the listing', () => {
    const card = {
        id: 'pk_X', title: 'T', authorHandle: 'h', kind: 'k', truthVersion: null, edition: 'MgT2E',
        hexCount: 1, tags: [], latestVersion: 1, installs: 0, updatedAt: 'now', hidden: false,
    };
    assert.deepEqual(PackageCard.parse(card), card);
    assert.equal(PackageCard.safeParse({ ...card, installs: -1 }).success, false);
});

test('a report reason is 1 to 500 characters after trim', () => {
    assert.equal(PackageReport.parse({ reason: ' Spam. ' }).reason, 'Spam.');
    assert.equal(PackageReport.safeParse({ reason: '   ' }).success, false);
    assert.equal(PackageReport.safeParse({ reason: 'x'.repeat(501) }).success, false);
});

test('an install request is in place only and names theirs or mine', () => {
    const body = { packageId: 'pk_X', version: 1, resolutions: { 'Demo/0101': 'theirs' }, recordResolutions: {}, expect: { conflicts: 1 } };
    assert.deepEqual(InstallRequest.parse(body), body);
    assert.equal(InstallRequest.safeParse({ ...body, resolutions: { 'Demo/0101': 'both' } }).success, false);
    assert.equal(InstallRequest.safeParse({ ...body, placement: { anchor: 'Demo/0101', to: 'Demo/0201' } }).success, false);
});

test('the preview lists one outcome per hex and a null placement', () => {
    const preview = {
        packageId: 'pk_X', version: 1, placement: null,
        hexes: [{ from: 'Demo/0101', to: 'Demo/0101', outcome: 'replaces chart', removes: false, current: { name: 'A', uwp: '', treeHash: null } }],
        records: { add: 0, replace: 0, conflicts: [] }, bytes: 0, conflicts: 0,
    };
    assert.deepEqual(InstallPreview.parse(preview), preview);
    assert.equal(InstallPreview.safeParse({ ...preview, hexes: [{ ...preview.hexes[0], outcome: 'merged' }] }).success, false);
});

test('an import row says whether an update is available', () => {
    const row = {
        installId: 'in_X', packageId: 'pk_X', title: 'T', version: 1, latestVersion: 2, updateAvailable: true,
        placement: null, hexCount: 3, installedAt: 'a', updatedAt: 'b',
    };
    assert.deepEqual(InstallRow.parse(row), row);
});