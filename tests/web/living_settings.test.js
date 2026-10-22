/**
 * LS3 (spec_living_systems.md §4, §5 row LS3): the referee's two switches in the campaign settings,
 * written as one settings change on the held revision; "Quiet on this device", which wins on this
 * device; a panel that cannot change the campaign shows the state read-only. Players get the switches
 * in their view (settings minus rev).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { SettingsChange } from '@voyage/shared';
import { livingChange, livingOf, livingShown, LIVING_OFF } from '../../apps/web/src/living/quiet.ts';

const settings = (over = {}) => ({
    party: { vesselIds: [], aboard: {}, memberIds: [], anchor: null },
    kinds: { person: ['Contact'] },
    calendar: { dateFormat: 'imperial' },
    rev: 7,
    ...over,
});

test('absent means both off; the device\'s quiet wins over the referee', () => {
    assert.deepEqual(livingOf(settings()), LIVING_OFF);
    assert.deepEqual(livingOf(null), LIVING_OFF, 'signed out or no campaign: nothing');
    const on = settings({ living: { chatter: true, traffic: true } });
    assert.deepEqual(livingShown(on, false), { chatter: true, traffic: true });
    assert.deepEqual(livingShown(on, true), LIVING_OFF);
});

test('one settings change on the held revision, the rest of the document as it was', () => {
    const now = settings({ living: { chatter: false, traffic: true } });
    const change = livingChange(now, { chatter: true, traffic: true });
    assert.equal(change.baseRev, 7);
    assert.deepEqual(change.living, { chatter: true, traffic: true });
    assert.deepEqual(change.kinds, now.kinds);
    assert.deepEqual(change.party, now.party);
    assert.equal(SettingsChange.safeParse(change).success, true, 'what the server takes');
});

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const webRoot = path.join(root, 'apps', 'web');

describe('the switches render', { concurrency: 1 }, () => {
    let server = null;
    let cacheDir = '';
    let campaign = null;

    test.before(async () => {
        cacheDir = fs.mkdtempSync(path.join(tmpdir(), 'd-living-'));
        const { createServer } = await import('vite');
        server = await createServer({ root: webRoot, cacheDir, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'silent' });
        campaign = (await server.ssrLoadModule('/src/campaign/store.ts')).campaign;
    });

    test.after(async () => {
        if (server) await server.close();
        if (cacheDir) fs.rmSync(cacheDir, { recursive: true, force: true });
    });

    async function render(props) {
        const view = (await server.ssrLoadModule('/src/workspace/LivingSettings.vue')).default;
        const { createSSRApp } = await import('vue');
        const { renderToString } = await import('vue/server-renderer');
        return (await renderToString(createSSRApp(view, props))).replace(/<!--[\s\S]*?-->/g, '');
    }

    test('the referee: traffic as stored, and this device\'s quiet; no chatter switch', async () => {
        campaign.settings = settings({ living: { chatter: true, traffic: false } });
        const html = await render({ canChange: true });
        assert.doesNotMatch(html, /living-chatter/);
        assert.doesNotMatch(html, /Show system chatter/);
        assert.match(html, /data-command="living-traffic" aria-checked="false"[^>]*>[\s\S]*?Show background traffic<\/span><em>Off<\/em>/);
        assert.match(html, /Ships that come and go in the orbit view/);
        assert.match(html, /data-command="living-quiet"[\s\S]*?Quiet on this device<\/span><em>Off<\/em>/);
        assert.match(html, /Hides background traffic on this device only\. System Comms has its own switch\./);
        assert.doesNotMatch(html, /data-living-read-only/);
    });

    test('someone who cannot change the campaign sees its state, read-only; quiet stays theirs', async () => {
        campaign.settings = settings({ living: { chatter: true, traffic: true } });
        const html = await render({ canChange: false });
        assert.doesNotMatch(html, /living-chatter/);
        assert.match(html, /data-command="living-traffic" aria-checked="true"[^>]*disabled/);
        assert.match(html, /data-living-read-only>The referee turns these on or off for the campaign\./);
        assert.doesNotMatch(html, /data-command="living-quiet"[^>]*disabled/);
    });

    test('no campaign: only this device\'s quiet', async () => {
        campaign.settings = null;
        const html = await render({ canChange: false });
        assert.doesNotMatch(html, /living-chatter/);
        assert.match(html, /Quiet on this device/);
    });
});

test('the campaign\'s switches are on its Campaigns card, this device\'s quiet in the menu (DU10); players get the switches', async () => {
    const menu = fs.readFileSync(path.join(webRoot, 'src/workspace/AccountMenu.vue'), 'utf8');
    assert.match(menu, /<LivingSettings part="device" :can-change="false" \/>/);
    const panel = fs.readFileSync(path.join(webRoot, 'src/workspace/CampaignsPanel.vue'), 'utf8');
    assert.match(panel, /<LivingSettings part="campaign" :can-change="!!openOne" :busy="busy" \/>/);
    const { playersView } = await import('@voyage/shared');
    const view = playersView({ records: [], links: [], settings: settings({ living: { chatter: true, traffic: false } }), clock: null, journal: [] });
    assert.deepEqual(view.settings.living, { chatter: true, traffic: false });
});

test('LS3b: the sentences are in Lane E\'s words.ts, not written out twice; DU18b: under This device', () => {
    const view = fs.readFileSync(path.join(webRoot, 'src/workspace/LivingSettings.vue'), 'utf8');
    const template = view.slice(view.indexOf('<template>'));
    for (const words of ['Show system chatter', 'Show background traffic', 'Quiet on this device', 'Short radio', 'Ships that come', 'Hides background traffic']) {
        assert.equal(template.includes(words), false, words + ' is written in words.ts only');
    }
    assert.match(view, /import \{ LIVING_WORDS \} from '\.\.\/living\/words\.ts';/);
    assert.match(template, /<p class="account-group" data-this-device>This device<\/p>\s+<button[\s\S]*?data-command="living-quiet"/);
});

