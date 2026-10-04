import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MgT2EData } from '../../packages/engines/src/generated/rules/mgt2e_data.js';
import {
    bodyAngle, hashEpoch, keplerYears, moonBasePx, moonPeriodYears, orbitToAU,
    pxFromDiamKm, scaleR, starBasePx, starCompanionAU, unitT, worldBasePx, worldPeriodYears,
} from '../../apps/web/src/orbit/maths.ts';
import { ORBIT_AU } from '../../apps/web/src/orbit/orbit_au.ts';

// Inventory §2 formulas. Constants are the ones named next to those formulas.
const SUN_DIAM_KM = 1392700;
const SOL_RADIUS_PX = 34;
const SIZE_EXP = 0.42;

function discPx(diamKm) {
    if (!(diamKm > 0)) return null;
    return SOL_RADIUS_PX * Math.pow(diamKm / SUN_DIAM_KM, SIZE_EXP);
}

function clamp(value, lo, hi) {
    return Math.max(lo, Math.min(hi, value));
}

test('the orbit AU table is the generated rules table', () => {
    assert.deepEqual(ORBIT_AU, MgT2EData.stellar.orbitAu);
});

test('disc sizes follow the diameter formula and the stated clamps', () => {
    assert.equal(pxFromDiamKm(0), null);
    assert.equal(pxFromDiamKm(-SUN_DIAM_KM), null);
    assert.equal(pxFromDiamKm(SUN_DIAM_KM), discPx(SUN_DIAM_KM));

    const oneSun = discPx(1 * SUN_DIAM_KM);
    assert.ok(oneSun > 4 && oneSun < 58);
    assert.equal(starBasePx({ diam: 1 }), oneSun);

    const hugeStar = discPx(1e6 * SUN_DIAM_KM);
    assert.ok(hugeStar > 58);
    assert.equal(starBasePx({ diam: 1e6 }), 58);
    const tinyStar = discPx(1e-9 * SUN_DIAM_KM);
    assert.ok(tinyStar < 4);
    assert.equal(starBasePx({ diam: 1e-9 }), 4);

    assert.equal(starBasePx({ sClass: 'Ia' }), 52);
    assert.equal(starBasePx({ sClass: 'Ib' }), 52);
    assert.equal(starBasePx({ sClass: 'II' }), 40);
    assert.equal(starBasePx({ sClass: 'III' }), 40);
    assert.equal(starBasePx({ sClass: 'IV' }), 32);
    assert.equal(starBasePx({ sType: 'BD' }), 12);
    assert.equal(starBasePx({ sType: 'D' }), 8);
    assert.equal(starBasePx({ sType: 'M' }), 18);
    assert.equal(starBasePx({ sType: 'K' }), 22);
    assert.equal(starBasePx({}), 28);
    assert.equal(starBasePx(null), 28);

    const sunWorld = discPx(SUN_DIAM_KM);
    assert.ok(sunWorld > 22);
    assert.equal(worldBasePx({ diamKm: SUN_DIAM_KM }), 22);
    const tinyWorld = discPx(1);
    assert.ok(tinyWorld < 2.4);
    assert.equal(worldBasePx({ diamKm: 1 }), 2.4);
    assert.equal(worldBasePx({ type: 'Gas Giant', ggType: 'GL' }), 14);
    assert.equal(worldBasePx({ type: 'Gas Giant', ggType: 'GM' }), 10);
    assert.equal(worldBasePx({ type: 'Gas Giant' }), 8);
    assert.equal(worldBasePx({ type: 'Mainworld' }), 6);
    assert.equal(worldBasePx({ worldType: 'Worldlet' }), 3);
    assert.equal(worldBasePx({}), 4.5);
    assert.equal(worldBasePx(null), 4.5);

    assert.ok(discPx(SUN_DIAM_KM) > 10);
    assert.equal(moonBasePx({ diamKm: SUN_DIAM_KM }), 10);
    assert.ok(discPx(1) < 2);
    assert.equal(moonBasePx({ diamKm: 1 }), 2);
    assert.equal(moonBasePx({ type: 'Mainworld' }), 4.2);
    assert.equal(moonBasePx({}), 2.6);
    assert.equal(clamp(4.2, 2, 10), moonBasePx({ type: 'Mainworld' }));
});

test('orbitToAU interpolates the copied table and starCompanionAU prefers orbitAU', () => {
    const orbitId = 4.25;
    const idx = Math.floor(orbitId);
    const frac = orbitId - idx;
    const lo = ORBIT_AU[idx];
    const hi = ORBIT_AU[idx + 1];
    assert.equal(orbitToAU(orbitId), lo + frac * (hi - lo));
    assert.equal(orbitToAU(idx), lo);

    assert.equal(starCompanionAU({ orbitAU: 1.25, orbitId: 9 }), 1.25);
    assert.equal(starCompanionAU({ orbitAU: 0, orbitId: 4 }), 0);
    assert.equal(starCompanionAU({ orbitAU: null, orbitId: 4 }), orbitToAU(4));
    assert.equal(starCompanionAU({}), orbitToAU(0.5));
});

