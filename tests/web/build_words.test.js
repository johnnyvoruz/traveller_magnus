/**
 * Build's rules choice (stream E, E12): the sheet and the regenerate title do not call it an engine.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (rel) => readFileSync(new URL('../../apps/web/src/' + rel, import.meta.url), 'utf8');

test('the generate sheet names the rules, and the regenerate title names Generate with…', () => {
    const sheet = read('workspace/build/GenerateSheet.vue');
    const pane = read('workspace/build/BuildPane.vue');
    assert.match(sheet, /<legend class="ui-heading ui-kicker">Rules<\/legend>/);
    assert.doesNotMatch(sheet, />Engine</);
    assert.match(pane, /Open Generate with…, then select “Regenerate them too”\./);
    assert.doesNotMatch(pane, /Choose an engine/);
});
