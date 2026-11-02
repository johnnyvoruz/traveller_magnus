/**
 * DU48: Delivered on time or late, as a choice. The Deliver form's tick becomes two radio choices, on time chosen
 * first; the maths is as before (the file's 1D+4 × 10% cut on late, rolled on post); the posted line says which.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { lateReduction } from '../../apps/web/src/campaign/traffic_lots.ts';
import { deliveredLine } from '../../apps/web/src/workspace/traffic_here.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (file) => fs.readFileSync(path.join(here, '../../apps/web/src', file), 'utf8');
/** A die that shows one face: lateReduction takes a face roller, as cryptoFace is. */
const faces = (face) => () => face;

test('the two choices: on time posts the pay and says so; late posts it less the file\'s cut and says the roll', () => {
    const when = { year: 1105, day: 14 };
    const lot = { label: 'Freight, Major lot', tons: 40, payCr: 40000, destination: 'Ruie' };
    const onTime = deliveredLine(lot, when, null, 'Ruie');
    assert.equal(onTime.amount, 40000);
    assert.equal(onTime.memo, 'Delivered Freight, Major lot (40 t) at Ruie; on time');
    const cut = lateReduction(faces(3));
    assert.equal(cut.percent, 70, '1D+4 at a face of 3, times 10%');
    const late = deliveredLine(lot, when, cut, 'Ruie');
    assert.equal(late.amount, 12000);
    assert.equal(late.memo, 'Delivered Freight, Major lot (40 t) at Ruie; late, 1D+4 x 10% (1D: 3) = 70% off');
    assert.equal(onTime.kind, 'income');
    assert.equal(late.kind, 'income');
});

test('pins: two radios, on time first and chosen when the form opens; the late choice rolls the cut; nothing on the cargo row', () => {
    const page = src('workspace/VesselTrade.vue');
    assert.match(page, /const deliver = reactive\(\{ choice: 'ontime' as 'ontime' \| 'late' \}\);/);
    assert.match(page, /delivering\.value = i;\s+deliver\.choice = 'ontime';/, 'on time chosen first, each time');
    assert.match(page, /const late = deliver\.choice === 'late' \? lateReduction\(cryptoFace\) : null;/, 'the maths as before');
    assert.match(page, /<div class="vt-choice" role="radiogroup" aria-label="Delivered on time or late" data-deliver-choice>\s+<label class="vt-check"><input v-model="deliver\.choice" type="radio" name="deliver-choice" value="ontime" data-deliver-ontime \/> Delivered on time<\/label>\s+<label class="vt-check"><input v-model="deliver\.choice" type="radio" name="deliver-choice" value="late" data-deliver-late \/> Delivered late: the file's cut, 1D\+4 × 10%, comes off the pay \(rolled on post\)<\/label>/);
    assert.doesNotMatch(page, /type="checkbox" data-deliver-late/);
    assert.doesNotMatch(page, /dueDay|data-due/, 'no due day on the row (Johnny chose the choice over the date)');
    assert.doesNotMatch(page, /#[0-9a-f]{3,6}\b/i, 'tokens only');
});
