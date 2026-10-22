import assert from 'node:assert/strict';
import { test } from 'node:test';
import { glitchedLines } from '../../apps/web/src/living/lines/glitched.ts';
import { receiverLines } from '../../apps/web/src/living/lines.ts';
import { corpusPool, nextCorpusEvent } from '../../apps/web/src/living/comms/corpus_events.ts';
import { messagesFor } from '../../apps/web/src/living/comms/controller.ts';

const base = {
    hexKey: 'Test/0101', name: 'Test', sector: 'Test', subsector: 'A',
    starport: 'C', size: 7, atm: 0, hydro: 0, pop: 6, gov: 5, law: 5, tl: 12,
    tradeCodes: [], zone: 'green', bases: '', highport: false,
    gasGiants: 0, belts: 1, moons: 0, otherBodies: 1, xboat: true,
    party: 'away', day: 1, bodies: {},
};

test('thirty authored glitches survive the event and message pipeline intact', () => {
    assert.equal(glitchedLines.length, 30);
    const all = receiverLines();
    assert.equal(new Set(all.map(l => l.id)).size, all.length);
    for (const line of glitchedLines) {
        assert.ok(all.some(l => l.id === line.id));
        assert.match(line.text, /\[[^\]]+\]|▯/);
        assert.equal(line.weight, 0.35);
        const ctx = { truthVersion: 'v1', day: 1, eventIndex: 0 };
        const event = nextCorpusEvent([line], base, ctx);
        assert.equal(event.channel, 'common');
        assert.equal(event.allowSignalNoise, false, 'do not add random corruption to an authored glitch');
        const messages = messagesFor(event);
        assert.equal(messages.map(m => m.text).join(' '), line.text);
        assert.ok(messages.every(m => m.type !== 'EMERGENCY'));
        assert.equal(nextCorpusEvent([line], base, { ...ctx, avoidIds: [event.id] }), null);
    }
});

test('glitches are ambient and respect their asset filters, including in vacuum', () => {
    for (const party of ['away', 'inJump', 'docked', 'inSystem']) {
        assert.equal(corpusPool(glitchedLines, { ...base, party }).length, 30);
    }
    assert.equal(corpusPool(glitchedLines, { ...base, belts: 0, xboat: false }).length, 20);
    assert.equal(corpusPool(glitchedLines, { ...base, pop: 0 }).length, 0);
});
