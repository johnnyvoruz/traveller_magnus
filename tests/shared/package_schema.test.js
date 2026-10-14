import test from 'node:test';
import assert from 'node:assert/strict';
import {
    CampaignProvenance,
    InstallPreview,
    InstallRestored,
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

test('an install request names theirs or mine, and a placement or an import to update, not both', () => {
    const body = { packageId: 'pk_X', version: 1, resolutions: { 'Demo/0101': 'theirs' }, recordResolutions: {}, expect: { conflicts: 1 } };
    assert.deepEqual(InstallRequest.parse(body), body);
    assert.equal(InstallRequest.safeParse({ ...body, resolutions: { 'Demo/0101': 'both' } }).success, false);
    const placed = { ...body, placement: { anchor: 'Demo/0101', to: '~slot_2_3/0201' } };
    assert.deepEqual(InstallRequest.parse(placed), placed);
    assert.equal(InstallRequest.safeParse({ ...body, installId: 'in_X' }).success, true);
    assert.equal(InstallRequest.safeParse({ ...placed, installId: 'in_X' }).success, false);
    assert.equal(InstallRequest.safeParse({ ...body, placement: { anchor: 'Demo/0101' } }).success, false);
    assert.equal(InstallRequest.safeParse({ ...body, placement: { anchor: 'Demo/0101', to: 'Demo/0201', extra: 1 } }).success, false);
});

test('provenance has a package mode; copy and shared rows still parse', () => {
    const at = '2026-10-14T10:00:00.000Z';
    for (const old of [
        { mode: 'copy', universeId: 'u_1', recordId: 'cr_1', rev: 2, at },
        { mode: 'shared', universeId: 'u_1', recordId: 'cr_1', rev: 2, at },
    ]) assert.deepEqual(CampaignProvenance.parse(old), old);
    const pkg = { mode: 'package', packageId: 'pk_X', version: 2, installId: 'in_X', at };
    assert.deepEqual(CampaignProvenance.parse(pkg), pkg);
    assert.equal(CampaignProvenance.safeParse({ ...pkg, version: 0 }).success, false);
    assert.equal(CampaignProvenance.safeParse({ mode: 'package', universeId: 'u_1', recordId: 'cr_1', rev: 2, at }).success, false);
});

test('a restore answer counts what came back', () => {
    const answer = { snapshotId: 'in_X', hexes: 2, records: 1, sectors: 1 };
    assert.deepEqual(InstallRestored.parse(answer), answer);
});

test('the preview lists one outcome per hex, the placement and the sectors it makes', () => {
    const preview = {
        packageId: 'pk_X', version: 1, placement: null, sectorsCreated: [],
        hexes: [{ from: 'Demo/0101', to: 'Demo/0101', outcome: 'replaces chart', removes: false, current: { name: 'A', uwp: '', treeHash: null } }],
        records: { add: 0, replace: 0, conflicts: [] }, bytes: 0, conflicts: 0,
    };
    assert.deepEqual(InstallPreview.parse(preview), preview);
    assert.equal(InstallPreview.safeParse({ ...preview, hexes: [{ ...preview.hexes[0], outcome: 'merged' }] }).success, false);
    const placed = {
        ...preview,
        placement: { anchor: 'Demo/0101', to: '~slot_2_3/0101' },
        sectorsCreated: [{ id: '~01J0000000000000000000000A', slot: { x: 2, y: 3 }, name: 'Demo' }],
    };
    assert.deepEqual(InstallPreview.parse(placed), placed);
});

test('an import row says whether an update is available', () => {
    const row = {
        installId: 'in_X', packageId: 'pk_X', title: 'T', version: 1, latestVersion: 2, updateAvailable: true,
        placement: null, removed: false, hexCount: 3, installedAt: 'a', updatedAt: 'b',
    };
    assert.deepEqual(InstallRow.parse(row), row);
    const undone = { ...row, updateAvailable: false, removed: true, placement: { anchor: 'Demo/0101', to: 'Demo/0505' } };
    assert.deepEqual(InstallRow.parse(undone), undone);
});