/**
 * CU47: Directions sits in the chart's corner and opens the same panel as the d command.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

function read(path) {
    return readFileSync(new URL(path, import.meta.url), 'utf8');
}

test('the chart corner mounts Directions beside Save image, 40 above 599 px and 44 below', () => {
    const view = read('../../apps/web/src/views/MapView.vue');
    const button = read('../../apps/web/src/map/DirectionsCorner.vue');
    assert.match(view, /<DirectionsCorner v-if="!shipSheet" :open="directionsOpen" @click="toggleDirections" \/>/);
    assert.match(view, /function toggleDirections\(\): void \{[\s\S]*if \(directionsOpen\.value\) closeDirections\(\);[\s\S]*else directionsOpen\.value = true;/);
    assert.match(view, /id: 'directions'[\s\S]*run: \(\) => \{ toggleDirections\(\); \}/);
    assert.match(view, /\.map > \.dir-corner \{[\s\S]*right: calc\(var\(--chrome-inset\) \+ 96px\)/);
    assert.match(view, /@media \(max-width: 599px\) \{[\s\S]*\.map > \.dir-corner \{[\s\S]*--sheet-cover/);
    assert.match(button, /aria-label="Directions"/);
    assert.match(button, /title="Directions"/);
    assert.match(button, /name="route"/);
    assert.match(button, /\.dir-corner \{[\s\S]*width: 40px;[\s\S]*height: 40px;/);
    assert.match(button, /@media \(max-width: 599px\) \{[\s\S]*\.dir-corner \{[\s\S]*width: 44px;[\s\S]*height: 44px;/);
});
