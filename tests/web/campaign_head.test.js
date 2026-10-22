/**
 * DF18: the Campaign panel's three tabs keep one row. At Column the Party tab's line ("Bright Ledger and Cold
 * Manifest, 2 aboard") pushed the Journal tab onto a row of its own. The row does not wrap; Records and Journal
 * keep their size; the Party tab gives way, and its line ends in its ellipsis. Below 600 px the touch rules
 * hide that line, as before.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => fs.readFileSync(path.join(root, 'apps', 'web', 'src', rel), 'utf8');
const rule = (css, selector) => {
    const at = css.indexOf('\n' + selector + ' {');
    assert.ok(at >= 0, selector);
    return css.slice(at, css.indexOf('}', at));
};

test('the three tabs keep one row; the Party tab gives way', () => {
    const panel = read('workspace/CampaignPanel.vue').replace(/\r\n/g, '\n');
    const css = panel.slice(panel.indexOf('<style>'));
    assert.match(rule(css, '.camp-tabs'), /flex-wrap: nowrap;/);
    assert.match(rule(css, '.camp-tab'), /flex: 0 0 auto;/, 'Records and Journal keep their size');
    assert.match(rule(css, '.camp-tab.camp-tab-party'), /flex: 0 1 auto;/);
    const small = rule(css, '.camp-tab small');
    assert.match(small, /min-width: 0;/);
    assert.match(small, /text-overflow: ellipsis;/);
    assert.match(panel, /class="camp-tab camp-tab-party"[^>]*@click="showTab\('party'\)"/);
});

test('on a phone the Party tab\'s line is still hidden', () => {
    assert.match(read('workspace/campaign_touch.css'), /\.camp \.camp-tab small \{\s+display: none;/);
});
