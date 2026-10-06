import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { reconcileTree } from '@voyage/engines';
import { sha256Hex, stable } from '@voyage/shared';
import {
    assertChartPreserved,
    assertCountsMatchSource,
    emptyReport,
    mergeReports,
    reconcileCachePrefix,
    reconcileStoredObject,
    reconciliationDigests,
    reportForTree,
    sliceKeys,
} from '../../apps/api/src/jobs/reconcile_transform.ts';

function envelope(body) {
    return {
        kind: 'tree',
        engineVersion: '1.0.0',
        hexKey: '0101',
        body,
    };
}

test('reconcile stored object keeps an unchanged hash and replaces a changed one', async () => {
    const source = readFileSync(new URL('../../apps/api/src/jobs/reconcile_transform.ts', import.meta.url), 'utf8');
    assert.equal(source.includes('@voyage/generation'), false);
    assert.equal(source.includes('generateHex'), false);
    assert.equal(source.includes('buildSector'), false);
    const { policy, policyDigest, rulesDigest } = await reconciliationDigests();
    assert.equal(policyDigest.length, 64);
    assert.equal(rulesDigest.length, 64);
    assert.notEqual(policyDigest, rulesDigest);
    const unchanged = stable(envelope({ name: 'Bare' }));
    const unchangedHash = await sha256Hex(unchanged);
    const kept = await reconcileStoredObject(unchangedHash, unchanged, '0101', policy);
    assert.equal(kept.changed, false);
    assert.equal(kept.hash, unchangedHash);
    assert.equal(kept.canonical, unchanged);
    assert.equal(kept.report.bodiesSeen, 0);
    const world = envelope({
        mgtSystem: {
            hzco: 2,
            worlds: [{
                orbitId: 2,
                meanTempK: 280,
                lowTempK: 270,
                highTempK: 290,
                atmCode: 5,
                hydroPercent: 40,
                hydro: 4,
                hydroCode: 4,
                liquidType: 'Water',
            }],
        },
    });
    const original = stable(world);
    const sourceHash = await sha256Hex(original);
    const once = await reconcileStoredObject(sourceHash, original, '0103', policy);
    assert.equal(once.changed, true);
    assert.notEqual(once.hash, sourceHash);
    assert.equal(once.hash, await sha256Hex(once.canonical));
    const direct = reconcileTree(JSON.parse(original), policy);
    assert.equal(once.canonical, stable(direct.tree));
    assert.deepEqual(once.report, reportForTree('0103', direct));
    assert.ok(once.report.bodiesSeen > 0);
    assert.ok(once.report.changedByField.surfaceTempBand > 0);
    const twice = await reconcileStoredObject(once.hash, once.canonical, '0103', policy);
    assert.equal(twice.changed, false);
    assert.equal(twice.hash, once.hash);
    const left = emptyReport();
    mergeReports(left, once.report);
    mergeReports(left, emptyReport());
    assert.deepEqual(left, once.report);
    assert.equal(reconcileCachePrefix('v5', 'abc', policyDigest, 'Fixture').includes(policyDigest), true);
    assert.notEqual(
        reconcileCachePrefix('v5', 'abc', policyDigest, 'Fixture'),
        reconcileCachePrefix('v5', 'abc', rulesDigest, 'Fixture'),
    );
    const keys = Array.from({ length: 26 }, (_item, index) => String(index).padStart(4, '0'));
    assert.equal(sliceKeys(keys, 0, 25).keys.length, 25);
    assert.equal(sliceKeys(keys, 0, 25).nextOffset, 25);
    assert.equal(sliceKeys(keys, 25, 25).nextOffset, null);
    assert.equal(sliceKeys(keys, 25, 25).keys.length, 1);
    const sourceHexes = {
        '0101': { tree: 'aaa', name: 'Bare', partial: null },
        '0102': { tree: null, name: 'Survey', partial: 'full' },
    };
    const merged = {
        '0101': { tree: once.hash, name: 'Bare', partial: null },
        '0102': { tree: null, name: 'Survey', partial: 'full' },
    };
    assertChartPreserved(sourceHexes, merged);
    assert.throws(() => assertChartPreserved(sourceHexes, {
        '0101': { tree: once.hash, name: 'Other', partial: null },
        '0102': { tree: null, name: 'Survey', partial: 'full' },
    }), /Chart fields changed/);
    assertCountsMatchSource({ systems: 2, built: 1, partial: 1, hexes: sourceHexes }, { systems: 2, built: 1, partial: 1 });
    assert.throws(() => assertCountsMatchSource(
        { systems: 2, built: 1, partial: 1, hexes: sourceHexes },
        { systems: 2, built: 2, partial: 0 },
    ), /built count/);
});
