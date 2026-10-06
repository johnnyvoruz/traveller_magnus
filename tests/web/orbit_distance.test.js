/**
 * Real distance between two bodies (apps/web/src/orbit/distance.ts). The picture is never read.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BODY_SNAP_PX, picturePlaceAu, placeAtPicture, realDistanceKm, realDistanceKmBetween, realPositionAu } from '../../apps/web/src/orbit/distance.ts';
import { AU_KM, layoutScene } from '../../apps/web/src/orbit/layout.ts';
import { plotText } from '../../apps/web/src/orbit/ships.ts';

function star(key, index, extra = {}) {
    return {
        key, index, body: extra.body || {}, basePx: 8, name: key, separation: extra.separation || '',
        parent: extra.parent ?? 0, au: extra.au ?? 0, period: extra.period ?? 1, epoch: extra.epoch ?? 0, jumpAU: 0,
    };
}

function world(key, au, epoch, extra = {}) {
    const body = extra.body || (extra.missingAu ? {} : { au });
    return {
        key, body, index: extra.index ?? 0, star: extra.star ?? 0, au: extra.missingAu ? 0 : au,
        belt: extra.belt || false, mainworld: false, mainworldBelt: false, tone: extra.belt ? 'belt' : 'world',
        basePx: 6, period: 1, epoch, jumpAU: 0, ringed: false,
        moons: extra.moons || [], ringMoons: 0, rings: 0, name: key, port: null, portPeriod: 1,
    };
}

function moon(key) {
    return {
        key, body: { pd: 8, diamKm: 4000 }, index: 0, ring: false, ringIndex: -1, basePx: 3,
        period: 0.01, epoch: 0, mainworld: false, name: key, port: null, portPeriod: 1,
    };
}

function planOf(stars, worlds) {
    const sets = stars.map(() => []);
    for (const item of worlds) if (item.star >= 0 && sets[item.star]) sets[item.star].push(item);
    return {
        hexKey: 'Test/0101', name: 'Test', sys: {}, stars, worlds, sets,
        maxAU: 5, hzAU: 1, hasOrbits: true, portEpoch: 0, portPhase: 0,
    };
}

const near = (got, expected) => Math.abs(got - expected) < 1e-6;

test('two worlds on one star: conjunction is the difference of the orbits, opposition the sum', () => {
    const inner = world('w1', 1, 0, { index: 0 });
    const outer = world('w2', 3, 0, { index: 1 });
    const plan = planOf([star('s0', 0, { body: { mass: 1 } })], [inner, outer]);
    assert.deepEqual(realPositionAu(plan, 's0', 0), { x: 0, y: 0 });
    assert.deepEqual(realPositionAu(plan, 'w1', 0), { x: 1, y: 0 });
    assert.deepEqual(realPositionAu(plan, 'w2', 0), { x: 3, y: 0 });
    assert.ok(near(realDistanceKm(plan, 'w1', 'w2', 0), 2 * AU_KM));

    outer.epoch = Math.PI;
    const opposed = realDistanceKm(plan, 'w1', 'w2', 0);
    assert.ok(near(opposed, 4 * AU_KM));
});

test('the same body is 0, and an unknown key is null', () => {
    const plan = planOf([star('s0', 0)], [world('w1', 1, 0)]);
    assert.equal(realDistanceKm(plan, 'w1', 'w1', 0), 0);
    assert.equal(realDistanceKm(plan, 's0', 's0', 10), 0);
    assert.equal(realDistanceKm(plan, 'nope', 'nope', 0), null);
    assert.equal(realDistanceKm(plan, 'w1', 'nope', 0), null);
    assert.equal(realPositionAu(plan, 'nope', 0), null);
});

test('a moon, a belt, a world with no au, and a companion with no orbit are null', () => {
    const hosted = world('w1', 2, 0, { moons: [moon('w1m0')] });
    const belt = world('belt', 2.8, 0, { index: 1, belt: true });
    const bare = world('bare', 1, 0, { index: 2, missingAu: true });
    const lost = star('s1', 1, { body: { mass: 0.4 }, separation: 'Far' });
    const aroundLost = world('w9', 0.4, 0, { index: 3, star: 1 });
    const plan = planOf([star('s0', 0, { body: { mass: 1 } }), lost], [hosted, belt, bare, aroundLost]);

    assert.equal(realPositionAu(plan, 'w1m0', 0), null);
    assert.equal(realDistanceKm(plan, 'w1', 'w1m0', 0), null);
    assert.equal(realDistanceKm(plan, 'w1m0', 'w1m0', 0), 0);
    assert.equal(realPositionAu(plan, 'belt', 0), null);
    assert.equal(realDistanceKm(plan, 'w1', 'belt', 0), null);
    assert.equal(realPositionAu(plan, 'bare', 0), null);
    assert.equal(realDistanceKm(plan, 's0', 'bare', 0), null);
    assert.equal(realPositionAu(plan, 's1', 0), null);
    assert.equal(realDistanceKm(plan, 's0', 's1', 0), null);
    assert.equal(realDistanceKm(plan, 'w1', 'w9', 0), null);
    // The two places are both known relative to the unplaced companion, so their difference is real.
    const other = world('w8', 1.4, Math.PI, { index: 4, star: 1 });
    plan.worlds.push(other);
    plan.sets[1].push(other);
    assert.equal(realPositionAu(plan, 'w9', 0), null);
    assert.ok(near(realDistanceKm(plan, 'w9', 'w8', 0), 1.8 * AU_KM));
});

function placedMoon(key, pd, epoch, period = 1) {
    return {
        key,
        body: pd === null ? {} : { pd },
        index: 0, ring: false, ringIndex: -1, basePx: 3,
        period, epoch, mainworld: false, name: key, port: null, portPeriod: 1,
    };
}

test('a moon is pd times its parent diameter from that parent, along the layout angle', () => {
    const diamKm = 12800;
    const hosted = world('w1', 2, 0, {
        body: { au: 2, diamKm },
        moons: [placedMoon('w1m0', 20, 0), placedMoon('w1m1', 30, Math.PI)],
    });
    const other = world('w2', 3, 0, { index: 1, body: { au: 3, diamKm: 8000 } });
    const plan = planOf([star('s0', 0, { body: { mass: 1 } })], [hosted, other]);
    const offset = 20 * diamKm / AU_KM;

    assert.ok(near(realDistanceKm(plan, 'w1', 'w1m0', 0), 20 * diamKm));
    assert.ok(near(realDistanceKm(plan, 'w1m0', 'w1m1', 0), (20 + 30) * diamKm));
    assert.ok(near(realDistanceKm(plan, 'w1m0', 'w2', 0), (1 - offset) * AU_KM));
    assert.deepEqual(realPositionAu(plan, 'w1m0', 0), { x: 2 + offset, y: 0 });
    assert.equal(realDistanceKm(plan, 'w1m0', 'w1m0', 0), 0);
});

test('a moon with no pd, a parent with no diameter, or a parent with no place, is null', () => {
    const noPd = world('w1', 2, 0, {
        body: { au: 2, diamKm: 12800 },
        moons: [placedMoon('w1m0', null, 0)],
    });
    const noPlace = world('bare', 1, 0, {
        index: 1, missingAu: true, body: { diamKm: 8000 },
        moons: [placedMoon('bareM', 12, 0)],
    });
    const plan = planOf([star('s0', 0, { body: { mass: 1 } })], [noPd, noPlace]);
    assert.equal(realPositionAu(plan, 'w1m0', 0), null);
    assert.equal(realDistanceKm(plan, 'w1', 'w1m0', 0), null);
    assert.equal(realPositionAu(plan, 'bareM', 0), null);
    assert.equal(realDistanceKm(plan, 'bare', 'bareM', 0), null);
    assert.equal(realDistanceKm(plan, 'w1m0', 'w1m0', 0), 0);
});

test('a companion that carries an orbit id sits on that orbit', () => {
    const companion = star('s1', 1, { body: { orbitId: 4, mass: 0.5 }, au: 1.6, separation: 'Far' });
    const plan = planOf([star('s0', 0, { body: { mass: 1 } }), companion], [world('w1', 1, 0)]);
    assert.deepEqual(realPositionAu(plan, 's1', 0), { x: 1.6, y: 0 });
    assert.ok(near(realDistanceKm(plan, 's0', 's1', 0), 1.6 * AU_KM));
    assert.ok(near(realDistanceKm(plan, 'w1', 's1', 0), 0.6 * AU_KM));
});

test('realDistanceKmBetween takes each body at its own date', () => {
    const inner = world('w1', 1, 0, { index: 0 });
    const outer = world('w2', 3, 0, { index: 1 });
    const plan = planOf([star('s0', 0, { body: { mass: 1 } })], [inner, outer]);
    const half = 365.25 / 2;
    assert.ok(near(realDistanceKmBetween(plan, 'w1', 0, 'w2', 0), realDistanceKm(plan, 'w1', 'w2', 0)));
    // Day 0 puts both at angle 0. Half a year (period 1) puts the outer world at angle π.
    assert.ok(near(realDistanceKmBetween(plan, 'w1', 0, 'w2', half), 4 * AU_KM));
    assert.ok(near(realDistanceKmBetween(plan, 'w2', 0, 'w2', half), 6 * AU_KM));
    assert.equal(realDistanceKmBetween(plan, 'w2', half, 'w2', half), 0);
    assert.equal(realDistanceKmBetween(plan, 'nope', 0, 'w2', half), null);

    const lost = star('s1', 1, { body: { mass: 0.4 }, separation: 'Far' });
    const nearWorld = world('w9', 0.4, 0, { index: 0, star: 1 });
    const farWorld = world('w8', 1.4, Math.PI, { index: 1, star: 1 });
    const unplaced = planOf([star('s0', 0, { body: { mass: 1 } }), lost], [nearWorld, farWorld]);
    assert.equal(realPositionAu(unplaced, 'w9', 0), null);
    assert.equal(realPositionAu(unplaced, 'w8', half), null);
    assert.ok(near(realDistanceKmBetween(unplaced, 'w9', 0, 'w8', 0), 1.8 * AU_KM));
    // Half a year brings the outer companion world back to angle 0, 1 AU from the inner one at day 0.
    assert.ok(near(realDistanceKmBetween(unplaced, 'w9', 0, 'w8', half), 1 * AU_KM));
});

test('the distance does not change with the view, because it never reads the picture', () => {
    const plan = planOf(
        [star('s0', 0, { body: { mass: 1, diamKm: 1400000 } })],
        [world('w1', 1, 0, { index: 0, body: { au: 1, diamKm: 8000 } }), world('w2', 3, 1, { index: 1, body: { au: 3, diamKm: 12000 } })],
    );
    const km = realDistanceKm(plan, 'w1', 'w2', 0);
    const gap = (view) => {
        const scene = layoutScene(plan, view, 0);
        const bodies = scene.primary.bodies;
        const a = bodies.find((at) => at.world.key === 'w1');
        const b = bodies.find((at) => at.world.key === 'w2');
        return Math.hypot(a.x - b.x, a.y - b.y);
    };
    const base = { w: 800, h: 600, offX: 0, offY: 0, z: 1, moons: true, jump: true };
    const fitted = gap({ ...base, zoom: 1, linear: false });
    const linear = gap({ ...base, zoom: 2.5, linear: true, z: 1.4 });
    assert.notEqual(fitted, linear);
    assert.equal(realDistanceKm(plan, 'w1', 'w2', 0), km);
    assert.equal(realDistanceKm(plan, 'w1', 'w2', 0), realDistanceKm(plan, 'w2', 'w1', 0));
});

test('a world\'s drawn point maps back to its real place, log and linear, at two zooms', () => {
    const days = 100;
    const inner = world('w1', 1, 0.7, { index: 0, body: { au: 1, diamKm: 8000 } });
    const outer = world('w2', 3, 2.1, { index: 1, body: { au: 3, diamKm: 12000 } });
    const plan = planOf(
        [star('s0', 0, { body: { mass: 1, diamKm: 1400000 } })],
        [inner, outer],
    );
    const same = (got, real) => got && Math.abs(got.x - real.x) < 1e-6 && Math.abs(got.y - real.y) < 1e-6;
    const views = [
        { w: 800, h: 600, offX: 0, offY: 0, zoom: 1, z: 1, linear: false, moons: true, jump: true },
        { w: 800, h: 600, offX: 40, offY: -25, zoom: 2.4, z: 1.8, linear: false, moons: true, jump: true },
        { w: 800, h: 600, offX: 0, offY: 0, zoom: 1, z: 1, linear: true, moons: true, jump: true },
        { w: 800, h: 600, offX: -30, offY: 15, zoom: 2.4, z: 1.8, linear: true, moons: true, jump: true },
    ];
    for (const view of views) {
        const scene = layoutScene(plan, view, days);
        for (const key of ['w1', 'w2']) {
            const at = scene.primary.bodies.find((body) => body.world.key === key);
            const real = realPositionAu(plan, key, days);
            const back = picturePlaceAu({ x: at.x, y: at.y }, view, plan, 'orbits');
            assert.ok(same(back, real), key + ' ' + view.zoom + ' ' + view.linear);
        }
        const origin = { x: scene.originX, y: scene.originY };
        assert.equal(picturePlaceAu(origin, view, plan, 'orbits'), null);
        assert.equal(picturePlaceAu({ x: origin.x + 4000, y: origin.y }, view, plan, 'orbits'), null);
        assert.equal(picturePlaceAu({ x: scene.primary.bodies[0].x, y: scene.primary.bodies[0].y }, view, plan, 'row'), null);
        assert.equal(picturePlaceAu({ x: scene.primary.bodies[0].x, y: scene.primary.bodies[0].y }, view, plan, 'column'), null);
        assert.equal(picturePlaceAu({ x: scene.primary.bodies[0].x, y: scene.primary.bodies[0].y }, view, plan, 'blend'), null);
    }
});

test('a pointer within 14px of a body reads that body, and a moon\'s drawn point is not its picture radius', () => {
    assert.equal(BODY_SNAP_PX, 14);
    const days = 0;
    const hosted = world('w1', 2, 0, {
        body: { au: 2, diamKm: 12800 },
        moons: [placedMoon('w1m0', 20, 0)],
    });
    const plan = planOf([star('s0', 0, { body: { mass: 1 } })], [hosted]);
    const view = { w: 800, h: 600, offX: 0, offY: 0, zoom: 1, z: 1, linear: false, moons: true, jump: true };
    const scene = layoutScene(plan, view, days);
    const worldAt = scene.primary.bodies[0];
    const moonAt = worldAt.moons[0];
    const bodies = [
        { key: 's0', x: scene.originX, y: scene.originY },
        { key: 'w1', x: worldAt.x, y: worldAt.y },
        { key: 'w1m0', x: moonAt.x, y: moonAt.y },
    ];
    const realMoon = realPositionAu(plan, 'w1m0', days);
    const drawn = picturePlaceAu({ x: moonAt.x, y: moonAt.y }, view, plan, 'orbits');
    assert.ok(drawn);
    assert.ok(Math.hypot(drawn.x - realMoon.x, drawn.y - realMoon.y) > 0.01);
    const snapped = placeAtPicture({ x: moonAt.x, y: moonAt.y }, view, plan, 'orbits', bodies, days);
    assert.ok(Math.abs(snapped.x - realMoon.x) < 1e-9 && Math.abs(snapped.y - realMoon.y) < 1e-9);

    const near = placeAtPicture({ x: worldAt.x, y: worldAt.y + 10 }, view, plan, 'orbits', bodies, days);
    const realWorld = realPositionAu(plan, 'w1', days);
    assert.ok(Math.abs(near.x - realWorld.x) < 1e-9 && Math.abs(near.y - realWorld.y) < 1e-9);

    const frame = { plan, view, mode: 'orbits', days, bodies };
    assert.equal(plotText({ x: worldAt.x, y: worldAt.y }), '');
    assert.equal(plotText({ x: worldAt.x, y: worldAt.y }, frame), '2.00 AU');
    assert.equal(plotText({ x: worldAt.x, y: worldAt.y, from: { x: moonAt.x, y: moonAt.y } }, frame), '2.00 AU \u00B7 ship 256,000 km');
    assert.equal(plotText({ x: worldAt.x, y: worldAt.y }, { ...frame, mode: 'row' }), '');
    assert.equal(plotText({ x: scene.originX + 18, y: scene.originY }, frame), '');
});
