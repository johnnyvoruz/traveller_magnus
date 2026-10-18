import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TruthClient } from '../../apps/web/src/map/truth_client.ts';

function jsonResponse(status, body) {
    return { ok: status >= 200 && status < 300, status, json: async () => body };
}

async function flush() {
    for (let i = 0; i < 20; i++) await new Promise((resolve) => setImmediate(resolve));
}

const manifest = { truthVersion: 'v2', sectors: [] };

test('two concurrent manifest calls make one request', async () => {
    let calls = 0;
    const client = new TruthClient({
        cdnBase: 'https://cdn.example',
        apiBase: 'https://api.example',
        fetch: async () => {
            calls += 1;
            return jsonResponse(200, manifest);
        },
    });
    const [a, b] = await Promise.all([client.manifest('v2'), client.manifest('v2')]);
    assert.equal(calls, 1);
    assert.equal(a.truthVersion, 'v2');
    assert.equal(b.truthVersion, 'v2');
});

test('want of 10 slugs never has more than 4 in flight', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const pending = [];
    const client = new TruthClient({
        cdnBase: 'https://cdn.example',
        apiBase: 'https://api.example',
        fetch: () => {
            inFlight += 1;
            if (inFlight > maxInFlight) maxInFlight = inFlight;
            return new Promise((resolve) => {
                pending.push(() => {
                    inFlight -= 1;
                    resolve(jsonResponse(200, { slug: 'x', hexes: {}, systems: 0 }));
                });
            });
        },
    });
    client.want('v2', Array.from({ length: 10 }, (_, i) => 's' + i));
    assert.equal(pending.length, 4);
    assert.equal(maxInFlight, 4);
    while (pending.length) {
        const release = pending.shift();
        release();
        await flush();
        assert.ok(inFlight <= 4);
    }
    assert.equal(maxInFlight, 4);
    assert.equal(client.index('v2', 's9') === null, false);
});

test('the 33rd index drops the least recently read one', async () => {
    const client = new TruthClient({
        cdnBase: 'https://cdn.example',
        apiBase: 'https://api.example',
        fetch: async (url) => {
            const slug = String(url).split('/').at(-2);
            return jsonResponse(200, { slug, hexes: {}, systems: 0 });
        },
    });
    const first = Array.from({ length: 32 }, (_, i) => 's' + i);
    client.want('v2', first);
    await flush();
    assert.equal(client.index('v2', 's0').slug, 's0');
    client.want('v2', ['s32']);
    await flush();
    assert.equal(client.index('v2', 's0').slug, 's0');
    assert.equal(client.index('v2', 's1'), null);
    assert.equal(client.index('v2', 's32').slug, 's32');
});

test('opening an own sector makes no request under truth/', async () => {
    const urls = [];
    const client = new TruthClient({
        cdnBase: 'https://cdn.example',
        apiBase: 'https://api.example',
        fetch: async (url) => {
            urls.push(String(url));
            return jsonResponse(200, { slug: 'x', hexes: {}, systems: 0 });
        },
    });
    const own = '~01M4JVP1EXES5VA79JXG9F5NHM';
    client.want('v5', [own, '~slot_40_40']);
    await flush();
    assert.deepEqual(urls, []);
    assert.equal(client.index('v5', own), null);
    client.want('v5', ['Spinward_Marches']);
    await flush();
    assert.deepEqual(urls, ['https://cdn.example/truth/v5/sectors/Spinward_Marches/index.json']);
});

test('a 404 does not poison later calls', async () => {
    let calls = 0;
    const client = new TruthClient({
        cdnBase: 'https://cdn.example',
        apiBase: 'https://api.example',
        fetch: async () => {
            calls += 1;
            if (calls === 1) return jsonResponse(404, null);
            return jsonResponse(200, { slug: 'A', hexes: {}, systems: 1 });
        },
    });
    client.want('v2', ['A']);
    await flush();
    assert.equal(calls, 1);
    assert.equal(client.index('v2', 'A'), null);
    await flush();
    assert.equal(calls, 1);
    client.want('v2', ['A']);
    await flush();
    assert.equal(calls, 2);
    assert.equal(client.index('v2', 'A').systems, 1);
});

test('two concurrent tree calls make one request', async () => {
    let calls = 0;
    const doc = { kind: 'tree', hexKey: 'Spinward_Marches/1910' };
    const client = new TruthClient({
        cdnBase: 'https://cdn.example',
        apiBase: 'https://api.example',
        fetch: async (url) => {
            calls += 1;
            assert.equal(url, 'https://cdn.example/objects/abc');
            return jsonResponse(200, doc);
        },
    });
    assert.equal(client.treeNow('abc'), null);
    const [a, b] = await Promise.all([client.tree('abc'), client.tree('abc')]);
    assert.equal(calls, 1);
    assert.equal(a.hexKey, 'Spinward_Marches/1910');
    assert.equal(b, a);
    assert.equal(client.treeNow('abc').hexKey, doc.hexKey);
});

