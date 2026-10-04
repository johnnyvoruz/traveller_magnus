/**
 * The orbit picture's layout (apps/web/src/orbit/layout.ts). Expected values are computed
 * here from the formulas findings/legacy_orbit_inventory.md §2 and §5 record (and the legacy
 * lines each helper cites), not copied from the module's output.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildSector } from '@voyage/generation';
import { TRUTH_SEED, TRUTH_SETTINGS } from '../../tools/truth/settings.js';
import { bodyKeys } from '../../apps/web/src/dossier/model.ts';
import {
    arcSpan, AU_KM, bodyOf, hasRings, hitAt, hitOf, hundredDau, hundredDpx, isMainworldBelt,
    jumpCircleContains, layoutScene, localBounds, localKeys, mainworldMark, moonOrbitRadius,
    orbitHole, planSystem, ringOrbitRadius, satelliteRadius, sceneBounds, selectionLabel,
    shadowCover, starBodyRadius, starHundredDau, starHzAU, subSystemRadius, SUN_DIAM_KM,
    visibleJumpCircles, visibleJumpRadius, worldBodyRadius, zoomScale,
} from '../../apps/web/src/orbit/layout.ts';
import {
    bodyAngle, hashEpoch, keplerYears, moonBasePx, moonPeriodYears, orbitToAU, scaleR,
    starBasePx, starCompanionAU, worldBasePx,
} from '../../apps/web/src/orbit/maths.ts';
import { normalizeSystem } from '../../apps/web/src/orbit/system.ts';
import { HEX_KEY, testSystem } from './orbit_fixture.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, a + ' is not ' + b);
const view = (over = {}) => ({ w: 1000, h: 800, zoom: 1, offX: 0, offY: 0, z: 1, linear: false, ...over });

test('the zoom scale is 1 at the fitted view and while fitting, and grows past it', () => {
    assert.equal(zoomScale(1, 1, false), 1);
    assert.equal(zoomScale(3, 1.5, false), 2);
    assert.equal(zoomScale(0.5, 1, false), 1);
    assert.equal(zoomScale(3, 1.5, true), 1);
    assert.equal(zoomScale(3, 0, false), 3);
});

test('disc radii are the base size times the zoom scale; an orbit starts 14 px clear of the star', () => {
    const star = { diam: 1 };
    const world = { diamKm: 12742 };
    const moon = { diamKm: 3474 };
    close(starBodyRadius(star, 2.5), starBasePx(star) * 2.5);
    close(worldBodyRadius(world, 2.5), worldBasePx(world) * 2.5);
    close(satelliteRadius(moon, 2.5), moonBasePx(moon) * 2.5);
    assert.equal(orbitHole(30, 1), 44);
    assert.equal(orbitHole(30, 2), 58);
    assert.equal(orbitHole(0, 1), 14);
});

test('moons sit 10 px out and 6 px apart, clear of any rings; flat rings spread from 1.3 to 2 radii', () => {
    assert.equal(hasRings({ rings: [{}], moons: [] }), true);
    assert.equal(hasRings({ rings: [], moons: [{ size: 'R' }] }), true);
    assert.equal(hasRings({ rings: [], moons: [{ size: 'S' }] }), false);
    assert.equal(hasRings(null), false);
    assert.equal(moonOrbitRadius(10, 0, false, 1), 20);
    assert.equal(moonOrbitRadius(10, 2, false, 1), 32);
    assert.equal(moonOrbitRadius(10, 2, false, 3), 10 + 22 * 3);
    close(moonOrbitRadius(10, 0, true, 1), 10 * 2.15 + 10);
    close(ringOrbitRadius(10, 0, 1), 10 * (1.3 + 0.35));
    close(ringOrbitRadius(10, 1, 3), 10 * (1.3 + 0.7 * 2 / 4));
});

test('a companion keeps 28% of its orbit for its planets, or what clears its own disc', () => {
    const star = { diam: 0.5 };
    const needed = orbitHole(starBodyRadius(star, 1), 1) / 0.58;
    close(subSystemRadius(star, 1000, 1), 280);
    close(subSystemRadius(star, 10, 1), needed);
});

test('the habitable centre is the system value for the primary and the root of luminosity for another star', () => {
    const sys = { hzAU: 1.3, stars: [{ lum: 2 }, { lum: 0.04 }, { lum: 0 }, {}] };
    assert.equal(starHzAU(sys, 0), 1.3);
    close(starHzAU(sys, 1), 0.2);
    assert.equal(starHzAU(sys, 2), null);
    assert.equal(starHzAU(sys, 3), null);
    assert.equal(starHzAU({ stars: [] }, 0), null);
    assert.equal(starHzAU(null), null);
});

test('a mainworld of size 0 is drawn as a belt', () => {
    assert.equal(isMainworldBelt({ type: 'Mainworld', size: 0 }), true);
    assert.equal(isMainworldBelt({ type: 'Mainworld', size: 5, uwp: 'A000000-0' }), true);
    assert.equal(isMainworldBelt({ type: 'Mainworld', size: 5, uwp: 'A567000-0' }), false);
    assert.equal(isMainworldBelt({ type: 'Planetoid Belt', size: 0 }), false);
});

test('the 100D limit is a hundred diameters in AU, and a pixel width on the scale it sits on', () => {
    assert.equal(AU_KM, 149597870.7);
    close(hundredDau(12742), 100 * 12742 / AU_KM);
    assert.equal(hundredDau(0), 0);
    assert.equal(hundredDau(null), 0);
    close(starHundredDau({ diam: 1.34 }), 100 * 1.34 * SUN_DIAM_KM / AU_KM);
    assert.equal(starHundredDau({}), 0);
    const expected = Math.abs(scaleR(1 + 0.2, 10, 300, 40, false) - scaleR(1, 10, 300, 40, false));
    close(hundredDpx(1, 0.2, 10, 300, 40, false), expected);
    assert.equal(hundredDpx(1, 0, 10, 300, 40, false), 0);
    // A star's ring is lifted clear of the drawn corona when the scale squeezes it inside.
    assert.equal(visibleJumpRadius(10, 20), 20 * 1.62);
    assert.equal(visibleJumpRadius(50, 20), 50);
});

test('a jump circle wholly inside a larger one is dropped', () => {
    const big = { cx: 0, cy: 0, r: 100, label: 'a' };
    const inside = { cx: 30, cy: 0, r: 60, label: 'b' };
    const crossing = { cx: 80, cy: 0, r: 60, label: 'c' };
    assert.equal(jumpCircleContains(big, inside), true);
    assert.equal(jumpCircleContains(big, crossing), false);
    // 30 + 71 = 101 is within the 1 px allowance.
    assert.equal(jumpCircleContains(big, { cx: 30, cy: 0, r: 71, label: '' }), true);
    assert.deepEqual(visibleJumpCircles([big, inside, crossing]).map((ring) => ring.label), ['a', 'c']);
    // Equal circles do not drop each other.
    assert.equal(visibleJumpCircles([big, { ...big }]).length, 2);
});

test('only the part of a circle that can reach the canvas is stroked', () => {
    // Wholly off the canvas.
    assert.equal(arcSpan(-500, -500, 100, 1000, 800), null);
    // So large the canvas is inside it and no part of the line crosses.
    assert.equal(arcSpan(500, 400, 5000, 1000, 800), null);
    // Centre on the canvas, or a small circle: the whole turn.
    assert.deepEqual(arcSpan(500, 400, 100, 1000, 800), [0, Math.PI * 2]);
    assert.deepEqual(arcSpan(-50, 400, 100, 1000, 800), [0, Math.PI * 2]);
    // A huge circle from a centre far to the left: a short arc facing the canvas.
    const span = arcSpan(-9500, 400, 10000, 1000, 800);
    assert.ok(span);
    assert.ok(span[1] - span[0] < 0.2);
    assert.ok(span[0] < 0 && span[1] > 0);
});

test('a moon is shaded only behind its world as seen from the star', () => {
    // Star at the origin, world at (100, 0) radius 10.
    assert.equal(shadowCover(130, 0, 100, 0, 10, 0, 0), 1);
    assert.equal(shadowCover(70, 0, 100, 0, 10, 0, 0), 0);
    assert.equal(shadowCover(130, 40, 100, 0, 10, 0, 0), 0);
    const edge = shadowCover(130, 10, 100, 0, 10, 0, 0);
    assert.ok(edge > 0 && edge < 1);
});

test('the mainworld mark is a small star over the disc, and a rim badge once the disc is large', () => {
    assert.deepEqual(mainworldMark(100, 100, 6, 1), { x: 100, y: 100, outer: 3, inner: 3 * 0.38 });
    const far = mainworldMark(100, 100, 12, 1);
    assert.equal(far.outer, 4.5);
    const big = mainworldMark(100, 100, 40, 3);
    assert.equal(big.outer, 8);
    close(big.x, 100 + 40 * 0.74);
    close(big.y, 100 - 40 * 0.74);
});

test('the plan names bodies by the dossier keys and keeps the legacy epoch indices', () => {
    const sys = testSystem();
    const plan = planSystem(sys, HEX_KEY);
    const keys = [];
    for (const s of plan.stars) keys.push(s.key);
    for (const w of plan.worlds) { keys.push(w.key); for (const m of w.moons) keys.push(m.key); }
    assert.deepEqual(keys, bodyKeys(sys));
    assert.deepEqual(keys, ['s0', 's1', 'w0', 'w2', 'w2m0', 'w2m2', 'w2m3', 'w3', 'w4']);

    // Epochs: the place among non-Empty worlds and non-Empty moons, as the legacy keys (2862, 3186, 4579).
    const giant = plan.worlds[1];
    assert.equal(giant.key, 'w2');
    assert.equal(giant.index, 1);
    assert.equal(giant.epoch, hashEpoch(HEX_KEY + ':world:1'));
    assert.equal(giant.moons[1].key, 'w2m2');
    assert.equal(giant.moons[1].index, 1);
    assert.equal(giant.moons[1].epoch, hashEpoch(HEX_KEY + ':moon:1:1'));
    assert.equal(plan.stars[1].epoch, hashEpoch(HEX_KEY + ':star:1'));

    // Periods: the document's own, else Kepler from the parent's mass.
    assert.equal(giant.period, 11.2);
    close(plan.stars[1].period, keplerYears(starCompanionAU(sys.stars[1]), 1));
    close(giant.moons[0].period, moonPeriodYears(sys.worlds[2].moons[0], sys.worlds[2]));

    // Which star draws which worlds; the belt; the ring listed as a moon; world.rings.
    assert.deepEqual(plan.sets[0].map((w) => w.key), ['w0', 'w2', 'w3']);
    assert.deepEqual(plan.sets[1].map((w) => w.key), ['w4']);
    assert.equal(plan.worlds[2].belt, true);
    assert.equal(giant.tone, 'gasLarge');
    assert.equal(giant.ringed, true);
    assert.equal(giant.rings, 1);
    assert.equal(giant.ringMoons, 1);
    assert.equal(giant.moons[2].ring, true);
    assert.equal(giant.moons[1].mainworld, true);

    // The scale: the furthest orbit (the companion at orbit 12) plus 18%.
    close(plan.maxAU, orbitToAU(12) * 1.18);
    close(plan.hzAU, orbitToAU(3));
    assert.equal(plan.hasOrbits, true);

    // The highport is only where the starport profile says so.
    assert.deepEqual(giant.moons[1].port, { cls: 'A', major: true });
    assert.equal(giant.port, null);
    assert.equal(plan.portEpoch, hashEpoch(HEX_KEY + ':highport'));

    assert.equal(bodyOf(plan, 'w2m2'), sys.worlds[2].moons[2]);
    assert.equal(bodyOf(plan, 's1'), sys.stars[1]);
    assert.equal(bodyOf(plan, 'w9'), null);
});

test('a scene places every body where the legacy formulas put it', () => {
    const sys = testSystem();
    const plan = planSystem(sys, HEX_KEY);
    const days = 1105 * 365 + 40.25;
    const v = view({ zoom: 2, offX: 30, offY: -20, z: 1.5 });
    const scene = layoutScene(plan, v, days);

    // Origin and scale (2793-2798).
    const originX = 500 + 30;
    const originY = 400 - 20;
    const maxPx = Math.max(10, Math.min(1000, 800) / 2 - 70) * 2;
    const primaryR = starBasePx(sys.stars[0]) * 1.5;
    const hole = primaryR + 14 * 1.5;
    assert.equal(scene.originX, originX);
    assert.equal(scene.originY, originY);
    assert.deepEqual([scene.stars[0].x, scene.stars[0].y, scene.stars[0].r], [originX, originY, primaryR]);

    // The rocky world: orbit radius from the log scale, angle from epoch and period.
    const rocky = scene.primary.bodies[0];
    const orbitR = scaleR(0.5, plan.maxAU, maxPx, hole, false);
    const angle = bodyAngle(hashEpoch(HEX_KEY + ':world:0'), 0.35, days);
    close(rocky.x, originX + orbitR * Math.cos(angle));
    close(rocky.y, originY + orbitR * Math.sin(angle));
    close(rocky.r, worldBasePx(sys.worlds[0]) * 1.5);
    close(scene.primary.orbits[0], orbitR);

    // The gas giant's first moon: 10 px out past the rings, scaled by the zoom scale.
    const giant = scene.primary.bodies[1];
    const moon = giant.moons[0];
    const dist = giant.r * 2.15 + 10 * 1.5;
    const moonAngle = bodyAngle(hashEpoch(HEX_KEY + ':moon:1:0'), plan.worlds[1].moons[0].period, days);
    close(moon.orbitR, dist);
    close(moon.x, giant.x + dist * Math.cos(moonAngle));
    close(moon.y, giant.y + dist * Math.sin(moonAngle));
    // The mainworld moon is the second non-Empty moon: 6 px further.
    close(giant.moons[1].orbitR, giant.r * 2.15 + 16 * 1.5);
    // The ring listed as a moon and the world.rings circle are static circles round the world.
    close(giant.moons[2].orbitR, ringOrbitRadius(giant.r, 0, 1));
    assert.deepEqual([giant.moons[2].x, giant.moons[2].y], [giant.x, giant.y]);
    close(giant.rings[0], ringOrbitRadius(giant.r, 0, 1));

    // The belt is a ring round the star, not a body.
    assert.equal(scene.primary.belts.length, 1);
    close(scene.primary.belts[0].r, scaleR(2.8, plan.maxAU, maxPx, hole, false));
    assert.equal(scene.primary.bodies.length, 2);

    // The companion: ring radius (2812-2833; nothing lies outside it here), angle, and its own scale.
    const comp = scene.companions[0];
    const compAU = starCompanionAU(sys.stars[1]);
    const ringR = Math.max(scaleR(compAU, plan.maxAU, maxPx, hole, false), 20, hole, 4);
    const compAngle = bodyAngle(hashEpoch(HEX_KEY + ':star:1'), plan.stars[1].period, days);
    close(comp.at.ringR, ringR);
    close(comp.at.x, originX + ringR * Math.cos(compAngle));
    close(comp.at.y, originY + ringR * Math.sin(compAngle));
    const compR = starBasePx(sys.stars[1]) * 1.5;
    const subHole = compR + 14 * 1.5;
    const subR = Math.max(ringR * 0.28, subHole / 0.58);
    close(comp.set.orbits[0], scaleR(0.2, 0.2 * 1.2, subR, subHole, false));
    // Its habitable band: centre √L, on the same sub-scale, labelled with the star's short name.
    close(comp.band.inner, scaleR(0.2 * 0.70, 0.24, subR, subHole, false));
    close(comp.band.outer, scaleR(0.2 * 1.55, 0.24, subR, subHole, false));
    assert.equal(comp.band.label, 'HABITABLE ZONE · M0 V');

    // The primary's band: 0.70 to 1.55 of the zone's centre.
    close(scene.band.inner, scaleR(plan.hzAU * 0.70, plan.maxAU, maxPx, hole, false));
    close(scene.band.outer, scaleR(plan.hzAU * 1.55, plan.maxAU, maxPx, hole, false));
    assert.equal(scene.band.label, 'HABITABLE ZONE');
});

test('hit targets are in the legacy order, with the legacy radii', () => {
    const plan = planSystem(testSystem(), HEX_KEY);
    const scene = layoutScene(plan, view({ z: 2 }), 1000);
    // Companion worlds, then the primary's belts, each world after its moons and rings, stars last.
    assert.deepEqual(scene.hits.map((hit) => hit.kind + ':' + hit.key), [
        'world:w4',
        'belt:w3',
        'world:w0',
        'moon:w2m0', 'moon:w2m2', 'moon:w2m3', 'ring:w2', 'world:w2',
        'star:s0', 'star:s1',
    ]);
    const giant = scene.primary.bodies[1];
    const world = hitOf(scene, 'w2');
    assert.equal(world.kind, 'world');
    assert.equal(world.r, Math.max(giant.r + 9 * 2, 14));
    assert.equal(world.visualR, giant.r);
    const moon = hitOf(scene, 'w2m0');
    assert.equal(moon.r, Math.max(giant.moons[0].r + 6 * 2, 9));
    const star = hitOf(scene, 's0');
    assert.equal(star.r, scene.stars[0].r + 8 * 2);
    const belt = hitOf(scene, 'w3');
    assert.equal(belt.r, scene.primary.belts[0].r + 14);
    assert.equal(belt.innerR, scene.primary.belts[0].r - 14);
    const ring = scene.hits.find((hit) => hit.kind === 'ring');
    assert.equal(ring.r - ring.innerR, 12);
    assert.equal(hitOf(scene, null), null);
    assert.equal(hitOf(scene, 'w9'), null);

    // A point on a body finds it; the star lies over anything under it; a belt is hit only on its band.
    assert.equal(hitAt(scene, giant.x, giant.y).key, 'w2');
    assert.equal(hitAt(scene, giant.moons[0].x, giant.moons[0].y).key, 'w2m0');
    assert.equal(hitAt(scene, scene.originX, scene.originY).key, 's0');
    const beltR = scene.primary.belts[0].r;
    const onBelt = hitAt(scene, scene.originX, scene.originY - beltR);
    assert.equal(onBelt.key, 'w3');
    assert.equal(hitAt(scene, 3, 3), null);
});

test('the 100D circles: the star, each world whose circle clears its disc, none wholly inside another', () => {
    const sys = testSystem();
    const plan = planSystem(sys, HEX_KEY);
    const v = view({ zoom: 40, z: 40 });
    const scene = layoutScene(plan, v, 1000);
    const labelled = scene.jumps.filter((ring) => ring.label === '100D jump');
    assert.ok(labelled.length >= 1);
    const maxPx = 330 * 40;
    const hole = starBasePx(sys.stars[0]) * 40 + 14 * 40;
    const starRing = scene.jumps.find((ring) => ring.cx === scene.originX && ring.cy === scene.originY);
    close(starRing.r, Math.max(scaleR(starHundredDau(sys.stars[0]), plan.maxAU, maxPx, hole, false), starBasePx(sys.stars[0]) * 40 * 1.62));
    for (const ring of scene.jumps) assert.ok(ring.r >= 6 && ring.r <= 80000);
    for (const a of scene.jumps) for (const b of scene.jumps) if (a !== b && a.r > b.r) assert.equal(jumpCircleContains(a, b), false);
});

test('the bounds hold every body, and a focus frames itself with what orbits it', () => {
    const plan = planSystem(testSystem(), HEX_KEY);
    const v = view();
    const scene = layoutScene(plan, v, 500);
    const bounds = sceneBounds(plan, v, 500);
    for (const at of scene.stars) {
        assert.ok(at.x - at.r >= bounds.left && at.x + at.r <= bounds.right);
        assert.ok(at.y - at.r >= bounds.top && at.y + at.r <= bounds.bottom);
    }
    for (const at of scene.primary.bodies) {
        assert.ok(at.x >= bounds.left && at.x <= bounds.right && at.y >= bounds.top && at.y <= bounds.bottom);
    }
    // Local keys (5237-5258): a star with its worlds and their moons, a world with its moons, a moon alone.
    assert.deepEqual([...localKeys(plan, 's1')].sort(), ['s1', 'w4']);
    assert.deepEqual([...localKeys(plan, 'w2')].sort(), ['w2', 'w2m0', 'w2m2', 'w2m3']);
    assert.deepEqual([...localKeys(plan, 'w2m2')], ['w2m2']);
    assert.ok(localKeys(plan, 's0').has('w3') && !localKeys(plan, 's0').has('w4'));
    const giant = scene.primary.bodies[1];
    const box = localBounds(plan, scene, 'w2');
    const worldHit = hitOf(scene, 'w2');
    assert.ok(box.left <= giant.x - worldHit.r && box.right >= giant.x + worldHit.r);
    for (const m of giant.moons) if (!m.moon.ring) assert.ok(m.x >= box.left && m.x <= box.right && m.y >= box.top && m.y <= box.bottom);
    assert.equal(localBounds(plan, scene, 'w9'), null);
});

test('the selection tag is the name and the profile, as the legacy readout', () => {
    assert.deepEqual(selectionLabel({ name: 'Regina', uwp: 'A788899-C' }), ['Regina', 'A788899-C']);
    assert.deepEqual(selectionLabel({ name: 'F7 V', sType: 'F', subType: 7, sClass: 'V' }), ['F7 V', 'F7V']);
    assert.deepEqual(selectionLabel({ name: 'Regina A-II', type: 'Gas Giant', ggType: 'GL' }), ['Regina A-II', 'Gas Giant GL']);
    assert.deepEqual(selectionLabel({ type: 'Planetoid Belt' }), ['Planetoid Belt', '']);
    assert.deepEqual(selectionLabel({}), ['Body', '']);
});

test('Regina: every dossier key has a hit target, at every zoom, with finite geometry', async () => {
    const require = createRequire(import.meta.url);
    const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
    const listed = JSON.parse(fs.readFileSync(path.join(ROOT, 'universe/raw/sectors.json'), 'utf8'))
        .sectors.find((sector) => sector.slug === 'Spinward_Marches');
    const marches = await buildSector({
        slug: 'Spinward_Marches',
        tsv: fs.readFileSync(path.join(ROOT, 'universe/raw/Spinward_Marches.tsv'), 'utf8'),
        metadataXml: fs.readFileSync(path.join(ROOT, 'universe/raw/Spinward_Marches.xml'), 'utf8'),
        pinned: { seed: TRUTH_SEED, settings: TRUTH_SETTINGS, engineVersion: require('../../packages/engines/package.json').version },
        version: 'v2',
        catalogue: { name: listed.name, x: listed.x, y: listed.y, tags: listed.tags, canonical: listed.canonical },
    });
    const tree = JSON.parse(marches.objects.get(marches.index.hexes['1910'].tree));
    const sys = normalizeSystem(tree.body);
    const plan = planSystem(sys, 'Spinward_Marches/1910');
    const keys = bodyKeys(sys);
    assert.equal(keys.length, 41);
    for (const zoom of [1, 7, 60, 900, 5000]) {
        const scene = layoutScene(plan, view({ zoom, z: zoom }), 1105 * 365 + 1);
        for (const key of keys) assert.ok(hitOf(scene, key), key + ' at zoom ' + zoom);
        for (const hit of scene.hits) assert.ok(Number.isFinite(hit.cx) && Number.isFinite(hit.cy) && hit.r > 0);
        for (const ring of scene.jumps) assert.ok(Number.isFinite(ring.r));
    }
    // The mainworld is a moon of the fifth world and carries the highport.
    const main = plan.worlds.flatMap((w) => w.moons).find((m) => m.mainworld);
    assert.equal(main.key, 'w4m1');
    assert.deepEqual(main.port, { cls: 'A', major: true });
});
