/**
 * The record hover card (stream N2, campaign_manager_plan.md §4.4 rule 4): one card, mounted
 * once; record links opt in; it sits under the link, or over it when there is no room, inside
 * the view; touch never shows it.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { HIDE_AFTER, SHOW_AFTER, cardPlace, recordCard } from '../../apps/web/src/workspace/record_card.ts';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (file) => fs.readFileSync(path.join(root, 'apps/web/src/workspace', file), 'utf8');
const view = { width: 1600, height: 1000 };
const size = { width: 280, height: 140 };

test('the card goes under the link, over it near the bottom, and stays inside the view', () => {
    assert.deepEqual(cardPlace({ left: 100, top: 200, right: 300, bottom: 220 }, size, view), { left: 100, top: 226 });
    assert.deepEqual(cardPlace({ left: 100, top: 900, right: 300, bottom: 920 }, size, view), { left: 100, top: 754 });
    assert.deepEqual(cardPlace({ left: 1500, top: 200, right: 1580, bottom: 220 }, size, view), { left: 1312, top: 226 });
    const phone = { width: 390, height: 844 };
    assert.equal(cardPlace({ left: 200, top: 100, right: 380, bottom: 120 }, size, phone).left, 102);
    assert.equal(cardPlace({ left: 2, top: 100, right: 80, bottom: 120 }, size, phone).left, 8);
    assert.equal(cardPlace({ left: 10, top: 5, right: 80, bottom: 20 }, { width: 280, height: 900 }, phone).top, 26, 'no room either way: under the link');
});

test('the card waits 300 ms on a resting mouse, and starts closed', () => {
    assert.equal(SHOW_AFTER, 300);
    assert.ok(HIDE_AFTER > 0 && HIDE_AFTER < SHOW_AFTER);
    assert.equal(recordCard.id, null);
    const source = fs.readFileSync(path.join(root, 'apps/web/src/workspace/record_card.ts'), 'utf8');
    assert.match(source, /if \(event\.pointerType === 'touch' \|\| !state\.id\) return;/, 'touch never shows it');
    assert.match(source, /el\.matches\(':focus-visible'\)/, 'the keyboard shows it; a click does not');
    assert.match(source, /event\.key !== 'Escape'/);
});

test('mounted once, beside the panels; the record links opt in', () => {
    const host = fs.readFileSync(path.join(root, 'apps/web/src/shell/PanelHost.vue'), 'utf8');
    assert.equal((host.match(/<RecordCard \/>/g) || []).length, 1);
    assert.equal((read('CampaignPanel.vue').match(/<RecordCard \/>/g) || []).length, 0);
    assert.match(read('RecordsHere.vue'), /v-record-card="row\.record\.id"/);
    assert.match(read('LinksBlock.vue'), /v-record-card="item\.other\.id"/);
    assert.match(read('LinksBlock.vue'), /v-record-card="item\.id"/);
    assert.match(read('CampaignList.vue'), /v-record-card="item\.record\.id"/);
    assert.match(read('journal/RichNodes.vue'), /v-record-card="part\.kind === 'record' \? part\.id : null"/);
    assert.match(read('journal/EntryPage.vue'), /v-record-card="target\.startsWith\('cr_'\) \? target : null"/);
    assert.match(read('TimelineList.vue'), /v-record-card="row\.source === 'record' \? row\.id : null"/, 'record rows on the timeline (N9)');
    const card = read('RecordCard.vue');
    assert.match(card, /role="tooltip"/);
    assert.match(card, /<Teleport to="body">/);
});

test('the card names up to three connections and counts the rest (N10)', async () => {
    const { CARD_TIES, cardTies } = await import('../../apps/web/src/workspace/record_card.ts');
    assert.equal(CARD_TIES, 3);
    assert.deepEqual(cardTies([]), { shown: [], more: 0 });
    assert.deepEqual(cardTies(['a', 'b']), { shown: ['a', 'b'], more: 0 });
    assert.deepEqual(cardTies(['a', 'b', 'c', 'd', 'e']), { shown: ['a', 'b', 'c'], more: 2 });
    const card = read('RecordCard.vue');
    assert.match(card, /cardTies\(connectionsOf\(now\.id, campaign\.records, campaign\.links\)\)/, 'worded as the record page words them');
    assert.match(card, /<ul v-if="ties\.shown\.length" class="rcard-ties">/, 'nothing when it has none');
});
