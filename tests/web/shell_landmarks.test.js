/**
 * Shell landmarks: the rail is a nav, a panel is a region named by its title,
 * and a keyboard ring is not cleared by a control's own outline.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../apps/web/src');

function read(rel) {
    return fs.readFileSync(path.join(src, rel), 'utf8');
}

test('the rail is a nav, and Map is current when the map is the page', () => {
    const rail = read('shell/Rail.vue');
    assert.match(rail, /<nav class="rail"/);
    assert.match(rail, /aria-label="Workspace navigation"/);
    assert.match(rail, /aria-label="Map"/);
    assert.match(rail, /:aria-current="onMap \? 'page' : undefined"/);
    assert.match(rail, /:aria-current="marketOpen \? 'page' : undefined"/);
});

test('a panel is a region named by its title', () => {
    const panel = read('shell/Panel.vue');
    assert.match(panel, /role="region"/);
    assert.match(panel, /:aria-labelledby="titleId"/);
    assert.match(panel, /<h1 :id="titleId"/);
});

test('the focus ring beats a control that clears its outline', () => {
    const css = read('design/base.css');
    assert.match(css, /\*:focus-visible:not\(:disabled\):not\(\[inert\]\) \{[^}]*outline: 2px solid var\(--focus-ring\);/);
});

test('Escape that a layer already handled does not run another command', () => {
    const registry = read('shell/registry.ts');
    assert.match(registry, /if \(event\.defaultPrevented\) return false;/);
});
