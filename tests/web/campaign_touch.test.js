/**
 * DU4: the campaign panel on a phone. Below 600 px (the bottom sheet) its controls are 44 px tall, the
 * three tabs share one row, inline words keep their look with a 44 px hit area, and the sheet's close
 * button is 44 px square.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => fs.readFileSync(path.join(root, 'apps/web/src', rel), 'utf8');

test('the campaign panel loads the phone rules, under the bottom sheet\'s width', () => {
    assert.match(read('workspace/CampaignPanel.vue'), /^import '\.\/campaign_touch\.css';$/m);
    const css = read('workspace/campaign_touch.css');
    assert.match(css, /@media \(max-width: 599px\) \{/);
    for (const control of ['.camp .ui-btn', '.camp select', '.camp .camp-tab', '.camp .dice-pick', '.camp .ui-seg button', '.camp .sheet-tab', '.camp .lnk-x']) {
        assert.ok(css.includes(control), control);
    }
    assert.match(css, /min-height: 44px;/);
    assert.match(css, /\.camp \.camp-tab small \{\s+display: none;/);
    assert.match(css, /\.camp \.party-name::before \{\s+position: absolute;\s+inset: -13px -6px;/);
    // Typed fields keep their height: the sheet's cells are not in the list.
    assert.doesNotMatch(css, /sheet-input/);
});

test('the sheet\'s close button is a thumb\'s size', () => {
    const panel = read('shell/Panel.vue');
    assert.match(panel, /width: var\(--corner-size\)/);
    assert.match(panel, /height: var\(--corner-size\)/);
    assert.match(panel, /@media \(max-width: 599px\) \{[\s\S]*--corner-size: 44px;/);
});
