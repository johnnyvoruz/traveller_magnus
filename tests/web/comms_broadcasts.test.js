import assert from 'node:assert/strict';
import { test } from 'node:test';
import { broadcastLines, broadcastAdvertIds } from '../../apps/web/src/living/lines/broadcasts.ts';
import { spaceLines } from '../../apps/web/src/living/lines/space.ts';
import { receiverLines, corpusLines } from '../../apps/web/src/living/lines.ts';
import { corpusPool, nextCorpusEvent } from '../../apps/web/src/living/comms/corpus_events.ts';

const base = {
    hexKey: 'Test/0101', name: 'Testworld', sector: 'Test', subsector: 'A',
    starport: 'A', size: 7, atm: 6, hydro: 7, pop: 9, gov: 5, law: 5, tl: 12,
    tradeCodes: [], zone: 'green', bases: '', highport: true,
    gasGiants: 1, belts: 1, moons: 0, otherBodies: 1, xboat: false,
    party: 'docked', day: 1, bodies: {}, allegiance: '', allegianceBase: '',
};
const ids = (f) => new Set(corpusPool(broadcastLines, f).map(l => l.id));

test('all forty new space lines reach the ambient pool while asset-specific lines stay grounded', () => {
    assert.equal(spaceLines.length, 40);
    const rich = { ...base, highport: true, belts: 1, gasGiants: 1 };
    for (const party of ['docked', 'inSystem', 'away', 'inJump']) {
        assert.equal(corpusPool(spaceLines, { ...rich, party }).length, 40);
    }
    const sparse = corpusPool(spaceLines, { ...base, highport: null, belts: 0, gasGiants: 0, party: 'away' });
    assert.equal(sparse.length, 16);
    assert.ok(sparse.every(l => !l.when.highport && !l.when.belts && !l.when.gasGiants));
    const all = receiverLines();
    assert.ok(spaceLines.every(l => all.some(entry => entry.id === l.id)));
    assert.equal(new Set(all.map(l => l.id)).size, all.length);
});

test('every new broadcast is reachable, resolves its sender, and retains deterministic selection', () => {
    const all = receiverLines();
    assert.equal(new Set(all.map(l => l.id)).size, all.length);
    assert.equal(broadcastLines.length, 60);
    for (const line of broadcastLines) {
        const f = { ...base };
        for (const [key, value] of Object.entries(line.when)) {
            if (Array.isArray(value)) f[key] = key === 'tradeCodes' ? value : value[0];
            else if (typeof value === 'boolean') f[key] = value;
            else f[key] = value.in?.[0] ?? value.min ?? value.max;
        }
        const pool = corpusPool([line], f);
        assert.equal(pool.length, 1, line.id);
        const ctx = { truthVersion: 'tv1', day: 1, eventIndex: 5 };
        const event = nextCorpusEvent(pool, f, ctx);
        assert.deepEqual(event, nextCorpusEvent(pool, f, ctx));
        assert.doesNotMatch(event.turns[0].speaker + event.turns[0].text, /[{}]/);
        assert.equal(nextCorpusEvent(pool, f, { ...ctx, avoidIds: [event.id] }), null);
        assert.equal(corpusPool([line], { ...f, party: 'inJump' }).length, 0);
    }
});

test('new commercials are quiet additions; the legacy advert corpus remains excluded', () => {
    for (const allegiance of ['Im', 'Zh', 'As', '']) {
        for (const law of [0, 5, 10]) {
            const f = { ...base, allegiance, law };
            assert.equal(corpusPool(corpusLines().filter(l => l.category === 'advert'), f).length, 0);
            for (const line of corpusPool(receiverLines(), f).filter(l => l.category === 'advert')) {
                assert.ok(broadcastAdvertIds.has(line.id));
                assert.ok(line.weight <= 0.4);
            }
        }
    }
});

test('polity broadcasts never bleed across allegiances or arise from a high law code', () => {
    assert.ok(!ids({ ...base, law: 12 }).has('advert-218'));
    assert.ok(!ids({ ...base, law: 0 }).has('advert-224'));
    const im = ids({ ...base, allegiance: 'ImDd', allegianceBase: 'Im' });
    const zh = ids({ ...base, allegiance: 'ZhCo', allegianceBase: 'Zh' });
    assert.ok(im.has('advert-218'));
    assert.ok(!im.has('advert-224'));
    assert.ok(zh.has('advert-224'));
    assert.ok(!zh.has('advert-218'));
});

test('scam patter, police, animal shipments and gravity service respect their world filters', () => {
    assert.ok(ids({ ...base, law: 1 }).has('advert-200'));
    assert.ok(!ids(base).has('advert-200'));
    assert.ok(ids(base).has('control-200'));
    assert.ok(!ids({ ...base, law: 0 }).has('control-200'));
    assert.ok(!ids({ ...base, tl: 5 }).has('ship-336'));
    assert.ok(!ids(base).has('ship-342'));
    assert.ok(ids({ ...base, tradeCodes: ['Ag'] }).has('ship-342'));
    for (const starport of ['E', 'X']) assert.equal(ids({ ...base, starport }).size, 0);
    assert.equal(ids({ ...base, pop: 0 }).size, 0);
    const patrol = broadcastLines.find(l => l.id === 'control-200');
    const event = nextCorpusEvent([patrol], base, { truthVersion: 'tv1', day: 1, eventIndex: 0 });
    assert.equal(event.channel, 'services');
    assert.equal(event.turns[0].speaker, 'Testworld Port Patrol');
});
