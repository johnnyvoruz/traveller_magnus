/**
 * DU22b (E's EU22 leftover, decided 21:10): the map's live region. A polite region names the selected
 * system or hex when the selection changes, by a click, a key or a search; never on hover, never the
 * loading lines, never a UWP's letters. The visible status line is no longer a live region.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const view = fs.readFileSync(path.join(root, 'apps/web/src/views/MapView.vue'), 'utf8');

test('one polite region for the selection; the status line is not live', () => {
    assert.match(view, /<p class="status ui-status">\{\{ status \}\}<\/p>/);
    assert.match(view, /<p class="map-announce" aria-live="polite" data-map-announce>\{\{ announced \}\}<\/p>/);
    assert.equal((view.match(/aria-live="polite"/g) || []).length, 1, 'one live region on the map view');
});

test('it speaks when the selection changes, in plain words, once a hex', () => {
    const words = view.slice(view.indexOf('function selectionWords(): string {'), view.indexOf('function announceSelection(): void {'));
    assert.match(words, /return \(row\.name \|\| 'Unnamed system'\) \+ ', ' \+ place;/);
    assert.match(words, /return buildReady\(\) \? 'Empty hex, ' \+ place : '';/);
    assert.doesNotMatch(words, /uwp/, 'no UWP read out letter by letter');
    const announce = view.slice(view.indexOf('function announceSelection(): void {'), view.indexOf('function announceSelection(): void {') + 700);
    assert.match(announce, /if \(key === announcedKey\) return;/);
    // From the selection's own paths only: the address (syncSelection) and the status refresh when a sector loads.
    assert.match(view, /if \(renderer\) renderer\.setSelection\(marked \? null : selected\);\s+announceSelection\(\);/);
    const hover = view.slice(view.indexOf('function onPointerHover('), view.indexOf('function onPointerOut('));
    assert.doesNotMatch(hover, /announce/);
});
