/**
 * ZC1: the comms scheduler with a fake clock, a fake screen, a fake store and a
 * fake page visibility. No real timers run.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TIMING, createCommsController, historyKey } from '../../apps/web/src/living/comms/controller.ts';
import { BEOWULF_SEGMENTS, beowulfHash, beowulfStorageKey } from '../../apps/web/src/living/comms/beowulf.ts';
import { GAP_SECONDS } from '../../apps/web/src/living/comms/events.ts';

const base = {
    hexKey: 'Test_Sector/0101', name: 'Regina', sector: 'Test Sector', subsector: 'Test',
    size: 7, atm: 6, hydro: 7, pop: 9, gov: 5, law: 4, tl: 12,
    tradeCodes: ['Hi', 'Ri'], zone: 'green', bases: 'NS', highport: true, starport: 'A',
    gasGiants: 1, belts: 1, moons: 1, otherBodies: 3, xboat: true,
    party: 'docked', day: 2,
    bodies: { gasGiant: 'Regina II', belt: 'Regina Belt', moon: 'Regina-a', body: 'Regina I' },
};

function rig() {
    let now = 0;
    let seq = 0;
    const timers = new Map();
    const clock = {
        now: () => now,
        setTimeout: (fn, ms) => { const id = ++seq; timers.set(id, { at: now + ms, fn }); return id; },
        clearTimeout: (id) => { timers.delete(id); },
    };
    const advance = (ms) => {
        const end = now + ms;
        for (;;) {
            let best = null;
            for (const [id, t] of timers) if (t.at <= end && (!best || t.at < best[1].at)) best = [id, t];
            if (!best) break;
            timers.delete(best[0]);
            now = best[1].at;
            best[1].fn();
        }
        now = end;
    };
    const calls = [];
    let completeCb = null;
    let pending = false;
    const screen = {
        transmit: (m) => { calls.push(['transmit', m]); pending = true; },
        idle: (o) => { calls.push(['idle', o ?? null]); },
        onTranscriptComplete: (cb) => { completeCb = cb; },
        theme: (mode) => { calls.push(['theme', mode]); },
        destroy: () => { calls.push(['destroy']); },
    };
    const complete = () => { pending = false; completeCb(); };
    const map = new Map();
    const store = { get: (k) => (map.has(k) ? map.get(k) : null), set: (k, v) => { map.set(k, v); } };
    let visible = true;
    const listeners = new Set();
    const visibility = { visible: () => visible, onChange: (fn) => { listeners.add(fn); return () => listeners.delete(fn); } };
    const setVisible = (v) => { visible = v; for (const fn of listeners) fn(); };
    /** Run the clock, finishing every transcript at once (a reader at infinite speed). */
    const drive = (ms, step = 250) => {
        for (let t = 0; t < ms; t += step) { if (pending) complete(); advance(step); }
    };
    const transmits = () => calls.filter((c) => c[0] === 'transmit').map((c) => c[1]);
    return { clock, advance, screen, calls, complete, store, map, visibility, setVisible, drive, transmits, isPending: () => pending, timers };
}

const make = (r) => createCommsController({ screen: r.screen, clock: r.clock, store: r.store, visibility: r.visibility });
const input = (facts, extra = {}) => ({ facts, truthVersion: 'tv1', campaignKey: 'camp', shown: true, ...extra });

test('same-day world edits rebuild the eligible pool without a new arrival', () => {
    const r = rig();
    let checks = 0;
    const line = { id: 'market-999', category: 'market', voice: 'local', text: 'The return containers are ready for collection.',
        when: { get law() { checks++; return { min: 9 }; } } };
    const c = createCommsController({ screen: r.screen, clock: r.clock, store: r.store, visibility: r.visibility, lines: () => [line] });
    c.update(input(base));
    const before = checks;
    c.update(input({ ...base, law: 10, allegiance: 'AsSc', allegianceBase: 'As' }));
    assert.ok(checks > before, 'eligibility is rechecked on changed world facts');
    const after = checks;
    c.update(input({ ...base, law: 10, allegiance: 'AsSc', allegianceBase: 'As' }));
    assert.equal(checks, after, 'identical facts preserve the pool');
    c.destroy();
});

