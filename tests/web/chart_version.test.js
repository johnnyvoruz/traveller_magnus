import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bootChart, rememberVersion, rememberedVersion } from '../../apps/web/src/map/chart_version.ts';
import { TruthClient } from '../../apps/web/src/map/truth_client.ts';

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
}

async function flush() {
    for (let i = 0; i < 20; i++) await new Promise((resolve) => setImmediate(resolve));
}

test('a remembered version loads before the versions list answers', async () => {
    const list = deferred();
    const loads = [];
    await bootChart({
        remembered: 'v9',
        ask: () => list.promise,
        load: async (version) => { loads.push(version); },
    });
    assert.deepEqual(loads, ['v9']);
    list.resolve('v9');
    await flush();
    assert.deepEqual(loads, ['v9'], 'the same version is not loaded twice');
});

test('a first visit waits for the versions list', async () => {
    const list = deferred();
    const loads = [];
    const booted = bootChart({
        remembered: null,
        ask: () => list.promise,
        load: async (version) => { loads.push(version); },
    });
    await flush();
    assert.deepEqual(loads, []);
    list.resolve('v10');
    await booted;
    assert.deepEqual(loads, ['v10']);
});

test('a fresh answer that names another version loads that version after the remembered one', async () => {
    const loads = [];
    await bootChart({
        remembered: 'v9',
        ask: async () => 'v10',
        load: async (version) => { loads.push(version); },
    });
    await flush();
    assert.deepEqual(loads, ['v9', 'v10']);
});

test('a newer version is loaded even when the list answers before the remembered load ends', async () => {
    const first = deferred();
    const loads = [];
    const booted = bootChart({
        remembered: 'v9',
        ask: async () => 'v10',
        load: (version) => { loads.push(version); return version === 'v9' ? first.promise : Promise.resolve(); },
    });
    await flush();
    assert.deepEqual(loads, ['v9', 'v10']);
    first.resolve();
    await booted;
});

test('a remembered version that cannot be read falls back to the version the list names', async () => {
    const loads = [];
    await bootChart({
        remembered: 'v8',
        ask: async () => 'v10',
        load: async (version) => {
            loads.push(version);
            if (version === 'v8') throw new Error('404');
        },
    });
    assert.deepEqual(loads, ['v8', 'v10']);
});

test('a remembered version that cannot be read, and is still current, keeps its error', async () => {
    await assert.rejects(
        bootChart({
            remembered: 'v10',
            ask: async () => 'v10',
            load: async () => { throw new Error('manifest 503'); },
        }),
        /manifest 503/,
    );
});

test('a remembered version that cannot be read, with no answer from the list, keeps its error', async () => {
    await assert.rejects(
        bootChart({
            remembered: 'v10',
            ask: async () => { throw new Error('list 500'); },
            load: async () => { throw new Error('manifest 503'); },
        }),
        /manifest 503/,
    );
});

test('a failed newer load after the remembered chart is shown goes to late and the boot still resolves', async () => {
    const late = [];
    await bootChart({
        remembered: 'v9',
        ask: async () => 'v10',
        load: async (version) => { if (version === 'v10') throw new Error('overview 404'); },
        late: (err) => late.push(String(err.message)),
    });
    await flush();
    assert.deepEqual(late, ['overview 404']);
});

test('a failed list ask after the remembered chart is shown is not an error', async () => {
    const late = [];
    await bootChart({
        remembered: 'v9',
        ask: async () => { throw new Error('offline'); },
        load: async () => undefined,
        late: (err) => late.push(err),
    });
    await flush();
    assert.deepEqual(late, []);
});

test('a first visit with a failed list is an error', async () => {
    await assert.rejects(
        bootChart({ remembered: null, ask: async () => { throw new Error('offline'); }, load: async () => undefined }),
        /offline/,
    );
});

test('the remembered version is read back only when it is a URL-safe word', () => {
    const store = new Map();
    const get = (key) => (store.has(key) ? store.get(key) : null);
    const set = (key, value) => { store.set(key, value); };
    assert.equal(rememberedVersion(get), null);
    rememberVersion('v10', set);
    assert.equal(rememberedVersion(get), 'v10');
    rememberVersion('../x', set);
    assert.equal(rememberedVersion(get), 'v10', 'a version that is not URL-safe is not kept');
    for (const key of store.keys()) store.set(key, 'v1/../../x');
    assert.equal(rememberedVersion(get), null, 'a stored value that is not URL-safe is not trusted');
    store.clear();
    assert.equal(rememberedVersion(() => { return ''; }), null);
});

test('currentVersion({ fresh: true }) asks past the HTTP cache and does not share an earlier ask', async () => {
    const seen = [];
    const rows = { ok: true, data: [{ version: 'v9', releasedAt: '2026-01-01' }, { version: 'v10', releasedAt: '2026-02-01' }] };
    const client = new TruthClient({
        cdnBase: 'https://cdn.example',
        apiBase: 'https://api.example',
        fetch: async (url, init) => {
            seen.push({ url: String(url), cache: init && init.cache });
            return { ok: true, status: 200, json: async () => rows };
        },
    });
    assert.equal(await client.currentVersion({ fresh: true }), 'v10');
    assert.equal(await client.currentVersion(), 'v10');
    assert.deepEqual(seen, [
        { url: 'https://api.example/api/truth/versions', cache: 'no-cache' },
        { url: 'https://api.example/api/truth/versions', cache: undefined },
    ]);
});

test('the map boot starts from the remembered version and swaps when the list differs (source pins)', async () => {
    const { readFileSync } = await import('node:fs');
    const vue = readFileSync(new URL('../../apps/web/src/views/MapView.vue', import.meta.url), 'utf8');
    assert.match(vue, /bootChart\(\{/);
    assert.match(vue, /remembered: rememberedVersion\(\)/);
    assert.match(vue, /client\.currentVersion\(\{ fresh: true \}\)/);
    assert.doesNotMatch(vue, /version = await client\.currentVersion\(\)/);
    assert.match(vue, /if \(mine !== chartLoads\) return;/);
});