import test from 'node:test';
import assert from 'node:assert/strict';
import { PACKAGE_KIND_FAMILIES, PackageCatalogueQuery, PackageFamily } from '../../packages/shared/src/index.ts';
import { FAMILIES, KIND_FAMILIES } from '../../apps/web/src/marketplace/covers.ts';

test('the catalogue families are the store chips, word for word and in order', () => {
    assert.deepEqual(PACKAGE_KIND_FAMILIES.map((row) => ({ family: row.family, words: [...row.words] })), KIND_FAMILIES.map((row) => ({ family: row.family, words: [...row.words] })));
    assert.deepEqual(PackageFamily.options, [...FAMILIES]);
});

test('family repeats and author is a handle; both optional', () => {
    assert.deepEqual(PackageCatalogueQuery.parse({ family: ['people', 'other'], author: 'lee' }), { family: ['people', 'other'], author: 'lee' });
    assert.deepEqual(PackageCatalogueQuery.parse({}), {});
    assert.equal(PackageCatalogueQuery.safeParse({ family: ['dragons'] }).success, false);
    assert.equal(PackageCatalogueQuery.safeParse({ family: [] }).success, false);
    assert.equal(PackageCatalogueQuery.safeParse({ author: ' ' }).success, false);
    assert.equal(PackageCatalogueQuery.safeParse({ family: 'people' }).success, false, 'the route always hands family as a list');
});
