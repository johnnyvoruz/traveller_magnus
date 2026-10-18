/**
 * Background traffic counts, the stable day bucket, and the jump edge
 * (spec_living_systems.md §3, streams/C.md LS5).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { pictureOfAu } from '../../apps/web/src/orbit/distance.ts';
import { layoutScene, planSystem } from '../../apps/web/src/orbit/layout.ts';
import { shipStanding } from '../../apps/web/src/orbit/ship_marks.ts';
import { activityIndex, drawnCount, roleCounts, SHIP_CAP, SHUTTLE_COUNT } from '../../apps/web/src/living/roles.ts';
import { jumpEdge, trafficSchedule } from '../../apps/web/src/living/traffic.ts';
import { HEX_KEY, testSystem } from './orbit_fixture.js';

const VIEW = { w: 1000, h: 800, zoom: 1, offX: 0, offY: 0, z: 1, linear: false, jump: true, moons: true };

function profile(extra) {
    return {
        starport: 'C', pop: 4, tl: 8, zone: '', bases: '', highport: false, xboat: false,
        ...extra,
    };
}

function counts(extra) {
    return roleCounts(profile(extra));
}

function sumShips(counts) {
    return counts.trader + counts.liner + counts.patrol + counts.scout + counts.xboat;
}

test('the freight shape: index, count, and the named fixtures', () => {
    assert.equal(activityIndex(profile({ starport: 'X', pop: 0, tl: 0, zone: 'red' })), -14);
    assert.equal(activityIndex(profile({ starport: 'A', pop: 9, tl: 12 })), 8);
    assert.equal(drawnCount(-14), 0);
    assert.equal(drawnCount(8), 12);

    assert.deepEqual(counts({ starport: 'A', pop: 9, tl: 12, highport: true }), {
        trader: 9, liner: 3, patrol: 0, scout: 0, xboat: 0, shuttle: 2,
    });
    assert.deepEqual(counts({ starport: 'B', pop: 6, tl: 9 }), {
        trader: 7, liner: 2, patrol: 0, scout: 0, xboat: 0, shuttle: 0,
    });
    assert.deepEqual(counts({ starport: 'C', pop: 4, tl: 8 }), {
        trader: 4, liner: 0, patrol: 0, scout: 0, xboat: 0, shuttle: 0,
    });
    assert.deepEqual(counts({ starport: 'D', pop: 5, tl: 7 }), {
        trader: 4, liner: 0, patrol: 0, scout: 0, xboat: 0, shuttle: 0,
    });
    assert.deepEqual(counts({ starport: 'E', pop: 5, tl: 7 }), {
        trader: 3, liner: 0, patrol: 0, scout: 0, xboat: 0, shuttle: 0,
    });
    assert.deepEqual(counts({ starport: 'X', pop: 0, tl: 0 }), {
        trader: 0, liner: 0, patrol: 0, scout: 0, xboat: 0, shuttle: 0,
    });
    assert.deepEqual(counts({ starport: 'A', pop: 9, tl: 12, zone: 'red', bases: 'NS', xboat: true, highport: true }), {
        trader: 0, liner: 0, patrol: 2, scout: 0, xboat: 0, shuttle: 0,
    });
    assert.deepEqual(counts({ starport: 'C', pop: 4, tl: 8, bases: 'N' }), {
        trader: 4, liner: 0, patrol: 1, scout: 0, xboat: 0, shuttle: 0,
    });
    assert.deepEqual(counts({ starport: 'D', pop: 4, tl: 8, bases: 'W' }), {
        trader: 4, liner: 0, patrol: 0, scout: 1, xboat: 1, shuttle: 0,
    });
    const busy = counts({ starport: 'A', pop: 9, tl: 12, bases: 'NSW', xboat: true, highport: true });
    assert.equal(sumShips(busy) <= SHIP_CAP, true);
    assert.equal(busy.shuttle, SHUTTLE_COUNT);
    assert.equal(busy.patrol, 1);
    assert.equal(busy.scout, 1);
    assert.equal(busy.xboat, 1);
});

const LINE = {
    id: 'ship-001',
    category: 'ship',
    voice: 'trader',
    text: '{ship} is on the approach and holding for a clear lane.',
    when: {},
};

function input(extra) {
    return {
        hexKey: 'Spinward_Marches/1910',
        truthVersion: 'v10',
        profile: profile({ starport: 'A', pop: 9, tl: 12, highport: true }),
        bodies: [
            { key: 'mw', x: 1, y: 0, jumpAU: 0.01, mainworld: true, gasGiant: false, belt: false },
            { key: 'gg', x: 5, y: 0, jumpAU: 0.1, mainworld: false, gasGiant: true, belt: false },
            { key: 'belt', x: 3, y: 1, jumpAU: 0, mainworld: false, gasGiant: false, belt: true },
        ],
        facts: {
            hexKey: 'Spinward_Marches/1910', name: 'Regina', sector: 'Spinward Marches', subsector: 'Regina',
            starport: 'A', size: 7, atm: 8, hydro: 8, pop: 8, gov: 9, law: 9, tl: 12,
            tradeCodes: [], zone: 'green', bases: '', highport: true, gasGiants: 1, belts: 1,
            moons: 0, otherBodies: 0, xboat: false, party: 'docked', day: 47,
            bodies: { gasGiant: 'Assiniboia', belt: 'Regina Belt' },
        },
        lines: [LINE],
        ...extra,
    };
}

test('the same bucket is the same ships, and a ship that crosses midnight matches', () => {
    const source = input();
    const early = trafficSchedule(source, 10.2);
    const later = trafficSchedule(source, 10.8);
    assert.deepEqual(later.map((ship) => ship.id), early.map((ship) => ship.id));
    assert.deepEqual(later.map((ship) => ship.legs), early.map((ship) => ship.legs));
    const before = trafficSchedule(source, 8.99);
    const after = trafficSchedule(source, 9.01);
    const crossing = before.find((ship) => /^traffic:[89]:/.test(ship.id) && ship.legs.some((leg) => leg.departs < 9 && leg.arrives > 9));
    assert.ok(crossing);
    assert.deepEqual(after.find((ship) => ship.id === crossing.id), crossing);
    assert.ok(early.some((ship) => ship.line.includes(ship.name)));
    assert.equal(early.filter((ship) => ship.roleWord === 'shuttle').length, 6);
});

test('no civilian ship in a Red zone or at a class X world', () => {
    const red = trafficSchedule(input({ profile: profile({ zone: 'red', starport: 'A', pop: 9, tl: 12, highport: true, bases: 'S' }) }), 4);
    const roles = new Set(red.map((ship) => ship.roleWord));
    assert.deepEqual([...roles], ['patrol']);
    const dead = trafficSchedule(input({ profile: profile({ starport: 'X', pop: 0, tl: 0, highport: true, bases: 'N' }) }), 4);
    assert.equal(dead.some((ship) => ship.roleWord === 'free trader' || ship.roleWord === 'far trader' || ship.roleWord === 'liner' || ship.roleWord === 'shuttle'), false);
    assert.ok(dead.some((ship) => ship.roleWord === 'patrol'));
});

test('a jump edge lies outside every 100D ring', () => {
    const plan = planSystem(testSystem(), HEX_KEY);
    const bodies = [];
    for (const world of plan.worlds) {
        bodies.push({
            key: world.key, x: world.au, y: 0, jumpAU: world.jumpAU,
            mainworld: world.mainworld || world.mainworldBelt,
            gasGiant: world.body.type === 'Gas Giant', belt: world.belt,
        });
        for (const moon of world.moons) {
            if (!moon.mainworld) continue;
            bodies.push({
                key: moon.key, x: world.au, y: 0, jumpAU: world.jumpAU,
                mainworld: true, gasGiant: false, belt: false,
            });
        }
    }
    const ships = trafficSchedule({
        hexKey: HEX_KEY,
        truthVersion: 'test',
        profile: profile({ starport: 'A', pop: 9, tl: 12 }),
        bodies,
    }, 20);
    const scene = layoutScene(plan, VIEW, 20);
    const centres = scene.hits
        .filter((hit) => hit.kind === 'star' || hit.kind === 'world' || hit.kind === 'moon')
        .map((hit) => ({ x: hit.cx, y: hit.cy }));
    let checked = 0;
    for (const ship of ships) {
        const edge = jumpEdge(ship, HEX_KEY);
        if (!edge) continue;
        const picture = pictureOfAu(edge, VIEW, plan, 'orbits');
        assert.ok(picture);
        const standing = shipStanding(picture, scene.jumps, centres);
        assert.equal(standing.outside, true, ship.id);
        checked += 1;
    }
    assert.ok(checked > 0);
});

test('the cap holds on the schedule', () => {
    const ships = trafficSchedule(input(), 3);
    const oneDay = ships.filter((ship) => ship.id.startsWith('traffic:3:'));
    const shuttles = oneDay.filter((ship) => ship.roleWord === 'shuttle');
    assert.equal(oneDay.length - shuttles.length <= SHIP_CAP, true);
    assert.equal(shuttles.length <= SHUTTLE_COUNT, true);
});
