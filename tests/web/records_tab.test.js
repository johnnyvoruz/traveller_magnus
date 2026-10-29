/**
 * DU34: the Records tab, less chrome (Johnny 2026-10-29). The chip rule (a kind with no records is not a
 * chip; the chosen one stays), a grouped row's words (the place alone under the kind's heading), and
 * the wiring: no Timeline or Publish button in the list's tool row, the three head buttons under the
 * menu at Column, the campaign date on the Party tab, and the chips on one scrolling line at Column.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { RECORD_TYPES, typeCounts } from '../../apps/web/src/workspace/records.ts';
import { kindChips, rowMeta, stripEdges } from '../../apps/web/src/workspace/records_tab.ts';

const read = (file) => readFileSync(new URL('../../apps/web/src/' + file, import.meta.url), 'utf8');
const record = (type, name) => ({ id: 'cr_' + name, type, name, deleted: false });

describe('the Records tab, less chrome (DU34)', () => {
    test('a kind with no records is not a chip; the kinds keep their order; the chosen kind stays while chosen', () => {
        const counts = typeCounts([record('person', 'Voss'), record('person', 'Kale'), record('vessel', 'Bright Ledger'), record('place', 'Startown')]);
        assert.deepEqual(kindChips(counts, 'all').map((info) => info.type), ['person', 'place', 'vessel'], 'three of nine, in the chips\' order');
        assert.deepEqual(kindChips(counts, 'all').map((info) => counts[info.type]), [2, 1, 1], 'the counts come with them');
        assert.deepEqual(kindChips(counts, 'vessel').map((info) => info.type), ['person', 'place', 'vessel']);
        // The last job deleted while Jobs is chosen: its chip stays, at 0, so the choice can be seen and undone.
        assert.deepEqual(kindChips(counts, 'job').map((info) => info.type), ['person', 'place', 'job', 'vessel']);
        assert.deepEqual(kindChips(typeCounts([]), 'all'), [], 'no records: no chips but All');
        const every = typeCounts(RECORD_TYPES.map((info) => record(info.type, info.type)));
        assert.equal(kindChips(every, 'all').length, RECORD_TYPES.length, 'every kind with a record is a chip');
    });

    test('a grouped row says the place alone; a chosen kind\'s row says the kind too', () => {
        assert.equal(rowMeta('Person', 'Nowhere in particular', true), 'Nowhere in particular');
        assert.equal(rowMeta('Person', 'Nowhere in particular', false), 'Person · Nowhere in particular');
        assert.equal(rowMeta('Vessel', 'Spinward Marches 1910 · Regina system', false), 'Vessel · Spinward Marches 1910 · Regina system');
    });

    test('the list: search and Add on the tool row, the chips from the rule, the row words; no Timeline, no Publish button', () => {
        const list = read('workspace/CampaignList.vue');
        assert.match(list, /const chips = computed\(\(\) => kindChips\(counts\.value, filter\.value\)\);/);
        assert.match(list, /v-for="info in chips"/);
        assert.doesNotMatch(list, /v-for="info in RECORD_TYPES"/);
        assert.match(list, /\{\{ rowMeta\(typeInfo\(item\.record\.type\)\.one, placeNow\(item\.record\), grouped\) \}\}/);
        assert.doesNotMatch(list, /emit\('timeline'\)/, 'the head\'s Timeline is the same screen');
        assert.doesNotMatch(list, /data-publish-records|camp-publish/, 'Publish is the head menu\'s');
        assert.match(list, /<RecordsPublish v-if="publishing" :start="publishStart" @close="publishing = false" \/>/, 'the dialog still opens here, on the ask');
        assert.match(list, /watch\(\(\) => \[publishAsk\.records, campaign\.status\] as const/);
        const tool = list.slice(list.indexOf('<div class="camp-tool">'), list.indexOf('</div>', list.indexOf('<div class="camp-tool">')));
        assert.ok(tool.includes('camp-search') && tool.includes('<AddButton'), 'the search and Add');
        assert.equal((tool.match(/<button/g) || []).length, 0, 'no other button on the tool row');
        assert.match(list, /\.camp\[data-span="column"\] \.camp-types \{\s+flex-wrap: nowrap;\s+overflow-x: auto;/, 'one line at Column');
        assert.match(list, /<label class="camp-sort">/, 'the order stays at the chips\' right');
    });

    test('the panel: the date on the Party tab, the head\'s buttons under the menu at Column, Publish from the menu', () => {
        const panel = read('workspace/CampaignPanel.vue');
        assert.match(panel, /<ClockLine v-if="status === 'ready' && tab === 'party' && !recordId && !entryId" ref="clockLine" :read-only="ro" \/>/);
        assert.match(panel, /const headFolded = computed\(\(\) => span\.value === 'column' && isReferee\.value\);/);
        assert.match(panel, /<button v-if="!headFolded" type="button" class="camp-timeline" :aria-pressed="onTimeline \? 'true' : 'false'" @click="openTimeline">Timeline<\/button>/);
        assert.match(panel, /<button v-if="!headFolded" type="button" class="camp-timeline" :aria-pressed="onWeb \? 'true' : 'false'" data-open-web @click="openWeb">Relationships<\/button>/);
        assert.match(panel, /<button v-if="isReferee && !headFolded" type="button" class="camp-timeline camp-session"/);
        assert.match(panel, /<CampaignMenu v-if="isReferee" :folded="headFolded" :publish="canPublish" :live="sessionLive" @timeline="openTimeline" @web="openWeb" @session="openSession" @publish="openPublish" @proposals="openProposals" \/>/);
        assert.match(panel, /const canPublish = computed\(\(\) => canPublishRecords\(ro\.value, recordCount\.value\)\);/);
        assert.match(panel, /function openPublish\(\): void \{\s+publishAsk\.records = true;\s+if \(props\.tab !== 'records' \|\| onTimeline\.value \|\| onWeb\.value \|\| onProposals\.value \|\| onSession\.value\) showTab\('records'\);/);
        assert.doesNotMatch(panel, /<CampaignList[^>]*@timeline/, 'the list has no Timeline button to wire');
        // The first-run card's Set the date and the map's date pill open the field on the Party tab.
        assert.match(panel, /if \(props\.tab !== 'party'\) \{\s+showTab\('party'\);\s+return;\s+\}\s+editDateNext\.value = false;/);
        assert.match(panel, /function editFirstDate\(\): void \{\s+if \(!online\.value\) return;\s+editDateNext\.value = true;\s+\}/);
        assert.match(panel, /\.camp-tabs \{\s+display: flex;\s+flex: 1 1 200px;/, 'the party line shrinks before the menu wraps');
        assert.match(panel, /\.camp\[data-span="half"\] \.camp-timeline \{\s+padding: 6px 7px 8px;/, 'the head keeps one row at Half');
        assert.match(read('workspace/campaign_touch.css'), /\.camp \.camp-tab > \.ui-icon \{\s+display: none;/, 'on a phone the tabs and the menu share the row');
        assert.match(read('workspace/CampaignList.vue'), /\.camp-search \{\s+flex: 1 1 140px;/, 'search and Add share the row on a phone');
        const menu = read('workspace/proposals/CampaignMenu.vue');
        for (const item of ['timeline', 'web', 'session']) assert.match(menu, new RegExp('<button v-if="folded" type="button" role="menuitem" data-menu-' + item + ' @click="pick\\(\'' + item + '\'\\)">'));
        assert.match(menu, /<button v-if="publish" type="button" role="menuitem" data-menu-publish @click="pick\('publish'\)">/);
        assert.match(menu, /<i v-if="live" class="camp-live" aria-hidden="true"><\/i>/, 'the live mark follows Session into the menu');
        const items = [...menu.matchAll(/data-menu-([a-z]+)/g)].map((m) => m[1]);
        assert.deepEqual(items, ['timeline', 'web', 'session', 'publish', 'copy', 'proposals'], 'the head\'s three first, then the rare acts');
    });
});

describe('the here chip follows the view (DF24)', () => {
    test('the list reads the place again whenever the view publishes its frame, and lets go on unmount', () => {
        const list = read('workspace/CampaignList.vue');
        assert.match(list, /import \{ onFrame \} from '\.\.\/shell\/frame\.ts';/);
        assert.match(list, /onMounted\(\(\) => \{\s+bindKeys\(\);\s+readHere\(\);\s+stopFrame = onFrame\(readHere\);/, 'the name arrives with the index after the hex');
        assert.match(list, /if \(stopFrame\) stopFrame\(\);\s+stopFrame = null;/);
        // The map republishes its frame when the dossier's entry changes, so the chip's name follows the index.
        const map = read('views/MapView.vue');
        assert.match(map, /watch\(\s+\(\) => \[\s+dossier\.value,\s+dossierEntry\.value,/);
        assert.match(map, /\] as const,\s+\(\) => \{ publishFrame\(\); \},/);
    });
});

describe('the Column chip strip says it scrolls (DU35)', () => {
    test('the edges with more beyond them; nothing when the strip fits', () => {
        assert.equal(stripEdges(0, 300, 300), '');
        assert.equal(stripEdges(0, 300, 301), '', 'a pixel of rounding is not more');
        assert.equal(stripEdges(0, 300, 480), 'right');
        assert.equal(stripEdges(180, 300, 480), 'left');
        assert.equal(stripEdges(90, 300, 480), 'both');
        assert.equal(stripEdges(1, 300, 480), 'right', 'a pixel scrolled is not yet left');
    });

    test('the list reads the strip on scroll, on resize and when the chips change; the fade is a mask at Column only', () => {
        const list = read('workspace/CampaignList.vue');
        assert.match(list, /<div ref="typesEl" class="camp-types" role="radiogroup" aria-label="Type" :data-more="stripMore \|\| undefined" @scroll\.passive="readStrip">/);
        assert.match(list, /stripMore\.value = el \? stripEdges\(el\.scrollLeft, el\.clientWidth, el\.scrollWidth\) : '';/);
        assert.match(list, /watch\(chips, \(\) => \{ void nextTick\(readStrip\); \}\);/);
        assert.match(list, /stopStrip = el \? observeSize\(el, readStrip\) : null;/);
        assert.match(list, /if \(stopStrip\) stopStrip\(\);\s+stopStrip = null;\s+\}\);/, 'released on unmount');
        for (const side of ['right', 'left', 'both']) assert.match(list, new RegExp('\\.camp\\[data-span="column"\\] \\.camp-types\\[data-more="' + side + '"\\] \\{\\s+-webkit-mask-image: linear-gradient'));
        assert.doesNotMatch(list, /\.camp-types\[data-more[^\n]*\n[^\n]*background/, 'a mask, not a painted gradient: the list\'s ground shows through');
    });
});
