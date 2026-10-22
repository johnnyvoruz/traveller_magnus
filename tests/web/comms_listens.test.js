/**
 * ZC2: the receiver listens to the system on screen (Johnny 2026-10-18 11:55 and 11:57,
 * decisions 11:55 and 11:57). Fake clock, fake screen, fake store, fake visibility; the
 * real corpus and the real scenes. Regina is the chart row for Spinward Marches 1910.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TIMING, createCommsController } from '../../apps/web/src/living/comms/controller.ts';
import { BEOWULF_SEGMENTS } from '../../apps/web/src/living/comms/beowulf.ts';
import { systemFacts } from '../../apps/web/src/living/facts.ts';
import { receiverLines } from '../../apps/web/src/living/lines.ts';

const REGINA = {
    hexKey: 'Spinward_Marches/1910', sectorName: 'Spinward Marches', day: 2,
    entry: { name: 'Regina', uwp: 'A788899-C', allegiance: 'ImDd', zone: '', bases: 'NS', tradeCodes: ['Ri', 'Pa', 'Ph'], pbg: '703' },
};
const EFATE = {
    hexKey: 'Spinward_Marches/1705', sectorName: 'Spinward Marches', day: 2,
    entry: { name: 'Efate', uwp: 'A646930-D', allegiance: 'ImDd', zone: '', bases: 'NS', tradeCodes: ['Hi', 'In'], pbg: '701' },
};
const BEACON = 'REGINA BEACON';

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
        transmit: (m) => { calls.push(['transmit', m, now]); pending = true; },
        idle: (o) => { calls.push(['idle', o ?? null, now]); },
        onTranscriptComplete: (cb) => { completeCb = cb; },
        theme: (mode) => { calls.push(['theme', mode, now]); },
        destroy: () => {},
    };
    const map = new Map();
    const store = { get: (k) => (map.has(k) ? map.get(k) : null), set: (k, v) => { map.set(k, v); } };
    const visibility = { visible: () => true, onChange: () => () => {} };
    const drive = (ms, step = 250) => {
        for (let t = 0; t < ms; t += step) { if (pending) { pending = false; completeCb(); } advance(step); }
    };
    const transmits = () => calls.filter((c) => c[0] === 'transmit').map((c) => ({ ...c[1], at: c[2] }));
    const c = createCommsController({ screen, clock, store, visibility });
    return { c, drive, advance, transmits, calls, map, now: () => now };
}

const input = (facts, extra = {}) => ({ facts, truthVersion: 'tv1', campaignKey: 'none', shown: true, ...extra });

test('signed out, no campaign: Regina talks within the first minute', () => {
    const facts = systemFacts(REGINA);
    assert.equal(facts.party, 'away');
    const r = rig();
    r.c.update(input(facts));
    r.drive(60_000);
    const heard = r.transmits();
    assert.ok(heard.length > 0, 'dead air for the first minute');
    assert.ok(heard[0].at <= 60_000);
    assert.ok(!heard.some((m) => m.from === BEACON), 'the beacon is for the party');
    r.c.destroy();
});

test('switching systems keeps the lines coming', () => {
    const r = rig();
    r.c.update(input(systemFacts(REGINA)));
    r.drive(60_000);
    const before = r.transmits().length;
    assert.ok(before > 0);
    r.c.update(input(systemFacts(EFATE)));
    r.drive(60_000);
    const after = r.transmits().slice(before);
    assert.ok(after.length > 0, 'Efate is dead air');
    r.c.destroy();
});

test('a campaign with the party away: ambient lines, nothing addressed to the party', () => {
    const facts = { ...systemFacts(REGINA), party: 'away' };
    const r = rig();
    r.c.update(input(facts, { campaignKey: 'camp' }));
    r.drive(1_800_000);
    const heard = r.transmits();
    assert.ok(heard.length >= 10, `only ${heard.length} lines in half an hour`);
    assert.ok(!heard.some((m) => m.from === BEACON));
    r.c.destroy();
});

test('ZC4: signed out on Regina, a line written for the party is on air within ten minutes', () => {
    const facts = systemFacts(REGINA);
    assert.equal(facts.party, 'away');
    const forParty = new Set(receiverLines().filter((line) => line.when.party).map((line) => `line:${line.id}`));
    const r = rig();
    r.c.update(input(facts));
    const aired = new Set();
    for (let t = 0; t < 600_000; t += 10_000) {
        r.drive(10_000);
        for (const value of r.map.values()) {
            const recent = JSON.parse(value).recent;
            if (Array.isArray(recent)) for (const id of recent) aired.add(id);
        }
    }
    const hits = [...aired].filter((id) => forParty.has(id));
    assert.ok(hits.length > 0, `none of ${aired.size} events was a party line`);
    assert.ok(!r.transmits().some((m) => m.from === BEACON), 'the beacon is still for the party');
    r.c.destroy();
});

test('the party arriving while the view is on air: the beacon once', () => {
    const away = { ...systemFacts(REGINA), party: 'away' };
    const r = rig();
    r.c.update(input(away, { campaignKey: 'camp' }));
    r.drive(120_000);
    const before = r.transmits().length;
    assert.ok(before > 0);
    r.c.update(input({ ...away, party: 'inSystem' }, { campaignKey: 'camp' }));
    for (let i = 0; i < 20; i++) r.c.update(input({ ...away, party: 'inSystem' }, { campaignKey: 'camp' }));
    r.c.update(input({ ...away, party: 'docked' }, { campaignKey: 'camp' }));
    r.drive(600_000);
    // One welcome event; a long one splits at sentences into more than one message.
    const beacons = r.transmits().slice(before).filter((m) => m.from === BEACON && m.text.startsWith('Welcome to Regina'));
    assert.equal(beacons.length, 1, 'inSystem then docked is one arrival');
    assert.equal(beacons[0].at - 120_000, TIMING.beaconDelayMs, 'the beacon follows the arrival'); 
    r.c.destroy();
});

test('mayday with no ship: Beowulf at 3 s, red, then back to teal', () => {
    for (const shown of [true, false]) {
        const r = rig();
        r.c.update(input({ ...systemFacts(REGINA), party: 'away' }, { mayday: true, shown }));
        r.advance(TIMING.maydayDelayMs - 1);
        assert.equal(r.transmits().length, 0);
        r.advance(1);
        const [first] = r.transmits();
        assert.equal(first.ch, 'CH --');
        assert.equal(first.text, BEOWULF_SEGMENTS[0]);
        assert.equal(first.at, TIMING.maydayDelayMs);
        r.drive(120_000);
        const themes = r.calls.filter((c) => c[0] === 'theme').map((c) => c[1]);
        assert.deepEqual(themes, ['emergency', 'normal'], `shown ${shown}`);
        assert.equal(r.transmits().filter((m) => m.ch === 'CH --').length, 4);
        r.c.destroy();
    }
});