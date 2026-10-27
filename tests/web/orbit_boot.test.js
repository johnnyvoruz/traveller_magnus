import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { bootChart, versionsAsk } from '../../apps/web/src/map/chart_version.ts';

function deferred() {
    let resolve;
    const promise = new Promise((res) => { resolve = res; });
    return { promise, resolve };
}

async function flush() {
    for (let i = 0; i < 8; i++) await new Promise((resolve) => setImmediate(resolve));
}

test('a remembered orbit boot makes no /versions request before the first frame', async () => {
    const frame = deferred();
    const calls = [];
    const loaded = [];
    const booted = bootChart({
        remembered: 'v9',
        ask: () => versionsAsk('v9', async () => {
            calls.push('/api/truth/versions');
            return 'v10';
        }, () => frame.promise),
        load: async (version) => { loaded.push(version); },
    });
    await booted;
    assert.deepEqual(loaded, ['v9']);
    assert.deepEqual(calls, [], 'the versions list is not asked before the first frame');
    frame.resolve();
    await flush();
    assert.deepEqual(calls, ['/api/truth/versions']);
    assert.deepEqual(loaded, ['v9', 'v10']);
});

test('with nothing remembered, the orbit boot waits for the versions list', async () => {
    const calls = [];
    const loaded = [];
    await bootChart({
        remembered: null,
        ask: () => versionsAsk(null, async () => {
            calls.push('/api/truth/versions');
            return 'v10';
        }, () => { throw new Error('no frame when nothing is remembered'); }),
        load: async (version) => {
            assert.deepEqual(calls, ['/api/truth/versions']);
            loaded.push(version);
        },
    });
    assert.deepEqual(loaded, ['v10']);
});

test('OrbitView boots through the remembered version', () => {
    const vue = readFileSync(new URL('../../apps/web/src/views/OrbitView.vue', import.meta.url), 'utf8');
    assert.match(vue, /bootChart\(\{/);
    assert.match(vue, /remembered,/);
    assert.match(vue, /versionsAsk\(remembered/);
    assert.match(vue, /client\.currentVersion\(\{ fresh: true \}\)/);
    assert.doesNotMatch(vue, /await client\.currentVersion\(\)/);
});
