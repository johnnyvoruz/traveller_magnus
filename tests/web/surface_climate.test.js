/**
 * Enhanced climate: a known surfaceTempBand is the look's band. Absent and unknown
 * stay on today's profile. liquidStatus unresolved and unknown draw the unresolved
 * sea; none draws no sea. Vanilla does not read those fields.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { environmentPolicy, reconcileTree } from '../../packages/engines/src/reconcile_environment.js';
import { sheetCaption } from '../../apps/web/src/surface/caption.ts';
import { enhancedProfile } from '../../apps/web/src/surface/enhanced/climate.ts';
import { seaPlan } from '../../apps/web/src/surface/enhanced/map.ts';
import { surfaceProfile } from '../../apps/web/src/surface/profile.ts';

function garden() {
    return {
        name: 'Garden',
        type: 'Planet',
        uwp: 'A788899-C',
        size: 8,
        atmCode: 8,
        hydroCode: 8,
        hydroPercent: 50,
        pop: 8,
        tl: 12,
        meanTempK: 283.15,
        lowTempK: 260,
        highTempK: 300,
        liquidType: 'Water',
        tempBand: 'Cool',
        orbitId: 3,
        worldHzco: 3,
    };
}

test('a reconciled body gives the enhanced profile the classifier band', () => {
    const source = { hexKey: 'climate', body: { mgtSystem: { hzco: 3, worlds: [garden()] } } };
    const reconciled = reconcileTree(source, environmentPolicy);
    const world = reconciled.tree.body.mgtSystem.worlds[0];
    assert.equal(world.surfaceTempBand.status, 'known');
    const id = 'climate-disc';
    const look = enhancedProfile(world, id);
    assert.equal(look.climateBand, world.surfaceTempBand.band);
    const vanilla = surfaceProfile(world, id + '-vanilla');
    assert.equal(vanilla.climateBand, undefined);
    assert.equal(Object.prototype.hasOwnProperty.call(vanilla, 'climateBand'), false);
});

test('the same body without the corrected fields keeps today\'s profile byte for byte', () => {
    const body = garden();
    const id = 'climate-plain';
    const today = surfaceProfile(body, id);
    const enhanced = enhancedProfile(body, id);
    assert.equal(enhanced, today);
    const plainBody = garden();
    const unknownBody = garden();
    unknownBody.surfaceTempBand = { status: 'unknown' };
    unknownBody.orbitalTempBand = { status: 'unknown', missing: ['hzco'] };
    const shared = 'climate-unknown';
    assert.equal(JSON.stringify(enhancedProfile(unknownBody, shared)), JSON.stringify(surfaceProfile(plainBody, shared)));
});

test('vanilla keeps its temperature rule when the classifier fields are present', () => {
    const body = garden();
    body.meanTempK = 500;
    body.tempBand = 'Hot';
    const withBand = { ...body, surfaceTempBand: { status: 'known', band: 'Frozen' } };
    const vanilla = surfaceProfile(body, 'vanilla-hot');
    const still = surfaceProfile(withBand, 'vanilla-hot');
    assert.equal(still.kind, vanilla.kind);
    assert.equal(still.liquidName, vanilla.liquidName);
    const enhanced = enhancedProfile(withBand, 'enhanced-frozen');
    assert.equal(enhanced.climateBand, 'Frozen');
    assert.equal(enhanced.kind, 'ice');
    assert.equal(vanilla.kind, 'hot');
});

test('liquidStatus none is no sea, and unresolved or unknown is the unresolved liquid', () => {
    const sea = garden();
    sea.liquidStatus = { status: 'none', outcome: 'zero' };
    sea.liquidType = 'Water';
    const none = enhancedProfile(sea, 'sea-none');
    assert.equal(none.liquid, null);
    assert.equal(none.liquidName, null);
    const nonePlan = seaPlan(sea);
    assert.equal(nonePlan.drawn, false);
    assert.equal(nonePlan.sea.liquid, null);
    assert.equal(sheetCaption('enhanced', sea).text, 'Enhanced · no seas');

    for (const status of ['unresolved', 'unknown']) {
        const body = garden();
        body.liquidStatus = { status, outcome: 'missing' };
        body.liquidType = 'Water';
        body.lowTempK = 200;
        const look = enhancedProfile(body, 'sea-' + status);
        assert.equal(look.liquidName, 'Unknown Exotic Liquid');
        assert.equal(look.liquid.frozen, undefined);
        const plan = seaPlan(body);
        assert.equal(plan.sea.liquid, 'Unknown Exotic Liquid');
        assert.equal(plan.sea.ice.kind, 'none');
        assert.equal(plan.why, 'the liquid is unresolved');
        assert.equal(sheetCaption('enhanced', body).text, 'Enhanced · Unknown Exotic Liquid, the liquid is unresolved');
    }
});
