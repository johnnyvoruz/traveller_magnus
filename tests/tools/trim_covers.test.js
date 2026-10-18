// Z10: the example covers trimmed as D5 trims a map cover at upload.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { LIMITS, familyOf, fitted, listings, trimBox, trimmable, trimmedPair } from '../../tools/examples/trim_covers.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const covers = path.join(root, 'tools', 'examples', 'covers');

/** A 1600x900 dark chart with one bright block, as a map screenshot. */
async function chart(block) {
    const base = sharp({ create: { width: 1600, height: 900, channels: 3, background: { r: 8, g: 10, b: 20 } } });
    const dot = await sharp({ create: { width: block.w, height: block.h, channels: 3, background: { r: 240, g: 240, b: 240 } } }).png().toBuffer();
    return base.composite([{ input: dot, left: block.x, top: block.y }]).png().toBuffer();
}

test('only map and system packages are trimmed, by the store\'s families', () => {
    assert.equal(familyOf('sector piece'), 'map');
    assert.equal(familyOf('system'), 'system');
    assert.equal(trimmable('sector piece'), true);
    assert.equal(trimmable('system'), true);
    for (const kind of ['ships', 'people', 'patrons', 'organization']) assert.equal(trimmable(kind), false, kind);
    const kinds = Object.fromEntries(listings().map((l) => [l.slug, trimmable(l.listing.kind)]));
    assert.deepEqual(Object.keys(kinds).filter((slug) => kinds[slug]).sort(), ['feri-terraces', 'hollow-verge']);
});

test('a dark chart with a few systems is cut to a padded 16:9 box round them', async () => {
    const seen = await trimBox(await chart({ x: 700, y: 400, w: 120, h: 80 }));
    assert.ok(seen.box, 'trimmed');
    const { left, top, width, height } = seen.box;
    assert.ok(left <= 700 && top <= 400 && left + width >= 820 && top + height >= 480, JSON.stringify(seen.box));
    assert.ok(Math.abs(width / height - 16 / 9) < 0.03, `aspect ${width / height}`);
    assert.ok(width * height < 0.7 * 1600 * 900);
});

test('a bright picture, or systems that fill the chart, are kept whole', async () => {
    const bright = await sharp({ create: { width: 1600, height: 900, channels: 3, background: { r: 160, g: 120, b: 90 } } }).png().toBuffer();
    assert.equal((await trimBox(bright)).box, null);
    assert.equal((await trimBox(await chart({ x: 10, y: 10, w: 20, h: 20 }).then(async (one) => sharp(one).composite([{ input: await sharp({ create: { width: 20, height: 20, channels: 3, background: '#fff' } }).png().toBuffer(), left: 1570, top: 870 }]).png().toBuffer()))).box, null);
});

test('the pair keeps the limits and is never enlarged', async () => {
    const done = await trimmedPair(await chart({ x: 700, y: 400, w: 120, h: 80 }));
    assert.ok(done.pair);
    assert.ok(done.pair.image.width <= done.box.width && Math.max(done.pair.image.width, done.pair.image.height) <= LIMITS.side);
    assert.ok(done.pair.image.bytes.byteLength <= LIMITS.bytes);
    assert.ok(Math.max(done.pair.thumb.width, done.pair.thumb.height) <= LIMITS.thumbSide);
    assert.ok(done.pair.thumb.bytes.byteLength <= LIMITS.thumbBytes);
    const small = await fitted(await sharp({ create: { width: 300, height: 200, channels: 3, background: '#123' } }).png().toBuffer(), 1600, LIMITS.bytes);
    assert.deepEqual([small.width, small.height], [300, 200]);
});

test('the example covers are as D5 leaves them: Hollow Verge trimmed once, Feri terraces whole', async () => {
    const hollow = readFileSync(path.join(covers, 'hollow-verge.webp'));
    const meta = await sharp(hollow).metadata();
    assert.ok(meta.width < 1600 && Math.abs(meta.width / meta.height - 16 / 9) < 0.03, `${meta.width}x${meta.height}`);
    assert.equal((await trimBox(hollow)).box, null, 'a second trim keeps it whole');
    const untrimmed = await trimBox(readFileSync(path.join(covers, 'untrimmed', 'hollow-verge.webp')));
    assert.deepEqual([untrimmed.box.width, untrimmed.box.height], [meta.width, meta.height]);
    assert.equal((await trimBox(readFileSync(path.join(covers, 'feri-terraces.webp')))).box, null);
});