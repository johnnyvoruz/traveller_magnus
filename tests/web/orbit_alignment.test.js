/**
 * The line-up search (apps/web/src/orbit/alignment.ts), with parity against the legacy code.
 *
 * The legacy functions are private to js/system_viewer.js, so this test lifts their source
 * text (from `_phaseSpread` to `_showLineup`) out of that frozen file and runs it in the
 * legacy oracle's context, with the three things it closed over stubbed: the bodies, the
 * clock and the run counter. Both sides then get the same bodies and must agree exactly.
 * The answers are also kept in tests/web/fixtures/orbit_alignment.json, so the port stays
 * pinned after the legacy file is deleted at M2 (ALIGNMENT_FIXTURES=write regenerates it).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadLegacy } from '../oracle/legacy.js';
import {
    alignBand, ALIGNMENT_HORIZON_YEARS, alignmentBodies, alignmentReport, alignmentWho, earliestLine, laterText,
    phaseSpread, polishSpread, searchAlignments, twoBodyLine,
} from '../../apps/web/src/orbit/alignment.ts';
import { AlignmentRunner } from '../../apps/web/src/orbit/alignment_runner.ts';
import { planSystem } from '../../apps/web/src/orbit/layout.ts';
import { HEX_KEY, testSystem } from './orbit_fixture.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const LEGACY = path.join(ROOT, 'js/system_viewer.js');
const FIXTURE = path.join(ROOT, 'tests/web/fixtures/orbit_alignment.json');
const PI = Math.PI;

/** Bodies as the search sees them: a start angle and a rate in radians a day. */
const body = (phase, periodYears, name = 'b', kind = 'planet') => ({ phase, omega: 2 * PI / (periodYears * 365.25), name, kind });
const SETS = {
    pair: [body(0.3, 1), body(2.1, 1.88)],
    three: [body(0.3, 0.24), body(2.1, 0.62), body(-1.2, 1)],
    four: [body(0.3, 0.24), body(2.1, 0.62), body(-1.2, 1), body(1.9, 1.88)],
    six: [body(0.3, 0.24), body(2.1, 0.62), body(-1.2, 1), body(1.9, 1.88), body(-2.6, 11.86), body(0.7, 29.4)],
    resonant: [body(0, 1), body(1, 2), body(2, 4)],
    fixed: [body(0.2, 3), body(1.4, 3), body(-2, 3)],
    retro: [body(0.5, 1), body(1.5, -2.5), body(-0.4, 7)],
};
const START = 1105 * 365 + 1;

/** The legacy functions, lifted from the frozen file into the oracle's context. Null once the file is gone. */
function legacyApi() {
    if (!fs.existsSync(LEGACY)) return null;
    const source = fs.readFileSync(LEGACY, 'utf8');
    const from = source.indexOf('    function _phaseSpread(');
    const to = source.indexOf('    function _showLineup(');
    assert.ok(from > 0 && to > from, 'the legacy alignment functions are where the inventory says');
    const ctx = loadLegacy();
    ctx.$eval('(function () {'
        + 'let _alignmentRun = 0; const _ALIGNMENT_HORIZON_YEARS = 200000; let __bodies = null; let __days = 0;'
        + 'function _alignmentBodies() { return __bodies; } function _totalDays() { return __days; }'
        + source.slice(from, to)
        + 'globalThis.__alignment = { phaseSpread: _phaseSpread, alignBand: _alignBand, polishSpread: _polishSpread, earliestLine: _earliestLine,'
        + ' twoBodyLine: _twoBodyLine, who: _alignmentWho, later: _laterText,'
        + ' search: function (bodies, options) { __bodies = bodies; return searchAlignments(options); } };'
        + '})();');
    return ctx.__alignment;
}

const plain = (value) => JSON.parse(JSON.stringify(value));
const counts = (phases) => ({ phases, planetCount: phases.filter((p) => p.kind === 'planet').length, starCount: phases.filter((p) => p.kind === 'star').length });

