/**
 * The orbit view's batch of disc requests (apps/web/src/orbit/disc_batch.ts), to the envelope
 * of directives/handoff.md §61. Expected numbers are worked out here from the legacy request
 * (js/system_viewer.js:2684-2773) and the orbit model's reading of a tidal lock.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildSector } from '@voyage/generation';
import { TRUTH_SEED, TRUTH_SETTINGS } from '../../tools/truth/settings.js';
import {
    CLOUD_DRIFT, DISC_MIN_PX, RING_INNER, RING_OUTER, discBatch, ringOf, shadeRadius, sunColour, sweepSamples, turnOf,
    visualRate,
} from '../../apps/web/src/orbit/disc_batch.ts';
import { layoutScene, moonOrbitRadius, planSystem } from '../../apps/web/src/orbit/layout.ts';
import { layoutLineup } from '../../apps/web/src/orbit/lineup.ts';
import { DEFAULT_LAYERS, orbitPicture } from '../../apps/web/src/orbit/picture.ts';
import { normalizeSystem } from '../../apps/web/src/orbit/system.ts';
import { HEX_KEY, testBody } from './orbit_fixture.js';

const TAU = Math.PI * 2;
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, a + ' is not ' + b);
const VIEW = { w: 1000, h: 800, zoom: 1, offX: 0, offY: 0, z: 1, linear: false, moons: true, jump: true };
const CAMERA = { width: 1000, height: 800, dpr: 2 };
const SUN = sunColour('#fff4ea');
const clockAt = (days, over = {}) => ({ days, timeSeconds: 12.5, rate: 0, frameSeconds: 1 / 60, motion: true, ...over });
const OPTIONS = { mode: 'vanilla', sun: SUN, lightMode: false, moonsShown: true, selected: null };

/** The fixture with the turning fields the request reads. */
function body(change = () => {}) {
    const made = testBody();
    const worlds = made.mgtSystem.worlds;
    worlds[2].siderealHours = 10;
    worlds[2].moons[0].siderealHours = 40;
    worlds[2].moons[2].siderealHours = 200;
    change(worlds);
    return made;
}

function pictured(made, days, view = VIEW, layers = DEFAULT_LAYERS) {
    const plan = planSystem(normalizeSystem(made), HEX_KEY);
    const scene = layoutScene(plan, { ...view, moons: layers.moons, jump: layers.jump }, days);
    return { plan, picture: orbitPicture(plan, scene, layers, view.z) };
}

/** Every world and moon of a picture, as the painter places it. */
function placed(picture) {
    const out = new Map();
    for (const layer of picture.layers) {
        for (const at of layer.worlds) {
            out.set(at.world.key, { x: at.x, y: at.y, r: at.r, starX: at.starX, starY: at.starY, at, moon: null });
            for (const m of at.moons) if (!m.moon.ring) out.set(m.moon.key, { x: m.x, y: m.y, r: m.r, starX: at.starX, starY: at.starY, at, moon: m });
        }
    }
    return out;
}

const disc = (batch, key) => batch.discs.find((item) => item.key === key);

