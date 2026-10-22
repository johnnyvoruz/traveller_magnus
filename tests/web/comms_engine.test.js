/**
 * ZC1: the comms engine without timers. Procedural scenes, the corpus adapter,
 * the mixer, the cadence, the roster and the Beowulf archive.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { corpusLines, receiverLines } from '../../apps/web/src/living/lines.ts';
import {
    BLOCKED, PLAYABLE, EXCLUDED, SHIP_ALLOWED, SHIP_NEEDS_STAFF, corpusPool, nextCorpusEvent, resolveSlots,
} from '../../apps/web/src/living/comms/corpus_events.ts';
import {
    GAP_SECONDS, cadenceOf, nextProceduralEvent, proceduralPool, suggestedGapSeconds, welcomeFor,
} from '../../apps/web/src/living/comms/events.ts';
import { mixEvent } from '../../apps/web/src/living/comms/mixer.ts';
import { ROSTER_SIZE, rosterFor } from '../../apps/web/src/living/comms/roster.ts';
import {
    BEOWULF_QUOTE, BEOWULF_SEGMENTS, beowulfEvent, beowulfHash, shouldQueueBeowulf,
} from '../../apps/web/src/living/comms/beowulf.ts';
import { messagesFor, splitUtterance } from '../../apps/web/src/living/comms/controller.ts';

const base = {
    hexKey: 'Test_Sector/0101', name: 'Regina', sector: 'Test Sector', subsector: 'Test',
    size: 7, atm: 6, hydro: 7, pop: 8, gov: 5, law: 4, tl: 12,
    tradeCodes: ['Ri'], zone: 'green', bases: '', highport: false,
    gasGiants: 1, belts: 1, moons: 1, otherBodies: 3, xboat: false,
    party: 'docked', day: 2,
    bodies: { gasGiant: 'Regina II', belt: 'Regina Belt', moon: 'Regina-a', body: 'Regina I' },
};
const WORLDS = {
    A: { ...base, starport: 'A', highport: true, bases: 'NS', xboat: true, pop: 9, tradeCodes: ['Hi', 'Ri'] },
    B: { ...base, starport: 'B', highport: true, bases: 'W', law: 7, tradeCodes: ['In'], atm: 4 },
    C: { ...base, starport: 'C', bases: 'S', pop: 6, law: 2, tradeCodes: ['Ag'] },
    D: { ...base, starport: 'D', pop: 4, law: 0, gov: 0, hydro: 1, atm: 3, tradeCodes: ['Po', 'Ni'], gasGiants: 0, bodies: { belt: 'Regina Belt', moon: 'Regina-a', body: 'Regina I' } },
    E: { ...base, starport: 'E', pop: 2, law: 1, gov: 1, hydro: 0, atm: 0, tradeCodes: ['Lo', 'Va'], belts: 0, moons: 0, bodies: { gasGiant: 'Regina II', body: 'Regina I' } },
    X: { ...base, starport: 'X', pop: 0, law: 0, gov: 0, tl: 0, tradeCodes: ['Ba'], zone: 'red', otherBodies: 0, moons: 0, belts: 0, gasGiants: 0, bodies: {} },
};
const LINES = receiverLines();
const ctx = (i, extra = {}) => ({ truthVersion: 'tv1', day: 2, eventIndex: i, ...extra });

function sample(f, n = 400) {
    const pool = corpusPool(LINES, f);
    const out = [];
    for (let i = 0; i < n; i++) {
        const ev = mixEvent(f, ctx(i), pool);
        if (ev) out.push(ev);
    }
    return out;
}

// The package stays local; Johnny holds it out of the push (ZF1). A fresh checkout skips this one.
const PACKAGE_CORPUS = 'assets/Traveller_Living_Systems_Comms_FINAL/Traveller_Comms_Complete_Handoff/content/corpus.json';
const packageSkip = existsSync(PACKAGE_CORPUS) ? false : `${PACKAGE_CORPUS} is absent (the comms package is not committed)`;

test('the shipped corpus is the package corpus, byte for byte', { skip: packageSkip }, () => {
    const shipped = readFileSync('apps/web/src/living/lines/corpus.json');
    const pkg = readFileSync(PACKAGE_CORPUS);
    assert.ok(shipped.equals(pkg));
    assert.equal(corpusLines().length, 1178);
});

test('every audited id names a real corpus line', () => {
    const ids = new Set(receiverLines().map((line) => line.id));
    for (const id of [...EXCLUDED, ...SHIP_ALLOWED, ...SHIP_NEEDS_STAFF]) assert.ok(ids.has(id), id);
    for (const id of SHIP_NEEDS_STAFF) assert.ok(SHIP_ALLOWED.has(id), id);
});

// ZC2 (Johnny 2026-10-18 11:55, 11:57): the view listens to the system on screen.
// ZC4 (Johnny 14:44, "all comms play no matter if ship is in system or not"): the lines written for the party too.
test('away and in jump every line still plays, the party lines included; only the beacon waits for the party', () => {
    let partyLines = 0;
    for (const [port, f] of Object.entries(WORLDS)) {
        const here = corpusPool(LINES, f).map((line) => line.id);
        for (const party of ['away', 'inJump']) {
            const g = { ...f, party };
            assert.equal(welcomeFor(g, 'tv1'), null, `${port} ${party}: no beacon`);
            const pool = corpusPool(LINES, g);
            partyLines += pool.filter((line) => line.when.party).length;
            assert.ok(pool.every((line) => !line.when.party || line.when.party.includes('inSystem') || line.when.party.includes('docked')), `${port} ${party}: an in-jump log on the radio`);
            assert.deepEqual(pool.map((line) => line.id), here, `${port} ${party}: the same lines as with the party here`);
            for (let i = 0; i < 50; i++) assert.deepEqual(nextProceduralEvent(g, ctx(i)), nextProceduralEvent(f, ctx(i)));
            if ('ABCD'.includes(port)) assert.ok(sample(g, 50).length > 0, `${port} ${party}: dead air`);
        }
    }
    assert.ok(partyLines > 0, 'no line written for the party plays with the party away');
});

test('rumour, distress and news never reach the air; commercials use the reviewed pool', () => {
    for (const f of Object.values(WORLDS)) {
        const pool = corpusPool(LINES, f);
        for (const line of pool) {
            assert.ok(!BLOCKED.includes(line.category), line.id);
            assert.ok(!EXCLUDED.has(line.id), line.id);
            if (line.category === 'ship') assert.ok(SHIP_ALLOWED.has(line.id), line.id);
            assert.doesNotMatch(line.text, /firearms|weapons|armour/i, line.id);
            assert.notEqual(resolveSlots(line.text, f, ['Lark 2', 'Tern 3']), null, line.id);
            assert.doesNotMatch(resolveSlots(line.text, f, ['Lark 2', 'Tern 3']), /[{}]/, line.id);
        }
        for (const ev of sample(f)) {
            assert.match(ev.id, /^(proc|line):/);
            if (ev.id.startsWith('line:')) assert.ok(PLAYABLE.includes(ev.family), ev.id);
        }
    }
});

test('every world hears something, and a busy port hears plenty', () => {
    for (const [code, f] of Object.entries(WORLDS)) {
        assert.ok(proceduralPool(f).length > 0, code);
        assert.ok(sample(f, 50).length > 0, code);
    }
    assert.ok(proceduralPool(WORLDS.A).length + corpusPool(LINES, WORLDS.A).length >= 150);
});

test('an X port has no tower, no customs, no port offices', () => {
    const f = WORLDS.X;
    assert.equal(welcomeFor(f, 'tv1'), null);
    const pool = corpusPool(LINES, f);
    assert.equal(pool.filter((line) => line.category === 'customs' || line.category === 'weather').length, 0);
    for (const ev of sample(f)) {
        assert.ok(!['approach', 'dock', 'customs', 'security', 'cargo', 'environment'].includes(ev.family), ev.id);
        for (const turn of ev.turns) assert.doesNotMatch(turn.speaker, /Control|Highport|Customs|Field|Ground|Freight|Desk|Exchange|Weather/, ev.id);
    }
});

test('an E port has no formal approach control', () => {
    for (const ev of sample(WORLDS.E)) {
        assert.ok(!['approach', 'dock', 'customs', 'security'].includes(ev.family), ev.id);
        for (const turn of ev.turns) assert.doesNotMatch(turn.speaker, /Control$|Highport|Customs/, ev.id);
    }
    assert.match(welcomeFor(WORLDS.E, 'tv1').turns[0].text, /No positive traffic control/);
});

test('no highport operations without a highport', () => {
    for (const f of [WORLDS.C, WORLDS.D, { ...WORLDS.A, highport: null }]) {
        for (const ev of sample(f)) {
            assert.notEqual(ev.family, 'dock', ev.id);
            for (const turn of ev.turns) assert.doesNotMatch(turn.text + turn.speaker, /highport/i, ev.id);
        }
    }
    assert.ok(sample(WORLDS.A).some((ev) => ev.family === 'dock'));
});

test('no air weather in vacuum', () => {
    for (const ev of sample(WORLDS.E)) {
        assert.notEqual(ev.family, 'environment', ev.id);
        assert.doesNotMatch(ev.turns.map((t) => t.text).join(' '), /\b(wind|rain|fog|storm|swell|crosswind)\b/i, ev.id);
    }
});

test('the same inputs make the same event; another index makes another', () => {
    const f = WORLDS.A;
    const pool = corpusPool(LINES, f);
    assert.deepEqual(mixEvent(f, ctx(7), pool), mixEvent(f, ctx(7), pool));
    const ids = new Set();
    for (let i = 0; i < 40; i++) ids.add(mixEvent(f, ctx(i), pool).id);
    assert.ok(ids.size >= 20, String(ids.size));
});

test('callsigns are stable by system and truth version', () => {
    const a = rosterFor('Test_Sector/0101', 'tv1');
    assert.equal(a.length, ROSTER_SIZE);
    assert.equal(new Set(a).size, ROSTER_SIZE);
    assert.deepEqual(rosterFor('Test_Sector/0101', 'tv1'), a);
    assert.notDeepEqual(rosterFor('Test_Sector/0101', 'tv2'), a);
    assert.notDeepEqual(rosterFor('Test_Sector/0102', 'tv1'), a);
    const speakers = new Set();
    for (let i = 0; i < 300; i++) {
        const ev = nextProceduralEvent({ ...WORLDS.A, day: 1 + (i % 9) }, ctx(i, { day: 1 + (i % 9) }));
        for (const turn of ev.turns) if (/ \d+$/.test(turn.speaker) && !/^Tug /.test(turn.speaker)) speakers.add(turn.speaker);
    }
    for (const s of speakers) assert.ok(a.includes(s), s);
});

test('avoid lists are honoured, and an exhausted pool gives quiet, not a repeat', () => {
    const f = WORLDS.X;
    const all = proceduralPool(f);
    assert.equal(nextProceduralEvent(f, ctx(1, { avoidIds: all })), null);
    const pool = corpusPool(LINES, f);
    assert.equal(nextCorpusEvent(pool, f, ctx(1, { avoidIds: pool.map((l) => `line:${l.id}`) })), null);
    assert.equal(mixEvent(f, ctx(1, { avoidIds: [...all, ...pool.map((l) => `line:${l.id}`)] }), pool), null);
});

test('the gap follows the cadence bands', () => {
    assert.equal(cadenceOf(WORLDS.A), 'busy');
    assert.equal(cadenceOf(WORLDS.C), 'ordinary');
    assert.equal(cadenceOf(WORLDS.E), 'quiet');
    assert.equal(cadenceOf(WORLDS.X), 'quiet');
    for (const f of Object.values(WORLDS)) {
        const [min, max] = GAP_SECONDS[cadenceOf(f)];
        for (let i = 0; i < 100; i++) {
            const g = suggestedGapSeconds(f, 'tv1', 2, i);
            assert.ok(g >= min && g <= max, `${f.starport} ${g}`);
        }
    }
});

test('the welcome speaks only where someone is there to say it', () => {
    assert.match(welcomeFor(WORLDS.A, 'tv1').turns[0].text, /Highport arrivals/);
    assert.match(welcomeFor(WORLDS.C, 'tv1').turns[0].text, /Arrivals call Regina approach/);
    assert.equal(welcomeFor({ ...WORLDS.D, pop: 0 }, 'tv1'), null);
    assert.equal(welcomeFor({ ...WORLDS.E, pop: 0 }, 'tv1'), null);
    assert.deepEqual(welcomeFor(WORLDS.A, 'tv1'), welcomeFor(WORLDS.A, 'tv1'));
    assert.equal(welcomeFor(WORLDS.A, 'tv1').channel, 'traffic-advisory');
});

test('Beowulf is verbatim, rare, gated and one event', () => {
    assert.equal(BEOWULF_SEGMENTS.join(' '), BEOWULF_QUOTE);
    let hits = 0;
    let hitKey = null;
    for (let i = 0; i < 20480; i++) {
        if (beowulfHash('camp', `S/${i}`) % 2048 === 0) { hits += 1; hitKey ??= `S/${i}`; }
    }
    assert.ok(hits >= 3 && hits <= 25, String(hits));
    const gate = { campaignKey: 'camp', hexKey: hitKey, party: 'docked', starport: 'C', alreadyPlayed: false };
    assert.equal(shouldQueueBeowulf(gate), true);
    assert.equal(shouldQueueBeowulf({ ...gate, alreadyPlayed: true }), false);
    assert.equal(shouldQueueBeowulf({ ...gate, starport: 'X' }), false);
    assert.equal(shouldQueueBeowulf({ ...gate, party: 'inJump' }), true, 'ZC4: the roll needs no party');
    assert.equal(shouldQueueBeowulf({ ...gate, party: 'away' }), true, 'ZC4: the roll needs no party');
    assert.equal(shouldQueueBeowulf({ ...gate, campaignKey: '' }), false);
    const event = beowulfEvent();
    assert.equal(event.theme, 'emergency');
    assert.equal(event.recordOnce, undefined);
    assert.equal(beowulfEvent({ recordOnce: false }).recordOnce, false);
    const msgs = messagesFor(event);
    assert.deepEqual(msgs.map((m) => m.text), [...BEOWULF_SEGMENTS]);
    for (const m of msgs) {
        assert.equal(m.ch, 'CH --');
        assert.equal(m.type, 'EMERGENCY');
        assert.equal(m.from, 'FREE TRADER BEOWULF');
        assert.equal(m.status, 'PLAYBACK');
        assert.equal(m.band, 'RECORDED SIGNAL');
    }
});

test('a long utterance splits at sentence ends, inside the event', () => {
    const long = 'Inbound traffic, hold at the outer marker until cleared. The pad crew is still moving the fuel cart off the apron. Expect a vector within ten minutes. Report when you have the beacon in sight.';
    const parts = splitUtterance(long);
    assert.ok(parts.length >= 2);
    for (const p of parts) assert.match(p, /[.!?]$/);
    assert.equal(parts.join(' '), long);
    assert.deepEqual(splitUtterance('Short line.'), ['Short line.']);
    const ev = { id: 'proc:x', family: 'cargo', channel: 'common', turns: [{ speaker: 'Lark 2', text: long }], allowSignalNoise: true };
    const msgs = messagesFor(ev);
    assert.equal(msgs.length, parts.length);
    for (const m of msgs) assert.equal(m.from, 'LARK 2');
});
