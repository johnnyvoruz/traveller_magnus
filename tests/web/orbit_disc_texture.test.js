import assert from 'node:assert/strict';
import { test } from 'node:test';
import { discWantsTexture } from '../../apps/web/src/orbit/disc_batch.ts';
import { handOverDiscAnswer, watchSuperseded } from '../../apps/web/src/surface/enhanced/delivery.ts';

const envelope = { mode: 'enhanced', version: 'enhanced-cities-4b', generation: 4 };

test('a middle-zoom disc is asked for a texture and a dot is not', () => {
    assert.equal(discWantsTexture(2.49), false);
    assert.equal(discWantsTexture(2.5), true);
    assert.equal(discWantsTexture(18), true);
    assert.equal(discWantsTexture(120), true);
});

test('a finished answer is handed over when the next watch is the same picture', () => {
    const painting = { ...envelope };
    const nextFrame = { mode: 'enhanced', version: 'enhanced-cities-4b', generation: 4 };
    assert.notEqual(painting, nextFrame);
    assert.equal(watchSuperseded(nextFrame, painting), false);
    assert.equal(handOverDiscAnswer(nextFrame, painting), true);
    assert.equal(handOverDiscAnswer(null, painting), true);
    const zoomed = { mode: 'enhanced', version: 'enhanced-cities-4b', generation: 5 };
    assert.equal(watchSuperseded(zoomed, painting), true);
    assert.equal(handOverDiscAnswer(zoomed, painting), false);
    const vanilla = { mode: 'vanilla', version: 'vanilla', generation: 4 };
    assert.equal(handOverDiscAnswer(vanilla, painting), false);
});