test('scaleR at au 0, at maxAU, and between, log and linear', () => {
    const maxAU = 10;
    const maxPx = 100;
    const holePx = 20;

    function expected(au, linearScale) {
        if (!(au > 0) || !(maxAU > 0)) {
            const hole = Math.max(0, holePx || 0);
            const outer = Math.max(maxPx || 0, hole > 0 ? hole / 0.58 : 0);
            const span = outer - hole;
            return span <= 0 ? hole : hole;
        }
        const hole = Math.max(0, holePx || 0);
        const outer = Math.max(maxPx || 0, hole > 0 ? hole / 0.58 : 0);
        const span = outer - hole;
        const t = linearScale ? Math.min(1, au / maxAU) : Math.log(1 + au) / Math.log(1 + maxAU);
        return hole + span * t;
    }

    assert.equal(unitT(0, maxAU, false), 0);
    assert.equal(scaleR(0, maxAU, maxPx, holePx, false), expected(0, false));
    assert.equal(scaleR(0, maxAU, maxPx, holePx, true), expected(0, true));
    assert.equal(scaleR(maxAU, maxAU, maxPx, holePx, false), expected(maxAU, false));
    assert.equal(scaleR(maxAU, maxAU, maxPx, holePx, true), expected(maxAU, true));
    const mid = maxAU / 2;
    assert.equal(scaleR(mid, maxAU, maxPx, holePx, false), expected(mid, false));
    assert.equal(scaleR(mid, maxAU, maxPx, holePx, true), expected(mid, true));
    assert.notEqual(scaleR(mid, maxAU, maxPx, holePx, false), scaleR(mid, maxAU, maxPx, holePx, true));
});

// Independent copy of js/system_viewer.js:355-366. The last `h ^= h >>> 16`
// is a signed int32 operation, so the fraction can be negative. The result
// lies in [-π, π), not [0, 2π).
function legacyHashEpoch(key) {
    let h = 2166136261;
    for (let i = 0; i < key.length; i++) {
        h ^= key.charCodeAt(i);
        h = Math.imul(h, 16777619) >>> 0;
    }
    h ^= h >>> 16;
    h = Math.imul(h, 0x85ebca6b) >>> 0;
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35) >>> 0;
    h ^= h >>> 16;
    return (h / 0x100000000) * 2 * Math.PI;
}

test('hashEpoch matches the legacy finalizer and is stable', () => {
    const keys = [
        'Spinward_Marches/1910:world:0',
        'Spinward_Marches/1910:star:1',
        'Spinward_Marches/1910:moon:0:0',
        'Spinward_Marches/1910:moon:0:1',
    ];
    for (const key of keys) {
        const angle = hashEpoch(key);
        assert.equal(angle, hashEpoch(key));
        assert.equal(angle, legacyHashEpoch(key));
        assert.ok(angle >= -Math.PI && angle < Math.PI, key);
    }
    assert.ok(hashEpoch('Spinward_Marches/1910:moon:0:1') < 0);
    assert.notEqual(hashEpoch('Spinward_Marches/1910:moon:0:0'), hashEpoch('Spinward_Marches/1910:moon:0:1'));
});

test('keplerYears(1, 1) is 1, a moon periodHrs is used, and one period advances the angle by 2π', () => {
    assert.equal(keplerYears(1, 1), 1);
    assert.equal(keplerYears(0, 1), 1);
    assert.equal(keplerYears(1, 0), 1);
    const au = 4;
    const mass = 2;
    assert.equal(keplerYears(au, mass), Math.sqrt(Math.pow(au, 3) / mass));

    assert.equal(worldPeriodYears({ periodYears: 3, au: 9 }, 1), 3);
    assert.equal(worldPeriodYears({ au: 1 }, 1), keplerYears(1, 1));

    const hours = 365.25 * 24;
    assert.equal(moonPeriodYears({ periodHrs: hours, pd: 5 }, { mass: 3, diamKm: 8000 }), hours / (365.25 * 24));

    const parent = { mass: 2, diamKm: 10000 };
    const moon = { pd: 10 };
    const G = 6.674e-11;
    const earthKg = 5.972e24;
    const parentMassKg = parent.mass * earthKg;
    const radiusM = moon.pd * parent.diamKm * 1000;
    const seconds = 2 * Math.PI * Math.sqrt(Math.pow(radiusM, 3) / (G * parentMassKg));
    assert.equal(moonPeriodYears(moon, parent), seconds / (365.25 * 24 * 3600));

    const epoch = 0.4;
    const periodYears = 1;
    const fullTurn = bodyAngle(epoch, periodYears, periodYears * 365.25) - bodyAngle(epoch, periodYears, 0);
    assert.equal(fullTurn, 2 * Math.PI);
});
