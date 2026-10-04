/**
 * The first delighters and the hover card: temperatures in both scales (design/units.ts),
 * the season line (orbit/seasons.ts), the card's contents (orbit/card.ts) and the highport
 * rule (orbit/highport.ts). The season and temperature rules are Johnny's decisions of
 * 2026-10-03 (Q1, Q2, Q6) over campaign_manager_plan.md §7.4 and §7.5.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { celsiusOf, fahrenheitOf, formatTemp, formatTempFull, kelvinNote, tempLines, wholeDegrees } from '../../apps/web/src/design/units.ts';
import { cardFor } from '../../apps/web/src/orbit/card.ts';
import {
    chaseAngle, HIGHPORT_ART, HIGHPORT_MAX_RATE, highportArt, highportOf, highportOrbitRadius,
    highportPeriodYears, highportPlace, highportSize, spriteWidth,
} from '../../apps/web/src/orbit/highport.ts';
import { planSystem } from '../../apps/web/src/orbit/layout.ts';
import { bodyAngle } from '../../apps/web/src/orbit/maths.ts';
import {
    effectiveTilt, NEGLIGIBLE_TILT_DEG, SEASON_HELP, seasonLine, seasonPhase, seasonStrength,
    SPRING_EQUINOX_ANGLE,
} from '../../apps/web/src/orbit/seasons.ts';
import { HEX_KEY, testSystem } from './orbit_fixture.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, a + ' is not ' + b);
const RAD = Math.PI / 180;

test('temperatures: Celsius first, Fahrenheit from the unrounded Celsius, whole degrees, a true minus', () => {
    assert.equal(formatTemp(291.15), '18°C (64°F)');
    assert.equal(formatTemp(288), '15°C (59°F)');
    assert.equal(formatTemp(273.15), '0°C (32°F)');
    // −84.15 °C is −119.47 °F: each figure rounded on its own, from the unrounded Celsius.
    assert.equal(formatTemp(189), '−84°C (−119°F)');
    // 0.4 K under freezing: never "−0".
    assert.equal(formatTemp(272.75), '0°C (31°F)');
    assert.equal(formatTemp(6300), '6,027°C (10,880°F)');
    assert.equal(formatTemp(0), '−273°C (−460°F)');
    assert.equal(formatTemp(null), '');
    assert.equal(formatTemp(undefined), '');
    assert.equal(formatTemp(Number.NaN), '');
    assert.equal(formatTemp('288'), '');
    close(celsiusOf(273.15), 0);
    assert.equal(fahrenheitOf(100), 212);
    assert.equal(wholeDegrees(-0.4), '0');
    assert.equal(wholeDegrees(-1234.5), '−1,234');
    // A full temperature splits into its three figures for a tile or a row; other text does not.
    assert.deepEqual(tempLines(formatTempFull(189)), ['−84 °C', '−119 °F', '189 K']);
    assert.equal(tempLines('Gas Giant GL · Orbit 1.82 · 0.646 AU'), null);
    assert.equal(tempLines('720 h, retrograde'), null);
    assert.equal(tempLines(''), null);
    // Kelvin is for a tooltip only.
    assert.equal(kelvinNote('Mean', 288.4), 'Mean 288 K');
    assert.equal(kelvinNote('Mean', null), '');
});

const planet = (over = {}) => ({
    moon: false, tilt: 23.4, parentTilt: null, parentName: '', yearDays: 365, lockedToStar: false,
    angle: 0, eccentricity: 0.02, ...over,
});

test('seasons: the equinox is orbit angle 0, and the year runs spring, summer, autumn, winter in the north', () => {
    assert.equal(SPRING_EQUINOX_ANGLE, 0);
    assert.equal(seasonPhase(0), 0);
    close(seasonPhase(Math.PI / 2), 90);
    close(seasonPhase(-Math.PI / 2), 270);
    close(seasonPhase(2 * Math.PI + 10 * RAD), 10, 1e-6);
    assert.equal(seasonLine(planet({ angle: 10 * RAD })).text, 'Northern spring, marked · southern autumn');
    assert.equal(seasonLine(planet({ angle: 100 * RAD })).text, 'Northern summer, marked · southern winter');
    assert.equal(seasonLine(planet({ angle: 190 * RAD })).text, 'Northern autumn, marked · southern spring');
    assert.equal(seasonLine(planet({ angle: 280 * RAD })).text, 'Northern winter, marked · southern summer');
    // The angle is the place on the orbit: a whole turn later it is the same season.
    assert.equal(seasonLine(planet({ angle: (280 + 720) * RAD })).text, seasonLine(planet({ angle: 280 * RAD })).text);
    assert.equal(seasonLine(planet({ angle: -80 * RAD })).text, 'Northern winter, marked · southern summer');
    // The inputs are stated for the `?`.
    assert.equal(seasonLine(planet({ angle: 147 * RAD })).inputs, 'tilt 23.4° · e 0.02 · orbit angle 147°');
    assert.ok(SEASON_HELP.includes('orbit angle 0°') && SEASON_HELP.includes('not canon data'));
});

test('seasons: strength from the tilt, retrograde folded, negligible under three degrees', () => {
    assert.equal(NEGLIGIBLE_TILT_DEG, 3);
    assert.deepEqual([5, 15, 34.9, 35, 60, 61].map(seasonStrength), ['mild', 'marked', 'marked', 'severe', 'severe', 'extreme']);
    assert.equal(effectiveTilt(130), 50);
    assert.equal(effectiveTilt(90), 90);
    assert.equal(seasonLine(planet({ tilt: 130 })).text, 'Northern spring, severe · southern autumn · retrograde');
    assert.equal(seasonLine(planet({ tilt: 2.9 })).text, 'Negligible seasons (tilt 2.9°)');
    assert.equal(seasonLine(planet({ tilt: 179.6 })).text, 'Negligible seasons (tilt 179.6°)');
    assert.equal(seasonLine(planet({ tilt: 3 })).text, 'Northern spring, mild · southern autumn');
    // No tilt in the document: nothing is said for a planet.
    assert.equal(seasonLine(planet({ tilt: null })), null);
});

test('seasons: a planet locked to its star has none; an eccentric orbit adds its own line', () => {
    assert.equal(seasonLine(planet({ lockedToStar: true })).text, 'No seasons: one face always points at the star');
    assert.equal(seasonLine(planet()).orbit, '');
    // ((1 + e) / (1 − e))², to one decimal.
    assert.equal(seasonLine(planet({ eccentricity: 0.1 })).orbit, 'Orbit-driven: whole-world warm and cool seasons, flux ratio 1.5');
    assert.equal(seasonLine(planet({ eccentricity: 0.65 })).orbit, 'Orbit-driven: whole-world warm and cool seasons, flux ratio ' + Math.pow(1.65 / 0.35, 2).toFixed(1));
    assert.equal(seasonLine(planet({ eccentricity: null })).orbit, '');
});

const moon = (over = {}) => ({
    moon: true, tilt: 25, parentTilt: 11, parentName: 'Regina A-IV', yearDays: 1983.7, lockedToStar: false,
    angle: 200 * RAD, eccentricity: 0, ...over,
});

test('seasons on a moon: the parent’s year and angle with the moon’s tilt, first match wins', () => {
    // Its own tilt.
    assert.equal(seasonLine(moon()).text, 'Northern autumn, marked · southern spring · by Regina A-IV’s year (1,984 days)');
    // No tilt of its own: the parent's, marked as derived.
    const derived = seasonLine(moon({ tilt: null, parentTilt: 40 }));
    assert.equal(derived.text, 'Northern autumn, severe · southern spring · tilt derived from Regina A-IV · by Regina A-IV’s year (1,984 days)');
    assert.ok(derived.inputs.includes('derived'));
    // Neither has one: the year only, no hemisphere text.
    assert.deepEqual(seasonLine(moon({ tilt: null, parentTilt: null })), {
        text: 'Year: Regina A-IV’s year (1,984 days)', lines: ['Year: Regina A-IV’s year (1,984 days)'], orbit: '', inputs: '',
    });
    // The same statements, one to a line, for the card.
    assert.deepEqual(seasonLine(moon()).lines, ['Northern autumn, marked', 'Southern spring', 'By Regina A-IV’s year (1,984 days)']);
    assert.deepEqual(seasonLine(moon({ tilt: 130 })).lines.slice(0, 3), ['Northern autumn, severe', 'Southern spring', 'Retrograde']);
    // Under three degrees.
    assert.equal(seasonLine(moon({ tilt: 0.4 })).text, 'Negligible seasons (tilt 0.4°) · by Regina A-IV’s year (1,984 days)');
    // A moon locked to its planet still has seasons: the flag is never read for a moon.
    assert.equal(seasonLine(moon({ lockedToStar: true })).text, seasonLine(moon()).text);
});

test('the card: the legacy lines for each kind, with temperatures in both scales and no kelvin', () => {
    const sys = testSystem();
    const plan = planSystem(sys, HEX_KEY);
    const days = 1000;
    const text = (card) => card.lines.map((line) => line.label + ': ' + line.value);

    const star = cardFor(plan, 'star', 's1', days);
    assert.equal(star.title, 'M0 V');
    assert.equal(star.sub, 'Far');
    assert.deepEqual(text(star), [
        'Type: M0 V', 'Surface temp.: 3,527°C (6,380°F)', 'Mass: 0.5 M☉', 'Diameter: 0.5 D☉',
        'Luminosity: 0.04 L☉', 'Separation: Far', 'Distance: ' + text(star)[6].slice('Distance: '.length),
    ]);
    assert.ok(text(star)[6].endsWith(' AU'));
    assert.equal(star.season, null);
    assert.ok(!text(cardFor(plan, 'star', 's0', days)).some((line) => line.startsWith('Distance')));

    const world = cardFor(plan, 'world', 'w0', days);
    assert.equal(world.title, 'Test I');
    assert.equal(world.sub, 'Terrestrial Planet');
    // One value to a line, no dots: the band, then the mean, the high and the low.
    const temps = text(world).filter((line) => /temp\.|Climate/.test(line));
    assert.deepEqual(temps, ['Climate: Temperate', 'Mean temp.: 27°C (80°F)', 'High temp.: 47°C (116°F)', 'Low temp.: 7°C (44°F)']);
    assert.ok(!text(world).some((line) => line.includes('·')), 'no line runs two values together');
    assert.ok(text(world).includes('Distance: 0.5 AU'));
    assert.ok(!text(world).join(' ').includes(' K'), 'no kelvin on the card');
    assert.equal(world.lines.find((line) => line.label === 'Mean temp.').hint, 'Mean 300 K');
    assert.equal(world.lines.find((line) => line.label === 'UWP').strong, true);
    // The season is the one at the world's own orbit angle on the date.
    const angle = bodyAngle(plan.worlds[0].epoch, plan.worlds[0].period, days);
    assert.equal(world.season.text, seasonLine({
        moon: false, tilt: 20, parentTilt: null, parentName: '', yearDays: 128, lockedToStar: false, angle, eccentricity: 0.02,
    }).text);
    assert.equal(world.seasonHelp, SEASON_HELP);

    const giant = cardFor(plan, 'world', 'w2', days);
    assert.equal(giant.sub, 'Gas Giant GL');
    assert.ok(text(giant).includes('Moons: 3'));
    // No band in the document: the mean alone.
    assert.ok(text(giant).includes('Mean temp.: −153°C (−244°F)'));
    assert.ok(!text(giant).some((line) => line.startsWith('Climate')));

    const main = cardFor(plan, 'moon', 'w2m2', days);
    assert.equal(main.title, 'Test');
    assert.equal(main.sub, 'Mainworld Satellite');
    assert.ok(text(main).includes('Orbit: 12 PD from parent'));
    assert.ok(text(main).includes('UWP: A667899-C'));
    assert.ok(text(main).includes('Rotation: tidally locked'));
    assert.ok(text(main).includes('Size: 6'));
    // A moon's season follows its parent's orbit angle and year.
    const parentAngle = bodyAngle(plan.worlds[1].epoch, plan.worlds[1].period, days);
    assert.equal(main.season.text, seasonLine({
        moon: true, tilt: 25, parentTilt: 3.1, parentName: 'Test II', yearDays: 4090, lockedToStar: false, angle: parentAngle, eccentricity: 0.05,
    }).text);
    assert.ok(main.season.text.includes('by Test II’s year (4,090 days)'));

    const belt = cardFor(plan, 'belt', 'w3', days);
    assert.equal(belt.sub, 'Planetoid Belt');
    assert.ok(text(belt).includes('Resource: 7'));
    assert.equal(belt.season, null);

    // A ring has no card (legacy 4797-4873 has no ring branch); nor does an unknown key.
    assert.equal(cardFor(plan, 'ring', 'w2', days), null);
    assert.equal(cardFor(plan, 'moon', 'w2m3', days).season, null);
    assert.equal(cardFor(plan, 'world', 'w9', days), null);
});

test('the highport: only where the starport profile says so, placed and paced as the legacy station', () => {
    assert.deepEqual(highportOf({ starportProfile: 'A-HY:DY:+5', starport: 'A' }), { cls: 'A', major: true });
    assert.deepEqual(highportOf({ starportProfile: 'C-HY:DN:0', uwp: 'C555555-5' }), { cls: 'C', major: false });
    assert.equal(highportOf({ starportProfile: 'B-HN:DY:+1', starport: 'B' }), null);
    assert.equal(highportOf({ starport: 'A' }), null, 'no highport is assumed without a profile');
    assert.equal(highportOf(null), null);
    // Class D borrows E's painting; an unknown class falls back to E.
    assert.equal(highportArt('D'), HIGHPORT_ART.E);
    assert.equal(highportArt('X'), HIGHPORT_ART.E);
    assert.equal(highportArt('A').file, 'highport-a.png');
    assert.deepEqual(HIGHPORT_ART.C.crop, [16, 17, 267, 244]);
    // The period: a circular orbit at 1.06 radii from size and gravity; ninety minutes without them.
    const radiusM = 12742 * 500;
    const seconds = 2 * Math.PI * Math.sqrt(Math.pow(radiusM * 1.06, 3) / (9.81 * radiusM * radiusM));
    close(highportPeriodYears({ diamKm: 12742, gravity: 1 }), seconds / (365.25 * 86400), 1e-15);
    close(highportPeriodYears({}), 90 * 60 / (365.25 * 86400), 1e-15);
    // Sizes on screen.
    assert.equal(highportOrbitRadius(10), 17);
    assert.equal(highportOrbitRadius(100), 130);
    assert.deepEqual([highportSize(5), highportSize(40), highportSize(200)], [4, 9.6, 18]);
    assert.deepEqual([spriteWidth(1), spriteWidth(17), spriteWidth(9000)], [4, 20, 320]);
    // The drawn angle follows the true one, at most 1.1 radians a second.
    const start = chaseAngle(null, 2, 1 / 60);
    assert.equal(start.angle, 2);
    const slow = chaseAngle(start.state, 2.01, 1 / 60);
    close(slow.angle, 2.01);
    const fast = chaseAngle(start.state, 50, 1 / 60);
    close(fast.angle, 2 + HIGHPORT_MAX_RATE / 60);
    assert.equal(fast.state.want, 50);
    // In the picture plane the station is never behind its world; it is shaded on the far side from the star.
    const lit = highportPlace(100, 0, 10, Math.PI, 0, 0);
    assert.deepEqual([lit.x, lit.y < 1e-9, lit.behind, lit.hidden, lit.shaded], [83, true, false, false, false]);
    const dark = highportPlace(100, 0, 10, 0, 0, 0);
    assert.deepEqual([dark.x, dark.shaded], [117, true]);
    assert.equal(highportPlace(100, 0, 10, Math.PI / 2, 0, 0).shaded, false);
    // With a tilted basis the far half is behind, and hidden where the disc covers it.
    const basis = { e1: [1, 0, 0], e2: [0, 0.05, -1] };
    const back = highportPlace(100, 0, 10, Math.PI / 2, 0, 0, basis);
    assert.equal(back.behind, true);
    assert.equal(back.hidden, true);
});
