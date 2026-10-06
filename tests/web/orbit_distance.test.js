/**
 * Real distance between two bodies (apps/web/src/orbit/distance.ts). The picture is never read.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { realDistanceKm, realPositionAu } from '../../apps/web/src/orbit/distance.ts';
import { AU_KM, layoutScene } from '../../apps/web/src/orbit/layout.ts';

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