test('a first arrival opens with the beacon, then fades, then dead air', () => {
    const r = rig();
    const c = make(r);
    c.update(input(base));
    r.advance(TIMING.beaconDelayMs - 1);
    assert.equal(r.transmits().length, 0);
    r.advance(1);
    const [beacon] = r.transmits();
    assert.equal(beacon.ch, 'CH 01');
    assert.equal(beacon.from, 'REGINA BEACON');
    assert.equal(c.state(), 'speaking');
    r.advance(60_000);
    assert.equal(r.transmits().length, 1, 'nothing follows until the transcript completes');
    r.complete();
    assert.equal(c.state(), 'fading');
    r.advance(TIMING.keepLastMs);
    assert.deepEqual(r.calls.at(-1), ['idle', { keepLast: true }]);
    r.advance(TIMING.clearMs);
    assert.deepEqual(r.calls.at(-1), ['idle', null]);
    assert.equal(c.state(), 'dead-air');
    r.advance(GAP_SECONDS.busy[0] * 1000 - 1);
    assert.equal(r.transmits().length, 1, 'the gap is at least the band minimum');
    r.advance((GAP_SECONDS.busy[1] - GAP_SECONDS.busy[0]) * 1000 + 1);
    assert.equal(r.transmits().length, 2, 'and at most the band maximum');
    c.destroy();
});

test('the next turn waits for the transcript, then a one to three second dwell', () => {
    const r = rig();
    const c = make(r);
    r.map.set(historyKey(base.hexKey, 'tv1'), JSON.stringify({ eventIndex: 0, recent: [], lastParty: 'docked' }));
    c.update(input(base));
    let seen = 0;
    let multi = 0;
    for (let guard = 0; guard < 4000 && multi < 3; guard++) {
        r.advance(250);
        const n = r.transmits().length;
        if (n > seen) {
            seen = n;
            if (c.state() !== 'speaking') continue;
            r.advance(30_000);
            assert.equal(r.transmits().length, n, 'no overlap while a transcript is running');
            r.complete();
            if (c.state() === 'dwell') {
                multi += 1;
                r.advance(TIMING.dwellMinMs - 1);
                assert.equal(r.transmits().length, n, 'dwell is at least a second');
                r.advance(TIMING.dwellMaxMs - TIMING.dwellMinMs + 1);
                assert.equal(r.transmits().length, n + 1, 'dwell is at most three seconds');
                seen = n + 1;
            }
            if (r.isPending()) r.complete();
        } else if (r.isPending()) r.complete();
    }
    assert.ok(multi >= 3, 'saw multi-turn scenes');
    c.destroy();
});

test('away and in jump the view still listens, and never hears the beacon (ZC2)', () => {
    for (const party of ['away', 'inJump']) {
        const r = rig();
        const c = make(r);
        c.update(input({ ...base, party }));
        r.drive(600_000, 250);
        assert.ok(r.transmits().length > 0, party);
        assert.ok(!r.transmits().some((m) => m.from === 'REGINA BEACON'), party);
        assert.notEqual(c.state(), 'off');
        c.destroy();
    }
});

test('chatter off and a truth change cancel what is on the air; a jump does not (ZC2)', () => {
    const r = rig();
    const c = make(r);
    c.update(input(base));
    r.advance(TIMING.beaconDelayMs);
    assert.equal(c.state(), 'speaking');
    c.update(input(base, { shown: false }));
    assert.deepEqual(r.calls.at(-1), ['idle', null]);
    assert.equal(c.state(), 'off');
    r.drive(600_000, 1000);
    assert.equal(r.transmits().length, 1);

    c.update(input(base));
    r.drive(120_000, 250);
    const before = r.transmits().length;
    assert.ok(before > 1);
    assert.ok(!r.transmits().slice(1).some((m) => m.from === 'REGINA BEACON'), 'chatter back on is not an arrival');
    c.update(input({ ...base, party: 'inJump' }));
    assert.notEqual(c.state(), 'off', 'the view keeps listening');
    r.drive(600_000, 1000);
    assert.ok(r.transmits().length > before, 'the system on screen keeps talking');
    assert.ok(!r.transmits().slice(before).some((m) => m.from === 'REGINA BEACON'), 'no beacon in jump');

    c.update(input(base));
    for (let t = 0; t < 120_000 && r.transmits().at(-1).from !== 'REGINA BEACON'; t += 250) {
        if (r.isPending()) r.complete();
        r.advance(250);
    }
    assert.equal(r.transmits().at(-1).from, 'REGINA BEACON', 'out of jump is an arrival');
    assert.equal(c.state(), 'speaking');
    c.update(input(base, { truthVersion: 'tv2' }));
    assert.equal(c.state(), 'dead-air');
    assert.deepEqual(r.calls.at(-1), ['idle', null]);
    c.destroy();
});

test('the beacon plays once per real arrival', () => {
    const r = rig();
    const c = make(r);
    c.update(input(base));
    for (let i = 0; i < 20; i++) c.update(input(base));
    r.drive(600_000);
    assert.equal(r.transmits().filter((m) => m.from === 'REGINA BEACON').length, 1);
    c.update(input({ ...base, party: 'away' }));
    c.update(input(base));
    r.drive(5_000);
    assert.equal(r.transmits().filter((m) => m.from === 'REGINA BEACON').length, 2);
    c.destroy();
    const c2 = make(r);
    c2.update(input(base));
    r.drive(5_000);
    assert.equal(r.transmits().filter((m) => m.from === 'REGINA BEACON').length, 2, 'a remount is not an arrival');
    c2.destroy();
});

