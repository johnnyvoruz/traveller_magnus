import assert from 'node:assert/strict';
import { test } from 'node:test';
import { avatarShape, campaignCrumb, listCrumbLabel } from '../../apps/web/src/workspace/crumb.ts';
import { primaryImage, withImageFirst } from '../../apps/web/src/workspace/images.ts';

function image(hash) {
    return { hash, thumbHash: hash + '-t', width: 10, height: 10, bytes: 4 };
}

test('the crumb is Campaign, the list, then the page', () => {
    const parts = campaignCrumb({ level: 'record', beside: false, middle: 'People', pageName: 'Captain Voss' });
    assert.deepEqual(parts.map((part) => part.label), ['Campaign', 'People', 'Captain Voss']);
    assert.deepEqual(parts.map((part) => part.go), ['campaign', 'records', null]);
});

test('a journal entry returns to the journal list', () => {
    const parts = campaignCrumb({ level: 'entry', beside: false, middle: 'Sessions', pageName: 'Session 4' });
    assert.equal(parts[1].go, 'journal');
    assert.equal(parts[2].go, null);
});

test('full width leaves off the middle part, because the list is on screen', () => {
    const parts = campaignCrumb({ level: 'record', beside: true, middle: 'People', pageName: 'Captain Voss' });
    assert.deepEqual(parts.map((part) => [part.label, part.go]), [['Campaign', 'records'], ['Captain Voss', null]]);
});

test('the party is one step under Campaign', () => {
    const parts = campaignCrumb({ level: 'party', beside: true, middle: 'Party', pageName: 'Party' });
    assert.deepEqual(parts.map((part) => part.label), ['Campaign', 'Party']);
    assert.equal(parts[0].go, 'campaign');
    assert.equal(parts[1].go, null);
});

test('a search stays in the list’s name', () => {
    assert.equal(listCrumbLabel('People', '  voss '), 'People matching “voss”');
    assert.equal(listCrumbLabel('Records', ''), 'Records');
});

test('a person and a character are circles; every other kind is a square', () => {
    assert.equal(avatarShape('person'), 'circle');
    assert.equal(avatarShape('character'), 'circle');
    assert.equal(avatarShape('place'), 'square');
    assert.equal(avatarShape('vessel'), 'square');
    assert.equal(avatarShape('organization'), 'square');
});

test('the first image is the avatar, and moving one to the front is the reorder that is saved', () => {
    const images = [image('a'), image('b'), image('c')];
    assert.equal(primaryImage({ images }).hash, 'a');
    assert.equal(withImageFirst(images, 'a'), null);
    assert.equal(withImageFirst(images, 'missing'), null);
    assert.deepEqual(withImageFirst(images, 'c').map((item) => item.hash), ['c', 'a', 'b']);
});