test('the envelope: one entry per body the painter would shade, plain and cloneable', () => {
    const { plan, picture } = pictured(body(), 1000.25, { ...VIEW, zoom: 3, z: 1.6 });
    const batch = discBatch(plan, picture, CAMERA, clockAt(1000.25), OPTIONS);
    assert.equal(batch.mode, 'vanilla');
    assert.equal(batch.timeSeconds, 12.5);
    const where = placed(picture);
    const onStage = (p) => p.x + p.r * 1.16 + 2 >= 0 && p.y + p.r * 1.16 + 2 >= 0 && p.x - p.r * 1.16 - 2 <= 1000 && p.y - p.r * 1.16 - 2 <= 800;
    const expected = [...where].filter(([key, p]) => p.r >= DISC_MIN_PX && (onStage(p) || key === 'w2')).map(([key]) => key);
    assert.ok(batch.discs.length > 0);
    assert.equal(new Set(batch.discs.map((item) => item.key)).size, batch.discs.length, 'keys are unique');
    for (const item of batch.discs) {
        assert.ok(expected.includes(item.key) || where.get(item.key).r >= DISC_MIN_PX, item.key);
        assert.equal(item.hexKey, HEX_KEY);
        assert.equal(item.dossierKey, item.key);
        const p = where.get(item.key);
        assert.equal(item.body, p.moon ? p.moon.moon.body : p.at.world.body, 'the body as the model holds it');
        close(Math.hypot(item.light[0], item.light[1]), 1);
        close(Math.atan2(item.light[1], item.light[0]), Math.atan2(p.starY - p.y, p.starX - p.x));
        assert.deepEqual(item.sun, SUN);
        assert.equal(item.lightMode, false);
        assert.ok(item.casters.length <= 4);
        assert.equal('near' in item, false, 'nothing is selected');
        // The legacy keys the caller must not build are absent.
        assert.equal('profile' in item, false);
        assert.equal('id' in item, false);
    }
    // No belt, no ring moon, no star and no body under 2.5 px is asked for.
    assert.equal(disc(batch, 'w3'), undefined);
    assert.equal(disc(batch, 'w2m3'), undefined);
    assert.equal(disc(batch, 's0'), undefined);
    for (const [key, p] of where) if (p.r < DISC_MIN_PX) assert.equal(disc(batch, key), undefined, key);
    // It crosses a worker boundary as it is, and the same inputs give the same batch.
    assert.deepEqual(structuredClone(batch), batch);
    assert.deepEqual(discBatch(plan, picture, CAMERA, clockAt(1000.25), OPTIONS), batch);
});

test('spin, cloud drift and blur: a turn every sidereal day, from the date passed in', () => {
    const days = 1000.25;
    const { plan, picture } = pictured(body(), days);
    const clock = clockAt(days, { rate: 2 });
    const batch = discBatch(plan, picture, CAMERA, clock, OPTIONS);
    const rocky = disc(batch, 'w0');
    const turns = days * 24 / 30;
    close(rocky.spin, (turns % 1) * TAU);
    close(rocky.cloudSpin, ((turns * CLOUD_DRIFT) % 1) * TAU);
    close(rocky.sweep, TAU * (2 * 24 / 30) / 60);
    assert.equal(rocky.samples, sweepSamples(rocky.sweep, rocky.radiusPx));
    assert.equal(rocky.tiltDeg, 20);
    // A still clock blurs nothing: one sample.
    const still = disc(discBatch(plan, picture, CAMERA, clockAt(days), OPTIONS), 'w0');
    assert.equal(still.sweep, 0);
    assert.equal(still.samples, 1);
    close(still.spin, rocky.spin);
    // A racing clock turns it at most once a frame.
    assert.equal(disc(discBatch(plan, picture, CAMERA, clockAt(days, { rate: 3650 }), OPTIONS), 'w0').sweep, TAU);
    assert.equal(sweepSamples(0.02, 100), 1);
    assert.equal(sweepSamples(0.4, 5), 6);
    assert.equal(sweepSamples(0.4, 30), Math.ceil(0.4 / 0.035) + 1);
    assert.equal(sweepSamples(6, 30), 24);
    assert.equal(sweepSamples(6, 300), 32);
    // No sidereal day in the document: it does not turn.
    const noDay = pictured(body((worlds) => { delete worlds[0].siderealHours; }), days);
    assert.equal(disc(discBatch(noDay.plan, noDay.picture, CAMERA, clock, OPTIONS), 'w0').spin, 0);
});

