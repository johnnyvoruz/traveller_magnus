import assert from 'node:assert/strict';
import { test } from 'node:test';
import { systemFacts } from '../../apps/web/src/living/facts.ts';
import { eligible } from '../../apps/web/src/living/chatter.ts';
import { flavorLines } from '../../apps/web/src/living/lines/flavor.ts';
import { receiverLines } from '../../apps/web/src/living/lines.ts';
import { corpusPool, resolveSlots } from '../../apps/web/src/living/comms/corpus_events.ts';

const source = {
    hexKey: 'Test/0101', sectorName: 'Test', day: 1,
    entry: { name: 'Test', uwp: 'A867954-C', allegiance: 'ImDd', zone: '', bases: '', tradeCodes: [], pbg: '111' },
    allegiances: [{ code: 'ImDd', base: 'Im' }, { code: 'AsSc', base: 'As' }],
};
const facts = { ...systemFacts(source), party: 'docked' };

test('allegiance uses actual metadata and respects explicit clearing and overrides', () => {
    assert.equal(facts.allegianceBase, 'Im');
    const imperial = flavorLines.find(l => l.id === 'ship-200');
    const aslan = flavorLines.find(l => l.id === 'ship-204');
    assert.equal(eligible(imperial, facts), true);
    assert.equal(eligible(aslan, facts), false);
    const changed = systemFacts({ ...source, state: { allegiance: 'AsSc' } });
    assert.equal(eligible(aslan, { ...changed, party: 'docked' }), true);
    assert.equal(eligible(imperial, { ...changed, party: 'docked' }), false);
    for (const code of ['', 'Unknown', 'ImMadeUp']) {
        const f = { ...systemFacts({ ...source, state: { allegiance: code } }), party: 'docked' };
        assert.equal(eligible(imperial, f), false);
        assert.equal(eligible(aslan, f), false);
    }
});

test('new transmissions have unique IDs, resolve, and each has a reachable world', () => {
    const all = receiverLines();
    assert.equal(new Set(all.map(l => l.id)).size, all.length);
    assert.equal(flavorLines.length, 136);
    for (const line of flavorLines) {
        const f = { ...facts };
        for (const [key, value] of Object.entries(line.when)) {
            if (Array.isArray(value)) f[key] = key === 'tradeCodes' ? value : value[0];
            else if (typeof value === 'boolean') f[key] = value;
            else f[key] = value.in?.[0] ?? value.min ?? value.max;
        }
        assert.ok(corpusPool([line], f).length, line.id);
        assert.ok(resolveSlots(line.text, f, ['Lark', 'Tern']), line.id);
        for (const party of ['away', 'inJump']) assert.equal(corpusPool([line], { ...f, party }).length, 1, `ZC4: ${line.id} ${party}`);
    }
});

test('law, atmosphere, highport and population keep flavor local', () => {
    const ids = f => new Set(corpusPool(flavorLines, f).map(l => l.id));
    assert.ok(ids({ ...facts, law: 0 }).has('ship-208'));
    assert.ok(!ids({ ...facts, law: 9 }).has('ship-208'));
    assert.ok(ids({ ...facts, law: 9 }).has('ship-212'));
    assert.ok(!ids({ ...facts, atm: 6 }).has('ship-216'));
    assert.ok(ids({ ...facts, atm: 0 }).has('ship-216'));
    assert.ok(!ids({ ...facts, highport: null }).has('ship-260'));
    assert.equal(ids({ ...facts, pop: 0 }).size, 0);
});

test('public naval, scout and X-boat chatter requires the corresponding system facts', () => {
    const ids = f => new Set(corpusPool(flavorLines, f).map(l => l.id));
    const plain = { ...facts, bases: '', xboat: false };
    for (const id of ['ship-272', 'ship-280', 'ship-304']) assert.ok(!ids(plain).has(id), id);
    assert.ok(ids({ ...plain, bases: 'N' }).has('ship-272'));
    assert.ok(!ids({ ...plain, bases: 'N' }).has('ship-280'));
    assert.ok(ids({ ...plain, bases: 'S' }).has('ship-280'));
    assert.ok(ids({ ...plain, xboat: true }).has('ship-304'));
    for (const starport of ['E', 'X']) {
        const sparse = ids({ ...plain, bases: 'NS', starport });
        assert.ok(!sparse.has('ship-272'));
        assert.ok(!sparse.has('ship-280'));
    }
});