test('the 17th tree drops the least recently read', async () => {
    const client = new TruthClient({
        cdnBase: 'https://cdn.example',
        apiBase: 'https://api.example',
        fetch: async (url) => {
            const hash = String(url).split('/').at(-1);
            return jsonResponse(200, { kind: 'tree', hexKey: hash });
        },
    });
    for (let i = 0; i < 16; i++) await client.tree('h' + i);
    assert.equal(client.treeNow('h0').hexKey, 'h0');
    await client.tree('h16');
    assert.equal(client.treeNow('h0').hexKey, 'h0');
    assert.equal(client.treeNow('h1'), null);
    assert.equal(client.treeNow('h16').hexKey, 'h16');
});

test('a failed tree fetch is not cached', async () => {
    let calls = 0;
    const client = new TruthClient({
        cdnBase: 'https://cdn.example',
        apiBase: 'https://api.example',
        fetch: async () => {
            calls += 1;
            if (calls === 1) return jsonResponse(404, null);
            return jsonResponse(200, { kind: 'tree', hexKey: 'h' });
        },
    });
    await assert.rejects(() => client.tree('h'));
    assert.equal(client.treeNow('h'), null);
    const doc = await client.tree('h');
    assert.equal(calls, 2);
    assert.equal(doc.hexKey, 'h');
});

test('polities is one cached request and a 404 is an empty document', async () => {
    let calls = 0;
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const client = new TruthClient({
        cdnBase: 'https://cdn.example',
        apiBase: 'https://api.example',
        fetch: async (url) => {
            calls += 1;
            await gate;
            assert.equal(String(url), 'https://cdn.example/truth/v3/polities.json');
            return jsonResponse(404, null);
        },
    });
    const pending = Promise.all([client.polities('v3'), client.polities('v3')]);
    assert.equal(calls, 1);
    release();
    const [a, b] = await pending;
    assert.deepEqual(a, { truthVersion: 'v3', polities: [] });
    assert.equal(a, b);
    const again = await client.polities('v3');
    assert.equal(calls, 1);
    assert.equal(again, a);
});

test('polities keeps a document and retries after a non-404 failure', async () => {
    let calls = 0;
    const body = { truthVersion: 'v4', polities: [] };
    const client = new TruthClient({
        cdnBase: 'https://cdn.example',
        apiBase: 'https://api.example',
        fetch: async () => {
            calls += 1;
            if (calls === 1) return jsonResponse(500, null);
            return jsonResponse(200, body);
        },
    });
    await assert.rejects(() => client.polities('v4'));
    const doc = await client.polities('v4');
    assert.equal(calls, 2);
    assert.equal(doc, body);
    const again = await client.polities('v4');
    assert.equal(calls, 2);
    assert.equal(again, doc);
});

test('the injected fetch is never called as a method of the client', async () => {
    // A browser's fetch throws "Illegal invocation" unless `this` is undefined or the global.
    let seenThis = 'unset';
    const client = new TruthClient({
        cdnBase: 'https://cdn.example',
        apiBase: 'https://api.example',
        fetch: function () {
            seenThis = this;
            return Promise.resolve(jsonResponse(200, manifest));
        },
    });
    await client.manifest('v2');
    assert.equal(seenThis, undefined);
});

test('a manifest asked again, and a second client, make no second request', async () => {
    let calls = 0;
    const fetch = async () => {
        calls += 1;
        return jsonResponse(200, manifest);
    };
    const first = new TruthClient({ cdnBase: 'https://cdn.example', apiBase: 'https://api.example', fetch });
    const again = await first.manifest('v2');
    assert.equal(again, manifest);
    const second = new TruthClient({ cdnBase: 'https://cdn.example', apiBase: 'https://api.example', fetch });
    assert.equal(await second.manifest('v2'), manifest);
    assert.equal(calls, 1);
});

test('a failed manifest is asked again', async () => {
    let calls = 0;
    const client = new TruthClient({
        cdnBase: 'https://cdn.example',
        apiBase: 'https://api.example',
        fetch: async () => {
            calls += 1;
            if (calls === 1) return jsonResponse(500, null);
            return jsonResponse(200, manifest);
        },
    });
    await assert.rejects(() => client.manifest('v2'));
    assert.equal((await client.manifest('v2')).truthVersion, 'v2');
    assert.equal(calls, 2);
});

test('the released-version list is asked each time', async () => {
    let calls = 0;
    const client = new TruthClient({
        cdnBase: 'https://cdn.example',
        apiBase: 'https://api.example',
        fetch: async () => {
            calls += 1;
            return jsonResponse(200, { ok: true, data: [{ version: 'v2', releasedAt: '2026-01-01T00:00:00.000Z' }] });
        },
    });
    assert.equal(await client.currentVersion(), 'v2');
    assert.equal(await client.currentVersion(), 'v2');
    assert.equal(calls, 2);
});

