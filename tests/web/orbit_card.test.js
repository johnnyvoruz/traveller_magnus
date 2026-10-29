/**
 * The orbit card keeps its box while the picture and the pane width arrive
 * (apps/web/src/views/OrbitView.vue).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = readFileSync(new URL('../../apps/web/src/views/OrbitView.vue', import.meta.url), 'utf8');

test('the orbit card reserves its height while the picture loads', () => {
    assert.match(source, /\.orbit-card \{[\s\S]*?min-height: calc\(100dvh - var\(--chrome-inset\) - var\(--under-search\) - max\(var\(--chrome-inset\), env\(safe-area-inset-bottom, 0px\)\) - var\(--sheet-cover, 0px\)\);/);
});

test('on a phone the floating body card leaves the picture while the sheet is open', () => {
    const block = source.slice(source.indexOf('@media (max-width: 599px) {'));
    assert.match(block, /\.app:has\(\.panel\.is-open\[data-sheet="half"\]\) \.orbit-cards \{[^}]*display: none;/);
});

test('the orbit card holds the pane width, without sliding, until the shell measures it', () => {
    const block = source.slice(source.indexOf('@media (min-width: 600px)'));
    assert.match(block, /\.orbit-card\.is-reserving\[data-span="column"\] \{[\s\S]*?transition: none;/);
    assert.match(block, /\.orbit-card\.is-reserving\[data-span="half"\] \{[\s\S]*?transition: none;/);
    assert.match(block, /\.orbit-card\.is-reserving\[data-span="full"\] \{[\s\S]*?transition: none;/);
    // The shell's measured width is the card plus one gutter on each side.
    assert.match(block, /\[data-span="column"\] \{[\s\S]*?\+ 2 \* var\(--chrome-inset\)\)/);
    assert.match(block, /\[data-span="full"\] \{[\s\S]*?calc\(100vw - var\(--rail-width\)\)/);
});
