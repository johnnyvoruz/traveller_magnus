/**
 * Images on a journal entry: the list, the row avatar, and the timeline avatar.
 * The upload itself is campaign/images.ts. These tests do not touch the clock.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { CAMPAIGN_LIMITS } from '@voyage/shared';
import {
    ENTRY_FULL, entryImageCaption, entryImageFirst, withEntryImage, withoutEntryImage,
} from '../../apps/web/src/workspace/journal/entry_images.ts';
import { rowFace } from '../../apps/web/src/workspace/journal/list.ts';
import { buildTimeline } from '../../apps/web/src/workspace/timeline.ts';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const gallery = fs.readFileSync(path.join(root, 'apps/web/src/workspace/journal/EntryGallery.vue'), 'utf8');
const page = fs.readFileSync(path.join(root, 'apps/web/src/workspace/journal/EntryPage.vue'), 'utf8');
const list = fs.readFileSync(path.join(root, 'apps/web/src/workspace/journal/JournalList.vue'), 'utf8');
const timeline = fs.readFileSync(path.join(root, 'apps/web/src/workspace/timeline.ts'), 'utf8');

const HASH = 'a'.repeat(64);
const THUMB = 'b'.repeat(64);
const HASH_2 = 'c'.repeat(64);
const THUMB_2 = 'd'.repeat(64);

function image(hash, thumb, caption) {
    const row = { hash, thumbHash: thumb, width: 800, height: 600, bytes: 1200 };
    if (caption) row.caption = caption;
    return row;
}

function entry(over = {}) {
    return {
        id: 'cj_11111111-1111-4111-8111-111111111111',
        kind: 'handout',
        title: 'The letter',
        body: '',
        when: { year: 1105, day: 100 },
        realDate: null,
        sequence: null,
        author: 'referee',
        visibility: 'players',
        anchor: null,
        mentions: [],
        rev: 1,
        createdAt: '2026-10-12T00:00:00.000Z',
        updatedAt: '2026-10-12T00:00:00.000Z',
        deleted: false,
        ...over,
    };
}

test('an entry gains an image, puts one first, and clears the last', () => {
    const first = image(HASH, THUMB);
    const added = withEntryImage(null, first);
    assert.equal('images' in added, true);
    const dated = { when: { year: 1105, day: 100 }, images: added.images };
    assert.deepEqual(dated.when, { year: 1105, day: 100 });

    const second = image(HASH_2, THUMB_2);
    const both = withEntryImage(added.images, second);
    assert.deepEqual(both.images.map((item) => item.hash), [HASH, HASH_2]);
    const front = withEntryImage(both.images, second, true);
    assert.deepEqual(front.images.map((item) => item.hash), [HASH_2, HASH]);
    assert.equal(entryImageFirst(both.images, HASH_2)[0].hash, HASH_2);
    assert.equal(entryImageFirst(both.images, HASH), null);

    const one = withoutEntryImage(both.images, HASH_2);
    assert.equal(one.length, 1);
    assert.equal(withoutEntryImage(one, HASH), null);

    const full = [];
    for (let n = 0; n < CAMPAIGN_LIMITS.images; n += 1) full.push(image(n.toString(16).padStart(64, 'e'), THUMB));
    assert.deepEqual(withEntryImage(full, first), { error: 'full' });
    assert.match(ENTRY_FULL, /twelve images/);
});

test('a blank caption is removed and a written one is kept', () => {
    const start = [image(HASH, THUMB, 'The seal')];
    const named = entryImageCaption(start, HASH, '  The wax  ');
    assert.equal(named[0].caption, 'The wax');
    const cleared = entryImageCaption(named, HASH, '   ');
    assert.equal(Object.hasOwn(cleared[0], 'caption'), false);
    assert.equal(entryImageCaption(start, THUMB, 'no'), null);
});

test('the row and the timeline use the first image, and a missing list stays empty', () => {
    const bare = rowFace(entry(), {});
    assert.equal(bare.images, null);
    const faced = rowFace(entry({ images: [image(HASH, THUMB), image(HASH_2, THUMB_2)] }), {});
    assert.equal(faced.images[0].hash, HASH);

    const model = buildTimeline({
        entries: [entry({ images: [image(HASH, THUMB)] })],
        records: {},
        clockDays: null,
    });
    const row = model.years[0].days[0].rows[0];
    assert.equal(row.avatar.images[0].hash, HASH);
    assert.equal(row.date, '100-1105');
});

test('the entry page uses the record gallery words and does not write the clock', () => {
    assert.match(page, /<EntryGallery :id="id" part="avatar"/);
    assert.match(page, /<EntryGallery :id="id" part="strip"/);
    assert.match(gallery, /Add an image/);
    assert.match(gallery, /Reading the image…/);
    assert.match(gallery, /Uploading…/);
    assert.match(gallery, /The upload failed\./);
    assert.match(gallery, /Try again/);
    assert.match(gallery, /Removed the image\./);
    assert.match(gallery, /Make this the cover/);
    assert.match(gallery, />Cover</);
    assert.match(gallery, /Drop images here, or paste one\. They are kept as WebP, 2,048 px at most\./);
    assert.match(gallery, /saveEntry\(\{ \.\.\.latest, images:/);
    assert.doesNotMatch(gallery, /clock/);
    assert.match(list, /RecordAvatar/);
    assert.match(list, /face\.images/);
    assert.match(timeline, /images: entry\.images \?\? null/);
});