test('panning back, zooming back and reopening a dossier fetch nothing again', async () => {
    const counts = new Map();
    const fetch = async (url) => {
        const key = String(url);
        counts.set(key, (counts.get(key) || 0) + 1);
        if (key.endsWith('/index.json')) {
            const slug = key.split('/').at(-2);
            return jsonResponse(200, { slug, hexes: { '1910': { name: slug, tree: 'tree-' + slug } }, systems: 1 });
        }
        if (key.includes('/objects/')) return jsonResponse(200, { kind: 'tree', hexKey: key });
        return jsonResponse(200, { truthVersion: 'v2', sectors: [], polities: [] });
    };
    const opts = { cdnBase: 'https://cdn.example', apiBase: 'https://api.example', fetch };
    const client = new TruthClient(opts);
    await client.manifest('v2');
    await client.overview('v2');
    await client.polities('v2');
    client.want('v2', ['spin']);
    await flush();
    await client.tree('tree-spin');
    client.want('v2', ['fore']);
    await flush();
    client.want('v2', ['spin']);
    await flush();
    client.want('v2', ['spin']);
    await flush();
    assert.equal(client.treeNow('tree-spin').kind, 'tree');
    await client.tree('tree-spin');
    const remounted = new TruthClient(opts);
    await remounted.manifest('v2');
    await remounted.overview('v2');
    await remounted.polities('v2');
    remounted.want('v2', ['spin', 'fore']);
    await flush();
    await remounted.tree('tree-spin');
    for (const [url, n] of counts) assert.equal(n, 1, url);
});

test('a return visit reads the index and the tree from the chart cache', async () => {
    const saved = globalThis.caches;
    const store = new Map();
    globalThis.caches = {
        async open() {
            return {
                async match(url) { return store.get(String(url)); },
                async put(url, response) { store.set(String(url), response); },
            };
        },
    };
    try {
        let calls = 0;
        const index = { slug: 'Spinward_Marches', hexes: { '1910': { name: 'Regina', tree: 'tree-regina' } }, systems: 1 };
        const tree = { kind: 'tree', hexKey: 'Spinward_Marches/1910' };
        function client() {
            return new TruthClient({
                cdnBase: 'https://cdn.example',
                apiBase: 'https://api.example',
                fetch: async (url) => {
                    calls += 1;
                    const key = String(url);
                    const body = key.includes('/objects/') ? tree : index;
                    return {
                        ok: true,
                        status: 200,
                        json: async () => body,
                        clone() { return { ok: true, status: 200, json: async () => body }; },
                    };
                },
            });
        }
        const first = client();
        first.want('v10', ['Spinward_Marches']);
        await flush();
        assert.equal(await first.tree('tree-regina'), tree);
        await flush();
        assert.equal(calls, 2);
        const second = client();
        second.want('v10', ['Spinward_Marches']);
        await flush();
        assert.equal(second.index('v10', 'Spinward_Marches').slug, 'Spinward_Marches');
        assert.equal(await second.tree('tree-regina'), tree);
        assert.equal(calls, 2);
    } finally {
        if (saved === undefined) delete globalThis.caches;
        else globalThis.caches = saved;
    }
});

test('a new current version drops the other version from the chart cache', async () => {
    const saved = globalThis.caches;
    const store = new Map();
    function urlOf(request) {
        return typeof request === 'string' ? request : request.url;
    }
    globalThis.caches = {
        async open() {
            return {
                async keys() {
                    return [...store.keys()].map((url) => ({ url }));
                },
                async delete(request) {
                    return store.delete(urlOf(request));
                },
                async match(url) {
                    return store.get(String(url));
                },
                async put(url, response) {
                    store.set(String(url), response);
                },
            };
        },
    };
    const v1 = 'https://cdn.example/truth/v1/manifest.json';
    const v2 = 'https://cdn.example/truth/v2/sectors/Spinward_Marches/index.json';
    const objectUrl = 'https://cdn.example/objects/abc';
    store.set(v1, { ok: true });
    store.set(v2, { ok: true });
    store.set(objectUrl, { ok: true });
    let current = 'v2';
    const client = new TruthClient({
        cdnBase: 'https://cdn.example',
        apiBase: 'https://api.example',
        fetch: async (url) => {
            assert.equal(String(url), 'https://api.example/api/truth/versions');
            const older = current === 'v2' ? 'v1' : 'v2';
            return jsonResponse(200, {
                ok: true,
                data: [
                    { version: older, releasedAt: '2026-01-01T00:00:00.000Z' },
                    { version: current, releasedAt: '2026-06-01T00:00:00.000Z' },
                ],
            });
        },
    });
    try {
        assert.equal(await client.currentVersion(), 'v2');
        assert.equal(store.has(v1), false);
        assert.equal(store.has(v2), true);
        assert.equal(store.has(objectUrl), true);
        store.set(v1, { ok: true });
        current = 'v1';
        assert.equal(await client.currentVersion(), 'v1');
        assert.equal(store.has(v1), true);
        assert.equal(store.has(v2), false);
        assert.equal(store.has(objectUrl), true);
    } finally {
        if (saved === undefined) delete globalThis.caches;
        else globalThis.caches = saved;
    }
});
