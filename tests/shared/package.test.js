import test from 'node:test';
import assert from 'node:assert/strict';
import {
    PackageCreate,
    PackageListPage,
    PackagePublish,
    PackagePublishAccepted,
    PackageVersion,
} from '@voyage/shared';

const HEX = 'Demo/1910';
const RECORD = 'cr_11111111-1111-4111-8111-111111111111';

test('package create trims title and kind and keeps the listing page cursor nullable', () => {
    const created = PackageCreate.parse({
        title: '  Far Reach  ',
        kind: '  subsector  ',
        description: '',
        tags: [],
        universeId: 'uni',
    });
    assert.equal(created.title, 'Far Reach');
    assert.equal(created.kind, 'subsector');
    assert.equal(PackageCreate.safeParse({ title: '   ', kind: 'map', description: '', tags: [], universeId: 'uni' }).success, false);
    assert.equal(PackageCreate.safeParse({ title: 'A', kind: 'map', description: '', tags: ['ok'], universeId: 'uni' }).success, true);
    assert.equal(PackageCreate.safeParse({
        title: 'A', kind: 'map', description: '', tags: Array.from({ length: 33 }, () => 'tag'), universeId: 'uni',
    }).success, false);
    const page = PackageListPage.parse({ items: [], nextCursor: null });
    assert.equal(page.nextCursor, null);
    assert.equal(PackageListPage.safeParse({ items: [], nextCursor: 0 }).success, false);
});

test('package publish rejects a duplicate hex and accepts an empty record list', () => {
    const parsed = PackagePublish.safeParse({ universeId: 'uni', hexKeys: [HEX, HEX], recordIds: [] });
    assert.equal(parsed.success, false);
    if (!parsed.success) {
        assert.ok(parsed.error.flatten().fieldErrors.hexKeys.includes('duplicate hex key'));
    }
    assert.equal(PackagePublish.safeParse({ universeId: 'uni', hexKeys: [], recordIds: [] }).success, false);
    assert.equal(PackagePublish.safeParse({ universeId: 'uni', hexKeys: [HEX], recordIds: [RECORD] }).success, true);
    assert.equal(PackagePublish.safeParse({ universeId: 'uni', hexKeys: Array.from({ length: 1281 }, (_, i) => `s${i}/0101`), recordIds: [] }).success, true);
    const accepted = PackagePublishAccepted.parse({ jobId: 'pk_1:1', version: 1 });
    assert.equal(accepted.version, 1);
    const version = PackageVersion.parse({
        version: 1, state: 'queued', hexCount: 1, recordCount: 0, manifestHash: null, error: null,
    });
    assert.equal(version.manifestHash, null);
});