/** Every answer the parity check compares, from one implementation. */
async function answers(api) {
    const out = { spread: {}, polish: {}, earliest: {}, pair: {}, band: [], search: {}, words: [] };
    for (const [name, phases] of Object.entries(SETS)) {
        out.spread[name] = [0, 100.5, START].map((days) => [api.phaseSpread(phases, days, PI), api.phaseSpread(phases, days, 2 * PI)]);
        out.polish[name] = plain(api.polishSpread(phases, START, START + 400, PI));
        if (phases.length > 2) {
            out.earliest[name] = [2, 10, 40].map((deg) => {
                const budget = { max: 8000000, hit: false, visits: 0 };
                const hit = api.earliestLine(phases, START, START + 200000 * 365, deg * PI / 180, PI, budget);
                return { hit: plain(hit), visits: budget.visits, stopped: budget.hit };
            });
        }
        // Three bodies in resonance never line up, and the full 200,000 years takes twelve seconds to say so;
        // the sparse sets are slow in the oracle's context too. The four and six body sets search the full horizon.
        const horizon = name === 'resonant' ? { horizonDays: 6000 } : (name === 'three' || name === 'retro' ? { horizonDays: 40000 } : {});
        out.search[name] = plain(await api.search(counts(phases), { startDays: START, ...horizon }));
        out.search[name + ':sameSide'] = plain(await api.search(counts(phases), { startDays: START, sameSide: true, ...horizon }));
    }
    out.pair.next = plain(api.twoBodyLine(SETS.pair, START, PI));
    out.pair.sameSide = plain(api.twoBodyLine(SETS.pair, START, 2 * PI));
    // The next one after a result, at the closeness already shown (the popover's second button).
    const first = await api.search(counts(SETS.four), { startDays: START });
    out.search['four:after'] = plain(await api.search(counts(SETS.four), { startDays: first.best.days + 1 / 86400, tolerance: first.tolerance, strict: true }));
    out.search['four:horizon'] = plain(await api.search(counts(SETS.six), { startDays: START, horizonDays: 5000 }));
    for (const dw of [0, 0.003, -0.02, 0.5]) {
        for (const window of [[0, 10], [100, 100.5], [0, 4000]]) {
            out.band.push(api.alignBand({ dw, dphi: 0.7 }, window[0], window[1], 0.1, PI));
        }
    }
    for (const planetCount of [0, 1, 2, 12]) for (const starCount of [0, 1, 2]) out.words.push(api.who({ planetCount, starCount }));
    for (const days of [0.001, 0.05, 0.2, 1.5, 3, 25, 340, 365, 380, 500, 7300, 73000000]) out.words.push(api.later(days));
    return out;
}

const port = {
    phaseSpread, alignBand, polishSpread, earliestLine, twoBodyLine, who: alignmentWho, later: laterText,
    search: (bodies, options) => searchAlignments(bodies, options),
};

test('the port agrees with the legacy search exactly, and with the pinned answers', async () => {
    const mine = await answers(port);
    const legacy = legacyApi();
    if (legacy) {
        const theirs = await answers(legacy);
        assert.deepEqual(mine, theirs);
        if (process.env.ALIGNMENT_FIXTURES === 'write') {
            fs.mkdirSync(path.dirname(FIXTURE), { recursive: true });
            fs.writeFileSync(FIXTURE, JSON.stringify(theirs, null, 1) + '\n');
        }
    }
    assert.ok(fs.existsSync(FIXTURE), 'tests/web/fixtures/orbit_alignment.json is missing: run with ALIGNMENT_FIXTURES=write');
    assert.deepEqual(mine, JSON.parse(fs.readFileSync(FIXTURE, 'utf8')));
});

