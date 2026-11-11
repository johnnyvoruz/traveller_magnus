/**
 * CU46 round 15: the world sheet's Mainworld, Explore orbits, Locate and News are 44 px on a phone.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

test('the world sheet actions are 44 px below 600 px and unchanged above it', () => {
    const overview = readFileSync(new URL('../../apps/web/src/dossier/DossierOverview.vue', import.meta.url), 'utf8');
    assert.match(overview, /@media \(max-width: 599px\) \{[\s\S]*\.doss-callout-actions \.ui-btn,[\s\S]*\.doss-actions \.ui-btn \{[\s\S]*min-height: 44px;/);
});
