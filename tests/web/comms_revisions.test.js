import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ChatterLine } from '@voyage/shared';
import { corpusLines, receiverLines } from '../../apps/web/src/living/lines.ts';
import { spaceWeatherRevisions, textRevisions } from '../../apps/web/src/living/lines/revisions.ts';
import { corpusPool } from '../../apps/web/src/living/comms/corpus_events.ts';
import { nextProceduralEvent, proceduralPool } from '../../apps/web/src/living/comms/events.ts';

const base = {
    hexKey: 'Test/0101', name: 'Test', sector: 'Test', subsector: 'A',
    starport: 'A', size: 7, atm: 6, hydro: 7, pop: 8, gov: 5, law: 5, tl: 12,
    tradeCodes: [], zone: 'green', bases: '', highport: true,
    gasGiants: 1, belts: 1, moons: 0, otherBodies: 1, xboat: false,
    party: 'docked', day: 1, bodies: {},
};

test('editorial revisions preserve corpus identity and validate as complete chatter lines', () => {
    const source = new Map(corpusLines().map(l => [l.id, l]));
    const output = new Map(receiverLines().map(l => [l.id, l]));
    for (const id of [...Object.keys(textRevisions), ...Object.keys(spaceWeatherRevisions)]) {
        assert.ok(source.has(id), id);
        assert.notEqual(source.get(id).text, output.get(id).text, id);
        assert.equal(output.get(id).category, source.get(id).category, id);
        assert.ok(ChatterLine.safeParse(output.get(id)).success, id);
    }
});

test('space advisories reach vacuum worlds without dragging surface weather with them', () => {
    const vacuum = { ...base, atm: 0, hydro: 0 };
    const pool = corpusPool(receiverLines(), vacuum);
    const ids = new Set(pool.map(l => l.id));
    for (const id of Object.keys(spaceWeatherRevisions)) assert.ok(ids.has(id), id);
    assert.ok(!ids.has('weather-045'), 'tainted surface-air notice stays atmosphere-gated');
    assert.ok(!ids.has('weather-116'), 'ocean survey stays hydro/atmosphere-gated');
    for (const line of pool) assert.doesNotMatch(line.text, /\b(forklift|windsock|crosswind|rain gauge)\b/i);
});

test('rewritten multi-turn cargo and interference calls remain complete scenes', () => {
    for (const target of ['freight-crane', 'air-weather']) {
        const avoidIds = proceduralPool(base).filter(id => id !== `proc:${target}`);
        const event = nextProceduralEvent(base, { truthVersion: 'tv1', day: 1, eventIndex: 0, avoidIds });
        assert.equal(event.id, `proc:${target}`);
        assert.equal(event.turns.length, 3);
        assert.doesNotMatch(event.turns.map(t => t.text).join(' '), /forklift|crosswind|wind has shifted/i);
        if (target === 'air-weather') {
            assert.match(event.turns[1].text, /checksum verified/);
            assert.match(event.turns[2].text, /Approach confirmed/);
        }
    }
});
