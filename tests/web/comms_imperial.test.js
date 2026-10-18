import assert from 'node:assert/strict';
import { test } from 'node:test';
import { systemFacts } from '../../apps/web/src/living/facts.ts';
import { imperialLines } from '../../apps/web/src/living/lines/imperial.ts';
import { receiverLines } from '../../apps/web/src/living/lines.ts';
import { corpusPool, nextCorpusEvent, selectionWeight } from '../../apps/web/src/living/comms/corpus_events.ts';

const source = {
    hexKey: 'Core/2118', sectorName: 'Core', day: 1,
    entry: { name: 'Capital', uwp: 'A586A98-F', allegiance: 'ImDc', zone: '', bases: '', tradeCodes: ['Hi', 'Cx'], pbg: '111' },
};
const capital = systemFacts(source);

test('Core codes resolve without base metadata, while custom codes and explicit metadata stay authoritative', () => {
    assert.equal(capital.allegianceBase, 'Im');
    assert.equal(systemFacts({ ...source, entry: { ...source.entry, allegiance: 'ImSy' } }).allegianceBase, 'Im');
    assert.equal(systemFacts({ ...source, entry: { ...source.entry, allegiance: 'ImMadeUp' } }).allegianceBase, '');
    assert.equal(systemFacts({ ...source, allegiances: [{ code: 'ImDc', base: 'Custom' }] }).allegianceBase, 'Custom');
});

test('capital designation survives loading generated economic codes', () => {
    const loaded = systemFacts({ ...source, state: { mgt2eData: { tradeCodes: ['Hi', 'In'] } } });
    assert.ok(loaded.tradeCodes.includes('Cx'));
    assert.equal(corpusPool(imperialLines, loaded).length, 48);
    const ordinary = systemFacts({ ...source, entry: { ...source.entry, tradeCodes: ['Hi'] }, state: { mgt2eData: { tradeCodes: ['Hi'] } } });
    assert.ok(!ordinary.tradeCodes.includes('Cx'));
});

test('all 48 new Imperial lines play as ambient traffic; 24 are reserved for the capital designation', () => {
    assert.equal(imperialLines.length, 48);
    for (const party of ['away', 'inJump', 'docked', 'inSystem']) {
        assert.equal(corpusPool(imperialLines, { ...capital, party }).length, 48);
    }
    for (const tradeCodes of [[], ['Cp'], ['Cs']]) {
        assert.equal(corpusPool(imperialLines, { ...capital, tradeCodes }).length, 24);
    }
    for (const allegiance of ['', 'Zh', 'As', 'Na']) {
        assert.equal(corpusPool(imperialLines, { ...capital, allegiance, allegianceBase: '' }).length, 0);
    }
    assert.equal(corpusPool(imperialLines, { ...capital, starport: 'X' }).length, 0);
});

test('Imperial lines get exactly twice their original draw weight without changing unrelated weights', () => {
    const line = imperialLines[0];
    assert.equal(selectionWeight(line, capital), 2);
    assert.equal(selectionWeight({ ...line, weight: 0.25 }, capital), 0.5);
    assert.equal(selectionWeight({ ...line, when: {} }, capital), 1);
    assert.equal(selectionWeight(line, { ...capital, allegiance: 'Zh', allegianceBase: '' }), 1);
});

test('the complete pool selects the additions and keeps their speaker, slots and cooldown identities', () => {
    const all = receiverLines();
    assert.equal(new Set(all.map(l => l.id)).size, all.length);
    const pool = corpusPool(all, capital);
    const newIds = new Set(imperialLines.map(l => `line:${l.id}`));
    const seen = new Set();
    for (let eventIndex = 0; eventIndex < 1000; eventIndex++) {
        const ctx = { truthVersion: 'tv1', day: 1, eventIndex, avoidIds: [...seen] };
        const event = nextCorpusEvent(pool, capital, ctx);
        if (!event) break;
        if (newIds.has(event.id)) {
            assert.doesNotMatch(event.turns[0].speaker + event.turns[0].text, /[{}]/);
            assert.equal(event.channel, 'services');
        }
        assert.ok(!seen.has(event.id));
        seen.add(event.id);
    }
    for (const id of newIds) assert.ok(seen.has(id), id);
});
