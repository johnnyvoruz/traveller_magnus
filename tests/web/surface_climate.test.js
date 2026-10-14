/**
 * Enhanced climate: a known surfaceTempBand is the look's band. Absent and unknown
 * stay on today's profile. liquidType null, and a status of none, unresolved or
 * unknown, draw no sea. An absent liquidType still infers one.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { environmentPolicy, reconcileTree } from '../../packages/engines/src/reconcile_environment.js';
import { sheetCaption } from '../../apps/web/src/surface/caption.ts';
import { enhancedProfile } from '../../apps/web/src/surface/enhanced/climate.ts';
import { seaPlan } from '../../apps/web/src/surface/enhanced/map.ts';
import { worldMapData } from '../../apps/web/src/surface/identity.ts';
import { surfaceProfile } from '../../apps/web/src/surface/profile.ts';
import { buildPalette } from '../../apps/web/src/surface/vanilla/map_palette.ts';

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

test('liquidType null, or a status of none, unresolved or unknown, draws no sea', () => {
    const sea = garden();
    sea.liquidStatus = { status: 'none', outcome: 'zero' };
    sea.liquidType = 'Water';
    const none = enhancedProfile(sea, 'sea-none');
    assert.equal(none.liquid, null);
    assert.equal(none.liquidName, null);
    assert.equal(none.water, 0);
    const nonePlan = seaPlan(sea);
    assert.equal(nonePlan.drawn, false);
    assert.equal(nonePlan.sea.liquid, null);
    assert.equal(sheetCaption('enhanced', sea).text, 'Enhanced · no seas');

    for (const status of ['unresolved', 'unknown']) {
        for (const named of ['Water', 'Ice', '', null]) {
            const body = garden();
            body.liquidStatus = { status, outcome: 'missing' };
            body.liquidType = named;
            const look = enhancedProfile(body, 'sea-' + status + '-' + String(named));
            assert.equal(look.liquidName, null, status + ' ' + named);
            assert.equal(look.water, 0);
            const plan = seaPlan(body);
            assert.equal(plan.drawn, false, status + ' ' + named);
            assert.equal(plan.sea.liquid, null);
        }
    }

    const bare = garden();
    bare.liquidType = null;
    delete bare.liquidStatus;
    assert.equal(enhancedProfile(bare, 'null-liquid').water, 0);
    assert.equal(seaPlan(bare).drawn, false);

    const absent = garden();
    delete absent.liquidType;
    delete absent.liquidStatus;
    const inferred = enhancedProfile(absent, 'absent-liquid');
    assert.equal(inferred.liquidName, 'Water');
    assert.ok(inferred.water > 0);

    const dry = worldMapData({
        uwp: 'A788899-C', atmCode: 8, hydroCode: 8, meanTempK: 400,
        liquidType: null, liquidStatus: { status: 'none', outcome: 'above-boiling' },
    });
    assert.equal(dry.liquidType, null);
    assert.equal(buildPalette(dry, 0.5).hasSpecular, false);
    const kept = worldMapData({ uwp: 'A788899-C', atmCode: 8, hydroCode: 8, meanTempK: 300, tempBand: 'Temperate' });
    assert.equal(kept.liquidType, undefined);
    assert.equal(buildPalette(kept, 0.5).hasSpecular, true);
    assert.equal(buildPalette(kept, 0.5).seaLevel, buildPalette({ atmosphere: 8, hydrographics: 8, temperature: 'Temperate', temperatureK: 300 }, 0.5).seaLevel);
});

test('each stored outcome has one caption line', () => {
    const lines = {
        'vacuum-above-melt': 'No sea. There is no air, and the surface is above melting.',
        'above-boiling': 'No sea. The surface is above boiling.',
        'unknown-exotic': 'No sea. No listed liquid fits this temperature.',
        'temperature-missing': 'No sea. The temperature is missing.',
    };
    const statusOf = {
        'vacuum-above-melt': 'none',
        'above-boiling': 'none',
        'unknown-exotic': 'unresolved',
        'temperature-missing': 'unknown',
    };
    for (const [outcome, line] of Object.entries(lines)) {
        const body = garden();
        body.liquidType = null;
        body.liquidStatus = { status: statusOf[outcome], outcome };
        assert.equal(sheetCaption('enhanced', body).text, 'Enhanced · ' + line, outcome);
    }
});
