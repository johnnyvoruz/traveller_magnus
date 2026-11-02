/**
 * DT7: Jump to the destination from the vessel page. The thrust read off the sheet, the flight from the world
 * to its 100-diameter limit at that thrust (the dossier's tile, or the same sum from the diameter: the engine's
 * formula), the jump leg with the file's rolled hours from the flight's end, the words before the press, and the
 * two legs as a track the schema takes. The Track block and the traffic screen are pinned.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { Track } from '../../packages/shared/src/schemas/campaign.ts';
import { rollJumpHours } from '../../apps/web/src/campaign/travel.ts';
import { HOUR } from '../../apps/web/src/orbit/clock.ts';
import { planMainworldKey, realDistanceKmBetween, realPositionAu } from '../../apps/web/src/orbit/distance.ts';
import { flightHours, settleFlight } from '../../apps/web/src/orbit/estimates.ts';
import { AU_KM, bodyOf, hundredDau, planSystem } from '../../apps/web/src/orbit/layout.ts';
import {
    NO_TARGET, NO_THRUST, NOT_DOCKED, jumpFromHere, jumpWords, jumpedWords, limitFlight, setTradeTarget, thrustOf, tradeTargetOf,
} from '../../apps/web/src/workspace/jump_from_here.ts';
import { HEX_KEY, testSystem } from './orbit_fixture.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (file) => fs.readFileSync(path.join(here, '../../apps/web/src', file), 'utf8');
const DAYS = 1105 * 365 + 23;

test('the thrust is the sheet\'s Manoeuvre Drive Output as a whole G the console offers', () => {
    assert.equal(thrustOf({ 'Manoeuvre Drive Output': '1' }), 1);
    assert.equal(thrustOf({ 'Manoeuvre Drive Output': '2 G' }), 2);
    assert.equal(thrustOf({ 'Manoeuvre Drive Output': ' 6 ' }), 6);
    assert.equal(thrustOf({ 'Manoeuvre Drive Output': '1.5' }), null, 'the console offers whole Gs');
    assert.equal(thrustOf({ 'Manoeuvre Drive Output': '7' }), null);
    assert.equal(thrustOf({ 'Manoeuvre Drive Output': '0' }), null);
    assert.equal(thrustOf({ 'Manoeuvre Drive Output': '' }), null);
    assert.equal(thrustOf({}), null);
    assert.equal(thrustOf(null), null);
});

test('the session\'s target is per vessel and cleared with the choice', () => {
    assert.equal(tradeTargetOf('cr_a'), null);
    setTradeTarget('cr_a', { hexKey: 'Spinward_Marches/1910', name: 'Regina', parsecs: 1 });
    assert.deepEqual(tradeTargetOf('cr_a'), { hexKey: 'Spinward_Marches/1910', name: 'Regina', parsecs: 1 });
    assert.equal(tradeTargetOf('cr_b'), null);
    setTradeTarget('cr_a', null);
    assert.equal(tradeTargetOf('cr_a'), null);
});

test('the flight to the 100-diameter limit: the dossier\'s tile, which is the engine\'s sum over 100 diameters', () => {
    const plan = planSystem(testSystem(), HEX_KEY);
    const key = planMainworldKey(plan);
    assert.ok(key, 'the fixture has a mainworld');
    const body = bodyOf(plan, key);
    assert.ok(body && body.diamKm > 0, 'with a diameter');
    for (const g of [1, 2, 6]) {
        const found = limitFlight(plan, null, DAYS, g);
        assert.ok(found, 'a flight at ' + g + ' G');
        assert.equal(found.km, 100 * body.diamKm, '100 diameters');
        const summed = flightHours(found.km, g);
        if (Array.isArray(body.journeyTimes) && typeof body.journeyTimes[g - 1] === 'number') {
            assert.equal(found.fromTile, true);
            assert.equal(found.hours, body.journeyTimes[g - 1], 'the tile\'s own figure');
            assert.ok(Math.abs(found.hours - summed) < 0.01, 'the engine rounds the same sum to two decimals: ' + found.hours + ' vs ' + summed);
        } else {
            assert.equal(found.fromTile, false);
            assert.equal(found.hours, summed);
        }
        const at = realPositionAu(plan, key, DAYS);
        assert.ok(at);
        assert.ok(Math.abs(Math.hypot(found.point.x - at.x, found.point.y - at.y) - hundredDau(body.diamKm)) < 1e-9, 'the point is on the circle');
        assert.ok(Math.abs(hundredDau(body.diamKm) * AU_KM - found.km) < 1e-3, 'the circle is the same 100 diameters');
        assert.equal(found.label, '100D limit of ' + String(body.name || plan.name || 'the world'));
    }
    assert.equal(limitFlight(plan, key, DAYS, 1)?.km, 100 * body.diamKm, 'the body named, as a docked anchor names it');
    assert.equal(limitFlight(plan, 'no-such-body', DAYS, 1), null);
    const g1 = limitFlight(plan, null, DAYS, 1);
    const g2 = limitFlight(plan, null, DAYS, 2);
    assert.ok(g1.hours > g2.hours, 'more thrust, fewer hours');
    // The orbit view's own measure of the same flight: settled to where the point is at the arrival (the point is
    // fixed in space, the world moves under it during the flight), so the two agree to within the world's drift.
    const settled = settleFlight((arrives) => realDistanceKmBetween(plan, key, DAYS, g1.point, arrives), 1, DAYS);
    assert.ok(settled, 'the orbit view can measure it');
    const drift = Math.abs(settled.hours - g1.hours) / g1.hours;
    console.log('DT7 hours at 1 G: the tile ' + g1.hours + ' h, the orbit view settled ' + settled.hours.toFixed(2) + ' h (' + (drift * 100).toFixed(2) + '% apart)');
    assert.ok(drift < 0.05, 'within five percent: ' + settled.hours + ' vs ' + g1.hours);
});

test('the two legs: the flight to the point, then the jump with the rolled hours; the words; a track the schema takes', () => {
    const plan = planSystem(testSystem(), HEX_KEY);
    const limit = limitFlight(plan, null, DAYS, 2);
    const from = { kind: 'system', hexKey: HEX_KEY, locationLabel: 'Testworld' };
    const target = { hexKey: 'Test_Sector/0102', name: 'Nextworld', parsecs: 1 };
    const roll = rollJumpHours(() => 0.5);
    const planned = jumpFromHere(HEX_KEY, from, limit, target, DAYS, 2, roll);
    assert.ok(planned);
    assert.equal(planned.flight.mode, 'flight');
    assert.equal(planned.flight.accelG, 2);
    assert.deepEqual(planned.flight.from, from);
    assert.equal(planned.flight.to.kind, 'system');
    assert.equal(planned.flight.to.hexKey, HEX_KEY);
    assert.deepEqual(planned.flight.to.point, limit.point);
    assert.equal(planned.flight.to.locationLabel, limit.label);
    assert.equal(planned.flight.departs, DAYS);
    assert.ok(Math.abs(planned.flight.arrives - (DAYS + limit.hours * HOUR)) < 1e-9);
    assert.equal(planned.jump.mode, 'jump');
    assert.deepEqual(planned.jump.from, planned.flight.to, 'the jump leaves from the point');
    assert.deepEqual(planned.jump.to, { kind: 'system', hexKey: 'Test_Sector/0102', locationLabel: 'Nextworld' });
    assert.equal(planned.jump.departs, planned.flight.arrives);
    assert.ok(Math.abs(planned.jump.arrives - (planned.flight.arrives + roll.hours * HOUR)) < 1e-9);
    assert.equal(roll.hours, 148 + 6 * 4, 'the file\'s 148 + 6D at a face of 4');
    assert.equal(Track.safeParse([planned.flight, planned.jump]).success, true, 'in time order, within the schema');
    const words = jumpWords(planned);
    assert.match(words, /^Flight to the jump limit, 2 G, about [\d.]+ h · Jump 1 parsec, 172 h \(148 \+ 24\) · arrives \d{3}-1105$/, words);
    assert.match(jumpWords({ ...planned, parsecs: 2 }), / · Jump 2 parsecs, /);
    assert.equal(jumpedWords(planned, 'Kestrel Dawn', 'Nextworld'), 'Kestrel Dawn: flight to the jump limit, then jump to Nextworld, arrives ' + words.slice(words.lastIndexOf(' ') + 1) + '.');
    assert.equal(jumpFromHere(HEX_KEY, from, limit, target, DAYS, 7, roll), null, 'a thrust the console does not offer writes nothing');
});

test('pins: the Track block writes both legs through appendLeg, says why it cannot, and the traffic screen hands over its destination', () => {
    const block = src('workspace/TrackBlock.vue');
    assert.match(block, /const first = appendLeg\(props\.id, planned\.flight\);[\s\S]*const second = appendLeg\(props\.id, planned\.jump\);/);
    assert.match(block, /<p v-if="!here" class="trk-fine" data-jump-note>\{\{ NOT_DOCKED \}\}<\/p>/);
    assert.match(block, /<div v-if="placed" class="trk-jump" data-jump-here/, 'no block on a vessel that is nowhere (DF35)');
    assert.match(block, /return vesselWhere\(now, campaign\.records, today\.value\)\.anchor !== null;/);
    assert.match(block, /<p v-else-if="!target" class="trk-fine" data-jump-note>\{\{ NO_TARGET \}\}<\/p>/);
    assert.match(block, /data-jump-go :disabled="readOnly \|\| !jumpPlan"/);
    assert.match(block, /if \(thrust\.value === null\) return NO_THRUST;/);
    assert.match(block, /roll\.value = key \? rollJumpHours\(\) : null;/, 'the file\'s roll, when a destination is chosen');
    assert.match(block, /limitFlight\(plan\.value, here\.value\.bodyKey, departs\.value, thrust\.value\)/);
    assert.doesNotMatch(block, /#[0-9a-f]{3,6}\b/i, 'tokens only');
    assert.doesNotMatch(block, /\bwindow\.|\bdocument\./);
    const traffic = src('workspace/TrafficHere.vue');
    assert.match(traffic, /watch\(destRow, \(row\) => setTradeTarget\(props\.id, row \? \{ hexKey: row\.hexKey, name: row\.name \|\| row\.hexKey, parsecs: row\.parsecs \} : null\), \{ immediate: true \}\);/);
    const loader = src('workspace/system_plan.ts');
    assert.match(loader, /treeAsk\(\{/, 'asked as the orbit view asks');
    assert.match(loader, /normalizeSystem\(body as Record<string, unknown>\);\s+return system \? planSystem\(system, hexKey\) : null;/, 'planned as the orbit view plans');
    assert.equal(NOT_DOCKED, 'Under way, or holding at a point: the orbit view plots the next course.');
    assert.equal(NO_TARGET, 'Choose a destination on Find passengers and freight to jump to it from here.');
    assert.equal(NO_THRUST, 'Write Manoeuvre Drive Output on the ship sheet first.');
});
