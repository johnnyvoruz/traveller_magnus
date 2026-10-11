/**
 * The binding tells a view when rows arrive. The store's tick is not itself
 * reactive to the view, so a first read of "loading" must move once the page lands.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computed, nextTick, ref } from 'vue';
import { bindBuilder, builderEpoch } from '../../apps/web/src/builder/bind.ts';

const KEY = 'spin/1910';
const HASH = 'ab'.repeat(32);
const STAMP = '2026-10-10T00:00:00.000Z';

function row() {
    return {
        hexKey: KEY,
        state: 'override',
        treeHash: HASH,
        baseHash: null,
        roll: 0,
        rev: 1,
        updatedAt: STAMP,
    };
}

function json(data, status = 200) {
    return { ok: status >= 200 && status < 300, status, json: async () => ({ ok: true, data }) };
}

test('rows landing after the first read move the view off loading', async () => {
    let release = () => {};
    const gate = new Promise((done) => { release = done; });
    const fetchImpl = async (url, init = {}) => {
        const address = String(url);
        if (address.includes('/hexes?')) {
            await gate;
            return json({ items: [row()], nextCursor: null });
        }
        if (init.method === 'POST' && address.endsWith('/remove')) return json({ ...row(), state: 'removed', treeHash: null, rev: 2 });
        throw new Error('unexpected ' + address);
    };
    const universe = ref({ id: 'uni-1', name: 'Mine', truthVersion: 'v5', seed: null, settings: null });
    const bound = bindBuilder(() => universe.value, fetchImpl);
    bound.sync();
    const map = bound.builder();
    assert.ok(map);

    const state = computed(() => {
        void builderEpoch.value;
        if (!map.sectorLoaded('spin')) return 'loading';
        const held = map.row(KEY);
        if (held && held.state === 'removed') return 'missing';
        return held && held.treeHash ? 'ready' : 'loading';
    });

    assert.equal(state.value, 'loading');
    bound.load('spin');
    assert.equal(state.value, 'loading');
    release();
    for (let i = 0; i < 20 && !map.sectorLoaded('spin'); i += 1) await Promise.resolve();
    assert.equal(map.sectorLoaded('spin'), true);
    await nextTick();
    assert.equal(state.value, 'ready');

    map.remove([KEY]);
    await nextTick();
    assert.equal(state.value, 'missing');
    bound.close();
});