test('a hidden tab pauses the clock and leaves no backlog', () => {
    const r = rig();
    const c = make(r);
    r.map.set(historyKey(base.hexKey, 'tv1'), JSON.stringify({ eventIndex: 0, recent: [], lastParty: 'docked' }));
    c.update(input(base));
    r.setVisible(false);
    r.drive(7_200_000, 5000);
    assert.equal(r.transmits().length, 0);
    assert.equal(r.timers.size, 0, 'no timer runs while hidden');
    r.setVisible(true);
    r.advance(GAP_SECONDS.busy[1] * 1000);
    assert.equal(r.transmits().length, 1, 'one event, not two hours of them');
    r.setVisible(false);
    r.complete();
    r.advance(60_000);
    assert.equal(c.state(), 'speaking', 'a transcript finished while hidden waits');
    r.setVisible(true);
    assert.notEqual(c.state(), 'speaking');
    c.destroy();
});

test('history persists: the event index only climbs and recent ids do not repeat', () => {
    const r = rig();
    const c = make(r);
    c.update(input(base));
    r.drive(3_600_000);
    c.destroy();
    const h1 = JSON.parse(r.map.get(historyKey(base.hexKey, 'tv1')));
    assert.ok(h1.eventIndex >= 40, String(h1.eventIndex));
    assert.ok(h1.recent.length <= TIMING.recentMax);
    assert.equal(new Set(h1.recent).size, h1.recent.length);
    const c2 = make(r);
    c2.update(input(base));
    r.drive(600_000);
    c2.destroy();
    const h2 = JSON.parse(r.map.get(historyKey(base.hexKey, 'tv1')));
    assert.ok(h2.eventIndex > h1.eventIndex);
    assert.equal(new Set(h2.recent).size, h2.recent.length);
});

test('a starved pool forgets its oldest half instead of going silent for good', () => {
    const r = rig();
    const tiny = { ...base, starport: 'X', pop: 0, highport: false, bases: '', xboat: false, gasGiants: 0, belts: 0, otherBodies: 0, moons: 0, tradeCodes: ['Ba'], bodies: {}, party: 'inSystem' };
    const c = createCommsController({ screen: r.screen, clock: r.clock, store: r.store, visibility: r.visibility, lines: () => [] });
    c.update(input(tiny));
    r.drive(12 * 3_600_000, 1000);
    c.destroy();
    const n = r.transmits().length;
    assert.ok(n >= 100, String(n));
    const h = JSON.parse(r.map.get(historyKey(tiny.hexKey, 'tv1')));
    assert.ok(h.recent.length >= 1 && h.recent.length <= 5, String(h.recent.length));
});

test('destroy stops everything and leaves the screen to its owner', () => {
    const r = rig();
    const c = make(r);
    c.update(input(base));
    r.advance(TIMING.beaconDelayMs);
    c.destroy();
    assert.equal(r.timers.size, 0);
    r.drive(600_000);
    assert.equal(r.transmits().length, 1);
    assert.ok(!r.calls.some((x) => x[0] === 'destroy'));
    c.update(input(base));
    r.drive(600_000);
    assert.equal(r.transmits().length, 1);
});

test('Beowulf plays all four segments once per campaign', () => {
    let hexKey = null;
    for (let i = 0; i < 100_000 && !hexKey; i++) if (beowulfHash('camp', `S/${i}`) % 2048 === 0) hexKey = `S/${i}`;
    const facts = { ...base, hexKey, starport: 'C', highport: false, pop: 6 };
    const r = rig();
    const c = make(r);
    c.update(input(facts));
    r.drive(600_000);
    c.destroy();
    const archive = r.transmits().filter((m) => m.ch === 'CH --');
    assert.deepEqual(archive.map((m) => m.text), [...BEOWULF_SEGMENTS]);
    assert.equal(r.map.get(beowulfStorageKey('camp')), '1');
    const all = r.transmits();
    const first = all.findIndex((m) => m.ch === 'CH --');
    assert.deepEqual(all.slice(first, first + 4).map((m) => m.ch), ['CH --', 'CH --', 'CH --', 'CH --'], 'nothing interleaves');
    const c2 = make(r);
    c2.update(input({ ...facts, party: 'away' }));
    c2.update(input(facts));
    r.drive(600_000);
    c2.destroy();
    assert.equal(r.transmits().filter((m) => m.ch === 'CH --').length, 4);
});

const themesOf = (r) => r.calls.filter((c) => c[0] === 'theme').map((c) => c[1]);

