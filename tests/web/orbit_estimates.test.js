/**
 * The estimates a plotted course shows (apps/web/src/orbit/estimates.ts) and the distance
 * formatter (design/units.ts formatDistance). Every expected figure is worked from
 * campaign/travel.ts, which reads rules/: no rule number is written here.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    ASSUMED_HULL_TONS, MANOEUVRE_DRIVE_USES_FUEL, jumpFuelTons, jumpParsecsCounted, reactionFuelTons, rollJumpHours, transitSeconds,
} from '../../apps/web/src/campaign/travel.ts';
import { formatDistance } from '../../apps/web/src/design/units.ts';
import {
    SETTLE_ROUNDS, fieldHours, flightFuelWords, flightHours, hoursWords, jumpEstimateWords, reactionFuelWords, rollWords, settleFlight, tonsWords,
} from '../../apps/web/src/orbit/estimates.ts';

const AU = 149597870.7;

test('the roll is said as the book writes it: base + dice = hours', () => {
    const lowest = rollJumpHours(() => 0);
    const highest = rollJumpHours(() => 0.999);
    const base = lowest.hours - lowest.dice.length;
    assert.equal(rollWords(lowest), base + ' + ' + lowest.dice.length + ' = ' + lowest.hours + ' h');
    assert.equal(rollWords(highest), base + ' + ' + (highest.hours - base) + ' = ' + highest.hours + ' h');
    assert.equal(rollWords({ hours: 30, dice: [4, 6] }), '20 + 10 = 30 h', 'the base is the total less the dice');
});

test('a jump estimate: the parsecs counted, the fuel, the assumed hull in words', () => {
    for (const parsecs of [0, 1, 2, 4]) {
        const counted = jumpParsecsCounted(parsecs);
        const words = jumpEstimateWords(parsecs);
        assert.ok(words.startsWith(counted + (counted === 1 ? ' parsec ·' : ' parsecs ·')), words);
        assert.ok(words.includes('about ' + tonsWords(jumpFuelTons(ASSUMED_HULL_TONS, parsecs)) + ' tons'), words);
        assert.ok(words.endsWith(ASSUMED_HULL_TONS + '-ton hull assumed'), words);
    }
});

test('a flight estimate: hours from the distance and the G; none without a distance to cross', () => {
    assert.equal(flightHours(null, 2), null);
    assert.equal(flightHours(0, 2), null);
    assert.equal(flightHours(Number.NaN, 2), null);
    assert.equal(flightHours(400000, 2), transitSeconds(400000, 2) / 3600);
    assert.ok(flightHours(400000, 4) < flightHours(400000, 2), 'more G, less time');
    assert.equal(fieldHours(4.26), 4.3);
    assert.equal(fieldHours(0.01), 0.1, 'never nothing');
    assert.equal(hoursWords(4.26), 'about 4.3 h');
    assert.equal(hoursWords(47.9), 'about 47.9 h');
    assert.equal(hoursWords(77.2), 'about 3 d 5 h');
    assert.equal(hoursWords(72), 'about 3 d');
    assert.equal(hoursWords(77.2, false), 'roughly 3 d 5 h', 'the settling sum did not agree');
    assert.equal(hoursWords(4.26, false), 'roughly 4.3 h');
});

test('a flight shows both drives: the manoeuvre line from the rule, the reaction figure from the function', () => {
    assert.equal(flightFuelWords(2, null), null);
    assert.equal(flightFuelWords(2, 0), null);
    const fuel = flightFuelWords(2, 10);
    assert.equal(fuel.manoeuvre, MANOEUVRE_DRIVE_USES_FUEL ? '' : 'Manoeuvre drive: no fuel');
    assert.equal(fuel.reaction, 'Reaction drive: about ' + tonsWords(reactionFuelTons(ASSUMED_HULL_TONS, 2, 10)) + ' tons · ' + ASSUMED_HULL_TONS + '-ton hull assumed');
    assert.equal(tonsWords(1234.4), '1,234');
    assert.equal(tonsWords(2.54), '2.5');
});

test('the reaction line gives way to words when the sum passes the assumed hull', () => {
    // The hours at which the sum is the hull itself, worked from the function: no rule number here.
    const perHour = reactionFuelTons(ASSUMED_HULL_TONS, 2, 1);
    const at = ASSUMED_HULL_TONS / perHour;
    assert.equal(reactionFuelTons(ASSUMED_HULL_TONS, 2, at), ASSUMED_HULL_TONS, 'the sum is exact at this point');
    const figure = (hours) => 'Reaction drive: about ' + tonsWords(reactionFuelTons(ASSUMED_HULL_TONS, 2, hours)) + ' tons · ' + ASSUMED_HULL_TONS + '-ton hull assumed';
    assert.equal(reactionFuelWords(2, at * 0.99), figure(at * 0.99), 'just under: the figure');
    assert.equal(reactionFuelWords(2, at), figure(at), 'at the hull: still the figure');
    assert.equal(reactionFuelWords(2, at * 1.01), 'Reaction drive: more than the ship’s tonnage', 'just over: the words');
    assert.equal(flightFuelWords(2, at * 1.01).reaction, 'Reaction drive: more than the ship’s tonnage');
});

test('a distance reads in kilometres near and in AU from a tenth of one', () => {
    assert.equal(formatDistance(384400, AU), '384,000 km');
    assert.equal(formatDistance(999, AU), '999 km');
    assert.equal(formatDistance(12345678, AU), '12,300,000 km');
    assert.equal(formatDistance(0, AU), '0 km');
    assert.equal(formatDistance(AU * 0.1, AU), '0.10 AU');
    assert.equal(formatDistance(AU * 1.524, AU), '1.52 AU');
    assert.equal(formatDistance(AU * 30.07, AU), '30.1 AU');
    assert.equal(formatDistance(null, AU), '');
    assert.equal(formatDistance(-1, AU), '');
});

test('the settling sum: a still target, a moving one that converges, one that never agrees, and no distance', () => {
    const D0 = 1000;
    // A still target: the second round agrees with the first.
    let asked = 0;
    const still = settleFlight(() => { asked += 1; return 400000; }, 2, D0);
    assert.equal(asked, 2);
    assert.equal(still.settled, true);
    assert.equal(still.hours, flightHours(400000, 2));
    assert.equal(still.arrives, D0 + still.hours / 24);
    assert.equal(still.km, 400000);

    // A target drifting away slowly: each round is closer to the answer, and it settles inside the limit.
    let rounds = 0;
    const moving = settleFlight((arrives) => { rounds += 1; return 4000000000 + (arrives - D0) * 3000000; }, 2, D0);
    assert.equal(moving.settled, true);
    assert.ok(rounds > 2 && rounds <= SETTLE_ROUNDS, 'it took ' + rounds + ' rounds');
    assert.ok(Math.abs(flightHours(4000000000 + (moving.arrives - D0) * 3000000, 2) - moving.hours) < 1 / 60, 'the answer is its own arrival');

    // A target that swings between two places never agrees: eight rounds, the last one kept, not settled.
    let flips = 0;
    const never = settleFlight(() => { flips += 1; return flips % 2 ? 400000 : 40000000; }, 2, D0);
    assert.equal(flips, SETTLE_ROUNDS);
    assert.equal(never.settled, false);
    assert.equal(never.km, 40000000);

    // No distance: nothing to settle. A distance that is lost part way keeps the last round.
    assert.equal(settleFlight(() => null, 2, D0), null);
    assert.equal(settleFlight(() => 0, 2, D0), null);
    let once = 0;
    const lost = settleFlight(() => { once += 1; return once === 1 ? 400000 : null; }, 2, D0);
    assert.equal(lost.km, 400000);
    assert.equal(lost.settled, false);
});
