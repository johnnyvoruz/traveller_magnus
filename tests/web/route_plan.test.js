/**
 * AN1. Directions through loaded sector indexes. The fuel grades, the water
 * rule, the gas-giant line and the unrefined DM come from
 * rules/mgt2e_space_travel.json. planRoute is apps/web/src/map/route_plan.ts.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { planRoute } from '../../apps/web/src/map/route_plan.ts';

const GAS = 'Pilot 10+ (DEX), 1D hours to scoop, 1D days to reach the gas giant';
const DM = 'Unrefined fuel: DM-2 on the jump check';

function sector(slug, x, y, rows) {
    const hexes = {};
    for (const row of rows) {
        hexes[row.hex] = { uwp: row.uwp, zone: row.zone ?? '', pbg: row.pbg ?? '000' };
    }
    return { slug, x, y, hexes };
}

function ask(over) {
    return {
        from: { sector: 'core', hex: '0505' },
        to: { sector: 'core', hex: '0705' },
        jump: 1,
        fuel: 'any',
        scoops: false,
        processors: false,
        allowRed: false,
        ...over,
    };
}

function legs(indexes, query) {
    const plan = planRoute(indexes, query);
    assert.equal(plan.ok, true, plan.ok ? '' : plan.reason);
    return plan.legs;
}

function refused(indexes, query) {
    const plan = planRoute(indexes, query);
    assert.equal(plan.ok, false);
    return plan.reason;
}

const chain = [sector('core', 0, 0, [
    { hex: '0505', uwp: 'A200000-0' },
    { hex: '0605', uwp: 'A200000-0' },
    { hex: '0705', uwp: 'A200000-0' },
])];

test('a Jump-1 chain through starports', () => {
    const route = legs(chain, ask());
    assert.deepEqual(route.map((leg) => leg.to.hex), ['0605', '0705']);
    assert.deepEqual(route.map((leg) => leg.parsecs), [1, 1]);
    assert.deepEqual(route.map((leg) => leg.source), ['starport', 'starport']);
    assert.deepEqual(route.map((leg) => leg.grade), ['refined', 'refined']);
    assert.deepEqual(route.map((leg) => leg.notes), [[], []]);
    assert.equal(route[0].from.hex, '0505');
    assert.deepEqual(planRoute(chain, ask()), planRoute(chain, ask()));
});

test('a gap of two only a gas giant can cross, and only with scoops', () => {
    const indexes = [sector('core', 0, 0, [
        { hex: '0505', uwp: 'A200000-0' },
        { hex: '0605', uwp: 'E200000-0', pbg: '001' },
        { hex: '0705', uwp: 'A200000-0' },
    ])];
    assert.equal(refused(indexes, ask()), 'No route with Jump-1 between these systems.');
    const route = legs(indexes, ask({ scoops: true }));
    assert.equal(route[0].to.hex, '0605');
    assert.equal(route[0].source, 'gas-giant');
    assert.equal(route[0].grade, 'unrefined');
    assert.deepEqual(route[0].notes, [GAS]);
    assert.deepEqual(route[1].notes, [DM]);
});

test('water counts at Hydrographics 1 and Atmosphere 6, and not at Atmosphere B', () => {
    const water = [sector('core', 0, 0, [
        { hex: '0505', uwp: 'A200000-0' },
        { hex: '0605', uwp: 'E661000-0' },
        { hex: '0705', uwp: 'A200000-0' },
    ])];
    const route = legs(water, ask({ scoops: true }));
    assert.equal(route[0].source, 'water');
    assert.equal(route[0].grade, 'unrefined');
    assert.deepEqual(route[0].notes, []);
    const corrosive = [sector('core', 0, 0, [
        { hex: '0505', uwp: 'A200000-0' },
        { hex: '0605', uwp: 'E6B1000-0' },
        { hex: '0705', uwp: 'A200000-0' },
    ])];
    assert.match(refused(corrosive, ask({ scoops: true })), /Jump-1/);
});

test('refined fuel refuses a C starport and takes a gas giant with processors', () => {
    const indexes = [sector('core', 0, 0, [
        { hex: '0505', uwp: 'A200000-0' },
        { hex: '0605', uwp: 'C200000-0' },
        { hex: '0604', uwp: 'E200000-0', pbg: '001' },
        { hex: '0705', uwp: 'A200000-0' },
    ])];
    const query = ask({ fuel: 'refined', scoops: true, processors: true });
    assert.match(refused(indexes, ask({ fuel: 'refined', scoops: true })), /Jump-1/);
    const route = legs(indexes, query);
    assert.equal(route[0].to.hex, '0604');
    assert.equal(route[0].source, 'gas-giant');
    assert.equal(route[0].grade, 'refined');
    assert.deepEqual(route[0].notes, [GAS]);
    assert.deepEqual(route[1].notes, []);
});

test('the unrefined note is on the leg that leaves that stop', () => {
    const indexes = [sector('core', 0, 0, [
        { hex: '0505', uwp: 'A200000-0' },
        { hex: '0605', uwp: 'C200000-0' },
        { hex: '0705', uwp: 'A200000-0' },
    ])];
    const route = legs(indexes, ask());
    assert.equal(route[0].grade, 'unrefined');
    assert.deepEqual(route[0].notes, []);
    assert.deepEqual(route[1].notes, [DM]);
});

test('a red zone is avoided, then used, and From and To stay open', () => {
    const blocked = [sector('core', 0, 0, [
        { hex: '0505', uwp: 'A200000-0' },
        { hex: '0605', uwp: 'A200000-0', zone: 'R' },
        { hex: '0705', uwp: 'A200000-0' },
    ])];
    assert.match(refused(blocked, ask()), /Jump-1/);
    const through = legs(blocked, ask({ allowRed: true }));
    assert.equal(through[0].to.hex, '0605');
    const ends = [sector('core', 0, 0, [
        { hex: '0505', uwp: 'A200000-0', zone: 'Red' },
        { hex: '0605', uwp: 'A200000-0', zone: 'R' },
    ])];
    const direct = legs(ends, ask({ to: { sector: 'core', hex: '0605' } }));
    assert.equal(direct.length, 1);
    assert.equal(direct[0].to.hex, '0605');
    assert.equal(direct[0].grade, 'refined');
});

test('ties go to more refined stops, then fewer skimming stops, then fewer parsecs, then the same route', () => {
    const refined = [sector('core', 0, 0, [
        { hex: '0505', uwp: 'A200000-0' },
        { hex: '0605', uwp: 'A200000-0' },
        { hex: '0604', uwp: 'C200000-0' },
        { hex: '0705', uwp: 'A200000-0' },
    ])];
    assert.equal(legs(refined, ask())[0].to.hex, '0605');

    const skim = [sector('core', 0, 0, [
        { hex: '0505', uwp: 'A200000-0' },
        { hex: '0605', uwp: 'A200000-0' },
        { hex: '0604', uwp: 'E200000-0', pbg: '001' },
        { hex: '0705', uwp: 'A200000-0' },
    ])];
    assert.equal(legs(skim, ask({ fuel: 'refined', scoops: true, processors: true }))[0].to.hex, '0605');

    const parsecs = [sector('core', 0, 0, [
        { hex: '0101', uwp: 'A200000-0' },
        { hex: '0301', uwp: 'A200000-0' },
        { hex: '0202', uwp: 'A200000-0' },
        { hex: '0401', uwp: 'A200000-0' },
    ])];
    const shorter = legs(parsecs, ask({
        from: { sector: 'core', hex: '0101' },
        to: { sector: 'core', hex: '0401' },
        jump: 2,
    }));
    assert.deepEqual(shorter.map((leg) => [leg.to.hex, leg.parsecs]), [['0301', 2], ['0401', 1]]);

    const either = [sector('core', 0, 0, [
        { hex: '0505', uwp: 'A200000-0' },
        { hex: '0605', uwp: 'A200000-0' },
        { hex: '0604', uwp: 'A200000-0' },
        { hex: '0705', uwp: 'A200000-0' },
    ])];
    assert.equal(legs(either, ask())[0].to.hex, '0604');
    assert.deepEqual(planRoute(either, ask()), planRoute(either, ask()));
});

test('no route, a missing system, and the same system', () => {
    const apart = [sector('core', 0, 0, [
        { hex: '0505', uwp: 'A200000-0' },
        { hex: '0705', uwp: 'A200000-0' },
    ])];
    assert.equal(refused(apart, ask()), 'No route with Jump-1 between these systems.');
    assert.match(refused(apart, ask({ from: { sector: 'core', hex: '9999' } })), /Jump-1/);
    const home = planRoute(chain, ask({ to: { sector: 'core', hex: '0505' } }));
    assert.deepEqual(home, { ok: true, legs: [] });
});

test('a route across a sector edge, and Jump 6', () => {
    const edge = [
        sector('core', 0, 0, [{ hex: '3205', uwp: 'A200000-0' }]),
        sector('rim', 1, 0, [{ hex: '0105', uwp: 'B200000-0' }]),
    ];
    const crossed = legs(edge, ask({
        from: { sector: 'core', hex: '3205' },
        to: { sector: 'rim', hex: '0105' },
    }));
    assert.equal(crossed.length, 1);
    assert.equal(crossed[0].parsecs, 1);
    assert.equal(crossed[0].to.sector, 'rim');
    assert.equal(crossed[0].grade, 'refined');

    const far = [sector('core', 0, 0, [
        { hex: '0101', uwp: 'A200000-0' },
        { hex: '0701', uwp: 'A200000-0' },
    ])];
    const jump6 = legs(far, ask({
        from: { sector: 'core', hex: '0101' },
        to: { sector: 'core', hex: '0701' },
        jump: 6,
    }));
    assert.deepEqual(jump6.map((leg) => leg.parsecs), [6]);
    assert.match(refused(far, ask({
        from: { sector: 'core', hex: '0101' },
        to: { sector: 'core', hex: '0701' },
        jump: 5,
    })), /Jump-5/);
});

test('an amber stop is marked, and an empty hex is not a stop', () => {
    const amber = [sector('core', 0, 0, [
        { hex: '0505', uwp: 'A200000-0' },
        { hex: '0605', uwp: 'A200000-0', zone: 'A' },
        { hex: '0705', uwp: 'A200000-0' },
    ])];
    const route = legs(amber, ask());
    assert.deepEqual(route[0].notes, ['Amber zone']);
    assert.deepEqual(route[1].notes, []);
});
