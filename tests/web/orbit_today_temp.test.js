/**
 * "Today's" temperature (apps/web/src/orbit/today_temp.ts): the formula Johnny approved
 * (directives/questions_for_johnny.md A3). Expected values are computed here from that
 * formula, not copied from the module.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildSector } from '@voyage/generation';
import { TRUTH_SEED, TRUTH_SETTINGS } from '../../tools/truth/settings.js';
import { formatTemp } from '../../apps/web/src/design/units.ts';
import { cardFor } from '../../apps/web/src/orbit/card.ts';
import { planSystem } from '../../apps/web/src/orbit/layout.ts';
import { bodyAngle } from '../../apps/web/src/orbit/maths.ts';
import { seasonPhase } from '../../apps/web/src/orbit/seasons.ts';
import { normalizeSystem } from '../../apps/web/src/orbit/system.ts';
import { tiltPart, todayTemp } from '../../apps/web/src/orbit/today_temp.ts';
import { HEX_KEY, testBody } from './orbit_fixture.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, a + ' is not ' + b);
const RAD = Math.PI / 180;
const earthlike = (over = {}) => ({ meanTempK: 288, axialTilt: 23, pressureBar: 1, yearHours: 8760, angle: 0, ...over });

test('the tilt term: the sine of the tilt, halved for a short year, raised by half for a long one', () => {
    close(tiltPart(23, 8760), Math.sin(23 * RAD));
    close(tiltPart(130, 8760), Math.sin(50 * RAD));
    assert.equal(tiltPart(0, 8760), 0);
    // Under 36.5 days of 24 hours: halved. Over two years of 8,760 hours: times 1.5. The bounds themselves are neither.
    close(tiltPart(30, 36.5 * 24 - 1), 0.25);
    close(tiltPart(30, 36.5 * 24), 0.5);
    close(tiltPart(30, 2 * 8760), 0.5);
    close(tiltPart(30, 2 * 8760 + 1), 0.75);
});

test('the worked example Johnny approved: 301 K at midsummer, 273 K at midwinter, the mean at the equinoxes', () => {
    const summer = todayTemp(earthlike({ angle: 90 * RAD }));
    close(summer.northK, 288 * Math.pow(1 + Math.sin(23 * RAD) / 2, 0.25));
    close(summer.southK, 288 * Math.pow(1 - Math.sin(23 * RAD) / 2, 0.25));
    assert.equal(Math.round(summer.northK), 301);
    assert.equal(Math.round(summer.southK), 273);
    // The equinoxes give the mean in both hemispheres.
    for (const angle of [0, 180 * RAD, 360 * RAD]) {
        const equinox = todayTemp(earthlike({ angle }));
        close(equinox.northK, 288, 1e-6);
        close(equinox.southK, 288, 1e-6);
    }
    // Midsummer in the north is midwinter in the south, and the other way round half a year on.
    const winter = todayTemp(earthlike({ angle: 270 * RAD }));
    close(summer.northK, winter.southK);
    close(summer.southK, winter.northK);
    assert.ok(summer.northK > 288 && summer.southK < 288);
    // Thicker air damps the swing; a long year widens it.
    assert.ok(todayTemp(earthlike({ angle: 90 * RAD, pressureBar: 9 })).northK < summer.northK);
    close(todayTemp(earthlike({ angle: 90 * RAD, yearHours: 50000 })).northK, 288 * Math.pow(1 + 1.5 * Math.sin(23 * RAD) / 2, 0.25));
    // The tooltip's inputs come back with the answer.
    close(summer.tiltPart, Math.sin(23 * RAD));
    close(summer.phaseDeg, 90);
});

test('a missing input gives no estimate, and so does a swing the formula cannot take', () => {
    for (const missing of ['meanTempK', 'axialTilt', 'pressureBar', 'yearHours']) {
        assert.equal(todayTemp(earthlike({ [missing]: null })), null, missing);
        assert.equal(todayTemp(earthlike({ [missing]: Number.NaN })), null, missing);
    }
    assert.equal(todayTemp(earthlike({ yearHours: 0 })), null);
    // No air at all is a pressure of 0, which is an input, not a gap.
    assert.ok(todayTemp(earthlike({ pressureBar: 0, angle: 90 * RAD })));
    // Tilt 90°, a long year, no air: 1 − 1.5 is negative under the root. No line, rather than a guess.
    assert.equal(todayTemp(earthlike({ axialTilt: 90, yearHours: 50000, pressureBar: 0, angle: 90 * RAD })), null);
    assert.ok(todayTemp(earthlike({ axialTilt: 90, yearHours: 50000, pressureBar: 0, angle: 0 })), 'at the equinox the swing is nothing');
});

test('the card: two lines under the temperatures, for worlds and moons that have the inputs', () => {
    const body = testBody();
    const rocky = body.mgtSystem.worlds[0];
    Object.assign(rocky, { pressureBar: 1.2, yearHours: 0.35 * 8760 });
    const main = body.mgtSystem.worlds[2].moons[2];
    Object.assign(main, { pressureBar: 0.9, yearHours: 11.2 * 8760 });
    const plan = planSystem(normalizeSystem(body), HEX_KEY);
    const days = 1000;
    const text = (card) => card.lines.map((line) => line.label + ': ' + line.value);

    const card = cardFor(plan, 'world', 'w0', days);
    const angle = bodyAngle(plan.worlds[0].epoch, plan.worlds[0].period, days);
    const swing = Math.sin(20 * RAD) * Math.sin(seasonPhase(angle) * RAD) / (1 + 1.2);
    const lines = text(card);
    assert.ok(lines.includes('Today, north (est.): ' + formatTemp(300 * Math.pow(1 + swing, 0.25))));
    assert.ok(lines.includes('Today, south (est.): ' + formatTemp(300 * Math.pow(1 - swing, 0.25))));
    // Under the temperature lines, in that order.
    assert.equal(lines.indexOf('Today, north (est.): ' + formatTemp(300 * Math.pow(1 + swing, 0.25))), lines.findIndex((line) => line.startsWith('Low temp.')) + 1);
    const hint = card.lines.find((line) => line.label === 'Today, north (est.)').hint;
    assert.ok(hint.includes('mean 27°C (80°F)') && hint.includes('axial tilt 20°') && hint.includes('pressure 1.2 bar'));
    assert.ok(hint.includes('orbit angle ' + Math.round(seasonPhase(angle)) % 360 + '°'));
    assert.ok(hint.endsWith('Day and night, geography and orbital eccentricity are not included.'));

    // A moon uses its parent planet's orbit angle, and its year is over two years of 8,760 hours.
    const moon = cardFor(plan, 'moon', 'w2m2', days);
    const parentAngle = bodyAngle(plan.worlds[1].epoch, plan.worlds[1].period, days);
    const moonSwing = 1.5 * Math.sin(25 * RAD) * Math.sin(seasonPhase(parentAngle) * RAD) / (1 + 0.9);
    assert.ok(text(moon).includes('Today, north (est.): ' + formatTemp(288 * Math.pow(1 + moonSwing, 0.25))));
    assert.ok(moon.lines.find((line) => line.label === 'Today, north (est.)').hint.includes('(the parent planet’s)'));

    // The estimate follows the clock.
    const later = cardFor(plan, 'world', 'w0', days + 32);
    assert.notEqual(text(later).find((line) => line.startsWith('Today, north')), lines.find((line) => line.startsWith('Today, north')));

    // No line, and no placeholder: a gas giant, a star, a belt, a moon without a pressure, a planet locked to its star.
    const none = (found) => assert.ok(!found.lines.some((line) => line.label.startsWith('Today')));
    none(cardFor(plan, 'world', 'w2', days));
    none(cardFor(plan, 'star', 's0', days));
    none(cardFor(plan, 'belt', 'w3', days));
    none(cardFor(plan, 'moon', 'w2m0', days));
    const lockedBody = testBody();
    Object.assign(lockedBody.mgtSystem.worlds[0], { pressureBar: 1.2, yearHours: 3066, tidallyLocked: true });
    none(cardFor(planSystem(normalizeSystem(lockedBody), HEX_KEY), 'world', 'w0', days));
});

test('Regina: the mainworld and a tilted planet at two dates, from the formula', async () => {
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
    const plan = planSystem(normalizeSystem(tree.body), 'Spinward_Marches/1910');
    const giant = plan.worlds.find((world) => world.moons.some((moon) => moon.mainworld));
    const regina = giant.moons.find((moon) => moon.mainworld);
    const tilted = plan.worlds.find((world) => world.name === 'Regina A-VIII');
    const expected = (body, angle) => {
        let part = Math.abs(Math.sin(body.axialTilt * RAD));
        if (body.yearHours < 36.5 * 24) part /= 2;
        if (body.yearHours > 2 * 8760) part *= 1.5;
        const swing = part * Math.sin(seasonPhase(angle) * RAD) / (1 + body.pressureBar);
        return [body.meanTempK * Math.pow(1 + swing, 0.25), body.meanTempK * Math.pow(1 - swing, 0.25)];
    };
    for (const days of [1105 * 365 + 1, 1105 * 365 + 1 + 900]) {
        const lines = (card) => card.lines.filter((line) => line.label.startsWith('Today')).map((line) => line.value);
        const giantAngle = bodyAngle(giant.epoch, giant.period, days);
        assert.deepEqual(lines(cardFor(plan, 'moon', regina.key, days)), expected(regina.body, giantAngle).map(formatTemp));
        const tiltedAngle = bodyAngle(tilted.epoch, tilted.period, days);
        assert.deepEqual(lines(cardFor(plan, 'world', tilted.key, days)), expected(tilted.body, tiltedAngle).map(formatTemp));
    }
    // Regina barely tilts (0.4°), so its two hemispheres stay within a degree of the mean all year.
    const [north, south] = expected(regina.body, Math.PI / 2);
    assert.ok(Math.abs(north - regina.body.meanTempK) < 1 && Math.abs(south - regina.body.meanTempK) < 1);
});
