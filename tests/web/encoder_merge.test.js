import assert from 'node:assert/strict';
import { test } from 'node:test';
import { encodeWebp, prepareImage } from '../../apps/web/src/campaign/images.ts';
import { prepareCover } from '../../apps/web/src/workspace/market/cover_image.ts';

const REFUSED = 'This browser cannot encode WebP.';

/** A bitmap with no pixels. The shared encoder returns null before it touches a canvas. */
function emptyBitmap() {
    return { width: 0, height: 0, close() {} };
}

test('a bitmap with no pixels encodes to null', async () => {
    const previous = globalThis.createImageBitmap;
    globalThis.createImageBitmap = async () => emptyBitmap();
    try {
        assert.equal(await encodeWebp(new Blob(['x']), 1600, 0.85), null);
    } finally {
        if (previous) globalThis.createImageBitmap = previous;
        else delete globalThis.createImageBitmap;
    }
});

test('the store cover and the record gallery call the same encoder', async () => {
    const previousBitmap = globalThis.createImageBitmap;
    const previousOffscreen = globalThis.OffscreenCanvas;
    const hadDocument = Object.prototype.hasOwnProperty.call(globalThis, 'document');
    const previousDocument = globalThis.document;
    let canvasCalls = 0;
    globalThis.createImageBitmap = async () => emptyBitmap();
    globalThis.OffscreenCanvas = function OffscreenCanvas() {
        canvasCalls += 1;
        throw new Error('canvas');
    };
    globalThis.document = {
        createElement() {
            canvasCalls += 1;
            throw new Error('canvas');
        },
    };
    const file = { type: 'image/png', size: 12, name: 'shot.png' };
    try {
        const cover = await prepareCover(file);
        const gallery = await prepareImage(file);
        assert.deepEqual(cover, { ok: false, message: REFUSED });
        assert.deepEqual(gallery, { ok: false, message: REFUSED });
        assert.equal(canvasCalls, 0);
    } finally {
        if (previousBitmap) globalThis.createImageBitmap = previousBitmap;
        else delete globalThis.createImageBitmap;
        if (previousOffscreen) globalThis.OffscreenCanvas = previousOffscreen;
        else delete globalThis.OffscreenCanvas;
        if (hadDocument) globalThis.document = previousDocument;
        else delete globalThis.document;
    }
});
