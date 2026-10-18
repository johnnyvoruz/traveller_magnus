import assert from 'node:assert/strict';
import { test } from 'node:test';
import { travellerLines } from '../../apps/web/src/living/lines/traveller.ts';
import { receiverLines } from '../../apps/web/src/living/lines.ts';
import { corpusPool, nextCorpusEvent, selectionWeight } from '../../apps/web/src/living/comms/corpus_events.ts';

const base = {
    hexKey: 'Test/0101', name: 'Test', sector: 'Test', subsector: 'A',
    starport: 'A', size: 7, atm: 6, hydro: 7, pop: 8, gov: 5, law: 5, tl: 12,
    tradeCodes: [], zone: 'green', bases: 'S', highport: true,
    gasGiants: 1, belts: 1, moons: 0, otherBodies: 1, xboat: true,
    party: 'away', day: 1, bodies: {}, allegiance: 'Im', allegianceBase: 'Im',
};

test('fifty additions have unique IDs and all are reachable by ambient listeners', () => {
    assert.equal(travellerLines.length, 50);
    const all = receiverLines();
    assert.equal(new Set(all.map(l => l.id)).size, all.length);
    for (const line of travellerLines) {
        const f = { ...base, allegiance: line.when.allegiance?.[0] ?? 'Im', allegianceBase: '' };
        for (const party of ['away', 'inJump', 'inSystem', 'docked']) {
            assert.equal(corpusPool([line], { ...f, party }).length, 1, line.id);
        }
        const ctx = { truthVersion: 'v1', day: 1, eventIndex: 0 };
        const event = nextCorpusEvent([line], f, ctx);
        assert.ok(event.turns[0].text.length > 0);
        assert.equal(nextCorpusEvent([line], f, { ...ctx, avoidIds: [event.id] }), null);
    }
});

test('world features and allegiance filter the additions without changing Imperial emphasis', () => {
    const ids = f => new Set(corpusPool(travellerLines, f).map(l => l.id));
    assert.equal(ids(base).size, 45);
    const sparse = ids({ ...base, bases: '', xboat: false, belts: 0, gasGiants: 0 });
    for (const id of ['ship-465', 'ship-470', 'ship-475', 'ship-480', 'ship-490']) assert.ok(!sparse.has(id));
    assert.ok(sparse.has('ship-450'));
    const aslan = ids({ ...base, allegiance: 'As', allegianceBase: 'As' });
    assert.ok(aslan.has('ship-490'));
    assert.ok(!aslan.has('ship-485'));
    assert.equal(selectionWeight(travellerLines.find(l => l.id === 'ship-485'), base), 2);
    assert.equal(ids({ ...base, pop: 0 }).size, 0);
});
