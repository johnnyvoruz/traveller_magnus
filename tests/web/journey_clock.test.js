/**
 * DJ1 (Johnny 2026-10-18 10:00): a 100D jump time advances the campaign clock. The referee's click sends one
 * clock change of hours / 24 on the held rev, then a toast with the new date; no ship, no journal entry.
 * A player, a signed-out view, no campaign or no clock: plain tiles, and nothing is sent.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { campaign, transport } from '../../apps/web/src/campaign/store.ts';
import { flushCampaign, resetCampaign } from '../../apps/web/src/campaign/commit.ts';
import { advanceByJump, advanceLabel, canAdvanceClock, journeyHours } from '../../apps/web/src/dossier/journey_clock.ts';
import { toasts } from '../../apps/web/src/shell/toast.ts';
import { viewAs } from '../../apps/web/src/workspace/players/view_as.ts';

const memory = new Map();
globalThis.localStorage = {
    getItem(key) { return memory.has(key) ? memory.get(key) : null; },
    setItem(key, value) { memory.set(String(key), String(value)); },
    removeItem(key) { memory.delete(key); },
};

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const webRoot = path.join(root, 'apps', 'web');
const JOURNEY = [24.34, 17.21, 14.05, 12.17, 10.88, 9.94].map((hours, i) => ({ g: i + 1, hours: String(hours) + 'h' }));

/** Every PATCH body sent; the server applies the clock at rev + 1. After hold: resetCampaign puts the real fetch back. */
function capture() {
    const sent = [];
    transport.schedule = () => () => {};
    transport.fetch = async (url, init) => {
        const body = JSON.parse(init.body);
        sent.push({ url: String(url), method: init.method, body });
        const applied = body.clock ? [{ table: 'clock', id: 'campaignTime', rev: body.clock.baseRev + 1, seq: 1 }] : [];
        return { ok: true, status: 200, json: async () => ({ data: { applied, conflicts: [] } }) };
    };
    return sent;
}

function hold(role, clock) {
    resetCampaign();
    campaign.universeId = 'u_test';
    campaign.status = 'ready';
    campaign.role = role;
    campaign.clock = clock;
    toasts.splice(0, toasts.length);
}

test('a tile\'s hours are read exactly as stored, and named for the referee', () => {
    assert.equal(journeyHours('24.34h'), 24.34);
    assert.equal(journeyHours('168h'), 168);
    assert.equal(journeyHours('h'), null);
    assert.equal(advanceLabel('24.34h'), 'Advance the campaign 24.34 hours');
    assert.equal(advanceLabel('1h'), 'Advance the campaign 1 hour');
});

test('the referee\'s click sends one clock change of hours / 24 on the held rev, and says the new date', async () => {
    const days = 401_871.25;
    hold('owner', { days, rev: 7 });
    const sent = capture();
    assert.equal(canAdvanceClock.value, true);
    advanceByJump('24.34h');
    assert.equal(campaign.clock.days, days + 24.34 / 24, 'applied at once');
    await flushCampaign();
    assert.equal(sent.length, 1);
    assert.equal(sent[0].method, 'PATCH');
    assert.match(sent[0].url, /\/api\/universes\/u_test\/campaign\/changes$/);
    assert.deepEqual(sent[0].body.clock, { days: days + 24.34 / 24, baseRev: 7 });
    for (const table of ['records', 'links', 'journal']) assert.equal((sent[0].body[table] ?? []).length, 0, 'the time only: no ' + table);
    assert.equal(sent[0].body.settings, undefined, 'no ship moves');
    assert.equal(campaign.clock.rev, 8);
    assert.equal(toasts.length, 1);
    assert.match(toasts[0].message, /^Advanced 24\.34 hours\. The campaign date is now \d{3}-\d{4}, \d{2}:\d{2}\.$/);
    assert.equal(toasts[0].action, null, 'no Undo: the date field sets it back');
});

