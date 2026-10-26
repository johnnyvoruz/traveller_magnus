/**
 * The palette line "Publish this record…" (Johnny 2026-10-22 20:08, ZB1 question 4): offered only while a
 * record's page is open, by the page's own gate (market/record_publish.ts canPublishRecords). It opens the
 * Publish records dialog with that one record chosen. The build-publish command keeps its name.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { PUBLISH_RECORD_ID, PUBLISH_RECORD_NAME, publishThisRecord } from '../../apps/web/src/workspace/market/command.ts';
import { commands, registerCommand } from '../../apps/web/src/shell/registry.ts';

const read = (file) => readFileSync(new URL('../../apps/web/src/' + file, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

test('the command is named for one record and runs what the page gives it', () => {
    let opened = 0;
    let allowed = false;
    const command = publishThisRecord(() => allowed, () => { opened += 1; });
    assert.equal(PUBLISH_RECORD_NAME, 'Publish this record\u2026');
    assert.equal(command.id, PUBLISH_RECORD_ID);
    assert.equal(command.name, 'Publish this record\u2026');
    assert.equal(command.runnable(), false, 'the palette hides it while the gate says no');
    allowed = true;
    assert.equal(command.runnable(), true);
    command.run();
    assert.equal(opened, 1);
});

test('registered while the page is open, gone when it closes, and the build command is untouched', () => {
    const before = commands().filter((item) => item.id === PUBLISH_RECORD_ID).length;
    assert.equal(before, 0, 'not offered with no record page open');
    const stop = registerCommand(publishThisRecord(() => true, () => {}));
    assert.equal(commands().filter((item) => item.id === PUBLISH_RECORD_ID).length, 1);
    stop();
    assert.equal(commands().filter((item) => item.id === PUBLISH_RECORD_ID).length, 0);
    assert.match(read('workspace/build/commands.ts'), /\{ id: 'build-publish', name: 'Publish selection\u2026' \},/);
});

test('the record page registers it with its own gate and opens the dialog with its own record', () => {
    const page = read('workspace/RecordPage.vue');
    assert.match(page, /import \{ publishThisRecord \} from '\.\/market\/command\.ts';/);
    assert.match(page, /import \{ registerCommand \} from '\.\.\/shell\/registry\.ts';/);
    assert.match(page, /const stopPublishCommand = registerCommand\(publishThisRecord\(\(\) => canPublish\.value, \(\) => \{ publishing\.value = true; \}\)\);/);
    assert.match(page, /onBeforeUnmount\(stopPublishCommand\);/);
    assert.match(page, /const canPublish = computed\(\(\) => canPublishRecords\(props\.readOnly, record\.value \? 1 : 0\)\);/);
    assert.match(page, /<RecordsPublish v-if="publishing" :start="publishStart"/);
});

test('the other publish commands are still where they were', () => {
    const source = read('workspace/market/command.ts');
    assert.match(source, /register\(\{ id: 'publish-records', name: 'Publish records', run: askPublishRecords \}\)/);
    assert.match(source, /register\(\{ id: 'my-packages', name: 'My packages'/);
});