test('where the turning differs from the legacy request: locked moons; and where it does not: retrograde', () => {
    const days = 1000.25;
    const where = (made) => {
        const { plan, picture } = pictured(made, days, { ...VIEW, zoom: 3, z: 1.6 });
        return { batch: discBatch(plan, picture, CAMERA, clockAt(days), OPTIONS), at: placed(picture) };
    };
    // A planet locked to its star: one face to it, upright, as legacy (2750-2751, 2768).
    const locked = where(body((worlds) => { worlds[0].tidallyLocked = true; }));
    const planet = locked.at.get('w0');
    const starAngle = Math.atan2(planet.starY - planet.y, planet.starX - planet.x);
    const lockedDisc = disc(locked.batch, 'w0');
    close(lockedDisc.spin, starAngle);
    close(lockedDisc.cloudSpin, starAngle);
    assert.equal(lockedDisc.tiltDeg, 0);
    assert.equal(lockedDisc.sweep, 0);
    assert.deepEqual(disc(where(body((worlds) => { worlds[0].isTwilightZone = true; })).batch, 'w0').spin, lockedDisc.spin);

    // A moon marked tidallyLocked is locked to its planet (Johnny, Q1). Legacy would pin its face
    // to the star with no tilt; here it turns once a sidereal day of its own and keeps its tilt.
    const free = where(body());
    const moon = disc(free.batch, 'w2m2');
    const moonAt = free.at.get('w2m2');
    assert.equal(moon.body.tidallyLocked, true);
    close(moon.spin, ((days * 24 / 200) % 1) * TAU);
    assert.ok(Math.abs(moon.spin - Math.atan2(moonAt.starY - moonAt.y, moonAt.starX - moonAt.x)) > 0.01, 'not the angle to the star');
    assert.equal(moon.tiltDeg, 25);

    // A backwards spin is the tilt's to carry, as in the legacy request: the same forward angle,
    // and a tilt past 90° that turns the axis away. No sign is put on the spin as well.
    const forward = disc(where(body()).batch, 'w0');
    const backward = disc(where(body((worlds) => { worlds[0].axialTilt = 130; })).batch, 'w0');
    assert.equal(backward.tiltDeg, 130);
    close(backward.spin, forward.spin);
    assert.ok(backward.spin > 0);
    // The tilt is held to 0..180 as the legacy profile holds it.
    assert.equal(turnOf({ axialTilt: 200, siderealHours: 20 }, false, 0, clockAt(1)).tiltDeg, 180);
    assert.equal(turnOf({ siderealHours: 20 }, false, 0, clockAt(1)).tiltDeg, 0);
});

test('a ringed world: the band inside its first moon, its particles turning every seven hours', () => {
    const days = 1000.25;
    const view = { ...VIEW, zoom: 3, z: 1.6 };
    const { plan, picture } = pictured(body(), days, view);
    const clock = clockAt(days, { rate: 0.5 });
    const batch = discBatch(plan, picture, CAMERA, clock, OPTIONS);
    const giant = placed(picture).get('w2').at;
    const ring = disc(batch, 'w2').ring;
    // One entry of world.rings and one ring moon: two rings.
    const first = giant.world.moons.find((m) => !m.ring);
    const limit = (moonOrbitRadius(giant.r, first.index, true, giant.z) - first.basePx * giant.z - 2) / giant.r;
    const outer = Math.max(1.4, Math.min(limit, 1.6 + 0.2 * 2, RING_OUTER));
    assert.equal(ring.inner, RING_INNER);
    close(ring.outer, outer);
    close(ring.fill, 0.85);
    close(ring.phase, ((days * 24 / 7) % 1) * TAU);
    close(ring.detail, 1 - Math.max(0, Math.min(1, (TAU * (0.5 * 24 / 7) / 60 - 0.05) / 0.4)));
    assert.deepEqual(ring, ringOf(giant, clock));
    // The rings widen the tile, so a big ringed world is capped sooner.
    assert.equal(disc(batch, 'w2').radiusPx, shadeRadius(giant.r, 2, ring.outer));
    assert.equal(shadeRadius(100, 2, null), 200);
    close(shadeRadius(800, 2, null), 1100);
    close(shadeRadius(800, 2, 2), 1600 * (2000 / (1600 * 2.02)));
    // A world with no rings has none; nor has any moon.
    assert.equal(disc(batch, 'w0').ring, null);
    assert.equal(disc(batch, 'w2m2').ring, null);
    // The Moons layer off: the moon discs are gone. The planet's shade request is the one
    // it has with the moons showing: ring, casters, light and spin.
    const bare = pictured(body(), days, view, { ...DEFAULT_LAYERS, moons: false });
    const bareBatch = discBatch(bare.plan, bare.picture, CAMERA, clock, { ...OPTIONS, moonsShown: false });
    assert.equal(bareBatch.discs.some((item) => item.key.includes('m')), false);
    const shade = (item) => ({
        radiusPx: item.radiusPx, spin: item.spin, cloudSpin: item.cloudSpin, sweep: item.sweep,
        samples: item.samples, tiltDeg: item.tiltDeg, light: item.light, sun: item.sun,
        ring: item.ring, casters: item.casters, lightMode: item.lightMode,
    });
    assert.deepEqual(shade(disc(bareBatch, 'w2')), shade(disc(batch, 'w2')));
    assert.deepEqual(shade(disc(bareBatch, 'w0')), shade(disc(batch, 'w0')));
    assert.deepEqual(disc(bareBatch, 'w0').casters, []);
});

