import test from 'node:test';
import assert from 'node:assert/strict';
import { PackagePublish, InstallPreview } from '../../packages/shared/src/index.ts';

test('F18: a version may publish with no hexes', () => {
    const ok = PackagePublish.safeParse({ universeId: 'u1', hexKeys: [], recordIds: ['cr_11111111-1111-4111-8111-111111111111'] });
    assert.equal(ok.success, true, JSON.stringify(ok.error?.issues));
});

test('F18: the preview may carry anchorsDropped, and an older preview without it still parses', () => {
    const shape = InstallPreview.shape.records;
    assert.equal(shape.safeParse({ add: 1, replace: 0, conflicts: [], anchorsDropped: 2 }).success, true);
    assert.equal(shape.safeParse({ add: 1, replace: 0, conflicts: [] }).success, true);
    assert.equal(shape.safeParse({ add: 1, replace: 0, conflicts: [], anchorsDropped: -1 }).success, false);
});
