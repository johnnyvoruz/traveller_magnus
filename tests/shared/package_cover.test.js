import test from 'node:test';
import assert from 'node:assert/strict';
import { PackageCard, PackageCover, PackagePublicPage } from '../../packages/shared/src/index.ts';

const H = 'a'.repeat(64);
const T = 'b'.repeat(64);
const card = {
    id: 'pk_X', title: 'T', authorHandle: 'h', kind: 'people', truthVersion: 'v10', edition: 'MgT2E', hexCount: 1, tags: [],
    latestVersion: 1, installs: 0, updatedAt: '2026-10-15T00:00:00.000Z', hidden: false,
};

test('F17: the cover is an upload or record pair, or null, on the card and the page', () => {
    assert.deepEqual(PackageCover.parse({ hash: H, thumbHash: T, source: 'upload' }), { hash: H, thumbHash: T, source: 'upload' });
    assert.equal(PackageCover.safeParse({ hash: H, thumbHash: T, source: 'default' }).success, false, 'the server never names a default');
    assert.equal(PackageCover.safeParse({ hash: 'ABC', thumbHash: T, source: 'record' }).success, false);
    assert.equal(PackageCard.parse({ ...card, cover: null }).cover, null);
    assert.equal(PackageCard.parse({ ...card, cover: { hash: H, thumbHash: T, source: 'record' } }).cover.source, 'record');
    assert.equal(PackageCard.parse(card).cover, undefined, 'a card from a server before F17 still parses');
    const page = PackagePublicPage.parse({ ...card, description: '', versions: [], cover: { hash: H, thumbHash: T, source: 'upload' } });
    assert.equal(page.cover.hash, H);
});
