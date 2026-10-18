/**
 * DU27 (UX backlog U27): a record's first image is its avatar in the records list, the party, the hover
 * card and the timeline. All four draw `RecordAvatar`, which shows `primaryImage` (the gallery's first)
 * and the kind's icon without one. Found already in place on 2026-10-17 and checked in the browser; this
 * pins it.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { primaryImage } from '../../apps/web/src/workspace/images.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => fs.readFileSync(path.join(root, 'apps/web/src/workspace', rel), 'utf8');

test('the avatar is the first image, or none', () => {
    const a = { hash: 'a', thumbHash: 'ta' };
    const b = { hash: 'b', thumbHash: 'tb' };
    assert.equal(primaryImage({ images: [a, b] }), a);
    assert.equal(primaryImage({ images: [] }), null);
    assert.equal(primaryImage({ images: null }), null);
    const avatar = read('RecordAvatar.vue');
    assert.match(avatar, /const image = computed\(\(\) => primaryImage\(props\.record\)\);/);
    assert.match(avatar, /imageUrl\(props\.universeId, image\.value\.thumbHash\)/);
});

test('the records list, the party, the hover card and the timeline each draw it', () => {
    assert.match(read('CampaignList.vue'), /<RecordAvatar :record="item\.record" :universe-id="campaign\.universeId" size="row" \/>/);
    const party = read('PartyPanel.vue');
    assert.match(party, /<RecordAvatar :record="row\.record" :universe-id="campaign\.universeId" size="chip" \/>/);
    assert.match(party, /<RecordAvatar :record="ship" :universe-id="campaign\.universeId" size="chip" \/>/);
    assert.match(read('RecordCard.vue'), /<RecordAvatar :record="record" :universe-id="campaign\.universeId" size="row" \/>/);
    assert.match(read('TimelineList.vue'), /<RecordAvatar :record="row\.avatar" :universe-id="campaign\.universeId" size="row"/);
    // A record's row in the timeline carries the record's own images.
    assert.match(read('timeline.ts'), /avatar: \{ name: record\.name, type: record\.type, images: record\.images \}/);
});
