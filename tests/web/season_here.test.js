import assert from 'node:assert/strict';
import { test } from 'node:test';
import table from '../../rules/mgt2e_climate_bands.json' with { type: 'json' };
import { climateBand, seasonHere } from '../../apps/web/src/orbit/season_here.ts';

const RAD = Math.PI / 180;

function world(over = {}) {
    return {
        moon: false,
        tilt: 23.4,
        parentTilt: null,
        parentName: '',
        yearDays: 365,
        lockedToStar: false,
        angle: 10 * RAD,
        eccentricity: 0.02,
        ...over,
    };
}

test('the climate word is the file band that includes the mean', () => {
    assert.equal(table.unit, 'C');
    assert.ok(Array.isArray(table.bands) && table.bands.length > 0);
    let previous = null;
    for (const band of table.bands) {
        assert.equal(typeof band.word, 'string');
        if (band.maxC == null) {
            assert.equal(climateBand(previous == null ? 0 : previous + 1), band.word);
            continue;
        }
        assert.equal(climateBand(band.maxC), band.word);
        if (previous != null) assert.equal(climateBand(previous + (band.maxC - previous) / 2), band.word);
        previous = band.maxC;
    }
    assert.equal(climateBand(null), null);
    assert.equal(climateBand(Number.NaN), null);
});

test('a campaign date keeps the season line and adds the mean band', () => {
    const here = seasonHere(world(), table.bands[0].maxC + 273.15);
    assert.equal(here.season, 'Northern spring, marked');
    assert.equal(here.orbit, '');
    assert.equal(here.band, table.bands[0].word);
    const summer = seasonHere(world({ angle: 100 * RAD }), 288.15);
    assert.equal(summer.season, 'Northern summer, marked');
    assert.equal(summer.band, climateBand(15));
    assert.deepEqual(seasonHere(world({ tilt: null }), 288.15), { season: null, orbit: '', band: climateBand(15) });
    assert.equal(seasonHere(world({ tilt: 2.9 }), null).season, 'Negligible seasons (tilt 2.9°)');
    assert.equal(seasonHere(world({ tilt: 2.9 }), null).band, null);
    assert.equal(seasonHere(world({ lockedToStar: true }), 288.15).season, 'No seasons: one face always points at the star');
    const driven = seasonHere(world({ eccentricity: 0.1 }), 288.15);
    assert.equal(driven.orbit, 'Orbit-driven: whole-world warm and cool seasons, flux ratio 1.5');
});
