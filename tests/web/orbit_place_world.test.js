/**
 * AQ1 round 3. placeWorld lays a world, its moons and its rings onto a hit list.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { moonOrbitRadius, placeWorld, ringOrbitRadius } from '../../apps/web/src/orbit/layout.ts';

function world(over = {}) {
    return {
        key: 'w',
        body: {},
        index: 0,
        star: 0,
        au: 1,
        belt: false,
        mainworld: true,
        mainworldBelt: false,
        tone: 'world',
        basePx: 10,
        period: 1,
        epoch: 0,
        jumpAU: 0,
        ringed: false,
        moons: [],
        ringMoons: 0,
        rings: 0,
        name: 'Regina',
        port: null,
        portPeriod: 0,
        ...over,
    };
}

function moon(over = {}) {
    return {
        key: 'm',
        body: {},
        index: 0,
        ring: false,
        ringIndex: 0,
        basePx: 2,
        period: 1,
        epoch: 0,
        mainworld: false,
        name: 'Moon',
        port: null,
        portPeriod: 0,
        ...over,
    };
}

test('a bare world is one hit at the point it was given, scaled by zoom', () => {
    const hits = [];
    const at = placeWorld(world(), 100, 200, 2, 0, 0, 0, hits);
    assert.equal(at.x, 100);
    assert.equal(at.y, 200);
    assert.equal(at.r, 20);
    assert.deepEqual(at.moons, []);
    assert.deepEqual(at.rings, []);
    assert.equal(hits.length, 1);
    assert.equal(hits[0].kind, 'world');
    assert.equal(hits[0].key, 'w');
    assert.equal(hits[0].visualR, 20);
    assert.equal(hits[0].r, 20 + 9 * 2);
});

test('zoom of 0 still leaves a world hit, and a hidden moon list draws neither moons nor rings', () => {
    const flat = [];
    const at = placeWorld(world(), 0, 0, 0, 0, 1, 1, flat);
    assert.equal(at.r, 0);
    assert.equal(flat[0].r, 14);

    const hits = [];
    const hidden = placeWorld(world({
        moons: [moon()],
        rings: 2,
        hostedBelts: [moon({ key: 'belt', index: 1 })],
    }), 50, 60, 1, 0, 0, 0, hits, false);
    assert.deepEqual(hidden.moons, []);
    assert.deepEqual(hidden.rings, []);
    assert.equal(hidden.hostedBelts.length, 1);
    assert.deepEqual(hits.map((hit) => hit.kind), ['belt', 'world']);
});

test('a ring moon is a circle with no disc, and a disc moon sits on its orbit at day 0', () => {
    const hits = [];
    const w = world({
        ringMoons: 1,
        rings: 1,
        moons: [moon({ ring: true, ringIndex: 0 }), moon({ key: 'disc', index: 0 })],
    });
    const at = placeWorld(w, 10, 20, 1, 0, 0, 0, hits);
    const ringDist = ringOrbitRadius(10, 0, 1);
    assert.equal(at.moons[0].r, 0);
    assert.equal(at.moons[0].x, 10);
    assert.equal(at.moons[0].y, 20);
    assert.equal(at.moons[0].orbitR, ringDist);
    const discDist = moonOrbitRadius(10, 0, false, 1);
    assert.equal(at.moons[1].x, 10 + discDist);
    assert.equal(at.moons[1].y, 20);
    assert.equal(at.moons[1].r, 2);
    assert.equal(at.rings.length, 1);
    assert.equal(hits.filter((hit) => hit.kind === 'moon').length, 2);
    assert.equal(hits.filter((hit) => hit.kind === 'ring').length, 1);
});
