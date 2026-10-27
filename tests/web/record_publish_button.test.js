/**
 * ZB1 item 2: Publish on a record's own page. One gate (market/record_publish.ts) for the records
 * list and the page: the open campaign's owner, signed in, not read-only. The page's button opens
 * the Publish records dialog with that one record chosen. A player's page never has it. The dialog
 * leads with the referee-only warning whenever a chosen record is referee-only.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { REFEREE_ONLY_NOTE } from '../../apps/web/src/workspace/market/market.ts';
import { canPublishRecords, refereeLead } from '../../apps/web/src/workspace/market/record_publish.ts';

const read = (file) => readFileSync(new URL('../../apps/web/src/workspace/' + file, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

test('the gate says no on a read-only page and with no record, before it asks who is signed in', () => {
    assert.equal(canPublishRecords(true, 3), false);
    assert.equal(canPublishRecords(false, 0), false);
});

test('the warning is the one sentence for one record, and counts for more; both say what goes out and what stays', () => {
    assert.equal(refereeLead(1), REFEREE_ONLY_NOTE);
    assert.match(refereeLead(3), /^3 of the chosen records are referee-only\./);
    for (const line of [refereeLead(1), refereeLead(3)]) {
        assert.match(line, /name, kind and tags/);
        assert.match(line, /player notes and sheets? stay with you/);
        assert.doesNotMatch(line, /whole record/);
        assert.doesNotMatch(line, /as it stands/);
    }
});

test('the record page uses the shared gate and opens the dialog with its own record', () => {
    const page = read('RecordPage.vue');
    assert.match(page, /import \{ canPublishRecords \} from '\.\/market\/record_publish\.ts';/);
    assert.match(page, /const canPublish = computed\(\(\) => canPublishRecords\(props\.readOnly, record\.value \? 1 : 0\)\);/);
    assert.match(page, /const RecordsPublish = defineAsyncComponent\(\(\) => import\('\.\/market\/RecordsPublish\.vue'\)\);/);
    assert.match(page, /const publishStart = computed\(\(\) => \[props\.id\]\);/);
    assert.match(page, /<button v-if="canPublish" type="button" class="ui-btn rec-publish"[^>]*data-publish-record @click="publishing = true">/);
    assert.match(page, /<RecordsPublish v-if="publishing" :start="publishStart" @close="publishing = false" \/>/);
    const foot = page.slice(page.indexOf('<footer class="rec-foot">'), page.indexOf('</footer>'));
    assert.ok(foot.includes('data-publish-record') && foot.includes('rec-delete'), 'in the footer, with Print and Delete');
});

test('a player\'s record page never has it', () => {
    const player = read('players/PlayerRecordPage.vue');
    for (const word of ['record_publish', 'RecordsPublish', 'canPublish', 'data-publish-record']) assert.ok(!player.includes(word), word);
});

test('the records list uses the same gate, and its button and dialog are as they were', () => {
    const list = read('CampaignList.vue');
    assert.match(list, /import \{ canPublishRecords \} from '\.\/market\/record_publish\.ts';/);
    assert.match(list, /const canPublish = computed\(\(\) => canPublishRecords\(props\.readOnly, all\.value\.length\)\);/);
    assert.ok(!list.includes('row.ownerId'), 'the owner test lives in one place');
});

test('the dialog leads with the warning, and the line under each record stays', () => {
    const dialog = read('market/RecordsPublish.vue');
    assert.match(dialog, /<p v-if="refereeChosen > 0" class="mk-note" role="alert" data-referee-lead><b>\{\{ refereeLead\(refereeChosen\) \}\}<\/b>/);
    assert.ok(dialog.indexOf('data-referee-lead') < dialog.indexOf('<PublishFields'), 'before the fields and the Publish button');
    assert.ok(dialog.includes('data-referee-only'));
});

test('no server file changed for it: the server still publishes the stored record whole', () => {
    const server = readFileSync(new URL('../../apps/api/src/universe/publish_read.ts', import.meta.url), 'utf8');
    assert.ok(server.includes('storedCampaignRecord'));
});