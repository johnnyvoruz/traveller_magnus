/**
 * ZB1 item 1: the map's publish buttons. "Publish selection" is the existing build-publish command;
 * the buttons only run it. Many hexes selected: a button in the Build pane's many-mode row, between
 * Restore and Remove. One system: a visible Publish button in the Build bar, beside Edit and the
 * menu that already offers it. The command itself, and its gate, are not changed.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (file) => readFileSync(new URL('../../apps/web/src/workspace/build/' + file, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const ELLIPSIS = '\u2026';

test('the command is unchanged: same id, same name, same gate', () => {
    const commands = read('commands.ts');
    assert.ok(commands.includes("{ id: 'build-publish', name: 'Publish selection" + ELLIPSIS + "' }"));
    assert.match(commands, /signedIn\(\) && draftHandle\.value === null && !edit\.opening && !build\.preview && canPublish\(keys, hexState\)/);
    assert.match(commands, /openPublish\(kindOfKeys\(keys\)\)/);
});

test('the Build pane has Publish selection in the many-mode row, between Restore and Remove', () => {
    const pane = read('BuildPane.vue');
    assert.match(pane, /import \{ canBuild, runBuild \} from '\.\/commands\.ts';/);
    const row = pane.slice(pane.indexOf('<div v-if="mode === \'many\'" class="build-acts build-more">'));
    const end = row.indexOf('</div>');
    const acts = row.slice(0, end);
    const restore = acts.indexOf('@click="restoreHexes(keys)"');
    const publish = acts.indexOf('data-command="build-publish"');
    const remove = acts.indexOf('@click="removeHexes(keys)"');
    assert.ok(restore > 0 && publish > restore && remove > publish, 'Restore, then Publish selection, then Remove');
    assert.match(acts, /<button v-if="canBuild\('build-publish', keys\)" type="button" class="ui-btn" data-command="build-publish" :disabled="busy"/);
    assert.match(acts, /@click="runBuild\('build-publish', keys\)"/);
    assert.ok(acts.includes('Publish selection' + ELLIPSIS), 'the label is the command\'s name');
    assert.match(pane, /<PublishForm v-if="marketUi\.open && mode !== 'empty'"/, 'it opens the form the command opens');
});

test('the Build bar has a visible Publish button that runs the same command, held while a job runs', () => {
    const bar = read('BuildBar.vue');
    const at = bar.indexOf('<template v-else>');
    const normal = bar.slice(at, bar.indexOf('<BuildMenu', at));
    const edit = normal.indexOf('data-command="build-edit"');
    const publish = normal.indexOf('data-command="build-publish"');
    const more = normal.indexOf('aria-label="More build actions"');
    assert.ok(edit > 0 && publish > edit && more > publish, 'Edit, Publish, then the menu button');
    assert.match(normal, /v-if="publishCommand"[\s\S]*?:disabled="busy"[\s\S]*?@click="publishCommand\.run\(\)"/);
    assert.ok(normal.includes('Publish' + ELLIPSIS + '\n'), 'a short label, so it fits the column');
    assert.match(bar, /const publishCommand = computed\(\(\) => \{ void build\.selection\.length; const found = commands\(\)\.find\(\(item\) => item\.id === 'build-publish'\); return found && \(!found\.runnable \|\| found\.runnable\(\)\) \? found : null; \}\);/);
    assert.match(bar, /id: 'publish', label: 'Publish selection/, 'the menu still offers it');
});

test('the new buttons use no colour, time, dialog or DOM shortcut', () => {
    for (const file of ['BuildPane.vue', 'BuildBar.vue']) {
        const text = read(file);
        for (const word of ['window.', 'alert(', 'confirm(', 'prompt(', 'innerHTML', 'getElementById']) assert.ok(!text.includes(word), file + ' has ' + word);
        assert.doesNotMatch(text, /#[0-9a-fA-F]{3,8}\b/, file + ' has a hex colour');
    }
});