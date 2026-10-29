/**
 * CP4. A hex address preloads the dossier. The surface painter, the print image
 * and the market are not in that preload. The world card (the tiles) stays.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const body = fs.readFileSync(new URL('../../apps/web/src/dossier/DossierBody.vue', import.meta.url), 'utf8');
const panel = fs.readFileSync(new URL('../../apps/web/src/dossier/DossierPanel.vue', import.meta.url), 'utf8');

test('the surface painter and the print image wait for the chart', () => {
    assert.match(body, /import\('\.\/SurfaceStage\.vue'\)/);
    assert.match(body, /whenMapPaints/);
    assert.match(body, /import FactTiles from/);
    assert.doesNotMatch(body, /import SurfaceStage from/);
});

test('the market list and the publish form are not in the dossier preload', () => {
    assert.match(panel, /import\('\.\.\/workspace\/MarketsNearby\.vue'\)/);
    assert.match(panel, /import\('\.\.\/workspace\/market\/PublishForm\.vue'\)/);
    assert.doesNotMatch(panel, /import MarketsNearby from/);
    assert.doesNotMatch(panel, /import PublishForm from/);
});
