/**
 * The marketplace stub's screens (apps/web/src/workspace/market/), against a fake
 * `MarketplaceStore` that answers as contracts/b_marketplace.md says.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { session } from '../../apps/web/src/account/session.ts';
import { campaign } from '../../apps/web/src/campaign/store.ts';
import { fakeMarketStore } from '../../apps/web/src/workspace/market/fake_store.ts';
import {
    canPublish, closePublish, EMPTY_ALONE, formProblems, hexWords, kindOfKeys, listingLine, marketUi, openPublish, packagePath, parseTags, publish, publishKeys, recordsOn, removedWords, stateWords, useMarketStore,
} from '../../apps/web/src/workspace/market/market.ts';

const U = { id: 'u1', truthVersion: 'v5' };
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function signIn() {
    session.user = { id: 'me', email: null, role: 'user', profile: { handle: 'varn' } };
    campaign.universes = [{ id: 'u1', ownerId: 'me' }];
}

/** A fake whose versions move when the test says, not on a clock. */
function setup() {
    const queue = [];
    const store = fakeMarketStore({ schedule: (fn) => queue.push(fn) });
    useMarketStore(store);
    closePublish();
    Object.assign(marketUi, { target: 'new', title: '', kind: '', description: '', tags: '', left: [], busy: false, error: '' });
    signIn();
    const run = () => { while (queue.length) queue.shift()(); };
    return { store, run };
}

test('what goes in: only hexes that hold something; the summary; the kind a selection suggests', () => {
    const state = (key) => (key.endsWith('01') ? 'empty' : key.endsWith('02') ? 'removed' : 'truth');
    assert.deepEqual(publishKeys(['A/0101', 'A/0102', 'A/0103'], state), ['A/0102', 'A/0103']);
    assert.equal(hexWords(['Spinward_Marches/0101', 'Spinward_Marches/0102']), '2 hexes in Spinward Marches');
    assert.equal(hexWords(['A/0101', 'B/0101', 'B/0102']), '3 hexes in 2 sectors');
    const sub = [];
    for (let c = 9; c <= 16; c += 1) for (let r = 1; r <= 10; r += 1) sub.push('A/' + String(c).padStart(2, '0') + String(r).padStart(2, '0'));
    assert.equal(kindOfKeys(sub), 'subsector');
    assert.equal(kindOfKeys(sub.slice(1)), 'hexes');
    assert.equal(kindOfKeys(['A/0101', 'B/0101']), 'hexes');
});

test('one system: offered for a filled or removed hex, not an empty one; the summary and the deleted hex said', () => {
    const state = (key) => (key.endsWith('01') ? 'empty' : key.endsWith('02') ? 'removed' : 'truth');
    assert.equal(canPublish(['A/0103'], state), true);
    assert.equal(canPublish(['A/0102'], state), true);
    assert.equal(canPublish(['A/0101'], state), false);
    assert.equal(canPublish([], state), false);
    assert.equal(canPublish(['A/0101', 'A/0103'], state), true);
    assert.equal(EMPTY_ALONE, 'An empty hex has nothing to publish.');
    assert.equal(kindOfKeys(['A/0103']), 'system');
    assert.equal(hexWords(['Spinward_Marches/1910']), '1 hex in Spinward Marches');
    assert.equal(removedWords(['A/0103'], state), '');
    assert.equal(removedWords(['A/0102'], state), 'You removed this system from your map. It goes in as a deleted hex.');
    assert.equal(removedWords(['A/0102', 'A/0103'], state), '1 of these hexes is removed from your map. It goes in as a deleted hex.');
    assert.equal(removedWords(['A/0102', 'B/0102', 'A/0103'], state), '2 of these hexes are removed from your map. They go in as deleted hexes.');
});

test('records on the hexes: each once, by name; tags as typed', () => {
    const at = (key) => (key === 'A/0101' ? ['r2', 'r1'] : ['r1', 'r3']);
    const read = (id) => ({ r1: { name: 'Varn', type: 'person' }, r2: { name: 'Archive', type: 'place' } })[id];
    assert.deepEqual(recordsOn(['A/0101', 'A/0102'], at, read).map((item) => item.id), ['r2', 'r1']);
    assert.deepEqual(parseTags(' survey, frontier ,, survey,  deep   space '), ['survey', 'frontier', 'deep space']);
});

