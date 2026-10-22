/**
 * AQ1 round 2. The image hash is SHA-256 of a copy of the bytes.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sha256Hex } from '../../apps/web/src/campaign/images.ts';

test('sha256 of empty bytes, of abc, and the source buffer is left alone', async () => {
    assert.equal(await sha256Hex(new Uint8Array()), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    const abc = new Uint8Array([97, 98, 99]);
    assert.equal(await sha256Hex(abc), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    assert.deepEqual([...abc], [97, 98, 99]);
});
