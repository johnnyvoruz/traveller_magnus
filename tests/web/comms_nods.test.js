import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nodLines } from '../../apps/web/src/living/lines/nods.ts';
import { receiverLines } from '../../apps/web/src/living/lines.ts';
import { corpusPool, nextCorpusEvent, selectionWeight } from '../../apps/web/src/living/comms/corpus_events.ts';

const base = {
    hexKey: 'Test/0101', name: 'Test', sector: 'Test', subsector: 'A',
    starport: 'C', size: 7, atm: 6, hydro: 7, pop: 8, gov: 5, law: 5, tl: 12,
    tradeCodes: [], zone: 'green', bases: 'N', highport: false,
    gasGiants: 1, belts: 1, moons: 0, otherBodies: 1, xboat: true,
    party: 'away', day: 1, bodies: {}, allegiance: 'Im', allegianceBase: 'Im',
};

test('thirty quiet genre nods are integrated, unique and audible to ambient listeners', () => {
    assert.equal(nodLines.length, 30);
    const all = receiverLines();
    assert.equal(new Set(all.map(l => l.id)).size, all.length);
    assert.equal(corpusPool(nodLines, base).length, 30);
    for (const line of nodLines) {
        assert.ok(all.some(l => l.id === line.id));
        assert.ok(line.weight <= 0.5);
        assert.doesNotMatch(line.text, /Starship Troopers|Firefly|Battlestar|Star Wars|Skywalker|Galactica|Serenity/);
        const ctx = { truthVersion: 'v1', day: 1, eventIndex: 0 };
        const event = nextCorpusEvent([line], base, ctx);
        assert.equal(nextCorpusEvent([line], base, { ...ctx, avoidIds: [event.id] }), null);
        if (line.category === 'advert') {
            assert.equal(event.turns[0].speaker, 'Imperial Careers');
            assert.equal(selectionWeight(line, base), 0.5);
        }
    }
});

test('recruitment and fleet nods require a naval base, with recruitment also requiring Imperial allegiance', () => {
    const pool = f => corpusPool(nodLines, f);
    const withoutBase = pool({ ...base, bases: '' });
    assert.equal(withoutBase.length, 18);
    assert.ok(withoutBase.every(l => l.category !== 'advert'));
    const aslan = pool({ ...base, allegiance: 'As', allegianceBase: 'As' });
    assert.equal(aslan.length, 24);
    assert.ok(aslan.every(l => l.category !== 'advert'));
    assert.equal(pool({ ...base, starport: 'X' }).length, 0);
    assert.equal(pool({ ...base, pop: 0 }).length, 0);
});
