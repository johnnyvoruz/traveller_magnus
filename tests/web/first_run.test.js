/**
 * The first-run card leaves only when a vessel has a place and the date is set.
 * An open world ticks step 1 and does not hide the card.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { newRecord } from '../../apps/web/src/workspace/records.ts';
import { systemAnchor } from '../../apps/web/src/workspace/places.ts';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dateIsSet, firstRunCard, firstRunCurrent, vesselHasPlace, worldIsOpen } from '../../apps/web/src/workspace/first_run.ts';
import { DEFAULT_CAMPAIGN_NAME, isDefaultName, nameToSave, openCampaignName, stillCalledWords } from '../../apps/web/src/workspace/campaign_name.ts';

const src = (file) => fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../../apps/web/src', file), 'utf8');

const STAMP = '2026-10-17T12:00:00.000Z';
const REGINA = 'Spinward_Marches/1910';
const id = (n) => 'cr_' + String(n).padStart(8, '0') + '-0000-4000-8000-000000000000';
const byId = (list) => Object.fromEntries(list.map((record) => [record.id, record]));

test('an open world is a four-digit hex that is not missing', () => {
    assert.equal(worldIsOpen(null), false);
    assert.equal(worldIsOpen({ hex: '', missing: false }), false);
    assert.equal(worldIsOpen({ hex: '1910', missing: true }), false);
    assert.equal(worldIsOpen({ hex: '191', missing: false }), false);
    assert.equal(worldIsOpen({ hex: '1910', missing: false }), true);
});

test('a vessel has a place only when a live vessel resolves to a system', () => {
    const loose = newRecord('vessel', id(1), STAMP, null);
    const person = newRecord('person', id(2), STAMP, systemAnchor(REGINA, 'Regina', null));
    const placed = newRecord('vessel', id(3), STAMP, systemAnchor(REGINA, 'Regina', null));
    const gone = { ...placed, id: id(4), deleted: true };
    const aboard = newRecord('vessel', id(5), STAMP, { kind: 'record', id: person.id });
    assert.equal(vesselHasPlace({}), false);
    assert.equal(vesselHasPlace(byId([loose])), false);
    assert.equal(vesselHasPlace(byId([person])), false);
    assert.equal(vesselHasPlace(byId([gone])), false);
    assert.equal(vesselHasPlace(byId([placed])), true);
    assert.equal(vesselHasPlace(byId([person, aboard])), true);
});

test('the card shows for none and for one condition, and hides when the ship and the date are both set', () => {
    const none = firstRunCard({ worldOpen: false, shipPlaced: false, dateSet: false });
    assert.deepEqual(none, { show: true, world: false, ship: false, date: false });
    assert.equal(firstRunCurrent(none), 1);

    const world = firstRunCard({ worldOpen: true, shipPlaced: false, dateSet: false });
    assert.equal(world.show, true);
    assert.equal(world.world, true);
    assert.equal(firstRunCurrent(world), 2);

    const ship = firstRunCard({ worldOpen: false, shipPlaced: true, dateSet: false });
    assert.equal(ship.show, true);
    assert.equal(firstRunCurrent(ship), 1);

    const date = firstRunCard({ worldOpen: true, shipPlaced: false, dateSet: true });
    assert.equal(date.show, true);
    assert.equal(firstRunCurrent(date), 2);

    const both = firstRunCard({ worldOpen: true, shipPlaced: true, dateSet: true });
    assert.deepEqual(both, { show: false, world: true, ship: true, date: true });

    const bothClosed = firstRunCard({ worldOpen: false, shipPlaced: true, dateSet: true });
    assert.equal(bothClosed.show, false);
    assert.equal(dateIsSet(null), false);
    assert.equal(dateIsSet({ days: 1, rev: 0 }), true);
});

test('the first campaign asks its name (DU44): the store\'s "My map" is the default, a typed name saves cleaned, blank or unchanged saves nothing', () => {
    assert.equal(DEFAULT_CAMPAIGN_NAME, 'My map');
    assert.match(src('campaign/store.ts'), /postCampaign\('My map'\)/, 'the store still makes the first campaign under that name');
    assert.equal(isDefaultName('My map'), true);
    assert.equal(isDefaultName('  My  map '), true);
    assert.equal(isDefaultName('Kestrel Run'), false);
    assert.equal(isDefaultName(''), false);
    const universes = [{ id: 'uni-1', name: 'My map' }, { id: 'uni-2', name: 'Kestrel Run' }];
    assert.equal(openCampaignName(universes, 'uni-2'), 'Kestrel Run');
    assert.equal(openCampaignName(universes, 'uni-9'), '');
    assert.equal(openCampaignName(universes, null), '');
    assert.equal(nameToSave('  Kestrel   Run ', 'My map'), 'Kestrel Run');
    assert.equal(nameToSave('', 'My map'), null);
    assert.equal(nameToSave('   ', 'My map'), null);
    assert.equal(nameToSave('My map', 'My map'), null);
    assert.equal(nameToSave(' My  map ', 'My map'), null, 'the same name after cleaning');
    assert.equal(stillCalledWords('My map'), 'Your campaign is still called My map.');
});

test('the name box sits first on Start here and beside the invite link while the name is "My map" (DU44 pins)', () => {
    const first = src('workspace/FirstRun.vue');
    assert.match(first, /<ol class="ui-steps">\s+<li class="ui-step" :class="\{ 'is-lit': named \}" data-first-run-name>\s+<p>Name your campaign<\/p>\s+<CampaignName :read-only="readOnly" label="Campaign name" \/>\s+<p class="first-run-solo">Playing solo\? Everything here is yours; invite players later or never\.<\/p>/, 'the first step');
    assert.match(first, /const named = computed\(\(\) => !isDefaultName\(openCampaignName\(campaign\.universes, campaign\.universeId\)\)\);/);
    const box = src('workspace/CampaignName.vue');
    assert.match(box, /data-campaign-name\s+@keydown\.enter\.prevent="save"\s+@keydown\.esc="reset"\s+@keydown\.stop\s+@blur="save"/, 'saved on Enter or on leaving the box');
    assert.match(box, /await renameCampaign\(id, name\);/, 'the Campaigns panel\'s own rename; no new store call');
    assert.match(box, /showToast\('The campaign could not be renamed\. Try again\.'\)/);
    const board = src('workspace/players/PlayersBoard.vue');
    assert.match(board, /<template v-if="campaignName && isDefaultName\(campaignName\)">\s+<p v-if="!renaming" class="players-fine players-named" data-players-still-named>\s+\{\{ stillCalledWords\(campaignName\) \}\}\s+<button type="button" class="ui-btn" :disabled="readOnly" data-players-rename @click="renaming = true">Rename<\/button>\s+<\/p>\s+<CampaignName v-else :read-only="readOnly" label="Campaign name" @saved="renaming = false" \/>/, 'the invite box');
    assert.match(src('workspace/players/PlayersSection.vue'), /:campaign-name="campaignName"/);
});
