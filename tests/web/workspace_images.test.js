/**
 * Images as the screens read them (apps/web/src/workspace/images.ts): the primary image and
 * its address, which files are taken, the upload's words, and what an undo sends back.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CampaignRecord } from '@voyage/shared';
import {
    acceptFile, FILE_MAX_BYTES, imageUrl, imageWords, primaryImage, sameImages, thumbUrl, uploadWords, withImageBack,
} from '../../apps/web/src/workspace/images.ts';
import { edited, newRecord, unchanged } from '../../apps/web/src/workspace/records.ts';

const hash = (c) => c.repeat(64);
const img = (c, over = {}) => ({ hash: hash(c), thumbHash: hash(c.toUpperCase() === c ? c : c.toUpperCase()).toLowerCase(), width: 1200, height: 800, bytes: 245760, ...over });
const A = img('a'), B = img('b', { caption: 'The berth' }), C = img('c');

test('the first image is the primary one; addresses are the objects route', () => {
    assert.equal(primaryImage({ images: null }), null);
    assert.equal(primaryImage({ images: [] }), null);
    assert.equal(primaryImage({ images: [B, A] }), B);
    assert.equal(imageUrl('01ABC', hash('a')), '/api/universes/01ABC/objects/' + hash('a'));
    assert.equal(thumbUrl('01ABC', { images: [A] }), '/api/universes/01ABC/objects/' + A.thumbHash);
    assert.equal(thumbUrl(null, { images: [A] }), null);
    assert.equal(thumbUrl('01ABC', { images: null }), null);
});

test('files: images under 8 MB are taken, the rest refused with a reason', () => {
    assert.deepEqual(acceptFile({ type: 'image/png', size: 1000, name: 'a.png' }), { ok: true });
    assert.deepEqual(acceptFile({ type: 'image/jpeg', size: FILE_MAX_BYTES, name: 'a.jpg' }), { ok: true });
    assert.deepEqual(acceptFile({ type: 'image/jpeg', size: 9 * 1024 * 1024, name: 'big.jpg' }), { ok: false, message: 'big.jpg is over 8 MB.' });
    assert.deepEqual(acceptFile({ type: 'application/json', size: 10, name: 'ship.json' }), { ok: false, message: 'ship.json is not an image.' });
    assert.deepEqual(acceptFile({ type: '', size: 10, name: '' }), { ok: false, message: 'That file is not an image.' });
});

test('the upload says what it is doing in the saving mark’s language', () => {
    assert.equal(uploadWords(null), '');
    assert.equal(uploadWords({ stage: 'reading', message: '', file: 'a.png' }), 'Reading the image…');
    assert.equal(uploadWords({ stage: 'uploading', message: '', file: 'a.png' }), 'Uploading…');
    assert.equal(uploadWords({ stage: 'failed', message: 'This browser cannot encode WebP.', file: 'a.png' }), 'Not saved');
    assert.equal(imageWords(A), '1,200 × 800 · 240 kB');
    assert.equal(imageWords({ ...A, bytes: 2 * 1024 * 1024 }), '1,200 × 800 · 2.0 MB');
});

test('an undo puts the image back where it was; galleries compare by hash and caption', () => {
    assert.deepEqual(withImageBack([A, C], B, 1).map((i) => i.hash[0]), ['a', 'b', 'c']);
    assert.deepEqual(withImageBack([A, C], B, 0).map((i) => i.hash[0]), ['b', 'a', 'c']);
    assert.deepEqual(withImageBack([A, C], B, 9).map((i) => i.hash[0]), ['a', 'c', 'b']);
    assert.deepEqual(withImageBack(null, B, 0).map((i) => i.hash[0]), ['b']);
    assert.deepEqual(withImageBack([A, B], B, 0).map((i) => i.hash[0]), ['b', 'a'], 'never twice');
    assert.equal(sameImages([A, B], [A, { ...B }]), true);
    assert.equal(sameImages([A, B], [B, A]), false);
    assert.equal(sameImages([A, B], [A, { ...B, caption: 'Other' }]), false);
    assert.equal(sameImages(null, []), true);
    // A record patch carries images, and one that changes nothing is not sent.
    const record = { ...newRecord('place', 'cr_00000001-0000-4000-8000-000000000000', '2026-10-05T00:00:00.000Z'), images: [A, B], rev: 2 };
    assert.equal(unchanged(record, { images: [A, { ...B }] }), true);
    assert.equal(unchanged(record, { images: [B, A] }), false);
    const change = edited(record, { images: withImageBack(record.images, C, 1) }, '2026-10-06T00:00:00.000Z');
    assert.deepEqual(change.images.map((i) => i.hash[0]), ['a', 'c', 'b']);
    assert.equal(CampaignRecord.safeParse({ ...record, images: change.images }).success, true);
});
