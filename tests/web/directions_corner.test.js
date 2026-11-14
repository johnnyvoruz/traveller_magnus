/**
 * CU47: Directions opens the same panel as the d command.
 * CU49: it sits in the date's row, before Save image and How to use the map.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

function read(path) {
    return readFileSync(new URL(path, import.meta.url), 'utf8');
}

test('Directions sits in the date row, before Save image and the map help, and still opens on d', () => {
    const view = read('../../apps/web/src/views/MapView.vue');
    const button = read('../../apps/web/src/map/DirectionsCorner.vue');
    assert.match(view, /<div class="map-chrome">\s*<StardateChip @open="openDateEditor" \/>\s*<DirectionsCorner v-if="!shipSheet" :open="directionsOpen" @click="toggleDirections" \/>\s*<SaveImageButton v-if="!shipSheet && versionRef" title="Save an image of the chart" @click="openSaveSheet" \/>\s*<MapHelp v-if="!shipSheet" :build="buildOffered" :auto="helpAuto" @seen="helpWasSeen" \/>/);
    assert.match(view, /function toggleDirections\(\): void \{[\s\S]*if \(directionsOpen\.value\) closeDirections\(\);[\s\S]*else openDirections\(\);/);
    assert.match(view, /id: 'directions'[\s\S]*run: \(\) => \{ toggleDirections\(\); \}/);
    assert.match(view, /\.map-chrome \{[\s\S]*gap: 8px;[\s\S]*height: var\(--chrome-height\);/);
    assert.match(view, /\.map-chrome \.dir-corner,[\s\S]*height: var\(--chrome-height\);/);
    assert.match(view, /@media \(max-width: 599px\) \{[\s\S]*\.map-chrome \.dir-corner,[\s\S]*width: 44px;[\s\S]*height: 44px;/);
    assert.doesNotMatch(view, /\.map > \.dir-corner/);
    assert.doesNotMatch(view, /\.map > \.save-img-btn/);
    assert.match(button, /aria-label="Directions"/);
    assert.match(button, /title="Directions"/);
    assert.match(button, /name="route"/);
    assert.match(button, /\.dir-corner \{[\s\S]*width: 40px;[\s\S]*height: 40px;/);
    assert.match(button, /@media \(max-width: 599px\) \{[\s\S]*\.dir-corner \{[\s\S]*width: 44px;[\s\S]*height: 44px;/);
});
