/**
 * DU6 (UX backlog U6, D's half): the Timeline screen shows A's campaign timeline, with each ship's
 * legs and the party's row on Today, and a leg or the Today row opens its ship.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => fs.readFileSync(path.join(root, 'apps/web/src', rel), 'utf8');

test('the screen reads the campaign timeline with the party, not the record page\'s list', () => {
    const list = read('workspace/TimelineList.vue');
    assert.match(list, /return campaignTimeline\(\{\s+entries: entriesByDate\(\),\s+records: campaign\.records,\s+clockDays: campaign\.clock \? campaign\.clock\.days : null,\s+party: campaign\.settings \? campaign\.settings\.party : null,\s+\}\);/);
    assert.doesNotMatch(list, /buildTimeline\(/);
    assert.match(list, /:data-source="row\.source"/);
});

test('the type menu and Only this ship change the address: two Timeline panes differ by type, ship or row', () => {
    const panel = read('workspace/CampaignPanel.vue');
    assert.match(panel, /if \(now\.kind === 'timeline' && pane\.kind === 'timeline'\) return now\.type === pane\.type && now\.ship === pane\.ship && now\.row === pane\.row;/);
});

test('a row opens what it is: an entry, a record, a leg\'s ship, Today\'s ship or the Party tab', () => {
    const panel = read('workspace/CampaignPanel.vue');
    assert.match(panel, /if \(row\.source === 'entry'\) goEntry\(row\.id\);\s+else if \(row\.source === 'record'\) go\(row\.id\);\s+else if \(row\.shipId\) go\(row\.shipId\);\s+else showTab\('party'\);/);
});
