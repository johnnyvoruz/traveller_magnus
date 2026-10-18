/**
 * P8: a player does not get the Builder's right-click menu or Select hexes.
 * The rail's Build button stays (buildOffered). Party ships, marks and the dossier
 * already read the campaign store. A place with no locationLabel is the hex alone.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const webRoot = path.join(root, 'apps', 'web');
const read = (rel) => fs.readFileSync(path.join(webRoot, 'src', rel), 'utf8');

test('the map hides the Builder menu and Select hexes for a player', () => {
    const view = read('views/MapView.vue');
    assert.match(view, /function playerMap\(\): boolean \{\s*return campaign\.role === 'player';/);
    assert.match(view, /function onBuildMenu\(event: MouseEvent\): void \{\s*if \(playerMap\(\)\) return;/);
    assert.match(view, /function onMenuKey\(event: KeyboardEvent\): boolean \{\s*if \(!\(event\.key === 'ContextMenu' \|\| \(event\.shiftKey && event\.key === 'F10'\)\)\) return false;\s*if \(playerMap\(\)\) return false;/);
    assert.match(view, /function boxWants\(event: PointerEvent\): boolean \{\s*if \(playerMap\(\)\) return false;/);
    assert.match(view, /BUILD_COMMANDS\.filter\(\(item\) => item\.id !== 'build-select'\)/);
    assert.match(view, /if \(playerMap\(\)\) build\.selecting = false;/);
    assert.match(view, /:select-hexes="campaign\.role !== 'player'"/);
    assert.match(view, /@contextmenu="onBuildMenu"/);
    assert.match(view, /const buildOffered = computed\(\(\) => session\.user !== null && campaign\.status === 'ready' && campaign\.universeId !== null\)/);
    const strip = read('workspace/build/BuildStrip.vue');
    assert.match(strip, /v-if="selectOn"/);
    assert.match(strip, /if \(!selectOn\.value\) return;/);
    assert.match(strip, /data-command="build-select"/);
});

test('the dossier and a hidden place already use the store', () => {
    const records = read('workspace/RecordsHere.vue');
    const journal = read('workspace/JournalHere.vue');
    assert.match(records, /recordsHere\(campaign\.records/);
    assert.match(records, /Your records here/);
    assert.match(journal, /entriesAtHex\(props\.hexKey\)/);
    assert.match(journal, /Your journal here/);
    const places = read('workspace/places.ts');
    assert.match(places, /if \(!place\.label\) return \[hex\];/);
    const map = read('views/MapView.vue');
    assert.match(map, /partyShipMarks\(campaign\.records, settings\.party, days\)/);
    assert.match(map, /vesselsOnMap\(campaign\.records, settings\.party, days\)/);
});

describe('Select hexes on the build strip', { concurrency: 1 }, () => {
    /** @type {import('vite').ViteDevServer | null} */
    let server = null;
    let cacheDir = '';

    test.before(async () => {
        cacheDir = fs.mkdtempSync(path.join(tmpdir(), 'a-p8-ssr-'));
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

    async function render(selectHexes) {
        const component = (await server.ssrLoadModule('/src/workspace/build/BuildStrip.vue')).default;
        const { createSSRApp } = await import('vue');
        const { renderToString } = await import('vue/server-renderer');
        const props = { name: 'Far Margin', truthVersion: 'v5' };
        if (selectHexes === false) props.selectHexes = false;
        return renderToString(createSSRApp(component, props));
    }

    test('the button is there for a referee and gone for a player', async () => {
        const referee = await render(undefined);
        const player = await render(false);
        assert.match(referee, /Select hexes/);
        assert.match(referee, /data-command="build-select"/);
        assert.equal(player.includes('Select hexes'), false);
        assert.equal(player.includes('data-command="build-select"'), false);
        assert.match(player, /Your map/);
    });
});
