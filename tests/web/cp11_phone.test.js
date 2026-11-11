/**
 * CP11: Set for the selection, Move credits, and the help close are 44 px on a phone.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

function read(path) {
    return readFileSync(new URL(path, import.meta.url), 'utf8');
}

test('Set for the selection is 44 px below 600 px', () => {
    const vue = read('../../apps/web/src/workspace/build/SetMany.vue');
    assert.match(vue, /@media \(max-width: 599px\) \{[\s\S]*\.set-many-box \{[\s\S]*height: 44px;[\s\S]*\.set-many-row \.ui-btn \{[\s\S]*min-height: 44px;/);
});

test('Move credits choices are 44 px below 640 px', () => {
    const vue = read('../../apps/web/src/workspace/VesselTrade.vue');
    assert.match(vue, /@media \(max-width: 640px\) \{[\s\S]*\.vt-check \{[\s\S]*min-height: 44px;/);
});

test('the help close is 44 px below 600 px', () => {
    const vue = read('../../apps/web/src/workspace/HelpWindow.vue');
    assert.match(vue, /@media \(max-width: 599px\) \{[\s\S]*\.help \.ui-btn\.is-icon\.help-close \{[\s\S]*width: 44px;[\s\S]*height: 44px;/);
});
