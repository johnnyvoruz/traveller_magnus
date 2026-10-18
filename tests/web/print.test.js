/**
 * DU31 (UX backlog U31): Print and PDF through the browser's own dialog. The copy, the print
 * stylesheet and where the button sits; the copy's DOM work is checked in the browser
 * (findings/storefront/sd_du31.mjs), as these tests run without one.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => fs.readFileSync(path.join(root, 'apps/web/src', rel), 'utf8');

test('Print on a record page (with its character or ship sheet) and on a journal entry', () => {
    assert.match(read('workspace/RecordPage.vue'), /<footer class="rec-foot">\s+<PrintButton target="\.rec" :title="record\.name" \/>/);
    assert.match(read('workspace/journal/EntryPage.vue'), /<footer class="rec-foot">\s+<PrintButton target="\.jn-entry" :title="entry\.title \|\| 'Journal entry'" \/>/);
});

test('the copy carries what cloning loses, and goes once the dialog closes', () => {
    const print = read('workspace/print.ts');
    assert.match(print, /twin\.checked = field\.checked;/);
    assert.match(print, /twin\.selectedIndex = field\.selectedIndex;/);
    assert.match(print, /twin\.value = field\.value;/);
    assert.match(print, /ctx\.drawImage\(canvas, 0, 0\);/);
    assert.match(print, /fold\.open = true;/);
    assert.match(print, /stopAfter = onAfterPrint\(endPrint\);\s+printPage\(\);/);
    assert.doesNotMatch(print, /\bwindow\./, 'the dialog through platform/browser.ts');
    assert.match(read('platform/browser.ts'), /export function printPage\(\): void \{\s+if \(typeof window === 'undefined'\) return;\s+window\.print\(\);/);
});

test('on paper: the copy alone, ink on white from the print tokens, no buttons', () => {
    const button = read('workspace/PrintButton.vue');
    const style = button.split('<style>')[1];
    assert.match(style, /\.print-root \{\s+display: none;/, 'nothing extra on screen');
    assert.match(style, /@media print \{/);
    assert.match(style, /html\[data-printing\] body > :not\(\.print-root\) \{\s+display: none !important;/);
    assert.match(style, /color: var\(--print-ink\) !important;/);
    assert.match(style, /background: var\(--print-paper\) !important;/);
    assert.match(style, /\.print-root \.ui-btn,/);
    const tokens = read('design/tokens.css');
    for (const name of ['--print-paper', '--print-ink', '--print-line']) assert.match(tokens, new RegExp(name + ': #[0-9a-f]{6};'));
});