test('a moon in its planet’s shadow: the planet is its caster, in the way of the light', () => {
    const view = { ...VIEW, zoom: 3, z: 1.6 };
    const made = body();
    let found = null;
    for (let step = 0; step < 4000 && !found; step++) {
        const days = 1000 + step * 0.01;
        const { plan, picture } = pictured(made, days, view);
        const moon = placed(picture).get('w2m2').moon;
        if (moon.cover === 1) found = { days, plan, picture };
    }
    assert.ok(found, 'the moon passes behind its planet');
    const batch = discBatch(found.plan, found.picture, CAMERA, clockAt(found.days), OPTIONS);
    const at = placed(found.picture);
    const moon = at.get('w2m2');
    const planet = at.get('w2');
    const shaded = disc(batch, 'w2m2');
    // Its nearest related body is its planet, in its own radii.
    assert.equal(shaded.casters.length, 1);
    const [cx, cy, cr] = shaded.casters[0];
    close(cx, (planet.x - moon.x) / moon.r);
    close(cy, (planet.y - moon.y) / moon.r);
    close(cr, planet.r / moon.r);
    // The planet stands between the moon and the star: toward the light, and across its line.
    const along = cx * shaded.light[0] + cy * shaded.light[1];
    const across = Math.abs(cx * shaded.light[1] - cy * shaded.light[0]);
    assert.ok(along > 0, 'the caster is on the sunward side');
    assert.ok(across < cr, 'and covers the line to the star');
    // The planet in turn lists its moons, nearest first, at most four.
    const giant = disc(batch, 'w2');
    assert.ok(giant.casters.length >= 2);
    const distances = giant.casters.map((c) => Math.hypot(c[0], c[1]));
    assert.deepEqual(distances, [...distances].sort((a, b) => a - b));
    // A world with no moons and no parent has no casters.
    assert.deepEqual(disc(batch, 'w0').casters, []);
    // The selected body is nearest: 0 for itself, and the rest by distance on the stage.
    const chosen = discBatch(found.plan, found.picture, CAMERA, clockAt(found.days), { ...OPTIONS, selected: 'w2m2' });
    assert.equal(disc(chosen, 'w2m2').near, 0);
    close(disc(chosen, 'w2').near, Math.hypot(planet.x - moon.x, planet.y - moon.y));
    assert.ok(chosen.discs.every((item) => typeof item.near === 'number'));
    // A selection that is not in the picture gives no order.
    assert.equal('near' in discBatch(found.plan, found.picture, CAMERA, clockAt(found.days), { ...OPTIONS, selected: 'nope' }).discs[0], false);
});

test('a body off the stage is not asked for, but still eclipses', () => {
    const made = body();
    const days = 1000.25;
    const zoomed = { ...VIEW, zoom: 3, z: 1.6 };
    const whole = pictured(made, days, zoomed);
    const planet = placed(whole.picture).get('w2');
    // Slide the stage so the giant's centre is far past the left edge.
    const view = { ...zoomed, offX: -(planet.x + planet.r * 4) };
    const { plan, picture } = pictured(made, days, view);
    const at = placed(picture);
    const batch = discBatch(plan, picture, CAMERA, clockAt(days), OPTIONS);
    assert.ok(at.get('w2').x + at.get('w2').r * 2.1 < 0);
    assert.equal(disc(batch, 'w2'), undefined);
    for (const item of batch.discs) {
        const p = at.get(item.key);
        assert.ok(p.x + p.r * 1.16 + 2 >= 0 && p.x - p.r * 1.16 - 2 <= 1000, item.key + ' is on the stage');
    }
    // Everything off the stage: an empty batch, not an error.
    const gone = pictured(made, days, { ...zoomed, offX: 90000 });
    assert.deepEqual(discBatch(gone.plan, gone.picture, CAMERA, clockAt(days), OPTIONS).discs, []);
});

