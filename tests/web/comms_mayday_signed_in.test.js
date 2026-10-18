/**
 * ZC3: `?mayday` survives the campaign arriving after the receiver mounts (Johnny
 * 2026-10-18 13:30). The archive counts as used only when it starts playing; a re-arm
 * keeps the first deadline, 3 s after the receiver came up. Fake clock, fake screen.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TIMING, createCommsController } from '../../apps/web/src/living/comms/controller.ts';
import { BEOWULF_SEGMENTS } from '../../apps/web/src/living/comms/beowulf.ts';
import { systemFacts } from '../../apps/web/src/living/facts.ts';

const CORE = {
    hexKey: 'Core/1623', sectorName: 'Core', day: 2,
    entry: { name: 'Core 1623', uwp: 'A867954-C', allegiance: 'ImSy', zone: '', bases: '', tradeCodes: ['Hi'], pbg: '111' },
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
    const archive = () => calls.filter((c) => c[0] === 'transmit' && c[1].ch === 'CH --').map((c) => ({ ...c[1], at: c[2] }));
    const themes = () => calls.filter((c) => c[0] === 'theme').map((c) => c[1]);
    const c = createCommsController({ screen, clock, store, visibility });
    return { c, advance, drive, archive, themes };
}

const away = () => ({ ...systemFacts(CORE), party: 'away' });
const docked = () => ({ ...systemFacts(CORE), party: 'docked' });
const input = (facts, extra = {}) => ({ facts, truthVersion: 'tv1', campaignKey: 'none', shown: true, mayday: true, ...extra });

test('the campaign arriving at 1 s: Beowulf still starts at 3 s', () => {
    for (const shown of [true, false]) {
        const r = rig();
        r.c.update(input(away(), { shown }));
        r.advance(1000);
        r.c.update(input(docked(), { campaignKey: 'u_campaign', shown }));
        r.advance(TIMING.maydayDelayMs - 1000 - 1);
        assert.equal(r.archive().length, 0);
        r.advance(1);
        assert.equal(r.archive()[0]?.at, TIMING.maydayDelayMs, `shown ${shown}: the first deadline holds`);
        assert.equal(r.archive()[0].text, BEOWULF_SEGMENTS[0]);
        r.drive(120_000);
        assert.equal(r.archive().length, 4);
        assert.deepEqual(r.themes(), ['emergency', 'normal']);
        r.c.destroy();
    }
});

test('changes inside the wait (campaign, truth, hex) re-arm it once, never twice', () => {
    const r = rig();
    r.c.update(input(away()));
    r.advance(500);
    r.c.update(input(docked(), { campaignKey: 'u_campaign' }));
    r.advance(500);
    r.c.update(input(docked(), { campaignKey: 'u_campaign', truthVersion: 'tv2' }));
    r.advance(500);
    r.c.update(input({ ...docked(), hexKey: 'Core/1624' }, { campaignKey: 'u_campaign', truthVersion: 'tv2' }));
    r.drive(120_000);
    assert.equal(r.archive().length, 4);
    assert.equal(r.archive()[0].at, TIMING.maydayDelayMs);
    r.c.destroy();
});

test('after it has played, a context change does not replay it', () => {
    const r = rig();
    r.c.update(input(away()));
    r.drive(120_000);
    assert.equal(r.archive().length, 4);
    r.c.update(input(docked(), { campaignKey: 'u_campaign' }));
    r.c.update(input(docked(), { campaignKey: 'u_other', truthVersion: 'tv2' }));
    r.c.update(input(null, { campaignKey: 'u_other' }));
    r.c.update(input(docked(), { campaignKey: 'u_other' }));
    r.drive(600_000);
    assert.equal(r.archive().length, 4);
    r.c.destroy();
});

test('no facts across the deadline (the campaign still loading): it plays as soon as facts return', () => {
    const r = rig();
    r.c.update(input(away()));
    r.advance(1000);
    r.c.update(input(null, { campaignKey: 'u_campaign' }));
    r.advance(4000);
    assert.equal(r.archive().length, 0);
    r.c.update(input(docked(), { campaignKey: 'u_campaign' }));
    r.advance(0);
    assert.equal(r.archive()[0]?.at, 5000);
    r.drive(120_000);
    assert.equal(r.archive().length, 4);
    r.c.destroy();
});

test('signed out, nothing changes: 3 s, as before', () => {
    const r = rig();
    r.c.update(input(away()));
    r.advance(TIMING.maydayDelayMs);
    assert.equal(r.archive()[0]?.at, TIMING.maydayDelayMs);
    r.drive(120_000);
    assert.equal(r.archive().length, 4);
    r.c.destroy();
});