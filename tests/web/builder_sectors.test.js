/**
 * The referee's sectors on the builder store. One request per act.
 * Undo of a rename names the revision it was sent with.
 * Undo of a delete names the revision the delete made.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { openMap } from '../../apps/web/src/builder/store.ts';

const ID = '~0123456789ABCDEFGHJKMNPQRS';
const KEY = ID + '/0101';
const HASH = 'ab'.repeat(32);
const STAMP = '2026-10-09T00:00:00.000Z';

function names() {
    return ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''];
}

function sector(over = {}) {
    return {
        id: ID,
        slot: { x: 1, y: -2 },
        name: 'Home',
        subsectors: names(),
        rev: 1,
        deleted: false,
        ...over,
    };
}

function row(rev = 2) {
    return {
        hexKey: KEY,
        state: 'own',
        treeHash: HASH,
        baseHash: null,
        roll: 0,
        rev,
        updatedAt: STAMP,
    };
}

function json(data, status = 200) {
    return { ok: status >= 200 && status < 300, status, json: async () => ({ ok: true, data }) };
}

function fail(status, message, details) {
    return { ok: false, status, json: async () => ({ ok: false, error: { code: status === 409 ? 'conflict' : 'validation', message, details } }) };
}

function fake(handler) {
    const calls = [];
    const fetchImpl = async (url, init = {}) => {
        const body = init.body ? JSON.parse(init.body) : null;
        const call = { url: String(url), method: init.method, body };
        calls.push(call);
        return handler(call);
    };
    fetchImpl.calls = calls;
    return fetchImpl;
}

function open(fetchImpl) {
    return openMap({
        fetch: fetchImpl,
        truthVersion: 'v5',
        universeId: 'uni-1',
        universeName: 'Mine',
        seed: 'TravellerMagnus',
        settings: { generationPopMax: 1 },
    });
}

function posts(fetchImpl) {
    return fetchImpl.calls.filter((call) => call.method === 'POST');
}

test('a made sector is listed, and renaming it undoes to the revision it was sent with', async () => {
    let rev = 1;
    const fetchImpl = fake((call) => {
        if (call.url.endsWith('/sectors') && call.method === 'GET') return json({ items: [sector()] });
        if (call.url.endsWith('/sectors') && call.method === 'POST') {
            assert.deepEqual(call.body, { name: 'Home', slot: { x: 3, y: 4 } });
            return json(sector({ slot: { x: 3, y: 4 }, rev: 1 }), 201);
        }
        if (call.url.endsWith('/rename')) {
            assert.equal(call.body.baseRev, rev);
            rev = call.body.baseRev + 1;
            return json(sector({ name: call.body.name, rev }));
        }
        if (call.url.endsWith('/undo')) return json(sector({ rev: call.body.toRev }));
        throw new Error('unexpected ' + call.method + ' ' + call.url);
    });
    const map = open(fetchImpl);
    const sectors = map.sectors();
    assert.equal(map.sectors(), sectors);
    await sectors.load();
    assert.equal(sectors.loaded(), true);
    assert.equal(sectors.list().length, 1);
    assert.equal(sectors.get(ID).name, 'Home');
    const made = await sectors.make('Home', { x: 3, y: 4 });
    assert.equal(made.slot.x, 3);
    const token = await sectors.rename(ID, 'Far');
    assert.deepEqual(token, { id: ID, toRev: 1, atRev: 2 });
    assert.equal(sectors.get(ID).name, 'Far');
    await sectors.undo(token);
    const undo = posts(fetchImpl).find((call) => call.url.endsWith('/undo'));
    assert.deepEqual(undo.body, { toRev: 1, baseRev: 2 });
    map.close();
});

test('a delete undoes from the revision it made, and a later act blocks the older Undo', async () => {
    const fetchImpl = fake((call) => {
        if (call.url.endsWith('/sectors') && call.method === 'GET') return json({ items: [sector()] });
        if (call.url.includes('/hexes?')) return json({ items: [], nextCursor: null });
        if (call.url.endsWith('/delete')) return json(sector({ deleted: true, rev: 2 }));
        if (call.url.endsWith('/move')) return json(sector({ slot: call.body.slot, rev: 3 }));
        if (call.url.endsWith('/undo')) return json(sector({ rev: 4 }));
        throw new Error('unexpected ' + call.url);
    });
    const map = open(fetchImpl);
    const sectors = map.sectors();
    await sectors.load();
    const gone = await sectors.remove(ID);
    assert.deepEqual(gone, { id: ID, toRev: 2, atRev: 2 });
    assert.equal(sectors.get(ID), null);
    assert.equal(fetchImpl.calls.some((call) => call.url.includes('sector=' + encodeURIComponent(ID))), true);
    await assert.rejects(() => sectors.rename(ID, 'No'), /no longer here/);
    await sectors.undo(gone);
    const undo = posts(fetchImpl).find((call) => call.url.endsWith('/undo'));
    assert.deepEqual(undo.body, { toRev: 2, baseRev: 2 });
    assert.equal(sectors.get(ID).rev, 4);
    const again = await sectors.move(ID, { x: 8, y: 1 });
    assert.equal(again.atRev, 3);
    await assert.rejects(() => sectors.undo(gone), /no longer applies/);
    assert.equal(posts(fetchImpl).filter((call) => call.url.endsWith('/undo')).length, 1);
    map.close();
});

test('a subsector rename and a conflict land on the stored sector', async () => {
    const theirs = sector({ name: 'Theirs', rev: 5 });
    const fetchImpl = fake((call) => {
        if (call.url.endsWith('/sectors') && call.method === 'GET') return json({ items: [sector()] });
        if (call.url.includes('/subsectors/C')) {
            assert.equal(call.body.baseRev, 1);
            const sub = names();
            sub[2] = 'Cronor';
            return json(sector({ subsectors: sub, rev: 2 }));
        }
        if (call.url.endsWith('/rename')) return fail(409, 'Someone else saved this sector.', { current: theirs });
        if (call.url.endsWith('/move')) return fail(400, 'A charted sector holds that slot.', { reason: 'charted' });
        throw new Error('unexpected ' + call.url);
    });
    const map = open(fetchImpl);
    const sectors = map.sectors();
    await sectors.load();
    const named = await sectors.renameSubsector(ID, 'C', 'Cronor');
    assert.deepEqual(named, { id: ID, toRev: 1, atRev: 2 });
    assert.equal(sectors.get(ID).subsectors[2], 'Cronor');
    await assert.rejects(() => sectors.rename(ID, 'Far'), /Someone else saved/);
    assert.equal(sectors.get(ID).rev, 5);
    assert.equal(sectors.get(ID).name, 'Theirs');
    await assert.rejects(() => sectors.move(ID, { x: 0, y: 0 }), /charted sector/);
    assert.equal(sectors.get(ID).rev, 5);
    map.close();
});

test('design by hand posts once, and its undo reverts to the generated rev', async () => {
    const hand = {
        hash: HASH,
        form: { edition: 'MgT2E', mode: 'hand', sections: [] },
    };
    const generated = {
        hash: HASH,
        form: { edition: 'MgT2E', sections: [] },
    };
    const fetchImpl = fake((call) => {
        if (call.url.endsWith('/form')) return json(call.url.includes(encodeURIComponent(ID)) ? hand : generated);
        if (call.url.endsWith('/design')) {
            assert.deepEqual(call.body, { baseRev: 1 });
            return json(row(2));
        }
        if (call.url.endsWith('/revert')) return json(row(3));
        if (call.url.includes('/hexes?')) return json({ items: [row(2)], nextCursor: null });
        throw new Error('unexpected ' + call.url);
    });
    const map = open(fetchImpl);
    const sectors = map.sectors();
    assert.equal(await sectors.formMode(KEY), 'hand');
    assert.equal(await sectors.formMode('spin/1910'), 'generated');
    const undo = await sectors.designByHand(KEY, 1);
    assert.equal(posts(fetchImpl).some((call) => call.url.endsWith('/design')), true);
    await undo();
    const revert = posts(fetchImpl).find((call) => call.url.endsWith('/revert'));
    assert.deepEqual(revert.body, { toRev: 1, baseRev: 2 });
    assert.equal(await sectors.formMode('spin/nope'), null);
    map.close();
});