test('reduced motion freezes spin, cloud drift and ring particles, and keeps the lighting', () => {
    const days = 1000.25;
    const view = { ...VIEW, zoom: 3, z: 1.6 };
    const made = body((worlds) => { worlds[0].tidallyLocked = true; });
    const { plan, picture } = pictured(made, days, view);
    const moving = discBatch(plan, picture, CAMERA, clockAt(days, { rate: 5 }), OPTIONS);
    const frozen = discBatch(plan, picture, CAMERA, clockAt(days, { rate: 5, motion: false }), OPTIONS);
    assert.equal(frozen.timeSeconds, 0, 'the animation time stands still, so clouds do not drift');
    assert.equal(moving.timeSeconds, 12.5);
    assert.deepEqual(frozen.discs.map((item) => item.key), moving.discs.map((item) => item.key));
    let turning = 0;
    for (const still of frozen.discs) {
        const live = disc(moving, still.key);
        // Lighting, size, tilt, rings' shape and eclipses are as with motion.
        assert.deepEqual(still.light, live.light, still.key);
        assert.deepEqual(still.sun, live.sun);
        assert.deepEqual(still.casters, live.casters);
        assert.equal(still.radiusPx, live.radiusPx);
        assert.equal(still.tiltDeg, live.tiltDeg);
        if (still.ring) {
            assert.equal(still.ring.phase, 0);
            assert.equal(still.ring.outer, live.ring.outer);
            assert.notEqual(live.ring.phase, 0);
        }
        if (still.key === 'w0') {
            // A planet locked to its star still faces it: that is lighting, not motion.
            assert.equal(still.spin, live.spin);
            close(still.spin, Math.atan2(still.light[1], still.light[0]));
            continue;
        }
        assert.equal(still.spin, 0, still.key);
        assert.equal(still.cloudSpin, 0);
        assert.equal(still.sweep, 0);
        assert.equal(still.samples, 1);
        if (live.spin !== 0) turning += 1;
    }
    assert.ok(turning >= 3, 'the same bodies do turn with motion on');
    assert.ok(disc(frozen, 'w0'), 'the locked planet is in the batch');
});

test('the light is the primary’s colour, as the legacy sun', () => {
    assert.deepEqual(sunColour('#ffffff'), [1, 1, 1]);
    const g = sunColour('#fff4ea');
    close(g[0], 1);
    close(g[1], 0.45 + (244 / 255) * 0.55);
    close(g[2], 0.45 + (234 / 255) * 0.55);
    close(sunColour('#000000')[0], 0.45);
    // Anything that is not a token colour is white light.
    assert.deepEqual(sunColour(''), [1, 1, 1]);
    assert.deepEqual(sunColour(null), [1, 1, 1]);
    assert.deepEqual(sunColour('rgb(1, 2, 3)'), [1, 1, 1]);
});

test('the rate the date moves at is eased, capped, and ignores a jump', () => {
    // A steady day a second: the rate climbs toward 1 over about a fifth of a second.
    let rate = 0;
    for (let frame = 0; frame < 60; frame++) rate = visualRate(rate, 1 / 60, 1 / 60);
    close(rate, 1, 1e-2);
    close(visualRate(0, 1 / 60, 1 / 60), (1 / 60) / 0.18);
    // Backwards counts the same; a long frame takes the whole step at once.
    close(visualRate(0, -0.5, 0.25), 2);
    // Capped at ten years a second; a jump of the date is a cut and changes nothing.
    assert.equal(visualRate(0, 4000, 1), 3650);
    assert.equal(visualRate(7, 400, 1 / 60), 7);
});

test('a line-up asks for the same bodies, where the line-up puts them', () => {
    const days = 1000.25;
    const plan = planSystem(normalizeSystem(body()), HEX_KEY);
    const picture = layoutLineup(plan, { ...VIEW, moons: true }, 'row', days, DEFAULT_LAYERS);
    const batch = discBatch(plan, picture, CAMERA, clockAt(days), OPTIONS);
    const at = placed(picture);
    assert.ok(batch.discs.length >= 3);
    for (const item of batch.discs) {
        const p = at.get(item.key);
        close(Math.atan2(item.light[1], item.light[0]), Math.atan2(p.starY - p.y, p.starX - p.x));
    }
    assert.ok(disc(batch, 'w2').ring);
});