function quietHex() {
    for (let i = 0; i < 5000; i++) if (beowulfHash('camp', `Quiet/${i}`) % 2048 !== 0) return `Quiet/${i}`;
    return 'Quiet/0';
}

test('mayday plays Beowulf at 3s, skips the roll and the once-only flag', () => {
    const r = rig();
    r.map.set(beowulfStorageKey('camp'), '1');
    const c = make(r);
    c.update(input(base, { mayday: true, shown: false }));
    r.advance(TIMING.maydayDelayMs - 1);
    assert.equal(r.transmits().length, 0);
    assert.deepEqual(themesOf(r), []);
    r.advance(1);
    assert.equal(r.transmits()[0].text, BEOWULF_SEGMENTS[0]);
    assert.equal(r.transmits()[0].type, 'EMERGENCY');
    assert.equal(r.transmits()[0].ch, 'CH --');
    assert.equal(r.transmits()[0].status, 'PLAYBACK');
    assert.equal(r.transmits()[0].band, 'RECORDED SIGNAL');
    assert.deepEqual(themesOf(r), ['emergency']);
    assert.ok(r.calls.findIndex((c) => c[0] === 'theme') < r.calls.findIndex((c) => c[0] === 'transmit'));
    for (let i = 0; i < 4; i++) {
        assert.equal(r.transmits().length, i + 1);
        assert.deepEqual(themesOf(r), ['emergency']);
        r.complete();
        if (i < 3) r.advance(TIMING.dwellMaxMs);
    }
    r.advance(TIMING.keepLastMs + TIMING.clearMs);
    assert.deepEqual(r.transmits().map((m) => m.text), [...BEOWULF_SEGMENTS]);
    assert.deepEqual(themesOf(r), ['emergency', 'normal']);
    assert.equal(r.map.get(beowulfStorageKey('camp')), '1');
    const n = r.transmits().length;
    r.advance(60_000);
    assert.equal(r.transmits().length, n);
    c.destroy();
});

test('mayday does not write the flag when it was absent, and a second system does not replay it', () => {
    const r = rig();
    const c = make(r);
    c.update(input(base, { mayday: true, shown: true }));
    r.advance(TIMING.maydayDelayMs);
    assert.equal(r.transmits().length, 1);
    c.update(input({ ...base, hexKey: 'Other/1910' }, { mayday: true, shown: true }));
    r.advance(TIMING.maydayDelayMs);
    assert.equal(r.transmits().filter((m) => m.ch === 'CH --').length, 1);
    assert.equal(r.map.get(beowulfStorageKey('camp')) ?? null, null);
    c.destroy();
});

test('without mayday the archive does not start at 3s', () => {
    const hexKey = quietHex();
    const r = rig();
    const c = make(r);
    r.map.set(historyKey(hexKey, 'tv1'), JSON.stringify({ eventIndex: 0, recent: [], lastParty: 'docked' }));
    c.update(input({ ...base, hexKey }));
    r.advance(TIMING.maydayDelayMs);
    assert.equal(r.transmits().some((m) => m.ch === 'CH --'), false);
    r.drive(90_000);
    assert.equal(themesOf(r).includes('emergency'), false);
    c.destroy();
});

test('emergency returns to normal when the switch turns off, the truth changes, or the view unmounts; a jump does not cut it (ZC2)', () => {
    const leave = (patch) => {
        const r = rig();
        const c = make(r);
        c.update(input(base, { mayday: true, shown: true }));
        r.advance(TIMING.maydayDelayMs);
        assert.deepEqual(themesOf(r), ['emergency']);
        c.update(input({ ...base, ...patch.facts }, { mayday: true, shown: patch.shown, truthVersion: patch.truthVersion }));
        if (patch.destroy) c.destroy();
        assert.equal(themesOf(r).at(-1), 'normal');
        if (!patch.destroy) c.destroy();
    };
    {
        const r = rig();
        const c = make(r);
        c.update(input(base, { mayday: true, shown: true }));
        r.advance(TIMING.maydayDelayMs);
        c.update(input({ ...base, party: 'inJump' }, { mayday: true, shown: true }));
        assert.deepEqual(themesOf(r), ['emergency'], 'a jump does not cut the archive');
        r.drive(120_000);
        assert.equal(r.transmits().filter((m) => m.ch === 'CH --').length, 4);
        assert.equal(themesOf(r).at(-1), 'normal');
        c.destroy();
    }
    leave({ facts: {}, shown: false, truthVersion: 'tv1' });
    leave({ facts: {}, shown: true, truthVersion: 'tv2' });
    const r = rig();
    const c = make(r);
    c.update(input(base, { mayday: true, shown: true }));
    r.advance(TIMING.maydayDelayMs);
    c.destroy();
    assert.deepEqual(themesOf(r), ['emergency', 'normal']);
    assert.ok(!r.calls.some((x) => x[0] === 'destroy'));
});
