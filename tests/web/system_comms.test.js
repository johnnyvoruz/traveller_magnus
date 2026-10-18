/**
 * CC2: System Comms is a device choice, on when nothing is stored, and the orbit
 * view shows the button above Fit for a signed-out visit.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { COMMS_KEY, commsOnStored, deviceComms, setCommsShown } from '../../apps/web/src/living/quiet.ts';

test('absent means on; a stored off stays off', () => {
    assert.equal(commsOnStored(null), true);
    assert.equal(commsOnStored(''), true);
    assert.equal(commsOnStored('1'), true);
    assert.equal(commsOnStored('0'), false);
});

test('off and on persist on this device', () => {
    const mem = new Map();
    const previous = globalThis.localStorage;
    globalThis.localStorage = {
        getItem(key) { return mem.has(key) ? mem.get(key) : null; },
        setItem(key, value) { mem.set(key, String(value)); },
    };
    try {
        setCommsShown(false);
        assert.equal(deviceComms.shown, false);
        assert.equal(mem.get(COMMS_KEY), '0');
        setCommsShown(true);
        assert.equal(deviceComms.shown, true);
        assert.equal(mem.get(COMMS_KEY), '1');
    } finally {
        if (previous === undefined) delete globalThis.localStorage;
        else globalThis.localStorage = previous;
    }
});

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const webRoot = path.join(root, 'apps', 'web');

describe('a signed-out orbit view', { concurrency: 1 }, () => {
    let server = null;
    let cacheDir = '';

    test.before(async () => {
        cacheDir = fs.mkdtempSync(path.join(tmpdir(), 'c-comms-'));
        const { createServer } = await import('vite');
        server = await createServer({
            root: webRoot,
            cacheDir,
            server: { middlewareMode: true, hmr: false, ws: false },
            appType: 'custom',
            logLevel: 'silent',
        });
    });

    test.after(async () => {
        if (server) await server.close();
        if (cacheDir) fs.rmSync(cacheDir, { recursive: true, force: true });
    });

    test('shows System Comms above Fit, on', async () => {
        if (typeof globalThis.location === 'undefined') {
            globalThis.location = { origin: 'https://traveller.voyage' };
        }
        const component = (await server.ssrLoadModule('/src/views/OrbitView.vue')).default;
        const { createSSRApp } = await import('vue');
        const { renderToString } = await import('vue/server-renderer');
        const { createMemoryHistory, createRouter } = await import('vue-router');
        const router = createRouter({
            history: createMemoryHistory(),
            routes: [{ path: '/s/:sector/:hex/orbit', component }],
        });
        await router.push('/s/Spinward_Marches/1910/orbit');
        await router.isReady();
        const html = await renderToString(createSSRApp(component).use(router));
        assert.match(html, /class="orbit-stage-tools"[\s\S]*data-command="system-comms"[\s\S]*class="orbit-btn orbit-fit"/);
        assert.match(html, /data-command="system-comms"[^>]*aria-pressed="true"/);
        assert.match(html, /title="System Comms on"/);
        assert.match(html, /System Comms/);
    });
});