test('a player, a signed-out view, no campaign or no clock: nothing is sent', async () => {
    for (const [role, status, clock] of [['player', 'ready', { days: 10, rev: 1 }], [null, 'ready', { days: 10, rev: 1 }], ['owner', 'loading', { days: 10, rev: 1 }], ['owner', 'ready', null]]) {
        const said = `${role} ${status} ${clock ? 'clock' : 'no clock'}`;
        hold(role, clock);
        campaign.status = status;
        const sent = capture();
        assert.equal(canAdvanceClock.value, false, said);
        advanceByJump('24.34h');
        await flushCampaign();
        assert.deepEqual(campaign.clock, clock, said);
        assert.equal(sent.length, 0, said);
        assert.equal(toasts.length, 0, said);
    }
});

test('viewing as players (DJ1b): nothing is sent, whether the role reads owner or player', async () => {
    for (const role of ['owner', 'player']) {
        hold(role, { days: 10, rev: 1 });
        const sent = capture();
        viewAs.on = true;
        try {
            assert.equal(canAdvanceClock.value, false, role);
            advanceByJump('24.34h');
            await flushCampaign();
            assert.deepEqual(campaign.clock, { days: 10, rev: 1 }, role);
            assert.equal(sent.length, 0, role);
            assert.equal(toasts.length, 0, role);
        } finally {
            viewAs.on = false;
        }
    }
    hold('owner', { days: 10, rev: 1 });
    assert.equal(canAdvanceClock.value, true, 'stopped: the referee\'s buttons again');
});

describe('the tiles render', { concurrency: 1 }, () => {
    let server = null;
    let cacheDir = '';
    let store = null;
    let viewAsModule = null;

    test.before(async () => {
        cacheDir = fs.mkdtempSync(path.join(tmpdir(), 'd-journey-clock-'));
        const { createServer } = await import('vite');
        server = await createServer({ root: webRoot, cacheDir, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'silent' });
        store = await server.ssrLoadModule('/src/campaign/store.ts');
        viewAsModule = await server.ssrLoadModule('/src/workspace/players/view_as.ts');
    });

    test.after(async () => {
        if (server) await server.close();
        if (cacheDir) fs.rmSync(cacheDir, { recursive: true, force: true, maxRetries: 5 });
    });

    async function render(role, clock, status = 'ready') {
        store.campaign.role = role;
        store.campaign.clock = clock;
        store.campaign.status = status;
        const view = (await server.ssrLoadModule('/src/dossier/JourneyTimes.vue')).default;
        const { createSSRApp } = await import('vue');
        const { renderToString } = await import('vue/server-renderer');
        return renderToString(createSSRApp(view, { journey: JOURNEY }));
    }

    test('the referee with a clock gets six buttons, each named with its hours', async () => {
        const html = await render('owner', { days: 10, rev: 3 });
        assert.equal((html.match(/<button type="button"/g) || []).length, 6);
        assert.match(html, /data-journey-advance/);
        assert.match(html, /aria-label="Advance the campaign 24\.34 hours"/);
        assert.match(html, /aria-label="Advance the campaign 9\.94 hours"/);
        assert.doesNotMatch(html, /<dl/);
    });

    test('a player, signed out, no clock or no campaign: plain tiles', async () => {
        for (const [role, clock, status] of [['player', { days: 10, rev: 3 }, 'ready'], [null, { days: 10, rev: 3 }, 'ready'], ['owner', null, 'ready'], ['owner', { days: 10, rev: 3 }, 'idle']]) {
            const html = await render(role, clock, status);
            assert.doesNotMatch(html, /<button/, `${role} ${status}`);
            assert.match(html, /<dl class="doss-journey">/);
            assert.equal((html.match(/doss-journey-tile/g) || []).length, 6);
            assert.match(html, /24\.34<span class="doss-journey-unit">h<\/span>/);
        }
    });

    test('viewing as players: plain tiles, as the role is set (player) and even were it still owner', async () => {
        viewAsModule.viewAs.on = true;
        try {
            for (const role of ['player', 'owner']) {
                const html = await render(role, { days: 10, rev: 3 });
                assert.doesNotMatch(html, /<button/, role);
                assert.match(html, /<dl class="doss-journey">/, role);
            }
        } finally {
            viewAsModule.viewAs.on = false;
        }
        assert.match(await render('owner', { days: 10, rev: 3 }), /data-journey-advance/, 'stopped: buttons again');
    });
});
