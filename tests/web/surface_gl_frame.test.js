import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
    atlasBytes,
    cubeBytes,
    MEMORY_BUDGET,
    reserve,
    statsTargetBytes,
} from '../../apps/web/src/surface/vanilla/gl_bake.ts';
import { FRAME_BAKE_MS, planFrame } from '../../apps/web/src/surface/vanilla/gl_plan.ts';

function body(id, near, extra = {}) {
    return {
        id,
        near,
        hasStats: false,
        has32: false,
        want: 128,
        finished: [],
        job: null,
        ...extra,
    };
}

describe('disc frame plan', () => {
    test('one coarse body per frame, nearest to the selected body first', () => {
        const far = body('far', 5);
        const near = body('near', 0);
        const first = planFrame([far, near], 0, null);
        assert.equal(FRAME_BAKE_MS, 8);
        assert.deepEqual(first.action, { kind: 'stats', id: 'near' });
        assert.equal(first.coarseId, 'near');
        const second = planFrame([
            far,
            body('near', 0, { hasStats: true }),
        ], 1, first.coarseId);
        assert.deepEqual(second.action, { kind: 'cube32', id: 'near' });
        const stopped = planFrame([
            far,
            body('near', 0, { hasStats: true, has32: true, finished: [32] }),
        ], 2, second.coarseId);
        assert.deepEqual(stopped.action, { kind: 'stop' });
        const nextFrame = planFrame([
            body('far', 5),
            body('near', 0, { hasStats: true, has32: true, finished: [32] }),
        ], 0, null);
        assert.deepEqual(nextFrame.action, { kind: 'stats', id: 'far' });
    });

    test('the frame budget stops the coarse pass, then larger cubes follow', () => {
        const over = planFrame([body('near', 0)], FRAME_BAKE_MS, null);
        assert.deepEqual(over.action, { kind: 'stop' });
        const ready = [
            body('far', 4, { hasStats: true, has32: true, finished: [32], want: 256 }),
            body('near', 1, { hasStats: true, has32: true, finished: [32], want: 128 }),
        ];
        const started = planFrame(ready, 0, null);
        assert.deepEqual(started.action, { kind: 'start', id: 'near', size: 128 });
        const baking = planFrame([
            body('near', 1, { hasStats: true, has32: true, finished: [32], want: 128, job: { size: 128, face: 2 } }),
        ], 0, null);
        assert.deepEqual(baking.action, { kind: 'face', id: 'near' });
        const tied = planFrame([
            body('b', 0, { hasStats: false }),
            body('a', 0, { hasStats: false }),
        ], 0, null);
        assert.deepEqual(tied.action, { kind: 'stats', id: 'b' });
    });
});

describe('disc memory reserve', () => {
    test('counts cubes, the statistics target and the atlas, and evicts the least recently drawn', () => {
        const stats = statsTargetBytes();
        const atlas = atlasBytes(1024, 1024);
        const cube = cubeBytes(1024);
        assert.equal(stats, 128 * 64 * 16 * 4);
        assert.equal(atlas, 1024 * 1024 * 4);
        assert.equal(cube * 5, MEMORY_BUDGET);
        const worlds = [1, 2, 3, 4].map((lastFrame) => ({
            id: 'w' + lastFrame,
            lastFrame,
            bytes: cube,
            jobBytes: 0,
        }));
        worlds.push({ id: 'live', lastFrame: 5, bytes: cube, jobBytes: 0 });
        const used = stats + atlas + cube * 5;
        const decision = reserve(used, cube, 5, worlds);
        assert.equal(used + cube > MEMORY_BUDGET, true);
        assert.deepEqual(decision.evict, ['w1', 'w2']);
        assert.equal(decision.ok, true);
        const stuckWorlds = [1, 2, 3, 4, 5].map((n) => ({
            id: 'live' + n,
            lastFrame: 9,
            bytes: cube,
            jobBytes: 0,
        }));
        const stuck = reserve(stats + atlas + cube * 5, cube, 9, stuckWorlds);
        assert.deepEqual(stuck.evict, []);
        assert.equal(stuck.ok, false);
        const fits = reserve(stats + atlas, cubeBytes(32), 1, []);
        assert.deepEqual(fits, { ok: true, evict: [] });
    });
});
