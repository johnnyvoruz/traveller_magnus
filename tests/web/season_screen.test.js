import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { seasonOnMoon, seasonOnWorld } from '../../apps/web/src/orbit/season_on.ts';
import table from '../../rules/mgt2e_climate_bands.json' with { type: 'json' };

function world(body, extra = {}) {
    return {
        belt: false,
        epoch: 0,
        period: 1,
        name: 'Parent',
        body,
        ...extra,
    };
}

test('no tilt leaves the dossier with nothing to show', () => {
    assert.equal(seasonOnWorld(world({ meanTempK: 288.15 }), 0), null);
    assert.equal(seasonOnWorld(world({ axialTilt: 23 }, { belt: true }), 0), null);
});

test('a tilt shows the season word, and the band is the file\'s word for the mean', () => {
    const shown = seasonOnWorld(world({ axialTilt: 23, meanTempK: 288.15, eccentricity: 0, periodDays: 365 }), 0);
    assert.ok(shown);
    assert.match(shown.season, /^Northern /);
    assert.equal(shown.orbit, '');
    const meanC = 288.15 - 273.15;
    let word = null;
    for (const row of table.bands) {
        if (row.maxC == null || meanC <= row.maxC) {
            word = row.word;
            break;
        }
    }
    assert.equal(shown.band, word);
    assert.equal(table.unit, 'C');
});

test('a moon with no tilt of its own uses the parent, and a ring shows nothing', () => {
    const parent = world({ axialTilt: 20, periodDays: 400, eccentricity: 0 });
    const moon = { ring: false, belt: false, body: { meanTempK: 200 } };
    const shown = seasonOnMoon(moon, parent, 0);
    assert.ok(shown);
    assert.ok(shown.season.length > 0);
    assert.equal(seasonOnMoon({ ring: true, belt: false, body: { axialTilt: 10 } }, parent, 0), null);
});

test('the dossier card shows the line only when a season is passed', () => {
    const body = fs.readFileSync('apps/web/src/dossier/DossierBody.vue', 'utf8');
    const panel = fs.readFileSync('apps/web/src/dossier/DossierPanel.vue', 'utf8');
    assert.match(body, /v-if="season"/);
    assert.match(body, /doss-season-band/);
    assert.match(panel, /seasonOnWorld/);
    assert.match(panel, /seasonOnMoon/);
    assert.doesNotMatch(body, /273\.15|maxC|mgt2e_climate_bands/);
    assert.doesNotMatch(panel, /273\.15|maxC|mgt2e_climate_bands/);
});
