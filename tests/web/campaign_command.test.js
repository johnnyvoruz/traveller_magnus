/**
 * The campaign in the command palette (stream N4): one "New …" per record type, Find, the
 * journal, the timeline and the party; registered through the one registry while signed in;
 * the panel carries out what needs the open campaign.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { CAMPAIGN_RECORD_TYPES } from '@voyage/shared';
import { campaignAsk, campaignCommands } from '../../apps/web/src/workspace/campaign_command.ts';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (file) => fs.readFileSync(path.join(root, 'apps/web/src', file), 'utf8');

test('one "New …" per record type, then the four ways in, each with its own id', () => {
    const list = campaignCommands();
    const names = list.map((command) => command.name);
    assert.equal(list.filter((command) => command.id.startsWith('campaign-new-')).length, CAMPAIGN_RECORD_TYPES.length);
    assert.ok(names.includes('New person'));
    assert.ok(names.includes('New vessel'));
    for (const name of ['Find a record…', 'Open the journal', 'Open the timeline', 'Go to the party', 'Start a session']) assert.ok(names.includes(name), name);
    assert.equal(new Set(list.map((command) => command.id)).size, list.length);
    assert.deepEqual({ ...campaignAsk }, { create: null, find: false, timeline: false, session: false });
});

test('registered by one line in the registry; the panel carries out the asks once the campaign is ready', () => {
    const registry = read('shell/registry.ts');
    assert.equal((registry.match(/offerCampaignCommands\(registerCommand\);/g) || []).length, 1);
    const panel = read('workspace/CampaignPanel.vue');
    assert.match(panel, /watch\(\(\) => \[campaignAsk\.create, campaignAsk\.find, campaignAsk\.timeline, status\.value, props\.open\] as const/);
    assert.match(panel, /if \(!props\.open \|\| status\.value !== 'ready'\) return;/);
    assert.match(panel, /if \(type\) create\(type\);/);
    assert.match(read('workspace/campaign_command.ts'), /watch\(\(\) => session\.user !== null/);
});