test('what the answers mean: a line is a line, and the search finds the first and the tightest', async () => {
    assert.equal(ALIGNMENT_HORIZON_YEARS, 200000);
    // The spread is the smallest arc that holds every body; opposite sides of the star fold together at π.
    const opposite = [body(0, 1), body(PI, 2)];
    assert.ok(phaseSpread(opposite, 0, PI) < 1e-9);
    assert.ok(Math.abs(phaseSpread(opposite, 0, 2 * PI) - 180) < 1e-9);
    // Two bodies: the next crossing is exact, later than the start, and repeats at the stated interval.
    const pair = twoBodyLine(SETS.pair, START, PI);
    assert.ok(pair.best.days >= START && pair.best.spread < 1e-6);
    assert.ok(Math.abs(pair.recurrence - PI / Math.abs(SETS.pair[1].omega - SETS.pair[0].omega)) < 1e-9);
    assert.ok(phaseSpread(SETS.pair, pair.next.days, PI) < 1e-6);
    // More bodies: the result is inside the window, as tight as it says, and nothing that tight came earlier.
    const result = await searchAlignments(counts(SETS.four), { startDays: START });
    assert.equal(result.bodies, 4);
    assert.ok(result.best.days > START && result.best.days <= START + result.horizonDays);
    assert.ok(Math.abs(phaseSpread(SETS.four, result.best.days, PI) - result.best.spread) < 1e-9);
    for (let days = START; days < result.best.days - 2; days += Math.max(0.5, (result.best.days - START) / 4000)) {
        assert.ok(phaseSpread(SETS.four, days, PI) > result.best.spread - 0.5, 'an earlier moment was tighter at day ' + days);
    }
    assert.ok(result.next === null || result.next.days > result.best.days);
    assert.ok(result.tolerance >= result.best.spread);
    // Bodies that all turn at one rate never change their spread.
    const fixed = await searchAlignments(counts(SETS.fixed), { startDays: START });
    assert.equal(fixed.constant, true);
    assert.equal(fixed.matches.length, 0);
    // Fewer than two bodies: nothing to line up.
    assert.equal((await searchAlignments(counts([body(0, 1)]), { startDays: START })).constant, true);
    // A cancelled search answers null; a tiny budget stops early and says so.
    assert.equal(await searchAlignments(counts(SETS.four), { startDays: START, alive: () => false }), null);
    const starved = await searchAlignments(counts(SETS.six), { startDays: START, budget: 50 });
    assert.equal(starved.truncated, true);
    // The page gets a turn between probes.
    let pauses = 0;
    await searchAlignments(counts(SETS.four), { startDays: START, pause: async () => { pauses++; } });
    assert.ok(pauses >= 2);
});

test('the bodies of a system: companion stars and worlds, no belts, moons only on request, never rings', () => {
    const plan = planSystem(testSystem(), HEX_KEY);
    const found = alignmentBodies(plan, false);
    assert.deepEqual(found.phases.map((p) => p.kind + ':' + p.name), ['star:M0 V', 'planet:Test I', 'planet:Test II', 'planet:Test B-I']);
    assert.deepEqual([found.planetCount, found.starCount], [3, 1]);
    // The start angle and the rate are the ones the picture draws with.
    assert.equal(found.phases[1].phase, plan.worlds[0].epoch);
    assert.equal(found.phases[1].omega, 2 * PI / (0.35 * 365.25));
    assert.equal(found.phases[0].phase, plan.stars[1].epoch);
    assert.equal(found.phases[0].omega, 2 * PI / (plan.stars[1].period * 365.25));
    const withMoons = alignmentBodies(plan, true);
    assert.deepEqual(withMoons.phases.filter((p) => p.kind === 'moon').map((p) => p.name), ['Test II-a', 'Test']);
    assert.equal(withMoons.planetCount, 3);
});