test('Regina and Zeycude: the released systems, at the fitted view', { timeout: 120000 }, async () => {
    const require = createRequire(import.meta.url);
    const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
    const listed = JSON.parse(fs.readFileSync(path.join(ROOT, 'universe/raw/sectors.json'), 'utf8'))
        .sectors.find((sector) => sector.slug === 'Spinward_Marches');
    const marches = await buildSector({
        slug: 'Spinward_Marches',
        tsv: fs.readFileSync(path.join(ROOT, 'universe/raw/Spinward_Marches.tsv'), 'utf8'),
        metadataXml: fs.readFileSync(path.join(ROOT, 'universe/raw/Spinward_Marches.xml'), 'utf8'),
        pinned: { seed: TRUTH_SEED, settings: TRUTH_SETTINGS, engineVersion: require(path.join(ROOT, 'packages/engines/package.json')).version },
        version: 'v2',
        catalogue: { name: listed.name, x: listed.x, y: listed.y, tags: listed.tags, canonical: listed.canonical },
    });
    const days = 400.3;
    const batches = {};
    for (const [hex, name] of [['1910', 'Regina'], ['0101', 'Zeycude']]) {
        assert.equal(marches.index.hexes[hex].name, name);
        const tree = JSON.parse(marches.objects.get(marches.index.hexes[hex].tree));
        const plan = planSystem(normalizeSystem(tree.body), 'Spinward_Marches/' + hex);
        const picture = orbitPicture(plan, layoutScene(plan, VIEW, days), DEFAULT_LAYERS, VIEW.z);
        const batch = discBatch(plan, picture, CAMERA, clockAt(days, { rate: 1 }), OPTIONS);
        const at = placed(picture);
        batches[name] = { batch, at, plan };
        assert.ok(batch.discs.length >= 8, name + ' has ' + batch.discs.length);
        assert.equal(new Set(batch.discs.map((item) => item.key)).size, batch.discs.length);
        assert.deepEqual(structuredClone(batch), batch);
        for (const item of batch.discs) {
            const p = at.get(item.key);
            assert.equal(item.hexKey, 'Spinward_Marches/' + hex);
            assert.ok(p.r >= DISC_MIN_PX);
            close(item.radiusPx, p.r * 2, 1e-9);
            close(Math.hypot(item.light[0], item.light[1]), 1);
            assert.ok(item.tiltDeg >= 0 && item.tiltDeg <= 180);
            assert.ok(item.spin >= 0 && item.spin < TAU, item.key + ' spin ' + item.spin);
            assert.ok(Number.isInteger(item.samples) && item.samples >= 1 && item.samples <= 32);
            // Every moon lists its planet; a planet lists its moons that are big enough to shade.
            if (p.moon) assert.equal(item.casters.length, 1, item.key);
        }
    }
    const regina = batches.Regina;
    // The mainworld is a moon marked tidallyLocked: it turns with its own 24-hour sidereal day
    // and keeps its 0.4° tilt, where legacy would face it to the star with none.
    const main = disc(regina.batch, 'w4m1');
    assert.equal(main.body.name, 'Regina');
    assert.equal(main.body.tidallyLocked, true);
    close(main.spin, ((days * 24 / main.body.siderealHours) % 1) * TAU);
    close(main.tiltDeg, main.body.axialTilt);
    const parent = regina.at.get('w4');
    const moon = regina.at.get('w4m1');
    close(main.casters[0][2], parent.r / moon.r);
    // Regina A-II and A-VII turn backwards: the tilt says so, the spin stays forward.
    assert.equal(disc(regina.batch, 'w2').tiltDeg, 130);
    assert.equal(disc(regina.batch, 'w8').tiltDeg, 94);
    // Its three ringed worlds wear rings; the others do not.
    assert.deepEqual(regina.batch.discs.filter((item) => item.ring).map((item) => item.key).sort(), ['w5', 'w6', 'w9']);
    const zeycude = batches.Zeycude;
    assert.deepEqual(zeycude.batch.discs.filter((item) => item.ring).map((item) => item.key), ['w6']);
    assert.equal(disc(zeycude.batch, 'w8').tiltDeg, 177);
    assert.equal(disc(zeycude.batch, 'w0').body.name, 'Zeycude');
    assert.ok(disc(zeycude.batch, 'w6').casters.length >= 3);
});