test('the limits are said in words with what to do; a new version asks for no title', () => {
    const base = { isNew: true, title: 'T', kind: 'k', description: '', tags: [], hexes: 10, records: 0 };
    assert.deepEqual(formProblems(base), []);
    assert.deepEqual(formProblems({ ...base, hexes: 1312 }).map((item) => item.text), ['A package holds at most 1,280 hexes. To publish, select 32 fewer hexes.']);
    assert.deepEqual(formProblems({ ...base, records: 501 }).map((item) => item.text), ['A package holds at most 500 records. To publish, clear 1 record.']);
    assert.deepEqual(formProblems({ ...base, title: ' ', kind: '' }).map((item) => item.field), ['title', 'kind']);
    assert.deepEqual(formProblems({ ...base, tags: Array.from({ length: 33 }, (_, i) => 't' + i) }).map((item) => item.text), ['Use 32 tags or fewer.']);
    assert.deepEqual(formProblems({ ...base, isNew: false, title: '', kind: '' }), []);
    assert.deepEqual(formProblems({ ...base, hexes: 0 }).map((item) => item.field), ['hexes']);
});

test('a new package: one create, one version, the form emptied, and the address of the page that watches it', async () => {
    const { store, run } = setup();
    openPublish('subsector');
    assert.equal(marketUi.open, true);
    assert.equal(marketUi.kind, 'subsector');
    Object.assign(marketUi, { title: 'Spinward Fringe survey', description: 'Two subsectors.', tags: 'survey, frontier' });
    const path = await publish(U, ['A/0101', 'A/0102'], ['r1']);
    assert.equal(store.sent.create.length, 1);
    assert.deepEqual(store.sent.create[0], { title: 'Spinward Fringe survey', kind: 'subsector', description: 'Two subsectors.', tags: ['survey', 'frontier'], universeId: 'u1' });
    const id = store.listings()[0].id;
    assert.deepEqual(store.sent.publish, [{ packageId: id, body: { universeId: 'u1', hexKeys: ['A/0101', 'A/0102'], recordIds: ['r1'] } }]);
    assert.equal(path, packagePath(id, 1));
    assert.equal(marketUi.open, false);
    assert.equal(marketUi.title, '');
    // The page watches the version from its address: waiting, publishing, published.
    const seen = [];
    const end = store.watch(id, 1, (version) => seen.push(version.state));
    run();
    assert.equal((await end).state, 'done');
    assert.deepEqual(seen, ['queued', 'running', 'done']);
    assert.equal(store.listings()[0].latestVersion, 1);
    assert.equal(listingLine(store.listings()[0]), 'by @varn · subsector · chart v5 · MgT2E · 2 hexes · version 1');
});

test('a second version of the same package: no create, the version after the last', async () => {
    const { store, run } = setup();
    store.seed(1);
    const id = store.listings()[0].id;
    const before = store.listings()[0].latestVersion;
    openPublish('hexes');
    marketUi.target = id;
    const path = await publish(U, ['A/0103'], []);
    assert.equal(store.sent.create.length, 0);
    assert.equal(path, packagePath(id, before + 1));
    run();
    await tick();
    assert.equal(store.page(id).versions[0].state, 'done');
});

test('a refusal is shown in the server’s words and the form stays filled; a failed version is said on the page', async () => {
    const { store, run } = setup();
    openPublish('hexes');
    Object.assign(marketUi, { title: 'Kept', kind: 'hexes' });
    store.options.refuseNext = 'A hex is not in this universe.';
    assert.equal(await publish(U, ['A/0101'], []), null);
    assert.equal(marketUi.error, 'A hex is not in this universe.');
    assert.equal(marketUi.open, true);
    assert.equal(marketUi.title, 'Kept');
    // Not on a published chart: the server's sentence.
    assert.equal(await publish({ id: 'u1', truthVersion: null }, ['A/0101'], []), null);
    assert.equal(marketUi.error, 'This universe is not on a published chart.');
    // A version that fails in the job: the page shows the reason, the listing stays where it was.
    store.options.failNext = 'A hex is not in this universe.';
    const path = await publish(U, ['A/0101'], []);
    const id = store.listings()[0].id;
    run();
    const end = await store.watch(id, 1);
    assert.equal(path, packagePath(id, 1));
    assert.deepEqual([end.state, end.error, stateWords(end.state)], ['failed', 'A hex is not in this universe.', 'Failed']);
    assert.equal(store.listings()[0].latestVersion, 0);
});

test('my packages: newest first, the eight listing fields, and five of them', async () => {
    const { store } = setup();
    store.seed(5);
    const page = await store.list();
    assert.equal(page.items.length, 5);
    for (const item of page.items) assert.deepEqual(Object.keys(item).sort(), ['authorHandle', 'edition', 'hexCount', 'id', 'kind', 'latestVersion', 'tags', 'title', 'truthVersion']);
    useMarketStore(null);
    session.user = null;
});
