/**
 * The marketplace store against a fake transport. No network.
 * Speaks contracts/b_marketplace.md. The server is not built.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { asMarketplaceStore } from '../../apps/web/src/marketplace/screen.ts';
import { openMarketplace } from '../../apps/web/src/marketplace/store.ts';

const ID = 'pk_0123456789ABCDEFGHJKMNPQRS';
const OTHER = 'pk_0123456789ABCDEFGHJKMNPQRT';

function listing(over = {}) {
    return {
        id: ID,
        title: 'Regina belt',
        authorHandle: 'ada',
        kind: 'subsector',
        truthVersion: 'v5',
        edition: 'MgT2E',
        hexCount: 0,
        tags: ['lanth'],
        latestVersion: 0,
        ...over,
    };
}

function version(over = {}) {
    return {
        version: 1,
        state: 'queued',
        hexCount: 2,
        recordCount: 0,
        manifestHash: null,
        error: null,
        ...over,
    };
}

function page(over = {}) {
    return {
        ...listing(),
        description: 'A named part.',
        versions: [version()],
        ...over,
    };
}

function json(data, status = 200) {
    return { ok: status >= 200 && status < 300, status, json: async () => ({ ok: true, data }) };
}

function fail(status, message, details) {
    return { ok: false, status, json: async () => ({ ok: false, error: { code: 'validation', message, details } }) };
}

function clock() {
    const timers = [];
    return {
        timers,
        schedule(fn, ms) {
            const item = { fn, ms, dead: false };
            timers.push(item);
            return () => { item.dead = true; };
        },
        armed() {
            return timers.filter((item) => !item.dead);
        },
        async fire() {
            const item = timers.find((entry) => !entry.dead);
            if (!item) throw new Error('No timer is armed.');
            item.dead = true;
            item.fn();
            await flush();
        },
    };
}

function fake(handler) {
    const calls = [];
    const fetchImpl = async (url, init = {}) => {
        const body = init.body ? JSON.parse(init.body) : null;
        const call = { url: String(url), method: init.method, body, credentials: init.credentials };
        calls.push(call);
        return handler(call, calls.length);
    };
    fetchImpl.calls = calls;
    return fetchImpl;
}

async function flush() {
    for (let i = 0; i < 8; i += 1) await Promise.resolve();
}

function open(fetchImpl, time, account) {
    return asMarketplaceStore(openMarketplace({
        fetch: fetchImpl,
        schedule: time.schedule.bind(time),
        account,
    }));
}

const source = { ownerId: 'user-1', truthVersion: 'v5' };
const createBody = {
    title: 'Regina belt',
    kind: 'subsector',
    description: 'A named part.',
    tags: ['lanth'],
    universeId: 'uni-1',
};
const publishBody = {
    universeId: 'uni-1',
    hexKeys: ['Spinward_Marches/1910', 'Spinward_Marches/1911'],
    recordIds: ['rec-1'],
};

test('each call posts the contract body and rejects an answer it cannot read', async () => {
    const time = clock();
    const who = { id: 'user-1', handle: 'ada' };
    const transport = fake((call) => {
        if (call.method === 'POST' && call.url === '/api/packages') return json(listing(), 201);
        if (call.method === 'POST') return json({ jobId: `${ID}:1`, version: 1 }, 202);
        if (call.url === `/api/packages/${ID}/versions/1`) return json(version({ state: 'done', manifestHash: 'ab' }));
        if (call.url === '/api/packages?cursor=next&limit=20') return json({ items: [listing({ id: OTHER, title: 'Older' })], nextCursor: null });
        if (call.url === '/api/packages') return json({ items: [listing()], nextCursor: 'next' });
        if (call.url === `/api/packages/${ID}`) return json(page({ latestVersion: 1, hexCount: 2 }));
        return fail(500, 'Unexpected request.');
    });
    const shelf = open(transport, time, () => who);

    const created = await shelf.create(createBody, source);
    assert.deepEqual(transport.calls[0], {
        url: '/api/packages',
        method: 'POST',
        credentials: 'same-origin',
        body: createBody,
    });
    assert.equal(created.id, ID);
    assert.equal(created.latestVersion, 0);
    assert.equal(shelf.tick() > 0, true);

    const seen = [];
    const handle = shelf.publish(ID, publishBody, source, (row) => seen.push(row.state));
    const accepted = await handle.accepted;
    assert.deepEqual(accepted, { jobId: `${ID}:1`, version: 1 });
    assert.deepEqual(transport.calls[1].body, publishBody);
    assert.equal(transport.calls[1].url, `/api/packages/${ID}/versions`);
    await flush();
    const done = await handle.finished;
    assert.equal(done.state, 'done');
    assert.deepEqual(seen, ['done']);
    assert.equal(transport.calls[2].method, 'GET');
    assert.equal(transport.calls[2].url, `/api/packages/${ID}/versions/1`);

    const listed = await shelf.list();
    assert.equal(transport.calls[3].url, '/api/packages');
    assert.equal(listed.nextCursor, 'next');
    const older = await shelf.list({ cursor: 'next', limit: 20 });
    assert.equal(transport.calls[4].url, '/api/packages?cursor=next&limit=20');
    assert.equal(older.items[0].id, OTHER);
    assert.deepEqual(shelf.listings().map((item) => item.id), [ID, OTHER]);

    const read = await shelf.read(ID);
    assert.equal(transport.calls[5].url, `/api/packages/${ID}`);
    assert.equal(read.description, 'A named part.');
    assert.equal(read.versions[0].state, 'queued');

    const broken = fake(() => json({ id: 4 }, 201));
    const empty = open(broken, clock(), () => who);
    await assert.rejects(empty.create(createBody, source), (err) => {
        assert.equal(err.message, 'The server sent a response the store could not read.');
        return true;
    });
    assert.equal(empty.listings().length, 0);
    assert.equal(broken.calls.length, 1);
});

test('publish reports each version state, and a reload watches that version and updates the listing', async () => {
    const time = clock();
    const who = { id: 'user-1', handle: 'ada' };
    let step = 0;
    const transport = fake((call) => {
        if (call.method === 'POST' && call.url === '/api/packages') return json(listing(), 201);
        if (call.method === 'POST') return json({ jobId: `${ID}:1`, version: 1 }, 202);
        if (call.url === '/api/packages') return json({ items: [listing()], nextCursor: null });
        step += 1;
        if (step === 1) return json(version({ state: 'queued' }));
        if (step === 2) return json(version({ state: 'running' }));
        return json(version({ state: 'done', manifestHash: 'ab', hexCount: 2, recordCount: 1 }));
    });
    const shelf = open(transport, time, () => who);
    await shelf.create(createBody, source);
    const seen = [];
    const handle = shelf.publish(ID, publishBody, source, (row) => seen.push(row.state));
    await handle.accepted;
    await flush();
    assert.deepEqual(seen, ['queued']);
    assert.equal(time.armed()[0].ms, 400);
    await time.fire();
    assert.deepEqual(seen, ['queued', 'running']);
    await time.fire();
    const done = await handle.finished;
    assert.equal(done.state, 'done');
    assert.equal(done.manifestHash, 'ab');
    const card = shelf.listings()[0];
    assert.equal(card.latestVersion, 1);
    assert.equal(card.hexCount, 2);
    assert.equal(transport.calls.some((call) => call.url === `/api/packages/${ID}`), false);

    const again = open(transport, clock(), () => who);
    const before = transport.calls.length;
    await again.list();
    assert.equal(again.listings()[0].latestVersion, 0);
    const watched = await again.watch(ID, 1, (row) => seen.push(`reload:${row.state}`));
    assert.equal(watched.state, 'done');
    assert.equal(again.listings()[0].latestVersion, 1);
    assert.equal(again.listings()[0].hexCount, 2);
    const after = transport.calls.slice(before).map((call) => call.url);
    assert.deepEqual(after, ['/api/packages', `/api/packages/${ID}/versions/1`]);
});

test('a loaded package page takes the finished version without another fetch', async () => {
    const time = clock();
    const who = { id: 'user-1', handle: 'ada' };
    const transport = fake((call) => {
        if (call.url === `/api/packages/${ID}`) return json(page());
        if (call.method === 'GET') return json(version({ state: 'failed', error: 'The bucket refused the write.' }));
        return fail(500, 'Unexpected request.');
    });
    const shelf = open(transport, time, () => who);
    await shelf.read(ID);
    const failed = await shelf.watch(ID, 1);
    assert.equal(failed.state, 'failed');
    assert.equal(failed.error, 'The bucket refused the write.');
    assert.equal(shelf.page(ID).versions[0].state, 'failed');
    assert.equal(shelf.page(ID).latestVersion, 0);
    assert.equal(shelf.listings()[0].latestVersion, 0);
    assert.equal(transport.calls.length, 2);
    assert.equal(transport.calls[1].url, `/api/packages/${ID}/versions/1`);
});

test('every contract error reaches the caller as the server message', async () => {
    const messages = [
        'Sign in required.',
        'Origin check failed.',
        'No such package.',
        'No such universe.',
        'Invalid JSON.',
        'Invalid request.',
        'This universe is not on a published chart.',
        'This package publishes from a different universe.',
        'A hex is not in this universe.',
        'No such record.',
        'A package holds at most 1280 hexes.',
        'A package holds at most 500 records.',
        'Invalid limit.',
        'No such version.',
        'This package has too many versions.',
    ];
    const who = { id: 'user-1', handle: 'ada' };
    for (const message of messages) {
        const details = message === 'A hex is not in this universe.' ? { hexKey: 'Spinward_Marches/1910' } : undefined;
        const transport = fake(() => fail(400, message, details));
        const shelf = open(transport, clock(), () => who);
        const handle = shelf.publish(ID, publishBody, source);
        const accepted = handle.accepted.then(() => { throw new Error('accepted should reject'); }, (err) => err);
        const finished = handle.finished.then(() => { throw new Error('finished should reject'); }, (err) => err);
        const err = await accepted;
        assert.equal(err.message, message);
        if (details) assert.equal(err.details.hexKey, 'Spinward_Marches/1910');
        assert.equal((await finished).message, message);
        assert.equal(shelf.listings().length, 0);
        assert.equal(transport.calls.length, 1);
    }
});

test('signed out, or not the owner, the client refuses before any request', async () => {
    const time = clock();
    const transport = fake(() => fail(500, 'The request should not be sent.'));
    const signedOut = open(transport, time, () => null);
    await assert.rejects(signedOut.create(createBody, source), (err) => err.message === 'Sign in to publish and to see your packages.');
    assert.throws(() => signedOut.publish(ID, publishBody, source), (err) => err.message === 'Sign in to publish and to see your packages.');
    await assert.rejects(signedOut.list(), (err) => err.message === 'Sign in to publish and to see your packages.');
    await assert.rejects(signedOut.read(ID), (err) => err.message === 'Sign in to publish and to see your packages.');
    await assert.rejects(signedOut.watch(ID, 1), (err) => err.message === 'Sign in to publish and to see your packages.');
    assert.equal(transport.calls.length, 0);

    const stranger = open(transport, time, () => ({ id: 'user-2', handle: 'bea' }));
    await assert.rejects(stranger.create(createBody, source), (err) => err.message === 'You can publish only from a universe you own.');
    assert.throws(() => stranger.publish(ID, publishBody, source), (err) => err.message === 'You can publish only from a universe you own.');
    assert.equal(transport.calls.length, 0);

    const owner = { id: 'user-1', handle: 'ada' };
    const owned = fake(() => json({ items: [listing()], nextCursor: null }));
    const shelf = open(owned, time, () => owner);
    await shelf.list();
    owner.handle = 'bea';
    await assert.rejects(shelf.read(ID), (err) => err.message === 'You can open only a package you published.');
    await assert.rejects(shelf.watch(ID, 1), (err) => err.message === 'You can open only a package you published.');
    assert.throws(() => shelf.publish(ID, publishBody, source), (err) => err.message === 'You can open only a package you published.');
    assert.equal(owned.calls.length, 1);
});

test('a universe with no truth version is refused before any request', async () => {
    const transport = fake(() => fail(500, 'The request should not be sent.'));
    const shelf = open(transport, clock(), () => ({ id: 'user-1', handle: 'ada' }));
    const blank = { ownerId: 'user-1', truthVersion: null };
    await assert.rejects(shelf.create(createBody, blank), (err) => err.message === 'This universe is not on a published chart.');
    assert.throws(() => shelf.publish(ID, publishBody, blank), (err) => err.message === 'This universe is not on a published chart.');
    assert.equal(transport.calls.length, 0);
});

test('the store is the screen state, and the folder has no window and no native dialog', () => {
    const time = clock();
    let now = 0;
    const transport = fake(() => json(listing(), 201));
    const shelf = open(transport, time, () => ({ id: 'user-1', handle: 'ada' }));
    assert.equal(shelf.tick(), now);
    const files = ['types.ts', 'store.ts', 'screen.ts', 'index.ts'];
    for (const name of files) {
        const sourceText = readFileSync(new URL(`../../apps/web/src/marketplace/${name}`, import.meta.url), 'utf8');
        assert.equal(sourceText.includes('window.'), false, name);
        assert.equal(/\balert\(/.test(sourceText), false, name);
        assert.equal(/\bconfirm\(/.test(sourceText), false, name);
        assert.equal(/\bprompt\(/.test(sourceText), false, name);
    }
    return shelf.create(createBody, source).then((row) => {
        assert.equal(shelf.tick() > now, true);
        assert.equal(shelf.listings()[0].title, row.title);
        assert.equal(shelf.page(ID), null);
    });
});

test('sentences the client writes are plain, and a failed publish leaves the listing version', async () => {
    const sentences = [
        'Sign in to publish and to see your packages.',
        'You can publish only from a universe you own.',
        'You can open only a package you published.',
        'The server sent a response the store could not read.',
        'This publish is still running.',
        'This universe is not on a published chart.',
    ];
    for (const sentence of sentences) {
        assert.equal(sentence.endsWith('.'), true);
        assert.equal(sentence.includes('please'), false);
        assert.equal(sentence.includes('Please'), false);
        assert.equal(sentence[0], sentence[0].toUpperCase());
    }
    const who = { id: 'user-1', handle: 'ada' };
    const transport = fake((call) => {
        if (call.method === 'POST' && call.url === '/api/packages') return json(listing(), 201);
        if (call.method === 'POST') return json({ jobId: `${ID}:2`, version: 2 }, 202);
        return json(version({ version: 2, state: 'failed', error: 'Copied bytes do not match.' }));
    });
    const shelf = open(transport, clock(), () => who);
    await shelf.create(createBody, source);
    const handle = shelf.publish(ID, publishBody, source);
    await handle.accepted;
    const failed = await handle.finished;
    assert.equal(failed.state, 'failed');
    assert.equal(failed.error, 'Copied bytes do not match.');
    assert.equal(shelf.listings()[0].latestVersion, 0);
    assert.equal(shelf.listings()[0].hexCount, 0);
});
