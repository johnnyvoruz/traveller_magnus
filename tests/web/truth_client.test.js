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