test('the popover’s words, case by case', async () => {
    const say = (result, shown = null) => alignmentReport(result, shown);
    assert.deepEqual(say(null).lines, ['Search cancelled. Line them up again to use the current system.']);
    const base = { bodies: 4, planetCount: 3, starCount: 1, horizonDays: 200000 * 365, truncated: false, constant: false, exact: false, recurrence: null, best: null, next: null, matches: [], names: [], scannedDays: 0, startDays: 0 };
    assert.ok(say({ ...base, bodies: 1 }).lines[0].startsWith('This system needs at least two orbiting planets'));
    assert.equal(say({ ...base, constant: true, best: { days: 0, spread: 41.26 } }).lines[0], 'All 3 planets and the companion star hold a fixed spread of 41.3°. There is no later date when they line up differently.');
    assert.equal(say(base).lines[0], 'No lineup turned up in the next 200,000 years.');
    assert.equal(say({ ...base, truncated: true }).lines[0], 'The search stopped early. Line them up again to continue from this date.');
    assert.equal(say(base).land, null);
    const at = (spread) => say({ ...base, best: { days: 403327.5, spread } });
    assert.equal(at(0.01).lines[0], 'All 3 planets and the companion star are exactly on one line through the star.');
    assert.equal(at(4.26).lines[0], 'All 3 planets and the companion star are on one line through the star, within 4.3°.');
    assert.equal(at(11.6).lines[0], 'All 3 planets and the companion star are on one line through the star, within 12°.');
    assert.equal(at(20.2).lines[0], 'All 3 planets and the companion star gather into a 20° line through the star.');
    assert.equal(at(35.5).lines[0], 'All 3 planets and the companion star are 36° from a straight line. That is as close as this search gets.');
    assert.equal(at(4).date, 'Year 1,105 · Day 3 · 12:00:00');
    assert.equal(at(4).land, 403327.5);
    assert.deepEqual(at(4).notes, ['The next lineup this close is more than 200,000 years after this one.']);
    const withNext = say({ ...base, best: { days: 403327.5, spread: 4 }, next: { days: 403327.5 + 730, spread: 4.2 } });
    assert.deepEqual(withNext.notes, ['Next time: Year 1,107 · Day 3 · 12:00:00, 2 years later.']);
    assert.deepEqual(withNext.upcoming, { days: 403327.5 + 730, spread: 4.2 });
    // Two bodies repeat exactly.
    const pair = await searchAlignments(counts(SETS.pair), { startDays: START });
    const pairWords = say(pair);
    assert.equal(pairWords.lines[0], 'Both planets are exactly on one line through the star.');
    assert.ok(pairWords.notes[0].startsWith('The same line repeats every '));
    assert.ok(pairWords.notes[1].startsWith('Next time: '));
    // The search after a line-up already shown: the shown one is the headline, the result is "next time".
    const shown = { days: 403327.5, spread: 4 };
    const after = say({ ...base, best: { days: 403327.5 + 365, spread: 4.1 } }, shown);
    assert.equal(after.land, 403327.5);
    assert.deepEqual(after.notes, ['Next time: Year 1,106 · Day 3 · 12:00:00, 1 year later.']);
    assert.deepEqual(say(base, shown).notes, ['The next lineup this close is more than 200,000 years after this one.']);
});

test('the runner: one search at a time, on a worker when there is one, cancelled when replaced', async () => {
    const found = counts(SETS.four);
    // No worker: the search runs here, with the page getting a turn between probes.
    const here = new AlignmentRunner(null);
    const direct = await here.run(found, { startDays: START });
    assert.deepEqual(plain(direct), plain(await searchAlignments(found, { startDays: START })));
    // A second run replaces the first: the first answers null.
    const first = here.run(found, { startDays: START });
    const second = here.run(found, { startDays: START });
    assert.equal(await first, null);
    assert.ok((await second).best);
    // Cancel answers null.
    const cancelled = here.run(found, { startDays: START });
    here.cancel();
    assert.equal(await cancelled, null);

    // A worker: the request is posted, the answer comes back by id, a stale answer is ignored.
    const posted = [];
    let listener = null;
    let terminated = 0;
    const fake = {
        postMessage(message) { posted.push(message); },
        addEventListener(_type, fn) { listener = fn; },
        terminate() { terminated++; },
    };
    const away = new AlignmentRunner(() => fake);
    const pending = away.run(found, { startDays: START, tolerance: 3, strict: true });
    assert.equal(posted.length, 1);
    assert.deepEqual(posted[0].options, { startDays: START, tolerance: 3, strict: true });
    assert.equal(posted[0].found, found);
    listener({ data: { id: posted[0].id + 99, result: { bodies: 0 } } });
    listener({ data: { id: posted[0].id, result: { bodies: 4 } } });
    assert.deepEqual(await pending, { bodies: 4 });
    // Replacing a search on a worker stops that worker and starts another.
    const stale = away.run(found, { startDays: START });
    const fresh = away.run(found, { startDays: START });
    assert.equal(await stale, null);
    assert.equal(terminated, 1);
    listener({ data: { id: posted[posted.length - 1].id, result: { bodies: 7 } } });
    assert.deepEqual(await fresh, { bodies: 7 });
    away.dispose();
    assert.equal(terminated, 2);
    // A worker that cannot start falls back to running here.
    const broken = new AlignmentRunner(() => { throw new Error('no workers'); });
    assert.ok((await broken.run(found, { startDays: START })).best);
});
