import test from 'node:test';
import assert from 'node:assert/strict';
import { PackageCard, PackagePublicPage } from '../../packages/shared/src/index.ts';

const card = {
    id: 'pk_X', title: 'T', authorHandle: 'h', kind: 'people', truthVersion: null, edition: 'MgT2E', hexCount: 0, tags: [],
    latestVersion: 1, installs: 0, updatedAt: '2026-10-17T00:00:00.000Z', hidden: false,
};

test('the card carries an optional record count', () => {
    assert.equal(PackageCard.parse({ ...card, recordCount: 12 }).recordCount, 12);
    assert.equal(PackageCard.parse({ ...card, recordCount: 0 }).recordCount, 0);
    assert.equal(PackageCard.parse(card).recordCount, undefined, 'a card from an older server still parses');
    assert.equal(PackageCard.safeParse({ ...card, recordCount: -1 }).success, false);
    assert.equal(PackageCard.safeParse({ ...card, recordCount: 1.5 }).success, false);
});

test('the page carries the record count as the card does', () => {
    const page = { ...card, description: '', versions: [] };
    assert.equal(PackagePublicPage.parse({ ...page, recordCount: 3 }).recordCount, 3);
    assert.equal(PackagePublicPage.parse(page).recordCount, undefined);
    assert.equal(PackagePublicPage.safeParse({ ...page, recordCount: -1 }).success, false);
});
