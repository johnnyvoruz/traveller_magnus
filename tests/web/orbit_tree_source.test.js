import assert from 'node:assert/strict';
import { test } from 'node:test';
import { privateTreeUrl, treeAsk } from '../../apps/web/src/orbit/tree_source.ts';

const HASH = 'ab'.repeat(32);
const CHART = 'cd'.repeat(32);

test('a universe row is never read from the public chart hash', () => {
    assert.deepEqual(treeAsk({
        universeId: 'uni-1',
        sectorLoaded: false,
        row: { state: 'override', treeHash: HASH },
        chartHash: CHART,
    }), { kind: 'wait' });
    assert.deepEqual(treeAsk({
        universeId: 'uni-1',
        sectorLoaded: true,
        row: { state: 'override', treeHash: HASH },
        chartHash: CHART,
    }), { kind: 'private', hash: HASH });
    assert.equal(privateTreeUrl('uni-1', HASH), `/api/universes/uni-1/objects/${HASH}`);
    assert.equal(privateTreeUrl('uni-1', HASH).includes('/objects/' + CHART), false);
});

test('a charted hex with no universe row uses the chart hash, and a removed row does not', () => {
    assert.deepEqual(treeAsk({
        universeId: null,
        sectorLoaded: false,
        row: null,
        chartHash: CHART,
    }), { kind: 'public', hash: CHART });
    assert.deepEqual(treeAsk({
        universeId: 'uni-1',
        sectorLoaded: true,
        row: null,
        chartHash: CHART,
    }), { kind: 'public', hash: CHART });
    assert.deepEqual(treeAsk({
        universeId: 'uni-1',
        sectorLoaded: true,
        row: { state: 'removed', treeHash: null },
        chartHash: CHART,
    }), { kind: 'removed' });
    assert.deepEqual(treeAsk({
        universeId: 'uni-1',
        sectorLoaded: true,
        row: null,
        chartHash: null,
    }), { kind: 'none' });
});
