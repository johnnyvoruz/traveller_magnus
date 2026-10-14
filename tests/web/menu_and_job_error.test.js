/**
 * prompts/d_menu_and_job_error.md: the account menu on the body, the one-sector limit said
 * before a request is sent, a failed job's sentence, the generator's label, and the line under
 * the public games switch when the party has no place.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { ONE_SECTOR_HEXES, ONE_SECTOR_SLOTS, oneSectorSay, sectorsOf } from '../../apps/web/src/workspace/build/one_sector.ts';
import { slotSlug } from '../../apps/web/src/workspace/build/sectors.ts';
import { choiceLine, errorOf, GENERATOR_LABEL, jobError, jobLine, jobToast } from '../../apps/web/src/workspace/build/state.ts';
import { partyOnChart, PUBLIC_GAMES_NO_PLACE } from '../../apps/web/src/workspace/public_games.ts';

const read = (file) => readFileSync(new URL('../../' + file, import.meta.url), 'utf8');
const build = (file) => read('apps/web/src/workspace/build/' + file);

test('the account menu is on the body, above any panel, with the expanded rail’s width carried over', () => {
    const menu = read('apps/web/src/workspace/AccountMenu.vue');
    const template = menu.split('<template>')[1].split('<style>')[0];
    assert.match(template, /^\s*<!--[^>]*-->\s*<Teleport to="body">\s*<div v-if="open" class="account-backdrop"/);
    assert.match(template, /<\/section>\s*<\/Teleport>\s*<\/template>/);
    assert.match(menu, /body:has\(\.rail\.is-expanded\) \.account-pop \{\s*--rail-width: var\(--rail-width-open\);/);
    assert.match(menu, /\.account-pop \{\s*position: fixed;/);
});

test('one sector is one request; two are named before anything is sent', () => {
    const a = 'Spinward_Marches';
    const slot1 = slotSlug({ x: 9, y: 9 });
    const slot2 = slotSlug({ x: 10, y: 9 });
    assert.deepEqual(sectorsOf([a + '/3210', a + '/3211', 'Deneb/0110']), [a, 'Deneb']);
    // A sector, a subsector, or any box inside one sector goes.
    assert.equal(oneSectorSay([a + '/0101', a + '/3240']), '');
    assert.equal(oneSectorSay([]), '');
    assert.equal(oneSectorSay([slot1 + '/0101', slot1 + '/0102']), '');
    // A drag across a border.
    assert.equal(oneSectorSay([a + '/3210', 'Deneb/0110']), ONE_SECTOR_HEXES);
    // Two empty slots: the sectors are made one at a time.
    assert.equal(oneSectorSay([slot1 + '/3210', slot2 + '/0110']), ONE_SECTOR_SLOTS);
    // A slot and a sector that exists: still two.
    assert.equal(oneSectorSay([slot1 + '/3210', a + '/0110']), ONE_SECTOR_HEXES);
    assert.equal(ONE_SECTOR_HEXES, 'You can generate in one sector at a time. Select hexes inside one sector, and then select Generate.');
    assert.equal(ONE_SECTOR_SLOTS, 'You can create one sector at a time. Select hexes inside one empty sector slot, and then generate. Repeat for each slot.');
});

test('every way to Generate many hexes stops at two sectors', () => {
    // The two acts that send the request.
    assert.match(build('acts.ts'), /const two = oneSectorSay\(targets\);\s+if \(two\) \{\s+build\.sheetOpen = false;\s+build\.error = two;\s+return;/);
    assert.match(build('grow_acts.ts'), /const two = oneSectorSay\(targets\);\s+if \(two\) \{\s+build\.sheetOpen = false;\s+growUi\.error = two;\s+return;/);
    // Both stand before the store is called.
    for (const [file, call] of [['acts.ts', 'store.generateMany('], ['grow_acts.ts', 'store.generateGrowing(']]) {
        const text = build(file);
        assert.ok(text.indexOf('const two = oneSectorSay(targets);') < text.indexOf(call), file);
    }
    // The density prompt is not opened; the G key, the palette and the right-click lines are off, and the menu says why.
    assert.match(build('density_ask.ts'), /if \(oneSectorFor\(keys\)\) return;/);
    assert.match(build('commands.ts'), /if \(\(id === 'build-generate' \|\| id === 'build-generate-with'\) && oneSectorFor\(keys\)\) return false;/);
    assert.match(build('commands.ts'), /if \(first\) first\.say = two;/);
    // The pane: Generate off, the sentence under it, and the way into the full sheet off too.
    const pane = build('BuildPane.vue');
    assert.match(pane, /:disabled="busy \|\| oneHeld \|\| twoSay !== ''"/);
    assert.match(pane, /<p v-if="twoSay" id="build-one-sector" class="build-allowance is-held" role="status" data-build-one-sector>\{\{ twoSay \}\}<\/p>/);
    assert.match(pane, /class="build-link" :disabled="busy \|\| twoSay !== ''"/);
});

test('a job that failed whole says the server’s sentence, in the toast and in the line', () => {
    const lost = { total: 80, done: 0, failed: [], state: 'done', placed: [], leftEmpty: 0, error: 'The limit is one sector per request.' };
    assert.equal(jobError(lost), 'The limit is one sector per request.');
    assert.equal(jobToast(lost, 'Regina'), 'The limit is one sector per request.');
    assert.equal(jobLine({ ...lost, label: 'Generating up to 80 systems' }), 'The limit is one sector per request.');
    // Failed hexes are counted as before, with or without a sentence.
    const some = { ...lost, done: 80, failed: ['Spinward_Marches/1910'], placed: ['Spinward_Marches/1911'] };
    assert.equal(jobError(some), '');
    assert.equal(jobToast(some, 'Regina'), 'Generated 1 system in Regina. 1 hex failed.');
    assert.equal(jobToast({ ...lost, error: undefined, placed: ['Spinward_Marches/1911'] }, ''), 'Generated 1 system.');
    // The store's progress is read for the sentence whatever its type says.
    assert.equal(errorOf({ error: 'The limit is one sector per request.' }), 'The limit is one sector per request.');
    assert.equal(errorOf({ error: '' }), undefined);
    assert.equal(errorOf({ error: 5 }), undefined);
    assert.equal(errorOf({}), undefined);
    // Each place a job ends keeps the sentence beside Generate.
    for (const file of ['acts.ts', 'grow_acts.ts', 'job_toast.ts']) assert.match(build(file), /if \(lost\) \{\s+build\.error = lost;\s+showToast\(lost/, file);
});

test('the generator reads "from the star outward"', () => {
    assert.equal(GENERATOR_LABEL['top-down'], 'Full system, from the star outward');
    assert.equal(choiceLine({ engine: 'MgT2E', generator: 'top-down' }), 'Mongoose 2nd Ed (MgT2E) · full system, from the star outward');
});

test('under the switch, on, with the party nowhere on the chart: one line, gone once it has a place', () => {
    assert.equal(PUBLIC_GAMES_NO_PLACE, 'Your party isn’t on the chart yet. Choose the ship and set where it is.');
    assert.equal(partyOnChart(null), false);
    assert.equal(partyOnChart(''), false);
    assert.equal(partyOnChart('~slot_3_-1/0101'), false);
    assert.equal(partyOnChart('Spinward_Marches/1910'), true);
    const menu = read('apps/web/src/workspace/AccountMenu.vue');
    assert.match(menu, /if \(publicOn\.value !== true \|\| campaign\.status !== 'ready' \|\| !campaign\.settings\) return false;/);
    assert.match(menu, /<p v-if="openOne && publicNowhere" class="account-say is-todo" role="status" data-public-nowhere>\{\{ PUBLIC_GAMES_NO_PLACE \}\}<\/p>/);
});
